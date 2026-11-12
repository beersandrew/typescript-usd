// Native capture of Apple's fixed-function tessellator through Metal, the
// tessellator hgiMetal hands Storm's post-tessellation draws to
// (hgiMetal/graphicsPipeline.mm:178-235, resourceBindings.mm:136-141).
//
// For every case (domain, partition mode, output winding, the per-patch
// tessellation factors as MTL{Quad,Triangle}TessellationFactorsHalf):
// - pass 1 draws the patch with rasterization disabled; the
//   post-tessellation vertex function appends [[position_in_patch]] and
//   [[patch_id]] of every invocation to a buffer: the domain points;
// - pass 2 rasterizes the patch with position_in_patch as the screen
//   position (x = u, y = v) into 1024 x 1024 float targets; each fragment
//   reconstructs its triangle's three domain points (in the order of
//   [[barycentric_coord]], the order the vertices were emitted) from the
//   interpolated position, the barycentrics and their screen derivatives,
//   and writes [[front_facing]]: the triangles and their winding.
// The points are written exactly (multiples of 2^-16); the triangles are
// snapped to the captured points. Triangles that cover no pixel center are
// not seen.
//
// Run (macOS with a Metal device; prints JSON to stdout, about 3 minutes):
//   swiftc -O capture.swift -o /tmp/tesscapture && /tmp/tesscapture | gzip -9n > expected.json.gz
import Foundation
import Metal

let device = MTLCreateSystemDefaultDevice()!
let source = """
#include <metal_stdlib>
using namespace metal;

struct Counter { atomic_uint n; };

[[patch(quad, 4)]] vertex void quadPoints(float2 uv [[position_in_patch]], uint pid [[patch_id]],
    device Counter &c [[buffer(1)]], device float4 *out [[buffer(2)]]) {
  uint i = atomic_fetch_add_explicit(&c.n, 1u, memory_order_relaxed);
  if (i < 200000u) out[i] = float4(uv, float(pid), 0.0);
}
[[patch(triangle, 3)]] vertex void triPoints(float3 uvw [[position_in_patch]], uint pid [[patch_id]],
    device Counter &c [[buffer(1)]], device float4 *out [[buffer(2)]]) {
  uint i = atomic_fetch_add_explicit(&c.n, 1u, memory_order_relaxed);
  if (i < 200000u) out[i] = float4(uvw.xy, float(pid), uvw.z);
}

struct VOut { float4 pos [[position]]; float2 uv; };
[[patch(quad, 4)]] vertex VOut quadRaster(float2 uv [[position_in_patch]]) {
  VOut o; o.pos = float4(uv * 2.0 - 1.0, 0.0, 1.0); o.uv = uv; return o;
}
[[patch(triangle, 3)]] vertex VOut triRaster(float3 uvw [[position_in_patch]]) {
  VOut o; o.pos = float4(uvw.xy * 2.0 - 1.0, 0.0, 1.0); o.uv = uvw.xy; return o;
}
struct FOut { float4 a [[color(0)]]; float4 b [[color(1)]]; };
fragment FOut reconstruct(VOut in [[stage_in]], float3 b [[barycentric_coord]], bool ff [[front_facing]]) {
  // uv = sum b_i P_i, d(uv) = sum d(b_i) P_i: solve the 3x3 system per component.
  float3x3 m = float3x3(float3(b.x, dfdx(b.x), dfdy(b.x)),
                        float3(b.y, dfdx(b.y), dfdy(b.y)),
                        float3(b.z, dfdx(b.z), dfdy(b.z)));
  float3x3 inv = transpose(float3x3(cross(m[1], m[2]), cross(m[2], m[0]), cross(m[0], m[1]))) / determinant(m);
  float3 pu = inv * float3(in.uv.x, dfdx(in.uv.x), dfdy(in.uv.x));
  float3 pv = inv * float3(in.uv.y, dfdx(in.uv.y), dfdy(in.uv.y));
  FOut o;
  o.a = float4(pu.x, pv.x, pu.y, pv.y);
  o.b = float4(pu.z, pv.z, ff ? 1.0 : -1.0, 1.0);
  return o;
}
"""
let library = try! device.makeLibrary(source: source, options: nil)
let queue = device.makeCommandQueue()!

enum Domain: String { case quad, tri }
let partitions: [(String, MTLTessellationPartitionMode)] = [
  ("integer", .integer), ("pow2", .pow2), ("fractionalOdd", .fractionalOdd), ("fractionalEven", .fractionalEven)]

func halfBits(_ f: Float) -> UInt16 { Float16(f).bitPattern }

var pipelines: [String: MTLRenderPipelineState] = [:]
func pipeline(_ domain: Domain, _ partition: MTLTessellationPartitionMode, _ winding: MTLWinding, raster: Bool) -> MTLRenderPipelineState {
  let key = "\(domain)\(partition.rawValue)\(winding.rawValue)\(raster)"
  if let p = pipelines[key] { return p }
  let d = MTLRenderPipelineDescriptor()
  d.vertexFunction = library.makeFunction(name: domain == .quad
    ? (raster ? "quadRaster" : "quadPoints") : (raster ? "triRaster" : "triPoints"))
  d.tessellationPartitionMode = partition
  d.tessellationFactorStepFunction = .perPatch
  d.tessellationFactorFormat = .half
  d.tessellationOutputWindingOrder = winding
  d.tessellationControlPointIndexType = .none
  d.maxTessellationFactor = 64
  d.inputPrimitiveTopology = .triangle
  if raster {
    d.fragmentFunction = library.makeFunction(name: "reconstruct")
    d.colorAttachments[0].pixelFormat = .rgba32Float
    d.colorAttachments[1].pixelFormat = .rgba32Float
    d.isRasterizationEnabled = true
  } else {
    d.isRasterizationEnabled = false
  }
  let p = try! device.makeRenderPipelineState(descriptor: d)
  pipelines[key] = p
  return p
}

let size = 1024
func makeTarget() -> MTLTexture {
  let td = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .rgba32Float, width: size, height: size, mipmapped: false)
  td.usage = [.renderTarget]
  td.storageMode = .shared
  return device.makeTexture(descriptor: td)!
}
let targetA = makeTarget(), targetB = makeTarget()
let dummy = makeTarget()

/// Draws patch `slot` of a factor buffer holding `factorSets` (one patch per
/// set), so the capture also shows which factors and patch_id a draw with
/// patchStart = slot reads.
func capture(_ domain: Domain, _ partition: MTLTessellationPartitionMode, _ winding: MTLWinding,
             _ factorSets: [[Float]], slot: Int) -> [String: Any] {
  let perPatch = domain == .quad ? 6 : 4
  var halves = [UInt16]()
  for f in factorSets { for x in f { halves.append(halfBits(x)) } }
  let factorBuffer = device.makeBuffer(bytes: halves, length: halves.count * 2, options: .storageModeShared)!
  let counter = device.makeBuffer(length: 16, options: .storageModeShared)!
  memset(counter.contents(), 0, 16)
  let out = device.makeBuffer(length: 200000 * 16, options: .storageModeShared)!

  // Pass 1: points.
  do {
    let cb = queue.makeCommandBuffer()!
    let rp = MTLRenderPassDescriptor()
    rp.colorAttachments[0].texture = dummy
    rp.colorAttachments[0].loadAction = .dontCare
    rp.colorAttachments[0].storeAction = .dontCare
    rp.renderTargetWidth = size; rp.renderTargetHeight = size
    let enc = cb.makeRenderCommandEncoder(descriptor: rp)!
    enc.setRenderPipelineState(pipeline(domain, partition, winding, raster: false))
    enc.setTessellationFactorBuffer(factorBuffer, offset: 0, instanceStride: 0)
    enc.setVertexBuffer(counter, offset: 0, index: 1)
    enc.setVertexBuffer(out, offset: 0, index: 2)
    enc.drawPatches(numberOfPatchControlPoints: perPatch == 6 ? 4 : 3, patchStart: slot, patchCount: 1,
                    patchIndexBuffer: nil, patchIndexBufferOffset: 0, instanceCount: 1, baseInstance: 0)
    enc.endEncoding()
    cb.commit(); cb.waitUntilCompleted()
  }
  let n = Int(counter.contents().load(as: UInt32.self))
  let raw = out.contents().bindMemory(to: Float.self, capacity: 200000 * 4)
  var pointSet = Set<[Int32]>()
  var patchIds = Set<Int>()
  var wSums = true
  for i in 0..<min(n, 200000) {
    let u = raw[i * 4], v = raw[i * 4 + 1]
    pointSet.insert([Int32((u * 65536).rounded()), Int32((v * 65536).rounded())])
    if Float(Int32((u * 65536).rounded())) / 65536 != u || Float(Int32((v * 65536).rounded())) / 65536 != v {
      FileHandle.standardError.write("non-fixed point \(u) \(v)\n".data(using: .utf8)!)
    }
    patchIds.insert(Int(raw[i * 4 + 2]))
    if domain == .tri && abs(u + v + raw[i * 4 + 3] - 1) > 1e-6 { wSums = false }
  }
  let points = pointSet.sorted { $0[0] != $1[0] ? $0[0] < $1[0] : $0[1] < $1[1] }

  // Pass 2: triangles.
  do {
    let cb = queue.makeCommandBuffer()!
    let rp = MTLRenderPassDescriptor()
    for (i, t) in [targetA, targetB].enumerated() {
      rp.colorAttachments[i].texture = t
      rp.colorAttachments[i].loadAction = .clear
      rp.colorAttachments[i].clearColor = MTLClearColor(red: 0, green: 0, blue: 0, alpha: 0)
      rp.colorAttachments[i].storeAction = .store
    }
    let enc = cb.makeRenderCommandEncoder(descriptor: rp)!
    enc.setRenderPipelineState(pipeline(domain, partition, winding, raster: true))
    enc.setTessellationFactorBuffer(factorBuffer, offset: 0, instanceStride: 0)
    enc.setCullMode(.none)
    enc.drawPatches(numberOfPatchControlPoints: perPatch == 6 ? 4 : 3, patchStart: slot, patchCount: 1,
                    patchIndexBuffer: nil, patchIndexBufferOffset: 0, instanceCount: 1, baseInstance: 0)
    enc.endEncoding()
    cb.commit(); cb.waitUntilCompleted()
  }
  var a = [Float](repeating: 0, count: size * size * 4), b = a
  targetA.getBytes(&a, bytesPerRow: size * 16, from: MTLRegionMake2D(0, 0, size, size), mipmapLevel: 0)
  targetB.getBytes(&b, bytesPerRow: size * 16, from: MTLRegionMake2D(0, 0, size, size), mipmapLevel: 0)
  // Snap reconstructed corners to the nearest captured point.
  var grid = [Int: [Int]]()
  let cell = 1024 // 2^16 / 64
  for (i, p) in points.enumerated() { grid[Int(p[0]) / cell * 100000 + Int(p[1]) / cell, default: []].append(i) }
  func snap(_ u: Float, _ v: Float) -> Int? {
    let fu = Int((u * 65536).rounded()), fv = Int((v * 65536).rounded())
    var best = -1, bestD = Int.max
    for du in -1...1 { for dv in -1...1 {
      for i in grid[(fu / cell + du) * 100000 + (fv / cell + dv)] ?? [] {
        let d = abs(Int(points[i][0]) - fu) + abs(Int(points[i][1]) - fv)
        if d < bestD { bestD = d; best = i }
      }
    } }
    return bestD <= 64 ? best : nil // within 2^-10
  }
  var triangles = [String: [Int]]()
  var unsnapped = 0, covered = 0
  for px in 0..<(size * size) where b[px * 4 + 3] == 1 {
    covered += 1
    guard let i0 = snap(a[px * 4], a[px * 4 + 1]), let i1 = snap(a[px * 4 + 2], a[px * 4 + 3]),
          let i2 = snap(b[px * 4], b[px * 4 + 1]) else { unsnapped += 1; continue }
    if i0 == i1 || i1 == i2 || i0 == i2 { unsnapped += 1; continue }
    let ff = b[px * 4 + 2] > 0 ? 1 : 0
    let key = [i0, i1, i2].sorted().map(String.init).joined(separator: ",")
    triangles[key] = [i0, i1, i2, ff]
  }
  let tris = triangles.values.sorted { ($0[0], $0[1], $0[2]) < ($1[0], $1[1], $1[2]) }
  return [
    "points": points.flatMap { $0.map(Int.init) },
    "invocations": n,
    "patchIds": patchIds.sorted(),
    "wSumsToOne": wSums,
    // [p0, p1, p2 (in emitted order), frontFacing (Metal's default front
    // face: clockwise on screen)]
    "triangles": tris.flatMap { $0 },
    "coveredPixels": covered,
    "unsnappedPixels": unsnapped,
  ]
}

// Factor values: integers, fractions on both sides of odd/even integers,
// below the minimum, above the maximum, and the patterns Storm writes
// (basisCurves.glslfx Curves.CommonControl.*: (level, 1, level, 1, 1, level)
// for ribbons, (level, w0, level, w1, wAvg, level) for half tubes).
let values: [Float] = [0.5, 1, 1.2, 1.5, 2, 2.25, 2.5, 3, 3.3, 3.9, 4, 4.6, 5, 5.5, 6, 6.8, 7, 7.25, 8, 9.1, 10, 11.5, 12, 13.75, 16, 17.2, 20, 23.9, 31, 32, 33.3, 40, 47.5, 63, 64, 70]
var rng: UInt64 = 0x2545F4914F6CDD1D
func next() -> Int { rng ^= rng << 13; rng ^= rng >> 7; rng ^= rng << 17; return Int(rng % UInt64(values.count)) }

var cases = [[String: Any]]()
for (pname, partition) in partitions {
  for domain in [Domain.quad, Domain.tri] {
    let perPatch = domain == .quad ? 6 : 4
    var sets = [[Float]]()
    // uniform factors
    for v in values { sets.append([Float](repeating: v, count: perPatch)) }
    // random mixes
    for _ in 0..<40 { sets.append((0..<perPatch).map { _ in values[next()] }) }
    if domain == .quad {
      for level in [Float(1), 2.5, 3.7, 7.1, 12.9, 25.3, 40] {
        sets.append([level, 1, level, 1, 1, level])
        sets.append([level, 1.6, level, 3.2, 2.4, level])
      }
      // Metal's constant factors (hgiMetal/graphicsPipeline.mm:399-438)
      sets.append([1, 1, 1, 1, 0, 0])
    } else {
      sets.append([1, 1, 1, 0])
    }
    // At most one factor above 16, to keep the fixture small.
    sets = sets.filter { s in s.filter { $0 > 16 }.count <= 1 }
    for (k, s) in sets.enumerated() {
      // Draw from a slot past patch 0 so patchStart's effect is visible.
      let slot = 2
      var all = [[Float]](repeating: [Float](repeating: 0.5, count: perPatch), count: 3)
      all[slot] = s
      var c = capture(domain, partition, .counterClockwise, all, slot: slot)
      c["domain"] = domain.rawValue
      c["partitioning"] = pname
      c["winding"] = "ccw"
      c["factors"] = s.map { Float(Float16($0)) }
      c["patchStart"] = slot
      cases.append(c)
      if k < 4 {
        var cw = capture(domain, partition, .clockwise, all, slot: slot)
        cw["domain"] = domain.rawValue; cw["partitioning"] = pname; cw["winding"] = "cw"
        cw["factors"] = s.map { Float(Float16($0)) }; cw["patchStart"] = slot
        cases.append(cw)
      }
    }
  }
}
let info = ProcessInfo.processInfo.operatingSystemVersion
let doc: [String: Any] = [
  "device": device.name,
  "os": "macOS \(info.majorVersion).\(info.minorVersion).\(info.patchVersion)",
  "cases": cases,
]
let data = try! JSONSerialization.data(withJSONObject: doc, options: [.sortedKeys])
FileHandle.standardOutput.write(data)

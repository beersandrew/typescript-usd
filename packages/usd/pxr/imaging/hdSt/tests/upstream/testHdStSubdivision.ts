// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdSt/testenv/testHdStSubdivision.cpp, pxr/base/gf/vec3f.h,
//  pxr/base/tf/stringUtils.h, pxr/base/vt/streamOut.h
// Copyright 2016, 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/imaging/hdSt/testenv/testHdStSubdivision.cpp (OpenUSD 26.11.1).
//
// The upstream program writes its results to stdout, which the registered
// test (pxr/imaging/hdSt/CMakeLists.txt:2909-2917) compares with
// testenv/testHdStSubdivisionOsd3/baseline/testHdStSubdivisionOsd3-Run1-stdout.txt,
// copied unchanged to tests/fixtures/testHdStSubdivision/. This driver
// produces the same text and records, for each _DumpRefinedPoints and
// PrimitiveIDMappingTest call, the lines it wrote and the TF_VERIFY'd perf
// counter checks that follow it, so that callers can report per call.
//
// The registry and the buffer read-back are supplied by the caller:
// - the vitest run (subdivision.test.ts) uses the recording test Hgi
//   (tests/bufferTestHgi.ts), which has no compute pipelines, so only the
//   CPU subdivision calls can pass there;
// - the Safari run (tests/browser/storm-image/hdst-gpu/) uses HgiWebGPU and an
//   awaited read-back, since HdStReadBuffer cannot wait for a WebGPU copy
//   (PLATFORM-DIVERGENCE(hdst-readbuffer-sync) in hdSt/src/bufferUtils.ts).
//
// Output formatting: `std::cout << VtValue` of VtArray<int|GfVec3i|GfVec3f>
// (vt/streamOut.h, gf/vec3f.h operator<<): "[a, b]" and "[(x, y, z), ...]",
// floats in their shortest round-trip single-precision form as
// TfStreamFloat writes them (base/tf/stringUtils.h).

import { TfErrorMark } from 'typescript-usd/tf'
import { SdfPath } from 'typescript-usd/sdf/path'
import { Array as VtArray, Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { Vec3f as GfVec3f } from 'typescript-usd/gf'
import { SubdivTags as PxOsdSubdivTags, OpenSubdivTokens as PxOsdOpenSubdivTokens } from 'typescript-usd/pxOsd'
import {
  MeshTopology as HdMeshTopology,
  MeshUtil as HdMeshUtil,
  VtBufferSource as HdVtBufferSource,
  Tokens as HdTokens,
  PerfTokens as HdPerfTokens,
  PerfLog as HdPerfLog,
  BufferArrayUsageHintBits as HdBufferArrayUsageHintBits,
  type BufferArrayRange as HdBufferArrayRange,
} from 'typescript-usd/hd'
import { HdSt_MeshTopology } from '../../src/meshTopology.ts'
import type { HdStResourceRegistry } from '../../src/resourceRegistry.ts'

// testHdStSubdivision.cpp:36-40
const _tokens = { leftHanded: 'leftHanded', rightHanded: 'rightHanded' }

// HdStComputeQueueZero (hdSt/resourceRegistry.h)
const HdStComputeQueueZero = 0

/** `range->ReadData(name)`; the Safari run awaits the GPU copy. */
export type ReadDataFn = (range: HdBufferArrayRange | null, name: string) => VtValue | Promise<VtValue>

/** One _DumpRefinedPoints / PrimitiveIDMappingTest call. */
export interface SubdivisionCall {
  label: string
  gpu: boolean
  /** First line (0-based) of this call's output in the whole output. */
  firstLine: number
  /** The lines this call wrote. */
  lines: string[]
  /** Failed TF_VERIFYs of the perf counters after the call (empty when all
   *  hold, or when upstream checks none). */
  counterFailures: string[]
  /** Errors thrown while running the call (the run continues). */
  exception: string | null
}

export interface SubdivisionRun {
  output: string
  calls: SubdivisionCall[]
  errorMarkClean: boolean
}

/** Shortest single-precision text of a float, as TfStreamFloat writes it. */
export function StreamFloat(x: number): string {
  if (Object.is(x, -0)) return '-0'
  if (!Number.isFinite(x)) return x > 0 ? 'inf' : x < 0 ? '-inf' : 'nan'
  const f = Math.fround(x)
  for (let p = 1; p <= 9; ++p) {
    const s = Number(f.toPrecision(p))
    if (Math.fround(s) === f) return String(s)
  }
  return String(f)
}

/** `std::cout << value` for the VtArrays this test prints. */
export function StreamOut(value: VtValue): string {
  if (value.IsEmpty()) return ''
  const array = value.Get<VtArray<unknown>>()
  const typeName = array.getElementType().getTypeName()
  const items: string[] = []
  for (const v of array.toArray()) {
    if (typeof v === 'number') {
      items.push(typeName === 'float' ? StreamFloat(v) : String(v))
    } else {
      const data = (v as { data: ArrayLike<number> }).data
      const comps = Array.from(data, (c) => typeName.endsWith('f') ? StreamFloat(c) : String(c))
      items.push(`(${comps.join(', ')})`)
    }
  }
  return `[${items.join(', ')}]`
}

class _Out {
  text = ''
  get line(): number {
    return this.text.split('\n').length - 1
  }
  write(s: string): void {
    this.text += s
  }
}

function _HoldsArrayOf(value: VtValue, typeName: string): boolean {
  if (value.IsEmpty()) return false
  const array = value.Get<unknown>()
  return array instanceof VtArray && array.getElementType().getTypeName() === typeName
}

/** testHdStSubdivision.cpp:63-178 _DumpRefinedPoints */
async function _DumpRefinedPoints(
  out: _Out,
  registry: HdStResourceRegistry,
  readData: ReadDataFn,
  name: string,
  scheme: string,
  orientation: string,
  numVerts: number[], verts: number[],
  points: readonly (readonly number[])[],
  holes: number[],
  subdivTags: PxOsdSubdivTags,
  refineLevel: number,
  gpu: boolean,
): Promise<boolean> {
  out.write(`Test ${name}\n`)
  out.write(`Scheme ${scheme}\n`)
  out.write(`Orientation ${orientation}\n`)
  out.write(`GPU subdivision = ${gpu ? 1 : 0}\n`)

  const m = new HdMeshTopology(scheme, orientation, numVerts, verts, refineLevel)

  m.setSubdivTags(subdivTags)
  m.setHoleIndices(holes)

  // Convert topology to render delegate version
  const rdTopology = HdSt_MeshTopology.new(m, refineLevel)

  // build topology and allocate index buffer
  const topology = rdTopology.getOsdTopologyComputation(SdfPath.fromString(name))
  registry.addSource(topology)
  const index = rdTopology.getOsdIndexBuilderComputation()!

  const indexRange = registry.allocateNonUniformBufferArrayRange(
    HdTokens.topology, index.getBufferSpecs(),
    HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsIndex)
  registry.addSource(indexRange, index)

  // execute
  registry.commit()

  // index compare
  // retrieve result
  const resultValue = await readData(indexRange, HdTokens.indices)
  if (scheme === PxOsdOpenSubdivTokens.loop) {
    if (!_HoldsArrayOf(resultValue, 'GfVec3i')) {
      out.write(`${name} test failed:\n`)
      out.write('  wrong returned value type:\n')
      return false
    }
  } else {
    if (!_HoldsArrayOf(resultValue, 'int')) {
      out.write(`${name} test failed:\n`)
      out.write('  wrong returned value type:\n')
      return false
    }
  }

  out.write('Index Results\n')
  out.write(`${StreamOut(resultValue)}\n`)

  // refined points
  const pointsSource = new HdVtBufferSource(HdTokens.points, VtValue.createArray(
    new VtArray(points.map((p) => new GfVec3f(p[0]!, p[1]!, p[2]!)), VtValueTypes.GfVec3f)))

  const usageHint =
    HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsVertex |
    HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsStorage
  const pointsRange = registry.allocateNonUniformBufferArrayRange(HdTokens.points,
    pointsSource.getBufferSpecs(), usageHint)

  if (gpu) {
    // add coarse points
    registry.addSource(pointsRange, pointsSource)

    // GPU refine computation
    const comp = rdTopology.getOsdRefineComputationGPU(
      pointsSource.getName(),
      pointsSource.getTupleType().type,
      registry,
      HdSt_MeshTopology.INTERPOLATE_VERTEX)

    if (comp) {
      registry.addComputation(pointsRange, comp, HdStComputeQueueZero)
    }
  } else {
    // CPU refine computation
    const comp = rdTopology.getOsdRefineComputation(pointsSource,
      HdSt_MeshTopology.INTERPOLATE_VERTEX)
    if (comp) {
      registry.addSource(pointsRange, comp)
    }
  }

  registry.commit()

  // retrieve result
  const ptResultValue = await readData(pointsRange, HdTokens.points)
  if (!_HoldsArrayOf(ptResultValue, 'GfVec3f')) {
    out.write(`${name} test failed:\n`)
    out.write('  wrong returned value type:\n')
    return false
  }

  out.write('Results\n')
  out.write(`${StreamOut(ptResultValue)}\n`)

  return true
}

interface _Mesh {
  numVerts: number[]
  verts: number[]
  points: number[][]
  holes: number[]
}

/** The perf counters after a call: TF_VERIFY(perfLog.GetCounter(...) == n)
 *  in [subdivisionRefineCPU, subdivisionRefineGPU, bufferSourcesResolved,
 *  computationsCommitted] order. */
type _Counters = [number, number, number, number]

function _CheckCounters(expected: _Counters | null): string[] {
  if (!expected) return []
  const perfLog = HdPerfLog.GetInstance()
  const tokens = [HdPerfTokens.subdivisionRefineCPU, HdPerfTokens.subdivisionRefineGPU,
    HdPerfTokens.bufferSourcesResolved, HdPerfTokens.computationsCommitted]
  const failures: string[] = []
  tokens.forEach((t, i) => {
    const got = perfLog.getCounter(t)
    if (got !== expected[i]) failures.push(`${t} == ${got}, expected ${expected[i]}`)
  })
  perfLog.resetCounters()
  return failures
}

// testHdStSubdivision.cpp:202-203, 232-233 etc.: counters after the CPU and
// GPU calls of SubdivisionTest and LoopSubdivisionTest.
const _cpuCounters: _Counters = [1, 0, 3, 0]
const _gpuCounters: _Counters = [0, 1, 6, 1]

/** Runs the upstream main() (testHdStSubdivision.cpp:850-891) over
 *  `registry`. `newRegistry`, when given, supplies a fresh registry per call
 *  (upstream uses one). */
export async function RunTestHdStSubdivision(
  registry: () => HdStResourceRegistry,
  readData: ReadDataFn,
): Promise<SubdivisionRun> {
  const out = new _Out()
  const calls: SubdivisionCall[] = []
  const mark = new TfErrorMark()

  const perfLog = HdPerfLog.GetInstance()
  perfLog.enable()

  async function call(label: string, gpu: boolean, counters: _Counters | null,
    fn: (r: HdStResourceRegistry) => Promise<boolean>): Promise<void> {
    const firstLine = out.line
    let exception: string | null = null
    try {
      await fn(registry())
    } catch (e) {
      exception = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e)
    }
    // the lines written, including an unterminated last line (the decoded
    // map of PrimitiveIDMappingTest, testHdStSubdivision.cpp:590)
    const all = out.text.split('\n')
    const lines = all.slice(firstLine, out.text.endsWith('\n') ? all.length - 1 : all.length)
    calls.push({ label, gpu, firstLine, lines, counterFailures: _CheckCounters(counters), exception })
  }

  const dump = (label: string, name: string, scheme: string, orientation: string,
    mesh: _Mesh, tags: PxOsdSubdivTags, gpu: boolean, counters: _Counters | null) =>
    call(label, gpu, counters, (r) => _DumpRefinedPoints(out, r, readData, name, scheme, orientation,
      mesh.numVerts, mesh.verts, mesh.points, mesh.holes, tags, /*level=*/1, gpu))

  // SubdivisionTest (testHdStSubdivision.cpp:191-441), catmullClark
  {
    const scheme = PxOsdOpenSubdivTokens.catmullClark
    perfLog.resetCounters()
    const triangle: _Mesh = {
      numVerts: [3], verts: [0, 1, 2],
      points: [[0.0, 1.0, 0.0], [-1.0, 0.0, 0.0], [1.0, 0.0, 0.0]], holes: [],
    }
    for (const orientation of [_tokens.rightHanded, _tokens.leftHanded]) {
      await dump(`SubdivisionTest triangle ${orientation} (CPU)`, 'triangle', scheme, orientation,
        triangle, new PxOsdSubdivTags(), false, _cpuCounters)
      await dump(`SubdivisionTest triangle ${orientation} (GPU)`, 'triangle', scheme, orientation,
        triangle, new PxOsdSubdivTags(), true, _gpuCounters)
    }
    const quad: _Mesh = {
      numVerts: [4], verts: [0, 1, 2, 3],
      points: [[1, 1, 0], [-1, 1, 0], [-1, -1, 0], [1, -1, 0]], holes: [],
    }
    await dump('SubdivisionTest quad (CPU)', 'quad', scheme, _tokens.rightHanded,
      quad, new PxOsdSubdivTags(), false, _cpuCounters)
    await dump('SubdivisionTest quad (GPU)', 'quad', scheme, _tokens.rightHanded,
      quad, new PxOsdSubdivTags(), true, _gpuCounters)
    const polygons: _Mesh = {
      numVerts: [3, 4, 5],
      verts: [0, 1, 2, 0, 2, 3, 4, 4, 3, 5, 6, 7],
      points: [[1, 1, 0], [0, 0, 0], [1, 0, 0], [2, 0, 0], [2, 1, 0], [3, 0, 0], [3, 0.5, 0], [3, 1, 0]],
      holes: [],
    }
    await dump('SubdivisionTest polygons (CPU)', 'polygons', scheme, _tokens.rightHanded,
      polygons, new PxOsdSubdivTags(), false, _cpuCounters)
    await dump('SubdivisionTest polygons (GPU)', 'polygons', scheme, _tokens.rightHanded,
      polygons, new PxOsdSubdivTags(), true, _gpuCounters)
  }

  // LoopSubdivisionTest (testHdStSubdivision.cpp:443-505)
  {
    out.write('\nLoop Subdivision Test\n')
    perfLog.resetCounters()
    const triangle: _Mesh = {
      numVerts: [3], verts: [0, 1, 2],
      points: [[0.0, 1.0, 0.0], [-1.0, 0.0, 0.0], [1.0, 0.0, 0.0]], holes: [],
    }
    await dump('LoopSubdivisionTest triangle (CPU)', 'triangle', PxOsdOpenSubdivTokens.loop,
      _tokens.rightHanded, triangle, new PxOsdSubdivTags(), false, _cpuCounters)
    await dump('LoopSubdivisionTest triangle (GPU)', 'triangle', PxOsdOpenSubdivTokens.loop,
      _tokens.rightHanded, triangle, new PxOsdSubdivTags(), true, _gpuCounters)
  }

  // PrimitiveIDMappingTest (testHdStSubdivision.cpp:507-593)
  for (const usePtexIndex of [true, false]) {
    out.write('\nPrimitiveIDMap Test\n')
    await call(`PrimitiveIDMappingTest usePtexIndex=${usePtexIndex}`, false, null, async (r) => {
      const numVerts = [3, 4, 5]
      const verts = [0, 1, 2, 0, 2, 3, 4, 4, 3, 5, 6, 7]

      const refineLevel = 1
      const m = new HdMeshTopology(PxOsdOpenSubdivTokens.catmullClark, _tokens.rightHanded,
        numVerts, verts, refineLevel)

      // Convert topology to render delegate version
      const rdTopology = HdSt_MeshTopology.new(m, refineLevel)

      // build topology and allocate index buffer
      const topology = rdTopology.getOsdTopologyComputation(SdfPath.fromString('/polygons'))
      r.addSource(topology)

      const index = rdTopology.getOsdIndexBuilderComputation()!

      const indexRange = r.allocateNonUniformBufferArrayRange(
        HdTokens.topology, index.getBufferSpecs(),
        HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsIndex)

      r.addSource(indexRange, index)

      // execute
      r.commit()

      // retrieve result
      const resultValue = await readData(indexRange, HdTokens.primitiveParam)

      const resultIndices: number[] = []
      const faceIndices: number[] = []

      if (_HoldsArrayOf(resultValue, 'GfVec3i')) {
        const result = resultValue.Get<VtArray<{ data: ArrayLike<number> }>>().toArray()
        for (const v of result) {
          resultIndices.push(v.data[0]!)
          if (usePtexIndex) {
            // stored as Far::PatchParam.field0
            faceIndices.push(v.data[1]! & 0xfffffff)
          } else {
            faceIndices.push(HdMeshUtil.decodeFaceIndexFromCoarseFaceParam(v.data[0]!))
          }
        }
      } else {
        out.write(' test failed:\n')
        out.write('  wrong returned value type:\n')
        return false
      }

      out.write('PrimitiveParam Results\n')
      out.write(`[${resultIndices.join(', ')}]\n`)
      out.write('Decoded map\n')
      out.write(`[${faceIndices.join(', ')}]`)
      return true
    })
  }

  const tagMeshPoints = [
    [-1.0, 0.0, 1.0], [-1.0, 0.0, 0.0], [-0.5, 0.0, 0.0], [-0.5, 0.0, 1.0],
    [0.0, 0.0, 1.0], [0.5, 0.0, 0.0], [1.0, 0.0, 0.0], [1.0, 0.0, 1.0],
    [-0.5, 0.0, -1.0], [0.0, 0.0, -1.0], [1.0, 0.0, -1.0],
  ]
  const tagMeshVerts = [0, 1, 2, 3, 3, 2, 5, 4, 4, 5, 6, 7, 2, 8, 9, 5, 5, 9, 10, 6]

  // SubdivTagTest (testHdStSubdivision.cpp:595-669)
  {
    out.write('\nSubdiv Tag Test\n')
    const subdivTags = new PxOsdSubdivTags()
    subdivTags.setCreaseLengths([2])
    subdivTags.setCreaseIndices([2, 3])
    subdivTags.setCreaseWeights([5.0])
    subdivTags.setCornerIndices([5])
    subdivTags.setCornerWeights([5.0])
    subdivTags.setVertexInterpolationRule(PxOsdOpenSubdivTokens.edgeOnly)
    subdivTags.setFaceVaryingInterpolationRule(PxOsdOpenSubdivTokens.edgeOnly)
    const mesh: _Mesh = { numVerts: [4, 4, 4, 4, 4], verts: tagMeshVerts, points: tagMeshPoints, holes: [1] }
    await dump('SubdivTagTest (CPU)', 'subdivTag', PxOsdOpenSubdivTokens.catmullClark,
      _tokens.rightHanded, mesh, subdivTags, false, null)
    await dump('SubdivTagTest (GPU)', 'subdivTag', PxOsdOpenSubdivTokens.catmullClark,
      _tokens.rightHanded, mesh, subdivTags, true, null)
  }

  // SubdivTagTest2 (testHdStSubdivision.cpp:671-736)
  {
    out.write('\nSubdiv Tag Test 2\n')
    const subdivTags = new PxOsdSubdivTags()
    subdivTags.setCreaseLengths([2, 4])
    subdivTags.setCreaseIndices([2, 3, 1, 2, 5, 6])
    subdivTags.setCreaseWeights([4.0, 5.0])
    subdivTags.setVertexInterpolationRule(PxOsdOpenSubdivTokens.edgeOnly)
    subdivTags.setFaceVaryingInterpolationRule(PxOsdOpenSubdivTokens.edgeOnly)
    const mesh: _Mesh = { numVerts: [4, 4, 4, 4, 4], verts: tagMeshVerts, points: tagMeshPoints, holes: [] }
    await dump('SubdivTagTest2 (CPU)', 'subdivTag', PxOsdOpenSubdivTokens.catmullClark,
      _tokens.rightHanded, mesh, subdivTags, false, null)
    await dump('SubdivTagTest2 (GPU)', 'subdivTag', PxOsdOpenSubdivTokens.catmullClark,
      _tokens.rightHanded, mesh, subdivTags, true, null)
  }

  // InvalidTopologyTest (testHdStSubdivision.cpp:738-794)
  {
    out.write('\nInvalid Topology Test\n')
    const points: number[][] = [
      [-1.0, 0.0, 1.0], [-1.0, 0.0, 0.0], [-0.5, 0.0, 0.0], [-0.5, 0.0, 1.0],
      [0.0, 0.0, 1.0], [0.5, 0.0, 0.0], [1.0, 0.0, 0.0],
      [1.0, 0.0, -1.0], // unused
      // 1000 of unused follow
    ]
    for (let i = 8; i < 1008; ++i) {
      // initialize unused values (for baseline stability)
      points.push([i, i, i])
    }
    const subdivTags = new PxOsdSubdivTags()
    subdivTags.setCreaseLengths([2, 4])
    subdivTags.setCreaseIndices([2, 3, 1, 2, 6, 7])
    subdivTags.setCreaseWeights([4.0, 5.0])
    subdivTags.setVertexInterpolationRule(PxOsdOpenSubdivTokens.edgeOnly)
    subdivTags.setFaceVaryingInterpolationRule(PxOsdOpenSubdivTokens.edgeOnly)
    const mesh: _Mesh = { numVerts: [4, 0, 1, 2], verts: [0, 1, 2, 3, 4, 5, 6], points, holes: [] }
    await dump('InvalidTopologyTest (CPU)', 'subdivTag', PxOsdOpenSubdivTokens.catmullClark,
      _tokens.rightHanded, mesh, subdivTags, false, null)
    await dump('InvalidTopologyTest (GPU)', 'subdivTag', PxOsdOpenSubdivTokens.catmullClark,
      _tokens.rightHanded, mesh, subdivTags, true, null)
  }

  // EmptyTopologyTest (testHdStSubdivision.cpp:796-820)
  {
    out.write('\nEmpty Topology Test\n')
    const mesh: _Mesh = { numVerts: [], verts: [], points: [], holes: [] }
    await dump('EmptyTopologyTest (CPU)', 'subdivTag', PxOsdOpenSubdivTokens.catmullClark,
      _tokens.rightHanded, mesh, new PxOsdSubdivTags(), false, null)
    await dump('EmptyTopologyTest (GPU)', 'subdivTag', PxOsdOpenSubdivTokens.catmullClark,
      _tokens.rightHanded, mesh, new PxOsdSubdivTags(), true, null)
  }

  // TorusTopologyTest (testHdStSubdivision.cpp:822-875)
  {
    out.write('\nTorus Topology Test\n')
    const mesh: _Mesh = {
      numVerts: new Array<number>(16).fill(4),
      verts: [1, 0, 4, 5, 2, 1, 5, 6, 3, 2, 6, 7,
        0, 3, 7, 4, 5, 4, 8, 9, 6, 5, 9, 10,
        7, 6, 10, 11, 4, 7, 11, 8, 9, 8, 12, 13,
        10, 9, 13, 14, 11, 10, 14, 15, 8, 11, 15, 12,
        13, 12, 0, 1, 14, 13, 1, 2, 15, 14, 2, 3,
        12, 15, 3, 0],
      points: [
        [0, 0, -0.5], [-0.5, 0, 0], [0, 0, 0.5], [0.5, 0, 0],
        [0, 0.5, -1], [-1, 0.5, 0], [0, 0.5, 1], [1, 0.5, 0],
        [0, 0, -1.5], [-1.5, 0, 0], [0, 0, 1.5], [1.5, 0, 0],
        [0, -0.5, -1], [-1, -0.5, 0], [0, -0.5, 1], [1, -0.5, 0],
      ],
      holes: [],
    }
    await dump('TorusTopologyTest (CPU)', 'subdivTag', PxOsdOpenSubdivTokens.catmullClark,
      _tokens.rightHanded, mesh, new PxOsdSubdivTags(), false, null)
    await dump('TorusTopologyTest (GPU)', 'subdivTag', PxOsdOpenSubdivTokens.catmullClark,
      _tokens.rightHanded, mesh, new PxOsdSubdivTags(), true, null)
  }

  const errorMarkClean = mark.isClean()
  out.write(errorMarkClean && calls.every((c) => !c.exception) ? 'OK\n' : 'FAILED\n')

  return { output: out.text, calls, errorMarkClean }
}

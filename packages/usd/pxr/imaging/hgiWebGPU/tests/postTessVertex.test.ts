// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/testenv/testHdStDepthBias.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HgiWebGPU's emulation of Metal's post-tessellation draws
// (packages/usd/docs/imaging-i1.md sections 4.2, 4.3; imaging-i2.md section
// 2.2.1):
// the capability bits Storm's code generator reads, the WGSL shape of the
// emulated stage for small descriptors (reviewed expected text; the
// generated WGSL is compiled by Safari through tests/browser/wgsl-check, which
// these tests do not replace), and testHdStDepthBias's programs as the
// TypeScript code generator builds them under these capabilities.
//
// Controller (Node) tests: no GPU, no browser.
import { afterEach, describe, expect, it } from 'vitest'
import { TfErrorMark } from 'typescript-usd/tf'
import {
  HgiDeviceCapabilitiesBits,
  HgiShaderFunctionAddGlobalVariable,
  HgiShaderFunctionAddStageInput,
  HgiShaderFunctionAddStageOutput,
  HgiBindingType,
  HgiShaderFunctionBufferDesc,
  HgiShaderFunctionDesc,
  HgiShaderFunctionParamDesc,
  HgiShaderFunctionTessellationDesc,
  HgiShaderStageBits,
  type HgiShaderFunctionDesc as Desc,
} from 'typescript-usd/hgi'
import { HdStResourceRegistry } from '../../hdSt/src/resourceRegistry.ts'
import { HgiCodegenTestWebGPU } from '../../hdSt/tests/depthBiasCodegenWebGPU.ts'
import { DepthBiasCodegenPrograms } from '../../hdSt/tests/depthBiasCodegenPrograms.ts'
import {
  HgiWebGPUCapabilities,
  HgiWebGPUShaderGenerator,
  type HgiWebGPUShaderBodyTranslator,
  type HgiWebGPUShaderBodyTranslatorInput,
} from '../src/index.ts'
import type { HgiWebGPUShaderGeneratorOptions } from '../src/shaderGenerator.ts'
import { HgiWebGPUGlslShaderBodyTranslator } from '../src/glsl/glslShaderBodyTranslator.ts'
import { HgiWebGPUConstantPatchCorners } from '../src/tessellation.ts'

let seen: HgiWebGPUShaderBodyTranslatorInput | null = null
const recordingTranslator: HgiWebGPUShaderBodyTranslator = {
  Translate(input) { seen = input; return { declarations: '', code: 'fn main() {}\n', errors: '' } },
}
const hgi = { getShaderBodyTranslator: () => recordingTranslator, isFloat32Filterable: () => true }

function generate(desc: Desc, options: HgiWebGPUShaderGeneratorOptions = {}) {
  const gen = new HgiWebGPUShaderGenerator(hgi, desc, options)
  gen.Execute()
  return { gen, code: gen.getGeneratedShaderCode() }
}

let mark: TfErrorMark | null = null
afterEach(() => { mark?.clear(); mark = null })
function errorsDuring(action: () => void): string[] {
  mark = new TfErrorMark()
  mark.setMark()
  action()
  return mark.getErrors().map(e => e.getCommentary())
}

/** A control-point input as hdSt/codeGen.cpp:856-868 declares it for
 *  post-tessellation stages. */
function controlPointInput(desc: Desc, name: string, type: string, location: number) {
  const p = new HgiShaderFunctionParamDesc()
  p.nameInShader = name
  p.type = type
  p.location = location
  p.arraySize = 'VERTEX_CONTROL_POINTS_PER_PATCH'
  desc.stageInputs.push(p)
}

/** The post-tessellation vertex descriptor shape of
 *  hdSt/codeGen.cpp:3321-3400, reduced to one attribute per kind. */
function postTessDesc(patchType: HgiShaderFunctionTessellationDesc['patchType'], controlPoints: string) {
  const d = new HgiShaderFunctionDesc()
  d.shaderStage = HgiShaderStageBits.HgiShaderStagePostTessellationVertex
  d.tessellationDescriptor.patchType = patchType
  d.tessellationDescriptor.numVertsPerPatchIn = controlPoints
  controlPointInput(d, 'drawingCoord0', 'ivec4', 1)
  controlPointInput(d, 'points', 'vec3', 0)
  HgiShaderFunctionAddStageInput(d, 'hd_BaseInstance', 'uint', 'hdBaseInstance')
  HgiShaderFunctionAddStageInput(d, 'patch_id', 'uint', 'hdPatchID')
  const triangles = patchType === HgiShaderFunctionTessellationDesc.PatchType.Triangles
  HgiShaderFunctionAddStageInput(d, 'gl_TessCoord', triangles ? 'vec3' : 'vec2', 'hdPositionInPatch')
  HgiShaderFunctionAddStageInput(d, 'hd_InstanceID', 'uint', 'hdInstanceID')
  HgiShaderFunctionAddStageOutput(d, 'gl_Position', 'vec4', 'position')
  d.shaderCode = 'void main(void) {}\n'
  return d
}

describe('HgiWebGPUCapabilities (docs/imaging-i1.md section 4.3)', () => {
  const caps = new HgiWebGPUCapabilities({
    features: new Set<string>(['primitive-index']),
    limits: {
      maxUniformBufferBindingSize: 65536, maxStorageBufferBindingSize: 134217728,
      minUniformBufferOffsetAlignment: 256, minStorageBufferOffsetAlignment: 256,
      maxComputeWorkgroupsPerDimension: 65535, maxSamplersPerShaderStage: 16,
    },
  } as unknown as GPUDevice)
  const B = HgiDeviceCapabilitiesBits
  it('emulates Metal tessellation with primitive-ID emulation and the reference GPU\'s base primitive offset', () => {
    expect([
      caps.isSet(B.HgiDeviceCapabilitiesBitsMetalTessellation),
      caps.isSet(B.HgiDeviceCapabilitiesBitsPrimitiveIdEmulation),
      caps.isSet(B.HgiDeviceCapabilitiesBitsBasePrimitiveOffset),
    ]).toEqual([true, true, true])
  })
  it('reports none of the features WebGPU lacks', () => {
    for (const bit of [B.HgiDeviceCapabilitiesBitsBuiltinBarycentrics, B.HgiDeviceCapabilitiesBitsMultiDrawIndirect,
      B.HgiDeviceCapabilitiesBitsIndirectCommandBuffers, B.HgiDeviceCapabilitiesBitsShaderDoublePrecision,
      B.HgiDeviceCapabilitiesBitsDepthRangeMinusOnetoOne, B.HgiDeviceCapabilitiesBitsCppShaderPadding,
      // Each texture of an array of textures is its own binding (as hgiGL).
      B.HgiDeviceCapabilitiesBitsSingleSlotResourceArrays]) {
      expect(caps.isSet(bit)).toBe(false)
    }
  })
})

describe('HgiWebGPUShaderGenerator: emulated post-tessellation vertex stage', () => {
  it('triangle patch: declarations and fetch functions', () => {
    const { code, gen } = generate(postTessDesc(HgiShaderFunctionTessellationDesc.PatchType.Triangles, '3'), { tessellatedPatches: true })
    expect(gen.getGeneratorErrors()).toBe('')
    expect(gen.getEntryPointFunctionName()).toBe('vertexEntryPoint')
    expect(code).toContain(
      'struct HgiWebGPUPatchDraw {\n' +
      '  // patchStart, baseInstance, baseVertex, indexed\n' +
      '  header: vec4<u32>,\n' +
      '  // the viewport (x, y, width, height)\n' +
      '  viewport: vec4<f32>,\n' +
      '  // patchCount, tessellated (per-patch factors), HgiPolygonModeLine flags,\n' +
      '  // the first word of the control point indices in hgiWebGPU_pulled (packed)\n' +
      '  tess: vec4<u32>,\n' +
      '  // the (u, v) of the vertices of a patch at constant factors\n' +
      '  corners: array<vec4<f32>, 3>,\n' +
      '  // per location: first word, words per control point, per instance, per patch\n' +
      '  attributes: array<vec4<u32>, 2>,\n' +
      '};\n')
    expect(code).toContain(
      'var<private> drawingCoord0: array<vec4<i32>, 3>;\n' +
      'var<private> points: array<vec3<f32>, 3>;\n' +
      'var<private> hd_BaseInstance: u32;\n' +
      'var<private> patch_id: u32;\n' +
      'var<private> gl_TessCoord: vec3<f32>;\n' +
      'var<private> hd_InstanceID: u32;\n' +
      'var<private> gl_Position: vec4<f32>;\n' +
      '@group(3) @binding(1) var<uniform> hgiWebGPU_patchDraw: HgiWebGPUPatchDraw;\n' +
      '@group(3) @binding(2) var<storage, read> hgiWebGPU_controlPointIndices: array<u32>;\n' +
      '@group(3) @binding(4) var<storage, read> hgiWebGPU_attribute1: array<u32>;\n' +
      '@group(3) @binding(3) var<storage, read> hgiWebGPU_attribute0: array<u32>;\n' +
      '@group(3) @binding(64) var<storage, read> hgiWebGPU_tessPoints: array<u32>;\n')
    expect(code).toContain(
      'fn hgiWebGPU_Fetch_drawingCoord0(controlPoint: u32, instance: u32, patchIndex: u32) -> vec4<i32> {\n' +
      '  let a = hgiWebGPU_patchDraw.attributes[1];\n' +
      '  let w = a.x + (a.y & 0x7fffffffu) * controlPoint + a.z * instance + a.w * patchIndex;\n' +
      '  return vec4<i32>(bitcast<i32>(hgiWebGPU_attribute1[w]), bitcast<i32>(hgiWebGPU_attribute1[w + 1u]), ' +
      'bitcast<i32>(hgiWebGPU_attribute1[w + 2u]), bitcast<i32>(hgiWebGPU_attribute1[w + 3u]));\n' +
      '}\n' +
      'fn hgiWebGPU_Fetch_points(controlPoint: u32, instance: u32, patchIndex: u32) -> vec3<f32> {\n' +
      '  let a = hgiWebGPU_patchDraw.attributes[0];\n' +
      '  let w = a.x + (a.y & 0x7fffffffu) * controlPoint + a.z * instance + a.w * patchIndex;\n' +
      // HgiFormatPackedInt1010102 attributes (Storm's packed normals).
      '  if ((a.y & 0x80000000u) != 0u) {\n' +
      '    let p = bitcast<i32>(hgiWebGPU_attribute0[w]);\n' +
      '    let c = vec4<f32>(f32((p << 22u) >> 22u), f32((p << 12u) >> 22u), f32((p << 2u) >> 22u), f32(p >> 30u));\n' +
      '    let v = max(c / vec4<f32>(511.0, 511.0, 511.0, 1.0), vec4<f32>(-1.0));\n' +
      '    return v.xyz;\n' +
      '  }\n' +
      '  return vec3<f32>(bitcast<f32>(hgiWebGPU_attribute0[w]), bitcast<f32>(hgiWebGPU_attribute0[w + 1u]), ' +
      'bitcast<f32>(hgiWebGPU_attribute0[w + 2u]));\n' +
      '}\n')
  })

  it('triangle patch: the entry point derives patch_id, position_in_patch and the control points', () => {
    const { code } = generate(postTessDesc(HgiShaderFunctionTessellationDesc.PatchType.Triangles, '3'), { tessellatedPatches: true })
    expect(code.slice(code.indexOf('// //////// Entry Point ////////'))).toBe(
      '// //////// Entry Point ////////\n' +
      'struct WGSLTvInputs {\n' +
      '  @builtin(instance_index) hd_InstanceID: u32,\n' +
      '  @builtin(vertex_index) hgi_vertexIndex: u32,\n' +
      '};\n' +
      'struct WGSLTvOutputs {\n' +
      '  @builtin(position) gl_Position: vec4<f32>,\n' +
      '};\n' +
      '@vertex\n' +
      'fn vertexEntryPoint(tvInput: WGSLTvInputs) -> WGSLTvOutputs {\n' +
      '\n' +
      '// //////// Entry Point Function Executions ////////\n' +
      '  hd_InstanceID = u32(tvInput.hd_InstanceID);\n' +
      // Per-patch factors: the tessellator's (patch, u, v) points; constant
      // factors: the minimum tessellation's vertices (hgiWebGPU_patchDraw.corners).
      '  // Emulated post-tessellation vertex.\n' +
      '  var hgi_patch: u32;\n' +
      '  var hgi_uv: vec2<f32>;\n' +
      '  var hgi_firstInstance = 0u;\n' +
      '  if (hgiWebGPU_patchDraw.tess.y != 0u) {\n' +
      '    let hgi_point = tvInput.hgi_vertexIndex * 3u;\n' +
      '    hgi_patch = hgiWebGPU_tessPoints[hgi_point];\n' +
      '    hgi_uv = vec2<f32>(f32(hgiWebGPU_tessPoints[hgi_point + 1u]), f32(hgiWebGPU_tessPoints[hgi_point + 2u])) / 65536.0;\n' +
      '    hgi_firstInstance = hgiWebGPU_patchDraw.header.y;\n' +
      '  } else {\n' +
      '    hgi_patch = tvInput.hgi_vertexIndex / 3u;\n' +
      '    let hgi_c = tvInput.hgi_vertexIndex % 3u;\n' +
      '    let hgi_cc = hgiWebGPU_patchDraw.corners[hgi_c / 2u];\n' +
      '    hgi_uv = select(hgi_cc.xy, hgi_cc.zw, (hgi_c & 1u) != 0u);\n' +
      '  }\n' +
      '  hd_InstanceID = hd_InstanceID + hgi_firstInstance;\n' +
      '  let hgi_instance = u32(hd_InstanceID);\n' +
      '  patch_id = u32(hgiWebGPU_patchDraw.header.x + hgi_patch);\n' +
      '  gl_TessCoord = vec3<f32>(hgi_uv, 1.0 - hgi_uv.x - hgi_uv.y);\n' +
      '  hd_BaseInstance = u32(hgiWebGPU_patchDraw.header.y);\n' +
      '  let hgi_firstControlPoint = (hgiWebGPU_patchDraw.header.x + hgi_patch) * 3u;\n' +
      '  for (var i = 0u; i < 3u; i++) {\n' +
      '    var controlPoint = hgi_firstControlPoint + i;\n' +
      '    if (hgiWebGPU_patchDraw.header.w != 0u) {\n' +
      '      controlPoint = hgiWebGPU_controlPointIndices[controlPoint];\n' +
      '    }\n' +
      '    drawingCoord0[i] = hgiWebGPU_Fetch_drawingCoord0(controlPoint, hgi_instance, hgiWebGPU_patchDraw.header.x + hgi_patch);\n' +
      '    points[i] = hgiWebGPU_Fetch_points(controlPoint, hgi_instance, hgiWebGPU_patchDraw.header.x + hgi_patch);\n' +
      '  }\n' +
      '  main();\n' +
      '  var tvOutput: WGSLTvOutputs;\n' +
      '  tvOutput.gl_Position = vec4<f32>(vec4<f32>(gl_Position).x, -vec4<f32>(gl_Position).y, ' +
      'vec4<f32>(gl_Position).z, vec4<f32>(gl_Position).w);\n' +
      '  return tvOutput;\n' +
      '}\n')
  })

  it('quad patch: six vertices per patch at constant factors, position_in_patch (u, v)', () => {
    const { code } = generate(postTessDesc(HgiShaderFunctionTessellationDesc.PatchType.Quads, '4'), { tessellatedPatches: true })
    expect(code).toContain('    hgi_patch = tvInput.hgi_vertexIndex / 6u;\n')
    expect(code).toContain('  gl_TessCoord = vec3<f32>(hgi_uv, 0.0).xy;\n')
    expect(code).toContain('var<private> points: array<vec3<f32>, 4>;\n')
    expect(code).toContain('  for (var i = 0u; i < 4u; i++) {\n')
  })

  it('declares its bindings in the constants group, visible to the vertex stage', () => {
    const { gen } = generate(postTessDesc(HgiShaderFunctionTessellationDesc.PatchType.Triangles, '3'), { tessellatedPatches: true })
    expect(gen.getBindGroupLayoutInfo()).toEqual([{
      group: 3,
      entries: [
        { binding: 1, visibility: 1, buffer: { type: 'uniform', hasDynamicOffset: true } },
        { binding: 2, visibility: 1, buffer: { type: 'read-only-storage' } },
        // drawingCoord0 (location 1), then points (location 0)
        { binding: 4, visibility: 1, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: 1, buffer: { type: 'read-only-storage' } },
        // the tessellated points (HgiWebGPUTessellation)
        { binding: 64, visibility: 1, buffer: { type: 'read-only-storage' } },
      ],
    }])
    const section = gen.getPostTessVertexSection()!
    expect([section.getVerticesPerPatch(), section.getAttributeSlots(),
      section.getPulledAttributes().map(a => [a.name, a.location, a.wgslType])])
      .toEqual([3, 2, [['drawingCoord0', 1, 'vec4<i32>'], ['points', 0, 'vec3<f32>']]])
  })

  it('at constant factors, does not declare or bind the tessellated points', () => {
    const { gen, code } = generate(postTessDesc(HgiShaderFunctionTessellationDesc.PatchType.Triangles, '3'))
    expect(gen.getGeneratorErrors()).toBe('')
    expect(code).not.toContain('hgiWebGPU_tessPoints')
    expect(code).not.toContain('tess.y')
    expect(code).toContain('  hgi_patch = tvInput.hgi_vertexIndex / 3u;\n')
    expect(gen.getBindGroupLayoutInfo()[0]!.entries.map(e => e.binding)).toEqual([1, 2, 4, 3])
  })

  it('packed (webgpu-storage-buffer-limit): indices and attributes from one binding', () => {
    const { gen, code } = generate(postTessDesc(HgiShaderFunctionTessellationDesc.PatchType.Triangles, '3'),
      { tessellatedPatches: true, packedAttributes: true })
    expect(gen.getGeneratorErrors()).toBe('')
    expect(gen.getBindGroupLayoutInfo()[0]!.entries.map(e => [e.binding, e.visibility])).toEqual([[1, 1], [2, 1], [64, 1]])
    expect(code).toContain('@group(3) @binding(2) var<storage, read> hgiWebGPU_pulled: array<u32>;\n')
    expect(code).not.toContain('hgiWebGPU_attribute')
    expect(code).not.toContain('hgiWebGPU_controlPointIndices')
    expect(code).toContain('      controlPoint = hgiWebGPU_pulled[hgiWebGPU_patchDraw.tess.w + controlPoint];\n')
    expect(code).toContain('bitcast<f32>(hgiWebGPU_pulled[w])')
    expect(gen.getPostTessVertexSection()!.isPacked()).toBe(true)
  })

  it('hands the body VERTEX_CONTROL_POINTS_PER_PATCH (hgiMetal/shaderGenerator.mm:1442-1446) and sized globals', () => {
    generate(postTessDesc(HgiShaderFunctionTessellationDesc.PatchType.Triangles, '3'))
    expect(seen!.declarations.startsWith('#define VERTEX_CONTROL_POINTS_PER_PATCH 3\n')).toBe(true)
    expect(seen!.globals.filter(g => g.kind === 'stageInput').map(g => [g.name, g.wgslType])).toEqual([
      ['drawingCoord0', 'array<vec4<i32>, 3>'], ['points', 'array<vec3<f32>, 3>'],
      ['hd_BaseInstance', 'u32'], ['patch_id', 'u32'], ['gl_TessCoord', 'vec3<f32>'], ['hd_InstanceID', 'u32'],
    ])
  })

  it('reports isoline patches, which the emulation does not draw', () => {
    const d = postTessDesc(HgiShaderFunctionTessellationDesc.PatchType.Isolines, '4')
    let gen: HgiWebGPUShaderGenerator | null = null
    expect(errorsDuring(() => { gen = generate(d).gen })).toEqual(['HgiWebGPU: isoline patches are not supported'])
    expect(gen!.getGeneratorErrors()).toContain('isoline patches are not supported')
  })
})

describe('HgiWebGPUShaderGenerator: HgiPolygonModeLine (MTLTriangleFillModeLines) variants', () => {
  function generateLines(desc: Desc, extraHgi: object = {}) {
    const gen = new HgiWebGPUShaderGenerator({ ...hgi, ...extraHgi }, desc, { polygonModeLine: true })
    gen.Execute()
    return { gen, code: gen.getGeneratedShaderCode() }
  }
  it('draws the edges of each triangle as a line list: two line vertices per triangle vertex', () => {
    const tri = generateLines(postTessDesc(HgiShaderFunctionTessellationDesc.PatchType.Triangles, '3'))
    const quad = generateLines(postTessDesc(HgiShaderFunctionTessellationDesc.PatchType.Quads, '4'))
    expect(tri.gen.getGeneratorErrors()).toBe('')
    expect([tri.gen.getPostTessVertexSection()!.getVerticesPerPatch(),
      quad.gen.getPostTessVertexSection()!.getVerticesPerPatch()]).toEqual([6, 12])
    // Line vertex k of triangle t: corners (0, 1), (1, 2), (2, 0).
    expect(tri.code).toContain(
      '  let hgi_patch = tvInput.hgi_vertexIndex / 6u;\n' +
      '  let hgi_line = tvInput.hgi_vertexIndex % 6u;\n' +
      '  let hgi_triangle = hgi_line / 6u;\n' +
      '  let hgi_ownCorner = ((hgi_line % 6u + 1u) / 2u) % 3u;\n')
    expect(quad.code).toContain('  let hgi_patch = tvInput.hgi_vertexIndex / 12u;\n')
  })
  it('runs the body for the three vertices of the triangle, its own last, and culls by the triangle\'s facing', () => {
    const { code } = generateLines(postTessDesc(HgiShaderFunctionTessellationDesc.PatchType.Triangles, '3'))
    const entry = code.slice(code.indexOf('// //////// Entry Point ////////'))
    expect(entry).toContain('  @location(14) @interpolate(flat) hgi_frontFacing: u32,\n')
    expect(entry).toContain(
      '  for (var hgi_k = 1u; hgi_k <= 3u; hgi_k++) {\n' +
      '    let hgi_corner = (hgi_ownCorner + hgi_k) % 3u;\n' +
      '    let hgi_c = hgi_triangle * 3u + hgi_corner;\n' +
      '    let hgi_cc = hgiWebGPU_patchDraw.corners[hgi_c / 2u];\n' +
      '    hgi_uv = select(hgi_cc.xy, hgi_cc.zw, (hgi_c & 1u) != 0u);\n' +
      '    gl_TessCoord = vec3<f32>(hgi_uv, 1.0 - hgi_uv.x - hgi_uv.y);\n' +
      '    main();\n' +
      '    hgi_trianglePositions[hgi_corner] = gl_Position;\n' +
      '  }\n')
    expect(entry).toContain(
      '  let hgi_frontFacing = (hgi_orientation > 0.0) == ((hgi_flags & 4u) != 0u);\n' +
      '  if ((hgi_frontFacing && (hgi_flags & 1u) != 0u) || (!hgi_frontFacing && (hgi_flags & 2u) != 0u)) {\n' +
      '    gl_Position = vec4<f32>(4.0, 4.0, 0.0, 1.0);\n' +
      '  }\n')
    // main() runs only in the loop.
    expect(entry.split('main();').length - 1).toBe(1)
    expect(entry).toContain('  tvOutput.hgi_frontFacing = select(0u, 1u, hgi_frontFacing);\n')
  })
  it('the fragment stage reads gl_FrontFacing from the vertex stage', () => {
    const d = new HgiShaderFunctionDesc()
    d.shaderStage = HgiShaderStageBits.HgiShaderStageFragment
    HgiShaderFunctionAddStageInput(d, 'gl_FrontFacing', 'bool', 'hdFrontFacing')
    d.shaderCode = ''
    const lines = generateLines(d).code
    const fill = generate(d).code
    expect(lines).toContain('  @location(14) @interpolate(flat) gl_FrontFacing: u32,\n')
    expect(lines).toContain('  gl_FrontFacing = bool(fsInput.gl_FrontFacing);\n')
    expect(fill).toContain('  @builtin(front_facing) gl_FrontFacing: bool,\n')
  })
})

describe('HgiWebGPUShaderGenerator: gl_ClipDistance', () => {
  function clipDesc() {
    const d = new HgiShaderFunctionDesc()
    d.shaderStage = HgiShaderStageBits.HgiShaderStageVertex
    HgiShaderFunctionAddStageOutput(d, 'gl_Position', 'vec4', 'position')
    const c = new HgiShaderFunctionParamDesc()
    c.nameInShader = 'gl_ClipDistance'; c.type = 'float'; c.role = 'clip_distance'; c.arraySize = 'HD_NUM_clipPlanes'
    d.stageOutputs.push(c)
    d.shaderCode = ''
    return d
  }
  it('writes the clip_distances builtin with the clip-distances feature (hgiMetal [[clip_distance]])', () => {
    const gen = new HgiWebGPUShaderGenerator({ ...hgi, hasClipDistances: () => true }, clipDesc())
    gen.Execute()
    const code = gen.getGeneratedShaderCode()
    expect(gen.getGeneratorErrors()).toBe('')
    expect(code.startsWith('enable clip_distances;\n')).toBe(true)
    expect(code).toContain('  @builtin(clip_distances) gl_ClipDistance: array<f32, HD_NUM_clipPlanes>,\n')
    expect(code).toContain(
      '  for (var hgi_i = 0u; hgi_i < u32(HD_NUM_clipPlanes); hgi_i++) {\n' +
      '    vsOutput.gl_ClipDistance[hgi_i] = gl_ClipDistance[hgi_i];\n' +
      '  }\n')
  })
  it('without the feature, gl_ClipDistance stays a module-scope variable and is not written', () => {
    const { code } = generate(clipDesc())
    expect(code).toContain('var<private> gl_ClipDistance: array<f32, HD_NUM_clipPlanes>;\n')
    expect(code).not.toContain('clip_distances')
  })
  it('HgiWebGPUCapabilities reports 8 clip distances with the feature, as hgiMetal (capabilities.mm:119)', () => {
    const limits = {
      maxUniformBufferBindingSize: 65536, maxStorageBufferBindingSize: 134217728,
      minUniformBufferOffsetAlignment: 256, minStorageBufferOffsetAlignment: 256,
      maxComputeWorkgroupsPerDimension: 65535, maxSamplersPerShaderStage: 16,
    }
    const make = (features: string[]) =>
      new HgiWebGPUCapabilities({ features: new Set(features), limits } as unknown as GPUDevice)
    expect([make(['clip-distances']).getMaxClipDistances(), make([]).getMaxClipDistances()]).toEqual([8, 0])
  })
})

describe('HgiWebGPUShaderGenerator: globals and primitive-ID emulation', () => {
  it('lists global members with their array size', () => {
    const d = new HgiShaderFunctionDesc()
    d.shaderStage = HgiShaderStageBits.HgiShaderStageVertex
    HgiShaderFunctionAddGlobalVariable(d, 'weights', 'float', '4')
    HgiShaderFunctionAddGlobalVariable(d, 'scale', 'float', '')
    d.shaderCode = ''
    const { code } = generate(d)
    expect(seen!.globals.map(g => [g.name, g.wgslType, g.kind])).toEqual([
      ['weights', 'array<f32, 4>', 'globalMember'], ['scale', 'f32', 'globalMember'],
    ])
    expect(code).toContain('var<private> weights: array<f32, 4>;\nvar<private> scale: f32;\n')
  })

  it("declares the fragment stage's gl_PrimitiveID without reporting it (hdSt/codeGen.cpp:3479-3482)", () => {
    const d = new HgiShaderFunctionDesc()
    d.shaderStage = HgiShaderStageBits.HgiShaderStageFragment
    HgiShaderFunctionAddStageInput(d, 'gl_PrimitiveID', 'uint', 'hdPrimitiveID')
    d.shaderCode = ''
    let code = ''
    expect(errorsDuring(() => { code = generate(d).code })).toEqual([])
    expect(code).toContain('// hdPrimitiveID is not available in WebGPU\nvar<private> gl_PrimitiveID: u32;\n')
  })
})

describe("testHdStDepthBias's programs under HgiWebGPU's capabilities", () => {
  const descs: Desc[] = []
  const testHgi = HgiCodegenTestWebGPU()
  const create = testHgi.CreateShaderFunction.bind(testHgi)
  testHgi.CreateShaderFunction = (desc) => { descs.push(desc.clone()); return create(desc) }
  DepthBiasCodegenPrograms(testHgi, (h) => new HdStResourceRegistry(h))
  const glslHgi = { getShaderBodyTranslator: () => HgiWebGPUGlslShaderBodyTranslator, isFloat32Filterable: () => true }

  it('Storm compiles the cull program and VS, post-tessellation VS, FS', () => {
    expect(descs.map(d => d.shaderStage)).toEqual([
      HgiShaderStageBits.HgiShaderStageCompute, HgiShaderStageBits.HgiShaderStageVertex,
      HgiShaderStageBits.HgiShaderStagePostTessellationVertex, HgiShaderStageBits.HgiShaderStageFragment,
    ])
  })

  for (const [i, name] of ['COMPUTE', 'VERTEX', 'POST_TESS_VERTEX', 'FRAGMENT'].entries()) {
    it(`${name} goes through the generator and translator without errors`, () => {
      const gen = new HgiWebGPUShaderGenerator(glslHgi, descs[i]!)
      gen.Execute()
      expect(gen.getGeneratorErrors()).toBe('')
      expect(gen.getGeneratedShaderCode()).toContain('fn main()')
    })
  }

  it('the post-tessellation stage pulls points and the drawing coordinates', () => {
    const gen = new HgiWebGPUShaderGenerator(glslHgi, descs[2]!)
    gen.Execute()
    const section = gen.getPostTessVertexSection()!
    expect([section.getVerticesPerPatch(),
      section.getPulledAttributes().map(a => [a.name, a.location, a.wgslType])]).toEqual([3, [
      ['drawingCoord0', 1, 'vec4<i32>'], ['drawingCoord1', 2, 'vec4<i32>'],
      ['drawingCoord2', 3, 'vec2<i32>'], ['points', 0, 'vec3<f32>'],
    ]])
  })

  it('the fragment stage reads the patch id through the flat hd_patchID varying (codeGen.cpp:2491-2503)', () => {
    const gen = new HgiWebGPUShaderGenerator(glslHgi, descs[3]!)
    gen.Execute()
    expect(gen.getGeneratedShaderCode()).toContain('@location(6) @interpolate(flat) hd_patchID: u32,')
  })
})

describe('HgiWebGPUShaderGenerator: vertex pulling for points and base vertex/instance', () => {
  function vertexDesc(pointSizeRole: string, baseVertex: boolean) {
    const d = new HgiShaderFunctionDesc()
    d.shaderStage = HgiShaderStageBits.HgiShaderStageVertex
    const p = new HgiShaderFunctionParamDesc()
    p.nameInShader = 'points'; p.type = 'vec3'; p.location = 0
    d.stageInputs.push(p)
    if (baseVertex) {
      const b = new HgiShaderFunctionParamDesc()
      b.nameInShader = 'gl_BaseVertex'; b.type = 'uint'; b.role = 'hdBaseVertex'
      d.stageInputs.push(b)
    }
    const pos = new HgiShaderFunctionParamDesc()
    pos.nameInShader = 'gl_Position'; pos.type = 'vec4'; pos.role = 'position'
    d.stageOutputs.push(pos)
    const ps = new HgiShaderFunctionParamDesc()
    ps.nameInShader = 'gl_PointSize'; ps.type = 'float'; ps.role = pointSizeRole
    d.stageOutputs.push(ps)
    d.shaderCode = 'fn main() {}\n'
    return d
  }
  it('draws a point-list function as squares gl_PointSize wide, with gl_PointCoord', () => {
    const { gen, code } = generate(vertexDesc('point_size', false))
    expect(gen.getPostTessVertexSection()?.getPrimitive()).toBe('point')
    expect(gen.getPostTessVertexSection()?.getVerticesPerPatch()).toBe(6)
    expect(code).toContain('@location(15) hgi_pointCoord: vec2<f32>,')
    // The size unchanged, as hgiMetal's [[point_size]]: no one-pixel minimum.
    expect(code).toContain('let hgi_pointSize = gl_PointSize;')
    expect(code).not.toContain('max(gl_PointSize')
    expect(code).toContain('points = hgiWebGPU_Fetch_points(')
  })
  it('pulls the vertices of a function that reads gl_BaseVertex, one per vertex', () => {
    const { gen, code } = generate(vertexDesc('', true))
    expect(gen.getPostTessVertexSection()?.getPrimitive()).toBe('vertex')
    expect(gen.getPostTessVertexSection()?.getVerticesPerPatch()).toBe(1)
    expect(code).toContain('gl_BaseVertex = u32(hgiWebGPU_patchDraw.header.z);')
    expect(code).not.toContain('hgi_pointCoord')
  })
  it('leaves other vertex functions to the vertex fetch', () => {
    const { gen } = generate(vertexDesc('', false))
    expect(gen.getPostTessVertexSection()).toBe(null)
  })
})

describe('HgiWebGPUShaderGenerator: post-tessellation control stage as a compute dispatch', () => {
  // Storm's refined curves on Metal (hdSt/basisCurvesShaderKey.cpp:195-199)
  // run a post-tessellation control stage that writes per-patch tessellation
  // factors (hdSt/pipelineDrawBatch.cpp:1376-1385); HgiWebGPU runs it as a
  // compute entry point (packages/usd/docs/imaging-i2.md section 2.2.1).
  it('generates a post-tessellation control stage (tessellation factors above 1)', () => {
    const d = new HgiShaderFunctionDesc()
    d.shaderStage = HgiShaderStageBits.HgiShaderStagePostTessellationControl
    d.tessellationDescriptor.numVertsPerPatchIn = '4'
    d.shaderCode = 'fn main() {}\n'
    const errors = errorsDuring(() => generate(d))
    expect(errors).toEqual([])
  })

  it('dispatches one invocation per patch and instance, and declares the factor buffer as packed halves', () => {
    const d = postTessDesc(HgiShaderFunctionTessellationDesc.PatchType.Quads, '4')
    d.shaderStage = HgiShaderStageBits.HgiShaderStagePostTessellationControl
    const b = new HgiShaderFunctionBufferDesc()
    b.nameInShader = 'tessFactors'; b.type = 'float'; b.bindIndex = 2; b.writable = true
    b.binding = HgiBindingType.HgiBindingTypePointer
    d.buffers.push(b)
    // Curves.TessFactorsMSL (hdSt/shaders/basisCurves.glslfx:137-151)
    d.shaderCode = 'void SetTessFactors(float out0, float out1, float out2, float out3,\n' +
      '                    float in0, float in1)\n{\n' +
      '    device half *tessAsHalf = (device half *)tessFactors + patch_id * 6;\n\n' +
      '    tessAsHalf[0] = half(out0);\n    tessAsHalf[1] = half(out1);\n' +
      '    tessAsHalf[2] = half(out2);\n    tessAsHalf[3] = half(out3);\n\n' +
      '    tessAsHalf[4] = half(in0);\n    tessAsHalf[5] = half(in1);\n}\n'
    const { gen, code } = generate(d)
    expect(gen.getGeneratorErrors()).toBe('')
    expect(gen.getEntryPointFunctionName()).toBe('computeEntryPoint')
    expect(code).toContain('@compute @workgroup_size(64)\nfn computeEntryPoint(tcInput: WGSLTcInputs) {\n')
    expect(code).toContain('  if (hgi_patch >= hgiWebGPU_patchDraw.tess.x) { return; }\n')
    expect(code).toContain('@group(0) @binding(2) var<storage, read_write> tessFactors: array<u32>;\n')
    expect(gen.getTessFactorsBindIndex()).toBe(2)
    expect(seen!.code).toContain('    uint tessAsHalf = uint(patch_id) * 6u;\n')
    expect(seen!.code).toContain('    hgiWebGPU_SetTessFactor_tessFactors(tessAsHalf + uint(5), in1);\n')
    expect(seen!.code).not.toMatch(/device|half\(/)
  })
})

describe('HgiWebGPUConstantPatchCorners', () => {
  // Constant-factor patches are drawn as the reference device draws the same
  // prims, triangle lists of the index buffer (hdSt/meshShaderKey.cpp:277-288,
  // geometricShader.cpp:312-318): a triquad's indices are (q0, q1, q2, q2,
  // q3, q0) (hd/meshUtil.h:398-405); Mesh.PostTessVertex.TriQuad evaluates
  // to q0, q1, q2, q3 at (0,0), (1,0), (1,1), (0,1) (mesh.glslfx:285-289),
  // and Mesh.PostTessVertex.Triangle to points 0, 1, 2 at (1,0), (0,1),
  // (0,0) (mesh.glslfx:120-123).
  it('draws a triquad as its two triangles, q0-q2 diagonal', () => {
    expect(HgiWebGPUConstantPatchCorners('quad')).toEqual([0, 0, 1, 0, 1, 1, 1, 1, 0, 1, 0, 0])
  })
  it('draws a triangle patch as its control points in order', () => {
    expect(HgiWebGPUConstantPatchCorners('tri')).toEqual([1, 0, 0, 1, 0, 0])
  })
})

// Ported from OpenUSD 26.11.1: pxr/imaging/hgi/testenv/testHgiCommand.cpp,
//  pxr/imaging/hgi/unitTestHelper.cpp, pxr/imaging/hgiMetal/conversions.mm,
//  pxr/imaging/hgiMetal/shaderGenerator.mm,
//  pxr/imaging/hgiVulkan/descriptorSetLayouts.cpp,
//  pxr/imaging/hgiVulkan/shaderGenerator.cpp
// Copyright 2020, 2023, 2025 Pixar. Tomorrow Open Source Technology License
//  1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HgiWebGPU's device-free logic: the conversion tables (aligned with
// HgiFormat as hgiMetal/conversions.mm:80-93 asserts), the shader generator's
// sections and binding records for the descriptors of
// pxr/imaging/hgi/unitTestHelper.cpp, location and builtin assignment
// following hgiVulkan/shaderGenerator.cpp and hgiMetal/shaderGenerator.mm, the
// translator seam, and the bind group merge of
// hgiVulkan/descriptorSetLayouts.cpp. The generated WGSL itself is compiled
// and run in Safari (testHgiCommand port), which these tests do not replace.
import { afterEach, describe, expect, it } from 'vitest'
import { Vec3i as GfVec3i } from 'typescript-usd/gf'
import { TfErrorMark } from 'typescript-usd/tf'
import {
  HgiBindingType,
  HgiFormat,
  HgiShaderFunctionAddArrayOfTextures,
  HgiShaderFunctionAddBuffer,
  HgiShaderFunctionAddConstantParam,
  HgiShaderFunctionAddStageInput,
  HgiShaderFunctionAddStageOutput,
  HgiShaderFunctionAddTexture,
  HgiShaderFunctionAddWritableBuffer,
  HgiShaderFunctionAddWritableTexture,
  HgiShaderFunctionDesc,
  HgiShaderStageBits,
  HgiShaderTextureType,
  HgiTextureUsageBits,
  HgiWinding,
  glslfx_fragShaderStr,
  glslfx_vertShaderStr,
} from 'typescript-usd/hgi'
import {
  HgiWebGPUConversions,
  HgiWebGPUMergeBindGroupLayoutInfos,
  HgiWebGPUShaderGenerator,
  HgiWebGPUWgslPassThroughTranslator,
  type HgiWebGPUShaderBodyTranslator,
  type HgiWebGPUShaderBodyTranslatorInput,
} from '../src/index.ts'

const passThrough = { getShaderBodyTranslator: () => HgiWebGPUWgslPassThroughTranslator, isFloat32Filterable: () => true }

function generate(desc: HgiShaderFunctionDesc, hgi = passThrough) {
  const gen = new HgiWebGPUShaderGenerator(hgi, desc)
  gen.Execute()
  return { gen, code: gen.getGeneratedShaderCode() }
}

/** The descriptors of unitTestHelper.cpp:88-113. */
function unitTestDescs() {
  const vertDesc = new HgiShaderFunctionDesc()
  vertDesc.debugName = 'Vertex'
  vertDesc.shaderStage = HgiShaderStageBits.HgiShaderStageVertex
  HgiShaderFunctionAddStageInput(vertDesc, 'position', 'vec4', 'position')
  HgiShaderFunctionAddStageInput(vertDesc, 'uvIn', 'vec2')
  HgiShaderFunctionAddStageOutput(vertDesc, 'gl_Position', 'vec4', 'position')
  HgiShaderFunctionAddStageOutput(vertDesc, 'uvOut', 'vec2')
  vertDesc.shaderCode = glslfx_vertShaderStr

  const fragDesc = new HgiShaderFunctionDesc()
  fragDesc.debugName = 'Fragment'
  fragDesc.shaderStage = HgiShaderStageBits.HgiShaderStageFragment
  HgiShaderFunctionAddStageInput(fragDesc, 'uvOut', 'vec2')
  HgiShaderFunctionAddStageOutput(fragDesc, 'hd_FragColor', 'vec4', 'color')
  fragDesc.shaderCode = glslfx_fragShaderStr
  return { vertDesc, fragDesc }
}

let mark: TfErrorMark | null = null
afterEach(() => { mark?.clear(); mark = null })
function errorsDuring(action: () => void): string[] {
  mark = new TfErrorMark()
  mark.setMark()
  action()
  return mark.getErrors().map(e => e.getCommentary())
}

describe('HgiWebGPUConversions', () => {
  it('pixel formats stay aligned with HgiFormat (hgiMetal/conversions.mm:80-93)', () => {
    const f = (x: HgiFormat) => HgiWebGPUConversions.getPixelFormat(x, 0)
    expect([
      f(HgiFormat.HgiFormatUNorm8), f(HgiFormat.HgiFormatFloat16Vec4), f(HgiFormat.HgiFormatFloat32Vec4),
      f(HgiFormat.HgiFormatUInt16Vec4), f(HgiFormat.HgiFormatUNorm8Vec4srgb), f(HgiFormat.HgiFormatBC3UNorm8Vec4),
      f(HgiFormat.HgiFormatFloat32UInt8), f(HgiFormat.HgiFormatPackedInt1010102),
    ]).toEqual(['r8unorm', 'rgba16float', 'rgba32float', 'rgba16uint', 'rgba8unorm-srgb',
      'bc3-rgba-unorm', 'depth32float-stencil8', null])
  })
  it('a depth target Float32 is depth32float (hgiMetal/conversions.mm:439-467)', () => {
    expect(HgiWebGPUConversions.getPixelFormat(HgiFormat.HgiFormatFloat32,
      HgiTextureUsageBits.HgiTextureUsageBitsDepthTarget)).toBe('depth32float')
  })
  it('inverts winding as hgiMetal/conversions.mm:250-260 does', () => {
    expect([HgiWebGPUConversions.getWinding(HgiWinding.HgiWindingClockwise),
      HgiWebGPUConversions.getWinding(HgiWinding.HgiWindingCounterClockwise)]).toEqual(['ccw', 'cw'])
  })
  it('vertex formats of the unitTestHelper attributes', () => {
    expect([HgiWebGPUConversions.getVertexFormat(HgiFormat.HgiFormatFloat32Vec3),
      HgiWebGPUConversions.getVertexFormat(HgiFormat.HgiFormatFloat32Vec2)]).toEqual(['float32x3', 'float32x2'])
  })
})

describe('HgiWebGPUShaderGenerator on the unitTestHelper descriptors', () => {
  it('vertex: attribute locations in order, gl_Position as the position builtin, flipped in y', () => {
    const { code, gen } = generate(unitTestDescs().vertDesc)
    expect(code).toContain('@location(0) position: vec4<f32>,')
    expect(code).toContain('@location(1) uvIn: vec2<f32>,')
    expect(code).toContain('@builtin(position) gl_Position: vec4<f32>,')
    expect(code).toContain('@location(0) uvOut: vec2<f32>,')
    expect(code).toContain('@vertex\nfn vertexEntryPoint(vsInput: WGSLVsInputs) -> WGSLVsOutputs {')
    expect(code).toMatch(/-vec4<f32>\(gl_Position\)\.y/)
    expect(gen.getEntryPointFunctionName()).toBe('vertexEntryPoint')
    expect(gen.getBindGroupLayoutInfo()).toEqual([])
  })
  it('fragment: the color role is location 0 (hgiMetal/shaderGenerator.mm:731-748)', () => {
    const { code } = generate(unitTestDescs().fragDesc)
    expect(code).toContain('diagnostic(off, derivative_uniformity);')
    expect(code).toContain('@location(0) uvOut: vec2<f32>,')
    expect(code).toContain('@location(0) hd_FragColor: vec4<f32>,')
    expect(code).toContain('fn fragmentEntryPoint(fsInput: WGSLFsInputs) -> WGSLFsOutputs {')
  })
  it('the bodies reach the translator with the generated globals', () => {
    let seen: HgiWebGPUShaderBodyTranslatorInput | null = null
    const translator: HgiWebGPUShaderBodyTranslator = {
      Translate(input) { seen = input; return { declarations: '', code: 'fn main() {}\n', errors: '' } },
    }
    generate(unitTestDescs().vertDesc, { getShaderBodyTranslator: () => translator, isFloat32Filterable: () => true })
    expect(seen!.code).toBe(glslfx_vertShaderStr)
    expect(seen!.globals.map(g => [g.name, g.wgslType, g.kind])).toEqual([
      ['position', 'vec4<f32>', 'stageInput'], ['uvIn', 'vec2<f32>', 'stageInput'],
      ['gl_Position', 'vec4<f32>', 'stageOutput'], ['uvOut', 'vec2<f32>', 'stageOutput'],
    ])
  })
  it('translation errors become generator errors', () => {
    const translator: HgiWebGPUShaderBodyTranslator = {
      Translate: () => ({ declarations: '', code: '', errors: 'not translated' }),
    }
    const { gen } = generate(unitTestDescs().fragDesc, { getShaderBodyTranslator: () => translator, isFloat32Filterable: () => true })
    expect(gen.getGeneratorErrors()).toBe('not translated')
  })
})

describe('resources and bindings', () => {
  it('buffers, textures, samplers and constants go to groups 0-3 at their bind indices', () => {
    const d = new HgiShaderFunctionDesc()
    d.shaderStage = HgiShaderStageBits.HgiShaderStageFragment
    HgiShaderFunctionAddBuffer(d, 'material', 'vec4', 2, HgiBindingType.HgiBindingTypeUniformValue)
    HgiShaderFunctionAddBuffer(d, 'points', 'vec3', 1, HgiBindingType.HgiBindingTypePointer)
    HgiShaderFunctionAddTexture(d, 'diffuse', 0, 2, HgiFormat.HgiFormatUNorm8Vec4)
    HgiShaderFunctionAddTexture(d, 'shadow', 3, 2, HgiFormat.HgiFormatFloat32,
      HgiShaderTextureType.HgiShaderTextureTypeShadowTexture)
    HgiShaderFunctionAddConstantParam(d, 'tint', 'vec4')
    d.shaderCode = 'fn main() {}\n'
    const { gen, code } = generate(d)
    const groups = Object.fromEntries(gen.getBindGroupLayoutInfo().map(i => [i.group,
      i.entries.map(e => [e.binding, e.buffer?.type ?? e.texture?.sampleType ?? e.sampler?.type])]))
    expect(groups).toEqual({
      3: [[0, 'uniform']],
      0: [[2, 'uniform'], [1, 'read-only-storage']],
      // 256 + bind index: the footprint texture and sampler of the 2D float
      // texture's clamp-to-border emulation; 128: its sampler state
      // (samplerState.ts).
      1: [[0, 'float'], [256, 'float'], [3, 'depth']],
      2: [[0, 'filtering'], [256, 'filtering'], [3, 'comparison'], [128, 'uniform']],
    })
    expect(code).toContain('@group(2) @binding(128) var<uniform> hgiWebGPUSamplerState: array<HgiWebGPUSamplerState, 1>;')
    // The share of the footprint outside the texture is the repeat-addressed
    // sample of the footprint texture with the same coordinate (and so the
    // same derivatives).
    expect(code).toContain('@group(1) @binding(256) var hgiWebGPUFootprint_diffuse: texture_2d<f32>;')
    expect(code).toContain('@group(2) @binding(256) var hgiWebGPUFootprintSampler_diffuse: sampler;')
    expect(code).toContain('return hgiWebGPUBorderMix_diffuse(textureSample(textureBind_diffuse, samplerBind_diffuse, uv), uv, ' +
      'textureSample(hgiWebGPUFootprint_diffuse, hgiWebGPUFootprintSampler_diffuse, uv), ' +
      'log2(max(max(length(dpdx(uv * vec2<f32>(textureDimensions(textureBind_diffuse, 0).xy))), ' +
      'length(dpdy(uv * vec2<f32>(textureDimensions(textureBind_diffuse, 0).xy)))), 1e-8)));')
    // A single-level texture takes the analytic weight, exact there: a
    // footprint level one texel across marks its only texel as outside on
    // both sides, so a 1x1 texture would read the border colour everywhere
    // (ASWF ColorSpaceTests usduvtexture_color_test).
    expect(code).toContain('fn hgiWebGPUBorderMix_diffuse(s: vec4<f32>, c: vec2<f32>, q: vec4<f32>, lod: f32) -> vec4<f32> {\n' +
      '  if (textureNumLevels(textureBind_diffuse) == 1u) { return hgiWebGPUBorder_diffuse(s, c, lod); }\n')
    expect(code).toContain('fn hgiWebGPUBorder_diffuse(s: vec4<f32>, c: vec2<f32>, lod: f32) -> vec4<f32> {')
    expect(code).toContain('  let wu = select(q.y, q.x, c.x < 0.5) * st.clampToBorder.x;\n' +
      '  let wv = select(q.w, q.z, c.y < 0.5) * st.clampToBorder.y;\n' +
      '  return mix(s, st.borderColor, 1.0 - (1.0 - wu) * (1.0 - wv));\n')
    expect(code).toContain('@group(0) @binding(2) var<uniform> material: vec4<f32>;')
    expect(code).toContain('@group(0) @binding(1) var<storage, read> points: array<vec3<f32>>;')
    expect(code).toContain('@group(1) @binding(0) var textureBind_diffuse: texture_2d<f32>;')
    expect(code).toContain('@group(2) @binding(3) var samplerBind_shadow: sampler_comparison;')
    expect(code).toContain('@group(3) @binding(0) var<uniform> fsUniforms: ParamBuffer;')
    // The accessor names of hgiVulkan/shaderSection.cpp:319-435; no texel
    // fetch for shadow textures.
    for (const fn of ['HgiGet_diffuse', 'HgiGetSize_diffuse', 'HgiTextureLod_diffuse',
      'HgiTexelFetch_diffuse', 'HgiGet_shadow']) {
      expect(code).toContain(`fn ${fn}(`)
    }
    expect(code).not.toContain('fn HgiTexelFetch_shadow(')
  })
  it('HgiTexelFetch_ reads as hgiMetal: ushort coordinates, zero outside the texture (hgiMetal/shaderSection.mm:536-569)', () => {
    // The UDIM accessor's layout fetch (hdSt/codeGen.cpp:4400-4406) reads a
    // 1D texture at a tile index that is negative below v = 0.
    const d = new HgiShaderFunctionDesc()
    d.shaderStage = HgiShaderStageBits.HgiShaderStageFragment
    HgiShaderFunctionAddTexture(d, 'udimLayout', 0, 1, HgiFormat.HgiFormatFloat32)
    HgiShaderFunctionAddTexture(d, 'udim', 1, 2, HgiFormat.HgiFormatUNorm8Vec4,
      HgiShaderTextureType.HgiShaderTextureTypeArrayTexture)
    d.shaderCode = 'fn main() {}\n'
    const { code } = generate(d)
    expect(code).toContain('fn HgiTexelFetch_udimLayout(uv: i32) -> vec4<f32> {\n' +
      '  let c = (u32(uv) & 0xffffu);\n  let size = textureDimensions(textureBind_udimLayout, 0);\n' +
      '  if (c >= size) { return vec4<f32>(); }\n' +
      '  return textureLoad(textureBind_udimLayout, c, 0);\n}\n')
    expect(code).toContain('fn HgiTexelFetch_udim(uv: vec3<i32>) -> vec4<f32> {\n' +
      '  let c = (vec3<u32>(uv) & vec3<u32>(0xffffu));\n' +
      '  let size = vec3<u32>(textureDimensions(textureBind_udim, 0).xy, textureNumLayers(textureBind_udim));\n' +
      '  if (any(c >= size)) { return vec4<f32>(); }\n' +
      '  return textureLoad(textureBind_udim, c.xy, c.z, 0);\n}\n')
  })
  it('a compute function uses its local size and writable storage (hgiVulkan/shaderGenerator.cpp:57-73)', () => {
    const d = new HgiShaderFunctionDesc()
    d.shaderStage = HgiShaderStageBits.HgiShaderStageCompute
    d.computeDescriptor.localSize = new GfVec3i(64, 1, 1)
    HgiShaderFunctionAddWritableBuffer(d, 'out', 'float', 0)
    HgiShaderFunctionAddStageInput(d, 'gid', 'uvec3', 'hdGlobalInvocationID')
    d.shaderCode = 'fn main() {}\n'
    const { code } = generate(d)
    expect(code).toContain('@compute @workgroup_size(64, 1, 1)\nfn computeEntryPoint(csInput: WGSLCsInputs) {')
    expect(code).toContain('@builtin(global_invocation_id) gid: vec3<u32>,')
    expect(code).toContain('var<storage, read_write> out: array<f32>;')
  })
  it('reports keywords WebGPU lacks', () => {
    const d = new HgiShaderFunctionDesc()
    d.shaderStage = HgiShaderStageBits.HgiShaderStageFragment
    HgiShaderFunctionAddStageInput(d, 'layer', 'uint', 'hdLayer')
    d.shaderCode = 'fn main() {}\n'
    expect(errorsDuring(() => generate(d)))
      .toEqual(["HgiWebGPU: shader keyword hdLayer ('layer') is not available in WebGPU"])
  })
  it('reads gl_PointCoord from the emulated point square (HgiWebGPUPostTessVertexShaderSection)', () => {
    const d = new HgiShaderFunctionDesc()
    d.shaderStage = HgiShaderStageBits.HgiShaderStageFragment
    HgiShaderFunctionAddStageInput(d, 'gl_PointCoord', 'vec2', 'hdPointCoord')
    d.shaderCode = 'fn main() {}\n'
    const { code } = generate(d)
    expect(code).toContain('@location(15) gl_PointCoord: vec2<f32>,')
  })
  it('binds a writable buffer read-only in a vertex function (WebGPU has no read_write storage there)', () => {
    // Storm declares culledInstanceIndices writable for the vertex stages
    // (hdSt/resourceBinder.cpp:624-639, codeGen.cpp:5151-5157).
    for (const [stage, access, type] of [
      [HgiShaderStageBits.HgiShaderStageVertex, 'read', 'read-only-storage'],
      [HgiShaderStageBits.HgiShaderStagePostTessellationVertex, 'read', 'read-only-storage'],
      [HgiShaderStageBits.HgiShaderStageFragment, 'read_write', 'storage'],
    ] as const) {
      const d = new HgiShaderFunctionDesc()
      d.shaderStage = stage
      HgiShaderFunctionAddWritableBuffer(d, 'culledInstanceIndices', 'int', 4)
      d.shaderCode = 'fn main() {}\n'
      const { gen, code } = generate(d)
      expect(code).toContain(`@group(0) @binding(4) var<storage, ${access}> culledInstanceIndices: array<i32>;`)
      const entry = gen.getBindGroupLayoutInfo().find(i => i.group === 0)!.entries.find(e => e.binding === 4)!
      expect(entry.buffer?.type).toBe(type)
    }
  })
  it('writes a cubemap through a 2d-array storage texture, the face as the layer', () => {
    // HdSt_DomeLightComputationGPU's outTexture (hdSt/domeLightComputations.cpp:214-218).
    const d = new HgiShaderFunctionDesc()
    d.shaderStage = HgiShaderStageBits.HgiShaderStageCompute
    d.computeDescriptor.localSize = new GfVec3i(8, 8, 1)
    HgiShaderFunctionAddWritableTexture(d, 'outTexture', 1, 2, HgiFormat.HgiFormatFloat16Vec4,
      HgiShaderTextureType.HgiShaderTextureTypeCubemapTexture)
    d.shaderCode = 'fn main() {}\n'
    const { gen, code } = generate(d)
    expect(code).toContain('@group(1) @binding(1) var textureBind_outTexture: texture_storage_2d_array<rgba16float, write>;')
    expect(code).toContain('fn HgiSet_outTexture(uv: vec3<i32>, data: vec4<f32>) {\n  textureStore(textureBind_outTexture, uv.xy, uv.z, data);')
    // A storage texture's size takes no level.
    expect(code).toContain('return vec2<i32>(textureDimensions(textureBind_outTexture));')
    const entry = gen.getBindGroupLayoutInfo().find(i => i.group === 1)!.entries[0]!
    expect(entry.storageTexture?.viewDimension).toBe('2d-array')
  })
  it('emulates clamp-to-border sampling for float textures only (samplerState.ts)', () => {
    const d = new HgiShaderFunctionDesc()
    d.shaderStage = HgiShaderStageBits.HgiShaderStageVertex
    HgiShaderFunctionAddTexture(d, 'color', 2, 2, HgiFormat.HgiFormatUNorm8Vec4)
    HgiShaderFunctionAddTexture(d, 'env', 5, 2, HgiFormat.HgiFormatFloat16Vec4,
      HgiShaderTextureType.HgiShaderTextureTypeCubemapTexture)
    HgiShaderFunctionAddTexture(d, 'ids', 7, 2, HgiFormat.HgiFormatInt32)
    d.shaderCode = 'fn main() {}\n'
    HgiShaderFunctionAddTexture(d, 'field', 9, 3, HgiFormat.HgiFormatFloat32)
    const { code } = generate(d)
    // Outside the fragment stage the level is 0; the explicit-lod accessor
    // passes its lod, to the footprint sample too.
    expect(code).toContain('return hgiWebGPUBorderMix_color(textureSampleLevel(textureBind_color, samplerBind_color, uv, 0.0), uv, ' +
      'textureSampleLevel(hgiWebGPUFootprint_color, hgiWebGPUFootprintSampler_color, uv, 0.0), 0.0);')
    expect(code).toContain('return hgiWebGPUBorderMix_color(textureSampleLevel(textureBind_color, samplerBind_color, uv, lod), uv, ' +
      'textureSampleLevel(hgiWebGPUFootprint_color, hgiWebGPUFootprintSampler_color, uv, lod), lod);')
    expect(code).toContain('let st = hgiWebGPUSamplerState[2];')
    // A 3D texture (Storm's volume fields) keeps the analytic weight.
    expect(code).toContain('return hgiWebGPUBorder_field(textureSampleLevel(textureBind_field, samplerBind_field, uv, 0.0), uv, 0.0);')
    // The level is clamped to the view's levels, as the sampler clamps the
    // level it samples, and the weight is at the filter's sub-texel
    // precision (8 bits).
    expect(code).toContain('let level = floor(clamp(lod, 0.0, f32(textureNumLevels(textureBind_field)) - 1.0));')
    expect(code).toContain('let x = floor(c * n * 256.0 + 0.5) / 256.0 - 0.5;')
    expect(code).toContain('var<uniform> hgiWebGPUSamplerState: array<HgiWebGPUSamplerState, 10>;')
    expect(code).not.toContain('hgiWebGPUFootprint_field')
    expect(code).not.toContain('hgiWebGPUBorder_env')
    expect(code).not.toContain('hgiWebGPUBorder_ids')
  })
  it('binds an array of textures as one binding per element with index-taking accessors', () => {
    // Storm's shadowCompareTextures (hdSt/codeGen.cpp:1126-1134 with
    // simpleLightingShader.cpp:245-258); the accessor signatures of
    // hgiVulkan/shaderSection.cpp:379-433 (`uint index` first).
    const d = new HgiShaderFunctionDesc()
    d.shaderStage = HgiShaderStageBits.HgiShaderStageFragment
    HgiShaderFunctionAddArrayOfTextures(d, 'shadowCompareTextures', 3, 4, 2, HgiFormat.HgiFormatFloat32Vec4,
      HgiShaderTextureType.HgiShaderTextureTypeShadowTexture)
    HgiShaderFunctionAddTexture(d, 'diffuse', 7, 2, HgiFormat.HgiFormatUNorm8Vec4)
    d.shaderCode = 'fn main() {}\n'
    const { gen, code } = generate(d)
    expect(gen.getGeneratorErrors()).toBe('')
    const groups = Object.fromEntries(gen.getBindGroupLayoutInfo().map(i => [i.group,
      i.entries.map(e => [e.binding, e.texture?.sampleType ?? e.sampler?.type ?? e.buffer?.type])]))
    expect(groups[1]).toEqual([[4, 'depth'], [5, 'depth'], [6, 'depth'], [7, 'float'], [263, 'float']])
    expect(groups[2]).toEqual([[4, 'comparison'], [5, 'comparison'], [6, 'comparison'], [7, 'filtering'], [263, 'filtering'], [128, 'uniform']])
    expect(code).toContain('@group(1) @binding(5) var textureBind_shadowCompareTextures_hgiElement1: texture_depth_2d;')
    expect(code).toContain('@group(2) @binding(6) var samplerBind_shadowCompareTextures_hgiElement2: sampler_comparison;')
    expect(code).toContain(
      'fn HgiGet_shadowCompareTextures(index: u32, uv: vec3<f32>) -> f32 {\n' +
      '  var result: f32;\n  switch index {\n' +
      '    case 0u: { result = HgiGet_shadowCompareTextures_hgiElement0(uv); }\n' +
      '    case 1u: { result = HgiGet_shadowCompareTextures_hgiElement1(uv); }\n' +
      '    case 2u: { result = HgiGet_shadowCompareTextures_hgiElement2(uv); }\n' +
      '    default: {}\n  }\n  return result;\n}\n')
    expect(code).toContain('fn HgiGetSize_shadowCompareTextures(index: u32) -> vec2<i32> {')
    expect(code).toContain('fn HgiTextureLod_shadowCompareTextures(index: u32, uv: vec3<f32>, lod: f32) -> f32 {')
    expect(code).not.toContain('fn HgiTexelFetch_shadowCompareTextures(')
    expect(code).toContain('var<uniform> hgiWebGPUSamplerState: array<HgiWebGPUSamplerState, 8>;')
  })
  it('merges a binding declared by two stages once, visible to both (descriptorSetLayouts.cpp:73-123)', () => {
    const merged = HgiWebGPUMergeBindGroupLayoutInfos([
      [{ group: 0, entries: [{ binding: 1, visibility: 1, buffer: { type: 'uniform' } }] }],
      [{ group: 0, entries: [{ binding: 1, visibility: 2, buffer: { type: 'uniform' } },
        { binding: 0, visibility: 2, buffer: { type: 'uniform' } }] }],
    ])
    expect(merged[0]!.map(e => [e.binding, e.visibility])).toEqual([[0, 2], [1, 3]])
    expect(merged.length).toBe(4)
  })
})

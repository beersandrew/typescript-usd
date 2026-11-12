// Ported from OpenUSD 26.11.1: pxr/imaging/hgiMetal/conversions.mm,
//  pxr/imaging/hgiMetal/sampler.mm, pxr/imaging/hgiVulkan/conversions.cpp,
//  pxr/imaging/hgiVulkan/sampler.cpp
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Clamp-to-border sampling for HgiWebGPU. No upstream file: hgiMetal maps
// HgiSamplerAddressModeClampToBorderColor to
// MTLSamplerAddressModeClampToBorderColor and HgiSamplerDesc::borderColor to
// MTLSamplerBorderColor (hgiMetal/conversions.mm:353-363, 384-392;
// hgiMetal/sampler.mm:23-34), hgiVulkan to VK_SAMPLER_ADDRESS_MODE_CLAMP_TO_BORDER
// (hgiVulkan/conversions.cpp:274, 296-300; hgiVulkan/sampler.cpp:44-45).
// WebGPU samplers have no border addressing (GPUAddressMode is clamp-to-edge,
// repeat or mirror-repeat), so the sampler is created clamped to the edge
// (HgiWebGPUConversions.GetSamplerAddressMode) and the texture accessors
// (HgiGet_<name>, HgiTextureLod_<name>) blend the border colour back in:
//
// With bilinear filtering, a coordinate within half a texel of the edge (or
// beyond it) takes some of its taps from outside the texture. Clamped to the
// edge, those taps read the edge texel; with a border they read the border
// colour. Along one axis with the level's size n, x = u * n - 0.5 puts the
// taps at floor(x) and floor(x) + 1, and the outside weight is
//   f = clamp(-x, 0, 1) + clamp(x - (n - 1), 0, 1);
// the clamped sample s (whose outside taps all read the edge texels next to
// the inside taps) then gives the border-addressed result exactly as
//   mix(border, s, (1 - f_u) * (1 - f_v) [* (1 - f_w)]).
// The hardware weights the taps at its sub-texel precision, so x is rounded
// to 1/256 of a texel first (8 bits: Vulkan's usual subTexelPrecisionBits;
// on Apple GPUs under Metal this reproduces the native border-addressed
// samples exactly: testUsdImagingGLVdbVolume_TargetMemory, whose field
// texture is a few texels wide, went from 2 px over tolerance (max 3) to
// identical to the reference build in Safari). A device of another
// precision differs from its own native filtering by under 1/256 of a texel.
// With nearest filtering f is 1 outside [0, 1) and 0 inside.
//
// That analytic weight is exact for one bilinear footprint: at level 0, or
// whenever the coordinates do not vary across the pixel. Under a mip filter
// and anisotropic filtering the hardware blends taps from two levels and
// several probes whose pattern is the GPU's own (Apple's is not documented;
// isotropic, trilinear and anisotropic-probe models of it were each further
// from the reference build than the floor-level weight, Nov 7, 2026). So
// for 2D textures the weight is measured instead of modelled: the same
// sampler, repeat-addressed (HgiWebGPUSampler.GetBorderFootprintSamplerId),
// samples a footprint texture of the same size and levels
// (HgiWebGPUAcquireBorderFootprint) whose channels mark the quarter of the
// texels a tap from beyond each edge wraps to. Its filtered value is the
// share of the hardware's own footprint (levels, probes, weights and their
// sub-texel precision) that lies outside the texture, and the border colour
// is blended in by it (hgiWebGPUBorderMix_<name>). Remaining approximations,
// PLATFORM-DIVERGENCE(hgiwebgpu-border-mip): (1) the colour: the clamped
// sample's outside taps read the edge texels, so the result is
// mix(s, border, w) rather than s - (their weighted edge texels) + w * border;
// the two differ where the texels along the edge differ from the sample
// (none of the ASWF TextureFileFormatTests cards or the usdImagingGL images
// show it); (2) the two axes' shares are combined as for one bilinear
// footprint, 1 - (1 - w_u)(1 - w_v), which differs near the corners under
// trilinear or anisotropic filtering; (3) once a level is so small (under
// about four texels across) or the footprint so long that a tap inside the
// texture reaches the marked quarter, the share counts it as outside. 1D, 3D
// and array textures keep the analytic weight at the floor of the
// isotropic level of detail (Storm's border-addressed ones, the volume
// fields, have one level, where it is exact).
//
// A single-level 2D texture takes the analytic weight too
// (hgiWebGPUBorderMix_<name> selects it at run time by textureNumLevels):
// it is exact there, and a footprint one texel across marks its only texel
// on both sides, so a 1x1 texture read the border colour everywhere (ASWF
// ColorSpaceTests usduvtexture_color_test, all 25 cards black, Nov 11, 2026).

// The sampler's state reaches the shader through one uniform buffer per
// HgiWebGPUResourceBindings, an array of HgiWebGPUSamplerState indexed by
// the texture's bind index, bound in the sampler bind group at
// HgiWebGPUSamplerStateBinding. Cubemap, shadow and integer textures are not
// affected (cubemap sampling ignores address modes; Storm's shadow and
// integer textures do not use border addressing).

import {
  HgiBorderColor,
  type HgiComponentMapping,
  HgiComponentSwizzle,
  HgiSamplerAddressMode,
  type HgiSamplerDesc,
  HgiSamplerFilter,
} from 'typescript-usd/hgi'

/** Binding of the sampler-state uniform buffer in the sampler bind group
 *  (texture bind indices stay below it). */
export const HgiWebGPUSamplerStateBinding = 128

/** Floats per HgiWebGPUSamplerState (three vec4<f32>: 48 bytes, a valid
 *  uniform array stride). */
export const HgiWebGPUSamplerStateFloats = 12

/** WGSL name of the sampler-state array. */
export const HgiWebGPUSamplerStateName = 'hgiWebGPUSamplerState'

/** The packed state of one sampler, as the texture bound with it samples
 *  it: border colour, which axes clamp to the border, and whether the min
 *  and mag filters are linear. */
export function HgiWebGPUSamplerStateData(desc: HgiSamplerDesc,
  mapping?: HgiComponentMapping): Float32Array {
  const out = new Float32Array(HgiWebGPUSamplerStateFloats)
  // MTLSamplerBorderColor (hgiMetal/conversions.mm:384-392):
  // transparent black (0,0,0,0), opaque black (0,0,0,1), opaque white (1,1,1,1).
  let color: number[]
  switch (desc.borderColor) {
    case HgiBorderColor.HgiBorderColorOpaqueBlack: color = [0, 0, 0, 1]; break
    case HgiBorderColor.HgiBorderColorOpaqueWhite: color = [1, 1, 1, 1]; break
    default: color = [0, 0, 0, 0]
  }
  // Metal applies the texture's swizzle (hgiMetal/texture.mm:57-70) to what
  // the sampler returns, border texels included: a grey texture mapped
  // (R, R, R, One) (hdSt/assetUvTextureCpuData.cpp:146-153) reads alpha 1 at
  // the border too. The texels here are expanded through the mapping at
  // upload (texture.ts), so the border colour is mapped the same way.
  if (mapping) {
    const swizzle = (sw: HgiComponentSwizzle, c: number): number =>
      sw === HgiComponentSwizzle.HgiComponentSwizzleZero ? 0 :
        sw === HgiComponentSwizzle.HgiComponentSwizzleOne ? 1 :
          sw >= HgiComponentSwizzle.HgiComponentSwizzleR && sw <= HgiComponentSwizzle.HgiComponentSwizzleA
            ? color[sw - HgiComponentSwizzle.HgiComponentSwizzleR]! : color[c]!
    color = [swizzle(mapping.r, 0), swizzle(mapping.g, 1), swizzle(mapping.b, 2), swizzle(mapping.a, 3)]
  }
  out.set(color, 0)
  const border = (m: HgiSamplerAddressMode) =>
    m === HgiSamplerAddressMode.HgiSamplerAddressModeClampToBorderColor ? 1 : 0
  out.set([border(desc.addressModeU), border(desc.addressModeV), border(desc.addressModeW), 0], 4)
  const linear = (f: HgiSamplerFilter) => f === HgiSamplerFilter.HgiSamplerFilterLinear ? 1 : 0
  out.set([linear(desc.minFilter), linear(desc.magFilter), 0, 0], 8)
  return out
}

/** Sub-texel positions per texel of linear filtering (8 fractional bits). */
export const HgiWebGPUSubTexelSteps = 256

/** Whether a sampler needs the emulation (any axis clamps to the border). */
export function HgiWebGPUSamplerUsesBorder(desc: HgiSamplerDesc): boolean {
  const b = HgiSamplerAddressMode.HgiSamplerAddressModeClampToBorderColor
  return desc.addressModeU === b || desc.addressModeV === b || desc.addressModeW === b
}

/** The struct and the uniform array a shader function declares when one of
 *  its textures is border-emulated; `count` covers its highest bind index. */
export function HgiWebGPUSamplerStateStruct(): string {
  return 'struct HgiWebGPUSamplerState {\n' +
    '  borderColor: vec4<f32>,\n  clampToBorder: vec4<f32>,\n  linearFilter: vec4<f32>,\n};\n'
}

export function HgiWebGPUSamplerStateDeclaration(group: number, count: number): string {
  return `@group(${group}) @binding(${HgiWebGPUSamplerStateBinding}) var<uniform> ` +
    `${HgiWebGPUSamplerStateName}: array<HgiWebGPUSamplerState, ${count}>;\n`
}

/**
 * The WGSL function `hgiWebGPUBorder_<name>(s, c, lod)` that blends the
 * border colour into the clamped sample `s` at coordinate `c` (the `dims`
 * spatial coordinates), and the expression of the level a call samples.
 */
export function HgiWebGPUBorderFunction(name: string, tex: string, bindIndex: number, dims: number): string {
  const v = dims === 1 ? 'f32' : `vec${dims}<f32>`
  const splat = (x: string) => (dims === 1 ? x : `${v}(${x})`)
  const size0 = dims === 1
    ? `f32(textureDimensions(${tex}, 0))`
    : `${v}(textureDimensions(${tex}, 0).${'xyz'.slice(0, dims)})`
  const flags = dims === 1 ? 'st.clampToBorder.x' : `st.clampToBorder.${'xyz'.slice(0, dims)}`
  const outside = dims === 1 ? '(c < 0.0) || (c >= 1.0)'
    : `(c < ${splat('0.0')}) | (c >= ${splat('1.0')})`
  const inside = dims === 1 ? '(1.0 - f)'
    : Array.from({ length: dims }, (_, i) => `(1.0 - f.${'xyz'[i]})`).join(' * ')
  return `fn hgiWebGPUBorder_${name}(s: vec4<f32>, c: ${v}, lod: f32) -> vec4<f32> {\n` +
    `  let st = ${HgiWebGPUSamplerStateName}[${bindIndex}];\n` +
    `  if (all(st.clampToBorder.xyz == vec3<f32>(0.0))) { return s; }\n` +
    // The level is clamped to the view's levels, as the sampler's is
    // (a single-level texture, e.g. Storm's field textures, samples level 0
    // whatever the derivatives say).
    `  let level = floor(clamp(lod, 0.0, f32(textureNumLevels(${tex})) - 1.0));\n` +
    `  let linear = select(st.linearFilter.y, st.linearFilter.x, lod > 0.0) > 0.5;\n` +
    `  let n = max(floor(${size0} * exp2(-level)), ${splat('1.0')});\n` +
    // The texel coordinate at the filter's sub-texel precision: the
    // hardware rounds it to 8 fractional bits before it weights the taps
    // (Vulkan's subTexelPrecisionBits; Apple GPUs under Metal, measured:
    // see the header), so the border's weight is quantized as the inside
    // taps' are.
    `  let x = floor(c * n * ${HgiWebGPUSubTexelSteps}.0 + 0.5) / ${HgiWebGPUSubTexelSteps}.0 - 0.5;\n` +
    `  let fLinear = clamp(-x, ${splat('0.0')}, ${splat('1.0')}) + clamp(x - (n - 1.0), ${splat('0.0')}, ${splat('1.0')});\n` +
    `  let fNearest = select(${splat('0.0')}, ${splat('1.0')}, ${outside});\n` +
    `  let f = min(select(fNearest, fLinear, linear), ${splat('1.0')}) * ${flags};\n` +
    `  return mix(st.borderColor, s, ${inside});\n}\n`
}

/** The level an implicit-derivative fragment sample uses
 *  (log2 of the larger screen-space footprint, in level-0 texels). */
export function HgiWebGPUImplicitLodExpression(tex: string, coord: string, dims: number): string {
  const size0 = dims === 1
    ? `f32(textureDimensions(${tex}, 0))`
    : `vec${dims}<f32>(textureDimensions(${tex}, 0).${'xyz'.slice(0, dims)})`
  const len = (d: string) => (dims === 1 ? `abs(${d}(${coord} * ${size0}))` : `length(${d}(${coord} * ${size0}))`)
  return `log2(max(max(${len('dpdx')}, ${len('dpdy')}), 1e-8))`
}

/** The WGSL declarations of a 2D texture's footprint texture and sampler,
 *  and `hgiWebGPUBorderMix_<name>(s, c, q, lod)`, which blends the border
 *  colour into the clamped sample `s` at `c` by the share `q` of the
 *  footprint the same sampler, repeat-addressed, takes from outside the
 *  texture. A single-level texture takes the analytic weight instead
 *  (`hgiWebGPUBorder_<name>`, HgiWebGPUBorderFunction, which must be
 *  declared too): it is exact there, while a footprint level one texel
 *  across marks its only texel as outside on both sides, so a 1x1 texture
 *  would read the border colour everywhere. `lod` is the level the call
 *  samples, computed by the caller (derivatives need uniform control flow). */
export function HgiWebGPUBorderFootprintFunction(name: string, tex: string, bindIndex: number): string {
  const b = HgiWebGPUBorderFootprintBinding + bindIndex
  return `@group(1) @binding(${b}) var hgiWebGPUFootprint_${name}: texture_2d<f32>;\n` +
    `@group(2) @binding(${b}) var hgiWebGPUFootprintSampler_${name}: sampler;\n` +
    `fn hgiWebGPUBorderMix_${name}(s: vec4<f32>, c: vec2<f32>, q: vec4<f32>, lod: f32) -> vec4<f32> {\n` +
    `  if (textureNumLevels(${tex}) == 1u) { return hgiWebGPUBorder_${name}(s, c, lod); }\n` +
    `  let st = ${HgiWebGPUSamplerStateName}[${bindIndex}];\n` +
    `  let wu = select(q.y, q.x, c.x < 0.5) * st.clampToBorder.x;\n` +
    `  let wv = select(q.w, q.z, c.y < 0.5) * st.clampToBorder.y;\n` +
    `  return mix(s, st.borderColor, 1.0 - (1.0 - wu) * (1.0 - wv));\n}\n`
}

/** Bindings of a border-emulated 2D texture's footprint texture (texture
 *  group) and footprint sampler (sampler group): this plus the bind index. */
export const HgiWebGPUBorderFootprintBinding = 256

interface _Footprint { texture: GPUTexture, view: GPUTextureView, holders: number }
const _footprints = new WeakMap<GPUDevice, Map<string, _Footprint>>()

/**
 * The footprint texture of a 2D texture of `width` x `height` with
 * `levels` levels: the same size and levels, each level marking the texels
 * a repeat-addressed tap from outside the texture wraps to: R the last
 * quarter of the columns (taps left of u = 0), G the first quarter (right of
 * u = 1), B and A the same for the rows. Shared by every texture of that size:
 * each HgiWebGPUTexture sampled with border addressing holds one reference
 * (HgiWebGPUTexture.getBorderFootprintView) and releases it when it is
 * destroyed; the footprint texture is destroyed with its last reference.
 * The one-texel footprint of samplers without border addressing is kept
 * for the device's lifetime (`permanent`).
 */
export function HgiWebGPUAcquireBorderFootprint(device: GPUDevice, width: number, height: number,
  levels: number, permanent = false): { view: GPUTextureView, release(): void } {
  let footprints = _footprints.get(device)
  if (!footprints) _footprints.set(device, footprints = new Map())
  const key = `${width}x${height}x${levels}`
  let footprint = footprints.get(key)
  if (!footprint) {
    footprint = _createFootprint(device, key, width, height, levels)
    footprints.set(key, footprint)
  }
  const entry = footprint
  if (permanent) {
    entry.holders = Infinity
    return { view: entry.view, release() {} }
  }
  entry.holders++
  let released = false
  return {
    view: entry.view,
    release() {
      if (released) return
      released = true
      if (--entry.holders === 0 && footprints.get(key) === entry) {
        footprints.delete(key)
        entry.texture.destroy()
      }
    },
  }
}

function _createFootprint(device: GPUDevice, key: string, width: number, height: number,
  levels: number): _Footprint {
  const texture = device.createTexture({
    label: `HgiWebGPU border footprint ${key}`,
    size: { width, height },
    format: 'rgba8unorm',
    mipLevelCount: levels,
    usage: 0x02 | 0x04, // COPY_DST | TEXTURE_BINDING
  })
  for (let level = 0; level < levels; level++) {
    const n = Math.max(width >> level, 1), m = Math.max(height >> level, 1)
    const qn = Math.max(1, Math.floor(n / 4)), qm = Math.max(1, Math.floor(m / 4))
    const data = new Uint8Array(n * m * 4)
    for (let j = 0; j < m; j++) {
      for (let i = 0; i < n; i++) {
        const o = (j * n + i) * 4
        data[o] = i >= n - qn ? 255 : 0
        data[o + 1] = i < qn ? 255 : 0
        data[o + 2] = j >= m - qm ? 255 : 0
        data[o + 3] = j < qm ? 255 : 0
      }
    }
    device.queue.writeTexture({ texture, mipLevel: level }, data, { bytesPerRow: n * 4 },
      { width: n, height: m })
  }
  const view = texture.createView({ label: `HgiWebGPU border footprint ${key}` })
  return { texture, view, holders: 0 }
}

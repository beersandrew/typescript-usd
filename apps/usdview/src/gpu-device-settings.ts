// Ported from OpenUSD 26.11.1: pxr/imaging/hgiMetal/capabilities.mm
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

/** The device Storm's WebGPU backend needs: the optional features and raised
 * limits HgiWebGPU.Create requests (packages/usd/pxr/imaging/hgiWebGPU/src/
 * hgi.ts:75-106,145-168), asked of the adapter here because the viewer creates
 * its device (and canvas) before the imaging chunk loads. Native Hgi likewise
 * uses the hardware's capabilities (OpenUSD 26.11.1 hgiMetal/capabilities.mm:
 * 112-121). Only features and limits the adapter reports are requested.
 */
// depth32float-stencil8: HdxPickTask's depthStencil AOV (HgiFormatFloat32UInt8);
// clip-distances: gl_ClipDistance (HgiWebGPU _optionalFeatures, hgi.ts:76-91).
const optionalFeatures = ['float32-filterable','depth-clip-control','texture-compression-bc','rg11b10ufloat-renderable','depth32float-stencil8','primitive-index','clip-distances'] as GPUFeatureName[]
const raisedLimits = ['maxBufferSize','maxStorageBufferBindingSize','maxStorageBuffersPerShaderStage','maxSampledTexturesPerShaderStage','maxSamplersPerShaderStage','maxUniformBufferBindingSize','maxInterStageShaderVariables',
 'maxStorageBuffersInVertexStage','maxStorageBuffersInFragmentStage','maxStorageTexturesInVertexStage','maxStorageTexturesInFragmentStage'] as const
export function viewerDeviceDescriptor(adapter:Pick<GPUAdapter,'features'|'limits'>):GPUDeviceDescriptor{
 const requiredFeatures=optionalFeatures.filter(feature=>adapter.features?.has(feature))
 const limits=(adapter.limits??{}) as unknown as Record<string,unknown>
 const requiredLimits:Record<string,number>={}
 // Never invent a capacity: only reported, valid values are requested.
 for(const name of raisedLimits){const value=limits[name];if(typeof value==='number'&&Number.isSafeInteger(value)&&value>0)requiredLimits[name]=value}
 return Object.keys(requiredLimits).length?{requiredFeatures,requiredLimits}:{requiredFeatures}
}

/** UsdSkel's GPU skinning (UsdSkelImaging's ExtComputations, run by Storm as
 * one compute program) binds 13 storage buffers in its compute stage (Storm's
 * ExtComputation layout, unchanged; KNOWN-GAPS.md "Platform and runtime").
 * A device that allows fewer per stage (Chrome on macOS reports 10) cannot
 * run it: HgiWebGPU skips the dispatch (PLATFORM-DIVERGENCE(webgpu-binding-limits))
 * and skinned points stay at the rest pose. */
export const gpuSkinningStorageBuffers = 13

/** The environment settings the viewer defaults for this device: on a device
 * whose per-stage storage buffer limit is below GPU skinning's, upstream's
 * USDSKELIMAGING_FORCE_CPU_COMPUTE (usdSkelImaging/extComputations.cpp), so
 * skinning runs on the CPU and draws. A setting the page already has (its
 * `?env=` parameters) is kept. PLATFORM-DIVERGENCE(viewer-cpu-skinning-fallback):
 * usdview never changes this setting itself; every native device it runs on
 * has the buffers. */
export function deviceEnvironmentDefaults(limits:Partial<Pick<GPUSupportedLimits,'maxStorageBuffersPerShaderStage'>>|undefined,environment:Record<string,string|undefined>):Record<string,string>{
 const defaults:Record<string,string>={}
 const storage=limits?.maxStorageBuffersPerShaderStage
 if(typeof storage==='number'&&storage<gpuSkinningStorageBuffers&&environment['USDSKELIMAGING_FORCE_CPU_COMPUTE']===undefined)
  defaults['USDSKELIMAGING_FORCE_CPU_COMPUTE']='1'
 return defaults
}

/** The alpha-to-coverage debug code (hdx/debugCodes.h), which turns off the
 * color pass's alpha to coverage (hdx/renderSetupTask.cpp:225-227). */
export const disableAlphaToCoverage = 'HDX_DISABLE_ALPHA_TO_COVERAGE'

/** True for WebKit's WebGPU (Safari, and every browser on iOS), not for
 * Chromium's or Firefox's, which also name AppleWebKit or Gecko in the user agent. */
export function isWebKitWebGPU(userAgent:string):boolean{
 return /AppleWebKit\//.test(userAgent)&&!/(Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS)\//.test(userAgent)
}

/** The environment settings the viewer defaults for this browser, before any
 * module reads them. PLATFORM-DIVERGENCE(viewer-webkit-alpha-to-coverage): in
 * WebKit, TF_DEBUG gains HDX_DISABLE_ALPHA_TO_COVERAGE. WebKit's WGSL-to-Metal
 * compiler puts a volatile forward-progress counter into every shader loop,
 * and a fragment function with such a loop that changes coverage (alpha to
 * coverage, sample_mask, discard) loses the GPU's hidden surface removal, so
 * large scenes draw at a few frames per second (packages/usd/docs/
 * performance-viewer.md, "Alpha to coverage in Safari"). It changes only
 * partially transparent pixels of default-material draws and stored AOV alpha.
 * A page whose TF_DEBUG names the code (`TF_DEBUG=-HDX_DISABLE_ALPHA_TO_COVERAGE`
 * keeps alpha to coverage on) is kept as written. */
export function browserEnvironmentDefaults(userAgent:string,environment:Record<string,string|undefined>):Record<string,string>{
 if(!isWebKitWebGPU(userAgent))return {}
 const debug=environment['TF_DEBUG']??''
 if(debug.split(/\s+/).some(token=>token.replace(/^-/,'')===disableAlphaToCoverage))return {}
 return {TF_DEBUG:debug.trim()?`${debug.trim()} ${disableAlphaToCoverage}`:disableAlphaToCoverage}
}

// Ported from OpenUSD 26.11.1: pxr/imaging/hgiMetal/capabilities.h,
//  pxr/imaging/hgiMetal/capabilities.mm
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HgiWebGPUCapabilities. Modelled on pxr/imaging/hgiMetal/capabilities.{h,mm}:
// the flags and limits Storm consults, read from the WebGPU adapter's
// features and the device's limits.

import { HgiCapabilities, HgiDeviceCapabilitiesBits } from 'typescript-usd/hgi'

export class HgiWebGPUCapabilities extends HgiCapabilities {
  /** WebGPU feature 'float32-filterable': float32 textures may be bound with
   *  a filtering sampler. */
  readonly float32Filterable: boolean
  /** WebGPU feature 'dual-source-blending'. */
  readonly dualSourceBlending: boolean
  /** GPUSupportedLimits.minUniformBufferOffsetAlignment */
  readonly minUniformBufferOffsetAlignment: number
  /** GPUSupportedLimits.minStorageBufferOffsetAlignment */
  readonly minStorageBufferOffsetAlignment: number
  /** GPUSupportedLimits.maxComputeWorkgroupsPerDimension */
  readonly maxComputeWorkgroupsPerDimension: number

  /** hgiMetal/capabilities.mm:20-154 */
  constructor(device: GPUDevice) {
    super()
    const features = device.features
    const limits = device.limits

    // Commands encoded in separate WebGPU passes run in submission order;
    // compute dispatches within a pass may run concurrently
    // (hgiMetal/capabilities.mm:22-24).
    this._setFlag(HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsConcurrentDispatch, true)

    // A browser does not expose whether GPU memory is unified.
    this._setFlag(HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsUnifiedMemory, false)

    // WGSL has no barycentric builtin, no double precision, no draw
    // parameters (base vertex / base instance), no multi-draw indirect, no
    // indirect command buffers and no conservative raster.
    // PLATFORM-DIVERGENCE(webgpu-no-shader-double): WGSL has no f64, so
    // ShaderDoublePrecision is unset, as hgiMetal sets it (capabilities.mm:73).
    // Storm then uploads double primvars as float (mesh.cpp:1270-1277); code
    // and tests that need double-precision shaders do not run on this device.
    this._setFlag(HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsBuiltinBarycentrics, false)
    this._setFlag(HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsShaderDoublePrecision, false)
    this._setFlag(HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsShaderDrawParameters, false)
    this._setFlag(HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsMultiDrawIndirect, false)
    this._setFlag(HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsIndirectCommandBuffers, false)
    this._setFlag(HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsConservativeRaster, false)

    // hgiMetal/capabilities.mm:79 sets MetalTessellation, so Storm moves the
    // geometry-shader work to the post-tessellation vertex stage
    // (hdSt/codeGen.cpp:2123-2125) and never asks for a geometry stage,
    // which WebGPU lacks. WebGPU has no tessellator either: HgiWebGPU
    // emulates Metal's post-tessellation draws, the control stage as a
    // compute dispatch and the fixed-function tessellator as compute
    // kernels (HgiWebGPUTessellation; docs/imaging-i1.md sections 4.2, 4.3,
    // imaging-i2.md section 2.2.1).
    this._setFlag(HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsMetalTessellation, true)

    // Under the emulation the fragment stage cannot read the patch id
    // (WebGPU's primitive_index, where present, counts emulated triangles,
    // two per quad patch), so Storm plumbs the post-tessellation vertex
    // stage's patch_id through the flat hd_patchID varying
    // (hdSt/codeGen.cpp:2491-2503, 2610-2612), as hgiMetal requests on
    // devices whose primitive_id is unreliable
    // (hgiMetal/capabilities.mm:102-107; docs/imaging-i1.md section 4.3).
    this._setFlag(HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsPrimitiveIdEmulation, true)

    // The reference device's patch_id counts from the factor buffer's
    // first patch (the patchStart of drawPatches included: the native
    // capture, tests/fixtures/tessellator/), and hgiMetal sets this bit on
    // Apple Silicon (hgiMetal/capabilities.mm:88-100), so Storm subtracts
    // primitiveCoord in GetPrimitiveID (hdSt/codeGen.cpp:4997-5045) and
    // indexes other per-patch data (curve indices, the tessellation
    // factors, basisCurves.glslfx:137-151) with patch_id directly. The
    // emulated patch_id is the same: patchStart + the patch's index in the
    // draw (HgiWebGPUPostTessVertexShaderSection).
    this._setFlag(HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsBasePrimitiveOffset, true)

    // Clip-space depth is [0, 1] in WebGPU, as in Metal
    // (hgiMetal/capabilities.mm:75).
    this._setFlag(HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsDepthRangeMinusOnetoOne, false)

    // WGSL structs follow their own alignment rules rather than C++'s
    // (hgiMetal sets CppShaderPadding for MSL, capabilities.mm:77).
    this._setFlag(HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsCppShaderPadding, false)

    // Not set, as hgiGL does not (hgiGL/capabilities.cpp): WebGPU has no
    // binding arrays, so each texture of an array of textures is its own
    // binding at consecutive bind indices (HgiWebGPUShaderGenerator
    // _WriteArrayOfTextures), and Storm reserves one texture unit per
    // element (hdSt/resourceBinder.cpp:802-808). hgiMetal (capabilities.mm:85)
    // and hgiVulkan (capabilities.cpp:391) bind an array in one slot.
    this._setFlag(HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsSingleSlotResourceArrays, false)

    this.float32Filterable = features.has('float32-filterable')
    this.dualSourceBlending = features.has('dual-source-blending' as GPUFeatureName)

    this._maxUniformBlockSize = limits.maxUniformBufferBindingSize
    this._maxShaderStorageBlockSize = limits.maxStorageBufferBindingSize
    this._uniformBufferOffsetAlignment = limits.minUniformBufferOffsetAlignment
    // hgiMetal/capabilities.mm:119 reports 8 ([[clip_distance]]). WebGPU's
    // clip_distances builtin (feature clip-distances) holds at most 8
    // distances; without the feature Storm gets no clip planes
    // (hdSt/renderPassState.cpp:241-245 keeps at most this many).
    this._maxClipDistances = features.has('clip-distances' as GPUFeatureName) ? 8 : 0
    this._pageSizeAlignment = 4
    this._maxSamplersPerShaderStage = limits.maxSamplersPerShaderStage

    this.minUniformBufferOffsetAlignment = limits.minUniformBufferOffsetAlignment
    this.minStorageBufferOffsetAlignment = limits.minStorageBufferOffsetAlignment
    this.maxComputeWorkgroupsPerDimension = limits.maxComputeWorkgroupsPerDimension
  }

  /** hgiMetal/capabilities.mm:158-169. WebGPU has one API version. */
  getAPIVersion(): number {
    return 1
  }

  /** hgiMetal/capabilities.mm:171-177. Not the WGSL version; provided for
   *  code that asks for the GLSL version, as hgiMetal does. */
  getShaderVersion(): number {
    return 450
  }
}

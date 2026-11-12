// Ported from OpenUSD 26.11.1: pxr/imaging/hgiMetal/capabilities.mm
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// A GPU-less Hgi for code-generator text tests (Node). It records every
// HgiShaderFunctionDesc Storm hands to CreateShaderFunction and reports the
// API name and capability bits of a chosen device; everything else throws.
//
// HgiCodegenTestMetalM4ProCapabilities reproduces what
// pxr/imaging/hgiMetal/capabilities.mm:22-131 sets on the reference device
// (hgiMetal on an Apple M4 Pro, macOS, the OpenUSD 26.11.1 build that
// produced tests/fixtures/depthBiasCodegen). Device-dependent inputs:
//   hasIPhone = false (capabilities.mm:27-29, ARCH_OS_OSX)
//   hasIntelGPU = [device isLowPower] = false (Apple silicon is not low power)
//   unifiedMemory = [device hasUnifiedMemory] = true (capabilities.mm:35-40:
//     the `macOS 100.100` branch is never taken, so the 10.15 branch runs)
//   barycentrics = supportsShaderBarycentricCoordinates = true on M4
//   hasAppleSilicon = hasUnifiedMemory && !isLowPower = true (:47-49)
//   icbSupported = true (:52-61, macOS >= 12.3, env setting default true)
// The native text confirms BasePrimitiveOffset on and PrimitiveIdEmulation
// off (the post-tessellation stage reads `patch_id - GetBasePrimitiveOffset()`).

import { Token as TfToken } from 'typescript-usd/tf'
import {
  Hgi,
  HgiCapabilities,
  HgiDeviceCapabilitiesBits,
  HgiHandle,
  HgiShaderFunction,
  HgiShaderProgram,
  HgiTokens,
  type HgiShaderFunctionDesc,
  type HgiShaderFunctionHandle,
  type HgiShaderProgramDesc,
  type HgiShaderProgramHandle,
} from 'typescript-usd/hgi'

const B = HgiDeviceCapabilitiesBits

/** hgiMetal/capabilities.mm:20-131 evaluated for the Apple M4 Pro reference
 *  device (see the file comment for the device-dependent values). */
export class HgiCodegenTestMetalM4ProCapabilities extends HgiCapabilities {
  constructor() {
    super()
    const hasIPhone = false
    const hasIntelGPU = false
    const unifiedMemory = true
    const barycentrics = true
    const hasAppleSilicon = true
    const icbSupported = true

    // capabilities.mm:22-24 (macOS 10.14.5+)
    this._setFlag(B.HgiDeviceCapabilitiesBitsConcurrentDispatch, true)
    // capabilities.mm:63
    this._setFlag(B.HgiDeviceCapabilitiesBitsUnifiedMemory, unifiedMemory)
    // capabilities.mm:65
    this._setFlag(B.HgiDeviceCapabilitiesBitsBuiltinBarycentrics, barycentrics)
    // capabilities.mm:67
    this._setFlag(B.HgiDeviceCapabilitiesBitsShaderDoublePrecision, false)
    // capabilities.mm:69
    this._setFlag(B.HgiDeviceCapabilitiesBitsDepthRangeMinusOnetoOne, false)
    // capabilities.mm:71
    this._setFlag(B.HgiDeviceCapabilitiesBitsCppShaderPadding, true)
    // capabilities.mm:73
    this._setFlag(B.HgiDeviceCapabilitiesBitsMetalTessellation, true)
    // capabilities.mm:75
    this._setFlag(B.HgiDeviceCapabilitiesBitsMultiDrawIndirect, true)
    // capabilities.mm:77
    this._setFlag(B.HgiDeviceCapabilitiesBitsIndirectCommandBuffers, icbSupported)
    // capabilities.mm:79
    this._setFlag(B.HgiDeviceCapabilitiesBitsSingleSlotResourceArrays, true)
    // capabilities.mm:81
    this._setFlag(B.HgiDeviceCapabilitiesForceEarlyFragmentTest, true)
    // capabilities.mm:90-93
    this._setFlag(B.HgiDeviceCapabilitiesBitsBasePrimitiveOffset,
      hasAppleSilicon || hasIntelGPU || hasIPhone)
    // capabilities.mm:97-100
    this._setFlag(B.HgiDeviceCapabilitiesBitsPrimitiveIdEmulation,
      hasIntelGPU || (hasIPhone && !barycentrics))
    // Never set by hgiMetal: Presentation, BindlessBuffers,
    // ShaderDrawParameters, BindlessTextures, ConservativeRaster,
    // StencilReadback, CustomDepthRange, RoundPoints.

    // capabilities.mm:109-114
    this._maxUniformBlockSize = 64 * 1024
    this._maxShaderStorageBlockSize = 1 * 1024 * 1024 * 1024
    this._uniformBufferOffsetAlignment = 16
    this._maxClipDistances = 8
    this._pageSizeAlignment = 4096
    // [device maxArgumentBufferSamplerCount]: 1024 on Apple silicon
    // (Metal feature set tables, "Maximum number of samplers in an argument
    // buffer"). The depthBias programs bind no samplers.
    this._maxSamplersPerShaderStage = 1024
  }

  /** capabilities.mm:150-161: APIVersion_Metal3_0 (hgiMetal/hgi.h:24-27). */
  getAPIVersion(): number {
    return 2
  }

  /** capabilities.mm:163-169 */
  getShaderVersion(): number {
    return 450
  }
}

/** A shader function that keeps its descriptor and always compiles. */
class _RecordedShaderFunction extends HgiShaderFunction {
  constructor(desc: HgiShaderFunctionDesc) {
    super(desc)
  }
  isValid(): boolean { return true }
  getCompileErrors(): string { return '' }
  getByteSizeOfResource(): number { return 0 }
  getRawResource(): unknown { return null }
}

class _RecordedShaderProgram extends HgiShaderProgram {
  constructor(desc: HgiShaderProgramDesc) {
    super(desc)
  }
  isValid(): boolean { return true }
  getCompileErrors(): string { return '' }
  getShaderFunctions() { return this._descriptor.shaderFunctions }
  getByteSizeOfResource(): number { return 0 }
  getRawResource(): unknown { return null }
}

function _unsupported(name: string): never {
  throw new Error(`HgiCodegenTest: ${name} is not available in a text test`)
}

/** Hgi that records shader function descriptors. */
export class HgiCodegenTest extends Hgi {
  /** Every descriptor passed to CreateShaderFunction, in call order (the
   *  shader code pointers are kept: HgiShaderFunction stores a copy). */
  readonly shaderFunctionDescs: HgiShaderFunctionDesc[] = []
  private _apiName: TfToken
  private _caps: HgiCapabilities

  constructor(apiName: TfToken, caps: HgiCapabilities) {
    super()
    this._apiName = apiName
    this._caps = caps
  }

  /** hgiMetal on the Apple M4 Pro reference device. */
  static metalM4Pro(): HgiCodegenTest {
    return new HgiCodegenTest(HgiTokens.Metal, new HgiCodegenTestMetalM4ProCapabilities())
  }

  IsBackendSupported(): boolean { return true }
  getAPIName(): TfToken { return this._apiName }
  getCapabilities(): HgiCapabilities { return this._caps }

  CreateShaderFunction(desc: HgiShaderFunctionDesc): HgiShaderFunctionHandle {
    this.shaderFunctionDescs.push(desc.clone())
    return new HgiHandle<HgiShaderFunction>(new _RecordedShaderFunction(desc), this.getUniqueId())
  }
  destroyShaderFunction(h: HgiShaderFunctionHandle): void { h._reset() }
  createShaderProgram(desc: HgiShaderProgramDesc): HgiShaderProgramHandle {
    return new HgiHandle<HgiShaderProgram>(new _RecordedShaderProgram(desc), this.getUniqueId())
  }
  destroyShaderProgram(h: HgiShaderProgramHandle): void { h._reset() }

  createGraphicsCmds(): never { return _unsupported('CreateGraphicsCmds') }
  createBlitCmds(): never { return _unsupported('CreateBlitCmds') }
  createComputeCmds(): never { return _unsupported('CreateComputeCmds') }
  destroyTexture(): never { return _unsupported('DestroyTexture') }
  destroyTextureView(): never { return _unsupported('DestroyTextureView') }
  createSampler(): never { return _unsupported('CreateSampler') }
  destroySampler(): never { return _unsupported('DestroySampler') }
  destroyBuffer(): never { return _unsupported('DestroyBuffer') }
  destroyResourceBindings(): never { return _unsupported('DestroyResourceBindings') }
  CreateGraphicsPipeline(): never { return _unsupported('CreateGraphicsPipeline') }
  destroyGraphicsPipeline(): never { return _unsupported('DestroyGraphicsPipeline') }
  CreateComputePipeline(): never { return _unsupported('CreateComputePipeline') }
  destroyComputePipeline(): never { return _unsupported('DestroyComputePipeline') }
  getIndirectCommandEncoder(): null { return null }
  startFrame(): void {}
  endFrame(): void {}
  garbageCollect(): void {}
  _destroy(): void {}
  protected _CreateTexture(): never { return _unsupported('CreateTexture') }
  protected _createTextureView(): never { return _unsupported('CreateTextureView') }
  protected _createBuffer(): never { return _unsupported('CreateBuffer') }
  protected _createResourceBindings(): never { return _unsupported('CreateResourceBindings') }
}

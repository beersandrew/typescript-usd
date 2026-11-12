// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/domeLightComputations.cpp,
//  pxr/imaging/hdSt/domeLightComputations.h
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/domeLightComputations.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - HdStSimpleLightingShaderPtr (a weak_ptr) is a plain reference; lock()
//   is the reference itself.
// - dynamic_cast is instanceof.
// - The cubemap, irradiance and prefilter computations write a cubemap,
//   which HgiWebGPU binds as a 2d-array storage texture of the faces
//   (hgiWebGPU shaderGenerator.ts, texture.ts). Checked in Safari against
//   the reference build's render of a dome-lit scene
//   (apps/usdview/scripts/asset-acceptance, dome_light).
// - HD_TRACE_FUNCTION / HF_MALLOC_TAG_FUNCTION are not ported.

import { Vec3i as GfVec3i } from 'typescript-usd/gf'
import type { Token as TfToken } from 'typescript-usd/tf'
import type { BufferArrayRange as HdBufferArrayRange, BufferSpec as HdBufferSpec, ResourceRegistry as HdResourceRegistry } from 'typescript-usd/hd'
import {
  HgiBindResourceType,
  HgiComputePipelineDesc,
  HgiFormat,
  HgiGetDataSizeOfFormat,
  HgiResourceBindingsDesc,
  HgiShaderFunctionAddConstantParam,
  HgiShaderFunctionAddStageInput,
  HgiShaderFunctionAddTexture,
  HgiShaderFunctionAddWritableTexture,
  HgiShaderKeywordTokens,
  HgiShaderStageBits,
  HgiShaderTextureType,
  HgiTextureBindDesc,
  HgiTextureDesc,
  HgiTextureType,
  HgiTextureUsageBits,
  HgiTextureViewDesc,
  HgiHandle,
  type HgiBlockSize,
  type HgiSampler,
  type HgiSamplerHandle,
  type HgiShaderFunctionDesc,
  type HgiTextureHandle,
} from 'typescript-usd/hgi'
import { HdStComputation } from './computation.ts'
import { HdStTextureType } from './enums.ts'
import { HdStGLSLProgram } from './glslProgram.ts'
import { HdStPackageDomeLightShader } from './package.ts'
import type { HdStResourceRegistry } from './resourceRegistry.ts'
import { HdStUvSamplerObject } from './samplerObject.ts'
import type { HdStSimpleLightingShader } from './simpleLightingShader.ts'
import type { HdStTextureHandle } from './textureHandle.ts'
import { HdStUvTextureObject } from './textureObject.ts'
import { HdStDynamicUvTextureObject } from './dynamicUvTextureObject.ts'
import { HdStTokens } from './tokens.ts'
import { TF_CODING_ERROR, TF_VERIFY, TF_WARN } from './tfDiagnostic.ts'

/** dynamic_cast<HdStDynamicUvTextureObject*> */
function _AsDynamicUvTextureObject(o: unknown): HdStDynamicUvTextureObject | null {
  return o instanceof HdStDynamicUvTextureObject ? o : null
}

/** domeLightComputations.cpp:35-39 */
function _MakeMultipleOf(dim: number, localSize: number): number {
  return Math.trunc((dim + localSize - 1) / localSize) * localSize
}

/** domeLightComputations.cpp:41-47 */
function _FillPixelsByteSize(desc: HgiTextureDesc): void {
  const s = HgiGetDataSizeOfFormat(desc.format)
  desc.pixelsByteSize =
    s * desc.dimensions.get(0) * desc.dimensions.get(1) * desc.dimensions.get(2)
}

/** domeLightComputations.cpp:49-89 */
function _GetSrcDimensionsTextureAndSampler(
  srcTextureHandle: HdStTextureHandle | null,
): { srcDim: GfVec3i, srcTexture: HgiTextureHandle, srcSampler: HgiSamplerHandle } | null {
  if (!TF_VERIFY(srcTextureHandle)) {
    return null
  }

  const textureObject = srcTextureHandle!.getTextureObject()
  const srcTextureObject = textureObject instanceof HdStUvTextureObject ? textureObject : null
  if (!TF_VERIFY(srcTextureObject)) {
    return null
  }

  const samplerObject = srcTextureHandle!.getSamplerObject()
  const srcSamplerObject = samplerObject instanceof HdStUvSamplerObject ? samplerObject : null
  if (!TF_VERIFY(srcSamplerObject)) {
    return null
  }

  if (!srcTextureObject!.isValid()) {
    const filePath = srcTextureObject!.GetTextureIdentifier().getFilePath()
    TF_WARN(`Invalid texture ${filePath}.`)
    return null
  }

  const srcTexture = srcTextureObject!.getTexture()
  const hgiTexture = srcTexture?.Get()
  if (!TF_VERIFY(hgiTexture)) {
    return null
  }

  return {
    srcDim: hgiTexture!.getDescriptor().dimensions,
    srcTexture: srcTexture!,
    srcSampler: srcSamplerObject!.getSampler(),
  }
}

/** domeLightComputations.cpp:91-109 */
function _GetHgiShaderTextureType(textureObject: HdStUvTextureObject): HgiShaderTextureType {
  const textureType = textureObject.getTextureType()
  switch (textureType) {
    case HdStTextureType.Cubemap: {
      return HgiShaderTextureType.HgiShaderTextureTypeCubemapTexture
    }
    case HdStTextureType.Uv: {
      return HgiShaderTextureType.HgiShaderTextureTypeTexture
    }
    default: {
      TF_CODING_ERROR(`Unhandled HdStTextureType value ${textureType}`)
      return HgiShaderTextureType.HgiShaderTextureTypeTexture
    }
  }
}

/** domeLightComputations.cpp:111-120 */
function _GetLayerCount(textureObject: HdStUvTextureObject): number {
  if (textureObject.getTextureType() === HdStTextureType.Cubemap) {
    return 6
  }

  return 1
}

/** domeLightComputations.cpp:122-140 */
function _GetHgiTextureType(textureObject: HdStUvTextureObject): HgiTextureType {
  const textureType = textureObject.getTextureType()
  switch (textureType) {
    case HdStTextureType.Cubemap: {
      return HgiTextureType.HgiTextureTypeCubemap
    }
    case HdStTextureType.Uv: {
      return HgiTextureType.HgiTextureType2D
    }
    default: {
      TF_CODING_ERROR(`Unhandled HdStTextureType value ${textureType}`)
      return HgiTextureType.HgiTextureType2D
    }
  }
}

/** domeLightComputations.h:23-74 */
export class HdSt_DomeLightComputationGPU extends HdStComputation {
  /** domeLightComputations.cpp:146-164 */
  constructor(
    // Name of computation shader to use, also used as texture name.
    private readonly _shaderToken: TfToken,
    // Whether to use the dome light cubemap texture or the dome light
    // latlong texture as the input for the computation.
    private readonly _useCubemapAsSourceTexture: boolean,
    // Lighting shader for accessing any referenced textures.
    private readonly _lightingShader: HdStSimpleLightingShader,
    // Dimension of the dome light cubemap texture. NOTE: this is only used
    // when the latlong texture is input for the compuation.
    private readonly _computedCubeMapDim: number,
    // Number of mip levels.
    private readonly _numLevels = 1,
    // Level to be filled (0 means also to allocate texture).
    private readonly _level = 0,
    // Roughness associated with the texture level.
    private readonly _roughness = -1.0,
  ) {
    super()
  }

  /** domeLightComputations.h:50-51 */
  override getBufferSpecs(): HdBufferSpec[] { return [] }

  /** This computation doesn't generate buffer source (i.e. 2nd phase)
   *  domeLightComputations.h:60 */
  override getNumOutputElements(): number { return 0 }

  /** domeLightComputations.cpp:166-381 */
  override Execute(_range: HdBufferArrayRange | null, resourceRegistry: HdResourceRegistry): void {
    const shader = this._lightingShader
    if (!TF_VERIFY(shader)) {
      return
    }

    // Get texture object from lighting shader that this computation is supposed
    // to populate.
    const dstTextureHandle = shader.getTextureHandle(this._shaderToken)
    if (!TF_VERIFY(dstTextureHandle)) {
      return
    }

    // Depending on the shader, we are either creating a cubemap texture or
    // a 2D UV texture.
    const dstTextureObject = _AsDynamicUvTextureObject(dstTextureHandle!.getTextureObject())
    if (!TF_VERIFY(dstTextureObject)) {
      return
    }

    const localSize = 8
    const hasUniforms = this._roughness >= 0.0

    const hdStResourceRegistry = resourceRegistry as unknown as HdStResourceRegistry

    const computeProgram =
      HdStGLSLProgram.getComputeProgram(
        HdStPackageDomeLightShader(),
        this._shaderToken,
        '',
        hdStResourceRegistry,
        (computeDesc: HgiShaderFunctionDesc) => {
          computeDesc.debugName = this._shaderToken
          computeDesc.shaderStage = HgiShaderStageBits.HgiShaderStageCompute
          computeDesc.computeDescriptor.localSize =
            new GfVec3i(localSize, localSize, 1)

          const inTextureType =
            this._useCubemapAsSourceTexture
              ? HgiShaderTextureType.HgiShaderTextureTypeCubemapTexture
              : HgiShaderTextureType.HgiShaderTextureTypeTexture
          HgiShaderFunctionAddTexture(computeDesc, 'inTexture',
            /*bindIndex = */0, /*dimensions = */2,
            /*format = */HgiFormat.HgiFormatFloat16Vec4,
            /*textureType = */inTextureType)

          const outTextureType =
            _GetHgiShaderTextureType(dstTextureObject!)
          HgiShaderFunctionAddWritableTexture(computeDesc, 'outTexture',
            /*bindIndex = */1, /*dimensions = */2,
            /*format = */HgiFormat.HgiFormatFloat16Vec4,
            /*textureType = */outTextureType)
          if (hasUniforms) {
            HgiShaderFunctionAddConstantParam(
              computeDesc, 'inRoughness', HdStTokens._float)
          }
          HgiShaderFunctionAddStageInput(
            computeDesc, 'hd_GlobalInvocationID', 'uvec3',
            HgiShaderKeywordTokens.hdGlobalInvocationID)
        },
      )
    if (!TF_VERIFY(computeProgram)) {
      return
    }

    // Data from source 2D or cubemap texture.
    let src: ReturnType<typeof _GetSrcDimensionsTextureAndSampler>

    // Size of texture to be created.
    let width = 0
    let height = 0
    if (this._useCubemapAsSourceTexture) {
      // Source texture is the cubemap texture generated from the
      // latlong dome light texture.

      src = _GetSrcDimensionsTextureAndSampler(
        (shader.getDomeLightEnvironmentCubemapTextureHandle()))
      if (!src) {
        return
      }

      // Width and height are half that of the source cubemap.
      width = Math.max(Math.trunc(src.srcDim.get(0) / 2), 1)
      height = width
    } else {
      // Source texture is the latlong dome light texture.

      src = _GetSrcDimensionsTextureAndSampler(
        (shader.getDomeLightEnvironmentTextureHandle()))
      if (!src) {
        return
      }

      // We are either generating a cubemap with 6 equal-sized faces from the
      // latlong texture, or a single 2D lookup texture that will
      // be the size of one face of the cubemap.
      width = this._computedCubeMapDim
      height = width
    }

    // Make sure dimensions align with the local size used in the compute shader
    width = _MakeMultipleOf(width, localSize)
    height = _MakeMultipleOf(height, localSize)

    const layerCount = _GetLayerCount(dstTextureObject!)

    if (this._level === 0) {
      // Level zero is in charge of actually creating the GPU resource.
      const desc = new HgiTextureDesc()
      desc.debugName = this._shaderToken
      desc.type = _GetHgiTextureType(dstTextureObject!)
      desc.format = HgiFormat.HgiFormatFloat16Vec4
      desc.dimensions = new GfVec3i(width, height, 1)
      desc.layerCount = layerCount
      desc.mipLevels = this._numLevels
      desc.usage =
        HgiTextureUsageBits.HgiTextureUsageBitsShaderRead | HgiTextureUsageBits.HgiTextureUsageBitsShaderWrite
      _FillPixelsByteSize(desc)
      dstTextureObject!.createTexture(desc)
    }

    // Create a texture view for the layer we want to write to
    const texViewDesc = new HgiTextureViewDesc()
    texViewDesc.layerCount = layerCount
    texViewDesc.mipLevels = 1
    texViewDesc.format = HgiFormat.HgiFormatFloat16Vec4
    texViewDesc.sourceFirstLayer = 0
    texViewDesc.sourceFirstMip = this._level
    texViewDesc.sourceTexture = dstTextureObject!.getTexture()!

    const hgi = hdStResourceRegistry.getHgi()
    const dstTextureView = hgi.createTextureView(texViewDesc)

    const resourceDesc = new HgiResourceBindingsDesc()
    resourceDesc.debugName = this._shaderToken

    const texBind0 = new HgiTextureBindDesc()
    texBind0.bindingIndex = 0
    texBind0.stageUsage = HgiShaderStageBits.HgiShaderStageCompute
    texBind0.writable = false
    texBind0.textures.push(src.srcTexture)
    texBind0.samplers.push(src.srcSampler)
    texBind0.resourceType = HgiBindResourceType.HgiBindResourceTypeCombinedSamplerImage
    resourceDesc.textures.push(texBind0)

    let dstSampler: HgiSamplerHandle = new HgiHandle<HgiSampler>()
    const dstSamplerObject = dstTextureHandle!.getSamplerObject()
    if (dstSamplerObject instanceof HdStUvSamplerObject) {
      dstSampler = dstSamplerObject.getSampler()
    }

    const texBind1 = new HgiTextureBindDesc()
    texBind1.bindingIndex = 1
    texBind1.stageUsage = HgiShaderStageBits.HgiShaderStageCompute
    texBind1.writable = true
    texBind1.textures.push(dstTextureView.Get()!.getViewTexture())
    texBind1.samplers.push(dstSampler)
    texBind1.resourceType = HgiBindResourceType.HgiBindResourceTypeStorageImage
    resourceDesc.textures.push(texBind1)

    const resourceBindings = hgi.createResourceBindings(resourceDesc)

    // Prepare uniform buffer for GPU computation if needed.
    // struct Uniforms { float roughness; } uniform;
    const uniform = new Float32Array([this._roughness])

    const desc = new HgiComputePipelineDesc()
    desc.debugName = this._shaderToken
    desc.shaderProgram = computeProgram!.getProgram()
    if (hasUniforms) {
      desc.shaderConstantsDesc.byteSize = uniform.byteLength
    }
    const pipeline = hgi.CreateComputePipeline(desc)

    const computeCmds = hdStResourceRegistry.getGlobalComputeCmds()

    computeCmds.pushDebugGroup(this._shaderToken)
    computeCmds.bindResources(resourceBindings)
    computeCmds.bindPipeline(pipeline)

    // Queue transfer uniform buffer.
    // If we are calculating the irradiance map we do not need to send over
    // the roughness value to the shader
    // flagged this with a negative roughness value
    if (hasUniforms) {
      computeCmds.setConstantValues(pipeline, 0, uniform.byteLength, uniform)
    }

    // Queue compute work
    computeCmds.Dispatch(width * layerCount, height)

    computeCmds.popDebugGroup()

    // Garbage collect the intermediate resources (destroyed at end of frame).
    hgi.destroyTextureView(dstTextureView)
    hgi.destroyComputePipeline(pipeline)
    hgi.destroyResourceBindings(resourceBindings)
  }
}

/** domeLightComputations.h:76-96 */
export class HdSt_DomeLightMipmapComputationGPU extends HdStComputation {
  /** domeLightComputations.cpp:385-389 */
  constructor(
    // Lighting shader for accessing textures.
    private readonly _lightingShader: HdStSimpleLightingShader,
  ) {
    super()
  }

  override getBufferSpecs(): HdBufferSpec[] { return [] }

  override getNumOutputElements(): number { return 0 }

  /** domeLightComputations.cpp:391-421 */
  override Execute(_range: HdBufferArrayRange | null, _resourceRegistry: HdResourceRegistry): void {
    const shader = this._lightingShader
    if (!TF_VERIFY(shader)) {
      return
    }

    const srcTextureHandle =
      (shader.getDomeLightEnvironmentCubemapTextureHandle())
    if (!TF_VERIFY(srcTextureHandle)) {
      return
    }

    const srcTextureObject = _AsDynamicUvTextureObject(srcTextureHandle!.getTextureObject())
    if (!TF_VERIFY(srcTextureObject)) {
      return
    }

    // We encapsulate this mipmap generation invocation into this computation
    // object so we can order it after the cubemap mip level 0 has been
    // populated, and prior to subsequent filtering commands that expect the
    // cubemap to have mipmaps.

    srcTextureObject!.generateMipmaps()
  }
}

/** domeLightComputations.cpp:423-450 */
export function HdSt_ComputeDomeLightCubemapWidth(
  _domeLightFilePath: string,
  domelightTextureDesc: HgiTextureDesc,
  cubemapTargetMemoryMB: number,
): number {
  // Standard cubemap width calculation
  const cubemapWidth = Math.max(Math.trunc(domelightTextureDesc.dimensions.get(0) / 4), 1)

  if (cubemapTargetMemoryMB === 0) {
    return cubemapWidth
  }

  // Cubemap width calculation based on the target memory
  const MB = 1048576
  const block: HgiBlockSize = { blockWidth: 1, blockHeight: 1 }
  const bytesPerTexel = HgiGetDataSizeOfFormat(domelightTextureDesc.format, block)
  const bytesPerPixel = Math.trunc(bytesPerTexel / (block.blockHeight * block.blockWidth))
  // The 0.75 factor is to account for all lower mipmaps
  const targetMemoryWidth =
    Math.trunc(Math.sqrt((0.75 * cubemapTargetMemoryMB * MB) / (6 * bytesPerPixel)))

  return Math.min(targetMemoryWidth, cubemapWidth)
}

// Ported from OpenUSD 26.11.1: pxr/imaging/hgi/enums.h
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hgi/enums.h (OpenUSD 26.11.1).
//
// C++ enums become TypeScript numeric enums whose members keep the upstream
// global names (HgiTextureType.HgiTextureType2D for HgiTextureType2D). Bit
// enums keep their upstream values; the `using HgiXxx = HgiBits` aliases are
// plain `number` types.

/** enums.h:16 */
export type HgiBits = number

/** enums.h:68-91 */
export enum HgiDeviceCapabilitiesBits {
  HgiDeviceCapabilitiesBitsPresentation = 1 << 0,
  HgiDeviceCapabilitiesBitsBindlessBuffers = 1 << 1,
  HgiDeviceCapabilitiesBitsConcurrentDispatch = 1 << 2,
  HgiDeviceCapabilitiesBitsUnifiedMemory = 1 << 3,
  HgiDeviceCapabilitiesBitsBuiltinBarycentrics = 1 << 4,
  HgiDeviceCapabilitiesBitsShaderDrawParameters = 1 << 5,
  HgiDeviceCapabilitiesBitsMultiDrawIndirect = 1 << 6,
  HgiDeviceCapabilitiesBitsBindlessTextures = 1 << 7,
  HgiDeviceCapabilitiesBitsShaderDoublePrecision = 1 << 8,
  HgiDeviceCapabilitiesBitsDepthRangeMinusOnetoOne = 1 << 9,
  HgiDeviceCapabilitiesBitsCppShaderPadding = 1 << 10,
  HgiDeviceCapabilitiesBitsConservativeRaster = 1 << 11,
  HgiDeviceCapabilitiesBitsStencilReadback = 1 << 12,
  HgiDeviceCapabilitiesBitsCustomDepthRange = 1 << 13,
  HgiDeviceCapabilitiesBitsMetalTessellation = 1 << 14,
  HgiDeviceCapabilitiesBitsBasePrimitiveOffset = 1 << 15,
  HgiDeviceCapabilitiesBitsPrimitiveIdEmulation = 1 << 16,
  HgiDeviceCapabilitiesBitsIndirectCommandBuffers = 1 << 17,
  HgiDeviceCapabilitiesBitsRoundPoints = 1 << 18,
  HgiDeviceCapabilitiesBitsSingleSlotResourceArrays = 1 << 19,
  HgiDeviceCapabilitiesForceEarlyFragmentTest = 1 << 20,
}
/** enums.h:93 */
export type HgiDeviceCapabilities = HgiBits

/** enums.h:114-124 */
export enum HgiTextureType {
  HgiTextureType1D = 0,
  HgiTextureType2D,
  HgiTextureType3D,
  HgiTextureTypeCubemap,
  HgiTextureType1DArray,
  HgiTextureType2DArray,

  HgiTextureTypeCount,
}

/** enums.h:150-159 */
export enum HgiTextureUsageBits {
  HgiTextureUsageBitsColorTarget = 1 << 0,
  HgiTextureUsageBitsDepthTarget = 1 << 1,
  HgiTextureUsageBitsStencilTarget = 1 << 2,
  HgiTextureUsageBitsShaderRead = 1 << 3,
  HgiTextureUsageBitsShaderWrite = 1 << 4,

  HgiTextureUsageCustomBitsBegin = 1 << 5,
}
/** enums.h:161 */
export type HgiTextureUsage = HgiBits

/** enums.h:167-176 */
export enum HgiSamplerAddressMode {
  HgiSamplerAddressModeClampToEdge = 0,
  HgiSamplerAddressModeMirrorClampToEdge,
  HgiSamplerAddressModeRepeat,
  HgiSamplerAddressModeMirrorRepeat,
  HgiSamplerAddressModeClampToBorderColor,

  HgiSamplerAddressModeCount,
}

/** enums.h:189-195 */
export enum HgiSamplerFilter {
  HgiSamplerFilterNearest = 0,
  HgiSamplerFilterLinear = 1,

  HgiSamplerFilterCount,
}

/** enums.h:210-217 */
export enum HgiMipFilter {
  HgiMipFilterNotMipmapped = 0,
  HgiMipFilterNearest = 1,
  HgiMipFilterLinear = 2,

  HgiMipFilterCount,
}

/** enums.h:229-236 */
export enum HgiBorderColor {
  HgiBorderColorTransparentBlack = 0,
  HgiBorderColorOpaqueBlack = 1,
  HgiBorderColorOpaqueWhite = 2,

  HgiBorderColorCount,
}

/** enums.h:242-251 */
export enum HgiSampleCount {
  HgiSampleCount1 = 1,
  HgiSampleCount2 = 2,
  HgiSampleCount4 = 4,
  HgiSampleCount8 = 8,
  HgiSampleCount16 = 16,

  HgiSampleCountEnd,
}

/** enums.h:266-273 */
export enum HgiAttachmentLoadOp {
  HgiAttachmentLoadOpDontCare = 0,
  HgiAttachmentLoadOpClear,
  HgiAttachmentLoadOpLoad,

  HgiAttachmentLoadOpCount,
}

/** enums.h:286-292 */
export enum HgiAttachmentStoreOp {
  HgiAttachmentStoreOpDontCare = 0,
  HgiAttachmentStoreOpStore,

  HgiAttachmentStoreOpCount,
}

/** enums.h:315-325 */
export enum HgiBufferUsageBits {
  HgiBufferUsageUniform = 1 << 0,
  HgiBufferUsageIndex32 = 1 << 1,
  HgiBufferUsageVertex = 1 << 2,
  HgiBufferUsageStorage = 1 << 3,
  HgiBufferUsageIndirect = 1 << 4,
  HgiBufferUsageUpload = 1 << 5,

  HgiBufferUsageCustomBitsBegin = 1 << 6,
}
/** enums.h:326 */
export type HgiBufferUsage = HgiBits

/** enums.h:356-376. HgiShaderStageAll is 0xFFFFFFFF (an unsigned 32-bit
 *  value); it is kept unsigned here so `stage & HgiShaderStageAll` style
 *  tests read the same as upstream after `>>> 0`. */
export enum HgiShaderStageBits {
  HgiShaderStageVertex = 1 << 0,
  HgiShaderStageFragment = 1 << 1,
  HgiShaderStageCompute = 1 << 2,
  HgiShaderStageTessellationControl = 1 << 3,
  HgiShaderStageTessellationEval = 1 << 4,
  HgiShaderStageGeometry = 1 << 5,
  HgiShaderStagePostTessellationControl = 1 << 6,
  HgiShaderStagePostTessellationVertex = 1 << 7,
  HgiShaderStageCustomBitsBegin = 1 << 8,
  HgiShaderStageAllGraphics = HgiShaderStageVertex
    | HgiShaderStageFragment
    | HgiShaderStageTessellationControl
    | HgiShaderStageTessellationEval
    | HgiShaderStageGeometry
    | HgiShaderStagePostTessellationControl
    | HgiShaderStagePostTessellationVertex,
  HgiShaderStageAll = 0xFFFFFFFF,
}
/** enums.h:377 */
export type HgiShaderStage = HgiBits

/** enums.h:405-416 */
export enum HgiBindResourceType {
  HgiBindResourceTypeSampler = 0,
  HgiBindResourceTypeSampledImage,
  HgiBindResourceTypeCombinedSamplerImage,
  HgiBindResourceTypeStorageImage,
  HgiBindResourceTypeUniformBuffer,
  HgiBindResourceTypeStorageBuffer,
  HgiBindResourceTypeTessFactors,

  HgiBindResourceTypeCount,
}

/** enums.h:431-438 */
export enum HgiPolygonMode {
  HgiPolygonModeFill = 0,
  HgiPolygonModeLine,
  HgiPolygonModePoint,

  HgiPolygonModeCount,
}

/** enums.h:455-463 */
export enum HgiCullMode {
  HgiCullModeNone = 0,
  HgiCullModeFront,
  HgiCullModeBack,
  HgiCullModeFrontAndBack,

  HgiCullModeCount,
}

/** enums.h:476-482 */
export enum HgiWinding {
  HgiWindingClockwise = 0,
  HgiWindingCounterClockwise,

  HgiWindingCount,
}

/** enums.h:489-498 */
export enum HgiBlendOp {
  HgiBlendOpAdd = 0,
  HgiBlendOpSubtract,
  HgiBlendOpReverseSubtract,
  HgiBlendOpMin,
  HgiBlendOpMax,

  HgiBlendOpCount,
}

/** enums.h:504-527 */
export enum HgiBlendFactor {
  HgiBlendFactorZero = 0,
  HgiBlendFactorOne,
  HgiBlendFactorSrcColor,
  HgiBlendFactorOneMinusSrcColor,
  HgiBlendFactorDstColor,
  HgiBlendFactorOneMinusDstColor,
  HgiBlendFactorSrcAlpha,
  HgiBlendFactorOneMinusSrcAlpha,
  HgiBlendFactorDstAlpha,
  HgiBlendFactorOneMinusDstAlpha,
  HgiBlendFactorConstantColor,
  HgiBlendFactorOneMinusConstantColor,
  HgiBlendFactorConstantAlpha,
  HgiBlendFactorOneMinusConstantAlpha,
  HgiBlendFactorSrcAlphaSaturate,
  HgiBlendFactorSrc1Color,
  HgiBlendFactorOneMinusSrc1Color,
  HgiBlendFactorSrc1Alpha,
  HgiBlendFactorOneMinusSrc1Alpha,

  HgiBlendFactorCount,
}

/** enums.h:534-540 */
export enum HgiColorMaskBits {
  HgiColorMaskRed = 1 << 0,
  HgiColorMaskGreen = 1 << 1,
  HgiColorMaskBlue = 1 << 2,
  HgiColorMaskAlpha = 1 << 3,
}
/** enums.h:541 */
export type HgiColorMask = HgiBits

/** enums.h:547-559 */
export enum HgiCompareFunction {
  HgiCompareFunctionNever = 0,
  HgiCompareFunctionLess,
  HgiCompareFunctionEqual,
  HgiCompareFunctionLEqual,
  HgiCompareFunctionGreater,
  HgiCompareFunctionNotEqual,
  HgiCompareFunctionGEqual,
  HgiCompareFunctionAlways,

  HgiCompareFunctionCount,
}

/** enums.h:565-577 */
export enum HgiStencilOp {
  HgiStencilOpKeep = 0,
  HgiStencilOpZero,
  HgiStencilOpReplace,
  HgiStencilOpIncrementClamp,
  HgiStencilOpDecrementClamp,
  HgiStencilOpInvert,
  HgiStencilOpIncrementWrap,
  HgiStencilOpDecrementWrap,

  HgiStencilOpCount,
}

/** enums.h:583-593 */
export enum HgiComponentSwizzle {
  HgiComponentSwizzleZero = 0,
  HgiComponentSwizzleOne,
  HgiComponentSwizzleR,
  HgiComponentSwizzleG,
  HgiComponentSwizzleB,
  HgiComponentSwizzleA,

  HgiComponentSwizzleCount,
}

/** enums.h:616-626 */
export enum HgiPrimitiveType {
  HgiPrimitiveTypePointList = 0,
  HgiPrimitiveTypeLineList,
  HgiPrimitiveTypeLineStrip,
  HgiPrimitiveTypeTriangleList,
  HgiPrimitiveTypePatchList,
  HgiPrimitiveTypeLineListWithAdjacency,

  HgiPrimitiveTypeCount,
}

/** enums.h:647-657 */
export enum HgiVertexBufferStepFunction {
  HgiVertexBufferStepFunctionConstant = 0,
  HgiVertexBufferStepFunctionPerVertex,
  HgiVertexBufferStepFunctionPerInstance,
  HgiVertexBufferStepFunctionPerPatch,
  HgiVertexBufferStepFunctionPerPatchControlPoint,
  HgiVertexBufferStepFunctionPerDrawCommand,

  HgiVertexBufferStepFunctionCount,
}

/** enums.h:670-674 */
export enum HgiSubmitWaitType {
  HgiSubmitWaitTypeNoWait = 0,
  HgiSubmitWaitTypeWaitUntilCompleted,
}

/** enums.h:687-691 */
export enum HgiMemoryBarrierBits {
  HgiMemoryBarrierNone = 0,
  HgiMemoryBarrierAll = 1 << 0,
}
/** enums.h:692 */
export type HgiMemoryBarrier = HgiBits

/** enums.h:721-728 */
export enum HgiBindingType {
  HgiBindingTypeValue = 0,
  HgiBindingTypeUniformValue,
  HgiBindingTypeArray,
  HgiBindingTypeUniformArray,
  HgiBindingTypePointer,
}

/** enums.h:749-754 */
export enum HgiInterpolationType {
  HgiInterpolationDefault = 0,
  HgiInterpolationFlat,
  HgiInterpolationNoPerspective,
}

/** enums.h:775-780 */
export enum HgiSamplingType {
  HgiSamplingDefault = 0,
  HgiSamplingCentroid,
  HgiSamplingSample,
}

/** enums.h:795-799 */
export enum HgiStorageType {
  HgiStorageDefault = 0,
  HgiStoragePatch,
}

/** enums.h:816-822 */
export enum HgiShaderTextureType {
  HgiShaderTextureTypeTexture = 0,
  HgiShaderTextureTypeShadowTexture,
  HgiShaderTextureTypeArrayTexture,
  HgiShaderTextureTypeCubemapTexture,
}

/** enums.h:835-839 */
export enum HgiComputeDispatch {
  HgiComputeDispatchSerial = 0,
  HgiComputeDispatchConcurrent,
}

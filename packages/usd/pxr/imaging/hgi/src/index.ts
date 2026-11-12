// typescript-usd/hgi — Hydra Graphics Interface.
// Mirrors pxr/imaging/hgi (OpenUSD 26.11.1): the abstract graphics API that
// Storm talks to and a backend implements (here typescript-usd/hgiWebGPU).

export * from './enums.ts'
export {
  HgiFormat,
  HgiGetComponentCount,
  HgiGetDataSizeOfFormat,
  HgiIsCompressed,
  HgiGetDataSize,
  HgiGetComponentBaseFormat,
  HgiIsFloatFormat,
  HgiGetMipInfos,
} from './types.ts'
export type { HgiMipInfo, HgiBlockSize } from './types.ts'
export { HgiHandle, HgiHandleVectorEquals } from './handle.ts'
export { HgiTokens, HgiShaderKeywordTokens } from './tokens.ts'
export { HgiDebugCodes } from './debugCodes.ts'
export {
  HgiAttachmentDesc,
  HgiAttachmentDescVectorEquals,
} from './attachmentDesc.ts'
export type { HgiAttachmentDescVector } from './attachmentDesc.ts'
export { HgiBufferDesc, HgiBuffer } from './buffer.ts'
export type { HgiBufferHandle, HgiBufferHandleVector, HgiCpuData } from './buffer.ts'
export {
  HgiComponentMapping,
  HgiTextureDesc,
  HgiTexture,
  HgiTextureViewDesc,
  HgiTextureView,
} from './texture.ts'
export type {
  HgiTextureHandle,
  HgiTextureHandleVector,
  HgiTextureViewHandle,
  HgiTextureViewHandleVector,
} from './texture.ts'
export { HGI_MAX_ANISOTROPY, HgiSamplerDesc, HgiSampler } from './sampler.ts'
export type { HgiSamplerHandle, HgiSamplerHandleVector } from './sampler.ts'
export {
  HgiShaderFunctionTextureDesc,
  HgiShaderFunctionBufferDesc,
  HgiShaderFunctionParamDesc,
  HgiShaderFunctionParamBlockDesc,
  HgiShaderFunctionParamBlockDescMember,
  HgiShaderFunctionComputeDesc,
  HgiShaderFunctionTessellationDesc,
  HgiShaderFunctionTessellationDescPatchType,
  HgiShaderFunctionTessellationDescSpacing,
  HgiShaderFunctionTessellationDescOrdering,
  HgiShaderFunctionGeometryDesc,
  HgiShaderFunctionGeometryDescInPrimitiveType,
  HgiShaderFunctionGeometryDescOutPrimitiveType,
  HgiShaderFunctionFragmentDesc,
  HgiShaderFunctionDesc,
  HgiShaderFunctionAddTexture,
  HgiShaderFunctionAddArrayOfTextures,
  HgiShaderFunctionAddWritableTexture,
  HgiShaderFunctionAddBuffer,
  HgiShaderFunctionAddWritableBuffer,
  HgiShaderFunctionAddConstantParam,
  HgiShaderFunctionAddStageInput,
  HgiShaderFunctionAddGlobalVariable,
  HgiShaderFunctionAddStageOutput,
} from './shaderFunctionDesc.ts'
export type {
  HgiShaderCodeOut,
  HgiShaderFunctionTextureDescVector,
  HgiShaderFunctionBufferDescVector,
  HgiShaderFunctionParamDescVector,
  HgiShaderFunctionParamBlockDescVector,
  HgiShaderFunctionDescVector,
} from './shaderFunctionDesc.ts'
export { HgiShaderFunction } from './shaderFunction.ts'
export type { HgiShaderFunctionHandle, HgiShaderFunctionHandleVector } from './shaderFunction.ts'
export { HgiShaderProgramDesc, HgiShaderProgram } from './shaderProgram.ts'
export type { HgiShaderProgramHandle, HgiShaderProgramHandleVector } from './shaderProgram.ts'
export { HgiShaderSection } from './shaderSection.ts'
export type { HgiShaderSectionAttribute, HgiShaderSectionAttributeVector } from './shaderSection.ts'
export { HgiShaderGenerator } from './shaderGenerator.ts'
export { HgiStringStream } from './stringStream.ts'
export {
  HgiBufferBindDesc,
  HgiTextureBindDesc,
  HgiResourceBindingsDesc,
  HgiResourceBindings,
  HgiVertexBufferBinding,
} from './resourceBindings.ts'
export type {
  HgiBufferBindDescVector,
  HgiTextureBindDescVector,
  HgiResourceBindingsHandle,
  HgiResourceBindingsHandleVector,
  HgiVertexBufferBindingVector,
} from './resourceBindings.ts'
export {
  HgiVertexAttributeDesc,
  HgiVertexBufferDesc,
  HgiMultiSampleState,
  HgiRasterizationState,
  HgiStencilState,
  HgiDepthStencilState,
  HgiGraphicsShaderConstantsDesc,
  HgiTessellationLevel,
  HgiTessellationState,
  HgiTessellationStatePatchType,
  HgiTessellationStateTessFactorMode,
  HgiGraphicsPipelineDesc,
  HgiGraphicsPipeline,
} from './graphicsPipeline.ts'
export type {
  HgiVertexAttributeDescVector,
  HgiVertexBufferDescVector,
  HgiGraphicsPipelineHandle,
  HgiGraphicsPipelineHandleVector,
} from './graphicsPipeline.ts'
export {
  HgiComputeShaderConstantsDesc,
  HgiComputePipelineDesc,
  HgiComputePipeline,
} from './computePipeline.ts'
export type { HgiComputePipelineHandle, HgiComputePipelineHandleVector } from './computePipeline.ts'
export { HgiCmds } from './cmds.ts'
export type { HgiCmdsUniquePtr } from './cmds.ts'
export {
  HgiTextureGpuToCpuOp,
  HgiTextureCpuToGpuOp,
  HgiBufferGpuToGpuOp,
  HgiBufferCpuToGpuOp,
  HgiBufferGpuToCpuOp,
  HgiTextureToBufferOp,
  HgiBufferToTextureOp,
} from './blitCmdsOps.ts'
export { HgiBlitCmds } from './blitCmds.ts'
export type { HgiBlitCmdsUniquePtr } from './blitCmds.ts'
export { HgiGraphicsCmdsDesc } from './graphicsCmdsDesc.ts'
export { HgiGraphicsCmds } from './graphicsCmds.ts'
export type { HgiGraphicsCmdsUniquePtr } from './graphicsCmds.ts'
export { HgiComputeCmdsDesc } from './computeCmdsDesc.ts'
export { HgiComputeCmds } from './computeCmds.ts'
export type { HgiComputeCmdsUniquePtr } from './computeCmds.ts'
export { HgiIndirectCommands, HgiIndirectCommandEncoder } from './indirectCommandEncoder.ts'
export type { HgiIndirectCommandsUniquePtr } from './indirectCommandEncoder.ts'
export { HgiCapabilities } from './capabilities.ts'
export { Hgi, HgiFactory, HgiGetTfType, HGI_ENABLE_VULKAN } from './hgi.ts'
export type { HgiUniquePtr, HgiFactoryBase } from './hgi.ts'
export {
  HgiInitializationTestDriver,
  HgiPipelineCreationTestDriver,
  HgiGfxCmdBfrExecutionTestDriver,
  glslfx_vertShaderStr,
  glslfx_fragShaderStr,
} from './unitTestHelper.ts'
export type { HgiUnitTestReadBack } from './unitTestHelper.ts'

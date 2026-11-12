// typescript-usd/hgiWebGPU — the WebGPU backend of the Hydra Graphics
// Interface (typescript-usd/hgi). Not an upstream OpenUSD library: it is
// modelled on pxr/imaging/hgiMetal and pxr/imaging/hgiVulkan, cited per file.
// Importing it registers the HgiWebGPU TfType and factory, so
// Hgi.CreatePlatformDefaultHgi() creates an HgiWebGPU.

export { HgiWebGPU, HgiWebGPUTokens } from './hgi.ts'
export { HgiWebGPUCapabilities } from './capabilities.ts'
export { HgiWebGPUGarbageCollector } from './garbageCollector.ts'
export type { HgiWebGPUTrashable } from './garbageCollector.ts'
export { HgiWebGPUConversions } from './conversions.ts'
export { HgiWebGPUBuffer } from './buffer.ts'
export { HgiWebGPUTexture } from './texture.ts'
export { HgiWebGPUSampler } from './sampler.ts'
export { HgiWebGPUShaderFunction } from './shaderFunction.ts'
export { HgiWebGPUShaderProgram } from './shaderProgram.ts'
export { HgiWebGPUShaderGenerator } from './shaderGenerator.ts'
export type { HgiWebGPUShaderGeneratorHgi } from './shaderGenerator.ts'
export {
  HgiWebGPUShaderSection,
  HgiWebGPUMacroShaderSection,
  HgiWebGPUMemberShaderSection,
  HgiWebGPUKeywordShaderSection,
  HgiWebGPUBlockShaderSection,
  HgiWebGPUTextureShaderSection,
  HgiWebGPUBufferShaderSection,
  HgiWebGPUInterstageBlockShaderSection,
} from './shaderSection.ts'
export { HgiWebGPUWgslPassThroughTranslator } from './shaderBodyTranslator.ts'
export type {
  HgiWebGPUShaderBodyTranslator,
  HgiWebGPUShaderBodyTranslatorInput,
  HgiWebGPUShaderBodyTranslation,
  HgiWebGPUShaderGlobal,
} from './shaderBodyTranslator.ts'
export {
  HgiWebGPUBufferBindGroup,
  HgiWebGPUTextureBindGroup,
  HgiWebGPUSamplerBindGroup,
  HgiWebGPUConstantsBindGroup,
  HgiWebGPUBindGroupCount,
  HgiWebGPUMergeBindGroupLayoutInfos,
  HgiWebGPUMakeBindGroupLayouts,
  HgiWebGPUBindingLimitsExceeded,
} from './bindGroupLayouts.ts'
export type {
  HgiWebGPUBindGroupLayoutInfo,
  HgiWebGPUBindGroupLayoutInfoVector,
  HgiWebGPUBindGroupLayouts,
} from './bindGroupLayouts.ts'
export { HgiWebGPUResourceBindings, HgiWebGPUConstantsAllocator } from './resourceBindings.ts'
export { HgiWebGPUGraphicsPipeline, HGIWEBGPU_FORCE_PACKED_ATTRIBUTES } from './graphicsPipeline.ts'
export { HgiWebGPUComputePipeline } from './computePipeline.ts'
export { HgiWebGPUGraphicsCmds } from './graphicsCmds.ts'
export { HgiWebGPUComputeCmds } from './computeCmds.ts'
export { HgiWebGPUBlitCmds } from './blitCmds.ts'
export { HgiWebGPUGlslShaderBodyTranslator } from './glsl/glslShaderBodyTranslator.ts'

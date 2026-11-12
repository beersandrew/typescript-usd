// Ported from OpenUSD 26.11.1: pxr/imaging/hdx/pickTask.h
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// hdx/pickTask.h (HdxPickTask, its params and hits, HdxPrimOriginInfo).
export {
  HdxPickTask as PickTask,
  HdxPickTaskParams as PickTaskParams,
  HdxPickTaskParamsType as PickTaskParamsType,
  HdxPickTaskContextParams as PickTaskContextParams,
  HdxPickTaskContextParamsType as PickTaskContextParamsType,
  HdxPickHit as PickHit,
  HdxPickHitType as PickHitType,
  HdxPickHitLess as PickHitLess,
  HdxPickResult as PickResult,
  HdxPickTokens as PickTokens,
  HdxPickResolveModeTokens as PickResolveModeTokens,
  HdxPrimOriginInfo as PrimOriginInfo,
} from "./pickTask.ts";
export type { HdxPickHitVector as PickHitVector, HdxInstancerContext as InstancerContext } from "./pickTask.ts";
export { HdxRenderTaskParams as RenderTaskParams } from "./renderSetupTask.ts";

export {HdxPackageDefaultDomeLightTexture as packageDefaultDomeLightTexture} from './package.ts'
export {
  HdxSimpleLightTask as SimpleLightTask,
  HdxSimpleLightTaskParams as SimpleLightTaskParams,
  HdxSimpleLightTaskParamsType as SimpleLightTaskParamsType,
  HdxSimpleLightTaskTokens as SimpleLightTaskTokens,
  HdxShadowParams as ShadowParams,
  HdxShadowParamsType as ShadowParamsType,
  HdxShadowMatrixComputation as ShadowMatrixComputation,
  HdxLightingTokens as LightingTokens,
} from './simpleLightTask.ts'
// The post-process tasks and the fullscreen shader (hdx fork C).
export { HdxEffectsShader as EffectsShader } from './effectsShader.ts'
export { HdxFullscreenShader as FullscreenShader } from './fullscreenShader.ts'
export { HdxHgiConversions as HgiConversions } from './hgiConversions.ts'
export { HdxShaderInputs as ShaderInputs, HdxGetHioFormat as GetHioFormat } from './types.ts'
export {
  HdxAovInputTask as AovInputTask, HdxAovInputTaskParams as AovInputTaskParams,
  HdxAovInputTaskParamsType as AovInputTaskParamsType,
} from './aovInputTask.ts'
export {
  HdxColorCorrectionTask as ColorCorrectionTask, HdxColorCorrectionTaskParams as ColorCorrectionTaskParams,
  HdxColorCorrectionTaskParamsType as ColorCorrectionTaskParamsType,
} from './colorCorrectionTask.ts'
export {
  HdxColorChannelTask as ColorChannelTask, HdxColorChannelTaskParams as ColorChannelTaskParams,
  HdxColorChannelTaskParamsType as ColorChannelTaskParamsType,
} from './colorChannelTask.ts'
export {
  HdxVisualizeAovTask as VisualizeAovTask, HdxVisualizeAovTaskParams as VisualizeAovTaskParams,
  HdxVisualizeAovTaskParamsType as VisualizeAovTaskParamsType,
} from './visualizeAovTask.ts'
export {
  HdxPresentTask as PresentTask, HdxPresentTaskParams as PresentTaskParams,
  HdxPresentTaskParamsType as PresentTaskParamsType,
} from './presentTask.ts'
export {
  HdxBoundingBoxTask as BoundingBoxTask, HdxBoundingBoxTaskParams as BoundingBoxTaskParams,
  HdxBoundingBoxTaskParamsType as BoundingBoxTaskParamsType,
} from './boundingBoxTask.ts'
export { HdxSkydomeTask as SkydomeTask } from './skydomeTask.ts'
// hdx core: tokens, the task base, render setup / render tasks, selection,
// shadows, OIT, the free camera and the task controller scene index.
export {
  HdxTokens as Tokens, HdxPrimitiveTokens as PrimitiveTokens, HdxRenderTagTokens as RenderTagTokens,
  HdxColorCorrectionTokens as ColorCorrectionTokens, HdxColorChannelTokens as ColorChannelTokens,
  HdxAovTokens as AovTokens,
} from './tokens.ts'
export { HdxDebugCodes as DebugCodes } from './debugCodes.ts'
export { HdxTask as Task } from './task.ts'
export { HdxRenderSetupTask as RenderSetupTask, HdxRenderTaskParamsType as RenderTaskParamsType } from './renderSetupTask.ts'
export { HdxRenderTask as RenderTask } from './renderTask.ts'
export {
  HdxSelectionTask as SelectionTask, HdxSelectionTaskParams as SelectionTaskParams,
  HdxSelectionTaskParamsType as SelectionTaskParamsType,
} from './selectionTask.ts'
export { HdxSelectionTracker as SelectionTracker } from './selectionTracker.ts'
export { HdxSelectionSceneIndexObserver as SelectionSceneIndexObserver } from './selectionSceneIndexObserver.ts'
export {
  HdxColorizeSelectionTask as ColorizeSelectionTask, HdxColorizeSelectionTaskParams as ColorizeSelectionTaskParams,
  HdxColorizeSelectionTaskParamsType as ColorizeSelectionTaskParamsType,
} from './colorizeSelectionTask.ts'
export {
  HdxShadowTask as ShadowTask, HdxShadowTaskParams as ShadowTaskParams,
  HdxShadowTaskParamsType as ShadowTaskParamsType,
} from './shadowTask.ts'
export { HdxOitBufferAccessor as OitBufferAccessor } from './oitBufferAccessor.ts'
export { HdxOitRenderTask as OitRenderTask } from './oitRenderTask.ts'
export { HdxOitVolumeRenderTask as OitVolumeRenderTask } from './oitVolumeRenderTask.ts'
export {
  HdxOitResolveTask as OitResolveTask, HdxOitResolveTaskParams as OitResolveTaskParams,
  HdxOitResolveTaskParamsType as OitResolveTaskParamsType,
} from './oitResolveTask.ts'
export {
  HdxPickFromRenderBufferTask as PickFromRenderBufferTask,
  HdxPickFromRenderBufferTaskParams as PickFromRenderBufferTaskParams,
  HdxPickFromRenderBufferTaskParamsType as PickFromRenderBufferTaskParamsType,
} from './pickFromRenderBufferTask.ts'
export { HdxFreeCameraPrimDataSource as FreeCameraPrimDataSource } from './freeCameraPrimDataSource.ts'
export {
  HdxTaskControllerSceneIndex as TaskControllerSceneIndex, HDX_MSAA_SAMPLE_COUNT,
  type HdxTaskControllerSceneIndexParameters as TaskControllerSceneIndexParameters,
} from './taskControllerSceneIndex.ts'
export * as HdxPackage from './package.ts'
// Test support (hdx/unitTestDelegate.h, unitTestUtils.h).
export { Hdx_UnitTestDelegate as _UnitTestDelegate } from './unitTestDelegate.ts'
export { HdxUnitTestUtils as _UnitTestUtils } from './unitTestUtils.ts'
export { Hdx_RegisterShaderResources as _RegisterShaderResources } from './shaderResources.ts'

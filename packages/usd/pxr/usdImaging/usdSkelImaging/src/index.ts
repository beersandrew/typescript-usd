// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdSkelImaging/plugInfo.json
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// typescript-usd/usdSkelImaging — OpenUSD 26.11.1 pxr/usdImaging/usdSkelImaging
// (scene index side), for the UsdImaging -> Hydra -> Storm chain.
//
// Importing this entry does what loading the plugin does upstream
// (usdSkelImaging/plugInfo.json): it registers the adapter types (plugInfo.ts)
// with UsdImagingAdapterRegistry and defines the
// UsdSkelImagingResolvingSceneIndexPlugin UsdImagingSceneIndexPlugin
// (resolvingSceneIndexPlugin.ts). Import it before the first
// UsdImagingStageSceneIndex / UsdImagingCreateSceneIndices is created.
import './plugInfo.ts'
import './resolvingSceneIndexPlugin.ts'

export * from './tokens.ts'
export * from './animationSchema.ts'
export * from './bindingSchema.ts'
export * from './blendShapeSchema.ts'
export * from './inbetweenShapeSchema.ts'
export * from './resolvedSkeletonSchema.ts'
export * from './skeletonSchema.ts'
export { UsdSkelImagingAnimationAdapter } from './animationAdapter.ts'
export { UsdSkelImagingBindingAPIAdapter } from './bindingAPIAdapter.ts'
export { UsdSkelImagingBlendShapeAdapter } from './blendShapeAdapter.ts'
export { UsdSkelImagingSkeletonAdapter } from './skeletonAdapter.ts'
export { UsdSkelImagingSkelRootAdapter } from './skelRootAdapter.ts'
export { UsdSkelImagingDataSourceAnimationPrim } from './dataSourceAnimationPrim.ts'
export { UsdSkelImagingDataSourceBindingAPI } from './dataSourceBindingAPI.ts'
export { UsdSkelImagingDataSourceBlendShapePrim } from './dataSourceBlendShapePrim.ts'
export { UsdSkelImagingDataSourceSkeletonPrim } from './dataSourceSkeletonPrim.ts'
export { UsdSkelImaging_DataSourcePrimvar } from './dataSourcePrimvar.ts'
export { UsdSkelImagingSharedPtrThunk, UsdSkelImagingGetTypedValue } from './dataSourceUtils.ts'
export { UsdSkelImagingDataSourceXformResolver } from './xformResolver.ts'
export {
  UsdSkelImagingSkelData, UsdSkelImagingComputeSkelData, UsdSkelImagingComputeSkinningTransforms,
} from './skelData.ts'
export {
  type UsdSkelImagingSkelGuideData, UsdSkelImagingComputeSkelGuideData,
  UsdSkelImagingComputeSkelGuideFaceVertexCounts, UsdSkelImagingComputeSkelGuideFaceVertexIndices,
  UsdSkelImagingComputeSkelGuidePoints,
} from './skelGuideData.ts'
export {
  UsdSkelImagingComputeBoneTopology, UsdSkelImagingComputeBonePoints,
  UsdSkelImagingComputeBoneJointIndices, UsdSkelImagingComputePointsForSingleBone,
} from './utils.ts'
export { type UsdSkelImagingJointInfluencesData, UsdSkelImagingComputeJointInfluencesData } from './jointInfluencesData.ts'
export {
  type UsdSkelImagingWeightAndSubShapeIndex, type UsdSkelImagingWeightsAndSubShapeIndices,
  type UsdSkelImagingBlendShapeData, UsdSkelImagingComputeBlendShapeData, UsdSkelImagingComputeBlendShapeWeights,
} from './blendShapeData.ts'
export {
  USDSKELIMAGING_FORCE_CPU_COMPUTE, USDSKELIMAGING_ENABLE_NORMAL_COMPUTATIONS,
  type UsdSkelImagingExtComputationContext, UsdSkelImagingInvokeExtComputation,
  UsdSkelImagingExtComputationCpuCallback, UsdSkelImagingExtComputationGlslKernel,
} from './extComputations.ts'
export { UsdSkelImagingDataSourceResolvedSkeletonPrim } from './dataSourceResolvedSkeletonPrim.ts'
export { UsdSkelImagingDataSourceResolvedPointsBasedPrim } from './dataSourceResolvedPointsBasedPrim.ts'
export { UsdSkelImagingDataSourceResolvedExtComputationPrim } from './dataSourceResolvedExtComputationPrim.ts'
export { UsdSkelImagingSkeletonResolvingSceneIndex } from './skeletonResolvingSceneIndex.ts'
export { UsdSkelImagingPointsResolvingSceneIndex } from './pointsResolvingSceneIndex.ts'
export { UsdSkelImagingResolvingSceneIndexPlugin } from './resolvingSceneIndexPlugin.ts'

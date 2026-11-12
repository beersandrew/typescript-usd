import './plugin/registerPlugin.ts'
export { UsdSkelTopology as Topology, computeParentIndicesFromPaths } from "./topology.ts";
export { UsdSkelAnimMapper as AnimMapper } from "./animMapper.ts";
export {
  makeTransform,
  makeTransforms,
  decomposeTransform,
  decomposeTransforms,
  concatJointTransforms,
  computeJointLocalTransforms,
  computeJointsExtent,
  normalizeWeights,
  sortInfluences,
  expandConstantInfluencesToVarying,
  resizeInfluences,
  skinPointsLBS,
  skinPointsDQS,
  skinNormals,
  skinNormalsDQS,
  applyBlendShape,
  interleaveInfluences,
  isSkelAnimationPrim,
  isSkinnablePrim,
  interleaveInfluences as InterleaveInfluences,
  isSkelAnimationPrim as IsSkelAnimationPrim,
  isSkinnablePrim as IsSkinnablePrim,
  makeTransform as UsdSkelMakeTransform,
  makeTransforms as UsdSkelMakeTransforms,
  decomposeTransform as UsdSkelDecomposeTransform,
  decomposeTransforms as UsdSkelDecomposeTransforms,
  concatJointTransforms as UsdSkelConcatJointTransforms,
  computeJointLocalTransforms as UsdSkelComputeJointLocalTransforms,
  computeJointsExtent as UsdSkelComputeJointsExtent,
  normalizeWeights as UsdSkelNormalizeWeights,
  sortInfluences as UsdSkelSortInfluences,
  expandConstantInfluencesToVarying as UsdSkelExpandConstantInfluencesToVarying,
  resizeInfluences as UsdSkelResizeInfluences,
  skinPointsLBS as UsdSkelSkinPointsLBS,
  skinNormals as UsdSkelSkinNormalsLBS,
  skinNormals as UsdSkelSkinFaceVaryingNormalsLBS,
} from "./utils.ts";
export type { UsdSkelInfluenceArray, UsdSkelTransformComponents } from "./utils.ts";
export { Root } from './root.ts'
export { Skeleton } from './skeleton.ts'
export { Animation } from './animation.ts'
export { BindingAPI } from './bindingAPI.ts'
export { BlendShape } from './blendShape.ts'
export { InbetweenShape } from './inbetweenShape.ts'
export { Binding } from './binding.ts'
export { UsdSkelTokens as Tokens, UsdSkelTokens } from './tokens.ts'
export type { UsdSkelAnimMapper as UsdSkelAnimMapperRefPtr } from './animMapper.ts'
export type { UsdSkelAnimQuery as UsdSkel_AnimQueryImpl } from './queries.ts'
export type { UsdSkelCache as UsdSkel_CacheImpl } from './queries.ts'
export type { UsdSkelSkeletonQuery as UsdSkel_SkelDefinition } from './queries.ts'
export { UsdSkelAnimQuery as AnimQuery, UsdSkelSkeletonQuery as SkeletonQuery, UsdSkelSkinningQuery as SkinningQuery, UsdSkelCache as Cache, computeSkelBindings } from "./queries.ts";
export type { SkelBinding } from "./queries.ts";
export { UsdSkelBlendShapeQuery as BlendShapeQuery, makeBlendShapeQuery } from "./blendShapeQuery.ts";
export type { ResolvedBlendShape, ResolvedInbetween } from "./blendShapeQuery.ts";
export { bakeSkinning, bakeSkinning as BakeSkinning, BakeSkinningParms } from './bakeSkinning.ts'
export {
  skinPointsWithMethod as UsdSkelSkinPoints,
  skinNormalsWithMethod as UsdSkelSkinNormals,
  skinFaceVaryingNormalsWithMethod as UsdSkelSkinFaceVaryingNormals,
  skinTransformWithMethod as UsdSkelSkinTransform,
} from './utils.ts'
export type { SkinningMatrixType as UsdSkelSkinningMatrixType } from './utils.ts'

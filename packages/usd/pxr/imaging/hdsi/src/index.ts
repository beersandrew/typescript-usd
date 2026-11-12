// Ported from OpenUSD 26.11.1: pxr/imaging/hdsi/plugInfo.json
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Upstream registers hdsi's plugInfo.json (its shader resources and the Type
// of its prim id scene index plugin) at startup and runs the
// TF_REGISTRY_FUNCTION blocks of primIdSceneIndexPlugin.cpp when it loads
// hdsi; importing this module plays that part.
import { Hdsi_RegisterShaderResources } from './shaderResources.ts'
Hdsi_RegisterShaderResources()
import './primIdSceneIndexPlugin.ts'

export { HdsiLegacyDisplayStyleOverrideSceneIndex as LegacyDisplayStyleOverrideSceneIndex } from './legacyDisplayStyleOverrideSceneIndex.ts'
export { HdsiMaterialBindingResolvingSceneIndex as MaterialBindingResolvingSceneIndex } from './materialBindingResolvingSceneIndex.ts'
export { HdSiNodeIdentifierResolvingSceneIndex as NodeIdentifierResolvingSceneIndex } from './nodeIdentifierResolvingSceneIndex.ts'
export { HdsiMaterialPrimvarTransferSceneIndex as MaterialPrimvarTransferSceneIndex } from './materialPrimvarTransferSceneIndex.ts'
export type { HdsiMaterialPrimvarTransferSceneIndexComposeFn as MaterialPrimvarTransferSceneIndexComposeFn } from './materialPrimvarTransferSceneIndex.ts'
export { HdsiUnboundMaterialPruningSceneIndex as UnboundMaterialPruningSceneIndex, HdsiUnboundMaterialPruningSceneIndexTokens as UnboundMaterialPruningSceneIndexTokens } from './unboundMaterialPruningSceneIndex.ts'
export { HdsiLocatorCachingSceneIndex as LocatorCachingSceneIndex } from './locatorCachingSceneIndex.ts'
export { HdsiSceneGlobalsSceneIndex as SceneGlobalsSceneIndex, HDSI_SGSI_API_VERSION as SGSI_API_VERSION } from './sceneGlobalsSceneIndex.ts'
export { HdsiDomeLightCameraVisibilitySceneIndex as DomeLightCameraVisibilitySceneIndex, HdsiDomeLightCameraVisibilitySceneIndexTokens as DomeLightCameraVisibilitySceneIndexTokens } from './domeLightCameraVisibilitySceneIndex.ts'
export { HdsiSceneMaterialPruningSceneIndex as SceneMaterialPruningSceneIndex } from './sceneMaterialPruningSceneIndex.ts'
export { HdsiPrefixPathPruningSceneIndex as PrefixPathPruningSceneIndex, HdsiPrefixPathPruningSceneIndexTokens as PrefixPathPruningSceneIndexTokens } from './prefixPathPruningSceneIndex.ts'
export { HdsiPrimTypeAndPathPruningSceneIndex as PrimTypeAndPathPruningSceneIndex, HdsiPrimTypeAndPathPruningSceneIndexTokens as PrimTypeAndPathPruningSceneIndexTokens } from './primTypeAndPathPruningSceneIndex.ts'
export type { HdsiPrimTypeAndPathPruningSceneIndexPathPredicate as PrimTypeAndPathPruningSceneIndexPathPredicate } from './primTypeAndPathPruningSceneIndex.ts'
export { HdsiImplicitSurfaceSceneIndex as ImplicitSurfaceSceneIndex, HdsiImplicitSurfaceSceneIndexTokens as ImplicitSurfaceSceneIndexTokens } from './implicitSurfaceSceneIndex.ts'
export { HdsiNurbsApproximatingSceneIndex as NurbsApproximatingSceneIndex } from './nurbsApproximatingSceneIndex.ts'
export { HdsiTetMeshConversionSceneIndex as TetMeshConversionSceneIndex } from './tetMeshConversionSceneIndex.ts'
export { HdsiVelocityMotionResolvingSceneIndex as VelocityMotionResolvingSceneIndex, HdsiVelocityMotionResolvingSceneIndexTokens as VelocityMotionResolvingSceneIndexTokens, HDSI_VELOCITY_MOTION } from './velocityMotionResolvingSceneIndex.ts'
export { HdsiBackPlateSceneIndex as BackPlateSceneIndex } from './backPlateSceneIndex.ts'
export { HdsiPrimIdSceneIndex as PrimIdSceneIndex } from './primIdSceneIndex.ts'
export { HdsiRenderPassPruneSceneIndex as RenderPassPruneSceneIndex } from './renderPassPruneSceneIndex.ts'
export { HdsiPrimIdSceneIndexPlugin as _PrimIdSceneIndexPlugin } from './primIdSceneIndexPlugin.ts'
export { HdsiUtilsCompileCollection as UtilsCompileCollection, HdsiUtilsIsPruned as UtilsIsPruned, HdsiUtilsRemovePrunedChildren as UtilsRemovePrunedChildren } from './utils.ts'
export type { HdsiUtilsCompiledCollection as UtilsCompiledCollection } from './utils.ts'
export { Hdsi_RegisterShaderResources as _RegisterShaderResources, Hdsi_PlugInfo as _PlugInfo } from './shaderResources.ts'

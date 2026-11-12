// typescript-usd/pcp — the Prim Cache Population (composition) library.
//
// Faithful port of OpenUSD pxr/usd/pcp: builds per-prim composition node
// graphs (PcpPrimIndex) that typescript-usd/usd consumes for value resolution. This is
// THE composition engine behind typescript-usd/usd's Stage (the inline
// collect-and-sort engine it replaced was deleted 2026-06-23).
//
// Phase 0 — leaf value types. Layer stacks (Phase 1), map functions (Phase 2),
// and the prim-index graph + builder (Phase 3) follow.

export {
  PcpArcType as ArcType,
  PcpArc,
  PcpArcTypeRoot, PcpArcTypeReference, PcpArcTypePayload,
  PcpArcTypeInherit, PcpArcTypeSpecialize, PcpArcTypeVariant,
  PcpArcTypeRelocate,
  pcpIsInheritArc, pcpIsSpecializeArc, pcpIsClassBasedArc,
  pcpCompareArcTypeStrength,
} from "./arc.ts";

export { SDF_LAYER_OFFSET_IDENTITY, sdfLayerOffsetApply, sdfLayerOffsetCompose, sdfLayerOffsetInverse, sdfLayerOffsetIsIdentity, sdfLayerOffsetEquals } from "typescript-usd/sdf/layerOffset";
export type { SdfLayerOffset } from "typescript-usd/sdf/layerOffset";

export { pcpLayerStackIdentifier, pcpLayerStackIdentifierKey, pcpLayerStackIdentifierEquals, pcpLayerPathKey, pcpReadField as _pcpReadField } from "./layerStackIdentifier.ts";
export type { PcpLayerHandle as LayerHandle, PcpLayer as Layer, PcpLayerOpener as LayerOpener, PcpLayerStackIdentifier as LayerStackIdentifier } from "./layerStackIdentifier.ts";
export { pcpSite, pcpSiteKey, pcpSiteEquals } from "./site.ts";
export type { PcpSite as Site } from "./site.ts";
export { PcpLayerStackSite, PcpLayerStackSite as LayerStackSite } from "./site.ts";

export { computePcpLayerStack, pcpIsSessionOwnerSublayerReorderingEnabled as IsSessionOwnerSublayerReorderingEnabled } from "./layerStack.ts";
export { PcpLayerStack as LayerStack } from "./layerStack.ts";
export type { PcpLayerStackLayer as LayerStackLayer } from "./layerStack.ts";

export {
  PcpErrorType as ErrorType, PcpRelocateConflictReason as RelocateConflictReason,
  PcpErrorType_ArcCycle, PcpErrorType_ArcPermissionDenied,
  PcpErrorType_ArcToProhibitedChild, PcpErrorType_IndexCapacityExceeded,
  PcpErrorType_ArcCapacityExceeded, PcpErrorType_ArcNamespaceDepthCapacityExceeded,
  PcpErrorType_InconsistentPropertyType, PcpErrorType_InconsistentAttributeType,
  PcpErrorType_InconsistentAttributeVariability, PcpErrorType_InternalAssetPath,
  PcpErrorType_InvalidPrimPath, PcpErrorType_InvalidAssetPath,
  PcpErrorType_InvalidInstanceTargetPath, PcpErrorType_InvalidExternalTargetPath,
  PcpErrorType_InvalidTargetPath, PcpErrorType_InvalidReferenceOffset,
  PcpErrorType_InvalidSublayerOffset, PcpErrorType_InvalidSublayerOwnership,
  PcpErrorType_InvalidSublayerPath, PcpErrorType_InvalidVariantSelection,
  PcpErrorType_MutedAssetPath, PcpErrorType_InvalidAuthoredRelocation,
  PcpErrorType_InvalidConflictingRelocation, PcpErrorType_InvalidSameTargetRelocations,
  PcpErrorType_OpinionAtRelocationSource, PcpErrorType_PrimPermissionDenied,
  PcpErrorType_PropertyPermissionDenied, PcpErrorType_SublayerCycle,
  PcpErrorType_TargetPermissionDenied, PcpErrorType_UnresolvedPrimPath,
  PcpErrorType_VariableExpressionError, PcpErrorType_InvalidSublayerAndOffsetCount,
} from "./errors.ts";
export {
  PcpErrorBase as ErrorBase,
  PcpErrorTargetPathBase as ErrorTargetPathBase,
  PcpErrorRelocationBase as ErrorRelocationBase,
  PcpErrorArcCycle as ErrorArcCycle,
  PcpErrorArcPermissionDenied as ErrorArcPermissionDenied,
  PcpErrorArcToProhibitedChild as ErrorArcToProhibitedChild,
  PcpErrorCapacityExceeded as ErrorCapacityExceeded,
  PcpErrorInconsistentPropertyType as ErrorInconsistentPropertyType,
  PcpErrorInconsistentAttributeType as ErrorInconsistentAttributeType,
  PcpErrorInconsistentAttributeVariability as ErrorInconsistentAttributeVariability,
  PcpErrorInvalidPrimPath as ErrorInvalidPrimPath,
  PcpErrorInvalidAssetPathBase as ErrorInvalidAssetPathBase,
  PcpErrorInvalidAssetPath as ErrorInvalidAssetPath,
  PcpErrorMutedAssetPath as ErrorMutedAssetPath,
  PcpErrorInvalidInstanceTargetPath as ErrorInvalidInstanceTargetPath,
  PcpErrorInvalidExternalTargetPath as ErrorInvalidExternalTargetPath,
  PcpErrorInvalidTargetPath as ErrorInvalidTargetPath,
  PcpErrorInvalidSublayerOffset as ErrorInvalidSublayerOffset,
  PcpErrorInvalidReferenceOffset as ErrorInvalidReferenceOffset,
  PcpErrorInvalidSublayerOwnership as ErrorInvalidSublayerOwnership,
  PcpErrorInvalidSublayerPath as ErrorInvalidSublayerPath,
  PcpErrorInvalidAuthoredRelocation as ErrorInvalidAuthoredRelocation,
  PcpErrorInvalidConflictingRelocation as ErrorInvalidConflictingRelocation,
  PcpErrorInvalidSameTargetRelocations as ErrorInvalidSameTargetRelocations,
  PcpErrorOpinionAtRelocationSource as ErrorOpinionAtRelocationSource,
  PcpErrorPrimPermissionDenied as ErrorPrimPermissionDenied,
  PcpErrorPropertyPermissionDenied as ErrorPropertyPermissionDenied,
  PcpErrorSublayerCycle as ErrorSublayerCycle,
  PcpErrorTargetPermissionDenied as ErrorTargetPermissionDenied,
  PcpErrorUnresolvedPrimPath as ErrorUnresolvedPrimPath,
  PcpErrorVariableExpressionError as ErrorVariableExpressionError,
  PcpErrorInvalidSublayerAndOffsetCount as ErrorInvalidSublayerAndOffsetCount,
} from "./errors.ts";
export type { PcpError as Error, PcpRelocationSource as RelocationSource, PcpSiteTrackerSegment as SiteTrackerSegment } from "./errors.ts";

export { PcpMapFunction as MapFunction } from "./mapFunction.ts";
export type { PcpPathPair as PathPair } from "./mapFunction.ts";
export { PcpMapExpression as MapExpression, PcpMapExpressionVariable as MapExpressionVariable } from "./mapExpression.ts";
export { PcpExpressionVariablesSource as ExpressionVariablesSource } from "./expressionVariablesSource.ts";
export { PcpExpressionVariables as ExpressionVariables } from "./expressionVariables.ts";
export { PcpExpressionVariablesDependencyData as ExpressionVariablesDependencyData } from "./expressionVariablesDependencyData.ts";
export { PcpDynamicFileFormatContext as DynamicFileFormatContext } from "./dynamicFileFormatContext.ts";
export { PcpDynamicFileFormatDependencyData as DynamicFileFormatDependencyData } from "./dynamicFileFormatDependencyData.ts";
export type { PcpDynamicFileFormatInterface as DynamicFileFormatInterface } from "./dynamicFileFormatInterface.ts";

export { PcpNodeRef as NodeRef, PcpNodeRef as PcpNodeRef, PcpNodeRef as Node, pcpGetSubtreeRange, pcpNodeGetNonVariantPathElementCount } from "./node.ts";
export { pcpCompareNodeStrength, pcpCompareSiblingNodeStrength, pcpCompareSiblingPayloadNodeStrength } from "./strengthOrdering.ts";
export { PcpPrimIndex_Graph as PrimIndex_Graph, PcpRangeType as RangeType } from "./primIndex_Graph.ts";
export type { PcpSdSite as SdSite } from "./primIndex_Graph.ts";
export {
  PcpNodeIterator as NodeIterator, PcpNodeReverseIterator as NodeReverseIterator,
  PcpPrimIterator as PrimIterator, PcpPrimReverseIterator as PrimReverseIterator,
  PcpPropertyIterator as PropertyIterator, PcpPropertyReverseIterator as PropertyReverseIterator,
  PcpNodeRange as NodeRange, PcpPrimRange as PrimRange, PcpPropertyRange as PropertyRange,
} from "./iterator.ts";
export type { PcpReverseRange as ReverseRange } from "./iterator.ts";
export { PcpLayerStack, PcpNeedsLayer } from "./layerStack.ts";
export type { PcpLayerSource as LayerSource } from "./layerStack.ts";
export { PcpLayerStackRegistry as LayerStackRegistry } from "./layerStackRegistry.ts";
export { pcpComposeSiteReferences, pcpComposeSitePayloads, pcpComposeSiteInherits, pcpComposeSiteSpecializes, pcpComposeSiteVariantSets, pcpComposeSiteVariantSetOptions, pcpComposeSiteVariantSelection, pcpComposeSiteVariantSelections, pcpComposeSiteHasVariantSelections, pcpComposeSiteChildNames, pcpComposeSiteHasSpecs, pcpComposeSitePrimSites, pcpComposeSitePermission, pcpComposeSiteHasValueClips } from "./composeSite.ts";
export { PcpArcInfo, PcpArcInfo as ArcInfo } from "./composeSite.ts";
export type { PcpReference as Reference } from "./composeSite.ts";
export { PcpPrimIndex as PrimIndex, PcpPrimIndexOutputs as PrimIndexOutputs, PcpPrimIndexInputs as PrimIndexInputs, pcpComputePrimIndex, pcpComputePrimStackForPrimIndex, pcpNeedToRecomputeDueToAssetPathChange, pcpRescanForSpecs } from "./primIndex.ts";
export type { PcpPrimStackEntry as PrimStackEntry, PcpCulledDependency as CulledDependency } from "./primIndex.ts";
export { PcpCache as Cache } from "./cache.ts";
export { pcpForEachDependentNode } from "./cache.ts";
export type { PcpComputationEventKind as ComputationEventKind } from "./cache.ts";
export { PcpDependencies as Dependencies } from "./dependencies.ts";
export {
  PcpChanges as Changes, PcpCacheChanges as CacheChanges, PcpLayerStackChanges as LayerStackChanges,
  PcpLifeboat as Lifeboat, PcpCacheChangesTargetType as CacheChangesTargetType,
  PcpChangeSpecsType as ChangeSpecsType, _setPcpEnableMinimalChangesForLayerOperations,
} from "./changes.ts";
export { PcpTestChangeProcessor as _TestChangeProcessor } from "./testChangeProcessor.ts";
export { pcpInstanceKey, PcpInstanceKey, PcpInstanceKey as InstanceKey } from "./instanceKey.ts";
export { pcpPrimIndexIsInstanceable, pcpChildNodeIsInstanceable, pcpInstancingIsEnabled } from "./instancing.ts";
export {
  PcpDependency, PcpDependency as Dependency,
  PcpDependencyType as DependencyType,
  PcpDependencyTypeNone, PcpDependencyTypeRoot,
  PcpDependencyTypePurelyDirect, PcpDependencyTypePartlyDirect,
  PcpDependencyTypeAncestral, PcpDependencyTypeVirtual,
  PcpDependencyTypeNonVirtual, PcpDependencyTypeDirect,
  PcpDependencyTypeAnyNonVirtual, PcpDependencyTypeAnyIncludingVirtual,
  pcpNodeIntroducesDependency, pcpClassifyNodeDependency,
  pcpDependencyFlagsToString,
} from "./dependency.ts";
export type { PcpDependencyFlags as DependencyFlags } from "./dependency.ts";
export {
  PcpPropertyIndex as PropertyIndex,
  pcpBuildPropertyIndex, pcpBuildPrimPropertyIndex,
} from "./propertyIndex.ts";
export {
  PcpTargetIndex as TargetIndex,
  pcpBuildTargetIndex, pcpBuildFilteredTargetIndex,
} from "./targetIndex.ts";
export { pcpTranslatePathFromNodeToRoot, pcpTranslatePathFromRootToNode, pcpTranslateTargetPathFromRootToNode, pcpTranslatePathFromRootToNodeUsingFunction, pcpTranslatePathFromNodeToRootUsingFunction } from "./pathTranslation.ts";
export { PcpLayerRelocatesEditBuilder, PcpLayerRelocatesEditBuilder as LayerRelocatesEditBuilder, pcpModifyRelocates } from "./layerRelocatesEditBuilder.ts";
export type { PcpRelocates as Relocates, PcpLayerRelocatesEdit as LayerRelocatesEdit } from "./layerRelocatesEditBuilder.ts";
export { PcpDependentNamespaceEdits, PcpDependentNamespaceEdits as DependentNamespaceEdits, pcpGatherDependentNamespaceEdits, pcpGatherLayersToEditForSpecMove } from "./dependentNamespaceEditUtils.ts";
export type { PcpCompositionFieldEdit as CompositionFieldEdit, PcpMoveEditDescription as MoveEditDescription } from "./dependentNamespaceEditUtils.ts";

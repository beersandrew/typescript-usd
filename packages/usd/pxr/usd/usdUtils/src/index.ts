// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usdUtils/coalescingDiagnosticDelegate.h,
//  pxr/usd/usdUtils/conditionalAbortDiagnosticDelegate.h,
//  pxr/usd/usdUtils/registeredVariantSet.h
// Copyright 2016, 2017, 2020 Pixar. Tomorrow Open Source Technology License
//  1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD pxr/usd/usdUtils: utilities for dependency analysis, asset
// localization and usdz packaging, layer flattening and stitching, value
// clips, sparse authoring, pipeline conventions and diagnostics
// (pxr/usd/usdUtils/CMakeLists.txt:4-37).
//
// Classes drop the UsdUtils prefix as the other library entries do; free
// functions keep their upstream names (docs/style-guide.md rule 1).

export { UsdUtilsDebugCodes as DebugCodes } from './debugCodes.ts'

// coalescingDiagnosticDelegate (coalescingDiagnosticDelegate.h)
export {
  UsdUtilsCoalescingDiagnosticDelegate as CoalescingDiagnosticDelegate,
  type UsdUtilsCoalescingDiagnosticDelegateSharedItem as CoalescingDiagnosticDelegateSharedItem,
  type UsdUtilsCoalescingDiagnosticDelegateUnsharedItem as CoalescingDiagnosticDelegateUnsharedItem,
  type UsdUtilsCoalescingDiagnosticDelegateItem as CoalescingDiagnosticDelegateItem,
  type UsdUtilsCoalescingDiagnosticDelegateVector as CoalescingDiagnosticDelegateVector,
} from './coalescingDiagnosticDelegate.ts'

// conditionalAbortDiagnosticDelegate (conditionalAbortDiagnosticDelegate.h)
export {
  UsdUtilsConditionalAbortDiagnosticDelegate as ConditionalAbortDiagnosticDelegate,
  UsdUtilsConditionalAbortDiagnosticDelegateErrorFilters as ConditionalAbortDiagnosticDelegateErrorFilters,
} from './conditionalAbortDiagnosticDelegate.ts'

// registeredVariantSet (registeredVariantSet.h)
export {
  UsdUtilsRegisteredVariantSet as RegisteredVariantSet,
  UsdUtilsRegisteredVariantSetSelectionExportPolicy as RegisteredVariantSetSelectionExportPolicy,
} from './registeredVariantSet.ts'

// pipeline (pipeline.h)
export {
  USD_FORCE_DEFAULT_MATERIALS_SCOPE_NAME, USD_POPULATE_LEGACY_ALLOWED_TOKENS,
  UsdUtilsGetAlphaAttributeNameForColor, UsdUtilsGetModelNameFromRootLayer,
  UsdUtilsGetRegisteredVariantSets, UsdUtilsRegisterVariantSet,
  UsdUtilsGetPrimAtPathWithForwarding, UsdUtilsUninstancePrimAtPath,
  UsdUtilsGetPrimaryUVSetName, UsdUtilsGetPrefName,
  UsdUtilsGetMaterialsScopeName, UsdUtilsGetPrimaryCameraName,
} from './pipeline.ts'

// timeCodeRange (timeCodeRange.h)
export {
  UsdUtilsTimeCodeRange as TimeCodeRange,
  UsdUtilsTimeCodeRangeIterator as TimeCodeRangeIterator,
  UsdUtilsTimeCodeRangeTokens, UsdUtilsTimeCodeRangeToStreamString, UsdUtilsTimeCodeRangeFromStreamString,
} from './timeCodeRange.ts'

// stageCache (stageCache.h)
export { UsdUtilsStageCache as StageCache } from './stageCache.ts'

// flattenLayerStack (flattenLayerStack.h)
export {
  UsdUtilsFlattenLayerStack, UsdUtilsFlattenLayerStackResolveAssetPath,
  type UsdUtilsResolveAssetPathFn,
} from './flattenLayerStack.ts'

// authoring (authoring.h)
export {
  UsdUtilsCopyLayerMetadata, UsdUtilsComputeCollectionIncludesAndExcludes,
  UsdUtilsAuthorCollection, UsdUtilsCreateCollections, UsdUtilsGetDirtyLayers,
  type UsdUtilsPathHashSet,
} from './authoring.ts'

// introspection (introspection.h)
export {
  UsdUtilsComputeUsdStageStats, UsdUtilsUsdStageStatsKeys, type UsdUtilsUsdStageStats,
} from './introspection.ts'

// stitch (stitch.h)
export {
  UsdUtilsStitchLayers, UsdUtilsStitchInfo,
  UsdUtilsStitchValueStatus as StitchValueStatus, type UsdUtilsStitchValueFn,
} from './stitch.ts'

// stitchClips (stitchClips.h)
export {
  UsdUtilsStitchClips, UsdUtilsStitchClipsTopology, UsdUtilsStitchClipsManifest,
  UsdUtilsStitchClipsTemplate, UsdUtilsGenerateClipTopologyName, UsdUtilsGenerateClipManifestName,
} from './stitchClips.ts'

// sparseValueWriter (sparseValueWriter.h)
export {
  UsdUtilsSparseAttrValueWriter as SparseAttrValueWriter,
  UsdUtilsSparseValueWriter as SparseValueWriter,
} from './sparseValueWriter.ts'

// userProcessingFunc, dependencies (userProcessingFunc.h, dependencies.h)
export { UsdUtilsDependencyInfo as DependencyInfo, type UsdUtilsProcessingFunc } from './userProcessingFunc.ts'
export {
  UsdUtilsExtractExternalReferencesParams as ExtractExternalReferencesParams,
  UsdUtilsExtractExternalReferences, UsdUtilsComputeAllDependencies, UsdUtilsModifyAssetPaths,
  type UsdUtilsModifyAssetPathFn,
} from './dependencies.ts'

// localizeAsset, usdzPackage (localizeAsset.h, usdzPackage.h)
export { UsdUtilsLocalizeAsset } from './localizeAsset.ts'
export { UsdUtilsCreateNewUsdzPackage, UsdUtilsCreateNewARKitUsdzPackage } from './usdzPackage.ts'

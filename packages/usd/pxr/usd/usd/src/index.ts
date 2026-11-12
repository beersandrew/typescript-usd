// Ported from OpenUSD 26.11.1: pxr/usd/usd/generatedSchema.usda,
//  pxr/usd/usd/plugInfo.json
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Side-effect: register the usd core schema plugin (vendored upstream
// generatedSchema.usda + plugInfo.json) with typescript-usd/plug — the TS analog of
// upstream's link-time registration. Extension plugins can register through
// the same Plug registry.
import './plugin/registerPlugin.ts'
export { Stage } from "./stage.ts";
export { usdFlattenLayerStack as FlattenLayerStack, usdFlattenLayerStackAdvanced as FlattenLayerStackAdvanced, usdFlattenLayerStackResolveAssetPath as FlattenLayerStackResolveAssetPath, usdFlattenLayerStackResolveAssetPathAdvanced as FlattenLayerStackResolveAssetPathAdvanced } from "./flattenUtils.ts";
export type { UsdFlattenResolveAssetPathContext as FlattenResolveAssetPathContext, UsdFlattenResolveAssetPathFn as FlattenResolveAssetPathFn, UsdFlattenResolveAssetPathAdvancedFn as FlattenResolveAssetPathAdvancedFn } from "./flattenUtils.ts";
export { UsdStageCache as StageCache, UsdStageCacheId as StageCacheId, UsdStageCacheContext as StageCacheContext, UsdUseButDoNotPopulateCache as UseButDoNotPopulateCache, UsdBlockStageCaches as BlockStageCaches, UsdBlockStageCachePopulation as BlockStageCachePopulation, UsdStageCacheContextBlockType as StageCacheContextBlockType } from "./stageCache.ts";
export { UsdInterpolationType as InterpolationType, UsdInterpolationTypeHeld as InterpolationTypeHeld, UsdInterpolationTypeLinear as InterpolationTypeLinear } from "./interpolation.ts";
export type { UsdInterpolation as Interpolation } from "./interpolation.ts";
export { UsdTimeCode as TimeCode, UsdTimeCodeTokens as TimeCodeTokens, usdTimeCodeToStreamString, usdTimeCodeFromStreamString } from "./timeCode.ts";
export { UsdEditTarget as EditTarget } from "./editTarget.ts";
export { StageLoadRules, StageLoadRule } from "./stageLoadRules.ts";
export type { LoadPolicy, StageLoadRuleEntry } from "./stageLoadRules.ts";
export { StagePopulationMask } from "./stagePopulationMask.ts";
export { UsdPrimFlagsPredicate as PrimFlagsPredicate, PrimIsActive, PrimIsLoaded, PrimIsModel, PrimIsGroup, PrimIsAbstract, PrimIsDefined, PrimHasClassSpecifier, PrimHasDefiningSpecifier, PrimIsInstance, PrimAllPrimsPredicate, PrimDefaultPredicate, TraverseInstanceProxies } from "./primFlags.ts";
export type { UsdPrimPredicate as PrimPredicate } from "./primFlags.ts";
export { UsdPrimRange as PrimRange, UsdPrimRangeIterator as PrimRangeIterator } from "./primRange.ts";
export { UsdAttributeLimits as AttributeLimits, UsdAttributeLimitsValidationResult as AttributeLimitsValidationResult, UsdLimitsKeys as LimitsKeys } from "./attributeLimits.ts";
export { UsdResolveInfo as ResolveInfo, UsdResolveInfoSource as ResolveInfoSource } from "./resolveInfo.ts";
export { UsdResolveTarget as ResolveTarget } from "./resolveTarget.ts";
export { UsdAttributeQuery as AttributeQuery } from "./attributeQuery.ts";
export { ListPositionFrontOfPrependList, ListPositionBackOfPrependList, ListPositionFrontOfAppendList, ListPositionBackOfAppendList } from "./common.ts";
export type { UsdListPosition as ListPosition } from "./common.ts";
export { UsdRel as Rel } from "./relationship.ts";
export { UsdReferences as References } from "./references.ts";
export { UsdSpecializes as Specializes } from "./specializes.ts";
export { UsdInherits as Inherits } from "./inherits.ts";
export { UsdEditContext as EditContext } from "./editContext.ts";
export { UsdNamespaceEditor as NamespaceEditor } from "./namespaceEditor.ts";
export { UsdVariantSet as VariantSet, UsdVariantSets as VariantSets } from "./variantSets.ts";
export { UsdNotice as Notice } from "./notice.ts";
export type { UsdNoticeObject as NoticeObject } from "./notice.ts";
export { isPrototypePath, isPathInPrototype } from "./instanceCache.ts";
export { Attribute, Prim } from "./prim.ts";
export type { FindAttributeConnectionPathsOptions, FindRelationshipTargetPathsOptions } from "./prim.ts";
export type { StageOpenOptions } from "./stage.ts";
export type { PropertyStackEntry, PropertyStackWithLayerOffsetEntry, PrimStackEntry, CompositionArc } from "./primCompositionQuery.ts";
export { UsdPrimCompositionQuery as PrimCompositionQuery, UsdPrimCompositionQueryArc as PrimCompositionQueryArc, UsdPrimCompositionQueryFilter as PrimCompositionQueryFilter, UsdPrimCompositionQueryArcTypeFilter as PrimCompositionQueryArcTypeFilter, UsdPrimCompositionQueryDependencyTypeFilter as PrimCompositionQueryDependencyTypeFilter, UsdPrimCompositionQueryArcIntroducedFilter as PrimCompositionQueryArcIntroducedFilter, UsdPrimCompositionQueryHasSpecsFilter as PrimCompositionQueryHasSpecsFilter } from "./primCompositionQuery.ts";
export type { UsdPrimCompositionQueryListEditorResult as PrimCompositionQueryListEditorResult } from "./primCompositionQuery.ts";
export { SchemaBase } from "./schemaBase.ts";
export { Typed } from "./typed.ts";
export { APISchemaBase } from "./apiSchemaBase.ts";
export { ModelAPI } from "./modelAPI.ts";
export type { KindValidation } from "./modelAPI.ts";
export { ColorSpaceAPI, ColorSpaceHashCache } from "./colorSpaceAPI.ts";
export type { ColorSpaceCache } from "./colorSpaceAPI.ts";
export { ColorSpaceDefinitionAPI } from "./colorSpaceDefinitionAPI.ts";
export { CollectionAPI } from "./collectionAPI.ts";
export { CollectionMembershipQuery } from "./collectionMembershipQuery.ts";
export type { ExpansionRule, CollectionRule } from "./collectionMembershipQuery.ts";
export { ClipsAPI } from "./clipsAPI.ts";
export { UsdTokens as Tokens } from "./tokens.ts";
export { UsdSchemaRegistry as SchemaRegistry } from "./schemaRegistry.ts";
export type { UsdSchemaInfo as SchemaInfo, UsdSchemaKind as SchemaKind, UsdSchemaVersion as SchemaVersion, UsdSchemaVersionPolicy as SchemaVersionPolicy } from "./schemaRegistry.ts";
export { UsdPrimDefinition as PrimDefinition, UsdPrimDefinitionProperty as PrimDefinitionProperty, UsdPrimDefinitionAttribute as PrimDefinitionAttribute, UsdPrimDefinitionRelationship as PrimDefinitionRelationship } from "./primDefinition.ts";
export type { UsdSpecType as SpecType, UsdVariability as Variability } from "./primDefinition.ts";
export { UsdPrimTypeInfo as PrimTypeInfo } from "./primTypeInfo.ts";
export { usdGenSchema } from "./usdGenSchema.ts";
export type { UsdGenSchemaOptions as GenSchemaOptions, UsdGenSchemaResult as GenSchemaResult } from "./usdGenSchema.ts";

// The value type of a metadata field, including plugin-registered metadata;
// OpenUSD answers this through SdfSchema::GetFieldDefinition()
// (pxr/usd/sdf/schema.h).
export { usdGetMetadataFieldType } from "./schemaRegistry.ts";
export { UsdObjectPredicateLibrary as ObjectPredicateLibrary, UsdGetCollectionPredicateLibrary as GetCollectionPredicateLibrary, UsdObjectCollectionExpressionEvaluator as ObjectCollectionExpressionEvaluator, UsdComputeIncludedPathsFromCollectionExpression as ComputeIncludedPathsFromCollectionExpression } from "./collectionPredicateLibrary.ts";

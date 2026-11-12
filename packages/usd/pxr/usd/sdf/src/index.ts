// Portions ported from OpenUSD 26.11.1, including: pxr/base/vt/value.h,
//  pxr/base/ts/spline.h
// Copyright 2016, 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// USDA text format parser — spec ch. 16.2
import { serializeUsda, type SdfLayerForWrite } from './usdaFileFormat.ts'

export { serializeUsda } from "./usdaFileFormat.ts";
export type { SdfLayerForWrite as LayerForWrite } from "./usdaFileFormat.ts";
export { coerceValueToType } from "./parserHelpers.ts";
export { ValueTypeNames, SdfValueRoleNames as ValueRoleNames, findValueTypeName } from "./valueTypeName.ts";
export type { SdfValueTypeName as ValueTypeName } from "./valueTypeName.ts";
export { sdfApplyListOpOperations, sdfReducedListOp, sdfReduceListOpChain, sdfNormalizeListOp, sdfApplyListOrdering, sdfApplyListOpToVector, sdfComposeListOpsStrongToWeak } from "./listOp.ts";
export type { SdfListOpValue as ListOpValue, SdfListOpResult as ListOpResult, SdfNormalizedListOp as NormalizedListOp, SdfListOpEquality as ListOpEquality, SdfListOpType as ListOpType, SdfListOpApplyCallback as ListOpApplyCallback } from "./listOp.ts";

export class UsdaWriter {
  static serialize(layer: SdfLayerForWrite): string {
    return serializeUsda(layer)
  }
}
export { SdfVariableExpression as VariableExpression, SdfVariableExpressionEmptyList as VariableExpressionEmptyList, SdfVariableExpressionBuilder as VariableExpressionBuilder, SdfVariableExpressionFunctionBuilder as VariableExpressionFunctionBuilder, SdfVariableExpressionListBuilder as VariableExpressionListBuilder, sdfIsVariableExpression, sdfIsValidVariableType, sdfEvaluateVariableExpression } from "./variableExpression.ts";
export type { SdfExpressionValue as VariableExpressionValue, SdfExpressionVariables as VariableExpressionVariables, SdfVariableExpressionResultType as VariableExpressionResultType, SdfVariableExpressionArgument as VariableExpressionArgument } from "./variableExpression.ts";
export { SdfVariableExpressionAST as VariableExpressionAST, SdfVariableExpressionASTNodes as VariableExpressionASTNodes } from "./variableExpressionAST.ts";
export type { SdfExpressionValue as ExpressionValue, SdfExpressionVariables as ExpressionVariables, SdfVariableExpressionResult as VariableExpressionResult } from "./variableExpression.ts";
export { SdfPathTable as PathTable } from "./pathTable.ts";
export {
  SdfChangeList as ChangeList, SdfChangeListEntry as ChangeListEntry,
  SdfChangeListEntryFlags as ChangeListEntryFlags, SdfSubLayerChangeType as SubLayerChangeType,
  sdfChangeListFromLayerChanges,
} from "./changeList.ts";
export type { SdfLayerChangeListVec as LayerChangeListVec } from "./changeList.ts";
export type { SdfPathTableInsertResult as PathTableInsertResult } from "./pathTable.ts";
export { SDF_LAYER_OFFSET_IDENTITY, sdfLayerOffsetApply, sdfLayerOffsetCompose, sdfLayerOffsetInverse, sdfLayerOffsetIsIdentity, sdfLayerOffsetEquals } from "./layerOffset.ts";
export type { SdfLayerOffset as LayerOffset } from "./layerOffset.ts";
export { UsdZipFile, createUsdzPackage, SdfZipFileWriter as ZipFileWriter } from "./zipFile.ts";
export type { ZipEntry, UsdzPackageFile } from "./zipFile.ts";
export { SdfLayerStateDelegateBase as LayerStateDelegateBase, SdfSimpleLayerStateDelegate as SimpleLayerStateDelegate } from "./layerStateDelegate.ts";
export type { SdfLayerAccess as LayerAccess } from "./layerStateDelegate.ts";
export { SdfAbstractData as AbstractData, SdfAbstractDataSpecVisitor as AbstractDataSpecVisitor } from "./abstractData.ts";
export type { SdfSpecType as SpecType, SdfHasSpecAndFieldResult as HasSpecAndFieldResult } from "./abstractData.ts";
export { SdfData as Data } from "./data.ts";
export { SdfSpec as Spec } from "./spec.ts";
export { SdfPrimSpec as PrimSpec, sdfJustCreatePrimInLayer } from "./primSpec.ts";
export type { SdfSpecifier as Specifier, SdfPermission as Permission } from "./primSpec.ts";
export { SdfPseudoRootSpec as PseudoRootSpec } from "./pseudoRootSpec.ts";
export { SdfPropertySpec as PropertySpec } from "./propertySpec.ts";
export type { SdfVariability as Variability } from "./propertySpec.ts";
export { SdfAttributeSpec as AttributeSpec, sdfCreatePrimAttributeInLayer, sdfJustCreatePrimAttributeInLayer } from "./attributeSpec.ts";
export { SdfRelationshipSpec as RelationshipSpec, sdfCreateRelationshipInLayer, sdfJustCreateRelationshipInLayer } from "./relationshipSpec.ts";
export { SdfVariantSetSpec as VariantSetSpec } from "./variantSetSpec.ts";
export { SdfVariantSpec as VariantSpec, sdfCreateVariantInLayer } from "./variantSpec.ts";
export { SdfListOp as ListOp } from "./listOp.ts";
export { SdfListProxy as ListProxy, SdfListEditorProxy as ListEditorProxy } from "./listProxy.ts";
export { SdfChildrenView as ChildrenView, SdfChildrenProxy as ChildrenProxy } from "./childrenView.ts";
export { SdfMapEditProxy as MapEditProxy } from "./mapEditProxy.ts";
export { SdfReference as Reference, SdfPayload as Payload } from "./reference.ts";
export { SdfAllowed as Allowed } from "./allowed.ts";
export { SdfNamespaceEdit as NamespaceEdit, SdfNamespaceEditDetail as NamespaceEditDetail, SdfNamespaceEditDetailResult as NamespaceEditDetailResult, SdfBatchNamespaceEdit as BatchNamespaceEdit, sdfCombineResult, sdfCombineError, sdfCombineUnbatched } from "./namespaceEdit.ts";
export { SdfCleanupEnabler as CleanupEnabler, sdfCleanupEnabler } from "./cleanupTracker.ts";
export { SdfValueBlock as ValueBlock, SdfAnimationBlock as AnimationBlock } from "./types.ts";
export { SdfOpaqueValue as OpaqueValue } from "./opaqueValue.ts";
export { SdfAssetPath as AssetPath } from "./assetPath.ts";
export type { SdfAssetPathParams as AssetPathParams } from "./assetPath.ts";
export { SdfPredicateExpression as PredicateExpression, SdfPredicateOp as PredicateOp, SdfPredicateFnCallKind as PredicateFnCallKind } from "./predicateExpression.ts";
export type { SdfPredicateArgValue as PredicateArgValue, SdfPredicateFnArg as PredicateFnArg, SdfPredicateFnCall as PredicateFnCall } from "./predicateExpression.ts";
export { SdfPathExpression as PathExpression, SdfPathPattern as PathPattern, SdfPredicateFunctionResult as PredicateFunctionResult } from "./pathExpression.ts";
export type { SdfPathExprArgValue as PathExprArgValue, SdfPathExprFnArg as PathExprFnArg, SdfPathExprFnCall as PathExprFnCall } from "./pathExpression.ts";
export { SdfBooleanExpression as BooleanExpression, SdfBooleanExpressionBinaryOperator as BooleanExpressionBinaryOperator, SdfBooleanExpressionUnaryOperator as BooleanExpressionUnaryOperator } from "./booleanExpression.ts";
export type { SdfBooleanExprValue as BooleanExprValue, SdfBooleanExprVariableCallback as BooleanExprVariableCallback, SdfBooleanExprNameTransform as BooleanExprNameTransform } from "./booleanExpression.ts";
export { SdfSchema as Schema, SdfFieldDefinition as FieldDefinition, SdfSpecDefinition as SpecDefinition } from "./schema.ts";
export type { SdfMetadataSpecType as MetadataSpecType } from "./schema.ts";

// SdfLayer (our `Layer`) — the core sdf class — with its sibling modules:
// identifier anchoring + the reader seam (assetPathResolver.ts), the
// file-format plugin registries and capabilities (fileFormat.ts), and
// package-aware reads (usdzFileFormat.ts).
export { Layer, DetachedLayerRules, sdfCreatePrimInLayer } from "./layer.ts";
export { SdfComputeAssetPathRelativeToLayer } from "./layerUtils.ts";
export { sdfCopySpec, sdfShouldCopyValue, sdfShouldCopyChildren, SdfCopySpecsValueEdit as CopySpecsValueEdit } from "./copyUtils.ts";
export type { SdfShouldCopyValueFn as ShouldCopyValueFn, SdfShouldCopyChildrenFn as ShouldCopyChildrenFn, SdfCopySpecsValueEditFunction as CopySpecsValueEditFunction, SdfOptionalValue as OptionalValue } from "./copyUtils.ts";
export type { SdfLayerChange as LayerChange, SdfLayerChangeKind as LayerChangeKind } from "./layer.ts";
export { SdfFileFormat as FileFormat, SdfDefineFileFormat as DefineFileFormat, SdfUsdaFileFormat as UsdaFileFormat, SdfUsdcFileFormat as UsdcFileFormat, SdfUsdFileFormat as UsdFileFormat, SdfUsdzFileFormat as UsdzFileFormat, FormatSupportsReading, FormatSupportsWriting, FormatSupportsEditing } from "./fileFormat.ts";
export type { LayerFileFormatReader, SdfFileFormatArguments as FileFormatArguments, SdfFileFormatFactoryBase as FileFormatFactoryBase } from "./fileFormat.ts";

// Value-type introspection. JavaScript values carry no USD type, so Sdf records
// the authored type of each dictionary entry and of spline-knot custom data,
// and the authored text-format details of splines; OpenUSD exposes the same
// information through VtValue::GetType() and TsSpline (pxr/base/vt/value.h,
// pxr/base/ts/spline.h).
export { _sdfGetDictionaryValueTypes as sdfGetDictionaryValueTypes, _sdfGetSplineKnotCustomDataValueTypes as sdfGetSplineKnotCustomDataValueTypes, _sdfGetTextSplineState as sdfGetTextSplineState } from "./schema.ts";
export type { SdfTextSplineState as TextSplineState, SdfTextSplineKnotState as TextSplineKnotState } from "./schema.ts";
export { SdfNotice as Notice } from "./notice.ts";
export {
  SdfChangeBlock as ChangeBlock, Sdf_ChangeManager as _ChangeManager, sdfChangeBlock,
} from "./changeManager.ts";

export { SdfLayerTree as LayerTree } from "./layerTree.ts";
export { SdfPredicateLibrary as PredicateLibrary, SdfPredicateProgram as PredicateProgram, SdfPredicateParamNamesAndDefaults as PredicateParamNamesAndDefaults, SdfLinkPredicateExpression as LinkPredicateExpression } from "./predicateLibrary.ts";
export type { SdfPredicateFunction as PredicateFunction, SdfPredicateParamType as PredicateParamType, SdfPredicateDefaultValue as PredicateDefaultValue } from "./predicateLibrary.ts";
export { SdfPathExpressionEval as PathExpressionEval, SdfMakePathExpressionEval as MakePathExpressionEval } from "./pathExpressionEval.ts";

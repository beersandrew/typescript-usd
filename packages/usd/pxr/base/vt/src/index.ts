// typescript-usd/vt — Value Types (base/vt). The type-erased value container (VtValue)
// and copy-on-write array (VtArray) the USD value pipeline is built on.
//
// Mirrors OpenUSD pxr/base/vt. Built demand-driven for the base tier / exec
// port; see the base-tier-buildout memory.

export { copyHeldValue as _CopyHeldValue } from "./value.ts";
export { Vt_GetTypeInfo as _GetTypeInfo, Vt_GetTypeKind as _GetTypeKind } from "./typeInfo.ts";
export type { Vt_TypeInfo as _TypeInfo, Vt_TypeKind as _TypeKind } from "./typeInfo.ts";
export { VtValue as Value, VtTypedValueProxyBase as TypedValueProxyBase, VtErasedValueProxyBase as ErasedValueProxyBase, VtGetProxiedObject as GetProxiedObject, VtGetErasedProxiedVtValue as GetErasedProxiedVtValue, VtGetErasedProxiedTfType as GetErasedProxiedTfType, VtErasedProxyHoldsType as ErasedProxyHoldsType, Vt_ValueShapeDataAccess as _ValueShapeDataAccess, Vt_ValueTestAccess as _ValueTestAccess } from "./value.ts";
export type { Vt_TypedBuffer as _TypedBuffer, Vt_ReadonlyTypedBuffer as _ReadonlyTypedBuffer, Vt_ReadonlyTyped as _ReadonlyTyped } from "./array.ts";
export { VtArray as Array, Vt_IsTypedStorage as _IsTypedStorage, Vt_ArrayBase as _ArrayBase, Vt_ArrayForeignDataSource as _ArrayForeignDataSource, Vt_ArrayOpHelp as _ArrayOpHelp, Vt_ArrayOpHelpScalar as _ArrayOpHelpScalar, Vt_ShapeData as _ShapeData } from "./array.ts";
export { VtArrayEdit as ArrayEdit, Vt_ArrayEditHashAccess as _ArrayEditHashAccess, Vt_ArrayEditStreamImpl as _ArrayEditStreamImpl } from "./arrayEdit.ts";
export type { ArrayEditOp } from "./arrayEdit.ts";
export { VtArrayEditBuilder as ArrayEditBuilder } from "./arrayEditBuilder.ts";
export { Vt_ArrayEditOps as _ArrayEditOps, Vt_ArrayEditOpsBuilder as _ArrayEditOpsBuilder } from "./arrayEditOps.ts";
export { VtDictionary as Dictionary, VtDictionaryHash as DictionaryHash, Vt_DefaultHolder as _DefaultHolder, Vt_DefaultGenerator as _DefaultGenerator, VtDefault as Default, VtDictionaryOver as DictionaryOver, VtDictionaryOverRecursive as DictionaryOverRecursive, VtGetValueAtPath as GetValueAtPath, VtSetValueAtPath as SetValueAtPath, VtEraseValueAtPath as EraseValueAtPath, VtGetEmptyDictionary as GetEmptyDictionary, VtDictionaryGet as DictionaryGet, VtDictionaryIsHolding as DictionaryIsHolding } from "./dictionary.ts";
export { Vt, VtValueTypes as ValueTypes, VtGetKnownValueTypeIndex as GetKnownValueTypeIndex, VtGetNumKnownValueTypes as GetNumKnownValueTypes, VtZero as Zero } from "./types.ts";
export type { VtValueTypeName as ValueTypeName } from "./types.ts";
export { VtHashValue as HashValue } from "./hash.ts";
export { VtStreamOut as StreamOut, VtStreamOutArray as StreamOutArray, Vt_StreamOutGeneric as _StreamOutGeneric, Vt_StreamOutImpl as _StreamOutImpl } from "./streamOut.ts";
export { Vt_DefaultValueFactory as _DefaultValueFactory, Vt_DefaultValueHolder as _DefaultValueHolder, Vt_FindOrCreateDefaultValue as _FindOrCreateDefaultValue } from "./valueCommon.ts";
export { VtRegisterComposeOver as RegisterComposeOver, Vt_RegisterComposeOver as _RegisterComposeOver, VtValueCanComposeOver as ValueCanComposeOver, VtValueTypeCanComposeOver as ValueTypeCanComposeOver, VtValueTryComposeOver as ValueTryComposeOver, VtValueComposeOver as ValueComposeOver, VtBackgroundType as BackgroundType, VtBackground as Background, Vt_ExtTypeIndexTable as _ExtTypeIndexTable, VtVisitValue as VisitValue, VtVisitValueType as VisitValueType, VtVisitValueWithExtTypes as VisitValueWithExtTypes, Vt_VisitValueExtDispatch as _VisitValueExtDispatch, Vt_VisitValueExtDispatchOne as _VisitValueExtDispatchOne, Vt_VisitValueHashThreshold as _VisitValueHashThreshold, Vt_VisitValueTypeExtDispatch as _VisitValueTypeExtDispatch, Vt_VisitValueTypeExtDispatchOne as _VisitValueTypeExtDispatchOne, Vt_VisitValueTypeTmplExtDispatch as _VisitValueTypeTmplExtDispatch, Vt_VisitValueTypeTmplExtDispatchOne as _VisitValueTypeTmplExtDispatchOne } from "./valueComposeOver.ts";
export { VtValueRef as ValueRef, VtMutableValueRef as MutableValueRef } from "./valueRef.ts";
export { Vt_TransformImpl as _TransformImpl, Vt_RegisterTypedTransform as _RegisterTypedTransform, Vt_RegisterTransformImpl as _RegisterTransformImpl, Vt_RegisterErasedTransform as _RegisterErasedTransform, VtRegisterTransform as RegisterTransform, VtRegisterTransformNoArrays as RegisterTransformNoArrays, VtRegisterErasedTransform as RegisterErasedTransform, VtValueCanTransform as ValueCanTransform, VtValueTryTransform as ValueTryTransform } from "./valueTransform.ts";

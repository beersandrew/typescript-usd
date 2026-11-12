// Ported from OpenUSD 26.11.1: pxr/usd/usd/object.cpp, pxr/usd/usd/object.h,
//  pxr/usd/usd/stage.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// The type-erased (VtValue) metadata read of UsdObject::GetMetadata(const
// TfToken &key, VtValue *value) (OpenUSD v26.11.1 pxr/usd/usd/object.h:285,
// object.cpp:28-32 -> UsdStage::_GetMetadata, stage.cpp:6593).
//
// typescript-usd resolves metadata as JS value shapes (getMetadata(key)); the
// VtValue additionally carries the value's C++ type, which JS erases (a
// string and a token are both strings). The type is the one Sdf holds the
// value as: a schema field's registered fallback type (SdfSchema field
// definitions, typed per schema.cpp:734-863 and plugin metadata types), else
// the value type the layer recorded for an unregistered field.

import { Schema as SdfSchema } from 'typescript-usd/sdf'
import {
  _sdfMakeTypedValue, _sdfMetadataValueTypeName, _sdfValueTypeNameOfValue,
} from 'typescript-usd/sdf/_internal'
import { Value as VtValue } from 'typescript-usd/vt'

/**
 * @internal Fills `value` with metadatum `key`'s resolved value `resolved`
 * (the JS value shape getMetadata(key) returns) held as its Sdf type, and
 * returns whether there was a value. `recordedTypeName` is the layer's value
 * type name for an unregistered field.
 */
export function _usdGetTypedMetadata(
  key: string,
  resolved: unknown,
  recordedTypeName: () => string | undefined,
  value: VtValue,
): boolean {
  if (resolved === undefined) {
    value.swap(VtValue.getEmpty())
    return false
  }
  let typeName = SdfSchema.getInstance().getFieldDefinition(key)?._getValueTypeName()
  if (typeName === undefined) {
    // An unregistered field: the value type the layer recorded, else the
    // Sdf value type the JS value's class names (Gf values, VtArrays).
    const recorded = recordedTypeName() ?? _sdfValueTypeNameOfValue(resolved)
    typeName = recorded === undefined ? undefined
      : _sdfMetadataValueTypeName(recorded) ?? recorded
  }
  if (typeName === undefined) {
    value.swap(resolved instanceof VtValue ? resolved : VtValue.getEmpty())
    return resolved instanceof VtValue
  }
  value.swap(_sdfMakeTypedValue(resolved, typeName))
  return true
}

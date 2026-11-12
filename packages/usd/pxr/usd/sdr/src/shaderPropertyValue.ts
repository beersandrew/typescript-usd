// Ported from OpenUSD 26.11.1: pxr/usd/sdr/shaderProperty.cpp,
//  pxr/usd/sdr/shaderProperty.h, pxr/usd/usdShade/shaderDefUtils.cpp
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// The default value of an SdrShaderProperty as a typed VtValue, as upstream's
// SdrShaderProperty::GetDefaultValue returns it (shaderProperty.h: a VtValue),
// and the default conformed to its Sdf type, as GetDefaultValueAsSdfType
// returns it (shaderProperty.h:304-314).
//
// FAITHFULNESS-DEBT(sdr-default-value-vtvalue): SdrShaderProperty keeps the
// raw JavaScript default its parser gave it (shaderNode.ts). Parsers that
// build VtValues (the glslfx parser plugin) store them as is; values from
// USD shader definitions (UsdShadeShaderDefParserPlugin, shaderDefUtils.cpp)
// are wrapped here with the TfType of their Sdf value type
// ('sdrUsdDefinitionType' metadata), which is the VtValue upstream's USD
// attribute read produces. Replace with VtValue-typed defaults in
// SdrShaderProperty when its value conformance (shaderProperty.cpp) is
// ported.

import {
  Matrix2d as GfMatrix2d, Matrix3d as GfMatrix3d, Matrix4d as GfMatrix4d,
  Quatd as GfQuatd, Quatf as GfQuatf, Quath as GfQuath,
  Vec2d as GfVec2d, Vec2f as GfVec2f, Vec2h as GfVec2h, Vec2i as GfVec2i,
  Vec3d as GfVec3d, Vec3f as GfVec3f, Vec3h as GfVec3h, Vec3i as GfVec3i,
  Vec4d as GfVec4d, Vec4f as GfVec4f, Vec4h as GfVec4h, Vec4i as GfVec4i,
} from 'typescript-usd/gf'
import { AssetPath as SdfAssetPath, findValueTypeName } from 'typescript-usd/sdf'
import { Type as TfType } from 'typescript-usd/tf'
import { Array as VtArray, Value as VtValue, ValueTypes as VtValueTypes, Zero as VtZero } from 'typescript-usd/vt'
import type { SdrShaderProperty } from './shaderNode.ts'

const _SdfAssetPathType = TfType.declare('SdfAssetPath')

/** Sdf value type name (scalar) -> VtValue TfType. */
function _TfTypeForSdfTypeName(name: string): TfType | undefined {
  switch (name) {
    case 'bool': return VtValueTypes.bool
    case 'int': return VtValueTypes.int
    case 'float': return VtValueTypes.float
    case 'double': return VtValueTypes.double
    case 'string': return VtValueTypes.string
    case 'token': return VtValueTypes.token
    case 'asset': return TfType.declare('SdfAssetPath')
    case 'float2': case 'texCoord2f': return VtValueTypes.GfVec2f
    case 'float3': case 'color3f': case 'normal3f': case 'point3f': case 'vector3f': return VtValueTypes.GfVec3f
    case 'float4': case 'color4f': return VtValueTypes.GfVec4f
    case 'int2': return VtValueTypes.GfVec2i
    case 'int3': return VtValueTypes.GfVec3i
    case 'int4': return VtValueTypes.GfVec4i
    case 'matrix4d': return VtValueTypes.GfMatrix4d
  }
  return undefined
}

/** shaderProperty.cpp:399-447 (_ConformSdrDefaultValue, the Float case):
 *  a float array default of a Float property of array size 2, 3 or 4 is
 *  held as GfVec2f / GfVec3f / GfVec4f. */
function _ConformSdrDefaultValue(value: VtValue, property: SdrShaderProperty): VtValue {
  const arraySize = property.getArraySize()
  if (property.getType() !== 'float' || arraySize === 0 || !value.isArrayValued()) {
    return value
  }
  const arrayVal = [...(value.Get<Iterable<number>>())]
  if (arrayVal.length !== arraySize) return value
  switch (arraySize) {
    case 2: return VtValue.create(new GfVec2f(arrayVal[0]!, arrayVal[1]!), VtValueTypes.GfVec2f)
    case 3: return VtValue.create(new GfVec3f(arrayVal[0]!, arrayVal[1]!, arrayVal[2]!), VtValueTypes.GfVec3f)
    case 4: return VtValue.create(new GfVec4f(arrayVal[0]!, arrayVal[1]!, arrayVal[2]!, arrayVal[3]!), VtValueTypes.GfVec4f)
  }
  return value
}

/** The default value the parser gave the property, as a VtValue (see the
 *  header); the empty VtValue when absent. */
function _ParsedDefaultValue(property: SdrShaderProperty): VtValue {
  const value = property.getDefaultValue()
  if (value instanceof VtValue) return value
  if (value === undefined || value === null) return VtValue.getEmpty()
  const type = _TfTypeForSdfTypeName(property.getMetadataByKey('sdrUsdDefinitionType') ?? '')
  if (!type) return VtValue.getEmpty()
  // Token and string values may be boxed String objects.
  const held = typeof value === 'object' && value instanceof String ? String(value) : value
  return VtValue.create(held, type)
}

/** SdrShaderProperty::GetDefaultValue as a VtValue (see the header). An
 *  absent default is the empty VtValue. */
export function SdrShaderPropertyGetDefaultValue(property: SdrShaderProperty): VtValue {
  const value = _ParsedDefaultValue(property)
  return value.IsEmpty() ? value : _ConformSdrDefaultValue(value, property)
}

// SdfValueTypeName::GetType (valueTypeName.cpp): the TfType of the C++ type
// an Sdf value type name holds; an array type is the VtArray of its element.
const _sdfScalarTfTypeNames: Record<string, string> = {
  asset: 'SdfAssetPath', timecode: 'SdfTimeCode', pathExpression: 'SdfPathExpression', opaque: 'SdfOpaqueValue',
}
export function sdfValueTypeNameGetType(name: string): TfType | undefined {
  const sdfType = findValueTypeName(name)
  if (!sdfType) return undefined
  const scalar = sdfType.scalarType ?? sdfType
  const element = _sdfScalarTfTypeNames[scalar.type] ?? scalar.type
  return TfType.declare(sdfType.isArray ? `${element}[]` : element)
}

// The default values Sdf registers its value types with
// (schema.cpp:464-540 _AddStandardTypesToRegistry): zero vectors, identity
// matrices and quaternions, empty strings and asset paths, false and 0; an
// array type's default is the empty VtArray.
const _gfDefaults: Record<string, () => unknown> = {
  GfVec2d: () => new GfVec2d(0), GfVec2f: () => new GfVec2f(0), GfVec2h: () => new GfVec2h(0), GfVec2i: () => new GfVec2i(0),
  GfVec3d: () => new GfVec3d(0), GfVec3f: () => new GfVec3f(0), GfVec3h: () => new GfVec3h(0), GfVec3i: () => new GfVec3i(0),
  GfVec4d: () => new GfVec4d(0), GfVec4f: () => new GfVec4f(0), GfVec4h: () => new GfVec4h(0), GfVec4i: () => new GfVec4i(0),
  GfMatrix2d: () => new GfMatrix2d(1), GfMatrix3d: () => new GfMatrix3d(1), GfMatrix4d: () => new GfMatrix4d(1),
  GfQuatd: () => new GfQuatd(1), GfQuatf: () => new GfQuatf(1), GfQuath: () => new GfQuath(1),
  SdfAssetPath: () => new SdfAssetPath(''),
}
function _SdfValueTypeNameGetDefaultValue(type: TfType | undefined): VtValue {
  if (!type) return VtValue.getEmpty()
  const name = type.getTypeName()
  if (name.endsWith('[]')) {
    return VtValue.createArray(new VtArray<unknown>([], TfType.declare(name.slice(0, -2))))
  }
  const make = _gfDefaults[name]
  if (make) return VtValue.create(make(), type)
  if (name === 'string' || name === 'token') return VtValue.create('', type)
  return VtValue.create(VtZero(type), type)
}

// _GetValue (shaderProperty.cpp:355-364): the held value when the VtValue
// holds `type`, else undefined (the out-parameter keeps its default).
function _GetValue<T>(value: VtValue, type: TfType): T | undefined {
  return value.IsHolding(type) ? value.Get<T>() : undefined
}

/**
 * SdrShaderProperty::GetDefaultValueAsSdfType (shaderProperty.h:304-314):
 * the default conformed to the SdfValueTypeName of GetTypeAsSdfType by
 * _ConformSdfTypeDefaultValue (shaderProperty.cpp:485-628), which
 * _FinalizeProperty (shaderProperty.cpp:876-883) applies to the parsed
 * default value.
 */
export function SdrShaderPropertyGetDefaultValueAsSdfType(property: SdrShaderProperty): VtValue {
  const sdrDefaultValue = _ParsedDefaultValue(property)
  // Return early if there is no value to conform
  if (sdrDefaultValue.IsEmpty()) return sdrDefaultValue

  // Return early if no conformance issue
  const sdfType = sdfValueTypeNameGetType(property.getTypeAsSdfType())
  if (sdrDefaultValue.getType() === sdfType) return sdrDefaultValue

  // Special conformance for when SdrUsdDefinitionType is provided: make sure
  // the types match, or try to extract the correct typed value.
  if (sdfType && property.getMetadataByKey('sdrUsdDefinitionType') !== undefined) {
    const sdfTypeValue = sdrDefaultValue.castToTypeid(sdfType)
    if (!sdfTypeValue.IsEmpty()) return sdfTypeValue
  }

  const sdrType = property.getType()
  const arraySize = property.getArraySize()
  const isArray = property.isArray()

  // ASSET and ASSET ARRAY
  if (sdrType === 'string' && property.isAssetIdentifier()) {
    if (isArray) {
      const arrayVal = _GetValue<Iterable<string>>(sdrDefaultValue, TfType.declare('string[]')) ?? []
      return VtValue.createArray(new VtArray<SdfAssetPath>(
        [...arrayVal].map(val => new SdfAssetPath(val)), _SdfAssetPathType))
    }
    const val = _GetValue<string>(sdrDefaultValue, VtValueTypes.string) ?? ''
    return VtValue.create(new SdfAssetPath(val), _SdfAssetPathType)
  }

  // FLOAT ARRAY (FIXED SIZE 2, 3, 4)
  else if (sdrType === 'float' && isArray) {
    const arrayVal = [..._GetValue<Iterable<number>>(sdrDefaultValue, TfType.declare('float[]')) ?? []]
    if (arrayVal.length !== arraySize) return sdrDefaultValue
    switch (arraySize) {
      case 2: return VtValue.create(new GfVec2f(arrayVal[0]!, arrayVal[1]!), VtValueTypes.GfVec2f)
      case 3: return VtValue.create(new GfVec3f(arrayVal[0]!, arrayVal[1]!, arrayVal[2]!), VtValueTypes.GfVec3f)
      case 4: return VtValue.create(new GfVec4f(arrayVal[0]!, arrayVal[1]!, arrayVal[2]!, arrayVal[3]!), VtValueTypes.GfVec4f)
    }
  }

  // INT ARRAY (FIXED SIZE 2, 3, 4)
  else if (sdrType === 'int' && isArray) {
    const arrayVal = [..._GetValue<Iterable<number>>(sdrDefaultValue, TfType.declare('int[]')) ?? []]
    if (arrayVal.length !== arraySize) return sdrDefaultValue
    switch (arraySize) {
      case 2: return VtValue.create(new GfVec2i(arrayVal[0]!, arrayVal[1]!), VtValueTypes.GfVec2i)
      case 3: return VtValue.create(new GfVec3i(arrayVal[0]!, arrayVal[1]!, arrayVal[2]!), VtValueTypes.GfVec3i)
      case 4: return VtValue.create(new GfVec4i(arrayVal[0]!, arrayVal[1]!, arrayVal[2]!, arrayVal[3]!), VtValueTypes.GfVec4i)
    }
  }

  // Default value's type was not conformant, but no special translation
  // step was found. So we use the default value of the SdfTypeName, which
  // is guaranteed to match
  return _SdfValueTypeNameGetDefaultValue(sdfType)
}

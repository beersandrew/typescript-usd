// Ported from OpenUSD 26.11.1: pxr/base/vt/types.cpp, pxr/base/vt/types.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Vt builtin value types — faithful to pxr/base/vt/types.h VT_BUILTIN_VALUE_TYPES.
//
// Each USD scalar value type is registered as a distinct TfType, so a JS value
// can carry its USD type IDENTITY that the JS runtime erases: a JS `number` is
// `int` xor `float` xor `double` xor `half` depending on which TfType tags it,
// and a JS string is `string` xor `token`. This is the whole reason VtValue
// (value.ts) needs a type tag at all — see the header there.
//
// The builtin scalars (integral + floating + string/token) and the Gf value
// classes Sdf stores (VT_VEC_VALUE_TYPES, VT_MATRIX_VALUE_TYPES and
// VT_QUATERNION_VALUE_TYPES, types.h:60-110) are registered here.

import { Type as TfType } from 'typescript-usd/tf'

const def = (name: string): TfType => TfType.define(name)

/** The builtin Vt scalar value types, by their USD type name. */
export const VtValueTypes = {
  bool: def('bool'),
  uchar: def('uchar'),
  short: def('short'),
  ushort: def('ushort'),
  int: def('int'),
  uint: def('uint'),
  int64: def('int64'),
  uint64: def('uint64'),
  half: def('half'),
  float: def('float'),
  double: def('double'),
  GfDuration: def('GfDuration'),
  string: def('string'),
  token: def('token'),
  dictionary: def('VtDictionary'),
  GfVec2d: def('GfVec2d'), GfVec2f: def('GfVec2f'), GfVec2h: def('GfVec2h'), GfVec2i: def('GfVec2i'),
  GfVec3d: def('GfVec3d'), GfVec3f: def('GfVec3f'), GfVec3h: def('GfVec3h'), GfVec3i: def('GfVec3i'),
  GfVec4d: def('GfVec4d'), GfVec4f: def('GfVec4f'), GfVec4h: def('GfVec4h'), GfVec4i: def('GfVec4i'),
  GfMatrix2d: def('GfMatrix2d'), GfMatrix3d: def('GfMatrix3d'), GfMatrix4d: def('GfMatrix4d'),
  GfQuatd: def('GfQuatd'), GfQuatf: def('GfQuatf'), GfQuath: def('GfQuath'),
} as const

export type VtValueTypeName = keyof typeof VtValueTypes

const knownValueTypes = Object.values(VtValueTypes)

/** OpenUSD v26.08 pxr/base/vt/types.h:264-287 known-type indexing. */
export const VtGetNumKnownValueTypes = (): number => knownValueTypes.length
export const VtGetKnownValueTypeIndex = (type: TfType): number =>
  knownValueTypes.indexOf(type)

/** OpenUSD v26.08 pxr/base/vt/types.h:341 and types.cpp specializations. */
export function VtZero(type?: TfType): unknown {
  const name = type?.getTypeName()
  if (name === 'bool') return false
  if (name === 'string' || name === 'token') return ''
  return 0
}

/** Runtime namespace companion for the macro-generated Vt type families. */
export const Vt = Object.freeze({
  ValueTypes: VtValueTypes,
  GetNumKnownValueTypes: VtGetNumKnownValueTypes,
  GetKnownValueTypeIndex: VtGetKnownValueTypeIndex,
  Zero: VtZero,
})

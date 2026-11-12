// Ported from OpenUSD 26.11.1: pxr/exec/vdf/forEachCommonType.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/forEachCommonType.h.
//
// VDF_FOR_EACH_COMMON_TYPE expands a macro for each "common" type
// (forEachCommonType.h:40-90). Common types have no special runtime
// properties; upstream uses the list to emit templated execution structures
// once, to improve build times. TS lists the common types' TfTypes and
// calls `fn` for each. The C++ integral types without a VtValueTypes entry
// (char, long, unsigned long, long long, unsigned long long) are named with
// TfType here; `int64` and `uint64` are Vt's names for the 64-bit types.

import { Type as TfType } from 'typescript-usd/tf'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { VdfIndexedWeightsType } from './indexedWeights.ts'

/** The common types in VDF_FOR_EACH_COMMON_TYPE order (forEachCommonType.h:51-90). */
export const VdfCommonTypes: readonly TfType[] = Object.freeze([
  VtValueTypes.bool,
  TfType.define('char'),
  VtValueTypes.uchar,
  VtValueTypes.int,
  VtValueTypes.uint,
  TfType.define('long'),
  TfType.define('ulong'),
  VtValueTypes.int64,
  VtValueTypes.uint64,

  VtValueTypes.float,
  VtValueTypes.double,

  VtValueTypes.half,
  VtValueTypes.GfMatrix2d,
  VtValueTypes.GfMatrix3d,
  VtValueTypes.GfMatrix4d,
  VtValueTypes.GfQuatd,
  VtValueTypes.GfQuatf,
  VtValueTypes.GfQuath,
  VtValueTypes.GfVec2d,
  VtValueTypes.GfVec2f,
  VtValueTypes.GfVec2h,
  VtValueTypes.GfVec2i,
  VtValueTypes.GfVec3d,
  VtValueTypes.GfVec3f,
  VtValueTypes.GfVec3h,
  VtValueTypes.GfVec3i,
  VtValueTypes.GfVec4d,
  VtValueTypes.GfVec4f,
  VtValueTypes.GfVec4h,
  VtValueTypes.GfVec4i,

  VdfIndexedWeightsType,

  VtValueTypes.token,

  VtValueTypes.string,
])

/** VDF_FOR_EACH_COMMON_TYPE(macro) (forEachCommonType.h:51). */
export function VDF_FOR_EACH_COMMON_TYPE(macro: (type: TfType) => void): void {
  for (const type of VdfCommonTypes) {
    macro(type)
  }
}

// Ported from OpenUSD 26.11.1: pxr/exec/vdf/estimateSize.h,
//  pxr/exec/vdf/forEachCommonType.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/estimateSize.h.
//
// VdfEstimateSize(t) estimates the memory footprint of an instance of T; by
// default it is sizeof(T) (estimateSize.h:20-49). TS has no sizeof, so the
// size of T comes from a table keyed by TfType (openexec-x1.md 4.1
// "Value-type template parameters"), the TS stand-in for sizeof(T):
// - the VDF_FOR_EACH_COMMON_TYPE types (forEachCommonType.h:51-90) and the
//   other VtValueTypes scalars carry their sizes in the native OpenUSD
//   26.11.1 build (macOS arm64, libc++);
// - every other type registers its size with Vdf_SetSizeof, next to its
//   TfType.Define. Asking for the size of a type that registered none is a
//   coding error that throws: there is no faithful size to return.
//
// Plugin writers overload VdfEstimateSize for their own types
// (estimateSize.h:25-40); TS registers the overload with
// VdfRegisterEstimateSize. The overloads for TfSmallVector, std::vector and
// std::shared_ptr (estimateSize.h:51-89) are C++ container types with no TS
// counterpart.

import { TF_CODING_ERROR, type Type as TfType } from 'typescript-usd/tf'

// sizeof(T) in the native build, by TfType name (VtValueTypes and the
// VDF_FOR_EACH_COMMON_TYPE types).
const _sizeofByName = new Map<string, number>([
  ['bool', 1], ['char', 1], ['uchar', 1], ['short', 2], ['ushort', 2],
  ['int', 4], ['uint', 4], ['long', 8], ['ulong', 8], ['int64', 8], ['uint64', 8],
  ['half', 2], ['float', 4], ['double', 8],
  ['string', 24], ['token', 8],
  ['GfMatrix2d', 32], ['GfMatrix3d', 72], ['GfMatrix4d', 128],
  ['GfQuatd', 32], ['GfQuatf', 16], ['GfQuath', 8],
  ['GfVec2d', 16], ['GfVec2f', 8], ['GfVec2h', 4], ['GfVec2i', 8],
  ['GfVec3d', 24], ['GfVec3f', 12], ['GfVec3h', 6], ['GfVec3i', 12],
  ['GfVec4d', 32], ['GfVec4f', 16], ['GfVec4h', 8], ['GfVec4i', 16],
  ['VdfIndexedWeights', 48],
])

const _sizeofByType = new Map<TfType, number>()
const _estimateSizeOverloads = new Map<TfType, (value: unknown) => number>()

/** Registers sizeof(T) for `type`, the TS stand-in for the C++ sizeof operator. */
export function Vdf_SetSizeof(type: TfType, size: number): void {
  _sizeofByType.set(type, size)
}

/** sizeof(T) for `type`. Posts a coding error and throws if none is known. */
export function Vdf_GetSizeof(type: TfType): number {
  const size = _sizeofByType.get(type) ?? _sizeofByName.get(type.getTypeName())
  if (size === undefined) {
    TF_CODING_ERROR(
      `No sizeof registered for type '${type.getTypeName()}' ` +
      '(pxr/exec/vdf/estimateSize.h:45); register it with Vdf_SetSizeof')
    throw new Error(`Vdf: no sizeof registered for type '${type.getTypeName()}'`)
  }
  return size
}

/** Registers the VdfEstimateSize overload for values of `type` (estimateSize.h:25-40). */
export function VdfRegisterEstimateSize<T>(type: TfType, estimate: (value: T) => number): void {
  _estimateSizeOverloads.set(type, estimate as (value: unknown) => number)
}

/**
 * Estimate the memory footprint of instance `t` of type T
 * (estimateSize.h:43-49): the registered overload, else sizeof(T).
 */
export function VdfEstimateSize<T>(type: TfType, t: T): number {
  const overload = _estimateSizeOverloads.get(type)
  if (overload) {
    return overload(t)
  }
  return Vdf_GetSizeof(type)
}

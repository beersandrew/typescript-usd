// Ported from OpenSubdiv 3.7.0: opensubdiv/vtr/types.h, opensubdiv/vtr/array.h
// Copyright 2014 DreamWorks Animation LLC. Tomorrow Open Source Technology
//  License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors opensubdiv/vtr/types.h and vtr/array.h.
//
// Index type and constants for indexing component vectors. Upstream wraps
// contiguous memory in Vtr::Array / ConstArray views (head + size). In TS we
// store the relation tables as Int32Array and hand out `.subarray()` views,
// which share the backing buffer and are writable — the same semantics with no
// pointer arithmetic.
//
// DIVERGENCE from upstream: LocalIndex is `unsigned short` in C++ (packed for
// memory); we store local indices in Int32Array too. Values are well within
// range (VALENCE_LIMIT), so behavior is identical.

export type Index = number
export type LocalIndex = number

/** Sentinel for an invalid/absent index. */
export const INDEX_INVALID = -1

export function IndexIsValid(index: Index): boolean {
  return index !== INDEX_INVALID
}

export const VALENCE_LIMIT = (1 << 16) - 1

/** A view into a relation table — an Int32Array subarray sharing its buffer. */
export type IndexArray = Int32Array
export type ConstIndexArray = Int32Array
export type LocalIndexArray = Int32Array
export type ConstLocalIndexArray = Int32Array

/** Linear search for `value` within `arr`; returns its position or -1. */
export function findIndexIn(arr: ArrayLike<number>, value: number): number {
  for (let i = 0; i < arr.length; ++i) {
    if (arr[i] === value) return i
  }
  return -1
}

// Ported from OpenUSD 26.11.1: pxr/exec/vdf/vectorImpl_Dispatch.cpp,
//  pxr/exec/vdf/vectorImpl_Dispatch.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/vectorImpl_Dispatch.h and
// vectorImpl_Dispatch.cpp.
//
// Vdf_VectorImplDispatch copies vector storage with memcpy or std::copy
// depending on whether T is trivially copyable (vectorImpl_Dispatch.h:18-59).
// In TS a typed pointer `T *p` is an (array, offset) pair: p[i] is
// array[offset + i] (offset may be negative, as for `_data - _first`).
// Elements are copied as C++ copy assignment copies them: primitives (the
// trivially copyable case) by value, objects with the value copy VtValue's
// copy constructor makes (Vt._CopyHeldValue, pxr/base/vt/src/value.ts).
// vectorImpl_Dispatch.cpp holds only static_asserts on GfVec3d and
// std::vector<bool>; there is nothing to port.

import { _CopyHeldValue as Vt_CopyHeldValue } from 'typescript-usd/vt'
import type { TfCompressedBits } from 'typescript-usd/tf'

/** A copy of `value`, as T's copy constructor or copy assignment makes it. */
export function Vdf_CopyElement<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value
  }
  return Vt_CopyHeldValue(value) as T
}

/** Vdf_VectorImplDispatch<T> (vectorImpl_Dispatch.h:18-59). */
export class Vdf_VectorImplDispatch {
  /** Copy `size` elements from a raw pointer (vectorImpl_Dispatch.h:24-27). */
  static copy<T>(
    dest: T[], destOffset: number,
    source: readonly T[], sourceOffset: number,
    size: number): void {
    for (let i = 0; i < size; ++i) {
      dest[destOffset + i] = Vdf_CopyElement(source[sourceOffset + i]!)
    }
  }

  /**
   * Copy chunks from a raw pointer, given a bitset indicating what to copy
   * (vectorImpl_Dispatch.h:29-42).
   */
  static copyBits<T>(
    dest: T[], destOffset: number,
    source: readonly T[], sourceOffset: number,
    bits: TfCompressedBits): void {
    const platforms = bits.getPlatformsView()
    for (const it = platforms.begin(), e = platforms.end(); !it.Equals(e); it.increment()) {
      if (it.isSet()) {
        const index = it.Get()
        Vdf_VectorImplDispatch.copy(
          dest, destOffset + index, source, sourceOffset + index, it.getPlatformSize())
      }
    }
  }
}

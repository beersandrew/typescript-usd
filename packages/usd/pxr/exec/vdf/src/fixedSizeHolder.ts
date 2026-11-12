// Ported from OpenUSD 26.11.1: pxr/exec/vdf/fixedSizeHolder.cpp,
//  pxr/exec/vdf/fixedSizeHolder.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/fixedSizeHolder.h and
// fixedSizeHolder.cpp.
//
// Vdf_FixedSizeHolder<T, Size> holds one object of type T in a buffer of
// exactly Size bytes, locally when it fits and on the heap otherwise
// (fixedSizeHolder.h:96-108). The local/remote choice is a C++ storage trick
// with no TS counterpart; what is ported is the observable API, a holder of
// one value with value semantics: copying the holder copies the value
// (Vdf_FixedSizeHolderRemoteStorage deep-copies, fixedSizeHolder.h:39-52).
// The value is kept in a one-element array, which stands in for the address
// of the held object (`&GetMutable()` is the array at offset 0).
// fixedSizeHolder.cpp is empty.

import { Vdf_CopyElement } from './vectorImpl_Dispatch.ts'

/** Vdf_FixedSizeHolder (fixedSizeHolder.h:110-180). */
export class Vdf_FixedSizeHolder<T> {
  readonly #storage: [T]

  /** Construct a holder holding `obj` (fixedSizeHolder.h:126-134). */
  constructor(obj: T) {
    this.#storage = [obj]
  }

  /** Copy constructor (fixedSizeHolder.h:136-139): copies the held object. */
  Clone(): Vdf_FixedSizeHolder<T> {
    return new Vdf_FixedSizeHolder<T>(Vdf_CopyElement(this.#storage[0]))
  }

  /** Copy assignment (fixedSizeHolder.h:150-153). */
  assign(other: Vdf_FixedSizeHolder<T>): this {
    this.#storage[0] = Vdf_CopyElement(other.#storage[0])
    return this
  }

  /** Get (fixedSizeHolder.h:160-162). */
  Get(): T {
    return this.#storage[0]
  }

  /**
   * GetMutable (fixedSizeHolder.h:164-166): the storage of the held object,
   * the TS form of a reference to it.
   */
  getMutable(): T[] {
    return this.#storage
  }

  /** Set (fixedSizeHolder.h:168-174). */
  Set(value: T): void {
    this.#storage[0] = value
  }
}

// Ported from OpenUSD 26.11.1: pxr/exec/vdf/typedVector.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/typedVector.h.
//
// A VdfTypedVector implements a VdfVector with a specific type
// (typedVector.h:18-67). TYPE is the leading TfType argument
// (openexec-x1.md 4.1): `VdfTypedVector<GfMatrix4d>(v)` is
// `new VdfTypedVector<GfMatrix4d>(GfMatrix4dType, v)`. Like upstream, the
// class holds no state of its own; it only constructs VdfVectors holding
// TYPE.

import type { Type as TfType } from 'typescript-usd/tf'
import { VdfVector } from './vector.ts'
import { Vdf_VectorImplContiguous } from './vectorImpl_Contiguous.ts'
import { Vdf_VectorImplEmpty } from './vectorImpl_Empty.ts'
import { Vdf_VectorImplSingle } from './vectorImpl_Single.ts'

/** VdfTypedVector (typedVector.h:18-67). */
export class VdfTypedVector<T> extends VdfVector {
  /** Constructs an empty vector (typedVector.h:27-32). */
  constructor(type: TfType)
  /** Constructs a new vector and initializes it with `value` (typedVector.h:34-39). */
  constructor(type: TfType, value: T)
  constructor(type: TfType, ...value: [] | [T]) {
    super()
    if (value.length === 0) {
      this._data.new(new Vdf_VectorImplEmpty<T>(type, 0))
    } else {
      this._data.new(new Vdf_VectorImplSingle<T>(type, value[0]))
    }
  }

  /** Constructs a new vector with the specified size (typedVector.h:41-44, 50-65). */
  static createWithSize<T>(type: TfType, size: number): VdfTypedVector<T> {
    const v = new VdfTypedVector<T>(type)
    v._data.destroy()
    switch (size) {
      case 0:
        v._data.new(new Vdf_VectorImplEmpty<T>(type, 0))
        break
      case 1:
        v._data.new(new Vdf_VectorImplSingle<T>(type))
        break
      default:
        v._data.new(new Vdf_VectorImplContiguous<T>(type, size))
        break
    }
    return v
  }
}

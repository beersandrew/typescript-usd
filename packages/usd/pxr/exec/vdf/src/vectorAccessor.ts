// Ported from OpenUSD 26.11.1: pxr/exec/vdf/vectorAccessor.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/vectorAccessor.h.
//
// Vdf_VectorAccessor<T> provides element access to a Vdf_VectorData with the
// type check done no matter what (vectorAccessor.h:19-117). The element type
// is a TfType argument (openexec-x1.md 4.1). `operator[]` returning T& is
// Get(i) and Set(i, v).

import { TF_DEV_AXIOM, TF_FATAL_ERROR, type Type as TfType } from 'typescript-usd/tf'
import type { Vdf_BoxedContainer } from './boxedContainer.ts'
import type { Vdf_BlockHint, Vdf_CompressedIndexMapping } from './compressedIndexMapping.ts'
import {
  Vdf_VectorDataInfoLayout, type Vdf_VectorData, type Vdf_VectorDataInfo,
} from './vectorData.ts'

/** Vdf_VectorAccessor (vectorAccessor.h:19-117). */
export class Vdf_VectorAccessor<T> {
  _numValues = 0
  // The storage and the offset of logical element 0 in it: element i is
  // _data[_offset + i] (upstream `_data = (T *)info.data - info.first`).
  _data: T[] = []
  _offset = 0
  _indexMapping: Vdf_CompressedIndexMapping | null = null
  readonly _indexMappingHint: Vdf_BlockHint = { value: 0 }
  _boxed = false

  /** Default constructor (vectorAccessor.h:30-35). */
  constructor()
  /** Constructor (vectorAccessor.h:37-79). */
  constructor(type: TfType, data: Vdf_VectorData, info: Vdf_VectorDataInfo)
  constructor(type?: TfType, data?: Vdf_VectorData, info?: Vdf_VectorDataInfo) {
    if (!type || !data || !info) {
      return
    }
    this._boxed = info.layout === Vdf_VectorDataInfoLayout.Boxed
    const haveType = data.getTypeInfo()
    if (haveType !== type) {
      TF_FATAL_ERROR(
        `Invalid type.  Vector is holding ${haveType.getTypeName()}, ` +
        `tried to use as ${type.getTypeName()}`)
    }
    // Setup the compressed index mapping, if any.
    if (info.compressedIndexMapping) {
      this._numValues = info.size
      this._data = (info.data ?? []) as T[]
      this._offset = 0
      this._indexMapping = info.compressedIndexMapping
      this._indexMappingHint.value = 0
    } else if (!this._boxed) {
      // Access for vector data that is not boxed.
      this._numValues = info.size
      this._data = (info.data ?? []) as T[]
      this._offset = -info.first
    } else {
      // Access for boxed vector data. We expect exactly a single data element
      // in this case.
      TF_DEV_AXIOM(
        !info.compressedIndexMapping &&
        info.size === 1 && info.first === 0 && info.last === 0,
        '!info.compressedIndexMapping && info.size == 1 && info.first == 0 && info.last == 0')
      const boxedVector = info.data as Vdf_BoxedContainer<T>
      this._numValues = boxedVector.size()
      this._data = boxedVector.data()
      this._offset = 0
    }
  }

  /** Returns true if vector is empty (vectorAccessor.h:81-84). */
  IsEmpty(): boolean {
    return this._numValues === 0
  }

  /** Returns size of the vector, ie. the number of values it holds (vectorAccessor.h:86-89). */
  getNumValues(): number {
    return this._numValues
  }

  /** Returns true if this accessor accesses a boxed container (vectorAccessor.h:91-95). */
  isBoxed(): boolean {
    return this._boxed
  }

  /** The storage index of logical element `idx` (vectorAccessor.h:97-104). */
  _storageIndex(idx: number): number {
    if (this._indexMapping) {
      return this._indexMapping.findDataIndex(idx, this._indexMappingHint)
    }
    return this._offset + idx
  }

  /** operator[] read (vectorAccessor.h:97-104). */
  Get(idx: number): T {
    return this._data[this._storageIndex(idx)]!
  }

  /** operator[] write (vectorAccessor.h:97-104). */
  Set(idx: number, value: T): void {
    this._data[this._storageIndex(idx)] = value
  }
}

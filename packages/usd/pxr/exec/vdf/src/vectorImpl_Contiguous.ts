// Ported from OpenUSD 26.11.1: pxr/exec/vdf/vectorImpl_Contiguous.cpp,
//  pxr/exec/vdf/vectorImpl_Contiguous.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/vectorImpl_Contiguous.h and
// vectorImpl_Contiguous.cpp.
//
// Implements Vdf_VectorData storage that holds a contiguous range of
// elements, which may be a subrange of the logical vector size
// (vectorImpl_Contiguous.h:24-332). `_data` holds the elements
// [_first, _last]; a typed pointer `const TYPE *data` argument is an
// (array, offset) pair (see vectorImpl_Dispatch.ts). The explicit
// instantiations in vectorImpl_Contiguous.cpp are a build-time device.

import {
  TF_DEV_AXIOM, TF_VERIFY, TfCompressedBits, type Type as TfType,
} from 'typescript-usd/tf'
import { Vdf_BoxedContainer } from './boxedContainer.ts'
import { Vdf_NewTypedArray } from './defaultInitAllocator.ts'
import type { VdfMask } from './mask.ts'
import { Vdf_VectorData, Vdf_VectorDataInfo, type Vdf_VectorDataDataHolder } from './vectorData.ts'
import { Vdf_VectorDataTyped, Vdf_VectorDataTyped_RegisterImpl } from './vectorDataTyped.ts'
import { Vdf_VectorImplBoxed } from './vectorImpl_Boxed.ts'
import { Vdf_VectorImplCompressed } from './vectorImpl_Compressed.ts'
import { Vdf_CopyElement, Vdf_VectorImplDispatch } from './vectorImpl_Dispatch.ts'
import { Vdf_VectorImplEmpty } from './vectorImpl_Empty.ts'

// ShouldStoreCompressed takes sizeof(TYPE) (vectorImpl_Contiguous.h:154-155)
// but does not read it (vectorData.cpp:24-43). It is not looked up, so that
// types with no registered sizeof (estimateSize.ts) can still be stored
// compressed.
const _UNREAD_ELEMENT_SIZE = 0

/** Vdf_VectorImplContiguous (vectorImpl_Contiguous.h:24-332). */
export class Vdf_VectorImplContiguous<T> extends Vdf_VectorDataTyped<T> {
  _data: T[] | null = null
  _size = 0
  _first = 0
  _last = 0

  /**
   * Dense vector constructor: storage for [0, size-1]
   * (vectorImpl_Contiguous.h:34-46).
   */
  constructor(type: TfType, size: number)
  /** Sparse vector constructor: storage for [first, last] (vectorImpl_Contiguous.h:48-57). */
  constructor(type: TfType, size: number, first: number, last: number)
  /**
   * Sparse vector constructor: storage for [bits.GetFirstSet(),
   * bits.GetLastSet()] (vectorImpl_Contiguous.h:59-68).
   */
  constructor(type: TfType, bits: TfCompressedBits)
  /**
   * Sparse vector constructor that copies the elements of `data` (logical
   * element i at data[dataOffset + i]) for each set bit in `bits`
   * (vectorImpl_Contiguous.h:70-90).
   */
  constructor(type: TfType, data: readonly T[], dataOffset: number, bits: TfCompressedBits)
  constructor(
    type: TfType,
    a: number | TfCompressedBits | readonly T[],
    b?: number,
    c?: number | TfCompressedBits,
    d?: never) {
    super(type)
    void d
    if (typeof a === 'number' && b === undefined) {
      const size = a
      this._data = size ? Vdf_NewTypedArray<T>(type, size) : null
      this._size = size
      this._first = 0
      this._last = size ? size - 1 : 0
    } else if (typeof a === 'number') {
      this._allocateSpaceRange(a, b!, c as number)
    } else if (a instanceof TfCompressedBits) {
      this._allocateSpace(a)
    } else {
      const bits = c as TfCompressedBits
      this._allocateSpace(bits)
      if (this._data) {
        // We can allow to copy only elements that are needed, since _data[]
        // is default initialized.
        const firstSet = bits.getFirstSet()
        Vdf_VectorImplDispatch.copyBits(this._data, -firstSet, a, b!, bits)
      }
    }
  }

  /** The copy constructor (vectorImpl_Contiguous.h:92-107). */
  static _copy<T>(rhs: Vdf_VectorImplContiguous<T>): Vdf_VectorImplContiguous<T> {
    const copy = new Vdf_VectorImplContiguous<T>(rhs._type, 0)
    copy._size = rhs._size
    copy._first = rhs._first
    copy._last = rhs._last
    if (rhs._data) {
      const numUsed = copy._last - copy._first + 1
      copy._data = new Array<T>(numUsed)
      Vdf_VectorImplDispatch.copy(copy._data, 0, rhs._data, 0, numUsed)
    } else {
      copy._data = null
    }
    return copy
  }

  /** The move constructor (vectorImpl_Contiguous.h:109-120). */
  static _move<T>(sourceData: Vdf_VectorImplContiguous<T>): Vdf_VectorImplContiguous<T> {
    const moved = new Vdf_VectorImplContiguous<T>(sourceData._type, 0)
    moved._data = sourceData._data
    moved._size = sourceData._size
    moved._first = sourceData._first
    moved._last = sourceData._last
    sourceData._data = null
    sourceData._size = 0
    sourceData._first = 0
    sourceData._last = 0
    return moved
  }

  // vectorImpl_Contiguous.h:127-132
  override moveInto(destData: Vdf_VectorDataDataHolder): void {
    const moved = Vdf_VectorImplContiguous._move(this)
    destData.destroy()
    destData.new(moved)
  }

  // vectorImpl_Contiguous.h:134-139
  override Clone(destData: Vdf_VectorDataDataHolder): void {
    const copy = Vdf_VectorImplContiguous._copy(this)
    destData.destroy()
    destData.new(copy)
  }

  // vectorImpl_Contiguous.h:141-193
  override cloneSubset(mask: VdfMask, destData: Vdf_VectorDataDataHolder): void {
    TF_DEV_AXIOM(this._size === mask.getSize(), '_size == mask.GetSize()')

    // We're a contiguous vector and there is potential for more subsetting.
    if (mask.isAllZeros()) {
      // Store an empty vector that indicates that we have the correct size,
      // but there are no stored values.
      destData.destroy()
      destData.new(new Vdf_VectorImplEmpty<T>(this._type, mask.getSize()))
    } else if (Vdf_VectorData.shouldStoreCompressed(mask.getBits(), _UNREAD_ELEMENT_SIZE)) {
      // If the destination data is already a compressed vector, try to avoid
      // reallocating by copying a subset of our data into it.
      const destCompressed = destData.Get()
      if (destCompressed instanceof Vdf_VectorImplCompressed &&
          destCompressed.getTypeInfo() === this._type) {
        (destCompressed as Vdf_VectorImplCompressed<T>).assign(this._data!, -this._first, mask)
      } else {
        const impl = new Vdf_VectorImplCompressed<T>(
          this._type, this._data!, -this._first, mask.getBits())
        destData.destroy()
        destData.new(impl)
      }
    } else {
      // Here's where we can create a subset vector.
      const firstSet = mask.getFirstSet()
      const lastSet = mask.getLastSet()
      if (firstSet === this._first && lastSet === this._last) {
        // In this case we want all of this already subset vector.
        this.Clone(destData)
      } else {
        // Here we're splitting up the already contiguous vector a little
        // more.
        const impl = new Vdf_VectorImplContiguous<T>(
          this._type, this._data!, -this._first, mask.getBits())
        destData.destroy()
        destData.new(impl)
      }
    }
  }

  // vectorImpl_Contiguous.h:195-221
  override box(bits: TfCompressedBits, destData: Vdf_VectorDataDataHolder): void {
    TF_VERIFY(bits.getFirstSet() >= this._first, 'bits.GetFirstSet() >= _first')
    TF_VERIFY(bits.getLastSet() <= this._last, 'bits.GetLastSet() <= _last')

    const v = new Vdf_BoxedContainer<T>(this._type, bits.getNumSet())
    const data = this._data ?? []
    if (bits.areContiguouslySet()) {
      const offset = bits.getFirstSet() - this._first
      for (let i = 0; i < v.size(); ++i) {
        v.Set(i, Vdf_CopyElement(data[offset + i]!))
      }
    } else {
      let i = 0
      for (const idx of bits.getAllSetView()) {
        v.Set(i++, Vdf_CopyElement(data[idx - this._first]!))
      }
    }
    destData.destroy()
    destData.new(new Vdf_VectorImplBoxed<T>(this._type, v))
  }

  // vectorImpl_Contiguous.h:223-242
  override merge(bits: TfCompressedBits, destData: Vdf_VectorDataDataHolder): void {
    // Retrieve the destination information
    const info = destData.Get().getInfo()

    // The destination must be a contiguous vector
    if (!TF_VERIFY(
      info.size > 1 && info.compressedIndexMapping === null && info.data,
      'info.size > 1 && info.compressedIndexMapping == NULL && info.data',
      'destData is not a Vdf_VectorImplContiguous.')) {
      return
    }

    // Merge the requested data into the destination vector
    const typedDest = info.data as T[]
    Vdf_VectorImplDispatch.copyBits(
      typedDest, -info.first, this._data ?? [], -this._first, bits)
  }

  // vectorImpl_Contiguous.h:244-277
  override Expand(first: number, last: number): void {
    // Make sure that the storage grows, but never shrinks. If the storage is
    // currently empty, use the passed in range.
    const newFirst = this._data ? Math.min(this._first, first) : first
    const newLast = this._data ? Math.max(this._last, last) : last

    // If the storage space is already big enough, there is nothing to do.
    if (this._first === newFirst && this._last === newLast) {
      return
    }

    // Retain the old data
    const oldData = this._data

    // Allocate a new data section
    const newSize = newLast - newFirst + 1
    this._data = Vdf_NewTypedArray<T>(this._type, newSize)

    // Copy the old data, if available
    if (oldData) {
      Vdf_VectorImplDispatch.copy(
        this._data, this._first - newFirst, oldData, 0, this._last - this._first + 1)
    }

    // Set the new info
    this._first = newFirst
    this._last = newLast
  }

  // vectorImpl_Contiguous.h:279-282
  override getSize(): number {
    return this._size
  }

  // vectorImpl_Contiguous.h:284-290
  override getNumStoredElements(): number {
    if (!this._data) {
      return 0
    }
    return this._last - this._first + 1
  }

  // vectorImpl_Contiguous.h:292-295
  override isSharable(): boolean {
    return this._size >= Vdf_VectorData._VectorSharingSize
  }

  // vectorImpl_Contiguous.h:297-304
  override getInfo(): Vdf_VectorDataInfo {
    return new Vdf_VectorDataInfo(
      /* data = */ this._data,
      /* size = */ this._size,
      /* first = */ this._first,
      /* last = */ this._last)
  }

  // vectorImpl_Contiguous.h:307-320
  _allocateSpace(bits: TfCompressedBits): void {
    if (bits.areAllUnset()) {
      this._data = null
      this._size = bits.getSize()
      this._first = 0
      this._last = 0
    } else {
      this._allocateSpaceRange(bits.getSize(), bits.getFirstSet(), bits.getLastSet())
    }
  }

  // vectorImpl_Contiguous.h:322-332
  _allocateSpaceRange(size: number, firstIndex: number, lastIndex: number): void {
    this._size = size
    this._first = firstIndex
    TF_DEV_AXIOM(this._first < this._size, '_first < _size')
    this._last = lastIndex
    TF_DEV_AXIOM(this._last >= this._first, '_last >= _first')
    const numUsed = this._last - this._first + 1
    this._data = Vdf_NewTypedArray<T>(this._type, numUsed)
  }
}

Vdf_VectorDataTyped_RegisterImpl('Sparse',
  (type, size, first, last) => new Vdf_VectorImplContiguous(type, size, first, last))
Vdf_VectorDataTyped_RegisterImpl('Dense', (type, size) => new Vdf_VectorImplContiguous(type, size))

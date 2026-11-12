// Ported from OpenUSD 26.11.1: pxr/exec/vdf/vectorImpl_Compressed.cpp,
//  pxr/exec/vdf/vectorImpl_Compressed.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/vectorImpl_Compressed.h and
// vectorImpl_Compressed.cpp.
//
// Implements a Vdf_VectorData storage that holds the subset of a vector
// selected by a mask; the storage omits all elements associated with zeros
// in the mask (vectorImpl_Compressed.h:26-136). See compressedIndexMapping.ts
// for the mapping. A typed pointer `const TYPE *data` argument is an
// (array, offset) pair (see vectorImpl_Dispatch.ts). The explicit
// instantiations in vectorImpl_Compressed.cpp are a build-time device.

import {
  TF_DEV_AXIOM, TF_VERIFY, TfCompressedBits, type Type as TfType,
} from 'typescript-usd/tf'
import { Vdf_BoxedContainer } from './boxedContainer.ts'
import { Vdf_CompressedIndexMapping } from './compressedIndexMapping.ts'
import { Vdf_NewTypedArray } from './defaultInitAllocator.ts'
import type { VdfMask } from './mask.ts'
import { Vdf_VectorDataInfo, type Vdf_VectorDataDataHolder } from './vectorData.ts'
import { Vdf_VectorDataTyped } from './vectorDataTyped.ts'
import { Vdf_VectorImplBoxed } from './vectorImpl_Boxed.ts'
import { Vdf_CopyElement, Vdf_VectorImplDispatch } from './vectorImpl_Dispatch.ts'

/** Vdf_VectorImplCompressed (vectorImpl_Compressed.h:26-136). */
export class Vdf_VectorImplCompressed<T> extends Vdf_VectorDataTyped<T> {
  _data: T[] | null = null
  _logicalSize = 0
  _compressedIndexMapping: Vdf_CompressedIndexMapping | null

  /**
   * Construct storage for the elements of `data` (logical element i at
   * data[dataOffset + i]) indicated by `bits` (vectorImpl_Compressed.h:37-43).
   */
  constructor(type: TfType, data: readonly T[], dataOffset: number, bits: TfCompressedBits)
  /**
   * Construct enough storage to hold as many elements as `bits` has set
   * (vectorImpl_Compressed.h:45-51).
   */
  constructor(type: TfType, bits: TfCompressedBits)
  constructor(
    type: TfType,
    a: readonly T[] | TfCompressedBits,
    b?: number,
    c?: TfCompressedBits) {
    super(type)
    this._compressedIndexMapping = new Vdf_CompressedIndexMapping()
    if (Array.isArray(a)) {
      this._allocateSpace(c!)
      this._initialize(a, b!, c!)
    } else {
      const bits = a as TfCompressedBits
      this._allocateSpace(bits)
      this._initialize(null, 0, bits)
    }
  }

  /** The copy constructor (vectorImpl_Compressed.h:140-156). */
  static _copy<T>(rhs: Vdf_VectorImplCompressed<T>): Vdf_VectorImplCompressed<T> {
    const copy = new Vdf_VectorImplCompressed<T>(rhs._type, new TfCompressedBits())
    copy._logicalSize = rhs._logicalSize
    copy._compressedIndexMapping = rhs._compressedIndexMapping!.Clone()
    if (rhs._data) {
      const numUsed = rhs.getNumStoredElements()
      copy._data = new Array<T>(numUsed)
      Vdf_VectorImplDispatch.copy(copy._data, 0, rhs._data, 0, numUsed)
    } else {
      copy._data = null
    }
    return copy
  }

  /** The move constructor (vectorImpl_Compressed.h:55-64). */
  static _move<T>(sourceData: Vdf_VectorImplCompressed<T>): Vdf_VectorImplCompressed<T> {
    const moved = new Vdf_VectorImplCompressed<T>(sourceData._type, new TfCompressedBits())
    moved._data = sourceData._data
    moved._logicalSize = sourceData._logicalSize
    moved._compressedIndexMapping = sourceData._compressedIndexMapping
    sourceData._data = null
    sourceData._logicalSize = 0
    sourceData._compressedIndexMapping = null
    return moved
  }

  // vectorImpl_Compressed.h:74-79
  override moveInto(destData: Vdf_VectorDataDataHolder): void {
    const moved = Vdf_VectorImplCompressed._move(this)
    destData.destroy()
    destData.new(moved)
  }

  // vectorImpl_Compressed.h:81-86
  override Clone(destData: Vdf_VectorDataDataHolder): void {
    const copy = Vdf_VectorImplCompressed._copy(this)
    destData.destroy()
    destData.new(copy)
  }

  /**
   * Assigns the subset of `data` (logical element i at data[dataOffset + i])
   * described by `mask` into this vector (vectorImpl_Compressed.h:88-102).
   */
  assign(data: readonly T[], dataOffset: number, mask: VdfMask): void {
    // If our current data isn't the exact right size, allocate an array of
    // the appropriate size.
    if (this.getNumStoredElements() !== mask.getNumSet()) {
      this._data = Vdf_NewTypedArray<T>(this._type, mask.getNumSet())
    }
    this._initialize(data, dataOffset, mask.getBits())
  }

  // vectorImpl_Compressed.h:158-198
  override cloneSubset(mask: VdfMask, destData: Vdf_VectorDataDataHolder): void {
    TF_DEV_AXIOM(this._logicalSize === mask.getSize(), '_logicalSize == mask.GetSize()')

    const bits = mask.getBits()

    // Allocate space and build an index mapping, leaving data uninitialized.
    const destImpl = new Vdf_VectorImplCompressed<T>(this._type, bits)
    const srcData = this._data ?? []
    const srcMapping = this._compressedIndexMapping!

    // Copy the relevant data from me into the destination. The mapping is
    // conveniently already set up.
    const srcBlockHint = { value: 0 }
    const destBlockHint = { value: 0 }
    const platforms = bits.getPlatformsView()
    for (const it = platforms.begin(), e = platforms.end(); !it.Equals(e); it.increment()) {
      if (it.isSet()) {
        const index = it.Get()
        const srcDataIdx = srcMapping.findDataIndex(index, srcBlockHint)
        const destDataIdx = destImpl._compressedIndexMapping!.findDataIndex(index, destBlockHint)
        Vdf_VectorImplDispatch.copy(
          destImpl._data!, destDataIdx, srcData, srcDataIdx, it.getPlatformSize())
      }
    }
    destData.destroy()
    destData.new(destImpl)
  }

  // vectorImpl_Compressed.h:200-222
  override box(bits: TfCompressedBits, destData: Vdf_VectorDataDataHolder): void {
    const mapping = this._compressedIndexMapping!
    TF_VERIFY(bits.getFirstSet() >= mapping.getFirstIndex(),
      'bits.GetFirstSet() >= _compressedIndexMapping->GetFirstIndex()')
    TF_VERIFY(bits.getLastSet() <= mapping.getLastIndex(),
      'bits.GetLastSet() <= _compressedIndexMapping->GetLastIndex()')

    const v = new Vdf_BoxedContainer<T>(this._type, bits.getNumSet())
    const data = this._data ?? []
    let i = 0
    const blockHint = { value: 0 }
    for (const idx of bits.getAllSetView()) {
      const dataIdx = mapping.findDataIndex(idx, blockHint)
      v.Set(i++, Vdf_CopyElement(data[dataIdx]!))
    }
    destData.destroy()
    destData.new(new Vdf_VectorImplBoxed<T>(this._type, v))
  }

  // vectorImpl_Compressed.h:224-259
  override merge(bits: TfCompressedBits, destData: Vdf_VectorDataDataHolder): void {
    // Retrieve the destination information
    const info = destData.Get().getInfo()

    // The destination must be a dense vector
    if (!TF_VERIFY(
      info.size > 1 && info.compressedIndexMapping === null && info.data,
      'info.size > 1 && info.compressedIndexMapping == NULL && info.data',
      'destData is not a Vdf_VectorImplDense.')) {
      return
    }

    // Merge the requested data into the destination vector (must be sparse
    // or dense)
    const srcBlockHint = { value: 0 }
    const typedDest = info.data as T[]
    const srcData = this._data ?? []
    const platforms = bits.getPlatformsView()
    for (const it = platforms.begin(), e = platforms.end(); !it.Equals(e); it.increment()) {
      if (it.isSet()) {
        const index = it.Get()
        const srcDataIdx = this._compressedIndexMapping!.findDataIndex(index, srcBlockHint)
        Vdf_VectorImplDispatch.copy(
          typedDest, index - info.first, srcData, srcDataIdx, it.getPlatformSize())
      }
    }
  }

  // vectorImpl_Compressed.h:110-113
  override getSize(): number {
    return this._logicalSize
  }

  // vectorImpl_Compressed.h:115-122
  override getNumStoredElements(): number {
    const mappings = this._compressedIndexMapping?._blockMappings ?? []
    if (mappings.length > 0) {
      return mappings[mappings.length - 1]!.dataEndIndex
    }
    return 0
  }

  // vectorImpl_Compressed.h:124-132
  override getInfo(): Vdf_VectorDataInfo {
    const mapping = this._compressedIndexMapping!
    const hasBlocks = mapping._blockMappings.length > 0
    return new Vdf_VectorDataInfo(
      /* data = */ this._data,
      /* size = */ this._logicalSize,
      // Upstream reads block 0 unconditionally; a mapping without blocks
      // (nothing stored) reports 0.
      /* first = */ hasBlocks ? mapping.getFirstIndex() : 0,
      /* last = */ hasBlocks ? mapping.getLastIndex() : 0,
      /* compressedIndexMapping = */ mapping)
  }

  // vectorImpl_Compressed.h:261-300
  _initialize(srcData: readonly T[] | null, srcOffset: number, bits: TfCompressedBits): void {
    // Note the logical size of the vector is not the same as how much data
    // it stores.
    this._logicalSize = bits.getSize()
    const newStorageSize = bits.getNumSet()

    // Check to make sure that we have elements to copy.
    if (newStorageSize === 0) {
      return
    }

    // Compute the compressed index mapping, which provides a mapping from
    // logical indices to packed stored data indices in _data.
    this._compressedIndexMapping!.initialize(bits)

    // If specified, initialize this vector's data, using the compressed
    // index mapping. Copy from the srcData in chunks as specified by the mask.
    if (srcData) {
      let destDataIdx = 0
      const platforms = bits.getPlatformsView()
      for (const it = platforms.begin(), e = platforms.end(); !it.Equals(e); it.increment()) {
        if (it.isSet()) {
          const platformSize = it.getPlatformSize()
          Vdf_VectorImplDispatch.copy(
            this._data!, destDataIdx, srcData, srcOffset + it.Get(), platformSize)
          destDataIdx += platformSize
        }
      }
    }

    // A few sanity check axioms.
    TF_DEV_AXIOM(this._logicalSize > 0, '_logicalSize > 0')
    TF_DEV_AXIOM(this._data, '_data')
  }

  // vectorImpl_Compressed.h:128-131
  _allocateSpace(bits: TfCompressedBits): void {
    this._data = Vdf_NewTypedArray<T>(this._type, bits.getNumSet())
  }
}

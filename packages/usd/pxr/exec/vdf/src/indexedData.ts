// Ported from OpenUSD 26.11.1: pxr/exec/vdf/indexedData.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/indexedData.h.
//
// VdfIndexedData<T> holds (index, data) pairs with strictly increasing
// indices (indexedData.h:24-254). `operator[]` returning T& is Set(i, v)
// next to GetData(i) (openexec-x1.md 4.1 "Operators"); operator== is Equals;
// swap is Swap; the ostream operator is toString(); TfHashAppend is GetHash.
// The copy constructor is Clone() (elements are copied as values, see
// vectorImpl_Dispatch.ts).

import { Hash as TfHash, TF_CODING_ERROR, TF_DEV_AXIOM } from 'typescript-usd/tf'
import { VdfIndexedDataIterator } from './indexedDataIterator.ts'
import { Vdf_Equals } from './traits.ts'
import { Vdf_CopyElement } from './vectorImpl_Dispatch.ts'

// std::lower_bound over sorted indices.
function _LowerBound(indices: readonly number[], value: number): number {
  let lo = 0
  let hi = indices.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (indices[mid]! < value) {
      lo = mid + 1
    } else {
      hi = mid
    }
  }
  return lo
}

/** VdfIndexedData (indexedData.h:24-254). */
export class VdfIndexedData<T> {
  // The indices corresponding to the data in _data.
  _indices: number[] = []
  // The data corresponding to the indices in _indices.
  _data: T[] = []

  /** Copy constructor. */
  Clone(): VdfIndexedData<T> {
    const copy = new (this.constructor as new () => VdfIndexedData<T>)()
    copy._indices = this._indices.slice()
    copy._data = this._data.map(Vdf_CopyElement)
    return copy
  }

  /**
   * Adds a corresponding (index, data) pair to this object. The index values
   * must be added in strictly increasing order (indexedData.h:34-50).
   */
  add(index: number, data: T): void {
    if (this._indices.length > 0 && index <= this._indices[this._indices.length - 1]!) {
      TF_CODING_ERROR('Indexed data must be added in sorted order.')
      return
    }
    this._indices.push(index)
    this._data.push(data)
  }

  /** Returns the number of indexed data (indexedData.h:52-57). */
  getSize(): number {
    return this._indices.length
  }

  /** Reserve a size for the arrays (indexedData.h:59-66). JS arrays grow on demand. */
  reserve(_size: number): void {}

  /** Returns true if this structure is empty (indexedData.h:68-73). */
  IsEmpty(): boolean {
    return this._indices.length === 0
  }

  /** Returns the i'th index (indexedData.h:75-80). */
  getIndex(i: number): number {
    return this._indices[i]!
  }

  /** Returns the i'th data (indexedData.h:82-87). */
  getData(i: number): T {
    return this._data[i]!
  }

  /** operator[] write: assigns the i'th data (indexedData.h:89-96). */
  Set(i: number, value: T): void {
    this._data[i] = value
  }

  /**
   * Returns the first index that is greater than or equal to `currentIndex`,
   * or GetSize() if none (indexedData.h:98-104, 303-310). With `startIndex`,
   * performs a linear search starting there (indexedData.h:106-122).
   */
  getFirstDataIndex(currentIndex: number, startIndex?: number): number {
    if (startIndex === undefined) {
      return _LowerBound(this._indices, currentIndex)
    }
    const size = this._indices.length
    for (let i = startIndex; i < size; ++i) {
      const index = this._indices[i]!
      if (index >= 0 && index >= currentIndex) {
        return i
      }
    }
    return size
  }

  /**
   * Composes indexedData with an over composition, strong over weak
   * (indexedData.h:124-139, 312-419). Indices are the union of weak and
   * strong; strong wins if both have data for the same index. `result` must
   * be different than weak and strong.
   */
  static compose<T>(result: VdfIndexedData<T>, weak: VdfIndexedData<T>, strong: VdfIndexedData<T>): void {
    if (weak === result || strong === result) {
      TF_CODING_ERROR('Result indexData must be different than strong or weak.')
      return
    }

    // Quick returns in the case where one of the vectors is empty
    if (strong._indices.length === 0) {
      result._indices = weak._indices.slice()
      result._data = weak._data.map(Vdf_CopyElement)
      return
    }
    if (weak._indices.length === 0) {
      result._indices = strong._indices.slice()
      result._data = strong._data.map(Vdf_CopyElement)
      return
    }

    const resultIndices = result._indices
    const resultData = result._data
    resultIndices.length = 0
    resultData.length = 0

    let strongIndex = 0
    let strongDone = false
    let weakIndex = 0
    let weakDone = false

    const strongIndices = strong._indices
    const weakIndices = weak._indices
    const numStrongIndices = strongIndices.length
    const numWeakIndices = weakIndices.length

    while (!weakDone || !strongDone) {
      // default to appending value from strong indexedData
      let useStrongValue = true
      let strongIndexValue = -1
      let weakIndexValue = -1

      if (strongDone) {
        useStrongValue = false
        weakIndexValue = weakIndices[weakIndex]!
      } else if (weakDone) {
        strongIndexValue = strongIndices[strongIndex]!
      } else {
        strongIndexValue = strongIndices[strongIndex]!
        weakIndexValue = weakIndices[weakIndex]!
        if (weakIndexValue < strongIndexValue) {
          // Only case where we use weak value.
          useStrongValue = false
        }
      }

      if (useStrongValue) {
        TF_DEV_AXIOM(strongIndexValue >= 0, 'strongIndexValue >= 0')
        resultIndices.push(strongIndexValue)
        resultData.push(Vdf_CopyElement(strong._data[strongIndex]!))
        ++strongIndex
        if (weakIndexValue === strongIndexValue) {
          ++weakIndex
        }
      } else {
        TF_DEV_AXIOM(weakIndexValue >= 0, 'weakIndexValue >= 0')
        resultIndices.push(weakIndexValue)
        resultData.push(Vdf_CopyElement(weak._data[weakIndex]!))
        ++weakIndex
      }

      // check if we've hit the end of either vector
      if (strongIndex >= numStrongIndices) {
        strongDone = true
      }
      if (weakIndex >= numWeakIndices) {
        weakDone = true
      }
    }
  }

  /**
   * Returns the amount of memory used by this data structure
   * (indexedData.h:141-148): sizeof(*this) (two std::vectors, 48 bytes in
   * the native build) plus the index and data storage. The data element
   * size is `sizeofT`, sizeof(T).
   */
  getMemoryUsage(sizeofT: number): number {
    return 48 + 4 * this._indices.length + sizeofT * this._data.length
  }

  /** TfHashAppend (indexedData.h:150-157): hashes the indices and data. */
  getHash(): number {
    return Number(TfHash([this._indices, this._data]) & 0xffffffffn)
  }

  /** operator== (indexedData.h:159-165). */
  Equals(rhs: VdfIndexedData<T>): boolean {
    return Vdf_Equals(this._indices, rhs._indices) && Vdf_Equals(this._data, rhs._data)
  }

  /** operator!= (indexedData.h:167-171). */
  notEquals(rhs: VdfIndexedData<T>): boolean {
    return !this.Equals(rhs)
  }

  /** swap (indexedData.h:173-178). */
  swap(rhs: VdfIndexedData<T>): void {
    const indices = this._indices
    this._indices = rhs._indices
    rhs._indices = indices
    const data = this._data
    this._data = rhs._data
    rhs._data = data
  }

  /** The index iterators [begin, end) (indexedData.h:180-205). */
  getIndexIterators(): [VdfIndexedDataIterator<number>, VdfIndexedDataIterator<number>] {
    return [
      new VdfIndexedDataIterator<number>(this._indices, 0),
      new VdfIndexedDataIterator<number>(this._indices, this._indices.length),
    ]
  }

  /** The data iterators [begin, end) (indexedData.h:207-216). */
  getDataIterators(): [VdfIndexedDataIterator<T>, VdfIndexedDataIterator<T>] {
    return [
      new VdfIndexedDataIterator<T>(this._data, 0),
      new VdfIndexedDataIterator<T>(this._data, this._data.length),
    ]
  }

  // Protected accessors (indexedData.h:218-252).
  _getWriteIndices(): number[] { return this._indices }
  _getReadIndices(): readonly number[] { return this._indices }
  _getWriteData(): T[] { return this._data }
  _getReadData(): readonly T[] { return this._data }

  /** operator<< (indexedData.h:281-299): "[(index, data), ...]". */
  toString(): string {
    const parts: string[] = []
    for (let i = 0; i < this.getSize(); ++i) {
      parts.push(`(${this.getIndex(i)}, ${String(this.getData(i))})`)
    }
    return `[${parts.join(', ')}]`
  }
}

// Ported from OpenUSD 26.11.1: pxr/exec/vdf/vectorIterator.h
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/vectorIterator.h.
//
// A read-only iterator over values held by a VdfVector
// (vectorIterator.h:20-104). Iterator API per openexec-x1.md 4.1:
// IsAtEnd(), Increment() (operator++), Deref() (operator*).
// The block mapping pointer `_mapping` is an index into `_mappings`.

import { TF_DEV_AXIOM } from 'typescript-usd/tf'
import type { Vdf_BoxedContainer } from './boxedContainer.ts'
import type { Vdf_IndexBlockMapping } from './compressedIndexMapping.ts'
import { Vdf_VectorDataInfoLayout, type Vdf_VectorDataInfo } from './vectorData.ts'

/** VdfVectorIterator (vectorIterator.h:20-104). */
export class VdfVectorIterator<T> {
  // Offset from _begin of the current data element.
  _dataIndex = 0
  // Offset from _mapping->logicalStartIndex of the current data element.
  _logicalOffset = 0
  // The block mappings and the index of the current one.
  _mappings: readonly Vdf_IndexBlockMapping[] = []
  _mapping = 0
  // Semi-open range over all data elements stored by the vector:
  // _storage[0, _numValues).
  _storage: readonly T[] = []
  _numValues = 0

  /**
   * Construct an iterator that is at end and not associated with a vector
   * (vectorIterator.h:25-26), or, as only VdfVector does, one over the
   * elements described by `info` (vectorIterator.h:136-170).
   */
  constructor(info?: Vdf_VectorDataInfo) {
    if (!info) {
      return
    }
    if (info.compressedIndexMapping) {
      const mappings = info.compressedIndexMapping._blockMappings
      const numValues = mappings.length === 0 ? 0 : mappings[mappings.length - 1]!.dataEndIndex
      this._storage = (info.data ?? []) as T[]
      this._numValues = numValues
      this._mappings = mappings
    } else if (info.layout !== Vdf_VectorDataInfoLayout.Boxed) {
      // Upstream computes last - first + 1 values even when no storage is
      // allocated (an empty impl of nonzero size), and then dereferences a
      // null pointer; with no storage there are no values here.
      const numValues = info.size === 0 || !info.data ? 0 : info.last - info.first + 1
      this._storage = (info.data ?? []) as T[]
      this._numValues = numValues
      this._mappings = [{ logicalStartIndex: info.first, dataEndIndex: numValues }]
    } else {
      const boxedVector = info.data as Vdf_BoxedContainer<T>
      const numValues = boxedVector.size()
      this._storage = boxedVector.data()
      this._numValues = numValues
      this._mappings = [{ logicalStartIndex: 0, dataEndIndex: numValues }]
    }
  }

  /** Returns true if this does not point to an element in the vector (vectorIterator.h:33-37). */
  isAtEnd(): boolean {
    return this._dataIndex === this._numValues
  }

  /** Advances the iterator to the next data element (vectorIterator.h:106-123). */
  increment(): this {
    ++this._dataIndex
    ++this._logicalOffset
    // When increment moves this iterator to the end, _mapping points past
    // the end of its array.
    if (this._dataIndex === this._mappings[this._mapping]!.dataEndIndex) {
      // Reset the offset within the block when advancing to a new block.
      this._logicalOffset = 0
      ++this._mapping
    }
    return this
  }

  /** Returns the data element pointed to by this (vectorIterator.h:42-46). */
  deref(): T {
    TF_DEV_AXIOM(!this.isAtEnd(), '!IsAtEnd()')
    return this._storage[this._dataIndex]!
  }

  /**
   * Advances this to a data element at or past `idx`. Returns true if this
   * points exactly at `idx` after advancing (vectorIterator.h:48-69,
   * 125-134).
   */
  advanceTo(idx: number): boolean {
    while (!this.isAtEnd() && this._getIndex() < idx) {
      this.increment()
    }
    return !this.isAtEnd() && this._getIndex() === idx
  }

  /** Returns the index of the current data element (vectorIterator.h:76-79). */
  _getIndex(): number {
    return this._mappings[this._mapping]!.logicalStartIndex + this._logicalOffset
  }
}

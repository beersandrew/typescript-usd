// Ported from OpenUSD 26.11.1: pxr/exec/vdf/nodeSet.cpp,
//  pxr/exec/vdf/nodeSet.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/nodeSet.h and nodeSet.cpp.
//
// A set of nodes stored as a bit set over node indices. Iteration yields the
// node indices in the set (TfBits::View<AllSet>, nodeSet.h:81-94).

// Relative import: TfBits is not in the tf barrel yet.
import { TfBits } from 'typescript-usd/tf'

import { VdfNode } from './node.ts'
import type { VdfIndex } from './types.ts'

export class VdfNodeSet implements Iterable<VdfIndex> {
  // _bits (nodeSet.h:111): its size is the capacity.
  private _bits = new TfBits()

  /** IsEmpty (nodeSet.h:34). */
  IsEmpty(): boolean {
    return this._bits.getSize() === 0 || this._bits.getNumSet() === 0
  }

  /** GetSize (nodeSet.h:40): the number of nodes in the set. */
  getSize(): number {
    return this._bits.getNumSet()
  }

  /** Clear (nodeSet.cpp:12-18): also reclaims memory. */
  clear(): void {
    if (this._bits.getSize() !== 0) this._bits.resize(0)
  }

  /** Contains(node) (nodeSet.h:53) and Contains(index) (nodeSet.h:59). */
  contains(nodeOrIndex: VdfNode | VdfIndex): boolean {
    const index = typeof nodeOrIndex === 'number'
      ? nodeOrIndex
      : VdfNode.getIndexFromId(nodeOrIndex.getId())
    return index < this._bits.getSize() ? this._bits.isSet(index) : false
  }

  /** Insert(node) (nodeSet.h:115-127) and Insert(nodeSet) (nodeSet.cpp:20-28). */
  insert(nodeOrSet: VdfNode | VdfNodeSet): void {
    if (nodeOrSet instanceof VdfNodeSet) {
      const rhs = nodeOrSet
      this._bits.resizeKeepContent(Math.max(this._bits.getSize(), rhs._bits.getSize()))
      this._bits.orSubset(rhs._bits)
      return
    }

    const index = VdfNode.getIndexFromId(nodeOrSet.getId())
    if (index >= this._bits.getSize()) this._grow(index + 1)
    this._bits.Set(index)
  }

  /** Remove (nodeSet.cpp:30-47): true if node was in the set. */
  remove(node: VdfNode): boolean {
    const index = VdfNode.getIndexFromId(node.getId())
    if (index < this._bits.getSize()) {
      if (this._bits.isSet(index)) {
        this._bits.clear(index)
        return true
      }
    }
    return false
  }

  /** begin()/end() (nodeSet.h:86-94): the indices in the set. */
  [Symbol.iterator](): Iterator<VdfIndex> {
    return this._bits.getAllSetView()[Symbol.iterator]()
  }

  /** swap (nodeSet.h:98). */
  swap(rhs: VdfNodeSet): void {
    this._bits.swap(rhs._bits)
  }

  // _Grow (nodeSet.cpp:49-57): growth factor 1.5.
  private _grow(size: number): void {
    const capacity = size + Math.floor(size / 2)
    if (capacity > this._bits.getSize()) this._bits.resizeKeepContent(capacity)
  }
}

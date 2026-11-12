// Ported from OpenUSD 26.11.1: pxr/exec/vdf/readWriteAccessor.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/readWriteAccessor.h.
//
// `VdfReadWriteAccessor<T>(context, name)` is
// `new VdfReadWriteAccessor<T>(type, context, name)`, the TfType standing in
// for the template argument. `operator[]` is Get(i) and Set(i, v).

import { TF_DEV_AXIOM, TF_VERIFY, type Type as TfType } from 'typescript-usd/tf'

import type { VdfContext } from './context.ts'
import { VdfIterator } from './iterator.ts'
import { VdfMask } from './mask.ts'
import { VdfVectorReadWriteAccessor } from './vector.ts'

/**
 * VdfReadWriteAccessor allows for random access to output data. The index
 * into the data is in iteration space, i.e. access to index N returns the
 * value of the N-th element as visited by the VdfReadWriteIterator
 * (readWriteAccessor.h:47).
 *
 * Accessing values through an iterator (e.g. VdfReadWriteIterator) is
 * preferred, if the data is accessed in a forward iterating pattern.
 */
export class VdfReadWriteAccessor<T> extends VdfIterator {
  // The accessor to the output data.
  private _accessor: VdfVectorReadWriteAccessor<T> = new VdfVectorReadWriteAccessor<T>()

  // The mask with accessible data elements. All elements are accessible if
  // this mask is empty.
  private _mask: VdfMask = new VdfMask()

  // The offset into the data.
  private _offset = 0

  // The size of the data.
  private _size = 0

  /**
   * Constructs a read/write accessor for the given input or output
   * (readWriteAccessor.h:115-166), or, with `name` omitted or empty, for the
   * only output on the current node (readWriteAccessor.h:61-64). Emits a
   * coding error if `name` does not name an input or an output.
   */
  constructor(type: TfType, context: VdfContext, name = '') {
    super()

    // Get the required output for writing. This will emit a coding error if
    // there is no valid output.
    const output = this._getRequiredOutputForWriting(context, name)
    if (!output) {
      return
    }

    // Retrieve the relevant masks at the output. This will return false if
    // the output is not scheduled, i.e. the accessor will remain empty.
    const [isScheduled, , affectsMask] = this._getOutputMasks(context, output)
    if (!isScheduled) {
      return
    }

    // Get the value to write to. It is an error for this value not to be
    // available. The executor engine is responsible for creating it.
    const v = this._getOutputValueForWriting(context, output)
    if (!TF_VERIFY(v, 'v', `Output '${output.getName()}' is missing buffer.`)) {
      return
    }

    // Get the accessor to the value.
    this._accessor = v!.getReadWriteAccessor<T>(type)

    // If there is an affects mask on this output, and that mask is not
    // all-ones, use the mask to redirect data access. If the mask is
    // contiguous, we can simply use the first index as an offset into the
    // data. The size is the number of bits set on the mask.
    if (affectsMask && !affectsMask.isAllOnes()) {
      if (affectsMask.isContiguous()) {
        this._offset = affectsMask.getFirstSet()
      } else {
        this._mask = affectsMask
      }
      this._size = affectsMask.getNumSet()
    }

    // If there is no affects mask, or if the affects mask is all ones we can
    // provide access without redirection. The size is the number of values on
    // the vector accessor.
    else {
      this._size = this._accessor.getNumValues()
    }
  }

  /**
   * Provides random access to the data stored at the output
   * (readWriteAccessor.h:70-81, 168-185). `index` must be within
   * [0, GetSize()).
   */
  Get(index: number): T {
    return this._accessor.Get(this._dataIndex(index))
  }

  /** Mutable random access through the reference operator[] returns. */
  Set(index: number, value: T): void {
    this._accessor.Set(this._dataIndex(index), value)
  }

  /** Returns true if there is no data stored at the output (readWriteAccessor.h:85-87). */
  IsEmpty(): boolean {
    return this.getSize() === 0
  }

  /** Returns the size of the data stored at the output (readWriteAccessor.h:91-93). */
  getSize(): number {
    return this._size
  }

  // readWriteAccessor.h:168-185: the data index for `index`.
  private _dataIndex(index: number): number {
    // Perform out of bounds check in debug builds.
    TF_DEV_AXIOM(index < this.getSize(), 'index < GetSize()')

    // The fast-path is for data that is contiguous in memory. The offset is
    // often 0, but the addition is fast enough to perform indiscriminately and
    // instead of a branch.
    if (this._mask.IsEmpty()) {
      return index + this._offset
    }

    // If a mask is used to redirect data access, we need to map the provided
    // index to the n-th set bit in the mask. This is the slow-path.
    return this._mask.getBits().findNthSet(index)
  }
}

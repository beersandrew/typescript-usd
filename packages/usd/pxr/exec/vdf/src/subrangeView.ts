// Ported from OpenUSD 26.11.1: pxr/exec/vdf/subrangeView.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/subrangeView.h.
//
// VdfSubrangeView enables iteration over subranges of input values, where
// each subrange contains values originating from one unique topological
// source: a unique output, or a unique range of a boxed value
// (subrangeView.h:30-182). Upstream specializes
// VdfSubrangeView<VdfReadIteratorRange<T>>, the only specialization; TS
// names it VdfSubrangeView<T> and takes T as the leading TfType
// (openexec-x1.md 4.1): `VdfSubrangeView<VdfReadIteratorRange<double>>
// s(ctx, name)` is `new VdfSubrangeView<number>(doubleType, ctx, name)`.
// The view is a JS iterable of VdfReadIteratorRange<T>; begin()/end() and the
// const_iterator API (Deref, Increment, Equals) are kept.

import type { Type as TfType } from 'typescript-usd/tf'
import type { VdfConnection } from './connection.ts'
import type { VdfContext } from './context.ts'
import { VdfIterator } from './iterator.ts'
import type { VdfMask } from './mask.ts'
import type { VdfNode } from './node.ts'
import { VdfReadIterator } from './readIterator.ts'
import { VdfReadIteratorRange } from './readIteratorRange.ts'
import type { VdfVector } from './vector.ts'
import type { Vdf_VectorSubrangeAccessor } from './vectorSubrangeAccessor.ts'

/** VdfSubrangeView<VdfReadIteratorRange<T>>::const_iterator (subrangeView.h:85-160). */
export class VdfSubrangeViewConstIterator<T> {
  // The view owning this iterator.
  readonly _view: VdfSubrangeView<T>
  // The current connection index.
  _connectionIndex: number
  // The current range index within the connection.
  _rangeIndex: number
  // The current iterator subrange.
  _subrange: VdfReadIteratorRange<T>

  /**
   * Construct an iterator owned by `view` at the given connection index; at
   * end if connectionIndex is less than 0 (subrangeView.h:186-200).
   */
  constructor(view: VdfSubrangeView<T>, connectionIndex: number) {
    this._view = view
    this._connectionIndex = connectionIndex
    this._rangeIndex = 0
    this._subrange = this._subrangeAtEnd()

    // If we have a valid connection index, advance to the first valid
    // subrange.
    if (connectionIndex >= 0) {
      this._advanceSubrange(0)
    }
  }

  /** operator== (subrangeView.h:103-110). */
  Equals(rhs: VdfSubrangeViewConstIterator<T>): boolean {
    return this._view._inputName === rhs._view._inputName &&
      this._connectionIndex === rhs._connectionIndex &&
      this._rangeIndex === rhs._rangeIndex
  }

  /** operator!= (subrangeView.h:112-116). */
  notEquals(rhs: VdfSubrangeViewConstIterator<T>): boolean {
    return !this.Equals(rhs)
  }

  /** Increment to the next subrange of input values (subrangeView.h:202-210). */
  increment(): this {
    this._advanceSubrange(this._rangeIndex + 1)
    return this
  }

  /** Returns the current subrange of input values (subrangeView.h:123-127). */
  deref(): VdfReadIteratorRange<T> {
    return this._subrange
  }

  // subrangeView.h:212-283
  _advanceSubrange(rangeIndex: number): void {
    const view = this._view
    const context = view._context
    const inputName = view._inputName
    const input = view._getNodeOf(context).getInput(inputName)

    // Set the next range index.
    this._rangeIndex = rangeIndex

    // If we have a valid input and connection index, set the current
    // subrange.
    if (input && this._connectionIndex >= 0) {
      // Keep moving on to the next connection until we have found the
      // current subrange, or have reached the last connection.
      const numConnections = input.getNumConnections()
      for (; this._connectionIndex < numConnections; ++this._connectionIndex) {
        // Get the connection and mask.
        const c = input.Get(this._connectionIndex)
        const mask = c.GetMask()

        // If the mask is all zeros or if the connected output is not
        // required, move on to the next connection.
        if (mask.isAllZeros() || !view._isRequiredInputOf(context, c)) {
          continue
        }

        // If the connected output does not provide a value, try to set an
        // empty subrange from the current connection.
        const v = view._getInputValueOf(context, c, mask)
        if (!v) {
          if (this._subrangeFromConnectionIndex(context, inputName)) {
            return
          }
        } else {
          const accessor = v.getSubrangeAccessor<T>(view._type)

          if (!accessor.isBoxed()) {
            // The connection does not provide a boxed value: try to set the
            // subrange from the current connection.
            if (this._subrangeFromConnectionIndex(context, inputName)) {
              return
            }
          } else if (this._subrangeFromRangeIndex(context, inputName, accessor)) {
            // The connection provides a boxed value: try to set the subrange
            // from the boxed container on the current connection.
            return
          }
        }

        // The subrange is not on the current connection. Reset the range
        // index and move on to the next connection.
        this._rangeIndex = 0
      }
    }

    // If we have not found a single valid connection, there are no more
    // subranges. We have reached the end.
    this._advanceToEnd()
  }

  // subrangeView.h:285-307
  _subrangeFromConnectionIndex(context: VdfContext, inputName: string): boolean {
    // Non-boxed values only provide a single range.
    if (this._rangeIndex > 0) {
      return false
    }

    // Build an iterator range beginning at the current connection, and
    // ending at the next connection.
    const type = this._view._type
    this._subrange = new VdfReadIteratorRange<T>(
      new VdfReadIterator<T>(type, context, inputName,
        { connectionIndex: this._connectionIndex, boxedIndex: 0 }),
      new VdfReadIterator<T>(type, context, inputName,
        { connectionIndex: this._connectionIndex + 1, boxedIndex: 0 }))
    return true
  }

  // subrangeView.h:309-342
  _subrangeFromRangeIndex(
    context: VdfContext,
    inputName: string,
    accessor: Vdf_VectorSubrangeAccessor<T>): boolean {
    // Get the boxed container provided by the current connection value.
    const boxedRanges = accessor.getBoxedRanges()

    // Boxed values can provide multiple ranges.
    if (this._rangeIndex >= boxedRanges.getNumRanges()) {
      return false
    }

    // Get the boxed container range that corresponds to the current range
    // index.
    const boxedRange = boxedRanges.getRange(this._rangeIndex)

    // Build an iterator range beginning at the current connection (offset by
    // the beginning of the boxed range), and ending at the current
    // connection (offset by the end of the boxed range.)
    const type = this._view._type
    this._subrange = new VdfReadIteratorRange<T>(
      new VdfReadIterator<T>(type, context, inputName,
        { connectionIndex: this._connectionIndex, boxedIndex: boxedRange.begin }),
      new VdfReadIterator<T>(type, context, inputName,
        { connectionIndex: this._connectionIndex, boxedIndex: boxedRange.end }))
    return true
  }

  // subrangeView.h:344-353
  _subrangeAtEnd(): VdfReadIteratorRange<T> {
    const view = this._view
    return new VdfReadIteratorRange<T>(
      new VdfReadIterator<T>(view._type, view._context, view._inputName,
        { connectionIndex: -1, boxedIndex: 0 }),
      new VdfReadIterator<T>(view._type, view._context, view._inputName,
        { connectionIndex: -1, boxedIndex: 0 }))
  }

  // subrangeView.h:355-362
  _advanceToEnd(): void {
    this._connectionIndex = -1
    this._rangeIndex = 0
    this._subrange = this._subrangeAtEnd()
  }
}

/** VdfSubrangeView<VdfReadIteratorRange<T>> (subrangeView.h:60-182). */
export class VdfSubrangeView<T> extends VdfIterator implements Iterable<VdfReadIteratorRange<T>> {
  readonly _type: TfType
  // A pointer to the context instance.
  readonly _context: VdfContext
  // The name token of the input to build subranges for.
  readonly _inputName: string

  /** Constructs a subrange view of the input values on `inputName` (subrangeView.h:69-75). */
  constructor(type: TfType, context: VdfContext, inputName: string) {
    super()
    this._type = type
    this._context = context
    this._inputName = inputName
  }

  /** A subrange iterator at the first range of input values (subrangeView.h:162-167). */
  begin(): VdfSubrangeViewConstIterator<T> {
    return new VdfSubrangeViewConstIterator<T>(this, 0)
  }

  /** A subrange iterator after the last range of input values (subrangeView.h:169-174). */
  end(): VdfSubrangeViewConstIterator<T> {
    return new VdfSubrangeViewConstIterator<T>(this, -1)
  }

  *[Symbol.iterator](): Iterator<VdfReadIteratorRange<T>> {
    const end = this.end()
    for (const it = this.begin(); it.notEquals(end); it.increment()) {
      yield it.deref()
    }
  }

  // The const_iterator reaches VdfIterator's protected helpers through its
  // view (C++ nested class access).
  _getNodeOf(context: VdfContext): VdfNode {
    return this._getNode(context)
  }

  _isRequiredInputOf(context: VdfContext, connection: VdfConnection): boolean {
    return this._isRequiredInput(context, connection)
  }

  _getInputValueOf(context: VdfContext, connection: VdfConnection, mask: VdfMask): VdfVector | null {
    return this._getInputValue(context, connection, mask)
  }
}

// Ported from OpenUSD 26.11.1: pxr/exec/vdf/readIterator.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/readIterator.h.
//
// `VdfReadIterator<T>(context, inputName)` is
// `new VdfReadIterator<T>(type, context, inputName)`: the TfType stands in
// for the template argument.

import { TF_DEV_AXIOM, type Type as TfType } from 'typescript-usd/tf'

import type { VdfContext } from './context.ts'
import type { VdfInput } from './input.ts'
import { VdfIterator, type Vdf_IndexedIterator } from './iterator.ts'
import { VdfMaskIterator } from './mask.ts'
import { Vdf_IsPoolOutput } from './poolChainIndex.ts'
import { VdfVectorReadAccessor } from './vector.ts'

/**
 * Copies a VdfMask::iterator (a C++ value copy). VdfMaskIterator has no
 * Clone(); this copies its wrapped TfCompressedBits view iterator, whose
 * fields are the bits pointer and plain indices.
 */
export function Vdf_CloneMaskIterator(it: VdfMaskIterator): VdfMaskIterator {
  const copy = new VdfMaskIterator()
  copy._it = Object.assign(
    Object.create(Object.getPrototypeOf(it._it) as object) as typeof it._it, it._it)
  return copy
}

/**
 * An iterator that provides read access to input values using a context
 * (readIterator.h:35).
 */
export class VdfReadIterator<T> extends VdfIterator implements Vdf_IndexedIterator<T> {
  // The value type (the template argument).
  private readonly _type: TfType

  // The context this iterator is bound to.
  private readonly _context: VdfContext

  // The input connector for this iterator. This is where all the connections
  // that we are iterating through are connected.
  private readonly _input: VdfInput | null

  // The index of the current connection.
  private _connectionIndex = -1

  // The index of the current boxed value.
  private _boxedIndex = 0

  // The iterator for the connection mask.
  private _iterator: VdfMaskIterator = new VdfMaskIterator()

  // The accessor into the current output value.
  private _accessor: VdfVectorReadAccessor<T> = new VdfVectorReadAccessor<T>()

  /** Constructs a read iterator (readIterator.h:177-195). */
  constructor(type: TfType, context: VdfContext, inputName: string)
  /**
   * Construct a read iterator beginning at the specified connection and boxed
   * index. Will seek to the next valid connection if the specified connection
   * does not provide data (readIterator.h:197-222). Upstream's constructor is
   * private, for VdfSubrangeView.
   * @internal
   */
  constructor(type: TfType, context: VdfContext, inputName: string,
    at: { connectionIndex: number, boxedIndex: number })
  /** @internal The copy constructor (see Clone). */
  constructor(type: TfType, context: VdfContext, inputName: string, at: VdfReadIterator<T>)
  constructor(
    type: TfType,
    context: VdfContext,
    inputName: string,
    at?: { connectionIndex: number, boxedIndex: number } | VdfReadIterator<T>,
  ) {
    super()
    this._type = type
    this._context = context

    // Copy construction.
    if (at instanceof VdfReadIterator) {
      this._input = at._input
      this._connectionIndex = at._connectionIndex
      this._boxedIndex = at._boxedIndex
      this._iterator = Vdf_CloneMaskIterator(at._iterator)
      this._accessor = at._accessor
      return
    }

    this._input = this._getNode(context).getInput(inputName)

    if (at === undefined) {
      // If the input is not valid, or there are no input connections, this
      // iterator remains empty.
      if (!this._input || this._input.getNumConnections() === 0) {
        return
      }

      // Advance connections starting at the current connection index -1, to
      // find the first valid connection with data.
      if (!this._advanceConnection(-1)) {
        this.advanceToEnd()
      }
      return
    }

    // If the input is not valid, or the specified connection index is beyond
    // the number of available connections, this iterator is at-end.
    const { connectionIndex, boxedIndex } = at
    if (!this._input ||
      connectionIndex < 0 ||
      connectionIndex >= this._input.getNumConnections()) {
      return
    }

    // Advance to the next valid connection starting at the previous
    // connection index. If the previous connection index is -1, find the first
    // valid connection.
    if (!this._advanceConnection(connectionIndex - 1) ||
      !this._setCurrentBoxedIndex(boxedIndex)) {
      this.advanceToEnd()
    }
  }

  /** Copy constructor. */
  Clone(): VdfReadIterator<T> {
    return new VdfReadIterator<T>(this._type, this._context, '', this)
  }

  /** Returns true if this iterator and `rhs` compare equal (readIterator.h:224-233). */
  Equals(rhs: VdfReadIterator<T>): boolean {
    return this._input === rhs._input &&
      this._connectionIndex === rhs._connectionIndex &&
      this._boxedIndex === rhs._boxedIndex &&
      this._iterator.Equals(rhs._iterator)
  }

  /** readIterator.h:73-75 */
  notEquals(rhs: VdfReadIterator<T>): boolean {
    return !this.Equals(rhs)
  }

  /**
   * Increment operator to point to the next element (readIterator.h:235-251).
   */
  increment(): this {
    // Are we already at end()?
    if (this.isAtEnd()) {
      return this
    }

    // If not, advance to the next input.
    if (!this._advance()) {
      this.advanceToEnd()
    }

    return this
  }

  /**
   * Returns the current element (readIterator.h:85-87 operator*, 253-261
   * operator->). Calling this on an iterator that IsAtEnd() is invalid.
   */
  deref(): T {
    TF_DEV_AXIOM(!this.isAtEnd(), '!IsAtEnd()')
    const idx = this._iterator.deref() + this._boxedIndex
    TF_DEV_AXIOM(idx < this._accessor.getNumValues(), 'idx < _accessor.GetNumValues()')
    return this._accessor.Get(idx)
  }

  /** Returns true if the iterator is done iterating (readIterator.h:97-99). */
  isAtEnd(): boolean {
    return this._connectionIndex === -1
  }

  /**
   * Returns the total number of data elements that will be iterated over
   * (readIterator.h:263-310).
   */
  computeSize(): number {
    // Bail out immediately if there is no data to iterate over.
    if (!this._input || this._input.getNumConnections() === 0) {
      return 0
    }

    // Fast path for single connection, boxed values.
    if (this._input.getNumConnections() === 1 && this._accessor.isBoxed()) {
      return this._accessor.getNumValues()
    }

    // Iterate over all the connections on the input connector.
    let size = 0
    for (const connection of this._input.getConnections()) {
      // For connections with 1x1 masks, we could be dealing with boxed values,
      // so we need to look at the stored value to figure out the actual
      // number of data values provided.
      const mask = connection.GetMask()
      if (mask.getSize() === 1 && mask.isAllOnes()) {
        // If this is a scheduled input value, account for the total number of
        // data values provided by the boxed container.
        if (this._isRequiredInput(this._context, connection)) {
          const v = this._getInputValue(this._context, connection, mask)
          if (v) {
            const accessor = v.getReadAccessor<T>(this._type)
            size += accessor.getNumValues()
          }
        }
      }

      // For all other masks, the number of entries set in the mask is the
      // number of input values provided.
      else {
        size += mask.getNumSet()
      }
    }

    // Return the number of input values provided.
    return size
  }

  /** Advance the iterator to the end (readIterator.h:312-319). */
  advanceToEnd(): void {
    this._connectionIndex = -1
    this._boxedIndex = 0
    this._iterator = new VdfMaskIterator()
  }

  /** Vdf_GetIteratorIndex (readIterator.h:124-126). @internal */
  _getIteratorIndex(): number {
    return this._iterator.deref() + this._boxedIndex
  }

  /** Vdf_IsIteratorSourcePool (readIterator.h:129-132). @internal */
  _isIteratorSourcePool(): boolean {
    return Vdf_IsPoolOutput(this._input!.getConnections()[this._connectionIndex]!.getSourceOutput())
  }

  // Sets the current connection from our input connector and returns true if
  // the connection is a valid data source (readIterator.h:321-357).
  private _setCurrentConnection(connectionIndex: number): boolean {
    const connection = this._input!.getConnections()[connectionIndex]!
    const mask = connection.GetMask()

    // Reset all indices.
    this._connectionIndex = connectionIndex
    this._boxedIndex = 0
    this._iterator = mask.begin()

    // Reset the accessor.
    this._accessor = new VdfVectorReadAccessor<T>()

    // See if the connection's source output is scheduled. This is not a valid
    // connection, if the source output is not scheduled.
    if (!this._isRequiredInput(this._context, connection)) {
      return false
    }

    // Get the accessor to the data.
    const data = this._getInputValue(this._context, connection, mask)
    if (!data) {
      return false
    }

    this._accessor = data.getReadAccessor<T>(this._type)

    // Return false if the connection does not provide any values.
    if (!this._accessor.getNumValues()) {
      return false
    }

    // This is a valid connection if the iterator is valid.
    return !this._iterator.isAtEnd()
  }

  // Sets the current boxed index to the specified index, or advances to the
  // next valid connection if the index exceeds the number of input values
  // available on this connection (readIterator.h:359-373).
  private _setCurrentBoxedIndex(boxedIndex: number): boolean {
    // If the boxed index exceeds the number of available input values, move on
    // to the next valid connection, if any.
    if (boxedIndex >= this._accessor.getNumValues()) {
      return this._advanceConnection(this._connectionIndex)
    }

    // Apply the boxed index.
    this._boxedIndex = boxedIndex

    // Success!
    return true
  }

  // Advances to the next input and returns true if one exists, otherwise
  // returns false to indicate at end (readIterator.h:375-405).
  private _advance(): boolean {
    // When iterating over boxed values, increment the index into the boxed
    // container.
    if (this._accessor.isBoxed()) {
      ++this._boxedIndex

      // After the last element in the boxed container, move on to the next
      // connection.
      if (this._boxedIndex >= this._accessor.getNumValues()) {
        return this._advanceConnection(this._connectionIndex)
      }
    }

    // When iterating over values that are not boxed, increment the mask
    // iterator.
    else {
      this._iterator.increment()

      // After the last entry in the mask, move on to the next connection.
      if (this._iterator.isAtEnd()) {
        return this._advanceConnection(this._connectionIndex)
      }
    }

    // Successfully reached the next input value.
    return true
  }

  // Advances to the next input connection with scheduled output data to
  // source from (readIterator.h:407-424).
  private _advanceConnection(connectionIndex: number): boolean {
    // Note that we start at '_connectionIndex + 1' because we have already
    // iterated through the mask of the current connection.
    const numConnections = this._input!.getNumConnections()
    for (let i = connectionIndex + 1; i < numConnections; ++i) {
      // If the next connection has a scheduled data source, we are done. Skip
      // any data sources that provide no values.
      if (this._setCurrentConnection(i)) {
        return true
      }
    }
    return false
  }
}

/**
 * Vdf_IsIteratorSourcePool (readIterator.h:129-132): whether the current
 * data source is a pool output.
 */
export function Vdf_IsIteratorSourcePool<T>(it: VdfReadIterator<T>): boolean {
  return it._isIteratorSourcePool()
}

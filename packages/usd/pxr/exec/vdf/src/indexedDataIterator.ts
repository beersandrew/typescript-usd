// Ported from OpenUSD 26.11.1: pxr/exec/vdf/indexedDataIterator.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/indexedDataIterator.h.
//
// A const forward iterator over the index or data container of a
// VdfIndexedData (indexedDataIterator.h:16-71). Iterator API per
// openexec-x1.md 4.1: Deref() (operator*), Increment() (operator++),
// Equals/NotEquals. The base iterator is an (array, index) pair.

/** VdfIndexedDataIterator (indexedDataIterator.h:16-71). */
export class VdfIndexedDataIterator<IteratedType> {
  readonly _container: readonly IteratedType[]
  _index: number

  /**
   * Only default construction is publicly allowed, and the resulting object
   * is invalid (indexedDataIterator.h:29-31). VdfIndexedData passes the
   * container and position (indexedDataIterator.h:62-63).
   */
  constructor(container: readonly IteratedType[] = [], index = 0) {
    this._container = container
    this._index = index
  }

  /** operator* (indexedDataIterator.h:33). */
  deref(): IteratedType {
    return this._container[this._index]!
  }

  /** operator++ (indexedDataIterator.h:36-39). */
  increment(): this {
    ++this._index
    return this
  }

  /** operator++(int) (indexedDataIterator.h:41-45). */
  postIncrement(): VdfIndexedDataIterator<IteratedType> {
    const r = new VdfIndexedDataIterator<IteratedType>(this._container, this._index)
    ++this._index
    return r
  }

  /** operator== (indexedDataIterator.h:47-49). */
  Equals(rhs: VdfIndexedDataIterator<IteratedType>): boolean {
    return this._container === rhs._container && this._index === rhs._index
  }

  /** operator!= (indexedDataIterator.h:51-53). */
  notEquals(rhs: VdfIndexedDataIterator<IteratedType>): boolean {
    return !this.Equals(rhs)
  }
}

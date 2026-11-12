// Ported from OpenUSD 26.11.1: pxr/base/tf/iterator.cpp,
//  pxr/base/tf/iterator.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// TfIterator observable cursor surface from OpenUSD v26.08
// pxr/base/tf/iterator.h:85-402.
export class TfIterator<T> implements IterableIterator<T> {
  readonly #values: readonly T[]
  #index: number
  constructor(values: Iterable<T>, index = 0) { this.#values = [...values]; this.#index = index }
  Begin(): TfIterator<T> { return new TfIterator(this.#values) }
  End(): TfIterator<T> { return new TfIterator(this.#values, this.#values.length) }
  getNext(): TfIterator<T> { return new TfIterator(this.#values, this.#index + 1) }
  GetValue(): T | undefined { return this.#values[this.#index] }
  isValid(): boolean { return this.#index < this.#values.length }
  next(): IteratorResult<T> {
    if (!this.isValid()) return { done: true, value: undefined }
    return { done: false, value: this.#values[this.#index++]! }
  }
  [Symbol.iterator](): IterableIterator<T> { return this }
}
export const TfMakeIterator = <T>(values: Iterable<T>): TfIterator<T> => new TfIterator(values)
export const TfMakeReverseIterator = <T>(values: Iterable<T>): TfIterator<T> => new TfIterator([...values].reverse())
export const TfArraySize = <T>(values: ArrayLike<T>): number => values.length

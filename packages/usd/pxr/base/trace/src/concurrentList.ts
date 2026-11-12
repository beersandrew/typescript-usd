// Ported from OpenUSD 26.11.1: pxr/base/trace/concurrentList.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.08 pxr/base/trace/concurrentList.h:28-122.
// A JavaScript realm executes mutations serially, so the observable list
// contract needs no lock-bearing storage.
export class TraceConcurrentList<T> implements Iterable<T> {
  readonly #values: T[] = []
  pushBack(value: T): void { this.#values.push(value) }
  clear(): void { this.#values.length = 0 }
  get size(): number { return this.#values.length }
  [Symbol.iterator](): Iterator<T> { return this.#values[Symbol.iterator]() }
}

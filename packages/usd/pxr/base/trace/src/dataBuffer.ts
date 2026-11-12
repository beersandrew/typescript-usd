// Ported from OpenUSD 26.11.1: pxr/base/trace/dataBuffer.cpp,
//  pxr/base/trace/dataBuffer.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.08 pxr/base/trace/dataBuffer.h:34-125.
export class TraceDataBuffer<T> {
  readonly #values: T[] = []
  append(value: T): T { this.#values.push(value); return value }
  clear(): void { this.#values.length = 0 }
  get size(): number { return this.#values.length }
  values(): readonly T[] { return this.#values }
}

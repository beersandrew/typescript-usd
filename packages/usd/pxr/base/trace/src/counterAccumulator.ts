// Ported from OpenUSD 26.11.1: pxr/base/trace/counterAccumulator.cpp,
//  pxr/base/trace/counterAccumulator.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.08 pxr/base/trace/counterAccumulator.h:33.
export class TraceCounterAccumulator {
  readonly #values = new Map<string, number>()
  process(key: string, value: number, isDelta: boolean): number {
    const result = isDelta ? (this.#values.get(key) ?? 0) + value : value
    this.#values.set(key, result)
    return result
  }
  getValues(): ReadonlyMap<string, number> { return this.#values }
  clear(): void { this.#values.clear() }
}

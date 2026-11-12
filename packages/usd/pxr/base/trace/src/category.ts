// Ported from OpenUSD 26.11.1: pxr/base/trace/category.cpp,
//  pxr/base/trace/category.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.08 pxr/base/trace/category.h:37.
import { TraceStringHash } from './stringHash.ts'

export type TraceCategoryId = number

export class TraceCategory {
  static readonly Default: TraceCategoryId = 0
  static #instance: TraceCategory | undefined
  readonly #names = new Map<TraceCategoryId, string[]>()

  private constructor() {
    // Ported from OpenUSD v26.08 pxr/base/trace/category.cpp:18-20.
    this.registerCategory(TraceCategory.Default, 'Default')
  }

  static GetInstance(): TraceCategory {
    return (TraceCategory.#instance ??= new TraceCategory())
  }

  static createTraceCategoryId(name: string): TraceCategoryId {
    return TraceStringHash.Hash(name)
  }

  registerCategory(id: TraceCategoryId, name: string): void {
    const names = this.#names.get(id)
    if (names) names.push(name)
    else this.#names.set(id, [name])
  }

  getCategories(id: TraceCategoryId): string[] {
    return [...(this.#names.get(id) ?? [])]
  }
}

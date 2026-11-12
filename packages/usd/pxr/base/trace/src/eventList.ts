// Ported from OpenUSD 26.11.1: pxr/base/trace/eventList.cpp,
//  pxr/base/trace/eventList.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.08 pxr/base/trace/eventList.h:24-85.
import { TraceEventContainer } from './eventContainer.ts'

export class TraceEventList extends TraceEventContainer {
  readonly #keys = new Map<string, string>()
  cacheKey(key: string): string {
    const cached = this.#keys.get(key)
    if (cached !== undefined) return cached
    this.#keys.set(key, key)
    return key
  }
}

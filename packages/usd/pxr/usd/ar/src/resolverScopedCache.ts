// Ported from OpenUSD 26.11.1: pxr/usd/ar/resolverScopedCache.cpp,
//  pxr/usd/ar/resolverScopedCache.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { ArGetResolver, type ArResolver } from './resolver.ts'
import { _withResolverCache } from './asyncState.ts'

export class ArResolverScopedCache {
  private readonly data: unknown
  private ended = false

  constructor(
    parent?: ArResolverScopedCache,
    readonly resolver: ArResolver = ArGetResolver(),
  ) {
    this.data = resolver.beginCacheScope(parent?.data)
  }

  run<T>(fn: () => T): T {
    return _withResolverCache(this.resolver, this.data, () => {
      try {
        const result = fn()
        if (result && typeof (result as unknown as PromiseLike<unknown>).then === 'function') {
          return Promise.resolve(result).finally(() => this.end()) as T
        }
        this.end()
        return result
      } catch (error) {
        this.end()
        throw error
      }
    })
  }

  end(): void {
    if (this.ended) return
    this.ended = true
    this.resolver.endCacheScope(this.data)
  }
}

// Ported from OpenUSD 26.11.1: pxr/exec/ef/pageCache.cpp,
//  pxr/exec/ef/pageCache.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/ef/pageCache.h and
// pxr/exec/ef/pageCache.cpp.

import type { Type as TfType } from 'typescript-usd/tf'
import { WorkParallelForEach } from 'typescript-usd/work'

import type { VdfVector } from 'typescript-usd/vdf'
import {
  Ef_OutputValueCache,
  Ef_OutputValueCache_ExclusiveAccess,
} from './outputValueCache.ts'
import {
  Ef_TypedVectorKey,
  type Ef_VectorKey,
  type Ef_VectorKeyMap,
} from './vectorKey.ts'

// The type of the factory function, which creates an Ef_VectorKey from a
// VdfVector (pageCache.h:90-93).
type _KeyFactoryFunction = (value: VdfVector) => Ef_VectorKey.StoredType

/**
 * Ef_PageCache (pageCache.h:28-113): organizes output-to-value caches into
 * logical groups, called pages. Pages are keyed off of VdfVector values, such
 * as time values.
 */
export class Ef_PageCache implements Iterable<[Ef_VectorKey.StoredType, Ef_OutputValueCache]> {
  // The map of pages to output-to-value caches (pageCache.h:107-108), keyed
  // by Ef_VectorKey.GetKey().
  private readonly _cache: Ef_PageCache.CacheMap = new Map()

  // The key factory function for building new Ef_VectorKeys (pageCache.h:111).
  private readonly _keyFactory: _KeyFactoryFunction

  /** Constructor (pageCache.cpp:17-20). */
  private constructor(keyFactory: _KeyFactoryFunction) {
    this._keyFactory = keyFactory
  }

  /**
   * Constructs a new Ef_PageCache, which uses VdfVectors holding values of
   * `type` as keys (pageCache.h:42-45).
   */
  static new<T>(type: TfType): Ef_PageCache {
    // _KeyFactory<T> (pageCache.h:101-104).
    return new Ef_PageCache(
      (value: VdfVector) => new Ef_TypedVectorKey<T>(type, value))
  }

  /**
   * Gets the output-to-value cache associated with `key`, if one exists
   * (pageCache.cpp:30-42).
   */
  Get(key: VdfVector): Ef_OutputValueCache | null {
    // Convert the given key into an Ef_VectorKey and look up the
    // corresponding page in the cache map.
    const it = this._cache.get(this._keyFactory(key).getKey())
    if (it !== undefined) {
      return it.value
    }

    // There is no page for the given key.
    return null
  }

  /**
   * Gets the output-to-value cache associated with `key`, or creates a new,
   * empty one (pageCache.cpp:44-61).
   */
  getOrCreate(key: VdfVector): Ef_OutputValueCache {
    const vectorKey = this._keyFactory(key)
    const canonicalKey = vectorKey.getKey()
    let it = this._cache.get(canonicalKey)

    // If an entry does not exist for this key, instantiate a new cache.
    if (it === undefined) {
      it = { key: vectorKey, value: new Ef_OutputValueCache() }
      this._cache.set(canonicalKey, it)
    }

    // Return the cache.
    return it.value
  }

  /**
   * Clears the entire page cache, returning the number of bytes cleared
   * (pageCache.cpp:63-90).
   */
  clear(): number {
    if (this._cache.size === 0) {
      return 0
    }

    // Keep track of the number of cleared bytes.
    let numBytesCleared = 0

    // Clear all the output-to-value caches.
    WorkParallelForEach(this._cache.values(), (value) => {
      const cacheAccess = new Ef_OutputValueCache_ExclusiveAccess(value.value)
      numBytesCleared += cacheAccess.clear()
    })

    return numBytesCleared
  }

  /**
   * begin()/end() (pageCache.h:77-87): iterates (key, output-to-value cache)
   * pairs.
   */
  *[Symbol.iterator](): Iterator<[Ef_VectorKey.StoredType, Ef_OutputValueCache]> {
    for (const { key, value } of this._cache.values()) {
      yield [key, value]
    }
  }
}

export declare namespace Ef_PageCache {
  /** Type of the cache map (pageCache.h:67-69). */
  type CacheMap = Ef_VectorKeyMap<Ef_OutputValueCache>
}

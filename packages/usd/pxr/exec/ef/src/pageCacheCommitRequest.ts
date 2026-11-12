// Ported from OpenUSD 26.11.1: pxr/exec/ef/pageCacheCommitRequest.cpp,
//  pxr/exec/ef/pageCacheCommitRequest.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/ef/pageCacheCommitRequest.h and
// pxr/exec/ef/pageCacheCommitRequest.cpp.

import { TF_VERIFY } from 'typescript-usd/tf'

import type { VdfExecutorInterface } from 'typescript-usd/vdf'
import type { VdfRequest } from 'typescript-usd/vdf'
import { EfInputValueBlock } from './inputValueBlock.ts'
import {
  type Ef_OutputValueCache,
  Ef_OutputValueCache_ExclusiveAccess,
} from './outputValueCache.ts'
import { EfPageCacheStorage } from './pageCacheStorage.ts'

/**
 * EfPageCacheCommitRequest (pageCacheCommitRequest.h:35-101): an intent to
 * commit data to a page cache. It ensures that the page exists and is ready
 * to accept the data, and stores the input value block denoting the page.
 */
export class EfPageCacheCommitRequest {
  // The input value block containing the key output value.
  private readonly _inputs: EfInputValueBlock

  // The output-to-value cache on the page indexed by the key value.
  private _cache: Ef_OutputValueCache | null = null

  // The page cache storage.
  private readonly _storage: EfPageCacheStorage | null

  /**
   * Creates a commit request with the input values denoting the cache page
   * (key), and the page cache storage to commit to
   * (pageCacheCommitRequest.cpp:17-45).
   */
  constructor(inputs: EfInputValueBlock, storage: EfPageCacheStorage | null) {
    this._inputs = new EfInputValueBlock(inputs)
    this._storage = storage

    if (TF_VERIFY(this._storage, '_storage')) {
      // We only support input value blocks with one entry.
      TF_VERIFY(inputs.getSize() === 1, 'inputs.GetSize() == 1')

      // Make sure that this one entry is the key output.
      const firstInput = inputs[Symbol.iterator]().next().value!
      TF_VERIFY(
        this._storage!._isKeyOutput(
          firstInput[0].GetOutput()!,
          firstInput[0].GetMask()),
        '_storage->_IsKeyOutput(*firstInput->first.GetOutput(), ' +
        'firstInput->first.GetMask())')

      // Get the key value.
      const keyValue = firstInput[1]
      TF_VERIFY(keyValue, 'keyValue')

      // Make sure a cache page exists for the given key and retain the
      // output-to-value cache to later commit data to.
      this._cache = this._storage!._getOrCreateCache(keyValue)
      TF_VERIFY(this._cache, '_cache')
    }
  }

  /** Returns the input value block containing the key output value (pageCacheCommitRequest.h:56-58). */
  getInputs(): EfInputValueBlock {
    return this._inputs
  }

  /** Returns the output value cache values are committed to (pageCacheCommitRequest.h:62-64). */
  getCache(): Ef_OutputValueCache | null {
    return this._cache
  }

  /**
   * Returns true if any output in `request` is still not cached
   * (pageCacheCommitRequest.cpp:52-66).
   */
  isUncached(request: VdfRequest): boolean {
    // Requires a valid output-to-value cache.
    if (!TF_VERIFY(this._cache, '_cache')) {
      return true
    }

    // Gain protected access to the output-to-value cache.
    const cacheAccess = new Ef_OutputValueCache_ExclusiveAccess(this._cache!)

    // Check if any output is still not cached.
    return cacheAccess.isUncached(request)
  }

  /** Returns the subset of `request` still not cached (pageCacheCommitRequest.cpp:68-82). */
  getUncached(request: VdfRequest): VdfRequest {
    // Requires a valid output-to-value cache.
    if (!TF_VERIFY(this._cache, '_cache')) {
      return request
    }

    // Gain protected access to the output-to-value cache.
    const cacheAccess = new Ef_OutputValueCache_ExclusiveAccess(this._cache!)

    // Get the subset of the request that is still not cached.
    return cacheAccess.getUncached(request)
  }

  /**
   * Commits data for the outputs in `request` to the cache, reading their
   * values from `executor` (pageCacheCommitRequest.cpp:84-119).
   *
   * Returns [allCommitted, bytesCommitted]: whether all the data has been
   * cached, and the size of the stored data in bytes (the C++
   * `size_t *bytesCommitted` out-parameter).
   */
  commit(executor: VdfExecutorInterface, request: VdfRequest): [boolean, number] {
    // Requires a valid output-to-value cache and page cache storage.
    if (!TF_VERIFY(this._cache && this._storage, '_cache && _storage')) {
      return [false, 0]
    }

    // If there is nothing to cache, bail out right away.
    if (request.IsEmpty()) {
      return [true, 0]
    }

    // If caching is disabled, or the memory limit has been reached, or no
    // data is available on the executor, bail out.
    if (!this._storage!.isEnabled() ||
        EfPageCacheStorage.hasReachedMemoryLimit() ||
        executor.IsEmpty()) {
      return [false, 0]
    }

    // Gain protected access to the output-to-value cache.
    const cacheAccess = new Ef_OutputValueCache_ExclusiveAccess(this._cache!)

    // Commit data to the output-to-value cache.
    const bytesCommitted = this._storage!._commit(executor, request, cacheAccess)

    // All the data has been successfully committed.
    return [true, bytesCommitted]
  }
}

/** A vector of page cache commit requests (pageCacheCommitRequest.h:105). */
export type EfPageCacheCommitRequestVector = EfPageCacheCommitRequest[]

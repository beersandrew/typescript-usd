// Ported from OpenUSD 26.11.1: pxr/exec/exec/compiledLeafNodeCache.cpp,
//  pxr/exec/exec/compiledLeafNodeCache.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/compiledLeafNodeCache.h and
// compiledLeafNodeCache.cpp.
//
// The tbb::concurrent_unordered_map<_CacheKey, const EfLeafNode *, TfHash> is
// a JS Map keyed by the canonical string of a _CacheKey (_CacheKeyString
// below); the reverse table is a Map keyed by leaf node identity.

import { TF_VERIFY } from 'typescript-usd/tf'
import type { SdfPath } from 'typescript-usd/sdf/path'

import type { EfLeafNode } from 'typescript-usd/ef'

import type { ExecValueKey } from './valueKey.ts'

// ExecValueKey cannot be used as a map key, because it is not equality
// comparable and contains an EsfObject. Instead, this cache uses a key that
// is similar to ExecValueKey, except the provider object is stored as an
// SdfPath (compiledLeafNodeCache.h:61-89).
class _CacheKey {
  readonly providerPath: SdfPath
  readonly computationName: string

  constructor(valueKey: ExecValueKey) {
    this.providerPath = valueKey.getProvider().Get().getPath(null)
    this.computationName = valueKey.getComputationName()
  }
}

// Canonical map key of a _CacheKey: equal strings iff operator== holds
// (compiledLeafNodeCache.h:72-75). A NUL separates the path from the token.
function _CacheKeyString(key: _CacheKey): string {
  return `${key.providerPath.pathString}\u0000${key.computationName}`
}

/** Maps a compiled leaf node for each ExecValueKey (compiledLeafNodeCache.h:24-105). */
export class Exec_CompiledLeafNodeCache {
  // Stores leaf nodes for each ExecValueKey (represented by _CacheKey).
  private readonly _cache = new Map<string, EfLeafNode>()

  // Maps leaf nodes back to their _CacheKeys. This is needed to clean up
  // entries when leaf nodes are deleted.
  private readonly _reverseTable = new Map<EfLeafNode, _CacheKey>()

  /**
   * Returns the leaf node compiled for `valueKey`, or null
   * (compiledLeafNodeCache.cpp:15-21).
   */
  find(valueKey: ExecValueKey): EfLeafNode | null {
    const cacheKey = new _CacheKey(valueKey)
    return this._cache.get(_CacheKeyString(cacheKey)) ?? null
  }

  /**
   * Inserts a mapping from `valueKey` to a compiled `leafNode`. If a leaf node
   * for `valueKey` already exists in the cache, the insertion is ignored
   * (compiledLeafNodeCache.cpp:23-47).
   */
  insert(valueKey: ExecValueKey, leafNode: EfLeafNode): void {
    const cacheKey = new _CacheKey(valueKey)
    const keyString = _CacheKeyString(cacheKey)

    // The cache only tracks the first leaf node created for a value key. If
    // other leaf nodes are created for the same value key, they do not replace
    // the existing leaf node in the cache or in the reverse table. All of
    // these leaf nodes connect to the same masked output, and the only way to
    // create duplicates is for a request to contain duplicate value keys.
    if (this._cache.has(keyString)) {
      return
    }
    this._cache.set(keyString, leafNode)

    const emplacedReverseTable = !this._reverseTable.has(leafNode)
    if (emplacedReverseTable) {
      this._reverseTable.set(leafNode, cacheKey)
    }
    TF_VERIFY(emplacedReverseTable, 'emplacedReverseTable')
  }

  /**
   * Notifies the cache that `leafNode` is being deleted; entries mapping to
   * it are removed (compiledLeafNodeCache.cpp:49-59).
   */
  willDeleteNode(leafNode: EfLeafNode): void {
    const cacheKey = this._reverseTable.get(leafNode)
    if (cacheKey === undefined) {
      return
    }

    this._cache.delete(_CacheKeyString(cacheKey))
    this._reverseTable.delete(leafNode)
  }
}

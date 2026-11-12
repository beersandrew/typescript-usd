// Ported from OpenUSD 26.11.1: pxr/exec/ef/pageCacheStorage.cpp,
//  pxr/exec/ef/pageCacheStorage.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/ef/pageCacheStorage.h and
// pxr/exec/ef/pageCacheStorage.cpp.
//
// Single-threaded (openexec-x1.md section 5): the atomics are plain fields
// and the workers run serially through WorkParallelForN/ForEach.
//
// Upstream befriends EfPageCacheBasedExecutor and EfPageCacheCommitRequest
// (pageCacheStorage.h:45-50). The members they use are public here, named
// with upstream's leading underscore and marked @internal.

import { TF_VERIFY, type Type as TfType } from 'typescript-usd/tf'
import { WorkParallelForEach, WorkParallelForN } from 'typescript-usd/work'

import type { VdfExecutorInterface } from 'typescript-usd/vdf'
import { VdfLRUCache } from 'typescript-usd/vdf'
import type { VdfMask } from 'typescript-usd/vdf'
import { VdfMaskedOutput } from 'typescript-usd/vdf'
import type { VdfMaskedOutputVector } from 'typescript-usd/vdf'
import type { VdfNetwork } from 'typescript-usd/vdf'
import { VdfNode } from 'typescript-usd/vdf'
import type { VdfOutput } from 'typescript-usd/vdf'
import { VdfRequest } from 'typescript-usd/vdf'
import type { VdfIndex, VdfOutputToMaskMap } from 'typescript-usd/vdf'
import type { VdfVector } from 'typescript-usd/vdf'
import type { EfLeafNodeCache } from './leafNodeCache.ts'
import { Ef_PageCache } from './pageCache.ts'
import {
  type Ef_OutputValueCache,
  Ef_OutputValueCache_ExclusiveAccess,
} from './outputValueCache.ts'

/**
 * Predicate type used for invalidation (pageCacheStorage.h:52-56): returns
 * true if the page indexed by the key value shall receive invalidation.
 */
export type EfPageCacheStorage_CacheIteratorPredicateFunction = (key: VdfVector) => boolean

// An entry in the cacheable requests cache (pageCacheStorage.h:222-229). It
// becomes invalid on changes to the leaf node cache, so the leaf node cache
// version is stored along with the cached request.
interface _CacheableRequestEntry {
  version: number
  request: VdfRequest
}

/**
 * EfPageCacheStorage (pageCacheStorage.h:43-253): manages a page cache and
 * provides methods for invalidation of cached values.
 */
export class EfPageCacheStorage {
  // The number of bytes used by page cache storage (pageCacheStorage.cpp:26-27).
  private static _numBytesUsed = 0

  // The upper memory limit for page cache storage. 0 denotes no limit
  // (pageCacheStorage.cpp:29-30).
  private static _numBytesLimit = 0

  // The key masked output.
  private readonly _keyMaskedOutput: VdfMaskedOutput

  // The leaf node cache.
  private readonly _leafNodeCache: EfLeafNodeCache

  /** @internal The page cache managed by this class (pageCacheStorage.h:219-220). */
  readonly _pageCache: Ef_PageCache

  // An LRU cache with cacheable requests (pageCacheStorage.h:231-234).
  private readonly _cacheableRequests: VdfLRUCache<VdfRequest, _CacheableRequestEntry>

  // Flags nodes that have had at least one output value stored in at least
  // one page. Once added, node references are not removed until the node is
  // deleted from the network. An acceleration structure limiting the set of
  // nodes that could have output values in the page cache
  // (pageCacheStorage.h:236-242).
  private _nodeRefs: Uint8Array = new Uint8Array(0)
  private _numNodeRefs = 0

  // Is this storage enabled?
  private _enabled = true

  /** Constructor (pageCacheStorage.cpp:32-48). */
  private constructor(
    keyMaskedOutput: VdfMaskedOutput,
    leafNodeCache: EfLeafNodeCache,
    newPageCache: Ef_PageCache,
  ) {
    this._keyMaskedOutput = keyMaskedOutput
    this._leafNodeCache = leafNodeCache
    this._pageCache = newPageCache
    this._cacheableRequests = new VdfLRUCache<VdfRequest, _CacheableRequestEntry>(
      16,
      VdfRequest.Hash,
      () => ({ version: 0, request: new VdfRequest() }),
      (lhs, rhs) => lhs.Equals(rhs))

    // A page cache must be available.
    TF_VERIFY(this._pageCache, '_pageCache')

    // We only support 1x1 masks for the key output.
    TF_VERIFY(this._keyMaskedOutput.asBool() &&
      this._keyMaskedOutput.GetMask().getSize() === 1,
    '_keyMaskedOutput && _keyMaskedOutput.GetMask().GetSize() == 1')
  }

  /**
   * Constructs an instance with the given leaf node cache, keyed by values
   * of `type` at `keyMaskedOutput` (pageCacheStorage.h:69-72, 255-263).
   */
  static new<T>(
    type: TfType,
    keyMaskedOutput: VdfMaskedOutput,
    leafNodeCache: EfLeafNodeCache,
  ): EfPageCacheStorage {
    return new EfPageCacheStorage(
      keyMaskedOutput, leafNodeCache, Ef_PageCache.new<T>(type))
  }

  /** Returns the memory used for cache storage, in bytes (pageCacheStorage.cpp:52-56). */
  static getNumBytesUsed(): number {
    return EfPageCacheStorage._numBytesUsed
  }

  /** Returns the upper memory limit, in bytes (pageCacheStorage.cpp:58-62). */
  static getNumBytesLimit(): number {
    return EfPageCacheStorage._numBytesLimit
  }

  /**
   * Returns true if the upper memory limit has been reached
   * (pageCacheStorage.cpp:64-77).
   */
  static hasReachedMemoryLimit(): boolean {
    const numBytesLimit = EfPageCacheStorage._numBytesLimit
    const numBytesUsed = EfPageCacheStorage._numBytesUsed
    return numBytesLimit > 0 && numBytesUsed >= numBytesLimit
  }

  /** Sets the upper memory limit (pageCacheStorage.cpp:79-83). */
  static setMemoryUsageLimit(bytes: number): void {
    EfPageCacheStorage._numBytesLimit = bytes
  }

  /** Returns true if the storage is enabled (pageCacheStorage.cpp:85-89). */
  isEnabled(): boolean {
    return this._enabled
  }

  /** Enables / disables the storage (pageCacheStorage.cpp:91-104). */
  setEnabled(enable: boolean): void {
    // Is this a state change?
    if (this._enabled !== enable) {
      // Always clear the cache after toggling the enabled flag.
      this.clear()

      // Toggle the enabled flag.
      this._enabled = enable
    }
  }

  /**
   * Given any request, returns a request of the outputs which depend on the
   * key output, and thus can be committed to the page cache
   * (pageCacheStorage.cpp:241-287).
   */
  getCacheableRequest(request: VdfRequest): VdfRequest {
    // The current version of the leaf node cache. This covers topological
    // edits along with property time dependency changes.
    const currentVersion = this._leafNodeCache.getVersion()

    // Lookup the entry in the cache. An out-of-date version is a cache miss.
    // The cache stores a copy of the key, as VdfLRUCache's _Entry does.
    const [found, entry] = this._cacheableRequests.lookup(request.Clone())
    if (found && entry.version === currentVersion) {
      return entry.request
    }

    // Update the leaf node cache version.
    entry.version = currentVersion

    // Add all the entries from the specified request to the cached request.
    // The specified request and the cached request use the same index space.
    entry.request = request.Clone()
    const result = entry.request
    result.addAll()

    // Remove every output that does not depend on the key output: only
    // those are cacheable.
    const deps = this._findDependencies([this._keyMaskedOutput])
    const end = result.end()
    for (const it = result.begin(); !it.Equals(end); it.increment()) {
      if (!deps.has(it.deref().GetOutput()!)) {
        result.remove(it)
      }
    }

    // Return the updated, cached request.
    return result
  }

  /**
   * Appends to `cachedKeys` the keys of the pages selected by `predicate`
   * that cache all the cacheable outputs in `request`. Returns false if the
   * request does not contain any cacheable outputs
   * (pageCacheStorage.cpp:344-393).
   */
  getCachedKeys(
    predicate: EfPageCacheStorage_CacheIteratorPredicateFunction,
    request: VdfRequest,
    cachedKeys: VdfVector[],
  ): boolean {
    if (request.IsEmpty()) {
      return false
    }

    // Filter the specified request by the set of cacheable outputs.
    const cacheableRequest = this.getCacheableRequest(request)

    // If there are no outputs to cache, return false.
    if (cacheableRequest.IsEmpty()) {
      return false
    }

    // Determine the units of work: the page key and output-value-cache of
    // the pages selected by the predicate (pageCacheStorage.cpp:292-305).
    const work: Array<{ key: VdfVector, cache: Ef_OutputValueCache, isCached: boolean }> = []
    for (const [key, cache] of this._pageCache) {
      const cacheAccess = new Ef_OutputValueCache_ExclusiveAccess(cache)
      if (!cacheAccess.IsEmpty() && predicate(key.GetValue())) {
        work.push({ key: key.GetValue(), cache, isCached: true })
      }
    }

    // Determine which pages are cached entirely
    // (EfPageCacheStorage_GetCachedWorker, pageCacheStorage.cpp:289-342).
    WorkParallelForN(work.length, (begin, end) => {
      for (let i = begin; i !== end; ++i) {
        const unit = work[i]!
        const cacheAccess = new Ef_OutputValueCache_ExclusiveAccess(unit.cache)

        // For each output in the cacheable request, determine if it has been
        // cached. By default, all pages in the work vector are considered
        // cached.
        for (const it of cacheableRequest) {
          if (!cacheAccess.GetValue(it.GetOutput()!, it.GetMask())) {
            unit.isCached = false
            break
          }
        }
      }
    })

    // Add the keys of the cached pages to the result set.
    for (const it of work) {
      if (it.isCached) {
        cachedKeys.push(it.key)
      }
    }

    // There are indeed some outputs to cache.
    return true
  }

  /**
   * Invalidate(predicate) (pageCacheStorage.cpp:106-126) clears the entire
   * cache on the pages determined by `predicate`.
   *
   * Invalidate(predicate, invalidationRequest) (pageCacheStorage.cpp:169-239)
   * clears the output values dependent on `invalidationRequest`, on the pages
   * determined by `predicate`.
   */
  invalidate(
    predicate: EfPageCacheStorage_CacheIteratorPredicateFunction,
    invalidationRequest?: VdfMaskedOutputVector,
  ): void {
    if (invalidationRequest === undefined) {
      // Keep track of the number of bytes that have been invalidated.
      let bytesInvalidated = 0

      // Invalidate only the pages determined by the predicate, by clearing
      // the corresponding output-to-value caches.
      for (const [key, cache] of this._pageCache) {
        const cacheAccess = new Ef_OutputValueCache_ExclusiveAccess(cache)
        if (!cacheAccess.IsEmpty() && predicate(key.GetValue())) {
          bytesInvalidated += cacheAccess.clear()
        }
      }

      // Account for the memory that has been deallocated.
      EfPageCacheStorage._numBytesUsed -= bytesInvalidated
      return
    }

    if (invalidationRequest.length === 0) {
      return
    }

    // Find all the outputs above leaf nodes, which are dependent on the
    // invalidation request.
    const deps = this._findDependencies(invalidationRequest)

    // If there are no such dependencies, there is no work to do here.
    if (deps.size === 0) {
      return
    }

    // Create a vector of work, by finding each affected page as determined
    // by the predicate. Empty output-to-value caches need not be considered.
    const work: Ef_OutputValueCache[] = []
    for (const [key, cache] of this._pageCache) {
      const cacheAccess = new Ef_OutputValueCache_ExclusiveAccess(cache)
      if (!cacheAccess.IsEmpty() && predicate(key.GetValue())) {
        work.push(cache)
      }
    }

    // Bail out if there is no work to do.
    if (work.length === 0) {
      return
    }

    // Transform the map of outputs affected by the invalidation into a
    // request.
    const invalidOutputs: VdfMaskedOutputVector = []
    for (const [output, mask] of deps) {
      // An empty mask means the mask on this output could not be determined
      // when traversing, which only happens when nothing is connected to it.
      // Outputs reachable from a leaf node are never disconnected.
      if (!TF_VERIFY(!mask.IsEmpty(), '!mask.IsEmpty()')) {
        continue
      }
      invalidOutputs.push(new VdfMaskedOutput(output, mask))
    }

    // Keep track of the number of bytes that have been invalidated.
    let bytesInvalidated = 0

    // Do the actual work of invalidating the individual pages
    // (EfPageCacheStorage_InvalidateWorker, pageCacheStorage.cpp:128-167).
    WorkParallelForN(work.length, (begin, end) => {
      let workerBytesInvalidated = 0

      // Iterate over the subset of work units.
      for (let i = begin; i !== end; ++i) {
        // Gain exclusive access to the output-to-value cache.
        const cacheAccess = new Ef_OutputValueCache_ExclusiveAccess(work[i]!)

        // Invalidate each of the invalid outputs, keeping track of how many
        // bytes of memory have been freed along the way.
        workerBytesInvalidated += cacheAccess.invalidate(invalidOutputs)
      }

      bytesInvalidated += workerBytesInvalidated
    })

    // Account for the freed memory.
    EfPageCacheStorage._numBytesUsed -= bytesInvalidated
  }

  /** Clears the entire cache on all pages (pageCacheStorage.cpp:395-408). */
  clear(): void {
    // Clear the page cache and keep track of the freed memory.
    EfPageCacheStorage._numBytesUsed -= this._pageCache.clear()

    // Clear the node references.
    this._nodeRefs.fill(0, 0, this._numNodeRefs)
  }

  /**
   * Clears the output values associated with all the given nodes in the
   * network (pageCacheStorage.cpp:410-458).
   */
  clearNodes(network: VdfNetwork, nodes: readonly VdfIndex[]): void {
    // First invert the node indices to nodes, but only for the nodes that
    // actually have output values stored in this cache.
    const referenced: VdfNode[] = []
    for (const nodeIndex of nodes) {
      if (nodeIndex < this._numNodeRefs && this._nodeRefs[nodeIndex]) {
        referenced.push(network.getNode(nodeIndex)!)
        this._nodeRefs[nodeIndex] = 0
      }
    }

    // Invalidate all the output values for all the referenced nodes.
    WorkParallelForEach(this._pageCache, ([, cache]) => {
      const cacheAccess = new Ef_OutputValueCache_ExclusiveAccess(cache)
      if (!cacheAccess.IsEmpty()) {
        for (const node of referenced) {
          // Invalidate all outputs on this node.
          let bytesInvalidated = 0
          for (const [, output] of node.getOutputsIterator()) {
            bytesInvalidated += cacheAccess.invalidate(output)
          }

          // Account for the freed memory.
          if (bytesInvalidated) {
            EfPageCacheStorage._numBytesUsed -= bytesInvalidated
          }
        }
      }
    })
  }

  /**
   * Resizes the internal structures to accommodate output values for the
   * network (pageCacheStorage.cpp:460-503).
   */
  resize(network: VdfNetwork): void {
    const numNodes = network.getNodeCapacity()

    // Whenever the network is resized, make sure that the _nodeRefs array is
    // still appropriately sized.
    if (numNodes < this._numNodeRefs) {
      return
    }

    // Allocate a new array. Over-allocate, so as not to re-allocate the
    // array every time a few nodes are added to an existing network.
    const newSize = numNodes + 1000
    const newNodeRefs = new Uint8Array(newSize)

    // Copy all the existing values into the new array; the tail is zeroed.
    newNodeRefs.set(this._nodeRefs.subarray(0, this._numNodeRefs))

    // Swap the array, and set the new size.
    this._nodeRefs = newNodeRefs
    this._numNodeRefs = newSize
  }

  /**
   * Notifies the storage of a node that is being deleted from the network
   * (pageCacheStorage.cpp:505-552).
   */
  willDeleteNode(node: VdfNode): void {
    // Retrieve the node index.
    const nodeIndex = VdfNode.getIndexFromId(node.getId())

    // If this node has not been referenced in the cache, bail out right
    // away. This prunes about 99% of the nodes in the network.
    if (nodeIndex >= this._numNodeRefs || !this._nodeRefs[nodeIndex]) {
      return
    }

    // Invalidate all the data stored for the deleted node.
    WorkParallelForEach(this._pageCache, ([, cache]) => {
      const cacheAccess = new Ef_OutputValueCache_ExclusiveAccess(cache)
      if (!cacheAccess.IsEmpty()) {
        // Invalidate all outputs on this node.
        let bytesInvalidated = 0
        for (const [, output] of node.getOutputsIterator()) {
          bytesInvalidated += cacheAccess.invalidate(output)
        }

        // Account for the freed memory.
        if (bytesInvalidated) {
          EfPageCacheStorage._numBytesUsed -= bytesInvalidated
        }
      }
    })

    // Remove the node reference.
    this._nodeRefs[nodeIndex] = 0
  }

  /** @internal Returns true if `output` is the key output (pageCacheStorage.cpp:554-562). */
  _isKeyOutput(output: VdfOutput, mask: VdfMask): boolean {
    return this._keyMaskedOutput.GetOutput() === output &&
      this._keyMaskedOutput.GetMask().Equals(mask)
  }

  /**
   * @internal Returns an existing, or newly created cache at the page
   * indexed by `key` (pageCacheStorage.cpp:564-568).
   */
  _getOrCreateCache(key: VdfVector): Ef_OutputValueCache {
    return this._pageCache.getOrCreate(key)
  }

  /**
   * @internal Returns all outputs dependent on the request
   * (pageCacheStorage.cpp:570-583).
   */
  _findDependencies(outputs: VdfMaskedOutputVector): VdfOutputToMaskMap {
    // If the request is for the key dependencies, dispatch to the
    // incrementally updated dependency cache.
    if (outputs.length === 1 && outputs[0]!.Equals(this._keyMaskedOutput)) {
      return this._leafNodeCache.findOutputs(
        outputs, /* updateIncrementally = */ true)
    }

    return this._leafNodeCache.findOutputs(
      outputs, /* updateIncrementally = */ false)
  }

  /**
   * @internal Commits data to an output value cache, returning the size of
   * the committed data, in bytes:
   * - _Commit(executor, request, cacheAccess) reads the values of the
   *   request's outputs from `executor` (pageCacheStorage.cpp:585-632);
   * - _Commit(maskedOutput, value, cacheAccess) commits `value` for a single
   *   output (pageCacheStorage.cpp:634-671).
   */
  _commit(
    executor: VdfExecutorInterface,
    request: VdfRequest,
    cacheAccess: Ef_OutputValueCache_ExclusiveAccess,
  ): number
  _commit(
    maskedOutput: VdfMaskedOutput,
    value: VdfVector,
    cacheAccess: Ef_OutputValueCache_ExclusiveAccess,
  ): number
  _commit(
    arg0: VdfExecutorInterface | VdfMaskedOutput,
    arg1: VdfRequest | VdfVector,
    cacheAccess: Ef_OutputValueCache_ExclusiveAccess,
  ): number {
    if (arg0 instanceof VdfMaskedOutput) {
      const maskedOutput = arg0
      const value = arg1 as VdfVector
      const output = maskedOutput.GetOutput()!
      const mask = maskedOutput.GetMask()

      // The node references vector is expected to be appropriately sized.
      const nodeIndex = VdfNode.getIndexFromId(output.getNode().getId())
      if (!TF_VERIFY(nodeIndex < this._numNodeRefs, 'nodeIndex < _numNodeRefs')) {
        return 0
      }

      // Store the requested output value in its entirety, rather than
      // merely the time dependent bits in the mask: for lookups from the
      // executor to get a cache hit, all the requested data must be there.
      const bytesStored = cacheAccess.setValue(output, value, mask)

      // Keep track of the number of bytes stored, if any.
      if (bytesStored) {
        EfPageCacheStorage._numBytesUsed += bytesStored
      }

      // Mark the owning node as referenced.
      this._nodeRefs[nodeIndex] = 1

      return bytesStored
    }

    const executor = arg0
    const request = arg1 as VdfRequest

    // Keep track of the number of bytes stored.
    let bytesStored = 0

    // Iterate over the request and commit all relevant data to the cache.
    for (const it of request) {
      const output = it.GetOutput()!

      // Get the output value from the specified executor, and store it in
      // the output-to-value cache.
      const mask = it.GetMask()
      const value = executor.getOutputValue(output, mask)
      if (value) {
        // The node references vector is expected to be appropriately sized.
        const nodeIndex = VdfNode.getIndexFromId(output.getNode().getId())
        if (!TF_VERIFY(nodeIndex < this._numNodeRefs, 'nodeIndex < _numNodeRefs')) {
          continue
        }

        // Store the requested output value in its entirety (see above).
        bytesStored += cacheAccess.setValue(output, value, mask)

        // Mark the owning node as referenced.
        this._nodeRefs[nodeIndex] = 1
      }
    }

    // Account for the additional memory used.
    EfPageCacheStorage._numBytesUsed += bytesStored

    return bytesStored
  }
}

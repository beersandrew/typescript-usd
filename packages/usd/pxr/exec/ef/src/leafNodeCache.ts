// Ported from OpenUSD 26.11.1: pxr/exec/ef/leafNodeCache.cpp,
//  pxr/exec/ef/leafNodeCache.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/ef/leafNodeCache.h and
// pxr/exec/ef/leafNodeCache.cpp.
//
// Single-threaded (openexec-x1.md section 5): the atomics are plain fields,
// and the tbb::combinable of _CombineLeafNodes holds one set.

import { TF_DEV_AXIOM } from 'typescript-usd/tf'
import { WorkParallelForN } from 'typescript-usd/work'

import { TfBits } from 'typescript-usd/tf'

import type { VdfConnection } from 'typescript-usd/vdf'
import {
  Vdf_MaskedOutputVectorKey,
  type VdfMaskedOutputVector,
} from 'typescript-usd/vdf'
import type { VdfNode } from 'typescript-usd/vdf'
import { VdfSparseVectorizedOutputTraverser } from 'typescript-usd/vdf'
import type { VdfOutputToMaskMap } from 'typescript-usd/vdf'
import { EfDependencyCache, _SetOrAppend } from './dependencyCache.ts'
import { EfLeafNode, EfLeafTokens } from './leafNode.ts'
import { Ef_LeafNodeIndexer } from './leafNodeIndexer.ts'

// Holds the sets of leaf nodes, one for each output in the request, along
// with cached, combined sets of leaf nodes given a mask of the requested
// outputs (leafNodeCache.h:102-108). The sets contain indices into the leaf
// node indexer. combinedLeafNodes is keyed by the canonical key of the
// outputs mask, _GetBitsKey.
interface _VectorizedCacheEntry {
  leafNodes: TfBits[]
  combinedLeafNodes: Map<string, TfBits>
}

// Stores an array of leaf nodes, and the outputs connected to these leaf
// nodes (leafNodeCache.h:110-114).
interface _SparseCacheEntry {
  nodes: VdfNode[]
  outputs: VdfOutputToMaskMap
}

// The canonical key of a TfBits value (TfBits::FastHash and operator==).
function _GetBitsKey(bits: TfBits): string {
  return bits.getAsStringLeftToRight()
}

// Shared empty result of FindNodes (leafNodeCache.cpp:123-124).
const _emptyNodes: readonly VdfNode[] = Object.freeze([])

/**
 * Predicate used for the dependency cache (leafNodeCache.cpp:20-47). It
 * tracks leaf node dependencies, caching at the outputs directly above the
 * leaf nodes, because those outputs appear in requests.
 */
function EfLeafNodeCache_DependencyPredicate(
  node: VdfNode,
  outputDeps: VdfOutputToMaskMap,
  nodeDeps: VdfNode[],
): boolean {
  // Is this node a leaf node?
  if (EfLeafNode.isALeafNode(node)) {
    // Grab the single connection and store the output directly above it in
    // the dependencies map.
    const c = node.getInput(EfLeafTokens.in)!.getConnections()[0]!
    const output = c.getSourceOutput()
    outputDeps.set(output, _SetOrAppend(outputDeps.get(output), c.GetMask()))

    // Establish a node dependency.
    nodeDeps.push(node)

    // We're done here.
    return false
  }

  // Continue the dependency traversal.
  return true
}

/**
 * EfLeafNodeCache (leafNodeCache.h:37-168): a thin wrapper around the
 * EfDependencyCache, caching node and output dependencies on EfLeafNodes
 * given an arbitrary input request.
 */
export class EfLeafNodeCache {
  // The version of the cache. Incremented with every edit.
  private _version = 0

  // Indicates that the internal state pertaining to vectorized and sparse
  // caches is invalid and that those caches be cleared.
  private _cachesAreInvalid = false

  // The dependency cache used for fast lookups of input-to-output
  // dependencies.
  private readonly _dependencyCache: EfDependencyCache

  // The leaf node indexer associates each leaf node with a unique index.
  private readonly _indexer = new Ef_LeafNodeIndexer()

  // A cache of requested outputs to leaf node dependencies for each
  // individual output in the request (leafNodeCache.h:150-156), keyed by
  // Vdf_MaskedOutputVectorKey.
  private readonly _vectorizedCache = new Map<string, _VectorizedCacheEntry>()

  // A cache of requested outputs to leaf nodes and leaf node connected
  // outputs (leafNodeCache.h:158-164), keyed by Vdf_MaskedOutputVectorKey.
  private readonly _sparseCache = new Map<string, _SparseCacheEntry>()

  // The traverser used to populate the vectorized cache.
  private readonly _traverser = new VdfSparseVectorizedOutputTraverser()

  /** Constructor (leafNodeCache.cpp:49-54). */
  constructor() {
    this._dependencyCache = new EfDependencyCache(EfLeafNodeCache_DependencyPredicate)
  }

  /**
   * Returns the current edit version (leafNodeCache.h:52-54). Only equality
   * of two versions is meaningful: leaf node dependencies have not changed.
   */
  getVersion(): number {
    return this._version
  }

  /** Finds outputs dependent on the given outputs (leafNodeCache.cpp:56-69). */
  findOutputs(
    outputs: VdfMaskedOutputVector,
    updateIncrementally: boolean,
  ): VdfOutputToMaskMap {
    // Make sure the caches are cleared if they are invalid.
    this._clearCachesIfInvalid()

    const e = this._sparseCache.get(Vdf_MaskedOutputVectorKey(outputs))
    if (e !== undefined) {
      return e.outputs
    }

    return this._dependencyCache.findOutputs(outputs, updateIncrementally)
  }

  /**
   * FindNodes(outputs, updateIncrementally) (leafNodeCache.cpp:71-84) finds
   * leaf nodes dependent on the given outputs.
   *
   * FindNodes(outputs, outputsMask) (leafNodeCache.cpp:116-171) finds the
   * leaf nodes dependent on only the outputs selected by `outputsMask`. A
   * previous request of `outputs` is a cache hit regardless of the mask.
   */
  findNodes(
    outputs: VdfMaskedOutputVector,
    updateIncrementallyOrOutputsMask: boolean | TfBits,
  ): readonly VdfNode[] {
    if (typeof updateIncrementallyOrOutputsMask === 'boolean') {
      const updateIncrementally = updateIncrementallyOrOutputsMask

      // Make sure the caches are cleared if they are invalid.
      this._clearCachesIfInvalid()

      const e = this._sparseCache.get(Vdf_MaskedOutputVectorKey(outputs))
      if (e !== undefined) {
        return e.nodes
      }

      return this._dependencyCache.findNodes(outputs, updateIncrementally)
    }

    const outputsMask = updateIncrementallyOrOutputsMask

    // Bail out if the outputs vector is empty.
    if (outputs.length === 0 || outputsMask.getNumSet() === 0) {
      return _emptyNodes
    }

    // Make sure the caches are cleared if they are invalid.
    this._clearCachesIfInvalid()

    // Lookup the cached traversal, if any.
    let vectorized = this._vectorizedCache.get(Vdf_MaskedOutputVectorKey(outputs))

    // If there is no cached traversal, do the traversal now. This is the
    // slow path.
    if (vectorized === undefined) {
      vectorized = this._populateVectorizedEntry(outputs)
    }

    // For all the outputs selected with the outputsMask, lookup the combined
    // leaf node set.
    const maskKey = _GetBitsKey(outputsMask)
    let combinedLeafNodes = vectorized.combinedLeafNodes.get(maskKey)
    if (combinedLeafNodes === undefined) {
      combinedLeafNodes = new TfBits()
      vectorized.combinedLeafNodes.set(maskKey, combinedLeafNodes)
    }

    // If there is no combined leaf node set, combine it now and then cache
    // the result.
    if (combinedLeafNodes.IsEmpty()) {
      combinedLeafNodes = this._combineLeafNodes(outputsMask, vectorized.leafNodes)
      vectorized.combinedLeafNodes.set(maskKey, combinedLeafNodes)
    }

    // Build the key into the sparse cache.
    const sparseKey: VdfMaskedOutputVector = []
    for (const idx of outputsMask.getAllSetView()) {
      sparseKey.push(outputs[idx]!)
    }

    // Lookup the entry in the sparse cache, if any.
    let sparse = this._sparseCache.get(Vdf_MaskedOutputVectorKey(sparseKey))

    // If there is no entry in the sparse cache, create a new one.
    if (sparse === undefined) {
      sparse = this._populateSparseEntry(sparseKey, combinedLeafNodes)
    }

    // Return the vector of nodes from the sparse cache.
    return sparse.nodes
  }

  /** Clears the entire cache (leafNodeCache.cpp:173-188). */
  clear(): void {
    // Increment the edit version.
    ++this._version

    // Caches are now cleared, but in a valid state.
    this._cachesAreInvalid = false

    // Clear all internal state.
    this._dependencyCache.invalidate()
    this._indexer.invalidate()
    this._vectorizedCache.clear()
    this._sparseCache.clear()
    this._traverser.invalidate()
  }

  /**
   * Notifies the cache of connections that have been deleted
   * (leafNodeCache.cpp:190-206).
   */
  willDeleteConnection(connection: VdfConnection): void {
    if (!this._cachesAreInvalid) {
      // Increment the edit version.
      ++this._version

      // Internal state related to vectorized and sparse caches is invalid.
      this._cachesAreInvalid = true
    }

    // Propagate changes to the dependency cache and leaf node indexer.
    this._dependencyCache.willDeleteConnection(connection)
    this._indexer.didDisconnect(connection)
  }

  /** Notifies the cache of newly added connections (leafNodeCache.cpp:208-224). */
  didConnect(connection: VdfConnection): void {
    if (!this._cachesAreInvalid) {
      // Increment the edit version.
      ++this._version

      // Internal state related to vectorized and sparse caches is invalid.
      this._cachesAreInvalid = true
    }

    // Propagate changes to the dependency cache and leaf node indexer.
    this._dependencyCache.didConnect(connection)
    this._indexer.didConnect(connection)
  }

  // leafNodeCache.cpp:226-242.
  private _clearCachesIfInvalid(): void {
    if (!this._cachesAreInvalid) {
      return
    }

    this._cachesAreInvalid = false

    if (this._vectorizedCache.size !== 0) {
      this._vectorizedCache.clear()
      this._sparseCache.clear()
      this._traverser.invalidate()
    }
  }

  // leafNodeCache.cpp:86-114.
  private _combineLeafNodes(outputsMask: TfBits, leafNodes: readonly TfBits[]): TfBits {
    const set = new TfBits(this._indexer.getCapacity())

    WorkParallelForN(outputsMask.getSize(), (b, e) => {
      for (let i = b; i !== e; ++i) {
        if (outputsMask.isSet(i)) {
          set.orAssign(leafNodes[i]!)
        }
      }
    })

    const result = new TfBits(this._indexer.getCapacity())
    result.orAssign(set)

    return result
  }

  // leafNodeCache.cpp:244-274.
  private _populateVectorizedEntry(outputs: VdfMaskedOutputVector): _VectorizedCacheEntry {
    // Make sure to populate the cache with the result of this traversal.
    const entry: _VectorizedCacheEntry = {
      leafNodes: [],
      combinedLeafNodes: new Map(),
    }
    this._vectorizedCache.set(Vdf_MaskedOutputVectorKey(outputs), entry)

    // Populate the output and node sets.
    for (let i = 0; i < outputs.length; ++i) {
      entry.leafNodes.push(new TfBits(this._indexer.getCapacity()))
    }

    // Do the traversal.
    const indexer = this._indexer
    this._traverser.traverse(outputs, (node: VdfNode, index: number) => {
      // If the visited node is a leaf node, record the leaf node dependency
      // for the relevant output in the request, as denoted by the index.
      if (EfLeafNode.isALeafNode(node)) {
        const leafIndex = indexer.getIndex(node)
        TF_DEV_AXIOM(leafIndex !== Ef_LeafNodeIndexer.InvalidIndex,
          'leafIndex != Ef_LeafNodeIndexer::InvalidIndex')
        entry.leafNodes[index]!.Set(leafIndex)
      }
      return true
    })

    // Return the new entry.
    return entry
  }

  // leafNodeCache.cpp:276-300.
  private _populateSparseEntry(
    outputs: VdfMaskedOutputVector,
    leafNodes: TfBits,
  ): _SparseCacheEntry {
    // Create a new entry in the sparse cache.
    const entry: _SparseCacheEntry = { nodes: [], outputs: new Map() }
    this._sparseCache.set(Vdf_MaskedOutputVectorKey(outputs), entry)

    // For each leaf node, insert the node into the nodes container, and the
    // connected leaf output into the outputs container.
    for (const idx of leafNodes.getAllSetView()) {
      entry.nodes.push(this._indexer.getNode(idx)!)
      const output = this._indexer.getSourceOutput(idx)!
      entry.outputs.set(output,
        _SetOrAppend(entry.outputs.get(output), this._indexer.getSourceMask(idx)!))
    }

    return entry
  }
}

// Ported from OpenUSD 26.11.1: pxr/exec/vdf/sparseOutputTraverser.cpp,
//  pxr/exec/vdf/sparseOutputTraverser.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/sparseOutputTraverser.h and
// sparseOutputTraverser.cpp.
//
// Sparse traversal in the input-to-output direction. The non-static
// TraverseWithCaching may replay cached traversals of identical requests.
// Pool outputs are deferred to a priority queue processed in pool chain
// order, further up the pool chain first.
//
// Mapping choices:
// - std::map<VdfPoolChainIndex, _PrioritizedOutput> is a Map keyed by
//   VdfPoolChainIndex.GetKey(); the top entry is the smallest index.
// - The traversal cache (TfHashMap keyed by VdfMaskedOutputVector) is keyed by
//   Vdf_MaskedOutputVectorKey(); the eviction history is a FIFO of keys.
// - _CacheEntry::targetNodes is a std::set<const VdfNode *> ordered by
//   pointer; here it is an insertion-ordered Set.
// - Cache entries are referred to by index, as upstream's
//   _currentCache->cacheEntries.back() is the entry just added.

import { Debug as TfDebug, TF_AXIOM, TF_VERIFY, type TfCompressedBits } from 'typescript-usd/tf'

// Relative import: TfBits is not in the tf barrel yet.
import { TfBits } from 'typescript-usd/tf'

import type { VdfConnection } from './connection.ts'
import { VdfDebugCodes, VdfIsDebugEnabled } from './debugCodes.ts'
import type { VdfInput } from './input.ts'
import { VdfMask } from './mask.ts'
import type { VdfMaskedOutput } from './maskedOutput.ts'
import {
  VdfGetMaskedOutputVectorNetwork,
  VdfSortAndUniqueMaskedOutputVector,
  Vdf_MaskedOutputVectorKey,
} from './maskedOutputVector.ts'
import { VdfNode } from './node.ts'
import type { VdfOutput } from './output.ts'
import { Vdf_IsPoolOutput, type VdfPoolChainIndex } from './poolChainIndex.ts'
import type { VdfNodeCallback } from './types.ts'

/** OutputCallback (sparseOutputTraverser.h:74-76). */
export type VdfSparseOutputTraverser_OutputCallback =
  (output: VdfOutput, mask: VdfMask, incomingInput: VdfInput | null) => boolean

// VdfSparseOutputTraverser_PrioritizedOutput (sparseOutputTraverser.cpp:33-76).
class _PrioritizedOutput {
  private readonly _output: VdfOutput
  private readonly _parentCacheIndices: number[]
  private _dependencyBits: TfCompressedBits

  constructor(output: VdfOutput, parentCacheIndex: number, dependencyMask: VdfMask) {
    this._output = output
    this._parentCacheIndices = [parentCacheIndex]
    this._dependencyBits = dependencyMask.getBits()
  }

  GetOutput(): VdfOutput {
    return this._output
  }

  getDependencyBits(): TfCompressedBits {
    return this._dependencyBits
  }

  extend(dependencyMask: VdfMask, parentCacheIndex: number): void {
    this._dependencyBits = this._dependencyBits.or(dependencyMask.getBits())
    this._parentCacheIndices.push(parentCacheIndex)
  }

  getParentCacheIndices(): readonly number[] {
    return this._parentCacheIndices
  }
}

// VdfSparseOutputTraverser_TraversalStackFrame (sparseOutputTraverser.cpp:90-111).
interface _TraversalStackFrame {
  output: VdfOutput
  mask: VdfMask
  parentCacheIndex: number
  incomingInput: VdfInput | null
}

// VdfSparseOutputTraverser_TraversalState (sparseOutputTraverser.cpp:125-130).
class _TraversalState {
  readonly visitedConnections = new Map<VdfConnection, TfCompressedBits>()
  readonly prioritizedOutputs =
    new Map<string, { index: VdfPoolChainIndex, value: _PrioritizedOutput }>()
  stack: _TraversalStackFrame[] = []

  // prioritizedOutputs.begin(): the smallest index.
  topPrioritizedKey(): string {
    let topKey = ''
    let top: VdfPoolChainIndex | null = null
    for (const [key, entry] of this.prioritizedOutputs) {
      if (!top || entry.index.lessThan(top)) {
        top = entry.index
        topKey = key
      }
    }
    return topKey
  }
}

// _CacheEntry (sparseOutputTraverser.cpp:225-258).
interface _CacheEntry {
  output: VdfOutput
  cont: boolean
  childIndices: number[]
  mask: VdfMask
  targetNodes: Set<VdfNode>
  incomingInput: VdfInput | null
}

// _Cache (sparseOutputTraverser.h:129-138).
interface _Cache {
  rootIndices: number[]
  cacheEntries: _CacheEntry[]
}

// _TraversalHelper (sparseOutputTraverser.cpp:138-221).
class _TraversalHelper {
  private readonly _outputCallback: VdfSparseOutputTraverser_OutputCallback | null
  private readonly _nodeCallback: VdfNodeCallback | null
  private _currentCache: _Cache | null = null
  private readonly _nodeCallbackInvocations: TfBits

  constructor(
    outputs: readonly VdfMaskedOutput[],
    outputCallback: VdfSparseOutputTraverser_OutputCallback | null,
    nodeCallback: VdfNodeCallback | null) {
    this._outputCallback = outputCallback
    this._nodeCallback = nodeCallback
    this._nodeCallbackInvocations = new TfBits(
      _TraversalHelper._getNodeCallbackInvocationsSize(outputs, nodeCallback))
  }

  // _GetNodeCallbackInvocationsSize (sparseOutputTraverser.cpp:483-493).
  private static _getNodeCallbackInvocationsSize(
    outputs: readonly VdfMaskedOutput[],
    nodeCallback: VdfNodeCallback | null): number {
    return (nodeCallback && outputs.length)
      ? VdfGetMaskedOutputVectorNetwork(outputs)!.getNodeCapacity()
      : 0
  }

  // _InvokeNodeCallback (sparseOutputTraverser.cpp:184-194).
  private _invokeNodeCallback(node: VdfNode): void {
    if (this._nodeCallback) {
      const nodeIndex = VdfNode.getIndexFromId(node.getId())
      if (!this._nodeCallbackInvocations.isSet(nodeIndex)) {
        this._nodeCallbackInvocations.Set(nodeIndex)
        this._nodeCallback(node)
      }
    }
  }

  // CachedTraversal (sparseOutputTraverser.cpp:495-561): plays back the
  // cache, traversing anew where an output callback now continues.
  cachedTraversal(state: _TraversalState, cache: _Cache): void {
    this._currentCache = cache

    const cacheSize = this._currentCache.cacheEntries.length
    if (cacheSize === 0) return

    // Wipe the stack, to be populated with missing pieces.
    state.stack = []

    const workingSet = new TfBits(cacheSize)
    for (const index of this._currentCache.rootIndices) workingSet.Set(index)

    while (workingSet.isAnySet()) {
      const i = workingSet.getFirstSet()
      workingSet.clear(i)

      const e = this._currentCache.cacheEntries[i]!

      const cont = this._outputCallback!(e.output, e.mask, e.incomingInput)
      if (cont) {
        if (this._nodeCallback) {
          for (const node of e.targetNodes) this._invokeNodeCallback(node)
        }
        for (const index of e.childIndices) workingSet.Set(index)
      }

      if (cont === e.cont) continue

      // A recorded stop that now continues: traverse from here.
      if (cont) {
        e.cont = true
        this._traverseOutputConnections(state, e.output, e.mask, e, i)
      }
    }
  }

  // TraverseOutput (sparseOutputTraverser.cpp:563-632).
  traverseOutput(
    state: _TraversalState,
    output: VdfOutput,
    mask: VdfMask,
    parentCacheIndices: readonly number[],
    incomingInput: VdfInput | null): void {
    TF_VERIFY(parentCacheIndices.length >= 1, 'parentCacheIndices.size() >= 1')

    let myCacheIndex = -1

    if (this._outputCallback) {
      // incomingInput is sometimes null.
      const cont = this._outputCallback(output, mask, incomingInput)

      if (this._currentCache) {
        myCacheIndex = this._currentCache.cacheEntries.length

        for (const i of parentCacheIndices) {
          TF_VERIFY(myCacheIndex !== i, 'myCacheIndex != i')
        }

        this._currentCache.cacheEntries.push({
          output, cont, childIndices: [], mask, targetNodes: new Set(), incomingInput,
        })

        if (parentCacheIndices.length === 1 && parentCacheIndices[0] === -1) {
          this._currentCache.rootIndices.push(myCacheIndex)
        }

        for (const i of parentCacheIndices) {
          if (!TF_VERIFY(i >= -1 && i < myCacheIndex, 'i >= -1 && i < myCacheIndex')) {
            continue
          }
          if (i >= 0) {
            this._currentCache.cacheEntries[i]!.childIndices.push(myCacheIndex)
          }
        }
      }

      if (!cont) return
    }

    const cacheEntries = this._currentCache?.cacheEntries
    this._traverseOutputConnections(
      state, output, mask,
      cacheEntries ? cacheEntries[cacheEntries.length - 1] ?? null : null,
      myCacheIndex)
  }

  // _TraverseOutputConnections (sparseOutputTraverser.cpp:634-694).
  private _traverseOutputConnections(
    state: _TraversalState,
    output: VdfOutput,
    mask: VdfMask,
    cacheEntry: _CacheEntry | null,
    cacheIndex: number): void {
    if (VdfIsDebugEnabled(VdfDebugCodes.VDF_SPARSE_OUTPUT_TRAVERSER_TRACING)) {
      TfDebug.msg(VdfDebugCodes.VDF_SPARSE_OUTPUT_TRAVERSER_TRACING,
        `  Traversing output '${output.getDebugName()}' with mask ${mask.getRLEString()}\n`)
    }

    for (const connection of output.getConnections()) {
      const visited = state.visitedConnections.get(connection)

      // Skip if the accumulated mask contains the current mask (a cycle).
      if (visited && visited.contains(mask.getBits())) continue

      // Skip connections with empty masks.
      if (connection.GetMask().isAllZeros()) continue

      if (mask.overlaps(connection.GetMask())) {
        if (visited) {
          state.visitedConnections.set(connection, visited.or(mask.getBits()))
        } else {
          state.visitedConnections.set(connection, mask.getBits())
        }

        const targetNode = connection.getTargetNode()

        this._invokeNodeCallback(targetNode)

        if (cacheEntry) cacheEntry.targetNodes.add(targetNode)

        this._traverseNode(state, targetNode, connection, mask, cacheIndex)
      }
    }
  }

  // _TraverseNode (sparseOutputTraverser.cpp:703-773).
  private _traverseNode(
    state: _TraversalState,
    node: VdfNode,
    connection: VdfConnection,
    mask: VdfMask,
    parentCacheIndex: number): void {
    TF_AXIOM(connection, 'connection')

    if (VdfIsDebugEnabled(VdfDebugCodes.VDF_SPARSE_OUTPUT_TRAVERSER_TRACING)) {
      TfDebug.msg(VdfDebugCodes.VDF_SPARSE_OUTPUT_TRAVERSER_TRACING,
        `  Traversing node '${node.getDebugName()}' from connection ` +
        `'${connection.getDebugName()}' with mask ${mask.getRLEString()}\n`)
    }

    const dependencies: VdfMaskedOutput[] = []
    node.computeOutputDependencyMasks(connection, mask, dependencies)

    for (const dependency of dependencies) {
      const output = dependency.GetOutput()
      if (!TF_VERIFY(output, 'dependency.GetOutput()')) continue
      const dependencyMask = dependency.GetMask()

      // Non-pool outputs are processed immediately.
      if (!Vdf_IsPoolOutput(output!)) {
        state.stack.push({
          output: output!, mask: dependencyMask,
          parentCacheIndex, incomingInput: connection.getTargetInput(),
        })
        continue
      }

      // Pool outputs are processed in pool chain order.
      const poolIndex = node.getNetwork().getPoolChainIndex(output!)
      const key = poolIndex.getKey()
      const iter = state.prioritizedOutputs.get(key)
      if (iter) {
        if (TF_VERIFY(iter.value.GetOutput() === output,
          'iter->second.GetOutput() == &output')) {
          iter.value.extend(dependencyMask, parentCacheIndex)
        }
      } else {
        state.prioritizedOutputs.set(key, {
          index: poolIndex,
          value: new _PrioritizedOutput(output!, parentCacheIndex, dependencyMask),
        })
      }
    }
  }
}

export class VdfSparseOutputTraverser {
  /**
   * MaxRequestsBeforeEviction (sparseOutputTraverser.h:54): -1 disables
   * eviction, 0 disables caching.
   */
  static readonly MaxRequestsBeforeEviction: number = 10

  private readonly _enableCaching: boolean
  private readonly _cache = new Map<string, _Cache>()
  private _cacheHistory: string[] = []

  /** VdfSparseOutputTraverser(enableCaching) (sparseOutputTraverser.cpp:264-268). */
  constructor(enableCaching = true) {
    this._enableCaching = enableCaching
  }

  /** InvalidateAll (sparseOutputTraverser.cpp:270-281). */
  invalidateAll(): void {
    if (this._cache.size) this._cache.clear()
    if (this._cacheHistory.length) this._cacheHistory = []
  }

  /** Traverse (sparseOutputTraverser.cpp:283-293): a traversal without caching. */
  static traverse(
    outputs: readonly VdfMaskedOutput[],
    outputCallback: VdfSparseOutputTraverser_OutputCallback | null,
    nodeCallback: VdfNodeCallback | null): void {
    new VdfSparseOutputTraverser(/* enableCaching */ false)
      .traverseWithCaching(outputs, outputCallback, nodeCallback)
  }

  /** TraverseWithCaching (sparseOutputTraverser.cpp:336-469). */
  traverseWithCaching(
    outputs: readonly VdfMaskedOutput[],
    outputCallback: VdfSparseOutputTraverser_OutputCallback | null,
    nodeCallback: VdfNodeCallback | null): void {
    if (VdfIsDebugEnabled(VdfDebugCodes.VDF_SPARSE_OUTPUT_TRAVERSER_TRACING)) {
      TfDebug.msg(VdfDebugCodes.VDF_SPARSE_OUTPUT_TRAVERSER_TRACING,
        `\nStarting sparse traversal with ${outputs.length} outputs\n`)
    }

    if (!outputs.length) return

    const useCaching = this._enableCaching && !!outputCallback &&
      VdfSparseOutputTraverser.MaxRequestsBeforeEviction !== 0

    const sortedOutputs = [...outputs]
    if (outputs.length > 1 && useCaching) {
      VdfSortAndUniqueMaskedOutputVector(sortedOutputs)
    }

    const state = new _TraversalState()
    const helper = new _TraversalHelper(sortedOutputs, outputCallback, nodeCallback)

    // Push the initial outputs, rejecting immediate repeats.
    for (const maskedOutput of outputs) {
      const output = maskedOutput.GetOutput()!
      const mask = maskedOutput.GetMask()

      const back = state.stack[state.stack.length - 1]
      if (back && back.output === output && back.mask.Equals(mask)) continue

      state.stack.push({ output, mask, parentCacheIndex: -1, incomingInput: null })
    }

    if (useCaching) {
      helper.cachedTraversal(state, this._getOrCreateCacheEntry(sortedOutputs))
    }

    while (state.stack.length || state.prioritizedOutputs.size) {
      while (state.stack.length) {
        const frame = state.stack.pop()!
        TF_AXIOM(frame.output, 'frame.output')

        helper.traverseOutput(
          state, frame.output, frame.mask,
          [frame.parentCacheIndex],
          frame.incomingInput)
      }

      if (!state.prioritizedOutputs.size) break

      const topKey = state.topPrioritizedKey()
      const top = state.prioritizedOutputs.get(topKey)!.value

      if (VdfIsDebugEnabled(VdfDebugCodes.VDF_SPARSE_OUTPUT_TRAVERSER_TRACING)) {
        TfDebug.msg(VdfDebugCodes.VDF_SPARSE_OUTPUT_TRAVERSER_TRACING,
          `  Invalidating pool output '${top.GetOutput().getDebugName()}'\n`)
      }

      // The incoming input of a pool output is not tracked (null).
      const dependencyMask = new VdfMask(top.getDependencyBits())
      const numParents = top.getParentCacheIndices().length

      helper.traverseOutput(
        state, top.GetOutput(), dependencyMask,
        top.getParentCacheIndices(), /* incomingInput */ null)

      TF_VERIFY(dependencyMask.getBits().Equals(top.getDependencyBits()),
        'dependencyMask.GetBits() == top.GetDependencyBits()')
      TF_VERIFY(numParents === top.getParentCacheIndices().length,
        'numParents == top.GetParentCacheIndices().size()')

      state.prioritizedOutputs.delete(topKey)
    }
  }

  // _GetOrCreateCacheEntry (sparseOutputTraverser.cpp:295-334): enforces the
  // eviction policy.
  private _getOrCreateCacheEntry(sortedOutputs: readonly VdfMaskedOutput[]): _Cache {
    const max = VdfSparseOutputTraverser.MaxRequestsBeforeEviction
    TF_VERIFY(max !== 0 && this._enableCaching,
      'MaxRequestsBeforeEviction != 0 && _enableCaching',
      'Attempt to create cache entry with caching disabled.')

    const key = Vdf_MaskedOutputVectorKey(sortedOutputs)
    const found = this._cache.get(key)
    if (found) return found

    const cache: _Cache = { rootIndices: [], cacheEntries: [] }
    this._cache.set(key, cache)

    this._cacheHistory.push(key)

    if (this._cacheHistory.length > max && max > -1 && this._cacheHistory.length) {
      const evictKey = this._cacheHistory.shift()!

      if (TF_VERIFY(evictKey !== key, 'evictIt != it',
        'Cache entry has been evicted before use.')) {
        this._cache.delete(evictKey)
      }
    }

    return cache
  }
}

export declare namespace VdfSparseOutputTraverser {
  type OutputCallback = VdfSparseOutputTraverser_OutputCallback
}

// Ported from OpenUSD 26.11.1: pxr/exec/vdf/executorInvalidator.cpp,
//  pxr/exec/vdf/executorInvalidator.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/executorInvalidator.h and
// pxr/exec/vdf/executorInvalidator.cpp.
//
// Containers: the _Visited vector is an array indexed by output index; the
// dependency TfHashMap keyed by VdfMaskedOutput is a Map from
// VdfMaskedOutput.Hash() to the entries with that hash (matched with
// VdfMaskedOutput.Equals); the std::map pool queue keyed by VdfPoolChainIndex
// is an array kept sorted with VdfPoolChainIndex.LessThan (begin() is its
// first element). The atomics of the parallel loops are plain locals
// (WorkParallelForN runs serially, doc section 5).

import { WorkDispatcher, WorkParallelForN, WorkWithScopedParallelism } from 'typescript-usd/work'

import type { VdfExecutorInterface } from './executorInterface.ts'
import type { VdfInput } from './input.ts'
import { VdfLRUCache } from './lruCache.ts'
import { VdfMask } from './mask.ts'
import { VdfMaskedOutput } from './maskedOutput.ts'
import { VdfSortAndUniqueMaskedOutputVector } from './maskedOutputVector.ts'
import { VdfMaskMemoizer } from './maskMemoizer.ts'
import type { VdfNode } from './node.ts'
import { VdfNodeProcessInvalidationInterface } from './nodeProcessInvalidationInterface.ts'
import { VdfOutput } from './output.ts'
import { type VdfPoolChainIndex, Vdf_IsPoolOutput } from './poolChainIndex.ts'

/** VdfNodeToInputPtrVectorMap (types.h:94-95), keyed by node object. */
type _NodeToInputPtrVectorMap = Map<VdfNode, VdfInput[]>

/** Information about a visited output (executorInvalidator.h:69-74). */
class _Visited {
  timestamp: number
  index = 0
  mask = new VdfMask()
  constructor(ts: number) {
    this.timestamp = ts
  }
}

/** A cached dependency on a pool output (executorInvalidator.h:77-80). */
interface _PoolDependency {
  readonly poolChainIndex: VdfPoolChainIndex
  readonly maskedOutput: VdfMaskedOutput
}

/** An entry with cached dependencies (executorInvalidator.h:83-87). */
interface _Dependencies {
  readonly outputs: VdfMaskedOutput[]
  readonly poolOutputs: _PoolDependency[]
  readonly inputs: VdfInput[]
}

/**
 * A cached invalidation entry for fast invalidation replay
 * (executorInvalidator.h:92-96). masks[0] is for visits where the
 * invalidation callback returned false, masks[1] where it returned true.
 */
class _ReplayEntry {
  readonly output: VdfOutput
  readonly masks: [VdfMask, VdfMask] = [new VdfMask(), new VdfMask()]
  constructor(o: VdfOutput) {
    this.output = o
  }
}

/** The cache of invalidation entries for fast replay (executorInvalidator.h:101-104). */
interface _ReplayCache {
  entries: _ReplayEntry[]
  inputs: _NodeToInputPtrVectorMap
}

/** One element of the pool queue (executorInvalidator.h:114). */
interface _PoolQueueEntry {
  readonly key: VdfPoolChainIndex
  value: VdfMaskedOutput
}

// VdfMaskedOutputVector_Hash (maskedOutputVector.h) for the replay LRU: only
// used as the early-out of key comparison (lruCache.h:91), equality decides.
function _HashMaskedOutputVector(v: readonly VdfMaskedOutput[]): number {
  let h = v.length
  for (const mo of v) {
    h = (Math.imul(h, 0x9e3779b1) ^ (VdfMaskedOutput.Hash(mo) | 0)) >>> 0
  }
  return h
}

// VdfMaskedOutputVector operator== (std::vector element-wise equality).
function _EqualMaskedOutputVectors(
  lhs: readonly VdfMaskedOutput[], rhs: readonly VdfMaskedOutput[]): boolean {
  if (lhs.length !== rhs.length) {
    return false
  }
  for (let i = 0; i < lhs.length; ++i) {
    if (!lhs[i]!.Equals(rhs[i]!)) {
      return false
    }
  }
  return true
}

/**
 * VdfExecutorInvalidator (executorInvalidator.h:41-178): invalidates state
 * and temporary buffers of all outputs dependent on the outputs supplied in
 * the invalidation request, keeping state to accelerate later requests.
 */
export class VdfExecutorInvalidator {
  // executorInvalidator.h:156: the executor being invalidated.
  private readonly _executor: VdfExecutorInterface

  // executorInvalidator.h:159: visited outputs, indexed by output index.
  private readonly _visited: _Visited[] = []

  // executorInvalidator.h:163: the current round of invalidation.
  private _timestamp = 0

  // executorInvalidator.h:166-168: cached dependencies by masked output.
  private readonly _dependencyMap =
    new Map<number, { key: VdfMaskedOutput, value: _Dependencies }[]>()

  // executorInvalidator.h:171-173: recently used replay caches.
  private readonly _replayLRU = new VdfLRUCache<VdfMaskedOutput[], _ReplayCache>(
    16, _HashMaskedOutputVector,
    () => ({ entries: [], inputs: new Map() }),
    _EqualMaskedOutputVectors)

  // executorInvalidator.h:176: the memoized mask operations.
  private readonly _maskMemoizer = new VdfMaskMemoizer()

  /** executorInvalidator.h:48-52. */
  constructor(executor: VdfExecutorInterface) {
    this._executor = executor
  }

  /** Invalidate (executorInvalidator.cpp:26-55). */
  invalidate(request: readonly VdfMaskedOutput[]): void {
    // Bail out if the request is empty.
    if (request.length === 0) {
      return
    }

    // If everything in the request is already invalid, we do not need to do
    // any more invalidation.
    if (this._isInvalid(request)) {
      return
    }

    // Make sure the request is sorted, so that we can use it as a key for
    // cache lookup.
    const sortedRequest = [...request]
    VdfSortAndUniqueMaskedOutputVector(sortedRequest)

    // Attempt to replay a previously recorded traversal. If this fails, start
    // a new traversal.
    const replayCache = this._getReplayCache(sortedRequest)
    if (!this._replay(replayCache)) {
      this._traverse(sortedRequest, replayCache)
    }
  }

  /** Reset (executorInvalidator.cpp:57-67). */
  Reset(): void {
    this._replayLRU.clear()
    this._dependencyMap.clear()
  }

  /** _IsInvalid (executorInvalidator.cpp:69-114). */
  private _isInvalid(request: readonly VdfMaskedOutput[]): boolean {
    // Most commonly the request will only contain a single entry.
    if (request.length === 1) {
      const mo = request[0]!
      return this._executor._isOutputInvalid(mo.GetOutput()!.getId(), mo.GetMask())
    }

    const executor = this._executor
    let isValid = false

    // Iterate over all the entries in the request and determine whether the
    // entries are invalid. If any one of the entries is valid, we can bail out
    // immediately.
    WorkParallelForN(request.length, (b, e) => {
      for (let i = b; i !== e; ++i) {
        if (isValid) {
          break
        }

        const mo = request[i]!
        const isEntryInvalid = executor._isOutputInvalid(
          mo.GetOutput()!.getId(), mo.GetMask())

        if (!isEntryInvalid) {
          isValid = true
          break
        }
      }
    })

    return !isValid
  }

  /** _GetReplayCache (executorInvalidator.cpp:116-134). */
  private _getReplayCache(outputs: VdfMaskedOutput[]): _ReplayCache {
    const [found, cache] = this._replayLRU.lookup(outputs)
    if (found) {
      return cache
    }

    // If the cache lookup resulted in a cache miss, make sure the fields of
    // the new (or re-used) entry are all cleared.
    cache.entries = []
    cache.inputs = new Map()

    return cache
  }

  /**
   * _Visit (executorInvalidator.cpp:136-177). Returns the visited entry
   * (whose `index` field the C++ returns a pointer to) if this output should
   * be visited, or null if it has already been visited with the given mask.
   */
  private _visit(maskedOutput: VdfMaskedOutput, nextIndex: number): _Visited | null {
    const idx = VdfOutput.getIndexFromId(maskedOutput.GetOutput()!.getId())

    // Make sure the array of visited outputs is appropriately sized.
    if (idx >= this._visited.length) {
      const newSize = idx + 1
      const newCapacity = newSize + Math.floor(newSize / 2)
      for (let i = this._visited.length; i < newCapacity; ++i) {
        this._visited.push(new _Visited(this._timestamp))
      }
    }

    const visited = this._visited[idx]!

    // If the output has not been visited during this round of invalidation,
    // record it as visited.
    const mask = maskedOutput.GetMask()
    if (visited.mask.IsEmpty() || visited.timestamp !== this._timestamp) {
      visited.timestamp = this._timestamp
      visited.index = nextIndex
      visited.mask = mask
    }

    // If the output has already been visited during this round of
    // invalidation, but the mask has not been visited, record the mask.
    else if (!visited.mask.contains(mask)) {
      visited.mask = this._maskMemoizer.append(visited.mask, mask)
    }

    // The output has already been visited.
    else {
      return null
    }

    return visited
  }

  /** _Traverse (executorInvalidator.cpp:179-254). */
  private _traverse(request: readonly VdfMaskedOutput[], replayCache: _ReplayCache): void {
    // This is a new round of invalidation, so increment the timestamp.
    ++this._timestamp

    // Clear the replay cache. We will record this new traversal for replaying.
    replayCache.entries = []

    // Keep track of all the inputs that need to be processed after the
    // traversal.
    const inputs: _NodeToInputPtrVectorMap = new Map()

    // Maintain a stack for the traversal, and a priority queue for the pool
    // outputs.
    const stack: VdfMaskedOutput[] = [...request]
    const queue: _PoolQueueEntry[] = []

    // Traverse while there is work to do.
    while (stack.length !== 0 || queue.length !== 0) {
      // Process everything on the stack, until we can no longer make progress.
      while (stack.length !== 0) {
        const top = stack.pop()!

        // Figure out whether this output should be visited.
        const nextVisitIdx = replayCache.entries.length
        const visited = this._visit(top, nextVisitIdx)
        if (visited) {
          // Visit the output and invalidate it.
          const invalidated = this._traverseOutput(top, stack, queue, inputs)

          // If this is the first time this output has been visited, record
          // the invalidation for the replay cache.
          const topMask = top.GetMask()
          if (visited.index >= nextVisitIdx) {
            const entry = new _ReplayEntry(top.GetOutput()!)
            entry.masks[invalidated ? 1 : 0] = topMask
            replayCache.entries.push(entry)
          }

          // If this output has been visited before, augment the existing
          // entry in the replay cache.
          else {
            const masks = replayCache.entries[visited.index]!.masks
            const m = invalidated ? 1 : 0
            masks[m] = masks[m].IsEmpty()
              ? topMask
              : this._maskMemoizer.append(masks[m], topMask)
          }
        }
      }

      // Then pick up the pool output with the highest priority. This is the
      // output highest up in the pool chain.
      if (queue.length !== 0) {
        const top = queue.shift()!
        stack.push(top.value)
      }
    }

    // Now, process all relevant inputs encountered during the traversal.
    VdfNodeProcessInvalidationInterface.processInvalidation(this._executor, inputs)

    // Store the processed inputs in the replay cache.
    replayCache.inputs = inputs
  }

  /** _TraverseOutput (executorInvalidator.cpp:256-311). */
  private _traverseOutput(
    maskedOutput: VdfMaskedOutput,
    stack: VdfMaskedOutput[],
    queue: _PoolQueueEntry[],
    inputs: _NodeToInputPtrVectorMap): boolean {
    // Invalidate the output. Stop the traversal if _InvalidateOutput returns
    // false, i.e. the output is already invalid for the given mask.
    const output = maskedOutput.GetOutput()!
    const mask = maskedOutput.GetMask()
    if (!this._executor._invalidateOutput(output, mask)) {
      return false
    }

    // Retrieve the dependencies for this output and mask.
    const dependencies = this._getDependencies(maskedOutput)

    // Populate the stack with all the dependent non-pool outputs.
    stack.push(...dependencies.outputs)

    // Populate the queue with all the dependent pool outputs.
    for (const poolDependency of dependencies.poolOutputs) {
      const pci = poolDependency.poolChainIndex
      // std::map::insert: find the insertion point (lower bound).
      let lo = 0
      let hi = queue.length
      while (lo < hi) {
        const mid = (lo + hi) >>> 1
        if (queue[mid]!.key.lessThan(pci)) {
          lo = mid + 1
        } else {
          hi = mid
        }
      }
      const existing = queue[lo]
      if (existing === undefined || pci.lessThan(existing.key)) {
        queue.splice(lo, 0, { key: pci, value: poolDependency.maskedOutput })
      }

      // If there is already an entry for the dependent pool output, we need
      // to append the traversal mask to the queued output.
      else {
        const queuedOutput = existing.value
        existing.value = new VdfMaskedOutput(
          queuedOutput.GetOutput(),
          this._maskMemoizer.append(
            queuedOutput.GetMask(), poolDependency.maskedOutput.GetMask()))
      }
    }

    // Populate the list of inputs to process after the traversal, if any.
    // The list is bucketed by node.
    let currentNode: VdfNode | null = null
    let currentInputs: VdfInput[] | null = null
    for (const input of dependencies.inputs) {
      const node = input.getNode()
      if (currentNode !== node || !currentInputs) {
        currentNode = node
        currentInputs = inputs.get(node) ?? null
        if (!currentInputs) {
          currentInputs = []
          inputs.set(node, currentInputs)
        }
      }
      currentInputs.push(input)
    }

    return true
  }

  /** _Replay (executorInvalidator.cpp:313-424). */
  private _replay(replayCache: _ReplayCache): boolean {
    // If there is no replay cache there is nothing to replay.
    const entries = replayCache.entries
    if (entries.length === 0) {
      return false
    }

    const executor = this._executor
    let replayable = true

    // First, let's figure out if we can even replay this cached invalidation
    // traversal. We can only do so if every entry that has previously been
    // invalidated is now valid again.
    WorkParallelForN(entries.length, (b, e) => {
      for (let i = b; i !== e; ++i) {
        if (!replayable) {
          break
        }

        const output = entries[i]!.output
        const masks = entries[i]!.masks

        // We expect the output to already be invalid for the mask with which
        // the invalidation previously returned false.
        const outputId = output.getId()
        if (!masks[0].IsEmpty() && !executor._isOutputInvalid(outputId, masks[0])) {
          replayable = false
          break
        }

        // We expect the output to still be valid for the mask with which the
        // invalidation previously returned true.
        if (!masks[1].IsEmpty() && executor._isOutputInvalid(outputId, masks[1])) {
          replayable = false
          break
        }
      }
    })

    if (!replayable) {
      return false
    }

    // Second, let's replay the actual traversal and invalidate all the
    // outputs that were previously invalidated.
    WorkWithScopedParallelism(() => {
      const dispatcher = new WorkDispatcher()
      // Invalidate all the outputs in parallel.
      dispatcher.run(() => {
        WorkParallelForN(entries.length, (b, e) => {
          for (let i = b; i !== e; ++i) {
            const output = entries[i]!.output
            const masks = entries[i]!.masks

            if (!masks[0].IsEmpty()) {
              executor._invalidateOutput(output, masks[0])
            }

            if (!masks[1].IsEmpty()) {
              executor._invalidateOutput(output, masks[1])
            }
          }
        })
      })

      // Process invalidation for all the recorded inputs.
      const inputs = replayCache.inputs
      if (inputs.size !== 0) {
        dispatcher.run(() => {
          VdfNodeProcessInvalidationInterface.processInvalidation(executor, inputs)
        })
      }

      // ~WorkDispatcher waits for its tasks.
      dispatcher.Wait()
    })

    return true
  }

  /** _GetDependencies (executorInvalidator.cpp:426-444). */
  private _getDependencies(maskedOutput: VdfMaskedOutput): _Dependencies {
    const hash = VdfMaskedOutput.Hash(maskedOutput)
    let bucket = this._dependencyMap.get(hash)
    if (bucket) {
      for (const entry of bucket) {
        if (entry.key.Equals(maskedOutput)) {
          return entry.value
        }
      }
    } else {
      bucket = []
      this._dependencyMap.set(hash, bucket)
    }

    // Create a new entry if there are no cached dependencies, and compute the
    // dependencies once.
    const dependencies: _Dependencies = { outputs: [], poolOutputs: [], inputs: [] }
    bucket.push({ key: maskedOutput, value: dependencies })
    this._computeDependencies(maskedOutput, dependencies)
    return dependencies
  }

  /** _ComputeDependencies (executorInvalidator.cpp:446-500). */
  private _computeDependencies(
    maskedOutput: VdfMaskedOutput, dependencies: _Dependencies): void {
    const output = maskedOutput.GetOutput()!
    const mask = maskedOutput.GetMask()

    // Look at all the outgoing connections on this output.
    const nodeDependencies: VdfMaskedOutput[] = []
    for (const connection of output.getConnections()) {
      // Skip all connections where the connection mask is not overlapping
      // with the traversal mask.
      const connectionMask = connection.GetMask()
      if (connectionMask.isAllZeros() || !connectionMask.overlaps(mask)) {
        continue
      }

      // If the targeted node is one that must be processed after the
      // traversal, let's record the targeted input as a dependency.
      const node = connection.getTargetNode()
      if (node instanceof VdfNodeProcessInvalidationInterface) {
        dependencies.inputs.push(connection.getTargetInput())
      }

      // Compute the masked output dependencies given the connection and
      // traversal mask incoming on the targeted node.
      node.computeOutputDependencyMasks(connection, mask, nodeDependencies)

      // Iterate over all of the dependent masked outputs.
      for (const dependency of nodeDependencies) {
        // If the dependent output is a pool output, insert its pool chain
        // index (the priority) and the output into the pool dependencies.
        if (Vdf_IsPoolOutput(dependency.GetOutput()!)) {
          const pci = node.getNetwork().getPoolChainIndex(dependency.GetOutput()!)
          dependencies.poolOutputs.push({ poolChainIndex: pci, maskedOutput: dependency })
        }

        // Otherwise, insert it into the list of dependent non-pool outputs.
        else {
          dependencies.outputs.push(dependency)
        }
      }

      // Clear the list of dependent outputs for the next iteration.
      nodeDependencies.length = 0
    }
  }
}

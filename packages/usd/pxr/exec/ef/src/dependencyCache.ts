// Ported from OpenUSD 26.11.1: pxr/exec/ef/dependencyCache.cpp,
//  pxr/exec/ef/dependencyCache.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/ef/dependencyCache.h and
// pxr/exec/ef/dependencyCache.cpp.
//
// Single-threaded (openexec-x1.md section 5): the tbb concurrent vector and
// thread-local containers become arrays, atomics plain fields.

import { TF_VERIFY, Token as TfToken } from 'typescript-usd/tf'
import { WorkParallelForEach, WorkParallelForN } from 'typescript-usd/work'

import { TfBits } from 'typescript-usd/tf'

import type { VdfConnection } from 'typescript-usd/vdf'
import type { VdfInput } from 'typescript-usd/vdf'
import { VdfMask } from 'typescript-usd/vdf'
import { VdfMaskedOutput } from 'typescript-usd/vdf'
import {
  Vdf_MaskedOutputVectorKey,
  VdfGetMaskedOutputVectorNetwork,
  VdfSortAndUniqueMaskedOutputVector,
  type VdfMaskedOutputVector,
} from 'typescript-usd/vdf'
import type { VdfNetwork } from 'typescript-usd/vdf'
import { VdfNode } from 'typescript-usd/vdf'
import { VdfNodeSet } from 'typescript-usd/vdf'
import type { VdfOutput } from 'typescript-usd/vdf'
import { VdfSparseOutputTraverser } from 'typescript-usd/vdf'
import type { VdfId, VdfOutputToMaskMap } from 'typescript-usd/vdf'

/** Struct that represents a connection that may or may not exist (dependencyCache.h:170-192). */
class _Connection {
  constructor(
    readonly sourceNodeId: VdfId,
    readonly outputName: TfToken,
    readonly targetNodeId: VdfId,
    readonly inputName: TfToken,
  ) {}

  /**
   * Returns this connection, if it exists in the given network; otherwise
   * null (dependencyCache.cpp:577-620).
   */
  getConnection(network: VdfNetwork): VdfConnection | null {
    const sourceNode = network.getNodeById(this.sourceNodeId)
    if (!sourceNode) {
      return null
    }
    const targetNode = network.getNodeById(this.targetNodeId)
    if (!targetNode) {
      return null
    }
    const output = sourceNode.getOptionalOutput(this.outputName)
    if (!output) {
      return null
    }
    const input = targetNode.getInput(this.inputName)
    if (!input) {
      return null
    }

    // Attempt to find the connection, starting from whichever end has the
    // fewest connections.
    if (input.getConnections().length < output.getConnections().length) {
      for (const connection of input.getConnections()) {
        if (connection.getSourceOutput() === output) {
          return connection
        }
      }
    } else {
      for (const connection of output.getConnections()) {
        if (connection.getTargetInput() === input) {
          return connection
        }
      }
    }
    return null
  }
}

/** The cache entry stored for each traversal (dependencyCache.h:133-217). */
class _Entry {
  // The resulting output dependencies.
  outputDeps: VdfOutputToMaskMap = new Map()

  // The resulting node dependencies.
  nodeDeps: VdfNode[] = []

  // Any newly added connections that may affect this traversal. If this is
  // non-empty when the entry is queried, the traversal must be
  // incrementally updated.
  newConnections: _Connection[] = []

  // Every output and mask encountered during the traversal. The masks may
  // be empty, to signify that an output mask couldn't be inferred.
  outputRefs: VdfOutputToMaskMap = new Map()

  // Every node encountered during the traversal.
  nodeRefs: TfBits = new TfBits()

  // The number of outputs for each node at the time of the traversal.
  nodeNumOutputs: number[] = []

  // Incrementally update this traversal?
  readonly updateIncrementally: boolean

  // Set to false when the entry is fully invalid.
  private _valid = true

  constructor(updateIncrementally: boolean) {
    this.updateIncrementally = updateIncrementally
  }

  // Returns true if the traversal contains the specified node.
  ContainsNode(node: VdfNode): boolean {
    const nodeIndex = VdfNode.getIndexFromId(node.getId())
    return this.nodeRefs.getSize() > nodeIndex && this.nodeRefs.isSet(nodeIndex)
  }

  isValid(): boolean {
    return this._valid
  }

  invalidate(): void {
    this._valid = false
  }
}

/**
 * EfDependencyCache (dependencyCache.h:44-282): caches output traversals by
 * associating an input request with a set of stored output dependencies, as
 * determined by a predicate function.
 */
export class EfDependencyCache {
  // The cache is a map from VdfMaskedOutputVector to stored entry
  // (dependencyCache.h:272-277), keyed by Vdf_MaskedOutputVectorKey.
  private readonly _cache = new Map<string, _Entry>()

  // The predicate function.
  private readonly _predicate: EfDependencyCache.PredicateFunction

  /** Constructor (dependencyCache.cpp:21-25). */
  constructor(predicate: EfDependencyCache.PredicateFunction) {
    this._predicate = predicate
  }

  /**
   * Finds the output dependencies associated with the given request
   * (dependencyCache.cpp:29-35). The masks may be empty, signifying an
   * output reachable from `outputs` whose mask is unknown.
   */
  findOutputs(
    outputs: VdfMaskedOutputVector,
    updateIncrementally: boolean,
  ): VdfOutputToMaskMap {
    return this._find(outputs, updateIncrementally).outputDeps
  }

  /** Finds the node dependencies associated with the given request (dependencyCache.cpp:37-43). */
  findNodes(
    outputs: VdfMaskedOutputVector,
    updateIncrementally: boolean,
  ): readonly VdfNode[] {
    return this._find(outputs, updateIncrementally).nodeDeps
  }

  /** Invalidates all cached dependencies (dependencyCache.cpp:45-55). */
  invalidate(): void {
    if (this._cache.size === 0) {
      return
    }

    this._cache.clear()
  }

  /**
   * Invalidates all traversals dependent on this connection
   * (dependencyCache.cpp:57-85).
   */
  willDeleteConnection(connection: VdfConnection): void {
    if (this._cache.size === 0) {
      return
    }

    // Invalidate all traversals which followed this connection by
    // traversing the source, as well as the target nodes.
    for (const entry of this._cache.values()) {
      if (!entry.isValid()) {
        continue
      }

      // If the traversal contains both the source and target nodes, the
      // entry must be entirely invalidated, since deleting connections
      // cannot be incrementally updated. Otherwise the connection isn't in
      // the cached traversal and can be ignored.
      if (entry.ContainsNode(connection.getSourceNode()) &&
          entry.ContainsNode(connection.getTargetNode())) {
        entry.invalidate()
      }
    }
  }

  /**
   * Invalidates all traversals dependent on this new connection
   * (dependencyCache.cpp:87-134).
   */
  didConnect(connection: VdfConnection): void {
    if (this._cache.size === 0) {
      return
    }

    // Record the new connection with each traversal which includes the
    // source node. Whether the source output was included in the traversal,
    // and whether the masks overlap, is checked later. Entries which are not
    // incrementally updated are dropped here.
    for (const entry of this._cache.values()) {
      if (!entry.isValid()) {
        continue
      }

      // If the traversal doesn't contain the source node, the addition of
      // this connection can't affect the cached traversal.
      if (!entry.ContainsNode(connection.getSourceNode())) {
        continue
      }

      // If this entry is not being incrementally updated, invalidate it
      // entirely.
      if (!entry.updateIncrementally) {
        entry.invalidate()
        continue
      }

      // Otherwise, record the information that identifies the new
      // connection; the cached traversal is updated lazily.
      if (connection.GetMask().isAnySet()) {
        entry.newConnections.push(new _Connection(
          connection.getSourceNode().getId(),
          // TfToken(): vdf's VdfOutput/VdfInput.GetName return plain strings.
          TfToken(connection.getSourceOutput().getName()),
          connection.getTargetNode().getId(),
          TfToken(connection.getTargetInput().getName())))
      }
    }
  }

  // dependencyCache.cpp:137-167.
  private _find(
    outputs: VdfMaskedOutputVector,
    updateIncrementally: boolean,
  ): _Entry {
    // Look up the entry in the cache and return the cached result, if any.
    const sortedOutputs: VdfMaskedOutputVector = [...outputs]
    VdfSortAndUniqueMaskedOutputVector(sortedOutputs)

    const key = Vdf_MaskedOutputVectorKey(sortedOutputs)
    const entry = this._cache.get(key)
    if (entry !== undefined) {
      // If the entry is invalid, remove it from the map.
      if (!entry.isValid()) {
        this._cache.delete(key)
      }

      // Otherwise, return the cached entry if there aren't any new
      // connections to process.
      else if (entry.newConnections.length === 0) {
        return entry
      }
    }

    // Cache miss: populate the cache for the given outputs.
    return this._populateCache(key, sortedOutputs, updateIncrementally)
  }

  // dependencyCache.cpp:169-218.
  private _populateCache(
    key: string,
    sortedOutputs: VdfMaskedOutputVector,
    updateIncrementally: boolean,
  ): _Entry {
    // Insert a new entry into the cache map, unless one exists.
    let entry = this._cache.get(key)
    if (entry === undefined) {
      entry = new _Entry(updateIncrementally)
      this._cache.set(key, entry)
    }

    // If the outputs is empty, bail out and return the empty set of
    // dependencies.
    if (sortedOutputs.length === 0) {
      return entry
    }

    // Make sure the bitset of referenced nodes, and the vector of number of
    // outputs per node is sufficiently large.
    const network = VdfGetMaskedOutputVectorNetwork(sortedOutputs)!
    const nodeCapacity = network.getNodeCapacity()
    if (entry.nodeRefs.getSize() < nodeCapacity) {
      entry.nodeRefs.resizeKeepContent(nodeCapacity)

      // We only need to track the number of outputs per node for
      // incrementally updated traversals.
      if (entry.updateIncrementally) {
        while (entry.nodeNumOutputs.length < nodeCapacity) {
          entry.nodeNumOutputs.push(0)
        }
      }
    }

    // Extend the existing traversal by partially traversing any new
    // connections, if the traversal is not fully invalid.
    if (entry.newConnections.length !== 0) {
      this._traversePartially(network, entry)
    }

    // Start a full re-traversal if necessary.
    else {
      this._traverse(sortedOutputs, entry)
    }

    // Return the newly populated entry.
    return entry
  }

  // dependencyCache.cpp:220-270.
  private _traverse(outputs: VdfMaskedOutputVector, entry: _Entry): void {
    // Bail out if there is nothing to do.
    if (outputs.length === 0) {
      return
    }

    // Include the nodes from the outputs in the bitset of referenced nodes,
    // and initialize the number of outputs on these nodes.
    for (const it of outputs) {
      const node = it.GetOutput()!.getNode()
      const nodeIndex = VdfNode.getIndexFromId(node.getId())
      entry.nodeRefs.Set(nodeIndex)

      // We only need to track the number of outputs per node for
      // incrementally updated traversals.
      if (entry.updateIncrementally) {
        entry.nodeNumOutputs[nodeIndex] = node.getNumOutputs()
      }
    }

    // Fill the entry with outputs and masks accumulated in the traversal.
    // The output callback is used for incrementally updated traversals only.
    // The node callback is a VdfNodeCallback, which returns void: the
    // predicate's result is discarded, as std::function<void(...)> does.
    const predicate = this._predicate
    VdfSparseOutputTraverser.traverse(
      outputs,
      entry.updateIncrementally
        ? (output: VdfOutput, mask: VdfMask, input: VdfInput | null) =>
          EfDependencyCache._outputCallback(output, mask, input, entry)
        : null,
      (node: VdfNode) => {
        EfDependencyCache._nodeCallback(node, predicate, entry)
      })

    // Make sure the vector of node dependencies is sorted and unique.
    // Upstream sorts by pointer value; here the order is by node id, which
    // is deterministic and as arbitrary to clients.
    entry.nodeDeps.sort((a, b) => a.getId() - b.getId())
    entry.nodeDeps = entry.nodeDeps.filter(
      (node, i, nodes) => i === 0 || nodes[i - 1] !== node)
  }

  // dependencyCache.cpp:272-376.
  private _traversePartially(network: VdfNetwork, entry: _Entry): void {
    // Make sure that this is an incrementally updated traversal.
    TF_VERIFY(
      entry.updateIncrementally &&
      entry.nodeNumOutputs.length === entry.nodeRefs.getSize(),
      'entry->updateIncrementally && ' +
      'entry->nodeNumOutputs.size() == entry->nodeRefs.GetSize()')

    // The outputs for the new dependencies may contain duplicate outputs!
    const dependencies: VdfMaskedOutputVector = []

    // Gather the dependencies for the partial traversal across the new
    // connections.
    const extendedNodes = new VdfNodeSet()
    const skipTraversal = new VdfNodeSet()
    for (const connection of entry.newConnections) {
      const c = connection.getConnection(network)
      if (!c) {
        continue
      }

      // Gather the dependencies across the new connection, if the source
      // output is included in the original traversal.
      const sourceOutputVisited =
        this._gatherDependenciesForNewConnection(entry, c, dependencies)

      // If the node at the source side of the connection has been extended
      // with new outputs, all the dependencies of that node must be
      // re-gathered: the new outputs may become part of this traversal.
      if (!sourceOutputVisited) {
        const sourceNode = c.getSourceNode()
        const sourceNodeIndex = VdfNode.getIndexFromId(sourceNode.getId())
        const numOutputs = entry.nodeNumOutputs[sourceNodeIndex]
        if (sourceNode.getNumOutputs() !== numOutputs) {
          // When the new output has no dependencies (ie. a sharing node
          // output that doesn't depend on any interface inputs), nothing
          // needs updating.
          if (!extendedNodes.contains(sourceNode)) {
            const sourceMaskedOutput = c.getSourceMaskedOutput()
            if (sourceNode.computeInputDependencyMasks(
              sourceMaskedOutput, false /* skipAssoc. */).length === 0) {
              skipTraversal.insert(sourceNode)
              continue
            }
            extendedNodes.insert(sourceNode)
            skipTraversal.remove(sourceNode)
          }
        }
      }
    }

    // Reset nodeNumOutputs[] for all nodes that were extended but didn't add
    // any input dependencies. Usually, this is an empty node set.
    if (!skipTraversal.IsEmpty()) {
      for (const nodeIndex of skipTraversal) {
        const node = network.getNode(nodeIndex)!
        entry.nodeNumOutputs[nodeIndex] = node.getNumOutputs()
      }
    }

    // Gather dependencies for all extended nodes, in one vectorized go.
    for (const nodeIndex of extendedNodes) {
      const node = network.getNode(nodeIndex)!
      this._gatherDependenciesForExtendedNode(entry, node, dependencies)
    }

    // The partial outputs from which to start this new traversal in order to
    // extend the existing one.
    const sortedoutputs: VdfMaskedOutputVector = []

    // The outputs with dependencies may contain duplicate outputs, so filter
    // those in order to speed up the actual traversal.
    if (dependencies.length > 1) {
      // Gather all unique outputs and accumulate their masks.
      const uniqueOutputs = new Map<VdfOutput, VdfMask>()
      for (const it of dependencies) {
        const output = it.GetOutput()!
        uniqueOutputs.set(output, _SetOrAppend(uniqueOutputs.get(output), it.GetMask()))
      }

      // Add all the unique outputs and accumulated masks to the outputs for
      // the partial traversal.
      for (const [output, mask] of uniqueOutputs) {
        sortedoutputs.push(new VdfMaskedOutput(output, mask))
      }
    }

    // Extend the existing traversal with new dependencies picked up through
    // the sortedoutputs. If those remain empty, use the gathered
    // dependencies instead.
    this._traverse(sortedoutputs.length === 0 ? dependencies : sortedoutputs, entry)

    // Clear the newly added connections after the traversal: the callbacks
    // use them as an indication of whether the traversal is extending an
    // existing one.
    entry.newConnections = []
  }

  // dependencyCache.cpp:378-422.
  private _gatherDependenciesForNewConnection(
    entry: _Entry,
    connection: VdfConnection,
    dependencies: VdfMaskedOutputVector,
  ): boolean {
    // Find the traversed mask, if the output was included in the existing
    // traversal.
    const ref = entry.outputRefs.get(connection.getSourceOutput())

    // If the output is not included in the existing traversal, bail out.
    if (ref === undefined) {
      return false
    }

    // Make sure that the mask of the new connection overlaps with the
    // traversed mask at the source output. An empty cached mask means that
    // nothing was connected to the output when it was traversed, so treat it
    // as an all-ones mask the size of the connection's mask.
    if (ref.IsEmpty() || ref.overlaps(connection.GetMask())) {
      // The node targeted by the connection is part of the traversal, but
      // the traversal outputs will be built for the target node's outputs.
      // Hence, include the target node by invoking the predicate.
      this._predicate(
        connection.getTargetNode(), entry.outputDeps, entry.nodeDeps)

      // Collect all the outputs dependent on the traversed subset of the
      // connection and source output masks, and include those outputs in the
      // partial outputs.
      const inputMask = ref.IsEmpty()
        ? connection.GetMask() : ref.and(connection.GetMask())
      connection.getTargetNode().computeOutputDependencyMasks(
        connection, inputMask, dependencies)
    }

    // The source output is included in the existing traversal.
    return true
  }

  // dependencyCache.cpp:424-488.
  private _gatherDependenciesForExtendedNode(
    entry: _Entry,
    node: VdfNode,
    dependencies: VdfMaskedOutputVector,
  ): void {
    // For each one of the connections, on each one of the inputs, get the
    // source output and restart the traversal from there.
    WorkParallelForEach(node.getInputsIterator(), ([, input]) => {
      const connections = input.getConnections()
      WorkParallelForN(connections.length, (f, l) => {
        for (let i = f; i !== l; ++i) {
          // Get the source output from the input connection.
          const connection = connections[i]!
          const output = connection.getSourceOutput()

          // If the source node on the input connection isn't part of the
          // existing traversal, bail out right away.
          if (!entry.ContainsNode(output.getNode())) {
            continue
          }

          // If the source output is part of the existing traversal,
          // re-gather all the output dependencies on the current node.
          const ref = entry.outputRefs.get(output)
          if (ref !== undefined) {
            const mask = ref.IsEmpty()
              ? connection.GetMask()
              : connection.GetMask().and(ref)
            node.computeOutputDependencyMasks(connection, mask, dependencies)
          }
        }
      })
    })
  }

  // dependencyCache.cpp:490-509.
  private static _nodeCallback(
    node: VdfNode,
    predicate: EfDependencyCache.PredicateFunction,
    entry: _Entry,
  ): boolean {
    const nodeIndex = VdfNode.getIndexFromId(node.getId())

    // Insert this node into the set of referenced nodes.
    entry.nodeRefs.Set(nodeIndex)

    // Record the current number of outputs on this node, if the entry is
    // being incrementally updated.
    if (entry.updateIncrementally) {
      entry.nodeNumOutputs[nodeIndex] = node.getNumOutputs()
    }

    // Call the dependency predicate.
    return predicate(node, entry.outputDeps, entry.nodeDeps)
  }

  // dependencyCache.cpp:511-575.
  private static _outputCallback(
    output: VdfOutput,
    mask: VdfMask,
    _input: VdfInput | null,
    entry: _Entry,
  ): boolean {
    const hasConnections = output.getConnections().length !== 0

    // Insert this output as having been visited. If this output has no
    // connections, store an empty mask: without connections the size of the
    // output's mask can't be reliably determined. Reachability queries are
    // still answered correctly, and incremental updates don't end up with
    // disagreeing mask sizes.
    const cachedMask = entry.outputRefs.get(output)
    const emplaced = cachedMask === undefined
    if (emplaced) {
      entry.outputRefs.set(output, hasConnections ? mask : new VdfMask())
    }

    // Has this output been visited before?
    if (!emplaced && hasConnections) {
      // If this is a partial traversal, bail out if this output has already
      // been visited with the given mask.
      const isPartialTraversal = entry.newConnections.length !== 0
      if (isPartialTraversal) {
        // An empty old mask means nothing was connected to the outputs the
        // last time this node was visited.
        if (!cachedMask.IsEmpty() && cachedMask.contains(mask)) {
          return false
        }
      }

      if (cachedMask.IsEmpty()) {
        // Replace the empty mask with the mask on the connection that got
        // us here.
        entry.outputRefs.set(output, mask)
      } else {
        // Otherwise, append the specified mask to the traversal mask.
        entry.outputRefs.set(output, cachedMask.or(mask))
      }
    } else if (!emplaced) {
      // An entry already existed, but there are no connections now. Clear
      // out the cached mask, since the output mask can't be reliably
      // determined without connections.
      entry.outputRefs.set(output, new VdfMask())
    }

    // Continue the traversal.
    return true
  }
}

export declare namespace EfDependencyCache {
  /**
   * The predicate function that determines the cached dependencies
   * (dependencyCache.h:55-59). Takes the node currently being visited, and
   * the result containers to insert output and node dependencies into.
   * Returns false to stop the traversal at the current branch, true to
   * continue.
   */
  type PredicateFunction = (
    node: VdfNode,
    outputDeps: VdfOutputToMaskMap,
    nodeDeps: VdfNode[],
  ) => boolean
}

/**
 * @internal VdfMask::SetOrAppend (mask.h:385-393) on a map value that may not
 * exist yet (a default-constructed, empty mask). Returns the new mask;
 * neither argument is modified.
 */
export function _SetOrAppend(mask: VdfMask | undefined, rhs: VdfMask): VdfMask {
  if (mask === undefined || mask.IsEmpty()) {
    return rhs
  }
  return mask.or(rhs)
}

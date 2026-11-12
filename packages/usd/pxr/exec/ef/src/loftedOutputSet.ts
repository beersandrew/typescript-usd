// Ported from OpenUSD 26.11.1: pxr/exec/ef/loftedOutputSet.cpp,
//  pxr/exec/ef/loftedOutputSet.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/ef/loftedOutputSet.h and
// pxr/exec/ef/loftedOutputSet.cpp.
//
// Single-threaded (openexec-x1.md section 5): the tbb::concurrent_hash_map
// is a Map and the atomic reference counts a Uint32Array.

import { WorkParallelForN } from 'typescript-usd/work'

import type { VdfMask } from 'typescript-usd/vdf'
import { VdfMaskedOutput } from 'typescript-usd/vdf'
import type { VdfMaskedOutputVector } from 'typescript-usd/vdf'
import type { VdfNetwork } from 'typescript-usd/vdf'
import { VdfNode } from 'typescript-usd/vdf'
import type { VdfOutput } from 'typescript-usd/vdf'
import type { VdfId, VdfOutputToMaskMap } from 'typescript-usd/vdf'
import { _SetOrAppend } from './dependencyCache.ts'

/**
 * Ef_LoftedOutputSet (loftedOutputSet.h:35-102): tracks the set of lofted
 * outputs (outputs whose values were sourced from the page cache during
 * evaluation) on behalf of EfPageCacheBasedExecutor.
 */
export class Ef_LoftedOutputSet {
  // The outputs which had their values sourced from the page cache during
  // evaluation (or getting of output values), keyed by output id, kept so
  // that they can later be properly invalidated (loftedOutputSet.h:89-93).
  private readonly _loftedOutputs = new Map<VdfId, VdfMask>()

  // Node reference counts accelerating lookups into _loftedOutputs
  // (loftedOutputSet.h:95-97).
  private _loftedNodeRefs: Uint32Array = new Uint32Array(0)

  // The size of _loftedNodeRefs, which grows to accommodate the network's
  // maximum capacity (loftedOutputSet.h:99-101).
  private _numLoftedNodeRefs = 0

  /** Returns the number of outputs lofted into the page cache (loftedOutputSet.h:45-47). */
  getSize(): number {
    return this._loftedOutputs.size
  }

  /**
   * Allocates storage for the maximum capacity of the network
   * (loftedOutputSet.cpp:156-181). Callers must size the set to the network
   * before adding outputs.
   */
  resize(network: VdfNetwork): void {
    // This array is over-allocated to accommodate the maximum network
    // capacity.
    const newSize = network.getNodeCapacity()
    if (newSize > this._numLoftedNodeRefs) {
      const newReferences = new Uint32Array(newSize)

      // Copy all the existing entries into the new array; the tail values
      // are zero.
      newReferences.set(this._loftedNodeRefs.subarray(0, this._numLoftedNodeRefs))

      this._loftedNodeRefs = newReferences
    }
    this._numLoftedNodeRefs = newSize
  }

  /**
   * Adds an output to the set of lofted outputs. Returns true on success
   * (loftedOutputSet.cpp:48-89).
   */
  add(output: VdfOutput, mask: VdfMask): boolean {
    // First make sure that the output can be lofted. _Run() resizes the
    // _loftedNodeRefs array, but we may end up here before having called
    // run (e.g. a client calling GetOutputValue() on this executor).
    const node = output.getNode()
    const nodeIndex = VdfNode.getIndexFromId(node.getId())
    if (this._numLoftedNodeRefs <= nodeIndex) {
      return false
    }

    // Try to insert the output and mask into the set of lofted outputs. If
    // the output had previously been inserted, simply append the mask.
    const existing = this._loftedOutputs.get(output.getId())
    if (existing !== undefined) {
      this._loftedOutputs.set(output.getId(), _SetOrAppend(existing, mask))
      return true
    }
    this._loftedOutputs.set(output.getId(), mask)

    // If this is the first time this output is being inserted into the map,
    // increment the reference count of the node that owns the output.
    ++this._loftedNodeRefs[nodeIndex]!

    // Success.
    return true
  }

  /** Removes an output from the set of lofted outputs (loftedOutputSet.cpp:91-135). */
  remove(outputId: VdfId, nodeId: VdfId, mask: VdfMask): void {
    // If the map of lofted outputs remains empty, bail out right away.
    if (this._loftedOutputs.size === 0) {
      return
    }

    // If the node owning this output is not referenced, bail out without
    // even looking at the map.
    const nodeIndex = VdfNode.getIndexFromId(nodeId)
    if (this._numLoftedNodeRefs <= nodeIndex || !this._loftedNodeRefs[nodeIndex]) {
      return
    }

    // Lookup the output in the map.
    const lofted = this._loftedOutputs.get(outputId)
    if (lofted === undefined) {
      return
    }

    // If the entire mask is being removed, drop the output from the map and
    // decrement the reference count for the owning node.
    if (lofted.Equals(mask) || mask.IsEmpty()) {
      this._loftedOutputs.delete(outputId)
      --this._loftedNodeRefs[nodeIndex]!
    }

    // If some subset of the mask is being removed, update the stored mask.
    else {
      const remaining = lofted.subtract(mask)
      this._loftedOutputs.set(outputId, remaining)

      // If the mask is now all zeros, drop the output entirely, and
      // decrement the reference count for the node owning the output.
      if (remaining.isAllZeros()) {
        this._loftedOutputs.delete(outputId)
        --this._loftedNodeRefs[nodeIndex]!
      }
    }
  }

  /**
   * Removes all outputs on `node` from the set of lofted outputs
   * (loftedOutputSet.cpp:21-46).
   */
  removeAllOutputsForNode(node: VdfNode): void {
    // If there are no lofted outputs, bail out right away.
    if (this._loftedOutputs.size === 0) {
      return
    }

    // If the node is not referenced, bail out right away.
    const nodeIndex = VdfNode.getIndexFromId(node.getId())
    if (this._numLoftedNodeRefs <= nodeIndex || !this._loftedNodeRefs[nodeIndex]) {
      return
    }

    // Remove all outputs on the node from the set of lofted outputs.
    for (const [, output] of node.getOutputsIterator()) {
      this._loftedOutputs.delete(output.getId())
    }

    // No outputs have been lofted from this node.
    this._loftedNodeRefs[nodeIndex] = 0
  }

  /** Removes all outputs from the set of lofted outputs (loftedOutputSet.cpp:137-154). */
  clear(): void {
    if (this._loftedOutputs.size === 0 && this._numLoftedNodeRefs === 0) {
      return
    }

    this._loftedOutputs.clear()

    const loftedNodeRefs = this._loftedNodeRefs
    WorkParallelForN(this._numLoftedNodeRefs, (begin, end) => {
      loftedNodeRefs.fill(0, begin, end)
    })
  }

  /**
   * Inserts the lofted outputs in `deps` into `processedRequest`
   * (loftedOutputSet.cpp:183-237). Upstream visits `deps` in hash bucket
   * order; here in the map's iteration order.
   */
  collectLoftedDependencies(
    deps: VdfOutputToMaskMap,
    processedRequest: VdfMaskedOutputVector,
  ): void {
    // Upstream resizes the vector, fills it from index 0 and trims the tail:
    // the result holds exactly the collected outputs.
    processedRequest.length = 0

    // For each dependent output, determine if it has been lofted, and if so
    // add it to the invalidation request.
    for (const [output, depMask] of deps) {
      // Is this output's node even referenced in the set of lofted outputs?
      const idx = VdfNode.getIndexFromId(output.getNode().getId())
      if (this._numLoftedNodeRefs <= idx || !this._loftedNodeRefs[idx]) {
        continue
      }

      // If this output has been lofted, add it to the invalidation request.
      const lofted = this._loftedOutputs.get(output.getId())
      if (lofted !== undefined) {
        processedRequest.push(new VdfMaskedOutput(output, depMask.and(lofted)))
      }
    }
  }
}

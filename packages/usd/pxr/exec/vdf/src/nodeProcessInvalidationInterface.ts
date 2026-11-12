// Ported from OpenUSD 26.11.1:
//  pxr/exec/vdf/nodeProcessInvalidationInterface.cpp,
//  pxr/exec/vdf/nodeProcessInvalidationInterface.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/nodeProcessInvalidationInterface.h
// and pxr/exec/vdf/nodeProcessInvalidationInterface.cpp.
//
// Upstream nodes mix this interface in by multiple inheritance
// (`class X : public VdfNode, public VdfNodeProcessInvalidationInterface`),
// and VdfExecutorInvalidator asks `node.IsA<VdfNodeProcessInvalidationInterface>()`.
// TS has single inheritance, so a node implements the interface by defining
// a `_ProcessInvalidation(inputs, executor)` method, and
// `node instanceof VdfNodeProcessInvalidationInterface` tests for that method
// (Symbol.hasInstance below). The method is public with upstream's
// underscore name because the static ProcessInvalidation calls it (C++
// grants this through class scope).

import { TF_VERIFY } from 'typescript-usd/tf'
import { WorkParallelForEach } from 'typescript-usd/work'

import type { VdfExecutorInterface } from './executorInterface.ts'
import type { VdfInput } from './input.ts'
import type { VdfNode } from './node.ts'

/** VdfInputPtrVector (types.h:62). */
type VdfInputPtrVector = readonly VdfInput[]

/** VdfNodeToInputPtrVectorMap (types.h:94-95), keyed by node object. */
type VdfNodeToInputPtrVectorMap = ReadonlyMap<VdfNode, VdfInputPtrVector>

/**
 * VdfNodeProcessInvalidationInterface
 * (nodeProcessInvalidationInterface.h:28-66): interface class for nodes that
 * receive notification about input invalidation via a virtual method.
 */
export abstract class VdfNodeProcessInvalidationInterface {
  /** The invalidation callback on this node (nodeProcessInvalidationInterface.h:50). */
  abstract _ProcessInvalidation(
    inputs: VdfInputPtrVector, executor: VdfExecutorInterface): void

  /**
   * `instanceof` (the C++ IsA<> / dynamic_cast) holds for any object with a
   * `_ProcessInvalidation` method, since implementers derive from VdfNode.
   */
  static [Symbol.hasInstance](value: unknown): boolean {
    return typeof value === 'object' && value !== null &&
      typeof (value as { _ProcessInvalidation?: unknown })._ProcessInvalidation === 'function'
  }

  /**
   * ProcessInvalidation (nodeProcessInvalidationInterface.cpp:23-59). With a
   * map of inputs, processes invalidation on every node in the map; with a
   * node and its inputs, processes invalidation on that node.
   */
  static processInvalidation(
    executor: VdfExecutorInterface, inputs: VdfNodeToInputPtrVectorMap): void
  static processInvalidation(
    executor: VdfExecutorInterface,
    node: VdfNodeProcessInvalidationInterface,
    inputs: VdfInputPtrVector): void
  static processInvalidation(
    executor: VdfExecutorInterface,
    nodeOrInputs: VdfNodeProcessInvalidationInterface | VdfNodeToInputPtrVectorMap,
    inputs?: VdfInputPtrVector): void {
    if (nodeOrInputs instanceof Map) {
      VdfNodeProcessInvalidationInterface._processInvalidationMap(
        executor, nodeOrInputs as VdfNodeToInputPtrVectorMap)
      return
    }

    // nodeProcessInvalidationInterface.cpp:50-59
    const node = nodeOrInputs as VdfNodeProcessInvalidationInterface
    node._ProcessInvalidation(inputs ?? [], executor)
  }

  // nodeProcessInvalidationInterface.cpp:23-48
  private static _processInvalidationMap(
    executor: VdfExecutorInterface, inputs: VdfNodeToInputPtrVectorMap): void {
    if (inputs.size === 0) {
      return
    }

    // If there is only one node to process invalidation for, do it serially.
    if (inputs.size === 1) {
      VdfNodeProcessInvalidationInterface._processInvalidationForEntry(
        executor, inputs.entries().next().value!)
    }

    // If there are multiple nodes to process invalidation for, we can process
    // each node in a separate task for that work to happen in parallel.
    else {
      WorkParallelForEach(inputs.entries(), (entry) => {
        VdfNodeProcessInvalidationInterface._processInvalidationForEntry(
          executor, entry)
      })
    }
  }

  /** _ProcessInvalidationForEntry (nodeProcessInvalidationInterface.cpp:61-71). */
  protected static _processInvalidationForEntry(
    executor: VdfExecutorInterface,
    entry: readonly [VdfNode, VdfInputPtrVector]): void {
    const node: unknown = entry[0]
    if (TF_VERIFY(node instanceof VdfNodeProcessInvalidationInterface, 'node')) {
      VdfNodeProcessInvalidationInterface.processInvalidation(
        executor, node as VdfNodeProcessInvalidationInterface, entry[1])
    }
  }
}

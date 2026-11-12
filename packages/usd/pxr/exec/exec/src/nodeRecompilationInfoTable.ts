// Ported from OpenUSD 26.11.1: pxr/exec/exec/nodeRecompilationInfoTable.cpp,
//  pxr/exec/exec/nodeRecompilationInfoTable.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/nodeRecompilationInfoTable.h and
// nodeRecompilationInfoTable.cpp.
//
// The tbb::concurrent_vector<_Storage, WorkZeroAllocator<_Storage>> of
// placement-constructed infos is an array indexed by node index whose empty
// slots are null; `isInfoConstructed` is "the slot is non-null".

import { TF_VERIFY } from 'typescript-usd/tf'

import type { EsfObject } from 'typescript-usd/esf'
import type { EsfSchemaConfigKey } from 'typescript-usd/esf'
import { VdfNode } from 'typescript-usd/vdf'

import type { Exec_InputKeyVector } from './inputKey.ts'
import { Exec_NodeRecompilationInfo } from './nodeRecompilationInfo.ts'

/**
 * Manages Exec_NodeRecompilationInfo instances for each node in the network
 * (nodeRecompilationInfoTable.h:25-81).
 */
export class Exec_NodeRecompilationInfoTable {
  private readonly _storageVector: Array<Exec_NodeRecompilationInfo | null> = []

  /**
   * De-initializes recompilation info for the deleted `node` if it has any
   * (nodeRecompilationInfoTable.cpp:21-45).
   */
  willDeleteNode(node: VdfNode): void {
    const nodeIndex = VdfNode.getIndexFromId(node.getId())

    // It is possible that we never grew the vector large enough for this
    // node's index. In this case, there is no info to delete.
    if (nodeIndex >= this._storageVector.length) {
      return
    }

    // There is no info to delete if the storage at this index does not have
    // emplaced info.
    if (!this._storageVector[nodeIndex]) {
      return
    }

    // Delete the info.
    this._storageVector[nodeIndex] = null
  }

  /**
   * Sets the recompilation info for the given `node`; it can only be set
   * once per node (nodeRecompilationInfoTable.cpp:47-99).
   */
  setNodeRecompilationInfo(
    node: VdfNode,
    provider: EsfObject,
    dispatchingSchemaId: EsfSchemaConfigKey,
    inputKeys: Exec_InputKeyVector,
  ): void {
    const nodeIndex = VdfNode.getIndexFromId(node.getId())

    // Grow the vector to ensure we can store recompilation info at
    // `nodeIndex`.
    while (this._storageVector.length < nodeIndex + 1) {
      this._storageVector.push(null)
    }

    // This slot is non-null iff recompilation info has been emplaced in it,
    // in which case it is an error to re-use this storage.
    if (!TF_VERIFY(!this._storageVector[nodeIndex],
      '!storage->isInfoConstructed',
      `Cannot set recompilation info for node '${node.getDebugName()}' at ` +
      `index ${nodeIndex}, because that index is already in use.`)) {
      return
    }

    // Initialize recompilation info in the storage.
    this._storageVector[nodeIndex] = new Exec_NodeRecompilationInfo(
      provider, dispatchingSchemaId, inputKeys)
  }

  /**
   * Gets the recompilation info for the given `node`, or null if there is
   * none (nodeRecompilationInfoTable.cpp:101-121).
   */
  getNodeRecompilationInfo(node: VdfNode): Exec_NodeRecompilationInfo | null {
    const nodeIndex = VdfNode.getIndexFromId(node.getId())

    // It is possible that we never grew the vector large enough for this
    // node's index. In this case, there is no info.
    if (nodeIndex >= this._storageVector.length) {
      return null
    }

    return this._storageVector[nodeIndex] ?? null
  }
}

// Ported from OpenUSD 26.11.1: pxr/exec/vdf/isolatedSubnetwork.cpp,
//  pxr/exec/vdf/isolatedSubnetwork.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/isolatedSubnetwork.h and
// isolatedSubnetwork.cpp.
//
// A VdfIsolatedSubnetwork collects nodes and connections that are reachable
// in the input direction and not otherwise connected to the network, removes
// them from the network (sending WillDelete notices), and deletes them when
// it is destroyed.
//
// Mapping choices:
// - Destruction (~VdfIsolatedSubnetwork, isolatedSubnetwork.cpp:158-175) is
//   _Destruct(); the std::unique_ptr owners call it.
// - The isolated connection set (pxr_tsl::robin_set, ordered by pointer hash)
//   is an insertion-ordered Set, so removal notices are sent in traversal
//   order.
// - EditFilter (TfFunctionRef) is a function.

import { TF_CODING_ERROR, TF_VERIFY } from 'typescript-usd/tf'

import type { VdfConnection } from './connection.ts'
import type { VdfNetwork } from './network.ts'
import { VdfNode } from './node.ts'
import type { VdfIndex } from './types.ts'

/** VdfIsolatedSubnetwork::EditFilter (isolatedSubnetwork.h:62). */
export type VdfIsolatedSubnetwork_EditFilter = (node: VdfNode) => boolean

/** VdfIsolatedSubnetwork::ConnectionSet (isolatedSubnetwork.h:58). */
export type VdfIsolatedSubnetwork_ConnectionSet = Set<VdfConnection>

export class VdfIsolatedSubnetwork {
  private readonly _network: VdfNetwork
  private readonly _nodes: VdfNode[] = []
  private readonly _connections: VdfIsolatedSubnetwork_ConnectionSet = new Set()
  private readonly _unisolatedOutputConnections = new Map<VdfIndex, number>()
  private _removedIsolatedObjects = false

  // VdfIsolatedSubnetwork(network) (isolatedSubnetwork.cpp:152-156).
  private constructor(network: VdfNetwork) {
    this._network = network
    TF_VERIFY(this._network, '_network')
  }

  /**
   * IsolateBranch(connection, canDelete) (isolatedSubnetwork.cpp:18-39) and
   * IsolateBranch(node, canDelete) (isolatedSubnetwork.cpp:41-71): isolates
   * and removes the branch, returning the owner of the isolated objects, or
   * null.
   */
  static isolateBranch(
    connectionOrNode: VdfConnection | VdfNode | null,
    canDelete: VdfIsolatedSubnetwork_EditFilter): VdfIsolatedSubnetwork | null {
    if (connectionOrNode instanceof VdfNode) {
      const node = connectionOrNode
      if (node.hasOutputConnections()) {
        TF_CODING_ERROR('Root node has output connections.')
        return null
      }

      // If we can't delete the initial node, we bail early.
      if (!canDelete(node)) return null

      const isolated = new VdfIsolatedSubnetwork(node.getNetwork())
      if (!isolated.addIsolatedBranch(node, canDelete)) {
        isolated._destruct()
        return null
      }
      isolated.removeIsolatedObjectsFromNetwork()
      return isolated
    }

    const connection = connectionOrNode
    if (!connection) {
      TF_CODING_ERROR('Null connection')
      return null
    }

    const isolated = new VdfIsolatedSubnetwork(connection.getTargetNode().getNetwork())
    if (!isolated.addIsolatedBranch(connection, canDelete)) {
      isolated._destruct()
      return null
    }
    isolated.removeIsolatedObjectsFromNetwork()
    return isolated
  }

  /** New (isolatedSubnetwork.cpp:73-83): an empty isolated subnetwork. */
  static new(network: VdfNetwork | null): VdfIsolatedSubnetwork | null {
    if (!network) {
      TF_CODING_ERROR('Null network')
      return null
    }
    return new VdfIsolatedSubnetwork(network)
  }

  /**
   * AddIsolatedBranch(connection, canDelete) (isolatedSubnetwork.cpp:85-112)
   * and AddIsolatedBranch(node, canDelete) (isolatedSubnetwork.cpp:114-150).
   * Objects are not removed from the network until
   * RemoveIsolatedObjectsFromNetwork().
   */
  addIsolatedBranch(
    connectionOrNode: VdfConnection | VdfNode | null,
    canDelete: VdfIsolatedSubnetwork_EditFilter): boolean {
    if (connectionOrNode instanceof VdfNode) {
      const node = connectionOrNode
      if (node.getNetwork() !== this._network) {
        TF_CODING_ERROR(
          'Attempt to call AddIsolatedBranch with a node from a different ' +
          'network.')
        return false
      }
      if (this._removedIsolatedObjects) {
        TF_CODING_ERROR(
          'Attempt to call AddIsolatedBranch after calling ' +
          'RemoveIsolatedObjectsFromNetwork')
        return false
      }

      if (node.hasOutputConnections() || !canDelete(node)) return false

      for (const c of node.getInputConnections()) {
        this._traverseBranch(c, canDelete)
      }

      this._nodes.push(node)
      return true
    }

    const connection = connectionOrNode
    if (!connection) {
      TF_CODING_ERROR('Null connection')
      return false
    }
    if (connection.getTargetNode().getNetwork() !== this._network) {
      TF_CODING_ERROR(
        'Attempt to call AddIsolatedBranch with a connection from a ' +
        'different network.')
      return false
    }
    if (this._removedIsolatedObjects) {
      TF_CODING_ERROR(
        'Attempt to call AddIsolatedBranch after calling ' +
        'RemoveIsolatedObjectsFromNetwork')
      return false
    }

    this._traverseBranch(connection, canDelete)
    return true
  }

  /**
   * RemoveIsolatedObjectsFromNetwork (isolatedSubnetwork.cpp:249-267):
   * connections first, then nodes, matching VdfNetwork's notice order.
   */
  removeIsolatedObjectsFromNetwork(): void {
    for (const c of this._connections) {
      this._network._removeConnection(c)
    }

    for (const n of this._nodes) {
      this._network._removeNode(n)
    }

    this._removedIsolatedObjects = true
  }

  /** GetIsolatedNodes (isolatedSubnetwork.h:154). */
  getIsolatedNodes(): readonly VdfNode[] {
    return this._nodes
  }

  /** GetIsolatedConnections (isolatedSubnetwork.h:159). */
  getIsolatedConnections(): ReadonlySet<VdfConnection> {
    return this._connections
  }

  /** ~VdfIsolatedSubnetwork (isolatedSubnetwork.cpp:158-175). */
  _destruct(): void {
    if (!this._removedIsolatedObjects) {
      this.removeIsolatedObjectsFromNetwork()
    }

    for (const c of this._connections) {
      this._network._deleteConnection(c)
    }

    for (const n of this._nodes) {
      this._network._deleteNode(n)
    }
  }

  // _CanTraverse (isolatedSubnetwork.cpp:177-204): true once every output
  // connection of sourceNode has been reached through the isolated branch.
  private _canTraverse(
    sourceNode: VdfNode,
    canDelete: VdfIsolatedSubnetwork_EditFilter): boolean {
    if (!canDelete(sourceNode)) return false

    const index = VdfNode.getIndexFromId(sourceNode.getId())
    let count = this._unisolatedOutputConnections.get(index)
    if (count === undefined) {
      count = 0
      for (const [, output] of sourceNode.getOutputsIterator()) {
        count += output.getNumConnections()
      }
    }

    // Account for the output connection we just traversed.
    --count
    this._unisolatedOutputConnections.set(index, count)
    TF_VERIFY(count >= 0, 'count >= 0')
    return count === 0
  }

  // _TraverseBranch (isolatedSubnetwork.cpp:206-247).
  private _traverseBranch(
    connection: VdfConnection,
    canDelete: VdfIsolatedSubnetwork_EditFilter): void {
    const stack: VdfConnection[] = [connection]

    while (stack.length) {
      const currentConnection = stack.pop()!

      // Mark this connection as visited.
      if (this._connections.has(currentConnection)) continue
      this._connections.add(currentConnection)

      const sourceNode = currentConnection.getSourceNode()
      if (!this._canTraverse(sourceNode, canDelete)) continue

      // An isolated node is never re-visited.
      this._nodes.push(sourceNode)

      // Push in reverse order so the first connection is picked up first.
      const inputConnections = sourceNode.getInputConnections()
      for (let i = inputConnections.length - 1; i >= 0; --i) {
        stack.push(inputConnections[i]!)
      }
    }
  }
}

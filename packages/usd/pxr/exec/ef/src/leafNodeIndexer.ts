// Ported from OpenUSD 26.11.1: pxr/exec/ef/leafNodeIndexer.cpp,
//  pxr/exec/ef/leafNodeIndexer.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/ef/leafNodeIndexer.h and
// pxr/exec/ef/leafNodeIndexer.cpp.
//
// Single-threaded (openexec-x1.md section 5): the tbb concurrent containers
// become a Map, an Array and a FIFO array.

import { TF_AXIOM } from 'typescript-usd/tf'

import type { VdfConnection } from 'typescript-usd/vdf'
import type { VdfMask } from 'typescript-usd/vdf'
import { VdfNode } from 'typescript-usd/vdf'
import type { VdfOutput } from 'typescript-usd/vdf'
import { EfLeafNode } from './leafNode.ts'

// The data tracked for each leaf node (leafNodeIndexer.h:96-100).
interface _LeafNode {
  node: VdfNode
  output: VdfOutput
  mask: VdfMask
}

/**
 * Ef_LeafNodeIndexer (leafNodeIndexer.h:34-113): tracks leaf nodes added to
 * and removed from the network, and associates each leaf node with a unique
 * index. It also records the source output each leaf node is connected to.
 */
export class Ef_LeafNodeIndexer {
  /** Sentinel for an invalid index (leafNodeIndexer.h:43). */
  static readonly InvalidIndex: Ef_LeafNodeIndexer.Index = 0xffffffff

  // Map from VdfNode index to leaf node index (leafNodeIndexer.h:102-104).
  private readonly _indices = new Map<number, Ef_LeafNodeIndexer.Index>()

  // The tightly packed vector of leaf node data, indexed with the leaf node
  // index (leafNodeIndexer.h:106-108).
  private _nodes: _LeafNode[] = []

  // Free list of leaf node data, a FIFO queue (leafNodeIndexer.h:110-112):
  // entries before _freeListHead have been popped.
  private _freeList: Ef_LeafNodeIndexer.Index[] = []
  private _freeListHead = 0

  /** The high water mark of tracked leaf nodes (leafNodeIndexer.h:48-50). */
  getCapacity(): number {
    return this._nodes.length
  }

  /**
   * Returns the index for a given leaf node, or InvalidIndex
   * (leafNodeIndexer.h:115-121).
   */
  getIndex(node: VdfNode): Ef_LeafNodeIndexer.Index {
    const index = this._indices.get(VdfNode.getIndexFromId(node.getId()))
    return index !== undefined ? index : Ef_LeafNodeIndexer.InvalidIndex
  }

  /** Returns the node for a given index, or null (leafNodeIndexer.h:60-62). */
  getNode(index: Ef_LeafNodeIndexer.Index): VdfNode | null {
    return index < this._nodes.length ? this._nodes[index]!.node : null
  }

  /**
   * Returns the output the given leaf node index is sourcing data from, or
   * null (leafNodeIndexer.h:67-69).
   */
  getSourceOutput(index: Ef_LeafNodeIndexer.Index): VdfOutput | null {
    return index < this._nodes.length ? this._nodes[index]!.output : null
  }

  /**
   * Returns the mask at the output the given leaf node index is sourcing
   * data from, or null (leafNodeIndexer.h:74-76).
   */
  getSourceMask(index: Ef_LeafNodeIndexer.Index): VdfMask | null {
    return index < this._nodes.length ? this._nodes[index]!.mask : null
  }

  /** Invalidate the entire cache (leafNodeIndexer.cpp:18-26). */
  invalidate(): void {
    this._indices.clear()
    this._nodes = []
    this._freeList = []
    this._freeListHead = 0
  }

  /**
   * Notifies the indexer of a connection that has been deleted
   * (leafNodeIndexer.cpp:28-54).
   */
  didDisconnect(connection: VdfConnection): void {
    // Bail out if the connection does not target a leaf node.
    const leafNode = connection.getTargetNode()
    if (!EfLeafNode.isALeafNode(leafNode)) {
      return
    }

    // Find the index of the targeted node.
    const nodeIndex = VdfNode.getIndexFromId(leafNode.getId())
    const index = this._indices.get(nodeIndex)
    TF_AXIOM(index !== undefined, 'indexIt != _indices.end()')

    // Find the leaf node index using the node index.
    TF_AXIOM(index !== Ef_LeafNodeIndexer.InvalidIndex, 'index != InvalidIndex')

    // The index is now unassigned.
    this._indices.set(nodeIndex, Ef_LeafNodeIndexer.InvalidIndex)

    // Push the index onto the free list.
    this._freeList.push(index)
  }

  /**
   * Notifies the indexer of a newly added connection
   * (leafNodeIndexer.cpp:56-103).
   */
  didConnect(connection: VdfConnection): void {
    // Bail out if the connection does not target a leaf node.
    const leafNode = connection.getTargetNode()
    if (!EfLeafNode.isALeafNode(leafNode)) {
      return
    }

    // Find the index of the targeted node.
    const nodeIndex = VdfNode.getIndexFromId(leafNode.getId())

    // The map may already contain an entry for this node index, if the same
    // node is being re-connected, or a new leaf node aliasing a previous node
    // index is being connected.
    if (!this._indices.has(nodeIndex)) {
      this._indices.set(nodeIndex, Ef_LeafNodeIndexer.InvalidIndex)
    }

    // Get the output and mask of the connected source output.
    const output = connection.getSourceOutput()
    const mask = connection.GetMask()

    // Get the leaf node index for this node. It should be unassigned here.
    const index = this._indices.get(nodeIndex)!
    TF_AXIOM(index === Ef_LeafNodeIndexer.InvalidIndex, 'index == InvalidIndex')

    // If there is an entry on the free list, re-use that one.
    const freeIndex = this._tryPopFreeList()
    if (freeIndex !== undefined) {
      this._nodes[freeIndex] = { node: leafNode, output, mask }
      this._indices.set(nodeIndex, freeIndex)
    }

    // Otherwise append the new leaf node data entry to the vector.
    else {
      this._nodes.push({ node: leafNode, output, mask })
      this._indices.set(nodeIndex, this._nodes.length - 1)
    }
  }

  // tbb::concurrent_queue::try_pop.
  private _tryPopFreeList(): Ef_LeafNodeIndexer.Index | undefined {
    if (this._freeListHead === this._freeList.length) {
      return undefined
    }
    const index = this._freeList[this._freeListHead++]!
    if (this._freeListHead === this._freeList.length) {
      this._freeList = []
      this._freeListHead = 0
    }
    return index
  }
}

export declare namespace Ef_LeafNodeIndexer {
  /** Data type of the index (leafNodeIndexer.h:39), uint32_t. */
  type Index = number
}

// Ported from OpenUSD 26.11.1: pxr/usd/pcp/traversalCache.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Pcp_TraversalCache. Port of OpenUSD v26.08 pxr/usd/pcp/traversalCache.h:
// a strength-order traversal of a node subtree that lazily translates a path
// from the start node into each visited node and caches the result, plus a
// per-node data slot.

import type { PcpNodeRef } from './node.ts'
import { PcpNodeSubtreeIterator } from './node.ts'
import { SdfPath } from 'typescript-usd/sdf/path'

interface Entry<Data> {
  path: SdfPath | undefined
  data: Data
}

export class PcpTraversalCache<Data> {
  private readonly _cache = new Map<number, Entry<Data>>()

  constructor(
    private readonly _startNode: PcpNodeRef,
    pathInNode: SdfPath,
    private readonly _makeData: () => Data,
  ) {
    this._entry(_startNode).path = pathInNode
  }

  private _entry(node: PcpNodeRef): Entry<Data> {
    const key = node._getNodeIndex()
    let entry = this._cache.get(key)
    if (!entry) {
      entry = { path: undefined, data: this._makeData() }
      this._cache.set(key, entry)
    }
    return entry
  }

  private _translatePathsForNode(node: PcpNodeRef): SdfPath {
    const entry = this._entry(node)
    if (entry.path === undefined) {
      const parent = node.getParentNode()!
      const pathInParent = this._translatePathsForNode(parent)
      entry.path = pathInParent.isEmpty()
        ? SdfPath.emptyPath
        : node.getMapToParent().evaluate().mapTargetToSource(pathInParent)
    }
    return entry.path
  }

  // Iterates the subtree; the callback receives the node, a lazy accessor for
  // the translated path, the data slot, and a prune function. Returning true
  // stops the traversal.
  traverse(
    fn: (
      node: PcpNodeRef, pathInNode: () => SdfPath, data: Data, pruneChildren: () => void,
    ) => boolean | void,
  ): boolean {
    for (const it = new PcpNodeSubtreeIterator(this._startNode); it.node; it.next()) {
      const node = it.node
      const entry = this._entry(node)
      const stop = fn(node, () => this._translatePathsForNode(node), entry.data,
        () => it.pruneChildren())
      if (stop) return true
    }
    return false
  }
}

// Ported from OpenUSD 26.11.1: pxr/usd/pcp/primIndex_Graph.cpp,
//  pxr/usd/pcp/primIndex_Graph.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// PcpPrimIndex_Graph — the node pool behind a prim index. Port of OpenUSD
// v26.08 pxr/usd/pcp/primIndex_Graph.{h,cpp}.
//
// Nodes live in a flat pool addressed by index; parent, origin, child and
// sibling links are pool indexes. The shared portion of each node (_Node) can
// be shared between a graph and the copy made to seed a child prim index, and
// is detached on first write. The per-graph portion (_UnsharedData: site path
// and bookkeeping bits) is always copied. PcpNodeRef handles are interned per
// graph so the same node yields the same handle object; reordering the pool
// (Finalize) invalidates outstanding handles, as it does upstream.

import { PcpArcType } from './arc.ts'
import type { PcpArc } from './arc.ts'
import type { PcpError } from './errors.ts'
import { PcpErrorType, pcpErrorCapacityExceeded } from './errors.ts'
import type { PcpLayerStack } from './layerStack.ts'
import type { PcpLayer } from './layerStackIdentifier.ts'
import { PcpMapExpression } from './mapExpression.ts'
import { PcpNodeRef } from './node.ts'
import type { PcpLayerStackSite } from './site.ts'
import type { SdfPath } from 'typescript-usd/sdf/path'
import { pcpCompareSiblingNodeStrength } from './strengthOrdering.ts'

/** @internal Upstream _Node::_invalidNodeIndex (uint16_t(~0)). */
export const PCP_INVALID_NODE_INDEX = -1
const NODE_INDEX_CAPACITY = 0xffff
const DEPTH_CAPACITY = 1 << 16

export type PcpPermission = 'public' | 'private'

/** @internal Pcp_CompressedSdSite (types.h:159-171): a prim stack entry. */
export interface Pcp_CompressedSdSite {
  readonly nodeIndex: number
  readonly layerIndex: number
}

/** SdfSite (sdf/site.h): a layer and a path in it. */
export interface PcpSdSite {
  readonly layer: PcpLayer
  readonly path: SdfPath
}

/** @internal The shareable node record (primIndex_Graph.h _Node). */
export class _PcpGraphNode {
  layerStack!: PcpLayerStack
  mapToRoot: PcpMapExpression = PcpMapExpression.identity()
  mapToParent: PcpMapExpression = PcpMapExpression.identity()
  arcParentIndex = PCP_INVALID_NODE_INDEX
  arcOriginIndex = PCP_INVALID_NODE_INDEX
  firstChildIndex = PCP_INVALID_NODE_INDEX
  lastChildIndex = PCP_INVALID_NODE_INDEX
  prevSiblingIndex = PCP_INVALID_NODE_INDEX
  nextSiblingIndex = PCP_INVALID_NODE_INDEX
  arcSiblingNumAtOrigin = 0
  arcNamespaceDepth = 0
  arcType: PcpArcType = PcpArcType.Root
  permission: PcpPermission = 'public'
  hasSymmetry = false
  hasValueClips = false
  inert = false
  permissionDenied = false

  clone(): _PcpGraphNode {
    const n = new _PcpGraphNode()
    n.layerStack = this.layerStack
    n.mapToRoot = this.mapToRoot
    n.mapToParent = this.mapToParent
    n.arcParentIndex = this.arcParentIndex
    n.arcOriginIndex = this.arcOriginIndex
    n.firstChildIndex = this.firstChildIndex
    n.lastChildIndex = this.lastChildIndex
    n.prevSiblingIndex = this.prevSiblingIndex
    n.nextSiblingIndex = this.nextSiblingIndex
    n.arcSiblingNumAtOrigin = this.arcSiblingNumAtOrigin
    n.arcNamespaceDepth = this.arcNamespaceDepth
    n.arcType = this.arcType
    n.permission = this.permission
    n.hasSymmetry = this.hasSymmetry
    n.hasValueClips = this.hasValueClips
    n.inert = this.inert
    n.permissionDenied = this.permissionDenied
    return n
  }

  // _Node::SetArc (primIndex_Graph.cpp:75-93).
  setArc(arc: PcpArc): void {
    this.arcType = arc.type
    this.arcSiblingNumAtOrigin = arc.siblingNumAtOrigin
    this.arcNamespaceDepth = arc.namespaceDepth
    this.arcParentIndex = arc.parent ? arc.parent._getNodeIndex() : PCP_INVALID_NODE_INDEX
    this.arcOriginIndex = arc.origin ? arc.origin._getNodeIndex() : PCP_INVALID_NODE_INDEX
    if (arc.parent) {
      this.mapToParent = arc.mapToParent
      this.mapToRoot = arc.parent.getMapToRoot().compose(this.mapToParent)
    } else {
      this.mapToParent = this.mapToRoot = PcpMapExpression.identity()
    }
  }
}

/** @internal Per-graph node data (primIndex_Graph.h _UnsharedData). */
export class _PcpGraphUnsharedData {
  restrictionDepth = 0
  hasSpecs = false
  culled = false
  isDueToAncestor = false
  hasTransitiveDirectArc = false
  hasTransitiveAncestralArc = false

  constructor(public sitePath: SdfPath) {}

  clone(): _PcpGraphUnsharedData {
    const u = new _PcpGraphUnsharedData(this.sitePath)
    u.restrictionDepth = this.restrictionDepth
    u.hasSpecs = this.hasSpecs
    u.culled = this.culled
    u.isDueToAncestor = this.isDueToAncestor
    u.hasTransitiveDirectArc = this.hasTransitiveDirectArc
    u.hasTransitiveAncestralArc = this.hasTransitiveAncestralArc
    return u
  }
}

// The PcpRangeType enum (types.h) used by PcpPrimIndex::GetNodeRange.
export enum PcpRangeType {
  Root,
  Inherit,
  Variant,
  Reference,
  Payload,
  Specialize,
  All,
  WeakerThanRoot,
  StrongerThanPayload,
  Invalid,
}

function arcTypeForRangeType(rangeType: PcpRangeType): PcpArcType {
  switch (rangeType) {
    case PcpRangeType.Root: return PcpArcType.Root
    case PcpRangeType.Inherit: return PcpArcType.Inherit
    case PcpRangeType.Variant: return PcpArcType.Variant
    case PcpRangeType.Reference: return PcpArcType.Reference
    case PcpRangeType.Payload: return PcpArcType.Payload
    case PcpRangeType.Specialize: return PcpArcType.Specialize
    default: return PcpArcType.Root
  }
}

// Stand-in for the shared_ptr use count on the node pool.
interface PoolShare { refs: number }

let nextGraphId = 1

export class PcpPrimIndex_Graph {
  /** @internal Stable identity for ordering handles across graphs. */
  readonly _id = nextGraphId++
  /** @internal */ _nodes: _PcpGraphNode[]
  private _share: PoolShare
  /** @internal */ _unshared: _PcpGraphUnsharedData[]
  private _refs: (PcpNodeRef | undefined)[] = []
  private _hasPayloads = false
  private _hasNewNodes = false
  private _instanceable = false
  private _finalized = false
  private readonly _usd: boolean

  private constructor(
    usd: boolean, nodes: _PcpGraphNode[], share: PoolShare,
    unshared: _PcpGraphUnsharedData[],
  ) {
    this._usd = usd
    this._nodes = nodes
    this._share = share
    this._unshared = unshared
  }

  // PcpPrimIndex_Graph::New(rootSite, usd).
  static new(rootSite: PcpLayerStackSite, usd: boolean): PcpPrimIndex_Graph
  // PcpPrimIndex_Graph::New(copy): shares the node pool, copies unshared data.
  static new(copy: PcpPrimIndex_Graph): PcpPrimIndex_Graph
  static new(arg: PcpLayerStackSite | PcpPrimIndex_Graph, usd = true): PcpPrimIndex_Graph {
    if (arg instanceof PcpPrimIndex_Graph) {
      arg._share.refs++
      const g = new PcpPrimIndex_Graph(
        arg._usd, arg._nodes, arg._share, arg._unshared.map(u => u.clone()))
      g._hasPayloads = arg._hasPayloads
      g._hasNewNodes = arg._hasNewNodes
      g._instanceable = arg._instanceable
      g._finalized = arg._finalized
      return g
    }
    const g = new PcpPrimIndex_Graph(usd, [], { refs: 1 }, [])
    const rootArc: PcpArc = {
      type: PcpArcType.Root, parent: null, origin: null,
      mapToParent: PcpMapExpression.identity(), siblingNumAtOrigin: 0, namespaceDepth: 0,
    }
    g._createNode(arg, rootArc)
    return g
  }

  isUsd(): boolean { return this._usd }
  setHasPayloads(hasPayloads: boolean): void { this._hasPayloads = hasPayloads }
  hasPayloads(): boolean { return this._hasPayloads }
  setHasNewNodes(hasNewNodes: boolean): void { this._hasNewNodes = hasNewNodes }
  hasNewNodes(): boolean { return this._hasNewNodes }
  setIsInstanceable(instanceable: boolean): void { this._instanceable = instanceable }
  isInstanceable(): boolean { return this._instanceable }
  isFinalized(): boolean { return this._finalized }
  /** @internal Culling un-finalizes the graph (node.cpp SetCulled). */
  _setFinalized(finalized: boolean): void { this._finalized = finalized }

  getRootNode(): PcpNodeRef { return this._ref(0) }

  // Handles for every node in strength order, kept while the interned
  // handles and the node count are unchanged.
  private _allRefs: { refs: (PcpNodeRef | undefined)[]; nodes: PcpNodeRef[] } | undefined

  /**
   * @internal The nodes of GetNodeRange(PcpRangeTypeAll) (primIndex.cpp:
   * 163-175), as one shared read-only array: upstream's range is an iterator
   * pair, so walking it allocates nothing.
   */
  _getAllNodeRefs(): readonly PcpNodeRef[] {
    const count = this._nodes.length
    const cached = this._allRefs
    if (cached && cached.refs === this._refs && cached.nodes.length === count) return cached.nodes
    const nodes: PcpNodeRef[] = new Array(count)
    for (let i = 0; i < count; i++) nodes[i] = this._ref(i)
    this._allRefs = { refs: this._refs, nodes }
    return nodes
  }

  /** @internal Interned handle for a pool index. */
  _ref(index: number): PcpNodeRef {
    let ref = this._refs[index]
    if (!ref) {
      ref = new PcpNodeRef(this, index)
      this._refs[index] = ref
    }
    return ref
  }

  // GetSdSite (primIndex_Graph.h:134-140).
  getSdSite(site: Pcp_CompressedSdSite): PcpSdSite {
    return {
      layer: this._nodes[site.nodeIndex]!.layerStack.layers[site.layerIndex]!.layer,
      path: this._unshared[site.nodeIndex]!.sitePath,
    }
  }

  // GetNode(const Pcp_CompressedSdSite&) (primIndex_Graph.h:150-154).
  getNodeForSite(site: Pcp_CompressedSdSite): PcpNodeRef {
    return this._ref(site.nodeIndex)
  }

  /** @internal */
  _getNumNodes(): number { return this._nodes.length }
  /** @internal */
  _getNode(index: number): _PcpGraphNode { return this._nodes[index]! }

  // PcpPrimIndex_Graph::GetNodeUsingSite (primIndex_Graph.cpp:171-186).
  getNodeUsingSite(site: PcpLayerStackSite): PcpNodeRef | null {
    const path = site.path.pathString
    for (let i = 0; i < this._nodes.length; i++) {
      const node = this._nodes[i]!
      const unshared = this._unshared[i]!
      if (!(node.inert || unshared.culled) && node.layerStack === site.layerStack &&
          unshared.sitePath.pathString === path) {
        return this._ref(i)
      }
    }
    return null
  }

  private _findRootChildRange(pred: (arcType: PcpArcType) => boolean): [number, number] {
    const root = this._nodes[0]!
    for (let start = root.firstChildIndex; start !== PCP_INVALID_NODE_INDEX;
      start = this._nodes[start]!.nextSiblingIndex) {
      if (!pred(this._nodes[start]!.arcType)) continue
      let end = this._nodes.length
      for (let child = this._nodes[start]!.nextSiblingIndex; child !== PCP_INVALID_NODE_INDEX;
        child = this._nodes[child]!.nextSiblingIndex) {
        if (!pred(this._nodes[child]!.arcType)) {
          end = child
          break
        }
      }
      return [start, end]
    }
    return [this._nodes.length, this._nodes.length]
  }

  // GetNodeIndexesForRange (primIndex_Graph.cpp:242-282). Requires a
  // finalized (strength-ordered) pool.
  getNodeIndexesForRange(rangeType: PcpRangeType = PcpRangeType.All): [number, number] {
    const n = this._nodes.length
    switch (rangeType) {
      case PcpRangeType.Invalid: return [n, n]
      case PcpRangeType.All: return [0, n]
      case PcpRangeType.WeakerThanRoot: return [1, n]
      case PcpRangeType.StrongerThanPayload:
        return [0, this._findRootChildRange(t => t === PcpArcType.Payload)[0]]
      case PcpRangeType.Root: return [0, 1]
      default: {
        const arcType = arcTypeForRangeType(rangeType)
        return this._findRootChildRange(t => t === arcType)
      }
    }
  }

  getNodeIndexForNode(node: PcpNodeRef): number {
    return node.getOwningGraph() === this ? node._getNodeIndex() : this._nodes.length
  }

  // GetNodeIndexesForSubtreeRange (primIndex_Graph.cpp:292-318).
  getNodeIndexesForSubtreeRange(subtreeRoot: PcpNodeRef): [number, number] {
    if (subtreeRoot.getOwningGraph() !== this) return [this._nodes.length, this._nodes.length]
    const rootIndex = subtreeRoot._getNodeIndex()
    let last = rootIndex
    for (;;) {
      const lastChild = this._nodes[last]!.lastChildIndex
      if (lastChild === PCP_INVALID_NODE_INDEX) break
      last = lastChild
    }
    return [rootIndex, last + 1]
  }

  // Finalize (primIndex_Graph.cpp:320-351): reorder the pool strong-to-weak and
  // erase nodes marked culled that are not needed as origins.
  finalize(): void {
    if (this._finalized) return
    const strengthMapping: number[] = new Array(this._nodes.length)
    if (!this._computeStrengthOrderIndexMapping(strengthMapping)) {
      this._applyNodeIndexMapping(strengthMapping)
    }
    const culledMapping: number[] = []
    if (this._computeEraseCulledNodeIndexMapping(culledMapping)) {
      this._applyNodeIndexMapping(culledMapping)
    }
    this._finalized = true
  }

  private _applyNodeIndexMapping(map: readonly number[]): void {
    this._detachSharedNodePool()
    const oldNodes = this._nodes
    const oldUnshared = this._unshared
    const oldNum = oldNodes.length
    let numErased = 0
    for (const v of map) if (v === PCP_INVALID_NODE_INDEX) numErased++
    const newNum = oldNum - numErased
    const convert = (oldIndex: number): number =>
      oldIndex === PCP_INVALID_NODE_INDEX ? oldIndex : map[oldIndex]!

    if (numErased > 0) {
      for (let i = 0; i < oldNum; i++) {
        if (convert(i) !== PCP_INVALID_NODE_INDEX) continue
        const node = oldNodes[i]!
        if (node.prevSiblingIndex !== PCP_INVALID_NODE_INDEX) {
          oldNodes[node.prevSiblingIndex]!.nextSiblingIndex = node.nextSiblingIndex
        }
        if (node.nextSiblingIndex !== PCP_INVALID_NODE_INDEX) {
          oldNodes[node.nextSiblingIndex]!.prevSiblingIndex = node.prevSiblingIndex
        }
        const parent = oldNodes[node.arcParentIndex]!
        if (parent.firstChildIndex === i) parent.firstChildIndex = node.nextSiblingIndex
        if (parent.lastChildIndex === i) parent.lastChildIndex = node.prevSiblingIndex
      }
    }

    const nodes: _PcpGraphNode[] = new Array(newNum)
    const unshared: _PcpGraphUnsharedData[] = new Array(newNum)
    for (let i = 0; i < oldNum; i++) {
      const newIndex = convert(i)
      if (newIndex === PCP_INVALID_NODE_INDEX) continue
      const node = oldNodes[i]!
      node.arcParentIndex = convert(node.arcParentIndex)
      node.arcOriginIndex = convert(node.arcOriginIndex)
      node.firstChildIndex = convert(node.firstChildIndex)
      node.lastChildIndex = convert(node.lastChildIndex)
      node.prevSiblingIndex = convert(node.prevSiblingIndex)
      node.nextSiblingIndex = convert(node.nextSiblingIndex)
      nodes[newIndex] = node
      unshared[newIndex] = oldUnshared[i]!
    }
    this._nodes = nodes
    this._unshared = unshared
    // Outstanding handles referred to the old indexes.
    this._refs = []
  }

  // AppendChildNameToAllSites (primIndex_Graph.cpp:482-498).
  appendChildNameToAllSites(childPath: SdfPath): void {
    const parentPath = childPath.getParentPath().pathString
    const name = childPath.name
    for (const unshared of this._unshared) {
      unshared.sitePath = unshared.sitePath.pathString === parentPath
        ? childPath
        : unshared.sitePath.appendChild(name)
    }
  }

  // InsertChildNode (primIndex_Graph.cpp:500-535).
  insertChildNode(
    parent: PcpNodeRef, site: PcpLayerStackSite, arc: PcpArc,
    error?: { value?: PcpError },
  ): PcpNodeRef | null {
    if (this._nodes.length >= NODE_INDEX_CAPACITY) {
      if (error) error.value = pcpErrorCapacityExceeded(PcpErrorType.IndexCapacityExceeded)
      return null
    }
    if (arc.namespaceDepth >= DEPTH_CAPACITY) {
      if (error) {
        error.value = pcpErrorCapacityExceeded(PcpErrorType.ArcNamespaceDepthCapacityExceeded)
      }
      return null
    }
    this._detachSharedNodePoolForNewNodes()
    const parentIndex = parent._getNodeIndex()
    const childIndex = this._createNode(site, arc)
    return this._insertChildInStrengthOrder(parentIndex, childIndex)
  }

  // InsertChildSubgraph (primIndex_Graph.cpp:537-567).
  insertChildSubgraph(
    parent: PcpNodeRef, subgraph: PcpPrimIndex_Graph, arc: PcpArc,
    error?: { value?: PcpError },
  ): PcpNodeRef | null {
    if (this._nodes.length + subgraph._nodes.length >= NODE_INDEX_CAPACITY) {
      if (error) error.value = pcpErrorCapacityExceeded(PcpErrorType.IndexCapacityExceeded)
      return null
    }
    this._detachSharedNodePoolForNewNodes()
    const parentIndex = parent._getNodeIndex()
    const childIndex = this._createNodesForSubgraph(subgraph, arc)
    return this._insertChildInStrengthOrder(parentIndex, childIndex)
  }

  private _arcStrengthLess(aIndex: number, bIndex: number): boolean {
    const result = pcpCompareSiblingNodeStrength(this._ref(aIndex), this._ref(bIndex))
    // Redundant nodes in a prim index (a TF_VERIFY upstream) fall back to
    // pool order.
    if (result === 0) return aIndex < bIndex
    return result === -1
  }

  // _InsertChildInStrengthOrder (primIndex_Graph.cpp:569-624).
  private _insertChildInStrengthOrder(parentIndex: number, childIndex: number): PcpNodeRef {
    const nodes = this._nodes
    const parent = nodes[parentIndex]!
    const child = nodes[childIndex]!
    if (parent.firstChildIndex === PCP_INVALID_NODE_INDEX) {
      parent.firstChildIndex = parent.lastChildIndex = childIndex
    } else if (this._arcStrengthLess(childIndex, parent.firstChildIndex)) {
      const next = nodes[parent.firstChildIndex]!
      child.nextSiblingIndex = parent.firstChildIndex
      next.prevSiblingIndex = childIndex
      parent.firstChildIndex = childIndex
    } else if (!this._arcStrengthLess(childIndex, parent.lastChildIndex)) {
      const prev = nodes[parent.lastChildIndex]!
      child.prevSiblingIndex = parent.lastChildIndex
      prev.nextSiblingIndex = childIndex
      parent.lastChildIndex = childIndex
    } else {
      for (let index = parent.firstChildIndex; index !== PCP_INVALID_NODE_INDEX;
        index = nodes[index]!.nextSiblingIndex) {
        if (this._arcStrengthLess(childIndex, index)) {
          const next = nodes[index]!
          const prev = nodes[next.prevSiblingIndex]!
          child.prevSiblingIndex = next.prevSiblingIndex
          child.nextSiblingIndex = index
          next.prevSiblingIndex = childIndex
          prev.nextSiblingIndex = childIndex
          break
        }
      }
    }
    return this._ref(childIndex)
  }

  private _detachSharedNodePool(): void {
    if (this._share.refs !== 1) {
      this._share.refs--
      this._share = { refs: 1 }
      this._nodes = this._nodes.map(n => n.clone())
    }
  }

  private _detachSharedNodePoolForNewNodes(): void {
    this._detachSharedNodePool()
  }

  private _createNode(site: PcpLayerStackSite, arc: PcpArc): number {
    this._unshared.push(new _PcpGraphUnsharedData(site.path))
    const node = new _PcpGraphNode()
    this._nodes.push(node)
    this._finalized = false
    node.layerStack = site.layerStack
    node.setArc(arc)
    return this._nodes.length - 1
  }

  // _CreateNodesForSubgraph (primIndex_Graph.cpp:676-752).
  private _createNodesForSubgraph(subgraph: PcpPrimIndex_Graph, arc: PcpArc): number {
    const oldNum = this._nodes.length
    this._finalized = false
    for (const n of subgraph._nodes) this._nodes.push(n.clone())
    for (const u of subgraph._unshared) this._unshared.push(u.clone())
    const newNum = this._nodes.length
    const rootIndex = oldNum
    const subgraphRoot = this._nodes[rootIndex]!
    subgraphRoot.setArc(arc)
    const convert = (oldIndex: number): number =>
      oldIndex === PCP_INVALID_NODE_INDEX ? oldIndex : oldIndex + rootIndex
    for (let i = oldNum; i < newNum; i++) {
      const node = this._nodes[i]!
      if (i !== rootIndex) {
        node.mapToRoot = subgraphRoot.mapToRoot.compose(node.mapToRoot)
        node.arcParentIndex = convert(node.arcParentIndex)
        node.arcOriginIndex = convert(node.arcOriginIndex)
      }
      node.firstChildIndex = convert(node.firstChildIndex)
      node.lastChildIndex = convert(node.lastChildIndex)
      node.prevSiblingIndex = convert(node.prevSiblingIndex)
      node.nextSiblingIndex = convert(node.nextSiblingIndex)
    }
    return rootIndex
  }

  /** @internal _GetWriteableNode: detach a shared pool before mutation. */
  _getWriteableNode(index: number): _PcpGraphNode {
    this._detachSharedNodePool()
    return this._nodes[index]!
  }

  private _computeStrengthOrderIndexMapping(mapping: number[]): boolean {
    let strengthIdx = 0
    let matches = true
    // Iterative pre-order over first-child / next-sibling links.
    const stack: number[] = [0]
    while (stack.length > 0) {
      const nodeIdx = stack.pop()!
      mapping[nodeIdx] = strengthIdx
      if (nodeIdx !== strengthIdx) matches = false
      strengthIdx++
      const node = this._nodes[nodeIdx]!
      if (node.nextSiblingIndex !== PCP_INVALID_NODE_INDEX && nodeIdx !== 0) {
        stack.push(node.nextSiblingIndex)
      }
      if (node.firstChildIndex !== PCP_INVALID_NODE_INDEX) stack.push(node.firstChildIndex)
    }
    return matches
  }

  // _ComputeEraseCulledNodeIndexMapping (primIndex_Graph.cpp:824-910).
  private _computeEraseCulledNodeIndexMapping(mapping: number[]): boolean {
    const numNodes = this._nodes.length
    const canErase: boolean[] = this._unshared.map(u => u.culled)
    const processOriginChain = (start: number): void => {
      let subsequentCannotBeCulled = false
      for (let nIdx = start; ; nIdx = this._nodes[nIdx]!.arcOriginIndex) {
        const culled = canErase[nIdx]!
        if (!culled) {
          subsequentCannotBeCulled = true
        } else if (subsequentCannotBeCulled) {
          for (let pIdx = nIdx; pIdx !== PCP_INVALID_NODE_INDEX && canErase[pIdx];
            pIdx = this._nodes[pIdx]!.arcParentIndex) {
            canErase[pIdx] = false
            if (pIdx !== nIdx) processOriginChain(pIdx)
          }
        }
        const node = this._nodes[nIdx]!
        if (node.arcOriginIndex === node.arcParentIndex) break
      }
    }
    for (let i = 0; i < numNodes; i++) {
      if (this._nodes[i]!.arcOriginIndex === PCP_INVALID_NODE_INDEX) continue
      processOriginChain(i)
    }
    let numToCull = 0
    for (const v of canErase) if (v) numToCull++
    if (numToCull === 0) return false
    let culledSoFar = 0
    mapping.length = numNodes
    for (let i = 0; i < numNodes; i++) {
      if (canErase[i]) {
        mapping[i] = PCP_INVALID_NODE_INDEX
        culledSoFar++
      } else {
        mapping[i] = i - culledSoFar
      }
    }
    return true
  }
}

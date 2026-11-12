// Ported from OpenUSD 26.11.1: pxr/usd/pcp/node.cpp, pxr/usd/pcp/node.h,
//  pxr/usd/pcp/wrapNode.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// PcpNodeRef — a handle to one node of a PcpPrimIndex_Graph. Port of OpenUSD
// v26.08 pxr/usd/pcp/node.{h,cpp}.
//
// Accessors follow the C++ API (getArcType, getParentNode, ...). The Python
// property spellings from wrapNode.cpp (arcType, parent, origin, children,
// path, layerStack, mapToParent, mapToRoot, siblingNumAtOrigin,
// namespaceDepth, hasSymmetry, hasSpecs, isInert, isCulled, isRestricted,
// permission, site) are getters. Handles are interned by their graph, so two
// handles to the same node are the same object.

import { PcpArcType } from './arc.ts'
import type { PcpArc } from './arc.ts'
import type { PcpError } from './errors.ts'
import type { PcpLayerStack } from './layerStack.ts'
import type { PcpMapExpression } from './mapExpression.ts'
import {
  PCP_INVALID_NODE_INDEX, type PcpPermission, type PcpPrimIndex_Graph,
} from './primIndex_Graph.ts'
import { PcpLayerStackSite } from './site.ts'
import { SdfPath } from 'typescript-usd/sdf/path'

// _GetNonVariantPathElementCount (node.cpp:477-500).
export function pcpNodeGetNonVariantPathElementCount(path: SdfPath): number {
  let count = path.pathElementCount
  if (path.containsPrimVariantSelection()) {
    let cur = path
    do {
      while (!cur.isPrimVariantSelectionPath()) cur = cur.getParentPath()
      --count
      cur = cur.getParentPath()
    } while (cur.containsPrimVariantSelection())
  }
  return count
}

// _GetPathAtIntroDepth (node.cpp:335-352).
function pathAtIntroDepth(path: SdfPath, depthBelowIntro: number): SdfPath {
  let p = path
  for (; depthBelowIntro > 0; --depthBelowIntro) {
    while (p.isPrimVariantSelectionPath()) p = p.getParentPath()
    p = p.getParentPath()
  }
  return p
}

export class PcpNodeRef {
  /** @internal Use PcpPrimIndex_Graph's interned handles. */
  constructor(
    private readonly _graph: PcpPrimIndex_Graph,
    private readonly _nodeIdx: number,
  ) {}

  /** @internal */ _getNodeIndex(): number { return this._nodeIdx }

  getOwningGraph(): PcpPrimIndex_Graph { return this._graph }

  // operator< (node.cpp:15-25): node index, then graph.
  lessThan(rhs: PcpNodeRef): boolean {
    if (this._nodeIdx < rhs._nodeIdx) return true
    if (this._nodeIdx > rhs._nodeIdx) return false
    return this._graph._id < rhs._graph._id
  }

  equals(rhs: PcpNodeRef | null | undefined): boolean {
    return rhs !== null && rhs !== undefined &&
      this._nodeIdx === rhs._nodeIdx && this._graph === rhs._graph
  }

  getUniqueIdentifier(): string { return `${this._graph._id}:${this._nodeIdx}` }

  private get _node() { return this._graph._getNode(this._nodeIdx) }
  private get _unshared() { return this._graph._unshared[this._nodeIdx]! }

  // ---- Arc ------------------------------------------------------------------

  getArcType(): PcpArcType { return this._node.arcType }
  get arcType(): PcpArcType { return this._node.arcType }

  getParentNode(): PcpNodeRef | null {
    const i = this._node.arcParentIndex
    return i === PCP_INVALID_NODE_INDEX ? null : this._graph._ref(i)
  }
  get parent(): PcpNodeRef | null { return this.getParentNode() }

  getOriginNode(): PcpNodeRef | null {
    const i = this._node.arcOriginIndex
    return i === PCP_INVALID_NODE_INDEX ? null : this._graph._ref(i)
  }
  get origin(): PcpNodeRef | null { return this.getOriginNode() }

  // GetOriginRootNode (node.cpp:54-63).
  getOriginRootNode(): PcpNodeRef {
    let root: PcpNodeRef = this
    for (;;) {
      const origin = root.getOriginNode()
      if (!origin || origin === root.getParentNode()) break
      root = origin
    }
    return root
  }

  getRootNode(): PcpNodeRef { return this._graph.getRootNode() }

  // GetChildrenRange: children in strength order.
  getChildren(): PcpNodeRef[] {
    const out: PcpNodeRef[] = []
    for (let i = this._node.firstChildIndex; i !== PCP_INVALID_NODE_INDEX;
      i = this._graph._getNode(i).nextSiblingIndex) {
      out.push(this._graph._ref(i))
    }
    return out
  }
  get children(): PcpNodeRef[] { return this.getChildren() }

  /** @internal First child, or null (iterator primitives). */
  _firstChild(): PcpNodeRef | null {
    const i = this._node.firstChildIndex
    return i === PCP_INVALID_NODE_INDEX ? null : this._graph._ref(i)
  }
  /** @internal */
  _lastChild(): PcpNodeRef | null {
    const i = this._node.lastChildIndex
    return i === PCP_INVALID_NODE_INDEX ? null : this._graph._ref(i)
  }
  /** @internal */
  _nextSibling(): PcpNodeRef | null {
    const i = this._node.nextSiblingIndex
    return i === PCP_INVALID_NODE_INDEX ? null : this._graph._ref(i)
  }
  /** @internal */
  _prevSibling(): PcpNodeRef | null {
    const i = this._node.prevSiblingIndex
    return i === PCP_INVALID_NODE_INDEX ? null : this._graph._ref(i)
  }

  insertChild(
    site: PcpLayerStackSite, arc: PcpArc, error?: { value?: PcpError },
  ): PcpNodeRef | null {
    return this._graph.insertChildNode(this, site, arc, error)
  }

  insertChildSubgraph(
    subgraph: PcpPrimIndex_Graph, arc: PcpArc, error?: { value?: PcpError },
  ): PcpNodeRef | null {
    return this._graph.insertChildSubgraph(this, subgraph, arc, error)
  }

  getMapToParent(): PcpMapExpression { return this._node.mapToParent }
  get mapToParent(): PcpMapExpression { return this._node.mapToParent }
  getMapToRoot(): PcpMapExpression { return this._node.mapToRoot }
  get mapToRoot(): PcpMapExpression { return this._node.mapToRoot }

  getSiblingNumAtOrigin(): number { return this._node.arcSiblingNumAtOrigin }
  get siblingNumAtOrigin(): number { return this._node.arcSiblingNumAtOrigin }
  getNamespaceDepth(): number { return this._node.arcNamespaceDepth }
  get namespaceDepth(): number { return this._node.arcNamespaceDepth }

  // GetDepthBelowIntroduction (node.cpp:324-333).
  getDepthBelowIntroduction(): number {
    const parent = this.getParentNode()
    if (!parent) return 0
    return pcpNodeGetNonVariantPathElementCount(parent.getPath()) - this.getNamespaceDepth()
  }

  getPathAtIntroduction(): SdfPath {
    return pathAtIntroDepth(this.getPath(), this.getDepthBelowIntroduction())
  }

  getIntroPath(): SdfPath {
    const parent = this.getParentNode()
    if (!parent) return SdfPath.absoluteRootPath
    return pathAtIntroDepth(parent.getPath(), this.getDepthBelowIntroduction())
  }

  getPathAtOriginRootIntroduction(): SdfPath {
    return pathAtIntroDepth(
      this.getPath(), this.getOriginRootNode().getDepthBelowIntroduction())
  }

  // ---- Site -----------------------------------------------------------------

  getSite(): PcpLayerStackSite {
    return new PcpLayerStackSite(this.getLayerStack(), this.getPath())
  }
  get site(): PcpLayerStackSite { return this.getSite() }
  getPath(): SdfPath { return this._unshared.sitePath }
  get path(): SdfPath { return this._unshared.sitePath }
  getLayerStack(): PcpLayerStack { return this._node.layerStack }
  get layerStack(): PcpLayerStack { return this._node.layerStack }

  isRootNode(): boolean { return this._node.arcType === PcpArcType.Root }

  // ---- Flags ----------------------------------------------------------------

  setIsDueToAncestor(value: boolean): void { this._unshared.isDueToAncestor = value }
  isDueToAncestor(): boolean { return this._unshared.isDueToAncestor }

  setHasTransitiveDirectDependency(value: boolean): void {
    this._unshared.hasTransitiveDirectArc = value
  }
  hasTransitiveDirectDependency(): boolean { return this._unshared.hasTransitiveDirectArc }

  setHasTransitiveAncestralDependency(value: boolean): void {
    this._unshared.hasTransitiveAncestralArc = value
  }
  hasTransitiveAncestralDependency(): boolean { return this._unshared.hasTransitiveAncestralArc }

  setHasSymmetry(value: boolean): void {
    if (this._node.hasSymmetry !== value) {
      this._graph._getWriteableNode(this._nodeIdx).hasSymmetry = value
    }
  }
  get hasSymmetry(): boolean { return this._node.hasSymmetry }

  setPermission(value: PcpPermission): void {
    if (this._node.permission !== value) {
      this._graph._getWriteableNode(this._nodeIdx).permission = value
    }
  }
  getPermission(): PcpPermission { return this._node.permission }
  get permission(): PcpPermission { return this._node.permission }

  // SetInert (node.cpp:163-175).
  setInert(inert: boolean): void {
    const wasInert = this.isInert
    if (this._node.inert !== inert) {
      this._graph._getWriteableNode(this._nodeIdx).inert = inert
    }
    if (inert !== wasInert) this._recordRestrictionDepth(inert)
  }
  // IsInert (node.cpp:288-293): inert or culled.
  get isInert(): boolean { return this._node.inert || this._unshared.culled }

  // SetCulled (node.cpp:125-147).
  setCulled(culled: boolean): void {
    const wasCulled = this._unshared.culled
    if (culled === wasCulled) return
    if (culled) this._graph._setFinalized(false)
    this._recordRestrictionDepth(culled)
    this._unshared.culled = culled
  }
  get isCulled(): boolean { return this._unshared.culled }

  // SetRestricted (node.cpp:149-161).
  setRestricted(restricted: boolean): void {
    const wasRestricted = this.isRestricted
    if (this._node.permissionDenied !== restricted) {
      this._graph._getWriteableNode(this._nodeIdx).permissionDenied = restricted
    }
    if (restricted !== wasRestricted) this._recordRestrictionDepth(restricted)
  }
  get isRestricted(): boolean { return this._node.permissionDenied }

  // _RecordRestrictionDepth (node.cpp:177-211). `definitelyRestricted` is
  // _Restricted::Yes; false is _Restricted::Unknown.
  private _recordRestrictionDepth(definitelyRestricted: boolean): void {
    const restricted = definitelyRestricted || !this.canContributeSpecs()
    const unshared = this._unshared
    if (!restricted) {
      unshared.restrictionDepth = 0
    } else if (unshared.restrictionDepth === 0) {
      unshared.restrictionDepth = Math.min(this.getPath().pathElementCount, 0xffff)
    }
  }

  // CanContributeSpecs (node.cpp:295-310).
  canContributeSpecs(): boolean {
    const node = this._node
    return !(node.inert || this._unshared.culled) &&
      (!node.permissionDenied || this._graph.isUsd())
  }

  getSpecContributionRestrictedDepth(): number { return this._unshared.restrictionDepth }
  setSpecContributionRestrictedDepth(depth: number): void {
    this._unshared.restrictionDepth = depth
  }

  setHasSpecs(value: boolean): void { this._unshared.hasSpecs = value }
  get hasSpecs(): boolean { return this._unshared.hasSpecs }

  setHasValueClips(value: boolean): void {
    if (this._node.hasValueClips !== value) {
      this._graph._getWriteableNode(this._nodeIdx).hasValueClips = value
    }
  }
  hasValueClips(): boolean { return this._node.hasValueClips }

  toString(): string {
    return `(${this._nodeIdx}) ${PcpArcType[this.arcType]} ${this.getSite().toString()}`
  }
}

// ---- Node iteration (node_Iterator.h) -----------------------------------------

// Pcp_GetSubtreeRange: pre-order over the subtree rooted at `node`, in
// strength order, with optional pruning (PcpNodeRef_PrivateSubtreeConstIterator).
export class PcpNodeSubtreeIterator {
  private _current: PcpNodeRef | null
  private _prune = false
  private readonly _end: PcpNodeRef | null

  constructor(private readonly _start: PcpNodeRef) {
    this._current = _start
    this._end = PcpNodeSubtreeIterator._next(_start)
  }

  // _MoveToNext from `node`: the next sibling of the nearest ancestor (or
  // self) that has one.
  private static _next(node: PcpNodeRef): PcpNodeRef | null {
    for (let cur: PcpNodeRef | null = node; cur; cur = cur.getParentNode()) {
      const sibling = cur._nextSibling()
      if (sibling) return sibling
    }
    return null
  }

  get node(): PcpNodeRef | null { return this._current === this._end ? null : this._current }

  pruneChildren(): void { this._prune = true }

  next(): void {
    const cur = this._current!
    const child = this._prune ? null : cur._firstChild()
    this._current = child ?? PcpNodeSubtreeIterator._next(cur)
    this._prune = false
  }
}

export function* pcpGetSubtreeRange(node: PcpNodeRef): IterableIterator<PcpNodeRef> {
  for (const it = new PcpNodeSubtreeIterator(node); it.node; it.next()) yield it.node
}

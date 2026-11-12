// Ported from OpenUSD 26.11.1: pxr/usd/usd/primCompositionQuery.cpp,
//  pxr/usd/usd/primCompositionQuery.h
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/usd/usd/primCompositionQuery.{h,cpp} — the composition-arc
// vocabulary and the prim/property provenance entries Stage.getPrimStack /
// getPropertyStack return (UsdPrimCompositionQueryArc introspection data,
// flattened to plain records), and UsdPrimCompositionQuery itself.

import { Error as TfError, TfDiagnosticMgr, TfDiagnosticType } from 'typescript-usd/tf'
import {
  ArcType as PcpArcType, PcpArcInfo, type Node as PcpNodeRef, type PrimIndex as PcpPrimIndex,
  type LayerStack as PcpLayerStack, type Reference as PcpReference,
  pcpComposeSiteReferences, pcpComposeSitePayloads, pcpComposeSiteInherits,
  pcpComposeSiteSpecializes, pcpComposeSiteVariantSets,
} from 'typescript-usd/pcp'
import {
  Reference as SdfReference, Payload as SdfPayload, type Layer, type PrimSpec as SdfPrimSpec,
} from 'typescript-usd/sdf'
import type { ListEditorProxy as SdfListEditorProxy } from 'typescript-usd/sdf'
import { SdfPath } from 'typescript-usd/sdf/path'
import type { Prim } from './prim.ts'
import { UsdResolveTarget, _makeUsdResolveTarget } from './resolveTarget.ts'

// The SdfListEditorProxy instantiations of sdf/proxyTypes.h.
type SdfReferenceEditorProxy = SdfListEditorProxy<SdfReference>
type SdfPayloadEditorProxy = SdfListEditorProxy<SdfPayload>
type SdfPathEditorProxy = SdfListEditorProxy<string>
type SdfNameEditorProxy = SdfListEditorProxy<string>

export type CompositionArc =
  | 'local' | 'inherit' | 'variant' | 'relocate'
  | 'reference' | 'payload' | 'specialize'

export const ARC_NAMES: Record<number, CompositionArc> = {
  0: 'local', 1: 'inherit', 2: 'variant', 3: 'relocate',
  4: 'reference', 5: 'payload', 6: 'specialize',
}

// USDA parses timeSamples as a dict keyed by time string; USDC as
// [time, ValueRep][] pairs — normalize to sorted [time, value][] (the same
// boundary normalization as resolveTimeSamples).
export function normalizeTimeSamples(raw: unknown): [number, unknown][] | undefined {
  if (raw === undefined || raw === null) return undefined
  let pairs: [number, unknown][]
  if (Array.isArray(raw)) {
    pairs = raw as [number, unknown][]
  } else if (typeof raw === 'object') {
    pairs = Object.entries(raw as Record<string, unknown>)
      .map(([t, v]) => [Number(t), v] as [number, unknown])
      .sort(([a], [b]) => a - b)
  } else {
    return undefined
  }
  if (pairs.length === 0) return undefined
  return pairs.map(([t, vr]) => {
    const value = typeof vr === 'object' && vr !== null && 'value' in (vr as object)
      ? (vr as { value: unknown }).value
      : vr
    return [t, value] as [number, unknown]
  })
}

export interface PrimStackEntry {
  layerIdentifier: string
  specPath: string
  // The outermost composition arc that brought this spec in
  arc: CompositionArc
  // Cumulative layer offset relative to the stage root
  offset: { offset: number; scale: number }
  // The spec's authored metadata fields (the SdfPrimSpec info the usdview
  // layer-stack view's Value column shows); bookkeeping fields excluded.
  metadata: Record<string, unknown>
}

export interface PropertyStackEntry {
  // The contributing layer (its resolved identifier / file path)
  layerIdentifier: string
  // The property spec path within that layer (differs from the composed
  // path for opinions reached through references/variants)
  specPath: string
  // The outermost composition arc that brought this opinion in
  arc: CompositionArc
  // The authored default value in that layer (undefined when the spec
  // authors only time samples or metadata)
  value: unknown
  timeSamples?: [number, unknown][] | undefined
}

export interface PropertyStackWithLayerOffsetEntry extends PropertyStackEntry {
  // Cumulative time offset from this opinion's introducing layer to stage time.
  offset: { offset: number; scale: number }
}

// ---------------------------------------------------------------------------
// UsdPrimCompositionQueryArc / UsdPrimCompositionQuery
// (primCompositionQuery.h:35-401, primCompositionQuery.cpp:16-644).
// ---------------------------------------------------------------------------

// PcpNodeRef equality where a null ref is the invalid node.
function sameNode(a: PcpNodeRef | null, b: PcpNodeRef | null): boolean {
  return a === null ? b === null : a.equals(b)
}

function codingError(message: string): void {
  TfDiagnosticMgr.GetInstance().postError(new TfError(message, TfDiagnosticType.CodingError))
}

type PcpComposeFunc<T> = (
  layerStack: PcpLayerStack, path: SdfPath, info: PcpArcInfo[],
) => T[]

// _GetIntroducingComposeInfo (primCompositionQuery.cpp:70-107).
function getIntroducingComposeInfo<T>(
  arc: UsdPrimCompositionQueryArc, composeFunc: PcpComposeFunc<T>,
): { info: PcpArcInfo; entry: T } | undefined {
  // Run the Pcp compose func to get the parallel vectors of composed list
  // entries and arc source info.
  const info: PcpArcInfo[] = []
  const result = composeFunc(
    arc.getIntroducingNode().getLayerStack(), arc.getIntroducingPrimPath(), info)
  if (result.length !== info.length) return undefined

  // We can use the sibling num at origin to find exactly which entry in the
  // list corresponds to our arc's target node.
  const index = arc.getTargetNode().getSiblingNumAtOrigin()
  if (index >= info.length) {
    codingError('Node sibling number of target node is out of range ' +
      'introducing composed list op')
    return undefined
  }
  return { info: info[index]!, entry: result[index]! }
}

const composeReferences: PcpComposeFunc<PcpReference> =
  (layerStack, path, info) => pcpComposeSiteReferences(layerStack, path, info)
const composePayloads: PcpComposeFunc<PcpReference> =
  (layerStack, path, info) => pcpComposeSitePayloads(layerStack, path, info)
const composeInherits: PcpComposeFunc<string> = pcpComposeSiteInherits
const composeSpecializes: PcpComposeFunc<string> = pcpComposeSiteSpecializes
const composeVariantSets: PcpComposeFunc<string> = pcpComposeSiteVariantSets

// _GetIntroducingRelocatesLayer (primCompositionQuery.cpp:109-140).
function getIntroducingRelocatesLayer(arc: UsdPrimCompositionQueryArc): PcpArcInfo | undefined {
  const layerStack = arc.getIntroducingNode().getLayerStack()
  // We ask the introduced node for its GetIntroPath which gets its parent's
  // path when it introduced this node.
  const path = arc.getTargetNode().getIntroPath().pathString
  for (const layer of layerStack.getLayers()) {
    const relocates = (layer as Layer).getRelocates()
    if (relocates.some(([, target]) => target === path)) {
      // There should only be one relocate per target path.
      return new PcpArcInfo(layer, undefined, '', 0)
    }
  }
  return undefined
}

// _GetIntroducingPrimSpec (primCompositionQuery.cpp:252-260).
function getIntroducingPrimSpec(
  arc: UsdPrimCompositionQueryArc, info: PcpArcInfo,
): SdfPrimSpec | undefined {
  return (info.sourceLayer as Layer).getPrimAtPath(arc.getIntroducingPrimPath()) ?? undefined
}

/** The (editor, authored value) pair GetIntroducingListEditor yields, or
 * (null, null) when the arc has no introducing list op (the Python binding's
 * tuple, wrapPrimCompositionQuery.cpp:16-46). */
export type UsdPrimCompositionQueryListEditorResult =
  | [SdfReferenceEditorProxy, SdfReference]
  | [SdfPayloadEditorProxy, SdfPayload]
  | [SdfPathEditorProxy, SdfPath]
  | [SdfNameEditorProxy, string]
  | [null, null]

// UsdPrimCompositionQueryArc (primCompositionQuery.h:35-266).
export class UsdPrimCompositionQueryArc {
  private readonly _node: PcpNodeRef
  private readonly _originalIntroducedNode: PcpNodeRef
  private readonly _introducingNode: PcpNodeRef
  /** @internal Keeps the expanded prim index reachable from the arc
   * (primCompositionQuery.cpp:637-642). */
  _primIndex: PcpPrimIndex | null = null

  // primCompositionQuery.cpp:20-48. Only a UsdPrimCompositionQuery creates
  // these.
  /** @internal */
  constructor(node: PcpNodeRef) {
    this._node = node
    this._originalIntroducedNode = node

    // The root node introduces itself.
    if (node.isRootNode()) {
      this._introducingNode = node
      return
    }

    // In most cases this node's arc originates from its parent node and this
    // node is the originally introduced node for the arc. But when this node
    // has a non-parent origin it must be an implicit or copied node that has
    // not been explicitly added by its parent node. In this case the root of
    // the origin chain is the originally introduced node of the arc that
    // causes this node to exist and therefore that node's parent is the
    // introducing node of this arc.
    if (!sameNode(node.getOriginNode(), node.getParentNode())) {
      this._originalIntroducedNode = node.getOriginRootNode()
    }
    this._introducingNode = this._originalIntroducedNode.getParentNode()!
  }

  /** Returns the targeted node of this composition arc. */
  getTargetNode(): PcpNodeRef { return this._node }

  /** Returns the node that introduces this arc into the composition graph;
   * the target node itself for the root arc. */
  getIntroducingNode(): PcpNodeRef { return this._introducingNode }

  // GetTargetLayer (primCompositionQuery.cpp:142-146).
  /** Returns the root layer of the layer stack that holds the prim spec
   * targeted by this composition arc. */
  getTargetLayer(): Layer {
    return this._node.getLayerStack().identifier.rootLayer as Layer
  }

  // GetTargetPrimPath (primCompositionQuery.cpp:148-152).
  /** Returns the path of the prim spec targeted by this arc in the target
   * layer stack. */
  getTargetPrimPath(): SdfPath { return this._node.getPath() }

  // primCompositionQuery.cpp:154-188. An invalid sublayer emits a coding
  // error, then uses the start of the target node's layer stack.
  makeResolveTargetUpTo(subLayer?: Layer): UsdResolveTarget {
    if (!this._primIndex) return new UsdResolveTarget()
    return _makeUsdResolveTarget(this._primIndex, this._node, this._resolveTargetLayer(subLayer))
  }

  makeResolveTargetStrongerThan(subLayer?: Layer): UsdResolveTarget {
    if (!this._primIndex) return new UsdResolveTarget()
    return _makeUsdResolveTarget(this._primIndex, this._node.getRootNode(), null,
      this._node, this._resolveTargetLayer(subLayer))
  }

  private _resolveTargetLayer(layer?: Layer): Layer | undefined {
    if (!layer || this._node.layerStack.layers.some(entry => entry.layer === layer)) return layer
    codingError(`Layer '${layer.identifier}' is not a layer in the layer stack of the node site '${this._node.getPath().pathString}'`)
    return undefined
  }

  // GetIntroducingLayer (primCompositionQuery.cpp:190-231).
  /** Returns the layer in the layer stack that adds this arc to the
   * composition graph; null for the root arc. */
  getIntroducingLayer(): Layer | null {
    // The arc source info returned by the various Pcp compose functions for
    // list op fields will hold the layer whose prim spec adds this arc to
    // the list. Just need to call the correct function for each arc type.
    let info: PcpArcInfo | undefined
    switch (this._node.getArcType()) {
      case PcpArcType.Reference:
        info = getIntroducingComposeInfo(this, composeReferences)?.info
        break
      case PcpArcType.Payload:
        info = getIntroducingComposeInfo(this, composePayloads)?.info
        break
      case PcpArcType.Inherit:
        info = getIntroducingComposeInfo(this, composeInherits)?.info
        break
      case PcpArcType.Specialize:
        info = getIntroducingComposeInfo(this, composeSpecializes)?.info
        break
      case PcpArcType.Variant:
        info = getIntroducingComposeInfo(this, composeVariantSets)?.info
        break
      case PcpArcType.Relocate:
        info = getIntroducingRelocatesLayer(this)
        break
      default:
        break
    }
    // Empty layer for root arc and unsupported arc types.
    return info ? info.sourceLayer as Layer : null
  }

  // GetIntroducingPrimPath (primCompositionQuery.cpp:233-250).
  /** Returns the path of the prim that introduces this arc within the
   * introducing layer; the empty path for the root arc and the pseudo-root
   * for relocate arcs. */
  getIntroducingPrimPath(): SdfPath {
    // Special case for the root node. It doesn't have an introducing prim
    // path.
    if (this._node.isRootNode()) return SdfPath.emptyPath
    // Special case for relocate arcs. They are authored within layer
    // metadata.
    if (this._node.getArcType() === PcpArcType.Relocate) return SdfPath.absoluteRootPath
    // We ask the introduced node for its GetIntroPath which gets its
    // parent's path when it introduced this node.
    return this._originalIntroducedNode.getIntroPath()
  }

  // GetIntroducingListEditor (primCompositionQuery.cpp:262-365), dispatched
  // on the arc type as the Python binding does
  // (wrapPrimCompositionQuery.cpp:16-46).
  /** Returns the list editor of the introducing prim spec and the authored
   * list entry that introduces this arc, or (null, null) for the root and
   * relocate arcs. */
  getIntroducingListEditor(): UsdPrimCompositionQueryListEditorResult {
    let result: UsdPrimCompositionQueryListEditorResult | undefined
    switch (this.getArcType()) {
      case PcpArcType.Reference: result = this._getReferenceListEditor(); break
      case PcpArcType.Payload: result = this._getPayloadListEditor(); break
      case PcpArcType.Inherit:
      case PcpArcType.Specialize: result = this._getPathListEditor(); break
      case PcpArcType.Variant: result = this._getNameListEditor(); break
      default: return [null, null]
    }
    if (result) return result
    codingError('Failed to get list editor value for the given type of ' +
      'of the composition arc')
    return [null, null]
  }

  // primCompositionQuery.cpp:262-285.
  private _getReferenceListEditor(): [SdfReferenceEditorProxy, SdfReference] | undefined {
    // Compose the references on the introducing node.
    const found = getIntroducingComposeInfo(this, composeReferences)
    if (!found) return undefined
    const spec = getIntroducingPrimSpec(this, found.info)
    if (!spec) return undefined
    // The composed reference has its asset path resolved. We want the
    // reference we return to be the authored value in the list op itself
    // which we can get back from the source arc info.
    const ref = found.entry
    return [spec.getReferenceList(), new SdfReference(
      found.info.authoredAssetPath, ref.primPath, ref.layerOffset, ref.customData ?? {})]
  }

  // primCompositionQuery.cpp:287-310.
  private _getPayloadListEditor(): [SdfPayloadEditorProxy, SdfPayload] | undefined {
    // Compose the payloads on the introducing node.
    const found = getIntroducingComposeInfo(this, composePayloads)
    if (!found) return undefined
    const spec = getIntroducingPrimSpec(this, found.info)
    if (!spec) return undefined
    const payload = found.entry
    return [spec.getPayloadList(), new SdfPayload(
      found.info.authoredAssetPath, payload.primPath, payload.layerOffset)]
  }

  // primCompositionQuery.cpp:312-344.
  private _getPathListEditor(): [SdfPathEditorProxy, SdfPath] | undefined {
    if (this.getArcType() === PcpArcType.Inherit) {
      // Compose the inherit paths on the introducing node.
      const found = getIntroducingComposeInfo(this, composeInherits)
      if (!found) return undefined
      const spec = getIntroducingPrimSpec(this, found.info)
      if (!spec) return undefined
      return [spec.getInheritPathList(), SdfPath.fromString(found.entry)]
    }
    // Compose the specialize paths on the introducing node.
    const found = getIntroducingComposeInfo(this, composeSpecializes)
    if (!found) return undefined
    const spec = getIntroducingPrimSpec(this, found.info)
    if (!spec) return undefined
    return [spec.getSpecializesList(), SdfPath.fromString(found.entry)]
  }

  // primCompositionQuery.cpp:346-365.
  private _getNameListEditor(): [SdfNameEditorProxy, string] | undefined {
    // Compose the variant set names on the introducing node.
    const found = getIntroducingComposeInfo(this, composeVariantSets)
    if (!found) return undefined
    const spec = getIntroducingPrimSpec(this, found.info)
    if (!spec) return undefined
    return [spec.getVariantSetNameList(), found.entry]
  }

  // GetArcType (primCompositionQuery.cpp:368-372).
  getArcType(): PcpArcType { return this._node.getArcType() }

  // IsImplicit (primCompositionQuery.cpp:374-385).
  /** Whether this arc exists because of the introduction of another
   * composition arc (e.g. an inherit authored across a reference). */
  isImplicit(): boolean {
    // An implicit node is a node that wasn't introduced by its parent and
    // has a different site than its origin node. This is distinguished from
    // explicit nodes (which are introduced by their parents) and copied
    // nodes (which have been copied directly from their origins for
    // strength ordering).
    const origin = this._node.getOriginNode()
    return !this._node.isRootNode() &&
      !sameNode(this._node.getParentNode(), this._introducingNode) &&
      !(origin !== null && origin.getSite().equals(this._node.getSite()))
  }

  // IsAncestral (primCompositionQuery.cpp:387-391).
  /** Whether this arc was composed in by a namespace parent's prim index. */
  isAncestral(): boolean { return this._node.isDueToAncestor() }

  // HasSpecs (primCompositionQuery.cpp:393-397).
  /** Whether the target node contributes any local spec opinions. */
  hasSpecs(): boolean { return this._node.hasSpecs }

  // IsIntroducedInRootLayerStack (primCompositionQuery.cpp:399-416).
  /** Whether the opinion introducing this arc is authored in the root layer
   * stack; always true for the root arc. */
  isIntroducedInRootLayerStack(): boolean {
    // We say the root node of the graph is always introduced in the root
    // layer stack.
    if (this._node.isRootNode()) return true
    // Compare just the root layers of the stacks: a reference that targets
    // the root layer by name has a layer stack without the session layer.
    return this._introducingNode.getLayerStack().identifier.rootLayer ===
      this._node.getRootNode().getLayerStack().identifier.rootLayer
  }

  // IsIntroducedInRootLayerPrimSpec (primCompositionQuery.cpp:418-422).
  /** Whether the opinion introducing this arc is authored directly on the
   * prim's prim spec in the root layer stack; always true for the root
   * arc. */
  isIntroducedInRootLayerPrimSpec(): boolean { return this._introducingNode.isRootNode() }
}

// UsdPrimCompositionQuery::ArcTypeFilter (primCompositionQuery.h:285-305).
export enum UsdPrimCompositionQueryArcTypeFilter {
  All = 0,
  // Single arc types
  Reference,
  Payload,
  Inherit,
  Specialize,
  Variant,
  Relocate,
  // Related arc types
  ReferenceOrPayload,
  InheritOrSpecialize,
  // Inverse of related arc types
  NotReferenceOrPayload,
  NotInheritOrSpecialize,
  NotVariant,
  NotRelocate,
}

// UsdPrimCompositionQuery::DependencyTypeFilter (primCompositionQuery.h:310-316).
export enum UsdPrimCompositionQueryDependencyTypeFilter {
  All = 0,
  Direct,
  Ancestral,
}

// UsdPrimCompositionQuery::ArcIntroducedFilter (primCompositionQuery.h:320-332).
export enum UsdPrimCompositionQueryArcIntroducedFilter {
  All = 0,
  // Only arcs that are authored somewhere in the root layer stack.
  IntroducedInRootLayerStack,
  // Only arcs that are authored directly in the prim's prim spec in the
  // root layer stack.
  IntroducedInRootLayerPrimSpec,
}

// UsdPrimCompositionQuery::HasSpecsFilter (primCompositionQuery.h:336-342).
export enum UsdPrimCompositionQueryHasSpecsFilter {
  All = 0,
  HasSpecs,
  HasNoSpecs,
}

// UsdPrimCompositionQuery::Filter (primCompositionQuery.h:346-375).
export class UsdPrimCompositionQueryFilter {
  /** Filters by arc type. */
  arcTypeFilter = UsdPrimCompositionQueryArcTypeFilter.All
  /** Filters by dependency type, direct or ancestral. */
  dependencyTypeFilter = UsdPrimCompositionQueryDependencyTypeFilter.All
  /** Filters by where the arc is introduced. */
  arcIntroducedFilter = UsdPrimCompositionQueryArcIntroducedFilter.All
  /** Filters by whether the arc provides specs for the prim. */
  hasSpecsFilter = UsdPrimCompositionQueryHasSpecsFilter.All

  equals(rhs: UsdPrimCompositionQueryFilter): boolean {
    return this.arcIntroducedFilter === rhs.arcIntroducedFilter &&
      this.arcTypeFilter === rhs.arcTypeFilter &&
      this.dependencyTypeFilter === rhs.dependencyTypeFilter &&
      this.hasSpecsFilter === rhs.hasSpecsFilter
  }

  clone(): UsdPrimCompositionQueryFilter {
    return Object.assign(new UsdPrimCompositionQueryFilter(), this)
  }
}

// _TestArcType (primCompositionQuery.cpp:489-539).
function testArcType(
  compArc: UsdPrimCompositionQueryArc, filter: UsdPrimCompositionQueryFilter,
): boolean {
  const F = UsdPrimCompositionQueryArcTypeFilter
  // Convert to a bit mask so we filter by multiple arc types.
  let arcMask = 0
  switch (filter.arcTypeFilter) {
    case F.All: return true
    case F.Reference: arcMask = 1 << PcpArcType.Reference; break
    case F.Payload: arcMask = 1 << PcpArcType.Payload; break
    case F.Inherit: arcMask = 1 << PcpArcType.Inherit; break
    case F.Specialize: arcMask = 1 << PcpArcType.Specialize; break
    case F.Variant: arcMask = 1 << PcpArcType.Variant; break
    case F.Relocate: arcMask = 1 << PcpArcType.Relocate; break
    case F.ReferenceOrPayload:
      arcMask = (1 << PcpArcType.Reference) | (1 << PcpArcType.Payload); break
    case F.InheritOrSpecialize:
      arcMask = (1 << PcpArcType.Inherit) | (1 << PcpArcType.Specialize); break
    case F.NotReferenceOrPayload:
      arcMask = ~((1 << PcpArcType.Reference) | (1 << PcpArcType.Payload)); break
    case F.NotInheritOrSpecialize:
      arcMask = ~((1 << PcpArcType.Inherit) | (1 << PcpArcType.Specialize)); break
    case F.NotVariant: arcMask = ~(1 << PcpArcType.Variant); break
    case F.NotRelocate: arcMask = ~(1 << PcpArcType.Relocate); break
  }
  return (arcMask & (1 << compArc.getArcType())) !== 0
}

// _TestDependencyType (primCompositionQuery.cpp:542-557).
function testDependencyType(
  compArc: UsdPrimCompositionQueryArc, filter: UsdPrimCompositionQueryFilter,
): boolean {
  switch (filter.dependencyTypeFilter) {
    case UsdPrimCompositionQueryDependencyTypeFilter.All: return true
    case UsdPrimCompositionQueryDependencyTypeFilter.Direct: return !compArc.isAncestral()
    case UsdPrimCompositionQueryDependencyTypeFilter.Ancestral: return compArc.isAncestral()
  }
  return true
}

// _TestArcIntroduced (primCompositionQuery.cpp:559-574).
function testArcIntroduced(
  compArc: UsdPrimCompositionQueryArc, filter: UsdPrimCompositionQueryFilter,
): boolean {
  switch (filter.arcIntroducedFilter) {
    case UsdPrimCompositionQueryArcIntroducedFilter.All: return true
    case UsdPrimCompositionQueryArcIntroducedFilter.IntroducedInRootLayerStack:
      return compArc.isIntroducedInRootLayerStack()
    case UsdPrimCompositionQueryArcIntroducedFilter.IntroducedInRootLayerPrimSpec:
      return compArc.isIntroducedInRootLayerPrimSpec()
  }
  return true
}

// _TestHasSpecs (primCompositionQuery.cpp:576-591).
function testHasSpecs(
  compArc: UsdPrimCompositionQueryArc, filter: UsdPrimCompositionQueryFilter,
): boolean {
  switch (filter.hasSpecsFilter) {
    case UsdPrimCompositionQueryHasSpecsFilter.All: return true
    case UsdPrimCompositionQueryHasSpecsFilter.HasSpecs: return compArc.hasSpecs()
    case UsdPrimCompositionQueryHasSpecsFilter.HasNoSpecs: return !compArc.hasSpecs()
  }
  return true
}

// UsdPrimCompositionQuery (primCompositionQuery.h:268-401).
/** Optionally filtered composition queries about a prim: a strength-ordered
 * list of UsdPrimCompositionQueryArc. It does not listen for change
 * notification; dispose of it on a resync of its prim. */
export class UsdPrimCompositionQuery {
  static readonly ArcTypeFilter = UsdPrimCompositionQueryArcTypeFilter
  static readonly DependencyTypeFilter = UsdPrimCompositionQueryDependencyTypeFilter
  static readonly ArcIntroducedFilter = UsdPrimCompositionQueryArcIntroducedFilter
  static readonly HasSpecsFilter = UsdPrimCompositionQueryHasSpecsFilter
  static readonly Filter = UsdPrimCompositionQueryFilter

  private readonly _prim: Prim
  private _filter: UsdPrimCompositionQueryFilter
  private readonly _expandedPrimIndex: PcpPrimIndex
  private readonly _unfilteredArcs: UsdPrimCompositionQueryArc[] = []

  // primCompositionQuery.cpp:428-447.
  constructor(prim: Prim, filter: UsdPrimCompositionQueryFilter = new UsdPrimCompositionQueryFilter()) {
    this._prim = prim
    this._filter = filter.clone()

    // We need the unculled prim index so that we can query all possible
    // composition dependencies even if they don't currently contribute
    // opinions.
    this._expandedPrimIndex = prim.computeExpandedPrimIndex()
    if (!this._expandedPrimIndex.isValid()) return

    // Compute the unfiltered list of composition arcs from all non-inert
    // nodes. We still skip inert nodes, with the exception of relocates, to
    // avoid picking up things like the original copies of specialize nodes
    // that have been moved for strength ordering purposes.
    for (const node of this._expandedPrimIndex.getNodeRange()) {
      if (!node.isInert || node.getArcType() === PcpArcType.Relocate) {
        this._unfilteredArcs.push(new UsdPrimCompositionQueryArc(node))
      }
    }
  }

  // GetDirectReferences (primCompositionQuery.cpp:449-457).
  /** A query with a preset filter for reference arcs that are not
   * ancestral. */
  static getDirectReferences(prim: Prim): UsdPrimCompositionQuery {
    const filter = new UsdPrimCompositionQueryFilter()
    filter.dependencyTypeFilter = UsdPrimCompositionQueryDependencyTypeFilter.Direct
    filter.arcTypeFilter = UsdPrimCompositionQueryArcTypeFilter.Reference
    return new UsdPrimCompositionQuery(prim, filter)
  }

  // GetDirectInherits (primCompositionQuery.cpp:459-467).
  /** A query with a preset filter for inherit arcs that are not ancestral. */
  static getDirectInherits(prim: Prim): UsdPrimCompositionQuery {
    const filter = new UsdPrimCompositionQueryFilter()
    filter.dependencyTypeFilter = UsdPrimCompositionQueryDependencyTypeFilter.Direct
    filter.arcTypeFilter = UsdPrimCompositionQueryArcTypeFilter.Inherit
    return new UsdPrimCompositionQuery(prim, filter)
  }

  // GetDirectRootLayerArcs (primCompositionQuery.cpp:469-477).
  /** A query with a preset filter for direct arcs introduced by opinions in
   * a layer of the root layer stack. */
  static getDirectRootLayerArcs(prim: Prim): UsdPrimCompositionQuery {
    const filter = new UsdPrimCompositionQueryFilter()
    filter.dependencyTypeFilter = UsdPrimCompositionQueryDependencyTypeFilter.Direct
    filter.arcIntroducedFilter = UsdPrimCompositionQueryArcIntroducedFilter.IntroducedInRootLayerStack
    return new UsdPrimCompositionQuery(prim, filter)
  }

  /** The prim this query was created for. */
  getPrim(): Prim { return this._prim }

  // SetFilter (primCompositionQuery.cpp:479-482).
  setFilter(filter: UsdPrimCompositionQueryFilter): void { this._filter = filter.clone() }

  // GetFilter (primCompositionQuery.cpp:484-487): a copy.
  getFilter(): UsdPrimCompositionQueryFilter { return this._filter.clone() }

  // The Python binding's `filter` property (wrapPrimCompositionQuery.cpp:97).
  get filter(): UsdPrimCompositionQueryFilter { return this.getFilter() }
  set filter(filter: UsdPrimCompositionQueryFilter) { this.setFilter(filter) }

  // GetCompositionArcs (primCompositionQuery.cpp:593-644).
  /** The composition arcs passing the current filter, always strongest to
   * weakest. */
  getCompositionArcs(): UsdPrimCompositionQueryArc[] {
    // Create a list of the filter test functions we actually need to run;
    // there's no point in testing filters that include all.
    const filter = this._filter.clone()
    const filterTests: Array<(arc: UsdPrimCompositionQueryArc) => boolean> = []
    if (filter.arcTypeFilter !== UsdPrimCompositionQueryArcTypeFilter.All) {
      filterTests.push(arc => testArcType(arc, filter))
    }
    if (filter.dependencyTypeFilter !== UsdPrimCompositionQueryDependencyTypeFilter.All) {
      filterTests.push(arc => testDependencyType(arc, filter))
    }
    if (filter.arcIntroducedFilter !== UsdPrimCompositionQueryArcIntroducedFilter.All) {
      filterTests.push(arc => testArcIntroduced(arc, filter))
    }
    if (filter.hasSpecsFilter !== UsdPrimCompositionQueryHasSpecsFilter.All) {
      filterTests.push(arc => testHasSpecs(arc, filter))
    }

    // Otherwise return only the arcs that pass all the filter tests.
    const filteredArcs = filterTests.length === 0
      ? [...this._unfilteredArcs]
      : this._unfilteredArcs.filter(arc => filterTests.every(test => test(arc)))

    // The result query arcs also hold on to the expanded prim index to allow
    // them to still be queryable even if this query object itself is
    // destroyed.
    for (const compArc of filteredArcs) compArc._primIndex = this._expandedPrimIndex
    return filteredArcs
  }
}

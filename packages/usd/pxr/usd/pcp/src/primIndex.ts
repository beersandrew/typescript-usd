// Ported from OpenUSD 26.11.1: pxr/usd/pcp/primIndex.cpp,
//  pxr/usd/pcp/primIndex.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// PcpPrimIndex and the prim indexing algorithm. Port of OpenUSD v26.08
// pxr/usd/pcp/primIndex.{h,cpp}.
//
// Indexing is synchronous. Layers are acquired through the cache's
// PcpLayerSource; a layer that still needs an asynchronous load throws
// PcpNeedsLayer out of the computation and the cache retries it.

import { SdfPath } from 'typescript-usd/sdf/path'
import {
  type SdfLayerOffset, SDF_LAYER_OFFSET_IDENTITY, sdfLayerOffsetCompose,
  sdfLayerOffsetInverse,
} from 'typescript-usd/sdf/layerOffset'
import { _sdfCreateLayerIdentifier, _sdfLoadedFileFormatForPath, _sdfSplitLayerIdentifier } from 'typescript-usd/sdf/_internal'
import {
  PcpArcType, type PcpArc, pcpIsClassBasedArc, pcpIsSpecializeArc,
} from './arc.ts'
import {
  PcpArcInfo, type PcpReference,
  pcpComposeSiteChildNames, pcpComposeSiteHasSpecs, pcpComposeSiteHasSymmetry,
  pcpComposeSiteHasValueClips, pcpComposeSiteHasVariantSelections,
  pcpComposeSiteInherits, pcpComposeSitePayloads, pcpComposeSitePermission,
  pcpComposeSitePrimSites, pcpComposeSiteReferences, pcpComposeSiteSpecializes,
  pcpComposeSiteVariantSelection, pcpComposeSiteVariantSetOptions,
  pcpComposeSiteVariantSets,
} from './composeSite.ts'
import { type PcpDependencyFlags, pcpClassifyNodeDependency, pcpNodeIntroducesDependency } from './dependency.ts'
import { PcpDynamicFileFormatContext } from './dynamicFileFormatContext.ts'
import { PcpDynamicFileFormatDependencyData } from './dynamicFileFormatDependencyData.ts'
import { pcpIsDynamicFileFormat, type PcpDynamicFileFormatInterface } from './dynamicFileFormatInterface.ts'
import {
  type PcpError, PcpErrorType, type PcpSiteTrackerSegment,
  pcpErrorArcCycle, pcpErrorArcPermissionDenied, pcpErrorArcToProhibitedChild,
  pcpErrorInconsistentPropertyType, pcpErrorInvalidAssetPath, pcpErrorInvalidPrimPath,
  pcpErrorInvalidReferenceOffset, pcpErrorMutedAssetPath,
  pcpErrorOpinionAtRelocationSource, pcpErrorPrimPermissionDenied,
  pcpErrorUnresolvedPrimPath,
} from './errors.ts'
import { PcpExpressionVariablesDependencyData } from './expressionVariablesDependencyData.ts'
import {
  pcpChildNodeIsInstanceable, pcpInstancingIsEnabled, pcpPrimIndexIsInstanceable,
  pcpTraverseInstanceableStrongToWeak, pcpTraverseInstanceableWeakToStrong,
} from './instancing.ts'
import type { PcpLayerStack, PcpLayerSource } from './layerStack.ts'
import { type PcpLayer, type PcpLayerStackIdentifier, pcpReadField } from './layerStackIdentifier.ts'
import { PcpMapExpression } from './mapExpression.ts'
import { PcpMapFunction } from './mapFunction.ts'
import {
  type PcpNodeRef, pcpGetSubtreeRange, pcpNodeGetNonVariantPathElementCount,
  PcpNodeSubtreeIterator,
} from './node.ts'
import { type Pcp_CompressedSdSite, PcpPrimIndex_Graph, PcpRangeType } from './primIndex_Graph.ts'
import { PcpNodeIterator, PcpNodeRange, PcpPrimIterator, PcpPrimRange } from './iterator.ts'
import { PcpPrimIndex_StackFrame, PcpPrimIndex_StackFrameIterator } from './primIndex_StackFrame.ts'
import { type PcpSite, PcpLayerStackSite, pcpSite } from './site.ts'
import { pcpCompareNodeStrength } from './strengthOrdering.ts'
import { PcpTraversalCache } from './traversalCache.ts'
import {
  pcpEvaluateVariableExpression, pcpFindStartingNodeOfClassHierarchy,
  pcpGetArgumentsForFileFormatTarget, pcpGetDefaultPrimPath,
  pcpIsPropagatedSpecializesNode, pcpIsVariableExpression,
  pcpTranslatePathFromNodeToRootOrClosestNode,
} from './utils.ts'
import { pcpDump } from './diagnostic.ts'

const ABS_ROOT = SdfPath.absoluteRootPath

function toPcpSite(site: PcpLayerStackSite): PcpSite {
  return pcpSite(site.layerStack.identifier, site.path.pathString)
}

const sitesEqual = (a: PcpLayerStackSite, b: PcpLayerStackSite): boolean =>
  a.layerStack === b.layerStack && a.path.pathString === b.path.pathString

const nodeSiteEquals = (node: PcpNodeRef, site: PcpLayerStackSite): boolean =>
  node.getLayerStack() === site.layerStack &&
  node.getPath().pathString === site.path.pathString

// PcpCulledDependency (dependency.h:121-136).
export interface PcpCulledDependency {
  readonly flags: PcpDependencyFlags
  readonly arcType: PcpArcType
  readonly layerStack: PcpLayerStack
  readonly sitePath: SdfPath
  readonly unrelocatedSitePath: SdfPath
  readonly mapToRoot: PcpMapFunction
}

// One opinion site contributing to a prim, strongest first.
export interface PcpPrimStackEntry {
  layer: PcpLayer
  path: SdfPath
  arcType: PcpArcType
  offset: SdfLayerOffset
  /** @internal Position of the node in the prim index's node range. */
  nodeIndex: number
  /** @internal Position of the layer in the node's layer stack. */
  layerIndex: number
}

// The cache services prim indexing requires (PcpCache, as seen by
// primIndex.cpp).
export interface PcpPrimIndexCache {
  getLayerStack(): PcpLayerStack | undefined
  getPrimIndexInputs(): PcpPrimIndexInputs
  findPrimIndex(path: string): PcpPrimIndex | undefined
  isLayerMuted(anchorLayer: PcpLayer, layerId: string): string | undefined
  computeLayerStack(identifier: PcpLayerStackIdentifier, allErrors: PcpError[]): PcpLayerStack
  /** @internal */ _computePrimIndexWithCompatibleInputs(
    path: SdfPath, inputs: PcpPrimIndexInputs, allErrors: PcpError[],
  ): PcpPrimIndex
  /** @internal */ readonly _layerSource: PcpLayerSource
}

// PcpPrimIndexInputs (primIndex.h:349-457).
export class PcpPrimIndexInputs {
  cache: PcpPrimIndexCache | null = null
  variantFallbacks: Readonly<Record<string, readonly string[]>> | null = null
  includedPayloads: ReadonlySet<string> | null = null
  includePayloadPredicate: ((path: string) => boolean) | null = null
  ancestorIsInstanceablePredicate: ((path: string) => boolean) | null = null
  parentIndex: PcpPrimIndex | null = null
  fileFormatTarget = ''
  cull = true
  usd = false

  clone(): PcpPrimIndexInputs {
    return Object.assign(new PcpPrimIndexInputs(), this)
  }

  // IsEquivalentTo (primIndex.cpp:409-419).
  isEquivalentTo(inputs: PcpPrimIndexInputs): boolean {
    const sameFallbacks = (): boolean => {
      const a = this.variantFallbacks ?? {}
      const b = inputs.variantFallbacks ?? {}
      if (a === b) return true
      const keys = Object.keys(a)
      return keys.length === Object.keys(b).length && keys.every(k => {
        const x = a[k]!, y = b[k]
        return y !== undefined && x.length === y.length && x.every((v, i) => v === y[i])
      })
    }
    const samePayloads = (): boolean => {
      const a = this.includedPayloads, b = inputs.includedPayloads
      if (a === b) return true
      const x = a ?? new Set<string>(), y = b ?? new Set<string>()
      return x.size === y.size && [...x].every(p => y.has(p))
    }
    return sameFallbacks() && samePayloads() && this.usd === inputs.usd && this.cull === inputs.cull
  }
}

export class PcpPrimIndex {
  private _graph: PcpPrimIndex_Graph | null = null
  private _localErrors: PcpError[] | null = null
  /**
   * @internal The prim stack (primIndex.h _primStack). USD mode does not
   * retain prim stacks (Pcp_RescanForSpecs, primIndex.cpp:4625-4634), so it
   * stays empty and prim ranges are empty.
   */
  readonly _primStack: readonly Pcp_CompressedSdSite[] = []

  isValid(): boolean { return this._graph !== null }
  setGraph(graph: PcpPrimIndex_Graph): void { this._graph = graph }
  getGraph(): PcpPrimIndex_Graph | null { return this._graph }

  getRootNode(): PcpNodeRef {
    if (!this._graph) throw new Error('Invalid PcpPrimIndex has no root node')
    return this._graph.getRootNode()
  }
  get rootNode(): PcpNodeRef { return this.getRootNode() }

  getPath(): SdfPath { return this._graph ? this._graph.getRootNode().getPath() : SdfPath.emptyPath }
  get path(): string { return this.getPath().pathString }

  // HasSpecs (primIndex.cpp:87-102).
  hasSpecs(): boolean {
    for (const node of this.getNodeRange()) if (node.hasSpecs) return true
    return false
  }

  hasAnyPayloads(): boolean { return this._graph?.hasPayloads() ?? false }
  isUsd(): boolean { return this._graph?.isUsd() ?? false }
  isInstanceable(): boolean { return this._graph?.isInstanceable() ?? false }

  /** @internal GetNodeRange()'s nodes without a range allocation; read-only. */
  _getNodeRefs(): readonly PcpNodeRef[] {
    return this._graph ? this._graph._getAllNodeRefs() : []
  }

  // GetNodeRange (primIndex.cpp:163-175): strength order.
  getNodeRange(rangeType: PcpRangeType = PcpRangeType.All): PcpNodeRange {
    const graph = this._graph
    if (!graph) return new PcpNodeRange()
    const [start, end] = graph.getNodeIndexesForRange(rangeType)
    return new PcpNodeRange(new PcpNodeIterator(graph, start), new PcpNodeIterator(graph, end))
  }

  // GetNodeIteratorAtNode (primIndex.cpp:177-185).
  getNodeIteratorAtNode(node: PcpNodeRef | null): PcpNodeIterator {
    const graph = this._graph
    if (!graph) return new PcpNodeIterator()
    return new PcpNodeIterator(
      graph, node ? graph.getNodeIndexForNode(node) : graph._getNumNodes())
  }

  // GetNodeSubtreeRange (primIndex.cpp:187-199).
  getNodeSubtreeRange(node: PcpNodeRef): PcpNodeRange {
    const graph = this._graph
    if (!graph) return new PcpNodeRange()
    const [start, end] = graph.getNodeIndexesForSubtreeRange(node)
    return new PcpNodeRange(new PcpNodeIterator(graph, start), new PcpNodeIterator(graph, end))
  }

  // GetPrimRange (primIndex.cpp:201-243): the prim stack entries whose nodes
  // are in the given node range.
  getPrimRange(rangeType: PcpRangeType = PcpRangeType.All): PcpPrimRange {
    const graph = this._graph
    if (!graph) return new PcpPrimRange()
    const primStack = this._primStack
    if (rangeType === PcpRangeType.All) {
      return new PcpPrimRange(
        new PcpPrimIterator(this, 0), new PcpPrimIterator(this, primStack.length))
    }
    const [startNodeIdx, endNodeIdx] = graph.getNodeIndexesForRange(rangeType)
    for (let startPrimIdx = 0; startPrimIdx < primStack.length; ++startPrimIdx) {
      const startPrim = primStack[startPrimIdx]!
      if (startPrim.nodeIndex >= startNodeIdx && startPrim.nodeIndex < endNodeIdx) {
        let endPrimIdx = startPrimIdx + 1
        for (; endPrimIdx < primStack.length; ++endPrimIdx) {
          const endPrim = primStack[endPrimIdx]!
          if (endPrim.nodeIndex >= endNodeIdx) break
        }
        return new PcpPrimRange(
          new PcpPrimIterator(this, startPrimIdx), new PcpPrimIterator(this, endPrimIdx))
      }
    }
    return new PcpPrimRange(
      new PcpPrimIterator(this, primStack.length), new PcpPrimIterator(this, primStack.length))
  }

  // GetPrimRangeForNode (primIndex.cpp:245-270).
  getPrimRangeForNode(node: PcpNodeRef): PcpPrimRange {
    const firstIt = new PcpPrimIterator(this, 0)
    const endIt = new PcpPrimIterator(this, this._primStack.length)
    while (!firstIt.equals(endIt) && !firstIt.getNode().equals(node)) firstIt.increment()
    if (firstIt.equals(endIt)) return new PcpPrimRange()
    const lastIt = firstIt.clone()
    while (!lastIt.increment().equals(endIt) && lastIt.getNode().equals(node)) {
      // Do nothing
    }
    return new PcpPrimRange(firstIt, lastIt)
  }

  // GetNodeProvidingSpec (primIndex.cpp:278-293).
  getNodeProvidingSpec(layer: PcpLayer, path: SdfPath | string): PcpNodeRef | null {
    const key = typeof path === 'string' ? path : path.pathString
    for (const node of this.getNodeRange()) {
      if (node.canContributeSpecs() && node.getPath().pathString === key &&
          node.getLayerStack().hasLayer(layer)) return node
    }
    return null
  }

  get localErrors(): readonly PcpError[] { return this._localErrors ?? [] }
  getLocalErrors(): PcpError[] { return this._localErrors ? [...this._localErrors] : [] }

  /** @internal */
  _recordLocalError(error: PcpError): void {
    (this._localErrors ??= []).push(error)
  }

  dumpToString(includeInheritOriginInfo = true, includeMaps = true): string {
    return pcpDump(this, includeInheritOriginInfo, includeMaps)
  }

  // ComposeAuthoredVariantSelections (primIndex.cpp:295-338): the
  // selections according to the prim stack, which USD mode does not retain.
  composeAuthoredVariantSelections(): Record<string, string> {
    const result: Record<string, string> = {}
    const range = this.getPrimRange()
    for (const i = range.first; !i.equals(range.second); i.increment()) {
      const site = i.deref()
      const raw = pcpReadField(site.layer, site.path.pathString, 'variantSelection')
      if (!raw || typeof raw !== 'object') continue
      const vselMap: Record<string, string> = {}
      for (const [set, value] of Object.entries(raw as Record<string, unknown>)) {
        let vsel = Array.isArray(value) ? value[0] : value
        if (typeof vsel !== 'string') continue
        if (pcpIsVariableExpression(vsel)) {
          const exprErrors: PcpError[] = []
          vsel = pcpEvaluateVariableExpression(
            vsel, i.getNode().getLayerStack().expressionVariables, 'variant', site.layer,
            site.path, undefined, exprErrors)
          if (exprErrors.length > 0) continue
        }
        vselMap[set] = vsel as string
      }
      for (const [set, vsel] of Object.entries(vselMap)) {
        if (!(set in result)) result[set] = vsel
      }
    }
    return result
  }

  // GetSelectionAppliedForVariantSet (primIndex.cpp:340-353).
  getSelectionAppliedForVariantSet(variantSet: string): string {
    for (const node of this.getNodeRange()) {
      if (node.getPath().isPrimVariantSelectionPath()) {
        const [set, sel] = node.getPath().getVariantSelection()
        if (set === variantSet) return sel
      }
    }
    return ''
  }

  // AddChildPrimIndex (primIndex.cpp:355-391).
  addChildPrimIndex(
    arcToParent: PcpArc, childPrimIndex: PcpPrimIndex, error?: { value?: PcpError },
  ): PcpNodeRef | null {
    const parent = arcToParent.parent!
    const newNode = parent.insertChildSubgraph(childPrimIndex.getGraph()!, arcToParent, error)
    if (!newNode) return newNode
    if (childPrimIndex.getGraph()!.hasPayloads()) parent.getOwningGraph().setHasPayloads(true)
    if (childPrimIndex._localErrors) {
      (this._localErrors ??= []).push(...childPrimIndex._localErrors)
    }
    return newNode
  }

  // ComputePrimChildNames (primIndex.cpp:5782-5791). Returns the composed
  // names; prohibited names are added to `prohibitedNameSet`.
  computePrimChildNames(prohibitedNameSet: Set<string> = new Set()): string[] {
    const nameOrder: string[] = []
    if (!this._graph) return nameOrder
    computePrimChildNamesInSubtreeImpl(this, this.getRootNode(), nameOrder, prohibitedNameSet)
    return nameOrder
  }

  computePrimChildNamesInSubtree(
    subtreeRootNode: PcpNodeRef, prohibitedNameSet: Set<string> = new Set(),
  ): string[] {
    const nameOrder: string[] = []
    if (!this._graph || subtreeRootNode.getOwningGraph() !== this._graph) return nameOrder
    computePrimChildNamesInSubtreeImpl(this, subtreeRootNode, nameOrder, prohibitedNameSet)
    return nameOrder
  }

  // ComputePrimPropertyNames (primIndex.cpp:5810-5826).
  computePrimPropertyNames(): string[] {
    const nameOrder: string[] = []
    if (!this._graph) return nameOrder
    composePrimPropertyNames(this.getRootNode(), this.isUsd(), nameOrder, new Set())
    return nameOrder
  }

  // The contributing prim specs strongest first, with each spec's cumulative
  // time offset to the prim index root (PcpComputePrimStackForPrimIndex in
  // USD mode, primIndex.cpp:5828-5862).
  composePrimStack(): PcpPrimStackEntry[] {
    const out: PcpPrimStackEntry[] = []
    const nodes = this.getNodeRange()
    for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
      const node = nodes[nodeIndex]!
      if (!node.canContributeSpecs()) continue
      const path = node.getPath()
      const key = path.pathString
      const arcOffset = node.getMapToRoot().evaluate().getTimeOffset()
      const layers = node.getLayerStack().layers
      for (let layerIndex = 0; layerIndex < layers.length; layerIndex++) {
        const { layer, offset } = layers[layerIndex]!
        if (!layer.hasSpec(key)) continue
        out.push({
          layer, path, arcType: node.getArcType(),
          offset: sdfLayerOffsetCompose(arcOffset, offset), nodeIndex, layerIndex,
        })
      }
    }
    return out
  }

  // The property specs for `propName` strongest first, over the same node
  // walk as composePrimStack. PcpBuildPrimPropertyIndex is the validated
  // form (propertyIndex.ts).
  composePropertyStack(propName: string): PcpPrimStackEntry[] {
    const out: PcpPrimStackEntry[] = []
    const nodes = this.getNodeRange()
    for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
      const node = nodes[nodeIndex]!
      if (!node.canContributeSpecs()) continue
      const propPath = node.getPath().appendProperty(propName)
      const key = propPath.pathString
      const arcOffset = node.getMapToRoot().evaluate().getTimeOffset()
      const layers = node.getLayerStack().layers
      for (let layerIndex = 0; layerIndex < layers.length; layerIndex++) {
        const { layer, offset } = layers[layerIndex]!
        if (!layer.hasSpec(key)) continue
        out.push({
          layer, path: propPath, arcType: node.getArcType(),
          offset: sdfLayerOffsetCompose(arcOffset, offset), nodeIndex, layerIndex,
        })
      }
    }
    return out
  }
}

// PcpPrimIndexOutputs (primIndex.h:290-345).
export class PcpPrimIndexOutputs {
  primIndex = new PcpPrimIndex()
  allErrors: PcpError[] = []
  payloadState: PcpPrimIndexOutputs.PayloadState = PcpPrimIndexOutputs.PayloadState.NoPayload
  dynamicFileFormatDependency = new PcpDynamicFileFormatDependencyData()
  expressionVariablesDependency = new PcpExpressionVariablesDependencyData()
  culledDependencies: PcpCulledDependency[] = []

  // Append (primIndex.cpp:423-466).
  append(
    childOutputs: PcpPrimIndexOutputs, arcToParent: PcpArc, error?: { value?: PcpError },
  ): PcpNodeRef | null {
    const newNode = this.primIndex.addChildPrimIndex(arcToParent, childOutputs.primIndex, error)
    if (!newNode) return newNode
    this.dynamicFileFormatDependency.appendDependencyData(childOutputs.dynamicFileFormatDependency)
    this.expressionVariablesDependency.appendDependencyData(childOutputs.expressionVariablesDependency)
    this.culledDependencies.push(...childOutputs.culledDependencies)
    this.allErrors.push(...childOutputs.allErrors)
    if (childOutputs.payloadState === PcpPrimIndexOutputs.PayloadState.NoPayload) {
      // Keep ours.
    } else if (this.payloadState === PcpPrimIndexOutputs.PayloadState.NoPayload) {
      this.payloadState = childOutputs.payloadState
    }
    return newNode
  }
}

export namespace PcpPrimIndexOutputs {
  // PcpPrimIndexOutputs::PayloadState (primIndex.h:310-314).
  export enum PayloadState {
    NoPayload = 'noPayload',
    IncludedByIncludeSet = 'includedByIncludeSet',
    ExcludedByIncludeSet = 'excludedByIncludeSet',
    IncludedByPredicate = 'includedByPredicate',
    ExcludedByPredicate = 'excludedByPredicate',
  }
}

// ---------------------------------------------------------------------------
// Tasks (primIndex.cpp:693-933)

const enum TaskType {
  EvalNodeRelocations = 1 << 0,
  EvalImpliedRelocations = 1 << 1,
  EvalNodeReferences = 1 << 2,
  EvalNodePayloads = 1 << 3,
  EvalNodeInherits = 1 << 4,
  EvalNodeSpecializes = 1 << 5,
  EvalImpliedSpecializes = 1 << 6,
  EvalImpliedClasses = 1 << 7,
  EvalNodeAncestralVariantSets = 1 << 8,
  EvalNodeAncestralVariantAuthored = 1 << 9,
  EvalNodeAncestralVariantFallback = 1 << 10,
  EvalNodeAncestralVariantNoneFound = 1 << 11,
  EvalNodeAncestralDynamicPayloads = 1 << 12,
  EvalNodeVariantSets = 1 << 13,
  EvalNodeVariantAuthored = 1 << 14,
  EvalNodeVariantFallback = 1 << 15,
  EvalNodeVariantNoneFound = 1 << 16,
  EvalNodeDynamicPayloads = 1 << 17,
  EvalUnresolvedPrimPathError = 1 << 18,
  None = 0,
}

type Tasks = number
const AllTasks: Tasks = ~0
const VariantsAndDynamicPayloadTasks: Tasks =
  TaskType.EvalNodeVariantSets | TaskType.EvalNodeDynamicPayloads
const AncestralVariantsAndDynamicPayloadTasks: Tasks =
  TaskType.EvalNodeAncestralVariantSets | TaskType.EvalNodeAncestralDynamicPayloads
const ExpressedArcTasks: Tasks =
  TaskType.EvalNodeSpecializes | TaskType.EvalNodeInherits | TaskType.EvalNodePayloads |
  TaskType.EvalNodeReferences | TaskType.EvalNodeRelocations

interface Task {
  type: TaskType
  node: PcpNodeRef | null
  vsetNum: number
  vsetName: string
  vsetPath: SdfPath
}

function makeTask(
  type: TaskType, node: PcpNodeRef | null = null,
  vsetPath: SdfPath = SdfPath.emptyPath, vsetName = '', vsetNum = 0,
): Task {
  return { type, node, vsetNum, vsetName, vsetPath }
}

const taskKey = (t: Task): string =>
  `${t.type}\0${t.node ? t.node._getNodeIndex() : -1}\0${t.vsetNum}\0${t.vsetName}\0${t.vsetPath.pathString}`

const nodeIndex = (n: PcpNodeRef | null): number => n ? n._getNodeIndex() : -1

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

// Task::PriorityOrder (primIndex.cpp:760-859): true when `a` has lower
// priority than `b`.
function taskLowerPriority(a: Task, b: Task): boolean {
  if (a.type !== b.type) return a.type > b.type
  switch (a.type) {
    case TaskType.EvalNodeAncestralDynamicPayloads:
    case TaskType.EvalNodeDynamicPayloads:
      return pcpCompareNodeStrength(a.node!, b.node!) === 1
    case TaskType.EvalNodeAncestralVariantAuthored:
    case TaskType.EvalNodeAncestralVariantFallback:
    case TaskType.EvalNodeVariantAuthored:
    case TaskType.EvalNodeVariantFallback:
      if (a.node !== b.node) return pcpCompareNodeStrength(a.node!, b.node!) === 1
      {
        const c = compareStrings(a.vsetPath.pathString, b.vsetPath.pathString)
        return c !== 0 ? c > 0 : a.vsetNum > b.vsetNum
      }
    case TaskType.EvalNodeAncestralVariantNoneFound:
    case TaskType.EvalNodeVariantNoneFound: {
      const n = nodeIndex(a.node) - nodeIndex(b.node)
      if (n !== 0) return n > 0
      const c = compareStrings(a.vsetPath.pathString, b.vsetPath.pathString)
      return c !== 0 ? c > 0 : a.vsetNum > b.vsetNum
    }
    case TaskType.EvalImpliedClasses: {
      const isAncestorAndDescendant = (x: PcpNodeRef, y: PcpNodeRef): boolean => {
        for (let n: PcpNodeRef = y; !n.isRootNode(); n = n.getParentNode()!) {
          if (x === n) return true
        }
        return false
      }
      if (nodeIndex(b.node) > nodeIndex(a.node) && isAncestorAndDescendant(a.node!, b.node!)) {
        return true
      } else if (nodeIndex(a.node) > nodeIndex(b.node) &&
                 isAncestorAndDescendant(b.node!, a.node!)) {
        return false
      }
      return pcpCompareNodeStrength(a.node!, b.node!) === 1
    }
    default:
      return nodeIndex(a.node) > nodeIndex(b.node)
  }
}

const isImpliedTaskType = (type: TaskType): boolean =>
  type === TaskType.EvalImpliedClasses || type === TaskType.EvalImpliedSpecializes

// _ScanArcs (primIndex.cpp:935-996).
function scanArcs(node: PcpNodeRef): Tasks {
  let tasks = AllTasks
  tasks &= ~TaskType.EvalNodeRelocations
  tasks &= ~TaskType.EvalNodeInherits
  tasks &= ~TaskType.EvalNodeVariantSets
  tasks &= ~TaskType.EvalNodeReferences
  tasks &= ~TaskType.EvalNodePayloads
  tasks &= ~TaskType.EvalNodeDynamicPayloads
  tasks &= ~TaskType.EvalNodeSpecializes
  if (!node.canContributeSpecs()) return tasks
  if (node.getLayerStack().hasRelocates) tasks |= TaskType.EvalNodeRelocations
  if (!node.hasSpecs) return tasks
  const path = node.getPath().pathString
  for (const { layer } of node.getLayerStack().layers) {
    if (!layer.hasSpec(path)) continue
    if (pcpReadField(layer, path, 'inheritPaths') != null) tasks |= TaskType.EvalNodeInherits
    if (pcpReadField(layer, path, 'variantSetNames') != null) tasks |= TaskType.EvalNodeVariantSets
    if (pcpReadField(layer, path, 'references') != null) tasks |= TaskType.EvalNodeReferences
    if (pcpReadField(layer, path, 'payload') != null) {
      tasks |= TaskType.EvalNodePayloads
      tasks |= TaskType.EvalNodeDynamicPayloads
    }
    if (pcpReadField(layer, path, 'specializes') != null) tasks |= TaskType.EvalNodeSpecializes
  }
  return tasks
}

// _ScanAncestralArcs (primIndex.cpp:998-1045).
function scanAncestralArcs(node: PcpNodeRef): Tasks {
  let tasks = AllTasks
  tasks &= ~TaskType.EvalNodeAncestralVariantSets
  tasks &= ~TaskType.EvalNodeAncestralDynamicPayloads
  if (node.getPath().isAbsoluteRootPath()) return tasks
  let path = node.getPath().getParentPath()
  const restrictedDepth = node.getSpecContributionRestrictedDepth()
  if (restrictedDepth !== 0) {
    for (let n = path.pathElementCount; n >= restrictedDepth && !path.isAbsoluteRootPath();
      --n, path = path.getParentPath()) { /* skip restricted levels */ }
  }
  const layers = node.getLayerStack().layers
  for (; !path.isAbsoluteRootPath(); path = path.getParentPath()) {
    const key = path.pathString
    for (const { layer } of layers) {
      if (pcpReadField(layer, key, 'payload') != null) {
        tasks |= TaskType.EvalNodeAncestralDynamicPayloads
      }
      if (pcpReadField(layer, key, 'variantSetNames') != null) {
        tasks |= TaskType.EvalNodeAncestralVariantSets
      }
    }
  }
  return tasks
}

// _VariantSelectionInfo (primIndex.cpp:1135-1144).
interface VariantSelectionInfo {
  sitePath: SdfPath
  status: 'authored' | 'none' | 'unknown'
}

// ---------------------------------------------------------------------------
// Pcp_PrimIndexer (primIndex.cpp:1070-1535)

class Pcp_PrimIndexer {
  private readonly _tasks: Task[] = []
  private readonly _taskUniq = new Set<string>()
  private _variantTraversalCaches: Map<string, PcpTraversalCache<VariantSelectionInfo>> | undefined

  constructor(
    readonly inputs: PcpPrimIndexInputs,
    readonly outputs: PcpPrimIndexOutputs,
    readonly rootSite: PcpLayerStackSite,
    readonly ancestorRecursionDepth: number,
    readonly previousFrame: PcpPrimIndex_StackFrame | null = null,
    readonly evaluateImpliedSpecializes = true,
    readonly evaluateVariantsAndDynamicPayloads = true,
  ) {}

  getOriginatingIndex(): PcpPrimIndex {
    return this.previousFrame?.originatingIndex ?? this.outputs.primIndex
  }

  getVariantTraversalCache(
    node: PcpNodeRef, pathInNode: SdfPath,
  ): PcpTraversalCache<VariantSelectionInfo> {
    this._variantTraversalCaches ??= new Map()
    const key = `${node._getNodeIndex()}\0${pathInNode.pathString}`
    let cache = this._variantTraversalCaches.get(key)
    if (!cache) {
      cache = new PcpTraversalCache<VariantSelectionInfo>(
        node, pathInNode, () => ({ sitePath: SdfPath.emptyPath, status: 'unknown' }))
      this._variantTraversalCaches.set(key, cache)
    }
    return cache
  }

  // _MapPathToNodeParentPayloadInclusionPath (primIndex.cpp:1190-1216).
  static mapPathToNodeParentPayloadInclusionPath(
    mapToParentExpr: PcpMapExpression, arcType: PcpArcType, path: SdfPath,
  ): SdfPath {
    const mapToParent = mapToParentExpr.evaluate()
    const isInternalReferenceOrPayload = mapToParent.hasRootIdentity() &&
      (arcType === PcpArcType.Reference || arcType === PcpArcType.Payload)
    if (isInternalReferenceOrPayload) {
      const sourceToTarget = mapToParent.getSourceToTargetMap()
      sourceToTarget.delete('/')
      return PcpMapFunction.create(sourceToTarget, mapToParent.getTimeOffset())
        .mapSourceToTarget(path)
    }
    return mapToParent.mapSourceToTarget(path)
  }

  // _MapPathToNodeRootPayloadInclusionPath (primIndex.cpp:1218-1244).
  static mapPathToNodeRootPayloadInclusionPath(node: PcpNodeRef, path: SdfPath): SdfPath {
    const mapToRoot = node.getMapToRoot().evaluate()
    let mappedPath = mapToRoot.mapSourceToTarget(path)
    if (mappedPath.pathString === path.pathString && mapToRoot.hasRootIdentity()) {
      for (let cur: PcpNodeRef = node; !mappedPath.isEmpty() && !cur.isRootNode();
        cur = cur.getParentNode()!) {
        mappedPath = Pcp_PrimIndexer.mapPathToNodeParentPayloadInclusionPath(
          cur.getMapToParent(), cur.getArcType(), mappedPath)
      }
    }
    return mappedPath
  }

  // MapNodePathToPayloadInclusionPath (primIndex.cpp:1246-1276).
  mapNodePathToPayloadInclusionPath(node: PcpNodeRef, path: SdfPath): SdfPath {
    let p = Pcp_PrimIndexer.mapPathToNodeRootPayloadInclusionPath(
      node, path.stripAllVariantSelections())
    const it = new PcpPrimIndex_StackFrameIterator(node, this.previousFrame)
    for (; !p.isEmpty() && it.previousFrame; it.nextFrame()) {
      p = Pcp_PrimIndexer.mapPathToNodeParentPayloadInclusionPath(
        it.previousFrame.arcToParent.mapToParent, it.previousFrame.arcToParent.type, p)
      p = Pcp_PrimIndexer.mapPathToNodeRootPayloadInclusionPath(it.previousFrame.parentNode, p)
    }
    return p
  }

  // AddTask (primIndex.cpp:1284-1296).
  addTask(task: Task): void {
    if (isImpliedTaskType(task.type)) {
      const key = taskKey(task)
      if (this._taskUniq.has(key)) return
      this._taskUniq.add(key)
    }
    this._tasks.push(task)
    this._siftUp(this._tasks.length - 1)
  }

  // PopTask (primIndex.cpp:1298-1310).
  popTask(): Task {
    const tasks = this._tasks
    if (tasks.length === 0) return makeTask(TaskType.None)
    const top = tasks[0]!
    const last = tasks.pop()!
    if (tasks.length > 0) {
      tasks[0] = last
      this._siftDown(0)
    }
    if (isImpliedTaskType(top.type)) this._taskUniq.delete(taskKey(top))
    return top
  }

  private _siftUp(index: number): void {
    const tasks = this._tasks
    const task = tasks[index]!
    while (index > 0) {
      const parent = (index - 1) >> 1
      if (!taskLowerPriority(tasks[parent]!, task)) break
      tasks[index] = tasks[parent]!
      index = parent
    }
    tasks[index] = task
  }

  private _siftDown(index: number): void {
    const tasks = this._tasks
    const n = tasks.length
    const task = tasks[index]!
    for (;;) {
      let child = 2 * index + 1
      if (child >= n) break
      if (child + 1 < n && taskLowerPriority(tasks[child]!, tasks[child + 1]!)) child++
      if (!taskLowerPriority(task, tasks[child]!)) break
      tasks[index] = tasks[child]!
      index = child
    }
    tasks[index] = task
  }

  // _AddTasksForNodeRecursively (primIndex.cpp:1312-1378).
  private _addTasksForNodeRecursively(n: PcpNodeRef, tasks: Tasks): void {
    for (const child of n.getChildren()) this._addTasksForNodeRecursively(child, tasks)
    if ((tasks & TaskType.EvalUnresolvedPrimPathError) &&
        n.getArcType() !== PcpArcType.Reference && n.getArcType() !== PcpArcType.Payload) {
      tasks &= ~TaskType.EvalUnresolvedPrimPathError
    }
    if ((tasks & TaskType.EvalImpliedRelocations) && n.getArcType() !== PcpArcType.Relocate) {
      tasks &= ~TaskType.EvalImpliedRelocations
    }
    tasks &= scanArcs(n)
    if (tasks & AncestralVariantsAndDynamicPayloadTasks) tasks &= scanAncestralArcs(n)
    for (const t of [
      TaskType.EvalUnresolvedPrimPathError,
      TaskType.EvalNodeVariantSets,
      TaskType.EvalNodeDynamicPayloads,
      TaskType.EvalNodeAncestralDynamicPayloads,
      TaskType.EvalNodeAncestralVariantSets,
      TaskType.EvalNodeSpecializes,
      TaskType.EvalNodeInherits,
      TaskType.EvalNodePayloads,
      TaskType.EvalNodeReferences,
      TaskType.EvalNodeRelocations,
      TaskType.EvalImpliedRelocations,
    ]) {
      if (tasks & t) this.addTask(makeTask(t, n))
    }
  }

  // AddTasksForRootNode (primIndex.cpp:1380-1395).
  addTasksForRootNode(rootNode: PcpNodeRef): void {
    let tasks = AllTasks
    tasks &= ~AncestralVariantsAndDynamicPayloadTasks
    tasks &= ~TaskType.EvalUnresolvedPrimPathError
    if (!this.evaluateVariantsAndDynamicPayloads) tasks &= ~VariantsAndDynamicPayloadTasks
    this._addTasksForNodeRecursively(rootNode, tasks)
  }

  // AddTasksForNode (primIndex.cpp:1410-1463).
  addTasksForNode(n: PcpNodeRef, tasks: Tasks): void {
    if (tasks & TaskType.EvalImpliedClasses) {
      if (pcpIsClassBasedArc(n.getArcType())) {
        const base = findStartingNodeForImpliedClasses(n)
        if (base) this.addTask(makeTask(TaskType.EvalImpliedClasses, base))
      } else if (hasClassBasedChild(n)) {
        this.addTask(makeTask(TaskType.EvalImpliedClasses, n))
      }
    }
    if (tasks & TaskType.EvalImpliedSpecializes) {
      if (this.evaluateImpliedSpecializes && hasSpecializesChildInSubtree(n)) {
        this.addTask(makeTask(TaskType.EvalImpliedSpecializes, n))
      }
    }
    if (!this.evaluateVariantsAndDynamicPayloads) tasks &= ~VariantsAndDynamicPayloadTasks
    if (this.previousFrame) tasks &= ~TaskType.EvalUnresolvedPrimPathError
    this._addTasksForNodeRecursively(n, tasks)
  }

  // RetryVariantTasks (primIndex.cpp:1477-1503).
  retryVariantTasks(): void {
    const tasks = this._tasks
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i]!
      if (t.type === TaskType.EvalNodeVariantFallback ||
          t.type === TaskType.EvalNodeVariantNoneFound) {
        t.type = TaskType.EvalNodeVariantAuthored
        this._siftUp(i)
      } else if (t.type === TaskType.EvalNodeAncestralVariantFallback ||
                 t.type === TaskType.EvalNodeAncestralVariantNoneFound) {
        t.type = TaskType.EvalNodeAncestralVariantAuthored
        this._siftUp(i)
      }
    }
  }

  recordError(err: PcpError): void {
    Pcp_PrimIndexer.recordError(err, this.outputs.primIndex, this.outputs.allErrors)
  }

  // RecordError (primIndex.cpp:1511-1534): capacity errors at most once.
  static recordError(err: PcpError, primIndex: PcpPrimIndex, allErrors: PcpError[]): void {
    if (err.errorType === PcpErrorType.IndexCapacityExceeded ||
        err.errorType === PcpErrorType.ArcCapacityExceeded ||
        err.errorType === PcpErrorType.ArcNamespaceDepthCapacityExceeded) {
      if (allErrors.some(e => e.errorType === err.errorType)) return
    }
    allErrors.push(err)
    primIndex._recordLocalError(err)
  }
}

// ---------------------------------------------------------------------------
// Graph helpers

function hasSpecializesChildInSubtree(parent: PcpNodeRef): boolean {
  for (const child of pcpGetSubtreeRange(parent)) {
    if (pcpIsSpecializeArc(child.getArcType())) return true
  }
  return false
}

// _GetPropagatedSpecializesNode (primIndex.cpp:501-525).
function getPropagatedSpecializesNode(node: PcpNodeRef): PcpNodeRef | null {
  if (!pcpIsSpecializeArc(node.getArcType())) return null
  for (let rootChild = node.getRootNode()._lastChild(); rootChild;
    rootChild = rootChild._prevSibling()) {
    if (rootChild.getArcType() < PcpArcType.Specialize) break
    if (rootChild.getOriginNode() === node && pcpIsPropagatedSpecializesNode(rootChild)) {
      return rootChild
    }
  }
  return null
}

// _HasClassBasedChild (primIndex.cpp:527-543).
function hasClassBasedChild(p: PcpNodeRef): boolean {
  const check = (parent: PcpNodeRef): boolean => {
    for (let child = parent._firstChild(); child; child = child._nextSibling()) {
      if (pcpIsClassBasedArc(child.getArcType())) return true
    }
    return false
  }
  const propagated = getPropagatedSpecializesNode(p)
  return check(propagated ?? p)
}

// _FindStartingNodeForImpliedClasses (primIndex.cpp:619-654).
function findStartingNodeForImpliedClasses(n: PcpNodeRef): PcpNodeRef {
  let startNode = n
  while (pcpIsClassBasedArc(startNode.getArcType())) {
    const [instanceNode, classNode] = pcpFindStartingNodeOfClassHierarchy(startNode)
    startNode = instanceNode
    if (pcpIsClassBasedArc(instanceNode.getArcType())) {
      const ancestralClassPath = instanceNode.getPathAtIntroduction()
      if (classNode && classNode.getPath().hasPrefix(ancestralClassPath)) break
    }
  }
  return startNode
}

// _CreateMapExpressionForArc (primIndex.cpp:656-689).
function createMapExpressionForArc(
  sourcePath: SdfPath, targetNodePath: SdfPath, targetNode: PcpNodeRef,
  offset: SdfLayerOffset = SDF_LAYER_OFFSET_IDENTITY,
): PcpMapExpression {
  const targetPath = targetNodePath.stripAllVariantSelections()
  let arcExpr = PcpMapExpression.constant(
    PcpMapFunction.create([[sourcePath, targetPath]], offset))
  const reloMapExpr = targetNode.getLayerStack().getExpressionForRelocatesAtPath(targetPath)
  if (!reloMapExpr.isNull()) arcExpr = reloMapExpr.compose(arcExpr)
  return arcExpr
}

// _InertSubtree (primIndex.cpp:1537-1546).
function inertSubtree(node: PcpNodeRef): void {
  node.setInert(true)
  for (const child of node.getChildren()) inertSubtree(child)
}

// _HasAncestorCycle (primIndex.cpp:1548-1559).
function hasAncestorCycle(parentSite: PcpLayerStackSite, childSite: PcpLayerStackSite): boolean {
  return parentSite.layerStack === childSite.layerStack &&
    (parentSite.path.hasPrefix(childSite.path) || childSite.path.hasPrefix(parentSite.path))
}

function findAncestorCycleInParentGraph(parentNode: PcpNodeRef, childSite: PcpLayerStackSite): boolean {
  for (let node: PcpNodeRef | null = parentNode; node; node = node.getParentNode()) {
    if (hasAncestorCycle(node.getSite(), childSite)) return true
  }
  return false
}

function isImpliedClassBasedArc(arcType: PcpArcType, parent: PcpNodeRef, origin: PcpNodeRef | null): boolean {
  return pcpIsClassBasedArc(arcType) && parent !== origin
}

// _CheckForCycle (primIndex.cpp:1583-1701).
function checkForCycle(
  parent: PcpNodeRef, origin: PcpNodeRef | null, arcType: PcpArcType,
  childSite: PcpLayerStackSite, previousFrame: PcpPrimIndex_StackFrame | null,
): PcpError | null {
  if (isImpliedClassBasedArc(arcType, parent, origin)) {
    const j = new PcpPrimIndex_StackFrameIterator(parent, previousFrame)
    while (j.node && isImpliedClassBasedArc(j.getArcType(), parent, origin)) j.next()
    if (j.node && j.getArcType() === PcpArcType.Relocate) return null
  }
  if (arcType === PcpArcType.Variant) return null

  let foundCycle = false
  let childSiteInStackFrame = new PcpLayerStackSite(childSite.layerStack, childSite.path)
  for (const it = new PcpPrimIndex_StackFrameIterator(parent, previousFrame); it.node; it.nextFrame()) {
    if (findAncestorCycleInParentGraph(it.node, childSiteInStackFrame)) {
      foundCycle = true
      break
    }
    if (it.previousFrame) {
      const requested = it.previousFrame.requestedSite.path
      const current = it.node.getRootNode().getPath()
      childSiteInStackFrame = new PcpLayerStackSite(childSiteInStackFrame.layerStack,
        current.pathString === childSiteInStackFrame.path.pathString
          ? requested
          : requested.replacePrefix(current, childSiteInStackFrame.path))
    }
  }
  if (!foundCycle) return null

  const cycle: PcpSiteTrackerSegment[] = []
  for (const i = new PcpPrimIndex_StackFrameIterator(parent, previousFrame); i.node; i.next()) {
    cycle.push({ site: toPcpSite(i.node.getSite()), arcType: i.getArcType() })
  }
  cycle.reverse()
  cycle.push({ site: toPcpSite(childSite), arcType })
  return pcpErrorArcCycle(cycle)
}

// _ArcOptions (primIndex.cpp:1703-1733).
interface ArcOptions {
  directNodeShouldContributeSpecs: boolean
  includeAncestralOpinions: boolean
  skipDuplicateNodes: boolean
  copyAncestorFlagFromOrigin: boolean
  tasks: Tasks
}

function arcOptions(overrides: Partial<ArcOptions> = {}): ArcOptions {
  return {
    directNodeShouldContributeSpecs: true,
    includeAncestralOpinions: false,
    skipDuplicateNodes: false,
    copyAncestorFlagFromOrigin: false,
    tasks: AllTasks,
    ...overrides,
  }
}

// _AddArc (primIndex.cpp:1735-2077).
function addArcAtDepth(
  indexer: Pcp_PrimIndexer, arcType: PcpArcType, parent: PcpNodeRef,
  origin: PcpNodeRef | null, site: PcpLayerStackSite, mapExpr: PcpMapExpression,
  arcSiblingNum: number, namespaceDepth: number, opts: ArcOptions = arcOptions(),
): PcpNodeRef | null {
  if (mapExpr.isNull()) return null

  const cycleError = checkForCycle(parent, origin, arcType, site, indexer.previousFrame)
  if (cycleError) {
    indexer.recordError(cycleError)
    return null
  }

  if (indexer.previousFrame) {
    opts = { ...opts, skipDuplicateNodes: opts.skipDuplicateNodes || indexer.previousFrame.skipDuplicateNodes }
  }

  if (opts.skipDuplicateNodes) {
    let siteToAdd = site
    let foundDuplicate = false
    for (const it = new PcpPrimIndex_StackFrameIterator(parent, indexer.previousFrame);
      it.node; it.nextFrame()) {
      const currentGraph = it.node.getOwningGraph()
      if (currentGraph.getNodeUsingSite(siteToAdd)) {
        foundDuplicate = true
        break
      }
      if (it.previousFrame) {
        const requested = it.previousFrame.requestedSite.path
        const current = currentGraph.getRootNode().getPath()
        siteToAdd = new PcpLayerStackSite(siteToAdd.layerStack,
          requested.replacePrefix(current, siteToAdd.path))
      }
    }
    if (foundDuplicate) return null
  }

  const newArc: PcpArc = {
    type: arcType, mapToParent: mapExpr, parent, origin,
    namespaceDepth, siblingNumAtOrigin: arcSiblingNum,
  }

  let newNode: PcpNodeRef | null
  const newNodeError: { value?: PcpError } = {}
  if (!opts.includeAncestralOpinions) {
    newNode = parent.insertChild(site, newArc, newNodeError)
    if (newNode) {
      if (!opts.directNodeShouldContributeSpecs) {
        newNode.setInert(true)
        newNode.setSpecContributionRestrictedDepth(1)
      }
      newNode.setHasSpecs(pcpComposeSiteHasSpecs(newNode.getLayerStack(), newNode.getPath()))
      if (!newNode.isInert && newNode.hasSpecs) {
        if (indexer.inputs.usd) {
          newNode.setHasValueClips(
            pcpComposeSiteHasValueClips(newNode.getLayerStack(), newNode.getPath()))
        } else {
          newNode.setPermission(pcpComposeSitePermission(site.layerStack, site.path))
          newNode.setHasSymmetry(pcpComposeSiteHasSymmetry(site.layerStack, site.path))
        }
      }
    }
  } else {
    const frame = new PcpPrimIndex_StackFrame(
      site, parent, newArc, indexer.previousFrame,
      indexer.getOriginatingIndex(), opts.skipDuplicateNodes)
    const childOutputs = new PcpPrimIndexOutputs()
    buildPrimIndex(site, indexer.rootSite, indexer.ancestorRecursionDepth,
      /* evaluateImpliedSpecializes */ false,
      /* evaluateVariantsAndDynamicPayloads */ false,
      opts.directNodeShouldContributeSpecs, frame, indexer.inputs, childOutputs)
    newNode = indexer.outputs.append(childOutputs, newArc, newNodeError)
  }

  if (newNodeError.value) {
    const err = newNodeError.value
    indexer.recordError(Object.assign(
      Object.create(Object.getPrototypeOf(err)) as PcpError, err,
      { rootSite: toPcpSite(indexer.rootSite) }))
  }
  if (!newNode) return null
  indexer.outputs.primIndex.getGraph()!.setHasNewNodes(true)

  if (opts.copyAncestorFlagFromOrigin && origin) {
    newNode.setIsDueToAncestor(origin.isDueToAncestor())
    newNode.setHasTransitiveDirectDependency(origin.hasTransitiveDirectDependency())
    newNode.setHasTransitiveAncestralDependency(origin.hasTransitiveAncestralDependency())
  } else {
    newNode.setHasTransitiveDirectDependency(true)
    newNode.setHasTransitiveAncestralDependency(parent.hasTransitiveAncestralDependency())
  }

  if (opts.includeAncestralOpinions && !indexer.previousFrame) {
    for (const n of pcpGetSubtreeRange(newNode)) {
      n.setHasTransitiveDirectDependency(
        newNode.hasTransitiveDirectDependency() || n.hasTransitiveDirectDependency())
      n.setHasTransitiveAncestralDependency(
        newNode.hasTransitiveAncestralDependency() || n.hasTransitiveAncestralDependency())
    }
  }

  let tasks = opts.tasks
  if (opts.includeAncestralOpinions) tasks &= ~ExpressedArcTasks
  const evaluateAncestralVariantsAndDynamicPayloads =
    indexer.evaluateVariantsAndDynamicPayloads && opts.includeAncestralOpinions
  if (!evaluateAncestralVariantsAndDynamicPayloads) {
    tasks &= ~AncestralVariantsAndDynamicPayloadTasks
  }
  if (!opts.includeAncestralOpinions) tasks &= ~TaskType.EvalImpliedSpecializes
  indexer.addTasksForNode(newNode, tasks)

  if (newNode.getPermission() === 'private') {
    indexer.recordError(pcpErrorArcPermissionDenied({
      rootSite: toPcpSite(parent.getRootNode().getSite()),
      site: toPcpSite(parent.getSite()),
      privateSite: toPcpSite(newNode.getSite()),
      arcType,
    }))
    inertSubtree(newNode)
  }

  if (newNode.getPath().isAbsoluteRootPath()) inertSubtree(newNode)
  return newNode
}

// _AddArc without an explicit namespace depth (primIndex.cpp:2079-2100).
function addArc(
  indexer: Pcp_PrimIndexer, arcType: PcpArcType, parent: PcpNodeRef,
  origin: PcpNodeRef | null, site: PcpLayerStackSite, mapExpr: PcpMapExpression,
  arcSiblingNum: number, opts: ArcOptions = arcOptions(),
): PcpNodeRef | null {
  const namespaceDepth = pcpNodeGetNonVariantPathElementCount(parent.getPath())
  return addArcAtDepth(indexer, arcType, parent, origin, site, mapExpr,
    arcSiblingNum, namespaceDepth, opts)
}

// ---------------------------------------------------------------------------
// References and payloads

// _GetDynamicFileFormat (primIndex.cpp:2118-2139).
function getDynamicFileFormat(assetPath: string): PcpDynamicFileFormatInterface | undefined {
  if (!assetPath) return undefined
  const { assetPath: path } = _sdfSplitLayerIdentifier(assetPath)
  // Upstream loads the format's plugin here. Indexing is synchronous and a
  // plugin loads asynchronously, so a dynamic file format plugin must be
  // loaded (PlugPlugin.LoadAsync) before composing payloads to its layers.
  const format = _sdfLoadedFileFormatForPath(path)
  return pcpIsDynamicFileFormat(format) ? format : undefined
}

// _ComposeFieldsForFileFormatArguments (primIndex.cpp:2141-2187). Only
// payloads support dynamic file format arguments.
function composeFieldsForFileFormatArguments(
  node: PcpNodeRef, indexer: Pcp_PrimIndexer, arcType: PcpArcType,
  payload: PcpReference, nodePathAtIntroduction: SdfPath, arcNum: number,
  args: Map<string, string>,
): void {
  if (arcType !== PcpArcType.Payload) return
  const dynamicFileFormat = getDynamicFileFormat(payload.assetPath)
  if (!dynamicFileFormat) return
  const composedFieldNames = new Set<string>()
  const composedAttributeNames = new Set<string>()
  const context = new PcpDynamicFileFormatContext(
    node, nodePathAtIntroduction, arcNum, indexer.previousFrame,
    composedFieldNames, composedAttributeNames)
  const dependencyContextData = dynamicFileFormat.composeFieldsForFileFormatArguments(
    _sdfSplitLayerIdentifier(payload.assetPath).assetPath, context, args)
  indexer.outputs.dynamicFileFormatDependency.addDependencyContext(
    dynamicFileFormat, dependencyContextData, composedFieldNames, composedAttributeNames)
}

const isValidLayerOffset = (offset: SdfLayerOffset): boolean =>
  Number.isFinite(offset.offset) && Number.isFinite(offset.scale)

// _EvalRefOrPayloadArcs (primIndex.cpp:2189-2467).
function evalRefOrPayloadArcs(
  node: PcpNodeRef, indexer: Pcp_PrimIndexer, arcType: PcpArcType,
  arcs: readonly PcpReference[], infoVec: readonly PcpArcInfo[],
  nodePathAtIntroduction: SdfPath,
): void {
  for (let i = 0; i < arcs.length; i++) {
    const refOrPayload = arcs[i]!
    const info = infoVec[i]!
    const srcLayer = info.sourceLayer
    let layerOffset = refOrPayload.layerOffset
    let fail = false

    const authoredPrimPath = refOrPayload.primPath
      ? SdfPath.fromString(refOrPayload.primPath) : SdfPath.emptyPath
    if (refOrPayload.primPath &&
        !(authoredPrimPath.isAbsolutePath() && authoredPrimPath.isPrimPath() &&
          !authoredPrimPath.containsPrimVariantSelection())) {
      indexer.recordError(pcpErrorInvalidPrimPath({
        rootSite: toPcpSite(node.getRootNode().getSite()),
        site: toPcpSite(node.getSite()),
        primPath: refOrPayload.primPath,
        sourceLayer: srcLayer,
        arcType,
      }))
      fail = true
    }

    const isNegativeScale = layerOffset.scale < 0
    const isInternal = refOrPayload.assetPath === ''
    const inverse = sdfLayerOffsetInverse(layerOffset)
    if (isNegativeScale || !isValidLayerOffset(layerOffset) ||
        !inverse || !isValidLayerOffset(inverse)) {
      indexer.recordError(pcpErrorInvalidReferenceOffset({
        rootSite: toPcpSite(node.getRootNode().getSite()),
        sourceLayer: srcLayer,
        sourcePath: node.getPath().pathString,
        assetPath: info.authoredAssetPath,
        targetPath: refOrPayload.primPath,
        offset: layerOffset,
        arcType,
      }))
      layerOffset = SDF_LAYER_OFFSET_IDENTITY
    } else if (!isInternal) {
      layerOffset = sdfLayerOffsetCompose(info.sourceLayerStackOffset, layerOffset)
    }

    if (fail) continue

    let layer: PcpLayer
    let layerStack: PcpLayerStack
    if (isInternal) {
      layer = node.getLayerStack().identifier.rootLayer as PcpLayer
      layerStack = node.getLayerStack()
    } else {
      const canonicalMutedLayerId = indexer.inputs.cache!.isLayerMuted(
        srcLayer, info.authoredAssetPath)
      if (canonicalMutedLayerId !== undefined) {
        indexer.recordError(pcpErrorMutedAssetPath({
          rootSite: toPcpSite(node.getRootNode().getSite()),
          site: toPcpSite(node.getSite()),
          targetPath: refOrPayload.primPath,
          assetPath: info.authoredAssetPath,
          resolvedAssetPath: canonicalMutedLayerId,
          arcType,
          sourceLayer: srcLayer,
        }))
        continue
      }

      const { assetPath, args: authoredArgs } = _sdfSplitLayerIdentifier(refOrPayload.assetPath)
      const args = new Map<string, string>(authoredArgs)
      composeFieldsForFileFormatArguments(
        node, indexer, arcType, refOrPayload, nodePathAtIntroduction, info.arcNum, args)
      pcpGetArgumentsForFileFormatTarget(authoredArgs, indexer.inputs.fileFormatTarget, args)
      const identifier = _sdfCreateLayerIdentifier(assetPath, args)
      const opened = indexer.inputs.cache!._layerSource.findOrOpen(identifier)
      if (!opened) {
        indexer.recordError(pcpErrorInvalidAssetPath({
          rootSite: toPcpSite(node.getRootNode().getSite()),
          site: toPcpSite(node.getSite()),
          targetPath: refOrPayload.primPath,
          assetPath: info.authoredAssetPath,
          resolvedAssetPath: refOrPayload.assetPath,
          arcType,
          sourceLayer: srcLayer,
          messages: indexer.inputs.cache!._layerSource.failureMessages?.(identifier) ?? '',
        }))
        continue
      }
      layer = opened
      const layerStackIdentifier: PcpLayerStackIdentifier = {
        rootLayer: layer,
        expressionVariablesOverrideSource: node.getLayerStack().expressionVariables.getSource(),
      }
      layerStack = indexer.inputs.cache!.computeLayerStack(
        layerStackIdentifier, indexer.outputs.allErrors)

      const srcTcps = layerTimeCodesPerSecond(srcLayer)
      const destTcps = layerStack.timeCodesPerSecond
      if (srcTcps !== destTcps) {
        layerOffset = { offset: layerOffset.offset, scale: layerOffset.scale * srcTcps / destTcps }
      }
    }

    let directNodeShouldContributeSpecs = true
    let defaultPrimPath = SdfPath.emptyPath
    if (refOrPayload.primPath === '') {
      defaultPrimPath = pcpGetDefaultPrimPath(layer)
      if (defaultPrimPath.isEmpty()) {
        indexer.recordError(pcpErrorUnresolvedPrimPath({
          rootSite: toPcpSite(node.getRootNode().getSite()),
          site: toPcpSite(node.getSite()),
          targetLayer: layer,
          unresolvedPath: 'defaultPrim',
          sourceLayer: srcLayer,
          arcType,
        }))
        defaultPrimPath = ABS_ROOT
        directNodeShouldContributeSpecs = false
      }
    }

    let primPath = defaultPrimPath.isEmpty() ? authoredPrimPath : defaultPrimPath
    let mapExpr = createMapExpressionForArc(primPath, nodePathAtIntroduction, node, layerOffset)
    if (isInternal) mapExpr = mapExpr.addRootIdentity()
    if (nodePathAtIntroduction.pathString !== node.getPath().pathString) {
      primPath = node.getPath().replacePrefix(nodePathAtIntroduction, primPath)
    }

    const opts = arcOptions({
      directNodeShouldContributeSpecs,
      includeAncestralOpinions: !primPath.isRootPrimPath(),
    })
    const namespaceDepth = pcpNodeGetNonVariantPathElementCount(nodePathAtIntroduction)
    addArcAtDepth(indexer, arcType, node, node, new PcpLayerStackSite(layerStack, primPath),
      mapExpr, info.arcNum, namespaceDepth, opts)
  }
}

function layerTimeCodesPerSecond(layer: PcpLayer): number {
  const tcps = layer.getField('/', 'timeCodesPerSecond')
  if (typeof tcps === 'number') return tcps
  const fps = layer.getField('/', 'framesPerSecond')
  return typeof fps === 'number' ? fps : 24
}

// _EvalNodeReferences (primIndex.cpp:2469-2504).
function evalNodeReferences(node: PcpNodeRef, indexer: Pcp_PrimIndexer): void {
  if (!node.canContributeSpecs()) return
  const info: PcpArcInfo[] = []
  const exprVarDependencies = new Set<string>()
  const errors: PcpError[] = []
  const refArcs = pcpComposeSiteReferences(
    node.getLayerStack(), node.getPath(), info, exprVarDependencies, errors)
  if (exprVarDependencies.size > 0) {
    indexer.outputs.expressionVariablesDependency.addDependencies(
      node.getLayerStack(), exprVarDependencies)
  }
  for (const err of errors) indexer.recordError(err)
  evalRefOrPayloadArcs(node, indexer, PcpArcType.Reference, refArcs, info, node.getPath())
}

// _EvalNodePayloads (primIndex.cpp:2509-2672).
function evalNodePayloads(
  node: PcpNodeRef, indexer: Pcp_PrimIndexer, payloadType: TaskType,
  nodePathAtIntroduction: SdfPath,
): void {
  if (!node.canContributeSpecs()) return
  let info: PcpArcInfo[] = []
  const exprVarDependencies = new Set<string>()
  const errors: PcpError[] = []
  let payloadArcs = pcpComposeSitePayloads(
    node.getLayerStack(), nodePathAtIntroduction, info, exprVarDependencies, errors)
  if (exprVarDependencies.size > 0) {
    indexer.outputs.expressionVariablesDependency.addDependencies(
      node.getLayerStack(), exprVarDependencies)
  }
  for (const err of errors) indexer.recordError(err)
  if (payloadArcs.length === 0) return

  const index = indexer.outputs.primIndex
  if (nodePathAtIntroduction.pathString === node.getPath().pathString) {
    index.getGraph()!.setHasPayloads(true)
  }

  const includedPayloads = indexer.inputs.includedPayloads
  if (!includedPayloads) return

  const keepDynamicPayloads = payloadType === TaskType.EvalNodeDynamicPayloads
  const keptArcs: PcpReference[] = []
  const keptInfo: PcpArcInfo[] = []
  for (let i = 0; i < payloadArcs.length; i++) {
    const isDynamic = getDynamicFileFormat(payloadArcs[i]!.assetPath) !== undefined
    if (isDynamic === keepDynamicPayloads) {
      keptArcs.push(payloadArcs[i]!)
      keptInfo.push(info[i]!)
    }
  }
  payloadArcs = keptArcs
  info = keptInfo

  let composePayload = false
  const path = indexer.mapNodePathToPayloadInclusionPath(node, nodePathAtIntroduction)
  if (path.isEmpty()) {
    evalRefOrPayloadArcs(node, indexer, PcpArcType.Payload, payloadArcs, info, node.getPath())
    if (payloadType === TaskType.EvalNodePayloads) {
      indexer.addTask(makeTask(TaskType.EvalNodeDynamicPayloads, node))
    }
    return
  } else if (indexer.inputs.includePayloadPredicate) {
    composePayload = indexer.inputs.includePayloadPredicate(path.pathString)
    indexer.outputs.payloadState = composePayload
      ? PcpPrimIndexOutputs.PayloadState.IncludedByPredicate
      : PcpPrimIndexOutputs.PayloadState.ExcludedByPredicate
  } else {
    composePayload = includedPayloads.has(path.pathString)
    indexer.outputs.payloadState = composePayload
      ? PcpPrimIndexOutputs.PayloadState.IncludedByIncludeSet
      : PcpPrimIndexOutputs.PayloadState.ExcludedByIncludeSet
  }
  if (!composePayload) return
  evalRefOrPayloadArcs(
    node, indexer, PcpArcType.Payload, payloadArcs, info, nodePathAtIntroduction)
}

// _PrimSpecExistsUnderNode (primIndex.cpp:2677-2694).
function primSpecExistsUnderNode(node: PcpNodeRef, specExists: (n: PcpNodeRef) => boolean): boolean {
  if (specExists(node)) return true
  for (const child of node.getChildren()) {
    if (primSpecExistsUnderNode(child, specExists)) return true
  }
  return false
}

// _PrimSpecExistsUnderNodeAtIntroduction (primIndex.cpp:2696-2716).
function primSpecExistsUnderNodeAtIntroduction(node: PcpNodeRef): boolean {
  return node.getDepthBelowIntroduction() === 0
    ? primSpecExistsUnderNode(node, n => n.hasSpecs)
    : primSpecExistsUnderNode(node, n =>
      pcpComposeSiteHasSpecs(n.getLayerStack(), n.getPathAtIntroduction()))
}

// _EvalUnresolvedPrimPathError (primIndex.cpp:2718-2784).
function evalUnresolvedPrimPathError(node: PcpNodeRef, indexer: Pcp_PrimIndexer): void {
  const pathAtIntroduction = node.getPathAtIntroduction()
  if (primSpecExistsUnderNodeAtIntroduction(node)) return
  const parentNode = node.getParentNode()!
  let parentNodePath = node.getMapToParent().evaluate().mapSourceToTarget(pathAtIntroduction)
  const parentPath = parentNode.getPath()
  if (parentPath.containsPrimVariantSelection()) {
    parentNodePath = parentNodePath.replacePrefix(parentPath.stripAllVariantSelections(), parentPath)
  }
  const srcInfo: PcpArcInfo[] = []
  if (node.getArcType() === PcpArcType.Reference) {
    pcpComposeSiteReferences(parentNode.getLayerStack(), parentNodePath, srcInfo)
  } else if (node.getArcType() === PcpArcType.Payload) {
    pcpComposeSitePayloads(parentNode.getLayerStack(), parentNodePath, srcInfo)
  }
  const arcNum = node.getSiblingNumAtOrigin()
  indexer.recordError(pcpErrorUnresolvedPrimPath({
    rootSite: toPcpSite(node.getRootNode().getSite()),
    site: pcpSite(parentNode.getLayerStack().identifier, parentNodePath.pathString),
    targetLayer: node.getLayerStack().identifier.rootLayer,
    unresolvedPath: pathAtIntroduction.pathString,
    sourceLayer: srcInfo[arcNum]?.sourceLayer,
    arcType: node.getArcType(),
  }))
}

// ---------------------------------------------------------------------------
// Relocations

// _ElideSubtree (primIndex.cpp:2789-2814).
function elideSubtree(node: PcpNodeRef, cull: boolean): void {
  if (cull) node.setCulled(true)
  else node.setInert(true)
  node.setSpecContributionRestrictedDepth(1)
  for (const child of node.getChildren()) elideSubtree(child, cull)
}

// _ElideRelocatedSubtrees (primIndex.cpp:2816-2846).
function elideRelocatedSubtrees(indexer: Pcp_PrimIndexer, node: PcpNodeRef): void {
  for (const childNode of node.getChildren()) {
    if (childNode.getArcType() === PcpArcType.Relocate) continue
    if (childNode.canContributeSpecs()) {
      const relocatesSrcToTarget =
        childNode.getLayerStack().incrementalRelocatesSourceToTarget
      if (relocatesSrcToTarget.has(childNode.getPath().pathString)) {
        elideSubtree(childNode, indexer.inputs.cull)
        continue
      }
    }
    elideRelocatedSubtrees(indexer, childNode)
  }
}

// _EvalNodeRelocations (primIndex.cpp:2848-3035).
function evalNodeRelocations(node: PcpNodeRef, indexer: Pcp_PrimIndexer): void {
  if (!node.canContributeSpecs()) return
  const relocSourceStr = node.getLayerStack().incrementalRelocatesTargetToSource
    .get(node.getPath().pathString)
  if (relocSourceStr === undefined) return
  const relocSource = SdfPath.fromString(relocSourceStr)

  for (const child of node.getChildren()) {
    switch (child.getArcType()) {
      case PcpArcType.Variant:
        continue
      case PcpArcType.Root:
        continue
      default:
        break
    }
    elideSubtree(child, indexer.inputs.cull)
  }

  const opts = arcOptions({
    directNodeShouldContributeSpecs: false,
    includeAncestralOpinions: true,
  })
  const newNode = addArc(indexer, PcpArcType.Relocate, node, node,
    new PcpLayerStackSite(node.getLayerStack(), relocSource),
    PcpMapExpression.identity(), 0, opts)
  if (newNode) {
    for (const site of pcpComposeSitePrimSites(newNode.getLayerStack(), newNode.getPath())) {
      indexer.recordError(pcpErrorOpinionAtRelocationSource({
        rootSite: toPcpSite(node.getRootNode().getSite()),
        layer: site.layer,
        path: site.path,
      }))
    }
    elideRelocatedSubtrees(indexer, newNode)
  }
}

// _EvalImpliedRelocations (primIndex.cpp:3037-3099).
function evalImpliedRelocations(node: PcpNodeRef, indexer: Pcp_PrimIndexer): void {
  if (node.getArcType() !== PcpArcType.Relocate || node.isDueToAncestor()) return
  const parent = node.getParentNode()
  if (!parent) return
  const gp = parent.getParentNode()
  if (!gp) return
  const gpRelocSource = parent.getMapToParent().evaluate().mapSourceToTarget(node.getPath())
  if (gpRelocSource.isEmpty()) return
  for (const gpChild of gp.getChildren()) {
    if (gpChild.getPath().pathString === gpRelocSource.pathString &&
        gpChild.getArcType() === PcpArcType.Relocate) return
  }
  addArc(indexer, PcpArcType.Relocate, gp, node,
    new PcpLayerStackSite(gp.getLayerStack(), gpRelocSource),
    PcpMapExpression.identity(), 0, arcOptions({ directNodeShouldContributeSpecs: false }))
}

// ---------------------------------------------------------------------------
// Class-based arcs

// _FindMatchingChild (primIndex.cpp:3104-3119).
function findMatchingChild(parent: PcpNodeRef, site: PcpLayerStackSite): PcpNodeRef | null {
  for (const child of parent.getChildren()) {
    if (nodeSiteEquals(child, site)) return child
  }
  return null
}

function findContainingVariantSelection(p: SdfPath): SdfPath {
  while (!p.isEmpty() && !p.isPrimVariantSelectionPath()) p = p.getParentPath()
  return p
}

// _DetermineInheritPath (primIndex.cpp:3130-3190).
function determineInheritPath(
  destParentPath: SdfPath, sourceChildPath: SdfPath, transferFunc: PcpMapExpression,
): SdfPath {
  const fn = transferFunc.evaluate()
  if (!destParentPath.containsPrimVariantSelection()) {
    return fn.mapSourceToTarget(sourceChildPath.stripAllVariantSelections())
  }
  const varPath = findContainingVariantSelection(destParentPath)
  return fn.mapSourceToTarget(sourceChildPath.stripAllVariantSelections())
    .replacePrefix(varPath.stripAllVariantSelections(), varPath)
}

// _AddClassBasedArc (primIndex.cpp:3202-3441).
function addClassBasedArc(
  inheritPath: SdfPath, arcType: PcpArcType, parent: PcpNodeRef, origin: PcpNodeRef,
  inheritMap: PcpMapExpression, inheritArcNum: number,
  ignoreIfSameAsSite: PcpLayerStackSite | null, indexer: Pcp_PrimIndexer,
): PcpNodeRef | null {
  const parentArcType = new PcpPrimIndex_StackFrameIterator(parent, indexer.previousFrame)
    .getArcType()
  if (inheritPath.isEmpty()) return null
  const inheritSite = new PcpLayerStackSite(parent.getLayerStack(), inheritPath)

  const findMatching = (): PcpNodeRef | null => {
    if (parentArcType !== PcpArcType.Relocate) return findMatchingChild(parent, inheritSite)
    const depthBelowIntroduction = origin.getDepthBelowIntroduction()
    const mapToParent = inheritMap.evaluate()
    for (const child of parent.getChildren()) {
      if (child.getArcType() === arcType &&
          child.getOriginNode()!.getDepthBelowIntroduction() === depthBelowIntroduction &&
          child.getMapToParent().evaluate().equals(mapToParent)) return child
    }
    return null
  }

  const child = findMatching()
  if (child) {
    if (pcpIsSpecializeArc(arcType) && parent.isRootNode() &&
        isImpliedClassBasedArc(arcType, parent, origin)) {
      if (pcpCompareNodeStrength(origin, child.getOriginNode()!) === -1) {
        inertSubtree(child)
      } else {
        return child
      }
    } else {
      return child
    }
  }

  if (pcpIsSpecializeArc(arcType)) {
    const addInertPlaceholder = !parent.isRootNode() || indexer.previousFrame !== null
    if (addInertPlaceholder) {
      const placeholder = addArc(indexer, arcType, parent, origin, inheritSite,
        inheritMap, inheritArcNum, arcOptions({
          directNodeShouldContributeSpecs: false,
          includeAncestralOpinions: false,
          tasks: TaskType.None,
        }))
      if (!indexer.previousFrame && placeholder &&
          !isRelocatesPlaceholderImpliedArc(placeholder)) {
        const propagatedNode = propagateNodeToRoot(placeholder, indexer)
        if (propagatedNode && propagatedNode.getOriginNode() !== placeholder) {
          indexer.addTasksForNode(placeholder, TaskType.EvalImpliedClasses)
        }
        return propagatedNode
      }
      return placeholder
    }
  }

  const directNodeShouldContributeSpecs =
    inheritPath.pathString !== parent.getPath().pathString &&
    !(ignoreIfSameAsSite && sitesEqual(inheritSite, ignoreIfSameAsSite))
  return addArc(indexer, arcType, parent, origin, inheritSite, inheritMap, inheritArcNum,
    arcOptions({
      directNodeShouldContributeSpecs,
      skipDuplicateNodes: directNodeShouldContributeSpecs,
      includeAncestralOpinions: directNodeShouldContributeSpecs && !inheritPath.isRootPrimPath(),
    }))
}

// _AddClassBasedArcs (primIndex.cpp:3443-3489).
function addClassBasedArcs(
  node: PcpNodeRef, classArcs: readonly string[], arcType: PcpArcType, indexer: Pcp_PrimIndexer,
): void {
  for (let arcNum = 0; arcNum < classArcs.length; arcNum++) {
    const arcPath = classArcs[arcNum] ? SdfPath.fromString(classArcs[arcNum]!) : SdfPath.emptyPath
    if (!arcPath.isEmpty() && !(arcPath.isPrimPath() && !arcPath.containsPrimVariantSelection())) {
      indexer.recordError(pcpErrorInvalidPrimPath({
        rootSite: toPcpSite(node.getRootNode().getSite()),
        site: toPcpSite(node.getSite()),
        primPath: arcPath.pathString,
        sourceLayer: undefined,
        arcType,
      }))
      continue
    }
    const mapExpr = createMapExpressionForArc(arcPath, node.getPath(), node).addRootIdentity()
    addClassBasedArc(arcPath, arcType, node, node, mapExpr, arcNum, null, indexer)
  }
}

// _EvalImpliedClassTree (primIndex.cpp:3543-3747).
function evalImpliedClassTree(
  destNode: PcpNodeRef, srcNode: PcpNodeRef, transferFunc: PcpMapExpression,
  srcNodeIsStartOfTree: boolean, indexer: Pcp_PrimIndexer,
): void {
  if (destNode.getArcType() === PcpArcType.Relocate) {
    const newTransferFunc = destNode.getMapToParent().addRootIdentity().compose(transferFunc)
    evalImpliedClassTree(destNode.getParentNode()!, srcNode, newTransferFunc,
      srcNodeIsStartOfTree, indexer)
    indexer.addTask(makeTask(TaskType.EvalImpliedClasses, destNode))
    return
  }

  const propagatedSpecializes = getPropagatedSpecializesNode(srcNode)
  const srcChildren = (propagatedSpecializes ?? srcNode).getChildren()

  for (const srcChild of srcChildren) {
    if (!pcpIsClassBasedArc(srcChild.getArcType())) continue
    if (srcNodeIsStartOfTree && pcpIsClassBasedArc(srcNode.getArcType()) &&
        srcNode.getDepthBelowIntroduction() === srcChild.getDepthBelowIntroduction()) continue

    const destClassFunc = PcpMapExpression.impliedClass(transferFunc, srcChild.getMapToParent())

    let destChild: PcpNodeRef | null = null
    for (const candidate of destNode.getChildren()) {
      if (candidate.getOriginNode() !== srcChild) continue
      if (pcpIsPropagatedSpecializesNode(candidate)) continue
      destChild = candidate
      break
    }

    if (!destChild) {
      const inheritPath = determineInheritPath(destNode.getPath(), srcChild.getPath(), transferFunc)
      destChild = addClassBasedArc(inheritPath, srcChild.getArcType(), destNode, srcChild,
        destClassFunc, srcChild.getSiblingNumAtOrigin(), srcChild.getSite(), indexer)
    }

    if (destChild && hasClassBasedChild(srcChild)) {
      const propagatedDestChild = getPropagatedSpecializesNode(destChild)
      if (propagatedDestChild) destChild = propagatedDestChild
      evalImpliedClassTree(destChild, srcChild, transferFunc, false, indexer)
    }
  }
}

// _EvalImpliedClasses (primIndex.cpp:3749-3780).
function evalImpliedClasses(node: PcpNodeRef, indexer: Pcp_PrimIndexer): void {
  const parent = node.getParentNode()
  if (!parent) return
  if (!hasClassBasedChild(node)) return
  const transferFunc = node.getMapToParent().addRootIdentity()
  evalImpliedClassTree(parent, node, transferFunc, true, indexer)
}

// _EvalNodeInherits (primIndex.cpp:3785-3805).
function evalNodeInherits(node: PcpNodeRef, indexer: Pcp_PrimIndexer): void {
  if (!node.canContributeSpecs()) return
  const inhArcs = pcpComposeSiteInherits(node.getLayerStack(), node.getPath())
  addClassBasedArcs(node, inhArcs, PcpArcType.Inherit, indexer)
}

// _EvalNodeSpecializes (primIndex.cpp:3810-3830).
function evalNodeSpecializes(node: PcpNodeRef, indexer: Pcp_PrimIndexer): void {
  if (!node.canContributeSpecs()) return
  const specArcs = pcpComposeSiteSpecializes(node.getLayerStack(), node.getPath())
  addClassBasedArcs(node, specArcs, PcpArcType.Specialize, indexer)
}

// _PropagateNodeToRoot (primIndex.cpp:3832-3859).
function propagateNodeToRoot(srcNode: PcpNodeRef, indexer: Pcp_PrimIndexer): PcpNodeRef | null {
  const parentNode = srcNode.getRootNode()
  const mapToParent = srcNode.getMapToRoot()
  let newNode = findMatchingChild(parentNode, srcNode.getSite())
  if (!newNode) {
    newNode = addArc(indexer, srcNode.getArcType(), parentNode, srcNode, srcNode.getSite(),
      mapToParent, srcNode.getSiblingNumAtOrigin(), arcOptions({
        skipDuplicateNodes: true,
        includeAncestralOpinions: !srcNode.getPath().isRootPrimPath(),
        copyAncestorFlagFromOrigin: true,
      }))
  }
  return newNode
}

// _IsRelocatesPlaceholderImpliedArc (primIndex.cpp:3861-3879).
function isRelocatesPlaceholderImpliedArc(node: PcpNodeRef): boolean {
  const parentNode = node.getParentNode()
  return parentNode !== node.getOriginNode() && parentNode !== null &&
    parentNode.getArcType() === PcpArcType.Relocate &&
    parentNode.getLayerStack() === node.getLayerStack() &&
    parentNode.getPath().pathString === node.getPath().pathString
}

// _FindSpecializesToPropagateToRoot (primIndex.cpp:3881-3902).
function findSpecializesToPropagateToRoot(node: PcpNodeRef, indexer: Pcp_PrimIndexer): void {
  if (isRelocatesPlaceholderImpliedArc(node)) return
  if (pcpIsSpecializeArc(node.getArcType())) propagateNodeToRoot(node, indexer)
  for (const child of node.getChildren()) findSpecializesToPropagateToRoot(child, indexer)
}

// _EvalImpliedSpecializes (primIndex.cpp:3930-3945).
function evalImpliedSpecializes(node: PcpNodeRef, indexer: Pcp_PrimIndexer): void {
  if (!node.getParentNode()) return
  findSpecializesToPropagateToRoot(node, indexer)
}

// ---------------------------------------------------------------------------
// Variants

// _NodeCanContributeAncestralOpinions (primIndex.cpp:3950-3962).
function nodeCanContributeAncestralOpinions(node: PcpNodeRef, ancestralPath: SdfPath): boolean {
  const restrictionDepth = node.getSpecContributionRestrictedDepth()
  return restrictionDepth === 0 || restrictionDepth > ancestralPath.pathElementCount
}

// _ComposeVariantSelectionForNode (primIndex.cpp:3964-3992).
function composeVariantSelectionForNode(
  node: PcpNodeRef, pathInNode: SdfPath, vset: string, indexer: Pcp_PrimIndexer,
): string | undefined {
  const exprVarDependencies = new Set<string>()
  const errors: PcpError[] = []
  const vsel = pcpComposeSiteVariantSelection(
    node.getLayerStack(), pathInNode, vset, exprVarDependencies, errors)
  if (exprVarDependencies.size > 0) {
    indexer.outputs.expressionVariablesDependency.addDependencies(
      node.getLayerStack(), exprVarDependencies)
  }
  for (const err of errors) indexer.recordError(err)
  return vsel
}

// _FindPriorVariantSelection (primIndex.cpp:3994-4052).
function findPriorVariantSelection(
  startNode: PcpNodeRef, pathInStartNode: SdfPath, vset: string, indexer: Pcp_PrimIndexer,
): [string, PcpNodeRef] | undefined {
  let found: [string, PcpNodeRef] | undefined
  indexer.getVariantTraversalCache(startNode, pathInStartNode).traverse(
    (node, pathInNode, _data, prune) => {
      if (node.getArcType() !== PcpArcType.Variant) return false
      const nodePathAtIntroduction = node.getPathAtIntroduction()
      const [set, sel] = nodePathAtIntroduction.getVariantSelection()
      if (set !== vset) return false
      const path = pathInNode()
      if (path.isEmpty()) {
        prune()
        return false
      }
      if (nodePathAtIntroduction.getPrimPath().pathString === path.pathString) {
        found = [sel, node]
        return true
      }
      return false
    })
  return found
}

// _ComposeVariantSelectionAcrossNodes (primIndex.cpp:4054-4127).
function composeVariantSelectionAcrossNodes(
  startNode: PcpNodeRef, pathInStartNode: SdfPath, vset: string, indexer: Pcp_PrimIndexer,
): [string, PcpNodeRef] | undefined {
  let found: [string, PcpNodeRef] | undefined
  indexer.getVariantTraversalCache(startNode, pathInStartNode).traverse(
    (node, pathInNodeFn, info, prune) => {
      const pathInNode = pathInNodeFn()
      if (pathInNode.isEmpty()) {
        prune()
        return false
      }
      if (!nodeCanContributeAncestralOpinions(node, pathInNode)) return false
      if (info.status === 'unknown') {
        if (node.getArcType() === PcpArcType.Variant) {
          const variantPath = node.getPathAtIntroduction()
          info.sitePath = pathInNode.replacePrefix(
            variantPath.stripAllVariantSelections(), variantPath)
        } else {
          info.sitePath = pathInNode
        }
        info.status = pcpComposeSiteHasVariantSelections(node.getLayerStack(), info.sitePath)
          ? 'authored' : 'none'
      }
      if (info.status === 'none') return false
      const vsel = composeVariantSelectionForNode(node, info.sitePath, vset, indexer)
      if (vsel !== undefined) {
        found = [vsel, node]
        return true
      }
      return false
    })
  return found
}

// _ComposeVariantSelection (primIndex.cpp:4129-4195).
function composeVariantSelection(
  node: PcpNodeRef, pathInNode: SdfPath, indexer: Pcp_PrimIndexer, vset: string,
): string {
  const [pathInStartNode, startNode] =
    pcpTranslatePathFromNodeToRootOrClosestNode(node, pathInNode)
  const prior = findPriorVariantSelection(startNode, pathInStartNode, vset, indexer)
  if (prior) return prior[0]
  const authored = composeVariantSelectionAcrossNodes(startNode, pathInStartNode, vset, indexer)
  return authored ? authored[0] : ''
}

// _ChooseBestFallbackAmongOptions (primIndex.cpp:4197-4212).
function chooseBestFallbackAmongOptions(
  vset: string, vsetOptions: ReadonlySet<string>,
  variantFallbacks: Readonly<Record<string, readonly string[]>> | null,
): string {
  const fallbacks = variantFallbacks?.[vset]
  if (fallbacks) {
    for (const vsel of fallbacks) if (vsetOptions.has(vsel)) return vsel
  }
  return ''
}

// _SiteMightIntroducePendingVariantSelections (primIndex.cpp:4214-4237).
function siteMightIntroducePendingVariantSelections(site: PcpLayerStackSite): boolean {
  const path = site.path.pathString
  for (const { layer } of site.layerStack.layers) {
    if (pcpReadField(layer, path, 'variantSelection') != null ||
        pcpReadField(layer, path, 'references') != null ||
        pcpReadField(layer, path, 'inheritPaths') != null ||
        pcpReadField(layer, path, 'specializes') != null ||
        pcpReadField(layer, path, 'payload') != null) return true
  }
  return false
}

// _AddVariantArc (primIndex.cpp:4239-4266).
function addVariantArc(
  indexer: Pcp_PrimIndexer, node: PcpNodeRef, vset: string, vsetNum: number, vsel: string,
): void {
  const varPath = node.getPath().appendVariantSelection(vset, vsel)
  const varSite = new PcpLayerStackSite(node.getLayerStack(), varPath)
  if (addArc(indexer, PcpArcType.Variant, node, node, varSite,
    PcpMapExpression.identity(), vsetNum)) {
    if (siteMightIntroducePendingVariantSelections(varSite)) indexer.retryVariantTasks()
  }
}

// _AddAncestralVariantArc (primIndex.cpp:4268-4336).
function addAncestralVariantArc(
  indexer: Pcp_PrimIndexer, node: PcpNodeRef, vsetPath: SdfPath,
  vset: string, vsetNum: number, vsel: string,
): void {
  const ancestralVarPath = vsetPath.appendVariantSelection(vset, vsel)
  const varPath = node.getPath().replacePrefix(vsetPath, ancestralVarPath)
  const namespaceDepth = pcpNodeGetNonVariantPathElementCount(vsetPath)
  let skipDuplicateNodes = false
  for (let n: PcpNodeRef = node; !n.isRootNode(); n = n.getParentNode()!) {
    if (pcpIsClassBasedArc(n.getArcType()) && n.getDepthBelowIntroduction() === 0 &&
        !n.isInert) {
      skipDuplicateNodes = true
      break
    }
  }
  const varSite = new PcpLayerStackSite(node.getLayerStack(), varPath)
  if (addArcAtDepth(indexer, PcpArcType.Variant, node, node, varSite,
    PcpMapExpression.identity(), vsetNum, namespaceDepth,
    arcOptions({ includeAncestralOpinions: true, skipDuplicateNodes }))) {
    if (siteMightIntroducePendingVariantSelections(
      new PcpLayerStackSite(varSite.layerStack, ancestralVarPath))) {
      indexer.retryVariantTasks()
    }
  }
}

// _EvalVariantSetsAtSite (primIndex.cpp:4338-4371).
function evalVariantSetsAtSite(
  node: PcpNodeRef, sitePath: SdfPath, indexer: Pcp_PrimIndexer, isAncestral: boolean,
): void {
  const vsetNames = pcpComposeSiteVariantSets(node.getLayerStack(), sitePath)
  if (vsetNames.length === 0) return
  const taskType = isAncestral
    ? TaskType.EvalNodeAncestralVariantAuthored : TaskType.EvalNodeVariantAuthored
  for (let vsetNum = 0; vsetNum < vsetNames.length; vsetNum++) {
    indexer.addTask(makeTask(taskType, node, sitePath, vsetNames[vsetNum]!, vsetNum))
  }
}

// _EvalNodeVariantSets (primIndex.cpp:4373-4389).
function evalNodeVariantSets(node: PcpNodeRef, indexer: Pcp_PrimIndexer): void {
  if (!node.canContributeSpecs()) return
  evalVariantSetsAtSite(node, node.getPath(), indexer, false)
}

// _EvalNodeAncestralDynamicPayloads (primIndex.cpp:4391-4414).
function evalNodeAncestralDynamicPayloads(node: PcpNodeRef, indexer: Pcp_PrimIndexer): void {
  for (let path = node.getPath().getParentPath(); !path.isAbsoluteRootPath();
    path = path.getParentPath()) {
    if (!nodeCanContributeAncestralOpinions(node, path)) continue
    evalNodePayloads(node, indexer, TaskType.EvalNodeDynamicPayloads, path)
  }
}

// _EvalNodeAncestralVariantSets (primIndex.cpp:4416-4447).
function evalNodeAncestralVariantSets(node: PcpNodeRef, indexer: Pcp_PrimIndexer): void {
  for (let path = node.getPath().getParentPath(); !path.isAbsoluteRootPath();
    path = path.getParentPath()) {
    if (!nodeCanContributeAncestralOpinions(node, path)) continue
    evalVariantSetsAtSite(node, path, indexer, true)
    if (path.isPrimVariantSelectionPath()) break
  }
}

// _EvalNodeAuthoredVariant (primIndex.cpp:4449-4489).
function evalNodeAuthoredVariant(
  node: PcpNodeRef, indexer: Pcp_PrimIndexer, vsetPath: SdfPath, vset: string,
  vsetNum: number, isAncestral: boolean,
): void {
  if (!nodeCanContributeAncestralOpinions(node, vsetPath)) return
  const vsel = composeVariantSelection(node, vsetPath.stripAllVariantSelections(), indexer, vset)
  if (vsel === '') {
    indexer.addTask(makeTask(
      isAncestral ? TaskType.EvalNodeAncestralVariantFallback : TaskType.EvalNodeVariantFallback,
      node, vsetPath, vset, vsetNum))
    return
  }
  if (isAncestral) addAncestralVariantArc(indexer, node, vsetPath, vset, vsetNum, vsel)
  else addVariantArc(indexer, node, vset, vsetNum, vsel)
}

// _EvalNodeFallbackVariant (primIndex.cpp:4491-4535).
function evalNodeFallbackVariant(
  node: PcpNodeRef, indexer: Pcp_PrimIndexer, vsetPath: SdfPath, vset: string,
  vsetNum: number, isAncestral: boolean,
): void {
  if (!nodeCanContributeAncestralOpinions(node, vsetPath)) return
  const vsetOptions = pcpComposeSiteVariantSetOptions(node.getLayerStack(), vsetPath, vset)
  const vsel = chooseBestFallbackAmongOptions(vset, vsetOptions, indexer.inputs.variantFallbacks)
  if (vsel === '') {
    indexer.addTask(makeTask(
      isAncestral ? TaskType.EvalNodeAncestralVariantNoneFound : TaskType.EvalNodeVariantNoneFound,
      node, vsetPath, vset, vsetNum))
    return
  }
  if (isAncestral) addAncestralVariantArc(indexer, node, vsetPath, vset, vsetNum, vsel)
  else addVariantArc(indexer, node, vset, vsetNum, vsel)
}

// ---------------------------------------------------------------------------
// Prim specs and permissions

// _EnforcePermissions (primIndex.cpp:4553-4615).
function enforcePermissions(primIndex: PcpPrimIndex, allErrors: PcpError[]): void {
  const allNodes = [...pcpGetSubtreeRange(primIndex.getRootNode())]
  let privateNode: PcpNodeRef | null = null
  for (let i = allNodes.length - 1; i >= 0; i--) {
    const curNode = allNodes[i]!
    if (!curNode.canContributeSpecs()) continue
    if (privateNode) {
      curNode.setRestricted(true)
      if (curNode.hasSpecs) {
        const layers = curNode.getLayerStack().layers
        for (let l = layers.length - 1; l >= 0; l--) {
          if (layers[l]!.layer.hasSpec(curNode.getPath().pathString)) {
            Pcp_PrimIndexer.recordError(pcpErrorPrimPermissionDenied({
              rootSite: toPcpSite(curNode.getRootNode().getSite()),
              site: toPcpSite(curNode.getSite()),
              privateSite: toPcpSite(privateNode.getSite()),
            }), primIndex, allErrors)
            break
          }
        }
      }
    }
    if (!privateNode && curNode.getPermission() !== 'public') privateNode = curNode
  }
}

// Pcp_RescanForSpecs (primIndex.cpp:4617-4658), USD mode.
export function pcpRescanForSpecs(index: PcpPrimIndex, usd: boolean, updateHasSpecs: boolean): void {
  if (usd && updateHasSpecs) {
    for (const node of index.getNodeRange()) {
      node.setHasSpecs(pcpComposeSiteHasSpecs(node.getLayerStack(), node.getPath()))
    }
  }
}

// _GetDirectChildRange (primIndex.cpp:4662-4686).
function getDirectChildRange(node: PcpNodeRef, arcType: PcpArcType): PcpNodeRef[] {
  const children = node.getChildren()
  let first = 0
  while (first < children.length &&
    !(children[first]!.getArcType() === arcType && !children[first]!.isDueToAncestor())) first++
  let last = first
  while (last < children.length &&
    children[last]!.getArcType() === arcType && !children[last]!.isDueToAncestor()) last++
  return children.slice(first, last)
}

// _ComputedAssetPathWouldCreateDifferentNode (primIndex.cpp:4688-4714). A
// layer that is not already open is necessarily different.
function computedAssetPathWouldCreateDifferentNode(
  node: PcpNodeRef, newAssetPath: string, layerSource: PcpLayerSource,
): boolean {
  const rootLayer = node.getLayerStack().identifier.rootLayer
  const { args } = _sdfSplitLayerIdentifier(rootLayer.filePath)
  const { assetPath } = _sdfSplitLayerIdentifier(newAssetPath)
  let newLayer: PcpLayer | null
  try {
    newLayer = layerSource.findOrOpen(_sdfCreateLayerIdentifier(assetPath, args))
  } catch {
    return true
  }
  if (!newLayer) return true
  return rootLayer !== newLayer
}

// _NeedToRecomputeDueToAssetPathChange (primIndex.cpp:4737-4781).
function needToRecomputeArcsDueToAssetPathChange(
  node: PcpNodeRef, arcType: PcpArcType, layerSource: PcpLayerSource,
): boolean {
  const arcRange = getDirectChildRange(node, arcType)
  if (arcRange.length === 0) return false
  const sourceArcs = arcType === PcpArcType.Reference
    ? pcpComposeSiteReferences(node.getLayerStack(), node.getPath())
    : pcpComposeSitePayloads(node.getLayerStack(), node.getPath())
  if (arcRange.length !== sourceArcs.length) return true
  for (let i = 0; i < sourceArcs.length; i++) {
    if (sourceArcs[i]!.assetPath === '') continue
    if (computedAssetPathWouldCreateDifferentNode(arcRange[i]!, sourceArcs[i]!.assetPath, layerSource)) {
      return true
    }
  }
  return false
}

// Pcp_NeedToRecomputeDueToAssetPathChange (primIndex.cpp:4783-4803).
export function pcpNeedToRecomputeDueToAssetPathChange(
  index: PcpPrimIndex, layerSource: PcpLayerSource,
): boolean {
  for (const node of index.getNodeRange()) {
    if (!node.canContributeSpecs()) continue
    if (needToRecomputeArcsDueToAssetPathChange(node, PcpArcType.Reference, layerSource) ||
        needToRecomputeArcsDueToAssetPathChange(node, PcpArcType.Payload, layerSource)) {
      return true
    }
  }
  return false
}

// ---------------------------------------------------------------------------
// Index construction

// _ConvertNodeForChild (primIndex.cpp:4808-4858).
function convertNodeForChild(node: PcpNodeRef, inputs: PcpPrimIndexInputs, isRoot = true): void {
  if (node.hasSpecs) {
    node.setHasSpecs(pcpComposeSiteHasSpecs(node.getLayerStack(), node.getPath()))
  }
  if (!node.isInert && node.hasSpecs) {
    if (inputs.usd) {
      if (!node.hasValueClips()) {
        node.setHasValueClips(pcpComposeSiteHasValueClips(node.getLayerStack(), node.getPath()))
      }
    } else {
      if (node.getPermission() === 'public') {
        node.setPermission(pcpComposeSitePermission(node.getLayerStack(), node.getPath()))
      }
      if (!node.hasSymmetry) {
        node.setHasSymmetry(pcpComposeSiteHasSymmetry(node.getLayerStack(), node.getPath()))
      }
    }
  }
  for (const child of node.getChildren()) convertNodeForChild(child, inputs, false)
  if (!isRoot) {
    node.setIsDueToAncestor(true)
    node.setHasTransitiveDirectDependency(false)
    node.setHasTransitiveAncestralDependency(true)
  }
}

// _NodeCanBeCulled (primIndex.cpp:4860-4967).
function nodeCanBeCulled(node: PcpNodeRef, rootSite: PcpLayerStackSite): boolean {
  if (node.isCulled) return true
  if (node.isRootNode()) return false
  if (node.getDepthBelowIntroduction() === 0) return false
  if (node.hasSymmetry) return false
  if (node.hasValueClips()) return false
  if (node.getArcType() === PcpArcType.Inherit && node.getLayerStack() === rootSite.layerStack) {
    const originNode = node.getOriginNode() === node.getParentNode()
      ? node : node.getOriginRootNode()
    if (!originNode.getPathAtIntroduction().isRootPrimPath()) return false
  }
  for (const child of node.getChildren()) if (!child.isCulled) return false
  if (node.hasSpecs && node.canContributeSpecs()) return false
  return true
}

function cullSubtreesWithNoOpinionsHelper(node: PcpNodeRef, rootSite: PcpLayerStackSite): void {
  for (const child of node.getChildren()) cullSubtreesWithNoOpinionsHelper(child, rootSite)
  if (nodeCanBeCulled(node, rootSite)) node.setCulled(true)
}

// _CullSubtreesWithNoOpinions (primIndex.cpp:4988-5003).
function cullSubtreesWithNoOpinions(
  primIndex: PcpPrimIndex, rootSite: PcpLayerStackSite, culledDeps: PcpCulledDependency[],
): void {
  for (const child of primIndex.getRootNode().getChildren()) {
    cullSubtreesWithNoOpinionsHelper(child, rootSite)
  }
  pcpAddCulledDependencies(primIndex, culledDeps)
}

// _AddCulledDependency (dependencies.cpp:628-664).
function addCulledDependency(node: PcpNodeRef, culledDeps: PcpCulledDependency[]): void {
  let unrelocatedSitePath = SdfPath.emptyPath
  if (node.getArcType() === PcpArcType.Relocate) {
    let parent = node.getParentNode()!
    while (parent.getArcType() === PcpArcType.Relocate) parent = parent.getParentNode()!
    unrelocatedSitePath = parent.getPath()
  }
  culledDeps.push({
    flags: pcpClassifyNodeDependency(node),
    arcType: node.getArcType(),
    layerStack: node.getLayerStack(),
    sitePath: node.getPath(),
    unrelocatedSitePath,
    mapToRoot: node.getMapToRoot().evaluate(),
  })
}

// _ShouldCheckSubtreeForDependencies (dependencies.cpp:72-90).
export function pcpShouldCheckSubtreeForDependencies(node: PcpNodeRef): boolean {
  return node.getArcType() !== PcpArcType.Root && pcpNodeIntroducesDependency(node) &&
    node.hasTransitiveDirectDependency()
}

// Pcp_AddCulledDependencies (dependencies.cpp:666-704).
export function pcpAddCulledDependencies(
  primIndex: PcpPrimIndex, culledDeps: PcpCulledDependency[],
): void {
  if (!primIndex.getGraph()!.hasNewNodes()) return
  for (const it = new PcpNodeSubtreeIterator(primIndex.getRootNode()); it.node; it.next()) {
    const depNode = it.node
    if (!pcpShouldCheckSubtreeForDependencies(depNode)) continue
    for (const depIt = new PcpNodeSubtreeIterator(depNode); depIt.node; depIt.next()) {
      if (depIt.node.isCulled) {
        for (const n of pcpGetSubtreeRange(depIt.node)) {
          if (!pcpNodeIntroducesDependency(n)) continue
          addCulledDependency(n, culledDeps)
        }
        depIt.pruneChildren()
      }
    }
    it.pruneChildren()
  }
}

// _BuildInitialPrimIndexFromAncestor (primIndex.cpp:5027-5184).
function buildInitialPrimIndexFromAncestor(
  site: PcpLayerStackSite, rootSite: PcpLayerStackSite, ancestorRecursionDepth: number,
  previousFrame: PcpPrimIndex_StackFrame | null, evaluateImpliedSpecializes: boolean,
  evaluateVariantsAndDynamicPayloads: boolean, rootNodeShouldContributeSpecs: boolean,
  inputs: PcpPrimIndexInputs, outputs: PcpPrimIndexOutputs,
): void {
  let ancestorIsInstanceable = false
  const cache = inputs.cache!
  if (!previousFrame && evaluateImpliedSpecializes &&
      cache.getLayerStack() === site.layerStack &&
      cache.getPrimIndexInputs().isEquivalentTo(inputs)) {
    const parentIndex = inputs.parentIndex ??
      cache._computePrimIndexWithCompatibleInputs(site.path.getParentPath(), inputs, outputs.allErrors)
    outputs.primIndex.setGraph(PcpPrimIndex_Graph.new(parentIndex.getGraph()!))
    ancestorIsInstanceable = parentIndex.isInstanceable()
  } else {
    const parentSite = new PcpLayerStackSite(site.layerStack, site.path.getParentPath())
    buildPrimIndex(parentSite, rootSite, ancestorRecursionDepth + 1,
      evaluateImpliedSpecializes, evaluateVariantsAndDynamicPayloads, true,
      previousFrame, inputs, outputs)
    ancestorIsInstanceable = ((): boolean => {
      if (!pcpInstancingIsEnabled(outputs.primIndex)) return false
      if (cache.getLayerStack() === parentSite.layerStack &&
          rootSite.path.hasPrefix(parentSite.path)) {
        if (inputs.ancestorIsInstanceablePredicate) {
          return inputs.ancestorIsInstanceablePredicate(parentSite.path.pathString)
        }
        const cachedParent = cache.findPrimIndex(parentSite.path.pathString)
        if (cachedParent) return cachedParent.isInstanceable()
      }
      return pcpPrimIndexIsInstanceable(outputs.primIndex)
    })()
  }

  if (ancestorIsInstanceable) {
    pcpTraverseInstanceableStrongToWeak(outputs.primIndex, {
      visit(node, nodeIsInstanceable) {
        if (!nodeIsInstanceable) {
          node.setInert(true)
          return true
        }
        return false
      },
    })
  }

  const graph = outputs.primIndex.getGraph()!
  graph.appendChildNameToAllSites(site.path)
  graph.setHasPayloads(false)
  outputs.payloadState = PcpPrimIndexOutputs.PayloadState.NoPayload
  graph.setHasNewNodes(false)
  const rootNode = outputs.primIndex.getRootNode()
  convertNodeForChild(rootNode, inputs)
  if (!rootNodeShouldContributeSpecs) rootNode.setInert(true)
}

// _ComposeIsProhibitedPrimChild (primIndex.cpp:5186-5235).
function composeIsProhibitedPrimChild(indexer: Pcp_PrimIndexer): boolean {
  const rootNode = indexer.outputs.primIndex.getRootNode()
  for (const it = new PcpNodeSubtreeIterator(rootNode); it.node; it.next()) {
    const node = it.node
    if (node.isCulled) {
      it.pruneChildren()
      continue
    }
    const layerStack = node.getLayerStack()
    if (node.isInert || !layerStack.hasRelocates) continue
    if (layerStack.incrementalRelocatesSourceToTarget.has(node.getPath().pathString)) {
      const frame = indexer.previousFrame
      if (frame) {
        indexer.recordError(pcpErrorArcToProhibitedChild({
          rootSite: toPcpSite(indexer.rootSite),
          site: toPcpSite(frame.parentNode.getSite()),
          targetSite: toPcpSite(frame.requestedSite),
          relocationSourceSite: toPcpSite(node.getSite()),
          arcType: frame.arcToParent.type,
        }))
      }
      return true
    }
  }
  return false
}

// _ElidePrimIndexIfProhibited (primIndex.cpp:5237-5259).
function elidePrimIndexIfProhibited(indexer: Pcp_PrimIndexer): boolean {
  if (composeIsProhibitedPrimChild(indexer)) {
    const rootNode = indexer.outputs.primIndex.getRootNode()
    rootNode.setInert(true)
    for (const child of rootNode.getChildren()) elideSubtree(child, true)
    return true
  }
  return false
}

// Pcp_BuildPrimIndex (primIndex.cpp:5261-5428).
function buildPrimIndex(
  site: PcpLayerStackSite, rootSite: PcpLayerStackSite, ancestorRecursionDepth: number,
  evaluateImpliedSpecializes: boolean, evaluateVariantsAndDynamicPayloads: boolean,
  rootNodeShouldContributeSpecs: boolean, previousFrame: PcpPrimIndex_StackFrame | null,
  inputs: PcpPrimIndexInputs, outputs: PcpPrimIndexOutputs,
): void {
  const path = site.path
  if (!(path.isAbsolutePath() &&
        (path.isAbsoluteRootPath() || path.isPrimPath() || path.isPrimVariantSelectionPath()))) {
    return
  }

  if (path.pathElementCount === 0) {
    outputs.primIndex.setGraph(PcpPrimIndex_Graph.new(site, inputs.usd))
    const node = outputs.primIndex.getGraph()!.getRootNode()
    node.setHasSpecs(pcpComposeSiteHasSpecs(node.getLayerStack(), node.getPath()))
    return
  }

  const indexer = new Pcp_PrimIndexer(inputs, outputs, rootSite, ancestorRecursionDepth,
    previousFrame, evaluateImpliedSpecializes, evaluateVariantsAndDynamicPayloads)

  if (path.isPrimVariantSelectionPath()) {
    outputs.primIndex.setGraph(PcpPrimIndex_Graph.new(site, inputs.usd))
    const node = outputs.primIndex.getGraph()!.getRootNode()
    node.setHasSpecs(pcpComposeSiteHasSpecs(node.getLayerStack(), node.getPath()))
    node.setInert(!rootNodeShouldContributeSpecs)
  } else {
    buildInitialPrimIndexFromAncestor(site, rootSite, ancestorRecursionDepth, previousFrame,
      evaluateImpliedSpecializes, evaluateVariantsAndDynamicPayloads,
      rootNodeShouldContributeSpecs, inputs, outputs)
    if (elidePrimIndexIfProhibited(indexer)) return
  }

  indexer.addTasksForRootNode(outputs.primIndex.getRootNode())

  for (;;) {
    const task = indexer.popTask()
    const node = task.node!
    switch (task.type) {
      case TaskType.EvalNodeRelocations: evalNodeRelocations(node, indexer); break
      case TaskType.EvalImpliedRelocations: evalImpliedRelocations(node, indexer); break
      case TaskType.EvalNodeReferences: evalNodeReferences(node, indexer); break
      case TaskType.EvalNodeAncestralDynamicPayloads:
        evalNodeAncestralDynamicPayloads(node, indexer); break
      case TaskType.EvalNodeDynamicPayloads:
        evalNodePayloads(node, indexer, TaskType.EvalNodeDynamicPayloads, node.getPath()); break
      case TaskType.EvalNodePayloads:
        evalNodePayloads(node, indexer, TaskType.EvalNodePayloads, node.getPath()); break
      case TaskType.EvalNodeInherits: evalNodeInherits(node, indexer); break
      case TaskType.EvalImpliedClasses: evalImpliedClasses(node, indexer); break
      case TaskType.EvalNodeSpecializes: evalNodeSpecializes(node, indexer); break
      case TaskType.EvalImpliedSpecializes: evalImpliedSpecializes(node, indexer); break
      case TaskType.EvalNodeAncestralVariantSets: evalNodeAncestralVariantSets(node, indexer); break
      case TaskType.EvalNodeVariantSets: evalNodeVariantSets(node, indexer); break
      case TaskType.EvalNodeAncestralVariantAuthored:
        evalNodeAuthoredVariant(node, indexer, task.vsetPath, task.vsetName, task.vsetNum, true); break
      case TaskType.EvalNodeVariantAuthored:
        evalNodeAuthoredVariant(node, indexer, task.vsetPath, task.vsetName, task.vsetNum, false); break
      case TaskType.EvalNodeAncestralVariantFallback:
        evalNodeFallbackVariant(node, indexer, task.vsetPath, task.vsetName, task.vsetNum, true); break
      case TaskType.EvalNodeVariantFallback:
        evalNodeFallbackVariant(node, indexer, task.vsetPath, task.vsetName, task.vsetNum, false); break
      case TaskType.EvalNodeAncestralVariantNoneFound:
      case TaskType.EvalNodeVariantNoneFound:
        break
      case TaskType.EvalUnresolvedPrimPathError: evalUnresolvedPrimPathError(node, indexer); break
      case TaskType.None:
        return
    }
  }
}

// PcpComputePrimIndex (primIndex.cpp:5430-5507).
export function pcpComputePrimIndex(
  primPath: SdfPath, layerStack: PcpLayerStack, inputs: PcpPrimIndexInputs,
  outputs: PcpPrimIndexOutputs,
): void {
  if (!(primPath.isAbsolutePath() &&
        (primPath.isAbsoluteRootPath() || primPath.isPrimPath() ||
         primPath.isPrimVariantSelectionPath()))) {
    throw new Error(`Path <${primPath.pathString}> must be an absolute path to a prim, ` +
      'a prim variant-selection, or the pseudo-root.')
  }
  const site = new PcpLayerStackSite(layerStack, primPath)
  buildPrimIndex(site, site, 0, true, true, true, null, inputs, outputs)
  if (inputs.cull) cullSubtreesWithNoOpinions(outputs.primIndex, site, outputs.culledDependencies)
  if (!inputs.usd) enforcePermissions(outputs.primIndex, outputs.allErrors)
  const graph = outputs.primIndex.getGraph()!
  graph.setIsInstanceable(pcpPrimIndexIsInstanceable(outputs.primIndex))
  graph.finalize()
  pcpRescanForSpecs(outputs.primIndex, inputs.usd, false)
}

// ---------------------------------------------------------------------------
// Name children / property names

// _ComposePrimChildNamesAtNode (primIndex.cpp:5512-5656).
function composePrimChildNamesAtNode(
  node: PcpNodeRef, nameOrder: string[], nameSet: Set<string>, prohibitedNameSet: Set<string>,
): void {
  if (!node.canContributeSpecs()) return
  const layerStack = node.getLayerStack()
  const nodePath = node.getPath()
  if (layerStack.hasRelocates) {
    const namesToAdd = new Set<string>()
    const namesToRemove = new Set<string>()
    const namesToReplace = new Map<string, string>()
    for (const [oldPathStr, newPathStr] of layerStack.incrementalRelocatesSourceToTarget) {
      const oldPath = SdfPath.fromString(oldPathStr)
      if (!oldPath.hasPrefix(nodePath)) continue
      if (oldPath.getParentPath().pathString !== nodePath.pathString) continue
      const newPath = newPathStr ? SdfPath.fromString(newPathStr) : SdfPath.emptyPath
      if (!newPath.isEmpty() && newPath.getParentPath().pathString === nodePath.pathString) {
        namesToReplace.set(oldPath.name, newPath.name)
      } else {
        namesToRemove.add(oldPath.name)
      }
      prohibitedNameSet.add(oldPath.name)
    }
    for (const [newPathStr, oldPathStr] of layerStack.incrementalRelocatesTargetToSource) {
      const newPath = SdfPath.fromString(newPathStr)
      if (!newPath.hasPrefix(nodePath)) continue
      if (newPath.getParentPath().pathString !== nodePath.pathString) continue
      const oldPath = SdfPath.fromString(oldPathStr)
      if (oldPath.getParentPath().pathString === nodePath.pathString) continue
      if (!nameSet.has(newPath.name)) namesToAdd.add(newPath.name)
    }
    if (namesToReplace.size > 0 || namesToRemove.size > 0) {
      const namesToRetain: string[] = []
      for (const name of nameOrder) {
        const newName = namesToReplace.get(name)
        if (newName !== undefined) {
          nameSet.delete(name)
          if (!nameSet.has(newName)) {
            nameSet.add(newName)
            namesToRetain.push(newName)
          }
        } else if (!namesToRemove.has(name)) {
          namesToRetain.push(name)
        } else {
          nameSet.delete(name)
        }
      }
      nameOrder.splice(0, nameOrder.length, ...namesToRetain)
    }
    const added = [...namesToAdd].sort()
    nameOrder.push(...added)
    for (const name of added) nameSet.add(name)
  }
  pcpComposeSiteChildNames(layerStack.layers, nodePath, 'primChildren', nameOrder, nameSet, 'primOrder')
}

// _ComposePrimChildNames (primIndex.cpp:5658-5677).
function composePrimChildNames(
  node: PcpNodeRef, nameOrder: string[], nameSet: Set<string>, prohibitedNameSet: Set<string>,
): void {
  if (node.isCulled) return
  for (let child = node._lastChild(); child; child = child._prevSibling()) {
    composePrimChildNames(child, nameOrder, nameSet, prohibitedNameSet)
  }
  composePrimChildNamesAtNode(node, nameOrder, nameSet, prohibitedNameSet)
}

// _ComposePrimPropertyNames (primIndex.cpp:5722-5746).
function composePrimPropertyNames(
  node: PcpNodeRef, isUsd: boolean, nameOrder: string[], nameSet: Set<string>,
): void {
  if (node.isCulled) return
  for (let child = node._lastChild(); child; child = child._prevSibling()) {
    composePrimPropertyNames(child, isUsd, nameOrder, nameSet)
  }
  if (node.canContributeSpecs()) {
    pcpComposeSiteChildNames(node.getLayerStack().layers, node.getPath(), 'properties',
      nameOrder, nameSet, isUsd ? undefined : 'propertyOrder')
  }
}

// _ComputePrimChildNamesInSubtreeImpl (primIndex.cpp:5748-5780).
function computePrimChildNamesInSubtreeImpl(
  primIndex: PcpPrimIndex, subtreeRootNode: PcpNodeRef, nameOrder: string[],
  prohibitedNameSet: Set<string>,
): void {
  const nameSet = new Set(nameOrder)
  if (primIndex.isInstanceable()) {
    pcpTraverseInstanceableWeakToStrong(subtreeRootNode, {
      visit(node, nodeIsInstanceable) {
        if (nodeIsInstanceable) composePrimChildNamesAtNode(node, nameOrder, nameSet, prohibitedNameSet)
      },
    })
  } else {
    composePrimChildNames(subtreeRootNode, nameOrder, nameSet, prohibitedNameSet)
  }
  if (prohibitedNameSet.size > 0) {
    const kept = nameOrder.filter(name => !prohibitedNameSet.has(name))
    nameOrder.splice(0, nameOrder.length, ...kept)
  }
}

// PcpComputePrimStackForPrimIndex (primIndex.cpp:5828-5862), USD mode.
export function pcpComputePrimStackForPrimIndex(
  primIndex: PcpPrimIndex,
): Array<{ layer: PcpLayer; path: SdfPath }> {
  const out: Array<{ layer: PcpLayer; path: SdfPath }> = []
  for (const node of primIndex.getNodeRange()) {
    if (!node.canContributeSpecs()) continue
    const key = node.getPath().pathString
    for (const { layer } of node.getLayerStack().layers) {
      if (layer.hasSpec(key)) out.push({ layer, path: node.getPath() })
    }
  }
  return out
}

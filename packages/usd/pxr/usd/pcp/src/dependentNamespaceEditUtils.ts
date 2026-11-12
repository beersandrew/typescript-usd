// Ported from OpenUSD 26.11.1: pxr/usd/pcp/dependentNamespaceEditUtils.cpp,
//  pxr/usd/pcp/dependentNamespaceEditUtils.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.08 pxr/usd/pcp/dependentNamespaceEditUtils.{h,cpp}:
// the composition dependent edits needed to keep composed scene description
// together after moving or deleting a spec in a layer stack.

import { Error as TfError, TfDiagnosticType } from 'typescript-usd/tf'
import { SdfPath } from 'typescript-usd/sdf/path'
import { ListOp as SdfListOp, Payload as SdfPayload, Reference as SdfReference } from 'typescript-usd/sdf'
import { PcpArcType, pcpIsClassBasedArc } from './arc.ts'
import { pcpForEachDependentNode, type PcpCache } from './cache.ts'
import { pcpComposeSiteHasSpecs } from './composeSite.ts'
import { PcpDependencyType } from './dependency.ts'
import {
  PcpLayerRelocatesEditBuilder, pcpModifyRelocates, type PcpRelocates,
} from './layerRelocatesEditBuilder.ts'
import type { PcpLayer } from './layerStackIdentifier.ts'
import type { PcpLayerStack } from './layerStack.ts'
import { PcpMapExpression } from './mapExpression.ts'
import { PcpMapFunction } from './mapFunction.ts'
import type { PcpNodeRef } from './node.ts'
import type { PcpPrimIndex } from './primIndex.ts'
import { pcpGetDefaultPrimPath, pcpIsPropagatedSpecializesNode } from './utils.ts'

/** A composition field value to set on a layer spec. */
export interface PcpCompositionFieldEdit {
  layer: PcpLayer
  path: SdfPath
  fieldName: string
  // undefined clears the field (an empty VtValue).
  newFieldValue: unknown
}

/** A spec move (or delete, when newPath is empty). */
export interface PcpMoveEditDescription {
  oldPath: SdfPath
  newPath: SdfPath
}

/** PcpDependentNamespaceEdits (dependentNamespaceEditUtils.h:32-87). */
export class PcpDependentNamespaceEdits {
  // Composition fields that must be set to new values on layer specs.
  compositionFieldEdits: PcpCompositionFieldEdit[] = []
  // Spec moves to perform per layer, in order.
  layerSpecMoves = new Map<PcpLayer, PcpMoveEditDescription[]>()
  // The new relocates for each layer whose relocates must change.
  dependentRelocatesEdits = new Map<PcpLayer, PcpRelocates>()
  // Errors that prevent performing the edits.
  errors: string[] = []
  // Warnings about edits that cannot fully maintain composed prims.
  warnings: string[] = []
  // Per cache, prim index paths that are moved (or significantly changed
  // in place when old and new path match).
  dependentCachePathChanges = new Map<PcpCache, PcpMoveEditDescription[]>()
}

type _Layer = PcpLayer & {
  readonly identifier?: string
  permissionToEdit?(): boolean
}

function layerIdentifier(layer: PcpLayer): string {
  return (layer as _Layer).identifier ?? layer.filePath
}

function getLayerRelocates(layer: PcpLayer): PcpRelocates | undefined {
  const authored = layer.getField('/', 'layerRelocates')
  if (!Array.isArray(authored)) return undefined
  return authored.map(([s, t]: [string, string]) => [s, t])
}

function pathOf(path: string): SdfPath {
  return path === '' ? SdfPath.emptyPath : SdfPath.fromString(path)
}

function nodeLess(a: PcpNodeRef, b: PcpNodeRef): boolean { return a.lessThan(b) }

function pushCachePathChange(edits: PcpDependentNamespaceEdits, cache: PcpCache, change: PcpMoveEditDescription): void {
  let changes = edits.dependentCachePathChanges.get(cache)
  if (!changes) edits.dependentCachePathChanges.set(cache, changes = [])
  changes.push(change)
}

// Specializes nodes may appear in a prim index twice as the nodes are copied
// and "propagated" to be direct children of the root node, for strength
// ordering purposes, regardless of where the node was originally introduced.
// The unpropagated node is needed to determine how the node was introduced and
// this function gets that node.
function getUnpropagatedSpecializesNode(node: PcpNodeRef): PcpNodeRef | null {
  if (node.getArcType() !== PcpArcType.Specialize) return null
  // All specializes nodes are propagated to be direct children of the root
  // node, so a node whose parent is not the root is the unpropagated node.
  if (!node.getParentNode()!.isRootNode()) return node
  // A propagated node is its own unpropagated node if it was directly
  // introduced by the root node or implied to the root from a different site.
  const originNode = node.getOriginNode()!
  if (originNode === node.getParentNode() || !originNode.getSite().equals(node.getSite())) {
    return node
  }
  // Otherwise the origin node is where the specializes was introduced.
  return originNode
}

// Inverse of getUnpropagatedSpecializesNode.
function getPropagatedSpecializesNode(node: PcpNodeRef): PcpNodeRef | null {
  if (node.getArcType() !== PcpArcType.Specialize) return null
  if (node.getParentNode()!.isRootNode()) return node
  // Contributing specializes nodes are at the end of the root node's
  // children, so iterate in reverse and stop at the first non-specializes.
  const children = node.getRootNode().getChildren()
  for (let i = children.length - 1; i >= 0; i--) {
    const child = children[i]!
    if (child.getArcType() !== PcpArcType.Specialize) break
    // The propagated node has this node as its origin and shares its site.
    const childOrigin = child.getOriginNode()
    if (childOrigin === node && childOrigin.getSite().equals(node.getSite())) return child
  }
  return null
}

// How a node was introduced, abstracting the propagation of specializes.
class NodeIntroductionInfo {
  // The node that introduced this node: its parent except for propagated
  // specializes nodes.
  introducingNode: PcpNodeRef
  // The path of this node when it was introduced to the prim index.
  pathAtIntroduction: SdfPath
  // The path in the introducing node that introduced this node.
  introducingPath: SdfPath

  constructor(readonly node: PcpNodeRef) {
    const unpropagatedNode = node.getArcType() === PcpArcType.Specialize
      ? getUnpropagatedSpecializesNode(node)! : node
    let introducingNode = unpropagatedNode.getParentNode()!
    // Work with the propagated node in the end, as it is the active node with
    // the correct strength order.
    if (introducingNode.getArcType() === PcpArcType.Specialize) {
      introducingNode = getPropagatedSpecializesNode(introducingNode)!
    }
    this.introducingNode = introducingNode
    this.pathAtIntroduction = unpropagatedNode.getPathAtIntroduction()
    this.introducingPath = unpropagatedNode.getIntroPath()
  }
}

// Scratch structure for processing prim move edits.
interface SpecMovesScratch {
  specMoves: PcpMoveEditDescription[]
  // Spec moves added for implied class dependencies, which have additional
  // implications to account for when finalizing edits.
  impliedClassSpecMoves: PcpMoveEditDescription[]
}
type LayerSpecMovesScratch = Map<PcpLayer, SpecMovesScratch>

interface NodeTask {
  node: PcpNodeRef
  oldPath: SdfPath
  newPath: SdfPath
  isImpliedClassTask?: boolean
  willBeRelocated?: boolean
}

// The edits a list op composition field needs to change oldPath to newPath at
// the given site.
function processListOpCompositionFieldEditsAtSite(
  siteLayerStack: PcpLayerStack, sitePath: SdfPath, fieldName: string,
  oldPath: SdfPath, newPath: SdfPath, edits: PcpCompositionFieldEdit[],
): void {
  for (const layer of siteLayerStack.getLayers()) {
    const raw = layer.getField(sitePath.pathString, fieldName)
    if (raw === undefined) continue
    const listOp: SdfListOp<unknown> = fieldName === 'references'
      ? SdfListOp.fromValue<unknown>(raw, item => SdfReference._from(item))
      : fieldName === 'payload'
        ? SdfListOp.fromValue<unknown>(raw, item => SdfPayload._from(item))
        : SdfListOp.fromValue<unknown>(raw, item => String(item))

    const modifyCallback = (item: unknown): unknown => {
      const path = typeof item === 'string' ? pathOf(item) : (item as SdfReference | SdfPayload).getPrimPath()
      // An empty path or one outside the old path is unmodified.
      if (path.isEmpty() || !path.hasPrefix(oldPath)) return item
      // A deleted old path deletes the item.
      if (newPath.isEmpty()) return undefined
      const modifiedPath = path.replacePrefix(oldPath, newPath)
      if (typeof item === 'string') return modifiedPath.pathString
      if (item instanceof SdfReference) {
        return new SdfReference(item.assetPath, modifiedPath, item.layerOffset, item.customData ?? {})
      }
      const payload = item as SdfPayload
      return new SdfPayload(payload.assetPath, modifiedPath, payload.layerOffset)
    }

    if (listOp.modifyOperations(modifyCallback)) {
      edits.push({ layer, path: sitePath, fieldName, newFieldValue: listOp.toValue() })
    }
  }
}

// The edits the layer relocates in the layer stack need to move oldPath to
// newPath.
function processRelocatesFieldEditsAtSite(
  siteLayerStack: PcpLayerStack, oldPath: SdfPath, newPath: SdfPath,
  edits: Map<PcpLayer, PcpRelocates>,
): void {
  for (const layer of siteLayerStack.getLayers()) {
    const layerRelocates = getLayerRelocates(layer)
    if (!layerRelocates) continue
    // Relocates edits from a different dependency are updated in place so
    // they are not undone.
    const existing = edits.get(layer)
    if (existing) {
      pcpModifyRelocates(existing, oldPath.pathString, newPath.pathString)
    } else if (pcpModifyRelocates(layerRelocates, oldPath.pathString, newPath.pathString)) {
      edits.set(layer, layerRelocates)
    }
  }
}

// Processes all the edits necessary at dependent node sites in a prim index
// given one or more initial node site edits.
class PrimIndexDependentNodeEditProcessor {
  private readonly _nodeTasks: NodeTask[] = []
  private readonly _nodesVisitedByEditTasks = new Set<PcpNodeRef>()

  constructor(
    private readonly _cache: PcpCache,
    private readonly _primIndex: PcpPrimIndex,
    private readonly _edits: PcpDependentNamespaceEdits,
    private readonly _layerSpecMovesScratch: LayerSpecMovesScratch,
  ) {}

  // Adds a task for processing the spec move edit at the given node.
  addProcessEditsAtNodeTask(node: PcpNodeRef, oldPath: SdfPath, newPath: SdfPath, willBeRelocated: boolean): void {
    this._insertNodeTask({ node, oldPath, newPath, isImpliedClassTask: false, willBeRelocated })
  }

  // Processes all tasks producing all dependent edits for the prim index.
  processTasks(): void {
    while (this._processNextNodeTask()) { /* continue */ }
  }

  private _insertNodeTask(nodeTask: NodeTask): void {
    // The task list is sorted from strongest node to weakest and processed
    // from the end, so weaker nodes are processed before stronger ones. This
    // relies on nodes in a finalized prim index being ordered from strongest
    // to weakest.
    let lo = 0
    let hi = this._nodeTasks.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (nodeLess(this._nodeTasks[mid]!.node, nodeTask.node)) lo = mid + 1
      else hi = mid
    }
    this._nodeTasks.splice(lo, 0, nodeTask)
  }

  // Processes necessary edits when an edit at a node will change its path at
  // introduction.
  private _processDependentNodePathAtIntroductionChange(
    nodeIntroInfo: NodeIntroductionInfo, oldPath: SdfPath, newPath: SdfPath,
  ): void {
    // Keep the arc composing by updating the introducing composition field
    // to target the new path.
    const introducingLayerStack = nodeIntroInfo.introducingNode.getLayerStack()
    switch (nodeIntroInfo.node.getArcType()) {
      case PcpArcType.Reference:
        processListOpCompositionFieldEditsAtSite(introducingLayerStack, nodeIntroInfo.introducingPath,
          'references', oldPath, newPath, this._edits.compositionFieldEdits)
        break
      case PcpArcType.Payload:
        processListOpCompositionFieldEditsAtSite(introducingLayerStack, nodeIntroInfo.introducingPath,
          'payload', oldPath, newPath, this._edits.compositionFieldEdits)
        break
      case PcpArcType.Inherit:
        processListOpCompositionFieldEditsAtSite(introducingLayerStack, nodeIntroInfo.introducingPath,
          'inheritPaths', oldPath, newPath, this._edits.compositionFieldEdits)
        break
      case PcpArcType.Specialize:
        processListOpCompositionFieldEditsAtSite(introducingLayerStack, nodeIntroInfo.introducingPath,
          'specializes', oldPath, newPath, this._edits.compositionFieldEdits)
        break
      case PcpArcType.Variant:
        // There is no explicit path to the variant to update.
        return
      case PcpArcType.Relocate:
        // Relocates arcs are introduced by the layer relocates metadata.
        processRelocatesFieldEditsAtSite(introducingLayerStack, oldPath, newPath,
          this._edits.dependentRelocatesEdits)
        break
      default:
        throw new TfError('Unhandled composition arc', TfDiagnosticType.CodingError)
    }

    // A move only needs the introducing arc updated; log that the prim index
    // changes significantly in place.
    if (!newPath.isEmpty()) {
      const primIndexPath = this._primIndex.getPath()
      pushCachePathChange(this._edits, this._cache, { oldPath: primIndexPath, newPath: primIndexPath })
      return
    }

    // A deleted introduced path removes the arc to this node, so specs in the
    // introducing node that compose over its namespace children are deleted.
    if (nodeIntroInfo.node.isDueToAncestor()) {
      // An ancestral node is already the namespace descendant of the deleted
      // arc: delete the specs at the introducing node's path.
      this._insertNodeTask({
        node: nodeIntroInfo.introducingNode,
        oldPath: nodeIntroInfo.introducingNode.getPath(), newPath: SdfPath.emptyPath,
      })
    } else {
      // A direct arc: delete the child prim specs of the introducing site that
      // would compose over the namespace children this arc provided.
      const children = this._primIndex.computePrimChildNamesInSubtree(nodeIntroInfo.node, new Set())
      for (const childName of children) {
        this._insertNodeTask({
          node: nodeIntroInfo.introducingNode,
          oldPath: nodeIntroInfo.introducingPath.appendChild(childName), newPath: SdfPath.emptyPath,
        })
      }
    }
  }

  // Adds spec move edits to the scratch space for layers affected by this
  // node edit task.
  private _addSpecMoveEdits(nodeTask: NodeTask): void {
    const node = nodeTask.node

    // Skip nodes that can't contribute specs.
    if (!node.canContributeSpecs()) return

    // The old path may be an ancestor of the node's path, in which case the
    // spec to move is the node path itself.
    const oldSpecPath = node.getPath().hasPrefix(nodeTask.oldPath) ? node.getPath() : nodeTask.oldPath

    // Specs from upstream nodes that remain composing into oldSpecPath (and
    // aren't edited) prevent moving the specs at this node, unless new
    // relocates will be applied to it by the initial edit.
    if (!nodeTask.willBeRelocated && this._hasUneditedUpstreamSpecConflicts(node, oldSpecPath)) return

    const newSpecPath = nodeTask.newPath.isEmpty()
      ? SdfPath.emptyPath : oldSpecPath.replacePrefix(nodeTask.oldPath, nodeTask.newPath)

    const layersToEdit = pcpGatherLayersToEditForSpecMove(
      node.getLayerStack(), oldSpecPath, newSpecPath, this._edits.errors)
    for (const layer of layersToEdit) {
      let specMovesScratch = this._layerSpecMovesScratch.get(layer)
      if (!specMovesScratch) {
        this._layerSpecMovesScratch.set(layer, specMovesScratch = { specMoves: [], impliedClassSpecMoves: [] })
      }

      // Implied class spec moves are tracked to determine further
      // dependencies on the moved spec.
      if (nodeTask.isImpliedClassTask) {
        specMovesScratch.impliedClassSpecMoves.push({ oldPath: oldSpecPath, newPath: newSpecPath })
        // Deletes for implied class dependencies are optional: another edit
        // moving the same spec takes precedence. They are added when
        // finalizing.
        if (newSpecPath.isEmpty()) continue
      }
      specMovesScratch.specMoves.push({ oldPath: oldSpecPath, newPath: newSpecPath })
    }

    // Update any layer defaultPrim set to the old path or a descendant.
    for (const layer of node.getLayerStack().getLayers()) {
      const defaultPrimPath = pcpGetDefaultPrimPath(layer)
      if (defaultPrimPath.isEmpty() || !defaultPrimPath.hasPrefix(oldSpecPath)) continue
      if (newSpecPath.isEmpty()) {
        // A delete clears the defaultPrim field.
        this._edits.compositionFieldEdits.push({
          layer, path: SdfPath.absoluteRootPath, fieldName: 'defaultPrim', newFieldValue: undefined,
        })
      } else {
        const newDefaultPrimPath = defaultPrimPath.replacePrefix(oldSpecPath, newSpecPath)
        this._edits.compositionFieldEdits.push({
          layer, path: SdfPath.absoluteRootPath, fieldName: 'defaultPrim',
          newFieldValue: convertDefaultPrimPathToToken(newDefaultPrimPath),
        })
      }
    }
  }

  // Whether specs in an unedited node descendant of the node map to the site
  // edit path.
  private _hasUneditedUpstreamSpecConflicts(siteEditNode: PcpNodeRef, siteEditPath: SdfPath): boolean {
    let firstConflictingNode: PcpNodeRef | undefined
    if (!siteEditNode.getPath().equals(siteEditPath)) {
      // A child spec delete task for a deleted arc: look for conflicts with
      // the namespace child.
      if (!siteEditPath.getParentPath().equals(siteEditNode.getPath())) {
        throw new TfError(`Descendant site path <${siteEditPath.pathString}> is not a direct ` +
          `namespace child of node site path <${siteEditNode.getPath().pathString}>. Namespace ` +
          'descendant sites are expected to be at most a direct namespace child.',
        TfDiagnosticType.CodingError)
      }
      firstConflictingNode = this._findConflictingChildSpecsInUneditedNodes(
        siteEditNode, siteEditPath.name, siteEditPath.isPrimPropertyPath())
    } else {
      firstConflictingNode = this._findConflictingSpecsInUneditedNodes(siteEditNode)
    }
    if (!firstConflictingNode) return false

    this._edits.warnings.push(`Cannot edit specs for <${siteEditPath.pathString}> on node ` +
      `${siteString(siteEditNode)}: found conflicting specs at node ${siteString(firstConflictingNode)} ` +
      'that will not be edited.')
    return true
  }

  // The first unedited node below the node with conflicting node specs.
  private _findConflictingSpecsInUneditedNodes(siteEditNode: PcpNodeRef): PcpNodeRef | undefined {
    for (const childNode of siteEditNode.getChildren()) {
      // Direct arcs map their whole subtree to the node's site path.
      if (!childNode.isDueToAncestor()) continue
      // Visited subtrees are edited along with this node.
      if (this._nodesVisitedByEditTasks.has(childNode)) continue
      for (const subtreeNode of this._primIndex.getNodeSubtreeRange(childNode)) {
        if (!this._nodesVisitedByEditTasks.has(subtreeNode) && subtreeNode.hasSpecs &&
            subtreeNode.canContributeSpecs()) {
          return subtreeNode
        }
      }
    }
    return undefined
  }

  // The first unedited node below the node with conflicting specs for the
  // named child of the node path.
  private _findConflictingChildSpecsInUneditedNodes(
    siteEditNode: PcpNodeRef, childName: string, isProperty: boolean,
  ): PcpNodeRef | undefined {
    if (childName === '') return undefined
    for (const childNode of siteEditNode.getChildren()) {
      if (this._nodesVisitedByEditTasks.has(childNode)) continue
      for (const subtreeNode of this._primIndex.getNodeSubtreeRange(childNode)) {
        if (this._nodesVisitedByEditTasks.has(subtreeNode) || !subtreeNode.canContributeSpecs()) continue
        const layerStack = subtreeNode.getLayerStack()
        const subtreeNodeChildPath = isProperty
          ? subtreeNode.getPath().appendProperty(childName)
          : subtreeNode.getPath().appendChild(childName)
        if (subtreeNode.hasSpecs && pcpComposeSiteHasSpecs(layerStack, subtreeNodeChildPath)) {
          return subtreeNode
        }
        // A relocate targeting the child path is the same as a conflicting
        // spec, since relocates arcs are introduced by layer metadata.
        if (layerStack.hasRelocates &&
            layerStack.incrementalRelocatesTargetToSource.has(subtreeNodeChildPath.pathString)) {
          return subtreeNode
        }
      }
    }
    return undefined
  }

  // Processes the next node task; false when there are none.
  private _processNextNodeTask(): boolean {
    // The last task is the weakest node's, which matters for determining
    // edited and unedited nodes when looking for subtree spec conflicts.
    const nodeTask = this._nodeTasks.pop()
    if (!nodeTask) return false
    const { node, oldPath, newPath } = nodeTask

    // Mark this node visited so stronger nodes know its spec edits are done.
    this._nodesVisitedByEditTasks.add(node)

    this._addSpecMoveEdits(nodeTask)

    // The root node has no further dependencies; log the cache path change.
    if (node.getArcType() === PcpArcType.Root) {
      pushCachePathChange(this._edits, this._cache, { oldPath, newPath })
      return true
    }

    this._processNextImpliedClass(nodeTask)

    const nodeIntroInfo = new NodeIntroductionInfo(node)

    if (nodeIntroInfo.pathAtIntroduction.hasPrefix(oldPath)) {
      // The edit affects the node's path at introduction: fix up the
      // introducing composition field.
      this._processDependentNodePathAtIntroductionChange(nodeIntroInfo, oldPath, newPath)
    } else {
      // The edit affects namespace descendant specs of this node: move the
      // corresponding descendant specs in the introducing node.
      const oldPathInIntroducingNode = oldPath.replacePrefix(
        nodeIntroInfo.pathAtIntroduction, nodeIntroInfo.introducingPath)
      const newPathInIntroducingNode = mapNewPathToIntroducingNode(nodeIntroInfo, newPath)
      this._insertNodeTask({
        node: nodeIntroInfo.introducingNode,
        oldPath: oldPathInIntroducingNode, newPath: newPathInIntroducingNode,
      })
    }
    return true
  }

  // Adds a task for the next implied class of a class based node.
  private _processNextImpliedClass(nodeTask: NodeTask): void {
    const { node, oldPath, newPath } = nodeTask
    const implied = node.getArcType() === PcpArcType.Specialize
      ? getNextImpliedSpecializes(node)
      : node.getArcType() === PcpArcType.Inherit
        ? getNextImpliedInherit(node)
        : undefined
    if (!implied) return
    const [impliedNode, transferFunction] = implied

    // The path at the origin root's introduction is the real path at
    // introduction for implied class nodes.
    const originPathAtClassIntroduction = node.getPathAtOriginRootIntroduction()
    const impliedPathAtClassIntroduction = impliedNode.getPathAtOriginRootIntroduction()

    let oldPathInImpliedNode: SdfPath
    let newPathInImpliedNode: SdfPath
    if (originPathAtClassIntroduction.hasPrefix(oldPath)) {
      // The edit affects the class introduction path: map both paths with
      // the transfer function.
      oldPathInImpliedNode = transferFunction.mapSourceToTarget(oldPath)
      newPathInImpliedNode = transferFunction.mapSourceToTarget(newPath)
    } else {
      // The edit affects a namespace descendant of the origin node.
      oldPathInImpliedNode = oldPath.replacePrefix(originPathAtClassIntroduction, impliedPathAtClassIntroduction)
      // A new path moved out of the class introduction namespace is a delete
      // at the implied node.
      newPathInImpliedNode = newPath.hasPrefix(originPathAtClassIntroduction)
        ? newPath.replacePrefix(originPathAtClassIntroduction, impliedPathAtClassIntroduction)
        : SdfPath.emptyPath
    }

    this._insertNodeTask({
      node: impliedNode, oldPath: oldPathInImpliedNode, newPath: newPathInImpliedNode,
      isImpliedClassTask: true,
    })
  }
}

function siteString(node: PcpNodeRef): string {
  const layerStack = node.getLayerStack()
  return `@${layerIdentifier(layerStack.identifier.rootLayer as PcpLayer)}@<${node.getPath().pathString}>`
}

// SdfLayer::ConvertDefaultPrimPathToToken: root prim paths are their name.
function convertDefaultPrimPathToToken(path: SdfPath): string {
  if (path.isEmpty()) return ''
  return path.isRootPrimPath() ? path.name : path.pathString
}

// Maps the new path a node's specs move to into its introducing node. The
// node's map to parent is not used: identity mappings, propagated specializes
// and stripped variant selections would give the wrong path.
function mapNewPathToIntroducingNode(nodeIntroInfo: NodeIntroductionInfo, newPath: SdfPath): SdfPath {
  // Relocates were already applied when the descendant node was processed.
  if (nodeIntroInfo.node.getArcType() === PcpArcType.Relocate) return newPath

  // A new path outside the introduced node's namespace no longer maps to the
  // introducing node, which deletes the specs there.
  if (!newPath.hasPrefix(nodeIntroInfo.pathAtIntroduction)) return SdfPath.emptyPath

  const newPathInIntroducingNode = newPath.replacePrefix(
    nodeIntroInfo.pathAtIntroduction, nodeIntroInfo.introducingPath)

  const introducingLayerStack = nodeIntroInfo.introducingNode.getLayerStack()
  if (!introducingLayerStack.hasRelocates) return newPathInIntroducingNode

  // The introducing layer stack's relocates may affect the new path: map it
  // to its absolute source path, then to its final target path.
  const mapPath = (reloMap: ReadonlyMap<string, string>, path: SdfPath): SdfPath => {
    // The best match is the longest relocate path that prefixes the path.
    let best: [SdfPath, SdfPath] | undefined
    for (const [source, target] of reloMap) {
      const sourcePath = SdfPath.fromString(source)
      if (!path.hasPrefix(sourcePath)) continue
      if (!best || sourcePath.pathString.length > best[0].pathString.length) {
        best = [sourcePath, pathOf(target)]
      }
    }
    return best ? path.replacePrefix(best[0], best[1]) : path
  }
  return mapPath(introducingLayerStack.relocatesSourceToTarget,
    mapPath(introducingLayerStack.relocatesTargetToSource, newPathInIntroducingNode))
}

// The transfer function from an origin class tree source parent to an implied
// class tree destination parent.
function computeImpliedClassTransferFunction(sourceParent: PcpNodeRef, destParent: PcpNodeRef): PcpMapFunction {
  let transferFunction = PcpMapFunction.create(
    [[sourceParent.getPathAtIntroduction(), sourceParent.getIntroPath()]])
  // The destination parent may be a further ancestor (like across a relocates
  // node); compose each parent's mapping up to it.
  for (let transferNode = sourceParent.getParentNode()!; transferNode !== destParent;
    transferNode = transferNode.getParentNode()!) {
    transferFunction = PcpMapFunction.create(
      [[transferNode.getPathAtIntroduction(), transferNode.getIntroPath()]]).compose(transferFunction)
  }
  // Class nodes outside of the parent's domain are still implied as global
  // inherits.
  return PcpMapExpression.constant(transferFunction).addRootIdentity().evaluate()
}

// The source parent node of the class tree the origin node was implied from,
// following _EvalImpliedClassTree in primIndex.cpp.
function getImpliedClassTreeSourceParent(originNode: PcpNodeRef): PcpNodeRef | null {
  if (!pcpIsClassBasedArc(originNode.getArcType())) return null
  let sourceParent = originNode.getParentNode()!
  for (; !sourceParent.isRootNode(); sourceParent = sourceParent.getParentNode()!) {
    // A non-class arc is never part of a nested implied class tree.
    if (!pcpIsClassBasedArc(sourceParent.getArcType())) break
    // A class parent introduced ancestrally can still be the source parent.
    if (originNode.getDepthBelowIntroduction() < sourceParent.getDepthBelowIntroduction()) break
    // Jump from a propagated specializes node to its origin to continue.
    if (pcpIsPropagatedSpecializesNode(sourceParent)) sourceParent = sourceParent.getOriginNode()!
  }
  return sourceParent
}

// The closest shared ancestor of two nodes, relying on finalized prim index
// nodes being ordered from strongest to weakest.
function getClosestSharedAncestorNode(node1: PcpNodeRef, node2: PcpNodeRef): PcpNodeRef | null {
  if (node1 === node2) return node1
  // A parent is stronger than its descendants: walk up from the weaker node
  // to the first node stronger than the stronger node.
  const getSharedParent = (strongerNode: PcpNodeRef, weakerNode: PcpNodeRef): PcpNodeRef | null => {
    for (let parent = weakerNode.getParentNode(); parent; parent = parent.getParentNode()) {
      if (parent.lessThan(strongerNode)) return parent
    }
    return null
  }
  return node2.lessThan(node1) ? getSharedParent(node2, node1) : getSharedParent(node1, node2)
}

type ImpliedNodeAndTransferFunction = [PcpNodeRef, PcpMapFunction]

// The specializes node implied from the given propagated specializes node.
function getNextImpliedSpecializes(
  propagatedSpecializesOriginNode: PcpNodeRef,
): ImpliedNodeAndTransferFunction | undefined {
  const unpropagatedSpecializesOriginNode = getUnpropagatedSpecializesNode(propagatedSpecializesOriginNode)!
  // All specializes nodes are propagated to the root as its weakest
  // children.
  const children = unpropagatedSpecializesOriginNode.getRootNode().getChildren()
  for (let i = children.length - 1; i >= 0; i--) {
    const child = children[i]!
    if (child.getArcType() !== PcpArcType.Specialize) break
    const unpropagatedChild = getUnpropagatedSpecializesNode(child)!
    const unpropagatedChildOrigin = unpropagatedChild.getOriginNode()
    // Skip if the unpropagated child has no origin.
    if (unpropagatedChildOrigin === unpropagatedChild.getParentNode()) continue
    if (unpropagatedChildOrigin === unpropagatedSpecializesOriginNode) {
      // Compute the transfer function in the unpropagated tree, which has
      // the correct ancestor hierarchy, and return the propagated node.
      const sourceParent = getImpliedClassTreeSourceParent(unpropagatedSpecializesOriginNode)!
      const destParent = getClosestSharedAncestorNode(sourceParent, unpropagatedChild)!
      return [child, computeImpliedClassTransferFunction(sourceParent, destParent)]
    }
  }
  return undefined
}

// The class based node in the subtree whose origin node is originNode.
function findClassNodeWithOriginInSubtree(subtreeRoot: PcpNodeRef, originNode: PcpNodeRef): PcpNodeRef | null {
  // Nested class arcs are implied only as subtrees of class based arcs, so
  // prune the search at any non-class based arc.
  const stack: PcpNodeRef[] = [subtreeRoot]
  while (stack.length > 0) {
    const node = stack.pop()!
    if (!pcpIsClassBasedArc(node.getArcType())) continue
    if (node.getOriginNode() === originNode) return node
    stack.push(...node.getChildren().reverse())
  }
  return null
}

// The inherits node implied from the given inherits node.
function getNextImpliedInherit(originNode: PcpNodeRef): ImpliedNodeAndTransferFunction | undefined {
  if (originNode.getArcType() !== PcpArcType.Inherit) return undefined

  // Inherits are implied from the origin node's original parent to a direct
  // ancestor of the parent node.
  const sourceParent = getImpliedClassTreeSourceParent(originNode)
  if (!sourceParent) return undefined

  let destParent = sourceParent.getParentNode()
  let skipChild = sourceParent
  let curOriginNode = originNode
  while (destParent) {
    for (const child of destParent.getChildren()) {
      if (child === skipChild) continue
      const impliedNode = findClassNodeWithOriginInSubtree(child, curOriginNode)
      if (impliedNode) {
        // An inert implied node is a placeholder (typically under a
        // relocates node) for continuing to imply the inherit up the tree.
        if (!impliedNode.canContributeSpecs()) {
          curOriginNode = impliedNode
          break
        }
        return [impliedNode, computeImpliedClassTransferFunction(sourceParent, destParent)]
      }
    }
    // The node may have been implied under a different ancestor, such as
    // across a relocate node.
    skipChild = destParent
    destParent = destParent.getParentNode()
  }
  return undefined
}

function moveEditDescLessThan(lhs: PcpMoveEditDescription, rhs: PcpMoveEditDescription): boolean {
  const c = SdfPath.compare(lhs.oldPath, rhs.oldPath)
  return c !== 0 ? c < 0 : SdfPath.compare(lhs.newPath, rhs.newPath) < 0
}

function moveEditDescCompare(lhs: PcpMoveEditDescription, rhs: PcpMoveEditDescription): number {
  return moveEditDescLessThan(lhs, rhs) ? -1 : moveEditDescLessThan(rhs, lhs) ? 1 : 0
}

// Finalizes the spec move edits into lists that can each be performed in
// order with no errors.
function finalizeSpecMoveEdits(edits: PcpDependentNamespaceEdits, layerSpecMovesScratch: LayerSpecMovesScratch): void {
  for (const [layer, { specMoves, impliedClassSpecMoves }] of layerSpecMovesScratch) {
    if (specMoves.length > 1) {
      specMoves.sort(moveEditDescCompare)
      // Remove duplicates, which are adjacent after sorting.
      for (let i = 0; i + 1 < specMoves.length;) {
        const it = specMoves[i]!
        const next = specMoves[i + 1]!
        if (next.oldPath.equals(it.oldPath)) {
          if (next.newPath.equals(it.newPath)) {
            specMoves.splice(i + 1, 1)
            continue
          }
          edits.errors.push(`Dependent edit conflict: Trying to move spec at layer ` +
            `@${layerIdentifier(layer)}@ and path <${it.oldPath.pathString}> to both new paths ` +
            `<${it.newPath.pathString}> and <${next.newPath.pathString}>`)
        }
        i++
      }
    }

    // Add each optional implied class delete unless an edit for the same
    // path exists.
    for (const impliedClassSpecMove of impliedClassSpecMoves) {
      if (!impliedClassSpecMove.newPath.isEmpty()) continue
      const specDelete = { oldPath: impliedClassSpecMove.oldPath, newPath: SdfPath.emptyPath }
      let insert = 0
      while (insert < specMoves.length && moveEditDescLessThan(specMoves[insert]!, specDelete)) insert++
      if (insert === specMoves.length || !specMoves[insert]!.oldPath.equals(specDelete.oldPath)) {
        specMoves.splice(insert, 0, specDelete)
      }
    }

    // Remove edits subsumed by an ancestor edit.
    for (let i = 0; i < specMoves.length;) {
      const { oldPath: thisOldPath, newPath: thisNewPath } = specMoves[i]!
      let other: PcpMoveEditDescription | undefined
      for (let j = i - 1; j >= 0; j--) {
        if (thisOldPath.hasPrefix(specMoves[j]!.oldPath)) { other = specMoves[j]; break }
      }
      if (other && ((other.newPath.isEmpty() && thisNewPath.isEmpty()) ||
          (!other.newPath.isEmpty() &&
            thisOldPath.replacePrefix(other.oldPath, other.newPath).equals(thisNewPath)))) {
        specMoves.splice(i, 1)
        continue
      }
      i++
    }

    edits.layerSpecMoves.set(layer, specMoves)
  }
}

// Finalizes the dependent cache path changes by removing duplicates.
function finalizeDependentCachePathChanges(
  edits: PcpDependentNamespaceEdits, dependentCaches: readonly PcpCache[],
): void {
  for (const depCache of dependentCaches) {
    let changes = edits.dependentCachePathChanges.get(depCache)
    if (!changes) edits.dependentCachePathChanges.set(depCache, changes = [])
    // Upstream returns (not continues) here.
    if (changes.length <= 1) return
    changes.sort(moveEditDescCompare)
    const unique = changes.filter((c, i) => i === 0 || moveEditDescCompare(changes![i - 1]!, c) !== 0)
    changes.splice(0, changes.length, ...unique)
  }
}

/**
 * PcpGatherDependentNamespaceEdits (dependentNamespaceEditUtils.cpp:1656-1894):
 * the dependent edits in the given caches for moving oldPath to newPath (or
 * deleting it when newPath is empty) in the affected layers, optionally adding
 * relocates to affectedRelocatesLayerStack.
 */
export function pcpGatherDependentNamespaceEdits(
  oldPath: SdfPath, newPath: SdfPath, affectedLayers: readonly PcpLayer[],
  affectedRelocatesLayerStack: PcpLayerStack | undefined,
  addRelocatesToLayerStackEditLayer: PcpLayer | undefined,
  dependentCaches: readonly PcpCache[],
): PcpDependentNamespaceEdits {
  const edits = new PcpDependentNamespaceEdits()
  const layerSpecMovesScratch: LayerSpecMovesScratch = new Map()

  // Each affected layer with whether it has a relocates edit, so dependent
  // nodes affected by the new relocates skip the conflicting subtree specs
  // check.
  const affectedLayersAndHasRelocatesEdits: Array<[PcpLayer, boolean]> =
    affectedLayers.map(layer => [layer, false])

  if (affectedRelocatesLayerStack) {
    const builder = new PcpLayerRelocatesEditBuilder(
      affectedRelocatesLayerStack, addRelocatesToLayerStackEditLayer)
    const error = builder.relocate(oldPath, newPath)
    if (error !== undefined) {
      throw new TfError(`Cannot get relocates edits because: ${error}`, TfDiagnosticType.CodingError)
    }
    for (const [layer, relocates] of builder.getEdits()) {
      const found = affectedLayersAndHasRelocatesEdits.find(entry => entry[0] === layer)
      if (!found) affectedLayersAndHasRelocatesEdits.push([layer, true])
      else found[1] = true
      edits.dependentRelocatesEdits.set(layer, relocates)
    }
  }

  for (const cache of dependentCaches) {
    for (const [layer, hasRelocatesEdits] of affectedLayersAndHasRelocatesEdits) {
      // Prim index or property paths depending on the old path in this
      // layer, including virtual dependencies, recursing on the site and
      // filtered on computed prim indexes.
      const deps = cache.findSiteDependencies(layer, oldPath,
        PcpDependencyType.AnyIncludingVirtual, /* recurseOnSite */ true,
        /* recurseOnIndex */ false, /* filter */ true)

      const seenDependencies = new Set<string>()
      for (const dep of deps) {
        // FindSiteDependencies frequently returns duplicates.
        const depKey = `${dep.indexPath.pathString}\0${dep.sitePath.pathString}`
        if (seenDependencies.has(depKey)) continue
        seenDependencies.add(depKey)

        const primIndex = cache.findPrimIndex(dep.indexPath.getPrimPath())
        if (!primIndex) continue

        const dependentNodeProcessor = new PrimIndexDependentNodeEditProcessor(
          cache, primIndex, edits, layerSpecMovesScratch)
        pcpForEachDependentNode(dep.sitePath, layer, dep.indexPath, cache, (_depIndexPath, node) => {
          dependentNodeProcessor.addProcessEditsAtNodeTask(node, oldPath, newPath, hasRelocatesEdits)
        })
        dependentNodeProcessor.processTasks()
      }
    }
  }

  // Implied class edits introduce dependencies not caught by the initial
  // site dependencies: log their prim index paths as changed for caches that
  // include the implied class site's layer.
  for (const depCache of dependentCaches) {
    let changes = edits.dependentCachePathChanges.get(depCache)
    if (!changes) edits.dependentCachePathChanges.set(depCache, changes = [])
    for (const [layer, specMovesScratch] of layerSpecMovesScratch) {
      if (!depCache.getLayerStack().hasLayer(layer)) continue
      for (const specEdit of specMovesScratch.impliedClassSpecMoves) changes.push(specEdit)
    }
  }

  finalizeDependentCachePathChanges(edits, dependentCaches)
  finalizeSpecMoveEdits(edits, layerSpecMovesScratch)
  return edits
}

/**
 * PcpGatherLayersToEditForSpecMove (dependentNamespaceEditUtils.cpp:1896-1940):
 * the layers of the layer stack with a spec at oldSpecPath, adding errors for
 * layers where the spec cannot be moved to newSpecPath.
 */
export function pcpGatherLayersToEditForSpecMove(
  layerStack: PcpLayerStack, oldSpecPath: SdfPath, newSpecPath: SdfPath, errors: string[],
): PcpLayer[] {
  const layersToEdit = layerStack.getLayers().filter(layer => layer.hasSpec(oldSpecPath.pathString))
  for (const layer of layersToEdit) {
    if ((layer as _Layer).permissionToEdit?.() === false) {
      errors.push(`The spec @${layerIdentifier(layer)}@<${oldSpecPath.pathString}> cannot be edited ` +
        'because the layer is not editable')
    }
    if (!newSpecPath.isEmpty() && layer.hasSpec(newSpecPath.pathString)) {
      errors.push(`The spec @${layerIdentifier(layer)}@<${oldSpecPath.pathString}> cannot be moved to ` +
        `<${newSpecPath.pathString}> because a spec already exists at the new path`)
    }
  }
  return layersToEdit
}

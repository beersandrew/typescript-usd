// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdsi/renderPassPruneSceneIndex.cpp,
//  pxr/imaging/hdsi/renderPassPruneSceneIndex.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/imaging/hdsi/renderPassPruneSceneIndex.{h,cpp}.
//
// Paths are the string paths this port's Hydra uses. The SdfPathTable
// _instanceToInstancerMap is a Map from an instance location to the
// instancers that reference it; FindSubtreeRange is the entries at or below
// a path. JavaScript is single threaded, so the mutex guarding it is not
// ported. TRACE_FUNCTION scopes are not ported.

import { MakeTokens as TfMakeTokens } from 'typescript-usd/tf'
import { SdfPath } from 'typescript-usd/sdf/path'
import { SdfPathExpression } from 'typescript-usd/sdf/pathExpression'
import { Array as VtArray, Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import {
  CollectionsSchema as HdCollectionsSchema,
  CollectionPredicateLibrary as HdCollectionPredicateLibrary,
  ContainerDataSourceEditor as HdContainerDataSourceEditor,
  CreateTypedRetainedDataSource as HdCreateTypedRetainedDataSource,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  InstancerTopologySchema as HdInstancerTopologySchema,
  InstancerTopologySchemaTokens as HdInstancerTopologySchemaTokens,
  PrimTypeTokens as HdPrimTypeTokens,
  SceneGlobalsSchema as HdSceneGlobalsSchema,
  SceneIndexPrimView as HdSceneIndexPrimView,
  SingleInputFilteringSceneIndexBase as HdSingleInputFilteringSceneIndexBase,
} from 'typescript-usd/hd'
import type {
  AddedPrimEntry,
  CollectionExpressionEvaluator as HdCollectionExpressionEvaluator,
  DirtiedPrimEntry,
  RemovedPrimEntry,
  SceneIndexBase as HdSceneIndexBase,
  SceneIndexPrim as HdSceneIndexPrim,
} from 'typescript-usd/hd'
import { HdsiUtilsCompileCollection, HdsiUtilsIsPruned, HdsiUtilsRemovePrunedChildren } from './utils.ts'
import { TF_RUNTIME_ERROR } from './tfDiagnostic.ts'

// renderPassPruneSceneIndex.cpp:26-29
const _tokens = TfMakeTokens({
  prune: 'prune',
})

function _ToArray<T>(value: unknown): T[] {
  if (value instanceof VtArray) return (value as VtArray<T>).toArray()
  return value ? [...(value as Iterable<T>)] : []
}

/** Prune state specified by a render pass (renderPassPruneSceneIndex.h:75-84). */
class _RenderPassPruneState {
  renderPassPath = ''
  // Retain the expression so we can compare old vs. new state.
  expr = new SdfPathExpression()
  // Evalulator for the pattern expression.
  eval: HdCollectionExpressionEvaluator | undefined = undefined

  /** renderPassPruneSceneIndex.cpp:61-66 */
  doesPrune(primPath: string): boolean {
    return this.eval ? HdsiUtilsIsPruned(primPath, this.eval) : false
  }
}

/** renderPassPruneSceneIndex.cpp:195-210: whether an entry could affect the
 *  active render pass. */
function _EntryCouldAffectPass(
  entries: readonly { primPath: string }[],
  activeRenderPassPath: string,
): boolean {
  for (const entry of entries) {
    // The prim at the root path contains the HdSceneGlobalsSchema.
    // The prim at the render pass path controls its behavior.
    if (entry.primPath === '/' || entry.primPath === activeRenderPassPath) {
      return true
    }
  }
  return false
}

/** renderPassPruneSceneIndex.cpp:215-246: when pruning is active and an
 *  entry is pruned, appends the surviving entries to `postPruneEntries` and
 *  returns true. */
function _PruneEntries<E extends { primPath: string }>(
  pruneEval: HdCollectionExpressionEvaluator | undefined,
  entries: readonly E[],
  postPruneEntries: E[],
): boolean {
  if (!pruneEval) {
    // No pruning active.
    return false
  }

  // Pre-pass to see if any prune applies to the list.
  let foundEntryToPrune = false
  for (const entry of entries) {
    if (HdsiUtilsIsPruned(entry.primPath, pruneEval)) {
      foundEntryToPrune = true
      break
    }
  }
  if (!foundEntryToPrune) {
    // No entries to prune.
    return false
  } else {
    // Prune matching entries.
    for (const entry of entries) {
      if (!HdsiUtilsIsPruned(entry.primPath, pruneEval)) {
        // Accumulate survivors.
        postPruneEntries.push(entry)
      }
    }
    return true
  }
}

let _instancerMaskLocatorSet: HdDataSourceLocatorSet | undefined

/**
 * Applies the "prune" collection of the active render pass (named by the
 * HdSceneGlobalsSchema of the root prim): pruned prims and their descendants
 * are removed from the scene, and pruned instance locations are masked out of
 * the instancers that reference them (renderPassPruneSceneIndex.h:22-109).
 */
export class HdsiRenderPassPruneSceneIndex extends HdSingleInputFilteringSceneIndexBase {
  private readonly _predicateLibrary: HdCollectionPredicateLibrary
  // Prune state for the active render pass.
  private _activeRenderPass = new _RenderPassPruneState()
  // Flag used to track the first time prims have been added.
  private _hasPopulated = false
  // Maps each instance location path to the set of instancer paths that
  // reference it. Populated lazily in GetPrim() and used to find only the
  // instancers affected by a prune change.
  private readonly _instanceToInstancerMap = new Map<string, Set<string>>()

  /** renderPassPruneSceneIndex.cpp:31-50: with no predicate library (the
   *  deprecated signature), an empty one. */
  static new(
    inputSceneIndex: HdSceneIndexBase,
    predicateLibrary: HdCollectionPredicateLibrary = new HdCollectionPredicateLibrary(),
  ): HdsiRenderPassPruneSceneIndex {
    return new HdsiRenderPassPruneSceneIndex(inputSceneIndex, predicateLibrary)
  }

  /** renderPassPruneSceneIndex.cpp:52-58 */
  protected constructor(
    inputSceneIndex: HdSceneIndexBase,
    predicateLibrary: HdCollectionPredicateLibrary,
  ) {
    super(inputSceneIndex)
    this._predicateLibrary = predicateLibrary
  }

  /** renderPassPruneSceneIndex.cpp:68-148 */
  getPrim(primPath: string): HdSceneIndexPrim {
    // Note that we also apply pruning in GetChildPrimPaths(), but
    // this ensures that even if a downstream scene index asks
    // for a pruned path, it will remain pruned.
    if (primPath === '') {
      // Avoid triggering a runtime warning when passing an empty
      // path to the collection expression evaluator, since it
      // can generate a lot of spew.
      return { primType: '', dataSource: undefined }
    }
    if (this._activeRenderPass.doesPrune(primPath)) {
      return { primType: '', dataSource: undefined }
    }

    const prim = this._getInputSceneIndex().getPrim(primPath)

    // For instancers: populate the instance-location->instancer map, and
    // apply pruning to the instance mask if pruning is active.
    if (prim.primType === HdPrimTypeTokens.instancer) {
      const topologySchema = HdInstancerTopologySchema.getFromParent(prim.dataSource)
      if (topologySchema.isDefined()) {
        const instanceLocationPathsDs = topologySchema.getInstanceLocations()
        const instanceLocationPaths = instanceLocationPathsDs
          ? _ToArray<string>(instanceLocationPathsDs.getTypedValue(0.0))
          : []

        // Track which instancers use each instance location so that
        // prune changes can dirty only the relevant instancer masks.
        for (const path of instanceLocationPaths) {
          let instancers = this._instanceToInstancerMap.get(path)
          if (!instancers) {
            instancers = new Set()
            this._instanceToInstancerMap.set(path, instancers)
          }
          instancers.add(primPath)
        }

        // Apply pruning to the instance mask.
        const pruneEval = this._activeRenderPass.eval
        if (instanceLocationPaths.length > 0 && pruneEval) {
          const maskDs = topologySchema.GetMask()
          const mask = maskDs
            ? _ToArray<boolean>(maskDs.getTypedValue(0.0))
            : new Array<boolean>(instanceLocationPaths.length).fill(true)
          if (instanceLocationPaths.length === mask.length) {
            let maskWasModified = false
            for (let i = 0, n = mask.length; i < n; ++i) {
              if (!mask[i]) {
                continue
              }
              mask[i] = !HdsiUtilsIsPruned(instanceLocationPaths[i]!, pruneEval)
              maskWasModified ||= !mask[i]
            }
            if (maskWasModified) {
              const instancerMaskLocator =
                HdInstancerTopologySchema.getDefaultLocator()
                  .append(HdInstancerTopologySchemaTokens.mask)
              const editor = new HdContainerDataSourceEditor(prim.dataSource)
              editor.Set(instancerMaskLocator,
                HdCreateTypedRetainedDataSource(
                  VtValue.createArray(new VtArray<boolean>(mask, VtValueTypes.bool))))
              return { primType: prim.primType, dataSource: editor.finish() }
            }
          } else {
            TF_RUNTIME_ERROR(`Instancer topology mismatch in <${primPath}>`)
          }
        }
      }
    }

    return prim
  }

  /** renderPassPruneSceneIndex.cpp:150-164 */
  getChildPrimPaths(primPath: string): string[] {
    const pruneEval = this._activeRenderPass.eval
    if (pruneEval) {
      const childPathVec = this._getInputSceneIndex().getChildPrimPaths(primPath)
      HdsiUtilsRemovePrunedChildren(primPath, pruneEval, childPathVec)
      return childPathVec
    } else {
      return this._getInputSceneIndex().getChildPrimPaths(primPath)
    }
  }

  /** renderPassPruneSceneIndex.cpp:250-274 */
  protected _primsAdded(_sender: HdSceneIndexBase, entries: AddedPrimEntry[]): void {
    const extraAddedEntries: AddedPrimEntry[] = []
    const extraRemovedEntries: RemovedPrimEntry[] = []

    // Check if any entry could affect the active render pass.
    if (_EntryCouldAffectPass(entries, this._activeRenderPass.renderPassPath)) {
      this._updateActiveRenderPassState(extraAddedEntries, extraRemovedEntries)
    }

    // Mark that we have populated prims.
    this._hasPopulated = true

    // Filter entries against any active render pass prune collection.
    if (!_PruneEntries(this._activeRenderPass.eval, entries, extraAddedEntries)) {
      this._sendPrimsAdded(entries)
    }
    this._sendPrimsAdded(extraAddedEntries)
    this._sendPrimsRemoved(extraRemovedEntries)
  }

  /** renderPassPruneSceneIndex.cpp:276-297 */
  protected _primsRemoved(_sender: HdSceneIndexBase, entries: RemovedPrimEntry[]): void {
    const extraAddedEntries: AddedPrimEntry[] = []
    const extraRemovedEntries: RemovedPrimEntry[] = []

    // Check if any entry could affect the active render pass.
    if (_EntryCouldAffectPass(entries, this._activeRenderPass.renderPassPath)) {
      this._updateActiveRenderPassState(extraAddedEntries, extraRemovedEntries)
    }

    // Filter entries against any active render pass prune collection.
    if (!_PruneEntries(this._activeRenderPass.eval, entries, extraRemovedEntries)) {
      this._sendPrimsRemoved(entries)
    }
    this._sendPrimsAdded(extraAddedEntries)
    this._sendPrimsRemoved(extraRemovedEntries)
  }

  /** renderPassPruneSceneIndex.cpp:299-355 */
  protected _primsDirtied(_sender: HdSceneIndexBase, entries: DirtiedPrimEntry[]): void {
    const extraAddedEntries: AddedPrimEntry[] = []
    const extraDirtyEntries: DirtiedPrimEntry[] = []
    const extraRemovedEntries: RemovedPrimEntry[] = []

    // Check if any entry could affect the active render pass.
    if (_EntryCouldAffectPass(entries, this._activeRenderPass.renderPassPath)) {
      this._updateActiveRenderPassState(extraAddedEntries, extraRemovedEntries)
    }

    // Filter incoming entries against any active render pass prune collection.
    if (!_PruneEntries(this._activeRenderPass.eval, entries, extraDirtyEntries)) {
      this._sendPrimsDirtied(entries)
    }

    // Dirty the instance mask only on instancers whose instance locations
    // were affected by the prune change (newly pruned or un-pruned paths).
    if (this._instanceToInstancerMap.size > 0
        && (extraRemovedEntries.length > 0 || extraAddedEntries.length > 0)) {
      const instancerMaskLocatorSet = _instancerMaskLocatorSet ??=
        HdContainerDataSourceEditor.computeDirtyLocators(
          new HdDataSourceLocatorSet(
            HdInstancerTopologySchema.getDefaultLocator()
              .append(HdInstancerTopologySchemaTokens.mask)))

      const affectedInstancers = new Set<string>()
      const addSubtree = (root: string) => {
        const rootPath = SdfPath.fromString(root)
        for (const [path, instancers] of this._instanceToInstancerMap) {
          if (!SdfPath.fromString(path).hasPrefix(rootPath)) continue
          for (const instancer of instancers) affectedInstancers.add(instancer)
        }
      }
      for (const entry of extraRemovedEntries) addSubtree(entry.primPath)
      for (const entry of extraAddedEntries) addSubtree(entry.primPath)
      // SdfPathSet order.
      const sorted = [...affectedInstancers].sort((a, b) =>
        SdfPath.compare(SdfPath.fromString(a), SdfPath.fromString(b)))
      for (const instancerPath of sorted) {
        extraDirtyEntries.push({ primPath: instancerPath, dirtyLocators: instancerMaskLocatorSet })
      }
    }

    this._sendPrimsAdded(extraAddedEntries)
    this._sendPrimsRemoved(extraRemovedEntries)
    this._sendPrimsDirtied(extraDirtyEntries)
  }

  /** Pull on the scene globals schema for the active render pass, computing
   *  and caching its prune state in _activeRenderPass
   *  (renderPassPruneSceneIndex.cpp:359-428). */
  private _updateActiveRenderPassState(
    addedEntries: AddedPrimEntry[],
    removedEntries: RemovedPrimEntry[],
  ): void {
    // Swap out the prior pass state to compare against.
    const priorState = this._activeRenderPass
    const state = new _RenderPassPruneState()
    this._activeRenderPass = state

    // Check upstream scene index for an active render pass.
    const inputSceneIndex = this._getInputSceneIndex()
    const globals = HdSceneGlobalsSchema.getFromSceneIndex(inputSceneIndex)
    const pathDs = globals.getActiveRenderPassPrim()
    if (pathDs) {
      state.renderPassPath = pathDs.getTypedValue(0.0)
    }
    if (state.renderPassPath === '' && priorState.renderPassPath === '') {
      // Avoid further work if no render pass was or is active.
      return
    }
    if (state.renderPassPath !== '') {
      const passPrim = inputSceneIndex.getPrim(state.renderPassPath)
      const collections = HdCollectionsSchema.getFromParent(passPrim.dataSource)
      if (collections.isDefined()) {
        HdsiUtilsCompileCollection(collections, _tokens.prune,
          inputSceneIndex, state, this._predicateLibrary)
      }
    }
    if (state.expr.getText() === priorState.expr.getText()) {
      // Pattern unchanged; nothing to invalidate.
      return
    }

    // Generate change entries for affected prims.
    // Consider all upstream prims.
    //
    // TODO: HdCollectionExpressionEvaluator::PopulateAllMatches()
    // should be used here instead, since in the future it will handle
    // instance matches as well as parallel traversal.
    //
    // We can skip this part if this is the initial round of population.
    if (!this._hasPopulated) {
      return
    }
    for (const path of new HdSceneIndexPrimView(this._getInputSceneIndex())) {
      if (priorState.doesPrune(path)) {
        // The prim had been pruned.
        if (!state.doesPrune(path)) {
          // The prim is no longer pruned, so add it back.
          const prim = this._getInputSceneIndex().getPrim(path)
          addedEntries.push({ primPath: path, primType: prim.primType })
        } else {
          // The prim is still pruned, so nothing to do.
        }
      } else if (state.doesPrune(path)) {
        // The prim is newly pruned, so remove it.
        removedEntries.push({ primPath: path })
      }
    }
  }
}

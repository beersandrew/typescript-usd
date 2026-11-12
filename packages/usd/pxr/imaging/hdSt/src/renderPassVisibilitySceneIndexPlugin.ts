// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdSt/renderPassVisibilitySceneIndexPlugin.cpp,
//  pxr/imaging/hdSt/renderPassVisibilitySceneIndexPlugin.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1
// pxr/imaging/hdSt/renderPassVisibilitySceneIndexPlugin.{h,cpp}.
//
// The scene index the plugin appends overrides the visibility of renderable
// prims that the active render pass's renderVisibility collection excludes,
// and masks out the excluded instances of implicitly instanced instancers.
//
// The two TF_REGISTRY_FUNCTION blocks run at the end of this module: the
// TfType one defines the plugin type, the HdSceneIndexPlugin one is a
// TfRegistryManager function HdSceneIndexPluginRegistry runs
// (sceneIndexPluginRegistry.ts).
//
// Paths are the string paths this port's Hydra uses. The weak pointer the
// data source holds to its scene index is a plain reference. The
// SdfPathExpression comparison of _UpdateActiveRenderPassState
// (operator==) compares the expressions' text. TRACE_FUNCTION scopes are not
// ported.

import { TfRegistryManager } from 'typescript-usd/tf'
import { SdfPath } from 'typescript-usd/sdf/path'
import { SdfPathExpression } from 'typescript-usd/sdf/pathExpression'
import {
  CollectionsSchema as HdCollectionsSchema,
  ContainerDataSource as HdContainerDataSource,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  InsertionOrder as HdSceneIndexPluginRegistryInsertionOrder,
  InstancedBySchema as HdInstancedBySchema,
  InstancerTopologySchema as HdInstancerTopologySchema,
  OverlayContainerDataSource as HdOverlayContainerDataSource,
  PrimTypeIsGprim as HdPrimTypeIsGprim,
  PrimTypeIsLight as HdPrimTypeIsLight,
  PrimTypeTokens as HdPrimTypeTokens,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  SceneGlobalsSchema as HdSceneGlobalsSchema,
  SceneIndexPlugin as HdSceneIndexPlugin,
  SceneIndexPluginRegistry as HdSceneIndexPluginRegistry,
  SceneIndexPrimView as HdSceneIndexPrimView,
  SingleInputFilteringSceneIndexBase as HdSingleInputFilteringSceneIndexBase,
  VisibilitySchema as HdVisibilitySchema,
} from 'typescript-usd/hd'
import type {
  AddedPrimEntry,
  CollectionExpressionEvaluator as HdCollectionExpressionEvaluator,
  DataSourceBase as HdDataSourceBase,
  DirtiedPrimEntry,
  RemovedPrimEntry,
  SceneIndexBase as HdSceneIndexBase,
  SceneIndexPrim as HdSceneIndexPrim,
} from 'typescript-usd/hd'
import {
  UtilsCompileCollection as HdsiUtilsCompileCollection,
  type UtilsCompiledCollection as HdsiUtilsCompiledCollection,
} from 'typescript-usd/hdsi'

// renderPassVisibilitySceneIndexPlugin.cpp:37-41
const _tokens = {
  renderVisibility: 'renderVisibility',
  sceneIndexPluginName: 'HdSt_RenderPassVisibilitySceneIndexPlugin',
} as const

// renderPassVisibilitySceneIndexPlugin.cpp:43
const _pluginDisplayName = 'GL'

/** renderPassVisibilitySceneIndexPlugin.cpp:71-82 */
function _IsGeometryType(primType: string): boolean {
  const extraGeomTypes: string[] = [
    HdPrimTypeTokens.cone,
    HdPrimTypeTokens.cylinder,
    HdPrimTypeTokens.sphere,
  ]
  return HdPrimTypeIsGprim(primType) || extraGeomTypes.includes(primType)
}

/** The elements of an array-valued data source value (VtArray). */
function _Elements<T>(value: Iterable<T> | ArrayLike<T> | undefined): T[] {
  return value === undefined ? [] : Array.from(value as ArrayLike<T>)
}

/** Returns true if the visibility rules apply to this prim
 *  (renderPassVisibilitySceneIndexPlugin.cpp:84-113). */
function _ShouldApplyPassVisibility(prim: HdSceneIndexPrim): boolean {
  // Apply pass visibility to point instancers, which are explicitly created
  // in the scene by users, but not to other instancers created internally,
  // e.g. by UsdImaging native instance aggregation.  The latter case is
  // already handled elsewhere by evaluating the collection against each
  // instanceLocation.  The general intuition is that user-defined
  // collections are only ever applied against user-defined paths.
  if (prim.primType === HdPrimTypeTokens.instancer) {
    const topoSchema = HdInstancerTopologySchema.getFromParent(prim.dataSource)
    if (!topoSchema.isDefined()) {
      return false
    }
    // If there are no instanceLocations, this is an explicit
    // point instancer, and we apply visibility rules to the
    // instancer as a whole.
    const instanceLocationsDs = topoSchema.getInstanceLocations()
    if (!instanceLocationsDs) {
      return true
    }
    const instanceLocations = _Elements<string>(instanceLocationsDs.getTypedValue(0.0))
    return instanceLocations.length === 0
  }
  return _IsGeometryType(prim.primType) || HdPrimTypeIsLight(prim.primType)
}

/** renderPassVisibilitySceneIndexPlugin.cpp:115-124 */
function _IsVisible(primSource: HdContainerDataSource | undefined): boolean {
  const visSchema = HdVisibilitySchema.getFromParent(primSource)
  if (visSchema.isDefined()) {
    const visDs = visSchema.getVisibility()
    if (visDs) {
      return visDs.getTypedValue(0.0)
    }
  }
  return true
}

//////////////////////////////////
// Render Pass Visibility State //
//////////////////////////////////

/** renderPassVisibilitySceneIndexPlugin.cpp:129-141 */
function _GetInstancerMask(primSource: HdContainerDataSource | undefined): boolean[] {
  const topoSchema = HdInstancerTopologySchema.getFromParent(primSource)
  if (!topoSchema.isDefined()) {
    return []
  }
  const maskDs = topoSchema.GetMask()
  if (maskDs) {
    return _Elements<boolean>(maskDs.getTypedValue(0.0))
  }
  return []
}

/** VtArray<bool>::operator== */
function _BoolArraysEqual(a: readonly boolean[], b: readonly boolean[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i])
}

/** renderPassVisibilitySceneIndexPlugin.cpp:144-206 */
class _RenderPassVisibilityState implements HdsiUtilsCompiledCollection {
  renderPassPath = ''

  // Retain the expression so we can compare old vs. new state.
  expr = new SdfPathExpression()

  // Evalulator for the pattern expression.
  eval: HdCollectionExpressionEvaluator | undefined = undefined

  doesOverrideVis(primPath: string, prim: HdSceneIndexPrim): boolean {
    return this.eval !== undefined
      && _ShouldApplyPassVisibility(prim)
      && !this.eval.match(SdfPath.fromString(primPath)).GetValue()
      && _IsVisible(prim.dataSource)
  }

  // Returns per-instance render visibility mask values for instancer prims
  // that use implicit instancing (i.e., have instanceLocations set). Entry i
  // is true if instanceLocations[i] matches the renderVisibility collection,
  // false otherwise (instance is masked out). Returns an empty array if not
  // applicable or if all instances match (no override needed).
  getRenderVisPerInstance(prim: HdSceneIndexPrim): boolean[] {
    if (this.eval === undefined || prim.primType !== HdPrimTypeTokens.instancer) {
      return []
    }
    const topoSchema = HdInstancerTopologySchema.getFromParent(prim.dataSource)
    if (!topoSchema.isDefined()) {
      return []
    }
    const instanceLocationsDs = topoSchema.getInstanceLocations()
    if (!instanceLocationsDs) {
      return []
    }
    const instanceLocations = _Elements<string>(instanceLocationsDs.getTypedValue(0.0))
    if (instanceLocations.length === 0) {
      return []
    }
    const existingMask = _GetInstancerMask(prim.dataSource)
    const mask =
      (existingMask.length !== 0 &&
       existingMask.length === instanceLocations.length)
        ? [...existingMask]
        : new Array<boolean>(instanceLocations.length).fill(true)
    let modified = false
    for (let i = 0; i < instanceLocations.length; ++i) {
      if (!this.eval.match(SdfPath.fromString(instanceLocations[i]!)).GetValue() && mask[i]) {
        mask[i] = false
        modified = true
      }
    }
    return modified ? mask : existingMask
  }
}

////////////////////////////////////////
// Render Pass Visibility Data Source //
////////////////////////////////////////

/** renderPassVisibilitySceneIndexPlugin.cpp:264-345 */
class _RenderPassVisibilityDataSource extends HdContainerDataSource {
  static new(
    sceneIndex: _RenderPassVisibilitySceneIndex,
    primPath: string,
    prim: HdSceneIndexPrim,
  ): _RenderPassVisibilityDataSource {
    return new _RenderPassVisibilityDataSource(sceneIndex, primPath, prim)
  }

  private constructor(
    // This dataSource accesses scene state tracked by the scene index.
    private readonly _sceneIndex: _RenderPassVisibilitySceneIndex,
    private readonly _primPath: string,
    private readonly _prim: HdSceneIndexPrim,
  ) {
    super()
  }

  getNames(): string[] {
    return this._prim.dataSource?.getNames() ?? []
  }

  /** renderPassVisibilitySceneIndexPlugin.cpp:292-341 */
  Get(name: string): HdDataSourceBase | undefined {
    if (!this._prim.dataSource) {
      return undefined
    }

    // State from the scene index.
    const renderPass = this._sceneIndex._activeRenderPass

    // Render Visibility -> HdVisibilitySchema
    //
    // Renderable prims that are visible in the upstream scene index,
    // but excluded from the pass renderVisibility collection, get their
    // visibility overriden to 0.
    //
    if (name === HdVisibilitySchema.getSchemaToken()) {
      if (renderPass.doesOverrideVis(this._primPath, this._prim)) {
        return new HdVisibilitySchema.Builder()
          .setVisibility(HdRetainedTypedSampledDataSource.new<boolean>(false))
          .build()
      }
    }

    // Instancer Render Visibility -> instancerTopology.mask
    //
    // For instancer prims using implicit instancing (instanceLocations
    // present), evaluate the renderVisibility pattern against each instance
    // location and set the instancer mask to false for non-matching instances.
    //
    if (name === HdInstancerTopologySchema.getSchemaToken()) {
      const renderVisPerInstance = renderPass.getRenderVisPerInstance(this._prim)
      if (renderVisPerInstance.length !== 0) {
        const existing = this._prim.dataSource.Get(name)
        const existingTopoDs = existing instanceof HdContainerDataSource ? existing : undefined
        return HdOverlayContainerDataSource.new(
          new HdInstancerTopologySchema.Builder()
            .setMask(
              HdRetainedTypedSampledDataSource.new<boolean[]>(renderVisPerInstance))
            .build(),
          existingTopoDs)
      }
    }

    return this._prim.dataSource.Get(name)
  }
}

////////////////////////////////////////////////
// Render Pass Visibility Scene Index (cont.) //
////////////////////////////////////////////////

/** renderPassVisibilitySceneIndexPlugin.cpp:347-368 */
function _IsPrototype(prim: HdSceneIndexPrim): boolean {
  const instancedBySchema = HdInstancedBySchema.getFromParent(prim.dataSource)
  if (instancedBySchema.isDefined()) {
    // XXX The docs for the InstancedBy schema say it is
    // "A schema marking a prim as instanced by another prim"
    //
    // However, experimentally we observe prims from Presto Mf
    // have this schema regardless of being instanced.  So we
    // must pull apart the schema to check for instance paths.
    //
    // It seems like it would be better to only emit the
    // instancedBy schema for prims that are instanced.
    const pathsDs = instancedBySchema.getPaths()
    if (pathsDs) {
      return _Elements<string>(pathsDs.getTypedValue(0.0)).length !== 0
    }
  }
  return false
}

// Helper to scan an entry vector for an entry that
// could affect the active render pass
// (renderPassVisibilitySceneIndexPlugin.cpp:425-442).
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

/** renderPassVisibilitySceneIndexPlugin.cpp:212-258 */
class _RenderPassVisibilitySceneIndex extends HdSingleInputFilteringSceneIndexBase {
  // Visibility state for the active render pass.
  _activeRenderPass = new _RenderPassVisibilityState()

  // Flag used to track the first time prims have been added.
  private _hasPopulated = false

  static new(inputSceneIndex: HdSceneIndexBase): _RenderPassVisibilitySceneIndex {
    return new _RenderPassVisibilitySceneIndex(inputSceneIndex)
  }

  protected constructor(inputSceneIndex: HdSceneIndexBase) {
    super(inputSceneIndex)
  }

  /** renderPassVisibilitySceneIndexPlugin.cpp:370-396 */
  getPrim(primPath: string): HdSceneIndexPrim {
    const prim = this._getInputSceneIndex().getPrim(primPath)

    // If no render pass is active, do nothing.
    if (this._activeRenderPass.renderPassPath === '') {
      return prim
    }

    // Do not modify prototype prims (those with instancedBy schema).
    // Prototypes are an internal detail of the system, not something
    // meant to be user-facing, so there must be no way to point
    // user-defined operations (such as render pass collections)
    // at prototypes.
    if (prim.dataSource && !_IsPrototype(prim)) {
      // Overrides happen in the prim-level data source.
      return {
        primType: prim.primType,
        dataSource: _RenderPassVisibilityDataSource.new(this, primPath, prim),
      }
    }

    return prim
  }

  /** renderPassVisibilitySceneIndexPlugin.cpp:398-403 */
  getChildPrimPaths(primPath: string): string[] {
    return this._getInputSceneIndex().getChildPrimPaths(primPath)
  }

  /** renderPassVisibilitySceneIndexPlugin.cpp:444-467 */
  protected _primsAdded(_sender: HdSceneIndexBase, entries: AddedPrimEntry[]): void {
    const extraDirtyEntries: DirtiedPrimEntry[] = []

    // Check if any entry could affect the active render pass.
    if (_EntryCouldAffectPass(entries, this._activeRenderPass.renderPassPath)) {
      this._updateActiveRenderPassState(extraDirtyEntries)
    }

    // Fast path: If this is the first time we are adding prims,
    // we do not need to check for invalidation of existing prims
    // inside _UpdateActiveRenderPassState().  From now on, we will.
    if (!this._hasPopulated) {
      this._hasPopulated = true
    }

    this._sendPrimsAdded(entries)
    this._sendPrimsDirtied(extraDirtyEntries)
  }

  /** renderPassVisibilitySceneIndexPlugin.cpp:469-485 */
  protected _primsRemoved(_sender: HdSceneIndexBase, entries: RemovedPrimEntry[]): void {
    const extraDirtyEntries: DirtiedPrimEntry[] = []

    // Check if any entry could affect the active render pass.
    if (_EntryCouldAffectPass(entries, this._activeRenderPass.renderPassPath)) {
      this._updateActiveRenderPassState(extraDirtyEntries)
    }

    this._sendPrimsRemoved(entries)
    this._sendPrimsDirtied(extraDirtyEntries)
  }

  /** renderPassVisibilitySceneIndexPlugin.cpp:487-503 */
  protected _primsDirtied(_sender: HdSceneIndexBase, entries: DirtiedPrimEntry[]): void {
    const extraDirtyEntries: DirtiedPrimEntry[] = []

    // Check if any entry could affect the active render pass.
    if (_EntryCouldAffectPass(entries, this._activeRenderPass.renderPassPath)) {
      this._updateActiveRenderPassState(extraDirtyEntries)
    }

    this._sendPrimsDirtied(entries)
    this._sendPrimsDirtied(extraDirtyEntries)
  }

  /** Pull on the scene globals schema for the active render pass, computing
   *  and caching its visibility state in _activeRenderPass
   *  (renderPassVisibilitySceneIndexPlugin.cpp:505-572). */
  private _updateActiveRenderPassState(dirtyEntries: DirtiedPrimEntry[]): void {
    // Swap out the prior pass state to compare against.
    const priorState = this._activeRenderPass
    const state = new _RenderPassVisibilityState()
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
        // Prepare evaluators for render pass collections.
        HdsiUtilsCompileCollection(collections, _tokens.renderVisibility,
          inputSceneIndex, state)
      }
    }

    if (state.expr.getText() === priorState.expr.getText() || !this._hasPopulated) {
      // Pattern unchanged or no prims have been populated previously;
      // nothing to invalidate.
      return
    }

    // Generate change entries for affected prims.
    // Consider all upstream prims.
    //
    // TODO: HdCollectionExpressionEvaluator::PopulateAllMatches()
    // should be used here instead, since in the future it will handle
    // instance matches as well as parallel traversal.
    //
    for (const path of new HdSceneIndexPrimView(this._getInputSceneIndex())) {
      const prim = this._getInputSceneIndex().getPrim(path)
      const locators = new HdDataSourceLocatorSet()
      const visibilityDidChange =
        (priorState.doesOverrideVis(path, prim)
         !== state.doesOverrideVis(path, prim))
      const instancerTopologyDidChange = !_BoolArraysEqual(
        priorState.getRenderVisPerInstance(prim),
        state.getRenderVisPerInstance(prim))
      if (visibilityDidChange) {
        locators.insert(HdVisibilitySchema.getDefaultLocator())
      }
      if (instancerTopologyDidChange) {
        locators.insert(HdInstancerTopologySchema.getDefaultLocator())
      }
      if (!locators.IsEmpty()) {
        dirtyEntries.push({ primPath: path, dirtyLocators: locators })
      }
    }
  }
}

///////////////////////////////////////////////
// Render Pass Visibility Scene Index Plugin //
///////////////////////////////////////////////

/** renderPassVisibilitySceneIndexPlugin.h */
export class HdSt_RenderPassVisibilitySceneIndexPlugin extends HdSceneIndexPlugin {
  /** renderPassVisibilitySceneIndexPlugin.cpp:583-589 */
  protected override _appendSceneIndex(
    inputScene: HdSceneIndexBase,
    _inputArgs: HdContainerDataSource | undefined,
  ): HdSceneIndexBase {
    return _RenderPassVisibilitySceneIndex.new(inputScene)
  }
}

// renderPassVisibilitySceneIndexPlugin.cpp:45-49: TF_REGISTRY_FUNCTION(TfType).
HdSceneIndexPluginRegistry.define(
  _tokens.sceneIndexPluginName, HdSt_RenderPassVisibilitySceneIndexPlugin)

// renderPassVisibilitySceneIndexPlugin.cpp:51-67: TF_REGISTRY_FUNCTION(HdSceneIndexPlugin).
TfRegistryManager.add(HdSceneIndexPlugin, () => {
  // We want this plugin...
  // - Downstream of procedural expansion
  //   (HdGpSceneIndexPlugin::GetInsertionPhase(), currently 2) so that any
  //   render pass visibility rules apply to generated prims.
  // - Upstream of scene indices that may override visibility, but we don't
  //   have a good way to query/know this.
  const insertionPhase = 4

  HdSceneIndexPluginRegistry.GetInstance().registerSceneIndexForRenderer(
    _pluginDisplayName,
    _tokens.sceneIndexPluginName,
    null, // No input args.
    insertionPhase,
    HdSceneIndexPluginRegistryInsertionOrder.InsertionOrderAtStart)
})

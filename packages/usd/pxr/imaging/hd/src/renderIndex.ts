// Ported from OpenUSD 26.11.1: pxr/imaging/hd/renderIndex.cpp,
//  pxr/imaging/hd/renderIndex.h, pxr/imaging/hd/dirtyBitsTranslator.cpp
// Copyright 2016, 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/renderIndex.{h,cpp} (OpenUSD 26.11.1).
//
// Scene index emulation (renderIndex.cpp:148-252), as HdRenderIndex::New
// builds it: prims inserted through an HdSceneDelegate (InsertRprim/
// InsertSprim/InsertBprim/InsertInstancer with a delegate) go into an
// HdLegacyPrimSceneIndex, then a notice batching scene index, an
// HdLegacyGeomSubsetSceneIndex and an HdMergingSceneIndex (InsertSceneIndex
// adds further inputs), the renderer's scene index plugins, and the terminal
// scene index, which an HdSceneIndexAdapterSceneDelegate observes; it
// inserts the Hd prims (_InsertRprim etc.) with itself as their scene
// delegate, and SyncAll syncs them through the change tracker
// (renderIndex.cpp:1691-1990).
//
// Divergences:
// - The scene-index observer path (SetSceneIndex and the two-argument
//   Insert*prim forms, PrimsAdded/Removed/Dirtied below) has no upstream
//   counterpart: it served the deleted hand-written renderer, whose prims
//   synced from scene index prims directly; only tests use it now. Its
//   dirtied locators go through HdDirtyBitsTranslator
//   (dirtyBitsTranslator.cpp:585-901).
// - Serial sync. SyncAll(tasks, taskContext) syncs bprims, sprims, the
//   tasks and then rprims as renderIndex.cpp:1691-1990 does; the
//   SyncAll(reprToken) form and SyncTasks(tasks, taskContext) (tasks only)
//   remain for callers that drive sync without an HdEngine.
// - InsertTask<T>(delegate, id) is InsertTask(delegate, id, TaskClass)
//   (renderIndex.h:313-323, through a legacy task factory and emulation).
//   InsertTask(task, delegate) additionally inserts an existing task object
//   directly (_InsertTask); its dirty bits are tracked by the change tracker
//   like any task's.
// - HdPrefixingSceneIndex is not ported: InsertSceneIndex with a non-root
//   prefix and needsPrefixing reports a coding error.
// - The terminal caching scene index (HD_ENABLE_TERMINAL_CACHING_SCENE_INDEX,
//   renderIndex.cpp:233-235) is not ported (its env setting defaults off).

import type { HdRenderDelegate } from './renderDelegate.ts'
import type { HdRprim } from './rprim.ts'
import type { HdDirtyBits } from './changeTracker.ts'
import type { HdSprim } from './sprim.ts'
import type { HdBprim } from './bprim.ts'
import {
  type HdSceneIndexBase,
  type HdSceneIndexObserver,
  type AddedPrimEntry,
  type RemovedPrimEntry,
  type DirtiedPrimEntry,
  type RenamedPrimEntry,
} from './sceneIndex.ts'
import { HdChangeTracker, HdRprimChangeTracker } from './changeTracker.ts'
import { HdDirtyBitsTranslator } from './dirtyBitsTranslator.ts'
import { HdLegacyPrimSceneIndex } from './legacyPrimSceneIndex.ts'
import { HdLegacyGeomSubsetSceneIndex } from './legacyGeomSubsetSceneIndex.ts'
import { HdNoticeBatchingSceneIndex } from './noticeBatchingSceneIndex.ts'
import { HdMergingSceneIndex } from './mergingSceneIndex.ts'
import { HdSceneIndexPluginRegistry } from './sceneIndexPluginRegistry.ts'
import { HdSceneIndexAdapterSceneDelegate } from './sceneIndexAdapterSceneDelegate.ts'
import { HdSceneIndexEmulationTokens } from './dataSourceLegacyPrim.ts'
import { HdTypedSampledDataSource } from './dataSource.ts'
import type { HdInstancer } from './instancer.ts'
import { HdDataSourceLocator, HdDataSourceLocatorSet } from './dataSourceLocator.ts'
import { HdPrimTypeTokens, HdRenderTagTokens, HdTokens } from './tokens.ts'
import type { HdDrawItem } from './drawItem.ts'
import type { HdRprimCollection } from './rprimCollection.ts'
import type { HdRenderParam } from './renderDelegate.ts'
import { Collector } from 'typescript-usd/trace'
import type { HdTask, HdTaskContext } from './task.ts'
import { HdMakeLegacyTaskFactory, type HdLegacyTaskConstructor, type HdLegacyTaskFactory } from './legacyTaskFactory.ts'
import type { HdSceneDelegate } from './sceneDelegate.ts'
import { HdReprSelector } from './displayStyle.ts'
import { Hd_DirtyList } from './dirtyList.ts'
import { TF_CODING_ERROR, TF_VERIFY } from './tfDiagnostic.ts'
import { HdSceneGlobalsSchema } from './sceneGlobalsSchema.ts'

/** renderIndex.cpp:75-85: whether the scene index publishes prim ids,
 *  checked by using the HdSceneGlobalsSchema. */
function _SceneIndexHasPrimIds(sceneIndex: HdSceneIndexBase | undefined): boolean {
  return !!sceneIndex &&
    HdSceneGlobalsSchema.getFromSceneIndex(sceneIndex).getPrimIdToPath().isDefined()
}

// sceneDelegate is set for prims inserted through an HdSceneDelegate
// (renderIndex.h _RprimInfo / Hd_PrimTypeIndex::_PrimInfo).
interface RprimEntry { rprim: HdRprim; primType: string; dirtyBits: HdDirtyBits; sceneDelegate?: HdSceneDelegate }
interface SprimEntry { sprim: HdSprim; primType: string; dirtyBits: HdDirtyBits; sceneDelegate?: HdSceneDelegate }
interface BprimEntry { bprim: HdBprim; primType: string; dirtyBits: HdDirtyBits; sceneDelegate?: HdSceneDelegate }

// renderIndex.cpp:1317-1331 _CollectionReprSpec.
interface _CollectionReprSpec { reprSelector: HdReprSelector; useCollectionRepr: boolean }

// renderIndex.cpp:1380-1392
function _GetResolvedReprSelector(rprimReprSelector: HdReprSelector,
  colReprSelector: HdReprSelector, forceColRepr: boolean): HdReprSelector {
  // if not forced, the prim's authored opinion composites over the
  // collection's repr, otherwise we respect the collection's repr (used for
  // shadows)
  if (!forceColRepr) {
    return rprimReprSelector.compositeOver(colReprSelector)
  }
  return colReprSelector
}

/** renderIndex.cpp:58-62 (_noticeBatchingTokens) */
const _noticeBatchingTokens = {
  postEmulation: 'Post-Emulation Notice Batching Scene Index',
  postMerging: 'Post-Merging Notice Batching Scene Index',
} as const

/** renderIndex.cpp:86-144: a notice batching scene index with support for
 *  nested BeginBatching/EndBatching calls. */
class _NoticeBatchingContext {
  private _nbSi: HdNoticeBatchingSceneIndex | undefined
  private _batchingDepth = 0
  constructor(private readonly _displayName: string) {}

  append(inputSi: HdSceneIndexBase): HdSceneIndexBase {
    this._nbSi = HdNoticeBatchingSceneIndex.new(inputSi)
    this._nbSi.setDisplayName(this._displayName)
    return this._nbSi
  }

  beginBatching(): void {
    if (this._nbSi) {
      if (this._batchingDepth === 0) this._nbSi.setBatchingEnabled(true)
      ++this._batchingDepth
    }
  }

  endBatching(): void {
    if (this._nbSi) {
      if (this._batchingDepth > 0) {
        --this._batchingDepth
        if (this._batchingDepth === 0) this._nbSi.setBatchingEnabled(false)
      } else {
        TF_CODING_ERROR(`Imbalanced batch begin/end calls for ${this._displayName}.\n`)
      }
    }
  }
}

/** renderIndex.cpp:2236-2257 (_GetSceneDelegateFromSceneIndex) */
function _GetSceneDelegateFromSceneIndex(sceneIndex: HdSceneIndexBase | undefined,
  id: string): HdSceneDelegate | null {
  if (!sceneIndex) return null
  const prim = sceneIndex.getPrim(id)
  if (!prim.dataSource) return null
  const ds = prim.dataSource.Get(HdSceneIndexEmulationTokens.sceneDelegate)
  if (!(ds instanceof HdTypedSampledDataSource)) return null
  return (ds.getTypedValue(0) as HdSceneDelegate | null) ?? null
}

// SdfPath::HasPrefix for absolute prim paths.
function _HasPrefix(path: string, prefix: string): boolean {
  return prefix === '/' || path === prefix || path.startsWith(`${prefix}/`)
}

/** SdfPath::HasPrefix for path strings: the absolute root path '/' is a
 *  prefix of every absolute path. */
function _HasPathPrefix(id: string, prefix: string): boolean {
  return prefix === '/' ? id.startsWith('/') : id === prefix || id.startsWith(`${prefix}/`)
}

/** Hd_SortedIds order (sortedIds.cpp, SdfPath's operator<): element names
 *  compared from the root, an ancestor before its descendants. The subtree
 *  queries return ids in this order upstream (primTypeIndex.cpp:286-303,
 *  HdPrimGather over sorted ids); callers rely on it, e.g.
 *  HdxSimpleLightTask keeps the first maxLights lights of that order. Same
 *  order as primGather.ts comparePaths, on path strings. */
function _SortedPaths(ids: string[]): string[] {
  const keyed = ids.map(id => ({ id, names: id.split('/').filter(n => n !== '') }))
  keyed.sort((a, b) => {
    const m = Math.min(a.names.length, b.names.length)
    for (let i = 0; i < m; i++) {
      if (a.names[i]! < b.names[i]!) return -1
      if (a.names[i]! > b.names[i]!) return 1
    }
    return a.names.length - b.names.length
  })
  return keyed.map(k => k.id)
}

export class HdRenderIndex implements HdSceneIndexObserver {
  private _delegate: HdRenderDelegate
  private _sceneIndex: HdSceneIndexBase | undefined

  private _rprims = new Map<string, RprimEntry>()
  private _sprims = new Map<string, SprimEntry>()
  private _bprims = new Map<string, BprimEntry>()
  private _geomSubsetPaths = new Set<string>()
  private _tracker = new HdRprimChangeTracker()
  // renderIndex.h _TaskMap (_TaskInfo: sceneDelegate, task). `emulated`
  // marks tasks inserted through the emulation scene index.
  private _tasks = new Map<string, {
    task: HdTask
    delegate: unknown
    emulated: boolean
  }>()
  // OpenUSD v26.11.1 hd/renderIndex.h:197 and renderIndex.cpp:1669-1672,
  // 1790: render passes enqueue their collections; SyncAll syncs the reprs
  // those collections select.
  private _collectionsToSync: HdRprimCollection[] = []
  private _lastSyncedReprs: string[] = ['smoothHull']
  // Legacy scene-delegate state (renderIndex.h _instancerMap, the task
  // render tags gathered for SyncAll, and the rprim dirty list).
  private _legacyInstancers = new Map<string, HdSceneDelegate>()
  private _legacyTaskRenderTags: string[] = []
  private _legacyRprimDirtyList: Hd_DirtyList | undefined
  // renderIndex.h:566-620: the emulation and merging scene indices.
  private readonly _emulationBatchingCtx = new _NoticeBatchingContext(_noticeBatchingTokens.postEmulation)
  private readonly _mergingBatchingCtx = new _NoticeBatchingContext(_noticeBatchingTokens.postMerging)
  private _emulationSceneIndex: HdLegacyPrimSceneIndex | undefined
  private _finalEmulationSceneIndex: HdSceneIndexBase | undefined
  private _mergingSceneIndex: HdMergingSceneIndex | undefined
  private _terminalSceneIndex: HdSceneIndexBase | undefined
  private _siSd: HdSceneIndexAdapterSceneDelegate | undefined
  private _instancerMap = new Map<string, HdInstancer>()
  // renderIndex.cpp:159-164: prim ids are assigned by this render index
  // unless the terminal scene index it is created with publishes them
  // (HdSceneGlobalsSchema primIdToPath); set in the constructor.
  private _rprimPrimIdMap: string[] | null
  private readonly _instanceName: string
  // renderIndex.h (_drivers)
  private readonly _drivers: unknown[]
  private _syncAllDepth = 0

  /** renderIndex.cpp:148-252 */
  private constructor(delegate: HdRenderDelegate, drivers: readonly unknown[] = [],
    instanceName = '', appName = '', terminalSceneIndex?: HdSceneIndexBase,
    createFrontendEmulationOnly = false) {
    this._delegate = delegate
    this._instanceName = instanceName
    this._rprimPrimIdMap = _SceneIndexHasPrimIds(terminalSceneIndex)
      // prim ids are read from scene index
      ? null
      // prim ids are assgined by this render index.
      : []
    // renderIndex.cpp:180-183: register the well-known geometry collection.
    this._tracker.addCollection(HdTokens.geometry)
    const bridge = delegate as HdRenderDelegate & { _setRenderIndex?: (index: HdRenderIndex) => void }
    bridge._setRenderIndex?.(this)

    // Let render delegate choose drivers its interested in
    // (renderIndex.cpp:185-186). Divergence: only when drivers are given,
    // because delegates in this port may already have been handed their
    // drivers (HdStRenderDelegate rejects a second SetDrivers).
    this._drivers = [...drivers]
    if (drivers.length > 0) {
      (delegate as HdRenderDelegate & { setDrivers?: (d: readonly unknown[]) => void }).setDrivers?.(drivers)
    }

    if (terminalSceneIndex) {
      this._terminalSceneIndex = terminalSceneIndex
      this._tracker._setDisableEmulationAPI(true)
    } else {
      this._emulationSceneIndex = HdLegacyPrimSceneIndex.new()
      this._tracker._setTargetSceneIndex(this._emulationSceneIndex)

      // The legacy prim scene index holds prims contributed from
      // upstream scene delegates.  Convert any legacy subsets
      // to HdGeomSubsetSchema.  Since legacy prims are typically
      // populated iteratively, use notice batching upstream from
      // scanning for geom subsets.
      this._finalEmulationSceneIndex = HdLegacyGeomSubsetSceneIndex.new(
        this._emulationBatchingCtx.append(this._emulationSceneIndex))

      if (createFrontendEmulationOnly) return

      this._mergingSceneIndex = HdMergingSceneIndex.new()
      this._mergingSceneIndex.addInputScene(this._finalEmulationSceneIndex, '/')

      let sceneIndex: HdSceneIndexBase = this._mergingSceneIndex
      sceneIndex = this._mergingBatchingCtx.append(sceneIndex)

      // Optional calls: render delegates in this port's tests may be plain
      // objects without the HdRenderDelegate base.
      const rendererDisplayName = delegate.getRendererDisplayName?.() ?? ''
      if (rendererDisplayName !== '') {
        sceneIndex = HdSceneIndexPluginRegistry.GetInstance()
          .appendSceneIndicesForRenderer(rendererDisplayName, sceneIndex, instanceName, appName)
      }

      this._terminalSceneIndex = sceneIndex
    }

    if (this._terminalSceneIndex) {
      this._siSd = new HdSceneIndexAdapterSceneDelegate(this._terminalSceneIndex, this, '/')
      delegate.setTerminalSceneIndex(this._terminalSceneIndex)
    }
  }

  /** renderIndex.cpp:269-289 */
  static new(delegate: HdRenderDelegate, drivers: readonly unknown[] = [],
    instanceName = '', appName = ''): HdRenderIndex {
    if (!delegate) {
      TF_CODING_ERROR('Null Render Delegate provided to create render index')
      return null as unknown as HdRenderIndex
    }
    // Call c'tor so that we construct the emulation scene index,
    // the merging scene index and all the filtering scene indices following
    // the merging scene index.
    return new HdRenderIndex(delegate, drivers, instanceName, appName)
  }

  /** renderIndex.cpp:291-312 */
  static newForBackendEmulation(delegate: HdRenderDelegate, drivers: readonly unknown[],
    terminalSceneIndex: HdSceneIndexBase): HdRenderIndex | null {
    if (!delegate) {
      TF_CODING_ERROR('Null Render Delegate provided to create render index')
      return null
    }
    if (!terminalSceneIndex) {
      TF_CODING_ERROR('No terminal scene index provided')
      return null
    }
    return new HdRenderIndex(delegate, drivers, '', '', terminalSceneIndex)
  }

  /** renderIndex.cpp:314-333 */
  static newForFrontendEmulation(nullRenderDelegate: HdRenderDelegate): HdRenderIndex | null {
    if (!nullRenderDelegate) {
      TF_CODING_ERROR('No Null Render Delegate provided to create render index')
      return null
    }
    return new HdRenderIndex(nullRenderDelegate, [], '', '', undefined, true)
  }

  /** renderIndex.cpp:335-357 */
  insertSceneIndex(inputScene: HdSceneIndexBase, scenePathPrefix: string,
    needsPrefixing = true): void {
    if (!this._mergingSceneIndex) {
      TF_CODING_ERROR('HdRenderIndex::InsertSceneIndex called but render index was '
        + 'constructed given a terminal scene index.')
      return
    }
    const resolvedScene = inputScene
    if (needsPrefixing && scenePathPrefix !== '/') {
      // HdPrefixingSceneIndex::New(inputScene, scenePathPrefix) upstream.
      TF_CODING_ERROR('HdRenderIndex::InsertSceneIndex: HdPrefixingSceneIndex is not ported')
      return
    }
    this._mergingSceneIndex.addInputScene(resolvedScene, scenePathPrefix)
  }

  /** renderIndex.cpp:372-413 (the prefixing case is not reachable, see
   *  InsertSceneIndex). */
  removeSceneIndex(inputScene: HdSceneIndexBase): void {
    if (!this._mergingSceneIndex) {
      TF_CODING_ERROR('HdRenderIndex::RemoveSceneIndex called but render index was '
        + 'constructed given a terminal scene index.')
      return
    }
    for (const resolvedScene of this._mergingSceneIndex.getInputScenes()) {
      if (inputScene === resolvedScene) {
        this._mergingSceneIndex.removeInputScene(resolvedScene)
        return
      }
    }
  }

  /** renderIndex.cpp:415-419 */
  getTerminalSceneIndex(): HdSceneIndexBase | undefined { return this._terminalSceneIndex }

  /** renderIndex.cpp:421-425 */
  getEmulationSceneIndex(): HdSceneIndexBase | undefined { return this._finalEmulationSceneIndex }

  /** renderIndex.cpp:944-967 */
  sceneIndexEmulationNoticeBatchBegin(): void { this._emulationBatchingCtx.beginBatching() }
  sceneIndexEmulationNoticeBatchEnd(): void { this._emulationBatchingCtx.endBatching() }
  mergingSceneIndexNoticeBatchBegin(): void { this._mergingBatchingCtx.beginBatching() }
  mergingSceneIndexNoticeBatchEnd(): void { this._mergingBatchingCtx.endBatching() }

  /** renderIndex.cpp:968-986 */
  getInstanceName(): string {
    if (this._instanceName !== '') {
      return this._instanceName
    }

    // Use the renderer plugin provided display name if available as the
    // instance name.
    const rendererDisplayName = this._delegate.getRendererDisplayName?.() ?? ''
    if (rendererDisplayName !== '') {
      return `Renderer: ${rendererDisplayName}`
    }

    // Fallback to the demangled type name.
    // The constructor name: see PLATFORM-DIVERGENCE(hd-scene-index-type-name)
    // in sceneIndex.ts.
    return `Renderer: ${this._delegate.constructor.name}`
  }

  /** renderIndex.cpp:1685-1689 */
  isSyncAllInProgress(): boolean { return this._syncAllDepth > 0 }

  /** renderIndex.h:313-325 (IsRprimTypeSupported etc., primTypeIndex) */
  isRprimTypeSupported(typeId: string): boolean { return this._delegate.getSupportedRprimTypes().includes(typeId) }
  isSprimTypeSupported(typeId: string): boolean { return this._delegate.getSupportedSprimTypes().includes(typeId) }
  isBprimTypeSupported(typeId: string): boolean { return this._delegate.getSupportedBprimTypes().includes(typeId) }

  /** renderIndex.cpp:426-439 */
  removeSubtree(root: string, sceneDelegate: HdSceneDelegate): void {
    if (this._emulationSceneIndex) {
      this._emulationSceneIndex.removePrims([{ primPath: root }])
    } else {
      this._removeTaskSubtree(root, sceneDelegate)
      this._RemoveSubtree(root, sceneDelegate)
    }
  }

  /** renderIndex.cpp:441-454 */
  _RemoveSubtree(root: string, sceneDelegate: HdSceneDelegate | null): void {
    for (const [id, entry] of [...this._rprims]) {
      if (entry.sceneDelegate && _HasPrefix(id, root)
        && (sceneDelegate === null || entry.sceneDelegate === sceneDelegate)) this._RemoveRprim(id)
    }
    for (const [id, entry] of [...this._sprims]) {
      if (entry.sceneDelegate && _HasPrefix(id, root)
        && (sceneDelegate === null || entry.sceneDelegate === sceneDelegate)) this._RemoveSprim(entry.primType, id)
    }
    for (const [id, entry] of [...this._bprims]) {
      if (entry.sceneDelegate && _HasPrefix(id, root)
        && (sceneDelegate === null || entry.sceneDelegate === sceneDelegate)) this._RemoveBprim(entry.primType, id)
    }
    this._removeInstancerSubtree(root, sceneDelegate)
    this._removeTaskSubtree(root, sceneDelegate)
  }

  /** renderIndex.cpp:2139-2179 */
  private _removeInstancerSubtree(root: string, sceneDelegate: HdSceneDelegate | null): void {
    for (const [id, instancer] of [...this._instancerMap]) {
      if (_HasPrefix(id, root) && (sceneDelegate === null || sceneDelegate === instancer.getDelegate())) {
        this._RemoveInstancer(id)
      }
    }
  }

  /** renderIndex.cpp (_RemoveTaskSubtree) */
  private _removeTaskSubtree(root: string, sceneDelegate: HdSceneDelegate | null): void {
    for (const [id, entry] of [...this._tasks]) {
      if (_HasPrefix(id, root) && (sceneDelegate === null || entry.delegate === sceneDelegate)) {
        this._RemoveTask(id)
      }
    }
  }

  // ---- Scene index wiring ----

  setSceneIndex(sceneIndex: HdSceneIndexBase): void {
    if (this._sceneIndex === sceneIndex) return
    if (this._sceneIndex) {
      this._sceneIndex.removeObserver(this)
      this._releaseAllPrims()
    }
    this._sceneIndex = sceneIndex
    this._delegate.setTerminalSceneIndex(sceneIndex)
    sceneIndex.addObserver(this)
    this._populateFromSceneIndex(sceneIndex, '/')
  }

  getSceneIndex(): HdSceneIndexBase | undefined { return this._sceneIndex }
  getRenderDelegate(): HdRenderDelegate { return this._delegate }
  getRenderParam(): HdRenderParam | undefined { return this._delegate.getRenderParam() }
  /** renderIndex.h:442,624 (GetDrivers returns the drivers given to New).
   *  Without drivers given, those of the render delegate. */
  getDrivers(): readonly unknown[] {
    if (this._drivers.length > 0) return this._drivers
    const delegate = this._delegate as HdRenderDelegate & { getDrivers?: () => readonly unknown[] }
    return delegate.getDrivers?.() ?? []
  }
  getResourceRegistry(): unknown {
    const delegate = this._delegate as HdRenderDelegate & { getResourceRegistry?: () => unknown }
    return delegate.getResourceRegistry?.()
  }

  // ---- HdSceneIndexObserver ----

  primsAdded(_sender: HdSceneIndexBase, entries: AddedPrimEntry[]): void {
    for (const { primPath, primType } of entries) {
      this._insertPrim(primPath, primType)
    }
  }

  primsRemoved(_sender: HdSceneIndexBase, entries: RemovedPrimEntry[]): void {
    for (const { primPath } of entries) {
      this._removePrim(primPath)
    }
  }

  primsDirtied(_sender: HdSceneIndexBase, entries: DirtiedPrimEntry[]): void {
    for (const { primPath, dirtyLocators } of entries) {
      if (this._geomSubsetPaths.has(primPath) && !dirtyLocators.IsEmpty()) this._dirtyGeomSubsetParent(primPath)
      const rentry = this._rprims.get(primPath)
      if (rentry && !dirtyLocators.IsEmpty()) {
        let bits = HdDirtyBitsTranslator.rprimLocatorSetToDirtyBits(
          rentry.primType, dirtyLocators)
        // Locators the translator doesn't map yet (material, visibility, ...)
        // fall back to AllDirty so nothing is silently dropped. Upstream maps
        // every schema explicitly; this goes away as those schemas land.
        if (bits === HdChangeTracker.Clean) bits = HdChangeTracker.AllDirty
        rentry.dirtyBits |= bits
        this._markObserverRprimDirty(primPath, bits)
      }
      // Sprims (lights, materials, cameras) have delegate-specific dirty
      // bits — any dirtied locator triggers a full re-sync.
      const sentry = this._sprims.get(primPath)
      if (sentry && !dirtyLocators.IsEmpty()) sentry.dirtyBits |= HdChangeTracker.AllDirty
      const bentry = this._bprims.get(primPath)
      if (bentry && !dirtyLocators.IsEmpty()) bentry.dirtyBits |= HdChangeTracker.AllDirty
    }
  }

  primsRenamed(_sender: HdSceneIndexBase, entries: RenamedPrimEntry[]): void {
    for (const { oldPrimPath, newPrimPath } of entries) {
      const entry = this._rprims.get(oldPrimPath)
      if (entry) {
        this._rprims.delete(oldPrimPath)
        this._rprims.set(newPrimPath, entry)
      }
    }
  }

  // ---- Rprim access ----

  hasRprim(id: string): boolean { return this._rprims.has(id) }
  getRprim(id: string): HdRprim | undefined { return this._rprims.get(id)?.rprim }
  getRprimIds(): string[] { return [...this._rprims.keys()] }
  insertRprim(typeId: string, id: string): void
  insertRprim(typeId: string, sceneDelegate: HdSceneDelegate, rprimId: string): void
  insertRprim(typeId: string, idOrDelegate: string | HdSceneDelegate, rprimId?: string): void {
    if (typeof idOrDelegate !== 'string') {
      // renderIndex.cpp:456-469
      if (this._emulationSceneIndex) {
        this._emulationSceneIndex.addLegacyPrim(rprimId ?? '', typeId, idOrDelegate)
      } else {
        this._InsertRprim(typeId, idOrDelegate, rprimId ?? '')
      }
      return
    }
    const id = idOrDelegate
    if (!this._delegate.getSupportedRprimTypes().includes(typeId) || this._rprims.has(id)) return
    const rprim = this._delegate.createRprim(typeId, id)
    const dirtyBits = rprim.getInitialDirtyBitsMask()
    this._rprims.set(id, { rprim, primType: typeId, dirtyBits })
    this._tracker.rprimInserted(id, dirtyBits)
  }
  /** renderIndex.cpp:514-524. Prims of the scene-index observer path (see
   *  the header) are removed directly. */
  removeRprim(id: string): void {
    if (this._emulationSceneIndex && this._rprims.get(id)?.sceneDelegate !== undefined) {
      this._emulationSceneIndex.removePrim(id)
      return
    }
    this._RemoveRprim(id)
  }

  /** renderIndex.cpp:526-551 */
  _RemoveRprim(id: string): void {
    const entry = this._rprims.get(id)
    if (!entry) return
    if (entry.sceneDelegate) {
      // renderIndex.cpp:526-551
      const instancerId = entry.rprim.getInstancerId()
      if (instancerId !== '') this._tracker.removeInstancerRprimDependency(instancerId, id)
      entry.rprim.finalize(this._delegate.getRenderParam())
    }
    this._delegate.destroyRprim(entry.rprim)
    this._rprims.delete(id)
    this._tracker.rprimRemoved(id)
  }

  // renderIndex.cpp:1144-1183 — path/render-tag filtering followed by each
  // selected repr's retained draw items.
  getDrawItems(collection: HdRprimCollection, renderTags: readonly string[]): HdDrawItem[] {
    const result: HdDrawItem[] = []
    const roots = collection.getRootPaths()
    const excludes = collection.getExcludePaths()
    const repr = collection.getReprSelector().Key()
    for (const [id, entry] of this._rprims) {
      if (!roots.some(root => root === '/' || id === root || id.startsWith(`${root}/`))) continue
      if (excludes.some(path => id === path || id.startsWith(`${path}/`))) continue
      if (renderTags.length > 0 && !renderTags.includes(this.getRprimRenderTag(id))) continue
      if (entry.sceneDelegate) {
        // renderIndex.cpp:2329-2400 _AppendDrawItems: the draw items of each
        // active repr of the resolved (rprim over collection) selector.
        const reprSelector = _GetResolvedReprSelector(entry.rprim.getReprSelector(),
          collection.getReprSelector(), collection.isForcedRepr())
        for (let i = 0; i < HdReprSelector.MAX_TOPOLOGY_REPRS; ++i) {
          if (!reprSelector.isActiveRepr(i)) continue
          for (const drawItem of entry.rprim.getDrawItems(reprSelector.at(i))) {
            if (!collection.getMaterialTag() || drawItem.getMaterialTag() === collection.getMaterialTag()) {
              result.push(drawItem)
            }
          }
        }
        continue
      }
      if (entry.sceneDelegate) {
        // renderIndex.cpp:2329-2408 (_AppendDrawItems): the draw items of
        // each active repr of the resolved repr selector.
        const reprSelector = _GetResolvedReprSelector(entry.rprim.getReprSelector(),
          collection.getReprSelector(), collection.isForcedRepr())
        for (let i = 0; i < HdReprSelector.MAX_TOPOLOGY_REPRS; ++i) {
          if (!reprSelector.isActiveRepr(i)) continue
          for (const drawItem of entry.rprim.getDrawItems(reprSelector.at(i))) {
            if (!collection.getMaterialTag() || drawItem.getMaterialTag() === collection.getMaterialTag()) {
              result.push(drawItem)
            }
          }
        }
        continue
      }
      for (const drawItem of entry.rprim.getDrawItems(repr)) {
        if (!collection.getMaterialTag() || drawItem.getMaterialTag() === collection.getMaterialTag()) {
          result.push(drawItem)
        }
      }
    }
    return result
  }

  // ---- Sync ----

  // HdRenderIndex::EnqueueCollectionToSync (hd/renderIndex.cpp:1669-1672),
  // called from HdRenderPass::Sync (hd/renderPass.cpp:55-63).
  enqueueCollectionToSync(collection: HdRprimCollection): void {
    this._collectionsToSync.push(collection)
  }

  // Without an explicit repr, sync the reprs of the enqueued collections
  // (hd/renderIndex.cpp:1790 _GatherReprSpecs). FAITHFULNESS-DEBT(hd-repr-sync-retention):
  // upstream leaves dirty rprims unsynced when no render pass enqueued a
  // collection (renderIndex.cpp:1790-1987); this scene-index-only SyncAll
  // reuses the previous reprs so callers that sync outside a render pass keep
  // the repr their last render selected.
  /** renderIndex.cpp:1691-1990 SyncAll(tasks, taskContext), as HdEngine
   *  calls it; SyncAll(reprToken, commitResources) syncs prims without tasks
   *  (see the header). */
  SyncAll(tasks: readonly HdTask[], taskContext: HdTaskContext): void
  SyncAll(reprToken?: string, commitResources?: boolean): void
  SyncAll(tasksOrRepr?: readonly HdTask[] | string, contextOrCommit?: HdTaskContext | boolean): void {
    // Track SyncAll() depth (renderIndex.cpp:1697-1699).
    TF_VERIFY(!this.isSyncAllInProgress(), 'Re-entrant SyncAll() detected')
    ++this._syncAllDepth
    try {
      if (Array.isArray(tasksOrRepr)) {
        this._syncAll(undefined, false, tasksOrRepr, contextOrCommit as HdTaskContext)
      } else {
        this._syncAll(tasksOrRepr as string | undefined, (contextOrCommit as boolean | undefined) ?? true)
      }
    } finally {
      --this._syncAllDepth
    }
  }

  private _syncAll(reprToken: string | undefined, commitResources: boolean,
    tasks?: readonly HdTask[], taskContext?: HdTaskContext): void {
    // Render delegates driving prim updates from the scene index will expect
    // an Update call; run this before legacy Hydra prim sync
    // (renderIndex.cpp:1701-1710).
    this._delegate.update?.()
    const legacyCollections = this._collectionsToSync
    // Bprims and sprims, then the tasks, then rprims (renderIndex.cpp:
    // 1714-1790).
    const syncTasks = (): void => { if (tasks) this._syncTasks(tasks, taskContext!) }
    if (this._hasLegacyPrims()) {
      this._syncLegacyPrims(legacyCollections, reprToken, syncTasks)
    } else {
      syncTasks()
    }
    const previousReprs = this._lastSyncedReprs
    const reprs = reprToken !== undefined ? [reprToken]
      : this._collectionsToSync.length > 0
        ? [...new Set(this._collectionsToSync.map(collection =>
            collection.getReprSelector().at(0)).filter(token => token !== ''))]
        : this._lastSyncedReprs
    this._collectionsToSync = []
    this._lastSyncedReprs = reprs
    if (!this._sceneIndex) return
    const trace = Collector.GetInstance()
    trace.beginEvent('HdRenderIndex::SyncAll')
    try {
    // Sprims sync first: rprims may depend on them (e.g. a mesh reading its
    // bound material's parameters), matching upstream Hydra ordering.
    for (const [path, entry] of this._sprims) {
      if (entry.sceneDelegate) continue
      if (entry.dirtyBits === HdChangeTracker.Clean) continue
      const prim = this._sceneIndex.getPrim(path)
      entry.sprim.sync(prim, entry.dirtyBits)
      entry.dirtyBits = HdChangeTracker.Clean
    }
    // Bprims (volume fields) next: rprims read them during their own Sync.
    for (const [path, entry] of this._bprims) {
      if (entry.sceneDelegate) continue
      if (entry.dirtyBits === HdChangeTracker.Clean) continue
      const prim = this._sceneIndex.getPrim(path)
      entry.bprim.sync(prim, entry.dirtyBits)
      entry.dirtyBits = HdChangeTracker.Clean
    }
    for (const [path, entry] of this._rprims) {
      if (entry.sceneDelegate) continue
      // hd/renderIndex.cpp _GatherReprSpecs: initializing a new repr requires Sync.
      if (reprs.length !== previousReprs.length || reprs.some((repr, i) => repr !== previousReprs[i])) entry.dirtyBits |= HdChangeTracker.DirtyDisplayStyle
      if (entry.dirtyBits === HdChangeTracker.Clean) continue
      const prim = this._sceneIndex.getPrim(path)
      for (const repr of reprs) entry.rprim.sync(prim, entry.dirtyBits, repr)
      entry.dirtyBits = HdChangeTracker.Clean
      this._tracker.markRprimClean(path)
    }
    if (commitResources) this._delegate.CommitResources()
    } finally {
      trace.endEvent('HdRenderIndex::SyncAll')
    }
  }

  getSprimIds(): string[] { return [...this._sprims.keys()] }

  /** renderIndex.cpp:854-858 (primTypeIndex.cpp:306-330
   *  CreateFallbackPrims). The fallback prim of each supported sprim type is
   *  created on first request instead of at construction. */
  getFallbackSprim(typeId: string): HdSprim | null {
    if (!this._fallbackSprims.has(typeId)) {
      const supported = this._delegate.getSupportedSprimTypes().includes(typeId)
      this._fallbackSprims.set(typeId,
        supported ? this._delegate.createFallbackSprim(typeId) : null)
    }
    return this._fallbackSprims.get(typeId) ?? null
  }
  private _fallbackSprims = new Map<string, HdSprim | null>()
  getSprim(id: string): HdSprim | undefined
  getSprim(typeId: string, id: string): HdSprim | undefined
  getSprim(typeOrId: string, id?: string): HdSprim | undefined {
    const entry = this._sprims.get(id ?? typeOrId)
    return id === undefined || entry?.primType === typeOrId ? entry?.sprim : undefined
  }
  insertSprim(typeId: string, id: string): void
  insertSprim(typeId: string, sceneDelegate: HdSceneDelegate, sprimId: string): void
  insertSprim(typeId: string, idOrDelegate: string | HdSceneDelegate, sprimId?: string): void {
    if (typeof idOrDelegate !== 'string') {
      // renderIndex.cpp:796-809
      if (this._emulationSceneIndex) {
        this._emulationSceneIndex.addLegacyPrim(sprimId ?? '', typeId, idOrDelegate)
      } else {
        this._InsertSprim(typeId, idOrDelegate, sprimId ?? '')
      }
      return
    }
    const id = idOrDelegate
    if (!this._delegate.getSupportedSprimTypes().includes(typeId) || this._sprims.has(id)) return
    const sprim = this._delegate.createSprim(typeId, id)
    this._sprims.set(id, {
      sprim, primType: typeId, dirtyBits: sprim.getInitialDirtyBitsMask(),
    })
  }
  /** renderIndex.cpp:819-829 */
  removeSprim(typeId: string, id: string): void {
    if (this._emulationSceneIndex && this._sprims.get(id)?.sceneDelegate !== undefined) {
      this._emulationSceneIndex.removePrim(id)
      return
    }
    this._RemoveSprim(typeId, id)
  }

  /** renderIndex.cpp:831-835 */
  _RemoveSprim(typeId: string, id: string): void {
    const entry = this._sprims.get(id)
    if (!entry || entry.primType !== typeId) return
    if (entry.sceneDelegate) this._tracker.sprimRemoved(id)
    this._destroySprim(entry.sprim)
    this._sprims.delete(id)
  }
  getBprimIds(): string[] { return [...this._bprims.keys()] }
  getBprim(id: string): HdBprim | undefined
  getBprim(typeId: string, id: string): HdBprim | undefined
  getBprim(typeOrId: string, id?: string): HdBprim | undefined {
    const entry = this._bprims.get(id ?? typeOrId)
    return id === undefined || entry?.primType === typeOrId ? entry?.bprim : undefined
  }
  insertBprim(typeId: string, id: string): void
  insertBprim(typeId: string, sceneDelegate: HdSceneDelegate, bprimId: string): void
  insertBprim(typeId: string, idOrDelegate: string | HdSceneDelegate, bprimId?: string): void {
    if (typeof idOrDelegate !== 'string') {
      // renderIndex.cpp:865-878
      if (this._emulationSceneIndex) {
        this._emulationSceneIndex.addLegacyPrim(bprimId ?? '', typeId, idOrDelegate)
      } else {
        this._InsertBprim(typeId, idOrDelegate, bprimId ?? '')
      }
      return
    }
    const id = idOrDelegate
    if (!this._delegate.getSupportedBprimTypes().includes(typeId) || this._bprims.has(id)) return
    const bprim = this._delegate.createBprim(typeId, id)
    this._bprims.set(id, {
      bprim, primType: typeId, dirtyBits: bprim.getInitialDirtyBitsMask(),
    })
  }
  /** renderIndex.cpp:888-898 */
  removeBprim(typeId: string, id: string): void {
    if (this._emulationSceneIndex && this._bprims.get(id)?.sceneDelegate !== undefined) {
      this._emulationSceneIndex.removePrim(id)
      return
    }
    this._RemoveBprim(typeId, id)
  }

  /** renderIndex.cpp:900-904 */
  _RemoveBprim(typeId: string, id: string): void {
    const entry = this._bprims.get(id)
    if (!entry || entry.primType !== typeId) return
    if (entry.sceneDelegate) this._tracker.bprimRemoved(id)
    this._destroyBprim(entry.bprim)
    this._bprims.delete(id)
  }

  /** renderIndex.h:313-323 InsertTask<T>(delegate, id): the task class is
   *  passed as a value (legacyTaskFactory.ts). The one-or-two argument form
   *  inserts an existing task object directly (see the header). */
  insertTask<T extends HdTask>(delegate: HdSceneDelegate, id: string, taskType: HdLegacyTaskConstructor<T>): void
  insertTask(task: HdTask, delegate?: unknown): void
  insertTask<T extends HdTask>(taskOrDelegate: HdTask | HdSceneDelegate, idOrDelegate?: unknown,
    taskType?: HdLegacyTaskConstructor<T>): void {
    if (typeof idOrDelegate === 'string' && taskType) {
      this._insertSceneDelegateTask(taskOrDelegate as HdSceneDelegate, idOrDelegate,
        HdMakeLegacyTaskFactory(taskType))
      return
    }
    const task = taskOrDelegate as HdTask
    const id = task.getId()
    this._tracker.taskInserted(id, task.getInitialDirtyBitsMask())
    this._tasks.set(id, { task, delegate: idOrDelegate, emulated: false })
  }
  /** renderIndex.cpp:698-716 */
  private _insertSceneDelegateTask(delegate: HdSceneDelegate, taskId: string,
    factory: HdLegacyTaskFactory): void {
    if (taskId === '') {
      return
    }
    if (this._emulationSceneIndex) {
      this._emulationSceneIndex.addLegacyTask(taskId, delegate, factory)
    } else {
      const task = factory.create(delegate, taskId)
      this._InsertTask(delegate, taskId, task)
    }
  }
  /** renderIndex.cpp:718-728 (_InsertTask), for tasks the adapter scene
   *  delegate creates from HdLegacyTaskSchema prims. */
  _InsertTask(delegate: HdSceneDelegate, id: string, task: HdTask): void {
    this._tracker.taskInserted(id, task.getInitialDirtyBitsMask())
    this._tasks.set(id, { task, delegate, emulated: this._emulationSceneIndex !== undefined })
  }
  /** renderIndex.cpp:741-749. Tasks inserted directly (InsertTask(task))
   *  are not in the emulation scene index and are removed directly. */
  removeTask(id: string): void {
    if (this._emulationSceneIndex && this._tasks.get(id)?.emulated) {
      this._emulationSceneIndex.removePrim(id)
    } else {
      this._RemoveTask(id)
    }
  }
  /** renderIndex.cpp:751-765 */
  _RemoveTask(id: string): void {
    if (!this._tasks.delete(id)) return
    this._tracker.taskRemoved(id)
  }
  getTask(id: string): HdTask | undefined { return this._tasks.get(id)?.task }
  getTaskIds(): string[] { return [...this._tasks.keys()] }
  /** HdChangeTracker::MarkTaskDirty for the task `id`: emulated tasks are
   *  dirtied through the emulation scene index (changeTracker.cpp:397-419),
   *  directly inserted ones in the tracker. */
  markTaskDirty(id: string, bits: HdDirtyBits): void {
    const entry = this._tasks.get(id)
    if (!entry) return
    if (entry.emulated) this._tracker.markTaskDirty(id, bits)
    else this._tracker._MarkTaskDirty(id, bits)
  }
  /** The task sync of SyncAll alone (see the header). */
  syncTasks(tasks: readonly HdTask[], context: HdTaskContext): void {
    this._syncTasks(tasks, context)
  }
  /** renderIndex.cpp:1712-1780 (Task Sync), and _GatherRenderTags
   *  (renderIndex.cpp:1782-1784) for the rprim sync that follows. */
  private _syncTasks(tasks: readonly HdTask[], context: HdTaskContext): void {
    for (let taskNum = 0; taskNum < tasks.length; ++taskNum) {
      const task = tasks[taskNum]
      if (!TF_VERIFY(task)) {
        TF_CODING_ERROR(`Null Task in task list.  Entry Num: ${taskNum}`)
        continue
      }
      const taskId = task!.getId()
      // Is this a tracked task?
      const taskInfo = this._tasks.get(taskId)
      if (taskInfo) {
        // For consistency, we always use the registered task in the render
        // index for a given id, as that is the one the state is tracked for.
        TF_VERIFY(taskInfo.task === task)
        const taskDirtyBits = this._tracker.getTaskDirtyBits(taskId)
        taskInfo.task.sync(taskInfo.delegate, context, taskDirtyBits)
        // HdTask::Sync clears its dirty bits (passed by pointer upstream).
        this._tracker.markTaskClean(taskId, HdChangeTracker.Clean)
      } else {
        // This is an untracked task, never added to the render index.
        task!.sync(null as never, context, 0 as never)
      }
    }
    this._legacyTaskRenderTags = [...new Set(tasks.flatMap(task => [...task.getRenderTags()]))].sort()
  }
  CommitResources(): void { this._delegate.CommitResources() }

  getRprimSubtree(root: string): string[] {
    return _SortedPaths(this.getRprimIds().filter(id => _HasPathPrefix(id, root)))
  }
  getSprimSubtree(root: string): string[]
  getSprimSubtree(typeId: string, root: string): string[]
  getSprimSubtree(typeOrRoot: string, root?: string): string[] {
    const path = root ?? typeOrRoot
    return _SortedPaths(this.getSprimIds().filter(id =>
      (root === undefined || this._sprims.get(id)?.primType === typeOrRoot) &&
      _HasPathPrefix(id, path)))
  }
  getBprimSubtree(root: string): string[]
  getBprimSubtree(typeId: string, root: string): string[]
  getBprimSubtree(typeOrRoot: string, root?: string): string[] {
    const path = root ?? typeOrRoot
    return _SortedPaths(this.getBprimIds().filter(id =>
      (root === undefined || this._bprims.get(id)?.primType === typeOrRoot) &&
      _HasPathPrefix(id, path)))
  }

  // Hd_DirtyList consults these methods on HdRenderIndex directly upstream
  // (pxr/imaging/hd/dirtyList.cpp:51-164).
  getChangeTracker(): HdRprimChangeTracker { return this._tracker }
  getRprimRenderTag(id: string): string {
    // renderIndex.cpp:1277-1285 for scene-delegate rprims.
    const entry = this._rprims.get(id)
    if (entry?.sceneDelegate) return entry.rprim.getRenderTag()
    return HdRenderTagTokens.geometry
  }

  // ---- Legacy scene-delegate API ----

  /** renderIndex.cpp:1277-1285 */
  getRenderTag(id: string): string {
    const entry = this._rprims.get(id)
    if (!entry) return HdRenderTagTokens.hidden
    return entry.sceneDelegate ? entry.rprim.getRenderTag() : HdRenderTagTokens.geometry
  }

  /** renderIndex.cpp:1287-1303 */
  updateRenderTag(id: string, bits: HdDirtyBits): string {
    const entry = this._rprims.get(id)
    if (!entry) return HdRenderTagTokens.hidden
    if (entry.sceneDelegate && (bits & HdChangeTracker.DirtyRenderTag)) {
      entry.rprim.updateRenderTag(entry.sceneDelegate, this._delegate.getRenderParam())
      this._tracker.markRprimClean(id, bits & ~HdChangeTracker.DirtyRenderTag)
    }
    return this.getRenderTag(id)
  }

  /** renderIndex.cpp:2202-2234 (the legacy branch). */
  getSceneDelegateForRprim(id: string): HdSceneDelegate | null {
    if (this._emulationSceneIndex) {
      // Applications expect this to return the original scene delegate
      // responsible for inserting the prim at the specified id.
      const delegate = _GetSceneDelegateFromSceneIndex(this._emulationSceneIndex, id)
      if (delegate) return delegate
      // fallback value is the back-end emulation delegate
      return this._siSd ?? null
    }
    return this._rprims.get(id)?.sceneDelegate ?? null
  }

  /** renderIndex.cpp:2259-2300 */
  getSceneDelegateAndInstancerIds(id: string): { delegateId: string, instancerId: string } | null {
    const entry = this._rprims.get(id)
    if (!entry) return null
    let delegateId = ''
    const delegate = _GetSceneDelegateFromSceneIndex(this._emulationSceneIndex, id)
    if (delegate) delegateId = delegate.getDelegateID()
    else if (this._siSd) delegateId = this._siSd.getDelegateID()
    else if (entry.sceneDelegate) delegateId = entry.sceneDelegate.getDelegateID()
    return { delegateId, instancerId: entry.rprim.getInstancerId() }
  }

  /** renderIndex.cpp:2060-2073 */
  insertInstancer(delegate: HdSceneDelegate, id: string): void {
    if (this._emulationSceneIndex) {
      this._emulationSceneIndex.addLegacyPrim(id, HdPrimTypeTokens.instancer, delegate)
    } else {
      this._InsertInstancer(delegate, id)
    }
  }

  /** renderIndex.cpp:2075-2101. Divergence: when the render delegate
   *  creates no HdInstancer (render delegates in this port may not implement
   *  CreateInstancer), the instancer is still tracked in the change tracker,
   *  with HdInstancer::GetInitialDirtyBitsMask (instancer.cpp). */
  _InsertInstancer(delegate: HdSceneDelegate, id: string): void {
    if (this._instancerMap.has(id) || this._legacyInstancers.has(id)) return
    const sceneDelegateId = delegate.getDelegateID()
    if (!_HasPrefix(id, sceneDelegateId)) {
      TF_CODING_ERROR(`Scene Delegate Id (${sceneDelegateId}) must prefix prim Id (${id})`)
      return
    }
    const instancer = this._delegate.createInstancer?.(delegate, id) ?? null
    if (instancer) {
      this._instancerMap.set(id, instancer)
      this._tracker.instancerInserted(id, instancer.getInitialDirtyBitsMask())
      return
    }
    this._legacyInstancers.set(id, delegate)
    this._tracker.instancerInserted(id, HdChangeTracker.DirtyTransform
      | HdChangeTracker.DirtyPrimvar | HdChangeTracker.DirtyInstanceIndex
      | HdChangeTracker.DirtyVisibility)
  }

  /** renderIndex.cpp:2103-2115 */
  removeInstancer(id: string): void {
    if (this._emulationSceneIndex) {
      this._emulationSceneIndex.removePrims([{ primPath: id }])
    } else {
      this._RemoveInstancer(id)
    }
  }

  /** renderIndex.cpp:2117-2137 */
  _RemoveInstancer(id: string): void {
    const instancer = this._instancerMap.get(id)
    if (!instancer) {
      if (this._legacyInstancers.delete(id)) this._tracker.instancerRemoved(id)
      return
    }
    const instancerId = instancer.getParentId()
    if (instancerId !== '') this._tracker.removeInstancerInstancerDependency(instancerId, id)
    this._tracker.instancerRemoved(id)
    instancer.finalize(this._delegate.getRenderParam() ?? null)
    this._instancerMap.delete(id)
    this._delegate.destroyInstancer?.(instancer)
  }

  /** renderIndex.cpp:2181-2189 */
  getInstancer(id: string): HdInstancer | null { return this._instancerMap.get(id) ?? null }

  /** renderIndex.cpp:639-655 */
  clear(): void {
    for (const id of this._tasks.keys()) this._tracker.taskRemoved(id)
    this._tasks.clear()
    if (this._emulationSceneIndex) {
      this._emulationSceneIndex.removePrims([{ primPath: '/' }])
    } else {
      this._Clear()
    }
  }

  /** renderIndex.cpp:657-692 for the scene-delegate prims; scene-index prims
   *  of the observer path (see the header) are owned by the scene index and
   *  are left alone. */
  _Clear(): void {
    for (const [id, entry] of [...this._rprims]) {
      if (!entry.sceneDelegate) continue
      const instancerId = entry.rprim.getInstancerId()
      if (instancerId !== '') this._tracker.removeInstancerRprimDependency(instancerId, id)
      this._tracker.rprimRemoved(id)
      entry.rprim.finalize(this._delegate.getRenderParam())
      this._delegate.destroyRprim(entry.rprim)
      this._rprims.delete(id)
    }
    for (const [id, entry] of [...this._sprims]) {
      if (!entry.sceneDelegate) continue
      this._tracker.sprimRemoved(id)
      this._destroySprim(entry.sprim)
      this._sprims.delete(id)
    }
    for (const [id, entry] of [...this._bprims]) {
      if (!entry.sceneDelegate) continue
      this._tracker.bprimRemoved(id)
      this._destroyBprim(entry.bprim)
      this._bprims.delete(id)
    }
    this._removeInstancerSubtree('/', null)
    for (const id of [...this._legacyInstancers.keys()]) this._RemoveInstancer(id)
    this._removeTaskSubtree('/', null)
  }

  // JavaScript lifecycle equivalent of HdRenderIndex's C++ destructor: detach
  // from the scene index before releasing every delegate-owned prim.
  destroy(): void {
    // renderIndex.cpp:254-267: ~HdSceneIndexAdapterSceneDelegate removes the
    // prims it inserted (_RemoveSubtree of its delegate id).
    if (this._siSd) {
      this._terminalSceneIndex?.removeObserver(this._siSd)
      this._RemoveSubtree(this._siSd.getDelegateID(), this._siSd)
      this._siSd = undefined
    }
    this._sceneIndex?.removeObserver(this)
    this._sceneIndex = undefined
    this._releaseAllPrims()
  }

  // ---- Private helpers ----

  private _hasLegacyPrims(): boolean {
    for (const entry of this._rprims.values()) if (entry.sceneDelegate) return true
    for (const entry of this._sprims.values()) if (entry.sceneDelegate) return true
    for (const entry of this._bprims.values()) if (entry.sceneDelegate) return true
    return false
  }

  /** renderIndex.cpp:471-512 */
  _InsertRprim(typeId: string, sceneDelegate: HdSceneDelegate, rprimId: string): void {
    if (this._rprims.has(rprimId)) return
    const sceneDelegateId = sceneDelegate.getDelegateID()
    if (!_HasPrefix(rprimId, sceneDelegateId)) {
      TF_CODING_ERROR(`Scene Delegate Id (${sceneDelegateId}) must prefix prim Id (${rprimId})`)
      return
    }
    // CreateRprim returns nullptr for an unsupported type upstream.
    if (!this._delegate.getSupportedRprimTypes().includes(typeId)) return
    const rprim = this._delegate.createRprim(typeId, rprimId)
    if (!rprim) return
    // Force an initial "renderTag" sync; the render index manages render
    // tags rather than the rprim implementation.
    this._tracker.rprimInserted(rprimId, rprim.getInitialDirtyBitsMask()
      | HdChangeTracker.DirtyRenderTag | HdChangeTracker.DirtyPrimID)
    if (this._rprimPrimIdMap) {
      // Prim ids are assigned by this HdRenderIndex.
      this._allocatePrimId(rprim)
    }
    this._rprims.set(rprimId, {
      rprim, primType: typeId, dirtyBits: HdChangeTracker.Clean, sceneDelegate,
    })
  }

  /** renderIndex.cpp:2015-2033. Divergence: no compaction at 2^24 ids. */
  private _allocatePrimId(prim: HdRprim): void {
    const map = this._rprimPrimIdMap!
    prim.setPrimId(map.length)
    // note: not marking DirtyPrimID here to avoid undesirable variability tracking.
    map.push(prim.getId())
  }

  /** renderIndex.cpp:2036-2058 */
  getRprimPathFromPrimId(primId: number): string {
    if (this._rprimPrimIdMap) {
      // Prim id's are assigned by this HdRenderIndex.
      return this._rprimPrimIdMap[primId] ?? ''
    }

    const primPathsDs =
      HdSceneGlobalsSchema.getFromSceneIndex(this._terminalSceneIndex)
        .getPrimIdToPath()
    const primPathDs = primPathsDs.getElement(primId)
    if (!primPathDs) {
      return ''
    }

    return primPathDs.getTypedValue(0.0) as string
  }

  /** renderIndex.cpp:811-817, primTypeIndex.cpp InsertPrim. */
  _InsertSprim(typeId: string, sceneDelegate: HdSceneDelegate, sprimId: string): void {
    if (this._sprims.has(sprimId)) return
    if (!this._delegate.getSupportedSprimTypes().includes(typeId)) return
    const sprim = this._delegate.createSprim(typeId, sprimId)
    // primTypeIndex.cpp:99-104: a null prim is not inserted.
    if (!sprim) return
    this._sprims.set(sprimId, {
      sprim, primType: typeId, dirtyBits: HdChangeTracker.Clean, sceneDelegate,
    })
    this._tracker.sprimInserted(sprimId, sprim.getInitialDirtyBitsMask())
  }

  /** renderIndex.cpp:880-886, primTypeIndex.cpp InsertPrim. */
  _InsertBprim(typeId: string, sceneDelegate: HdSceneDelegate, bprimId: string): void {
    if (this._bprims.has(bprimId)) return
    if (!this._delegate.getSupportedBprimTypes().includes(typeId)) return
    const bprim = this._delegate.createBprim(typeId, bprimId)
    // primTypeIndex.cpp:99-104: a null prim is not inserted.
    if (!bprim) return
    this._bprims.set(bprimId, {
      bprim, primType: typeId, dirtyBits: HdChangeTracker.Clean, sceneDelegate,
    })
    this._tracker.bprimInserted(bprimId, bprim.getInitialDirtyBitsMask())
  }

  /**
   * renderIndex.cpp:1691-1990 SyncAll for the scene-delegate prims: bprims,
   * sprims (primTypeIndex.cpp:377-432), then the dirty rprims: pre-sync
   * (repr selector update, InitRepr, skip-invisible, dirty bit propagation;
   * renderIndex.cpp:1489-1567), scene delegate Sync, rprim Sync per resolved
   * repr (renderIndex.cpp:1394-1468) and PostSyncCleanup.
   */
  private _syncLegacyPrims(collections: readonly HdRprimCollection[], reprToken: string | undefined,
    syncTasks: () => void): void {
    const renderParam = this._delegate.getRenderParam() ?? null
    const tracker = this._tracker

    for (const [id, entry] of this._bprims) {
      if (!entry.sceneDelegate) continue
      const dirtyBits = { value: tracker.getBprimDirtyBits(id) }
      if (dirtyBits.value === HdChangeTracker.Clean) continue
      entry.bprim.sync(entry.sceneDelegate, renderParam, dirtyBits)
      tracker.markBprimClean(id, dirtyBits.value)
    }
    const sprimDelegates = new Set<HdSceneDelegate>()
    for (const [id, entry] of this._sprims) {
      if (!entry.sceneDelegate) continue
      const dirtyBits = { value: tracker.getSprimDirtyBits(id) }
      if (dirtyBits.value === HdChangeTracker.Clean) continue
      entry.sprim.sync(entry.sceneDelegate, renderParam, dirtyBits)
      tracker.markSprimClean(id, dirtyBits.value)
      sprimDelegates.add(entry.sceneDelegate)
    }

    // Task Sync (renderIndex.cpp:1712-1780).
    syncTasks()

    // a. Gather reprSpecs (renderIndex.cpp:1619-1645 _GatherReprSpecs). An
    // explicit reprToken (this class's SyncAll argument) stands for a
    // collection with that repr.
    const reprSpecs: _CollectionReprSpec[] = []
    const addSpec = (rs: HdReprSelector, forced: boolean): void => {
      if (!rs.anyActiveRepr()) return // Skip empty/disabled reprs
      if (!reprSpecs.some(spec => spec.useCollectionRepr === forced && spec.reprSelector.Equals(rs))) {
        reprSpecs.push({ reprSelector: rs, useCollectionRepr: forced })
      }
    }
    if (reprToken !== undefined) addSpec(new HdReprSelector(reprToken), false)
    for (const collection of collections) addSpec(collection.getReprSelector(), collection.isForcedRepr())
    const reprSelectorKeys = [...new Set(reprSpecs.map(spec => spec.reprSelector.Key()))]

    // b. Update dirty list params and get dirty rprim ids.
    const dirtyList = this._legacyRprimDirtyList ??= new Hd_DirtyList({
      getChangeTracker: () => tracker,
      getRprimIds: () => [...this._rprims].filter(([, e]) => e.sceneDelegate).map(([id]) => id).sort(),
      getRprimRenderTag: (id: string) => this.updateRenderTag(id, tracker.getRprimDirtyBits(id)),
    })
    dirtyList.updateRenderTagsAndReprSelectors(this._legacyTaskRenderTags, reprSelectorKeys)
    const dirtyRprimIds = dirtyList.getDirtyRprims()

    // c. Bucket rprims by their scene delegate.
    const syncMap = new Map<HdSceneDelegate, { rprims: HdRprim[]; IDs: string[]; dirtyBits: HdDirtyBits[] }>()
    for (const rprimId of dirtyRprimIds) {
      const entry = this._rprims.get(rprimId)
      if (!TF_VERIFY(entry !== undefined) || !entry!.sceneDelegate) continue
      const dirtyBits = tracker.getRprimDirtyBits(rprimId)
      if (HdChangeTracker.isClean(dirtyBits)) continue
      let request = syncMap.get(entry!.sceneDelegate)
      if (!request) syncMap.set(entry!.sceneDelegate, request = { rprims: [], IDs: [], dirtyBits: [] })
      request.rprims.push(entry!.rprim)
      request.IDs.push(rprimId)
      request.dirtyBits.push(dirtyBits)
    }

    // d. Rprim "Pre-Sync" (renderIndex.cpp:1489-1567).
    for (const [sceneDelegate, request] of syncMap) {
      for (let i = 0; i < request.rprims.length; ++i) {
        const rprim = request.rprims[i]!
        const dirtyBits = { value: request.dirtyBits[i]! }
        if ((dirtyBits.value & (HdChangeTracker.InitRepr | HdChangeTracker.DirtyRepr)) !== 0) {
          rprim.updateReprSelector(sceneDelegate, dirtyBits)
          for (const spec of reprSpecs) {
            const reprSelector = _GetResolvedReprSelector(rprim.getReprSelector(),
              spec.reprSelector, spec.useCollectionRepr)
            for (let r = 0; r < HdReprSelector.MAX_TOPOLOGY_REPRS; ++r) {
              if (reprSelector.isActiveRepr(r)) {
                rprim.initRepr(sceneDelegate, reprSelector.at(r), dirtyBits)
              }
            }
          }
          dirtyBits.value &= ~HdChangeTracker.InitRepr
          // Clear the InitRepr bit in the change tracker.
          tracker.markRprimClean(rprim.getId(), dirtyBits.value)
        }
        if (rprim.canSkipDirtyBitPropagationAndSync(dirtyBits.value)) {
          dirtyBits.value = HdChangeTracker.Clean
          tracker.resetRprimVaryingState(rprim.getId())
        } else {
          dirtyBits.value = rprim.propagateRprimDirtyBits(dirtyBits.value)
        }
        request.dirtyBits[i] = dirtyBits.value
      }
      // renderIndex.cpp:1569-1608: pre-sync may have completely cleaned
      // prims; remove them from the request.
      for (let i = request.rprims.length - 1; i >= 0; --i) {
        if (HdChangeTracker.isClean(request.dirtyBits[i]!)) {
          request.rprims.splice(i, 1)
          request.IDs.splice(i, 1)
          request.dirtyBits.splice(i, 1)
        }
      }
    }

    // e. Scene delegate sync (renderIndex.cpp:1370-1377).
    for (const [sceneDelegate, request] of syncMap) {
      sceneDelegate.sync({ IDs: request.IDs, dirtyBits: request.dirtyBits })
    }

    // f. Rprim Sync (renderIndex.cpp:1417-1467, serial).
    for (const [sceneDelegate, request] of syncMap) {
      for (let i = 0; i < request.rprims.length; ++i) {
        const rprim = request.rprims[i]!
        const dirtyBits = { value: request.dirtyBits[i]! }
        // renderIndex.cpp:1426-1431: prim ids come from the scene delegate
        // only when the terminal scene index publishes them.
        if (!this._rprimPrimIdMap && (dirtyBits.value & HdChangeTracker.DirtyPrimID)) {
          rprim.setPrimId(sceneDelegate.getPrimId(rprim.getId()))
        }
        const reprsSynced: string[] = []
        for (const spec of reprSpecs) {
          const reprSelector = _GetResolvedReprSelector(rprim.getReprSelector(),
            spec.reprSelector, spec.useCollectionRepr)
          for (let r = 0; r < HdReprSelector.MAX_TOPOLOGY_REPRS; ++r) {
            const token = reprSelector.at(r)
            // Sync valid repr tokens once.
            if (reprSelector.isActiveRepr(r) && !reprsSynced.includes(token)) {
              rprim.sync(sceneDelegate, renderParam, dirtyBits, token)
              reprsSynced.push(token)
            }
          }
        }
        tracker.markRprimClean(rprim.getId(), dirtyBits.value)
      }
    }

    // Clean up (renderIndex.cpp:1966-1988).
    for (const sceneDelegate of syncMap.keys()) sceneDelegate.postSyncCleanup()
    for (const sceneDelegate of sprimDelegates) sceneDelegate.postSyncCleanup()
  }

  // The pre-emulation HdChangeTracker::MarkRprimDirty (changeTracker.cpp:96-
  // 125 without the emulation branch) for the scene-index observer path,
  // whose prims are not in the emulation scene index.
  private _markObserverRprimDirty(id: string, bits: HdDirtyBits): void {
    if (bits === HdChangeTracker.Clean) return
    if (bits & HdChangeTracker.DirtyPrimvar) {
      bits |= HdChangeTracker.DirtyPoints | HdChangeTracker.DirtyNormals
    }
    this._tracker._MarkRprimDirty(id, bits)
  }

  private _populateFromSceneIndex(si: HdSceneIndexBase, path: string): void {
    const prim = si.getPrim(path)
    if (prim.primType) this._insertPrim(path, prim.primType)
    for (const child of si.getChildPrimPaths(path)) {
      this._populateFromSceneIndex(si, child)
    }
  }

  // hd/sceneIndexAdapterSceneDelegate.cpp:261-342 maps child subset changes
  // to parent topology dirtiness. This scene-index-only Sync bridge owns the
  // notification until the legacy delegate lifecycle replaces it.
  private _dirtyGeomSubsetParent(path: string): void {
    const parent = path.slice(0, path.lastIndexOf('/')) || '/'
    const entry = this._rprims.get(parent)
    if (!entry) return
    const bits = HdChangeTracker.DirtyTopology | HdChangeTracker.DirtyMaterialId
    entry.dirtyBits |= bits
    this._markObserverRprimDirty(parent, bits)
  }

  // hd/sceneIndexAdapterSceneDelegate.cpp:232-337: an added entry for an
  // existing prim of another type replaces it; one of the same type is a
  // resync that invalidates all of its properties.
  private _insertPrim(path: string, typeId: string): void {
    const existingType = this._rprims.get(path)?.primType ?? this._sprims.get(path)?.primType
      ?? this._bprims.get(path)?.primType ?? (this._geomSubsetPaths.has(path) ? 'geomSubset' : undefined)
    if (existingType === typeId) {
      if (typeId === 'geomSubset') { this._dirtyGeomSubsetParent(path); return }
      const rentry = this._rprims.get(path)
      if (rentry) {
        const bits = HdDirtyBitsTranslator.rprimLocatorSetToDirtyBits(typeId, new HdDataSourceLocatorSet([new HdDataSourceLocator()])) || HdChangeTracker.AllDirty
        rentry.dirtyBits |= bits
        this._markObserverRprimDirty(path, bits)
      }
      const sentry = this._sprims.get(path)
      if (sentry) sentry.dirtyBits |= HdChangeTracker.AllDirty
      const bentry = this._bprims.get(path)
      if (bentry) bentry.dirtyBits |= HdChangeTracker.AllDirty
      return
    }
    if (existingType !== undefined) this._removeSinglePrim(path)
    if (typeId === 'geomSubset') {
      this._geomSubsetPaths.add(path)
      this._dirtyGeomSubsetParent(path)
      return
    }
    const supported = this._delegate.getSupportedRprimTypes()
    if (supported.includes(typeId)) {
      const rprim = this._delegate.createRprim(typeId, path)
      this._rprims.set(path, { rprim, primType: typeId, dirtyBits: rprim.getInitialDirtyBitsMask() })
      this._tracker.rprimInserted(path, rprim.getInitialDirtyBitsMask())
      return
    }
    const ssprim = this._delegate.getSupportedSprimTypes()
    if (ssprim.includes(typeId)) {
      const sprim = this._delegate.createSprim(typeId, path)
      this._sprims.set(path, {
        sprim, primType: typeId, dirtyBits: sprim.getInitialDirtyBitsMask(),
      })
      return
    }
    const sbprim = this._delegate.getSupportedBprimTypes()
    if (sbprim.includes(typeId)) {
      const bprim = this._delegate.createBprim(typeId, path)
      this._bprims.set(path, {
        bprim, primType: typeId, dirtyBits: bprim.getInitialDirtyBitsMask(),
      })
    }
  }

  // The prim at path alone, as the type-change case of
  // sceneIndexAdapterSceneDelegate.cpp:248-264 removes it.
  private _removeSinglePrim(path: string): void {
    if (this._geomSubsetPaths.delete(path)) this._dirtyGeomSubsetParent(path)
    const rentry = this._rprims.get(path)
    if (rentry) {
      this._finalizeAndDestroyRprim(rentry.rprim)
      this._rprims.delete(path)
      this._tracker.rprimRemoved(path)
    }
    const sentry = this._sprims.get(path)
    if (sentry) { this._destroySprim(sentry.sprim); this._sprims.delete(path) }
    const bentry = this._bprims.get(path)
    if (bentry) { this._destroyBprim(bentry.bprim); this._bprims.delete(path) }
  }

  // Upstream RemovedPrimEntry semantics: the prim at path AND all its
  // descendants are removed.
  private _removePrim(path: string): void {
    const prefix = path === '/' ? '/' : `${path}/`
    for (const subset of this._geomSubsetPaths) {
      if (subset === path || subset.startsWith(prefix)) {
        this._geomSubsetPaths.delete(subset)
        this._dirtyGeomSubsetParent(subset)
      }
    }
    for (const [id, entry] of [...this._rprims]) {
      if (id === path || id.startsWith(prefix)) {
        this._finalizeAndDestroyRprim(entry.rprim)
        this._rprims.delete(id)
        this._tracker.rprimRemoved(id)
      }
    }
    for (const [id, entry] of [...this._sprims]) {
      if (id === path || id.startsWith(prefix)) {
        this._destroySprim(entry.sprim)
        this._sprims.delete(id)
      }
    }
    for (const [id, entry] of [...this._bprims]) {
      if (id === path || id.startsWith(prefix)) {
        this._destroyBprim(entry.bprim)
        this._bprims.delete(id)
      }
    }
  }

  /** renderIndex.cpp:546-547 (_RemoveRprim): Finalize, then DestroyRprim. */
  private _finalizeAndDestroyRprim(rprim: HdRprim): void {
    rprim.finalize(this._delegate.getRenderParam())
    this._delegate.destroyRprim(rprim)
  }

  /** primTypeIndex.cpp:512-522 Hd_PrimTypeIndex<HdSprim>::
   *  _RenderDelegateDestroyPrim: Finalize, then DestroySprim. */
  private _destroySprim(sprim: HdSprim): void {
    (sprim as { finalize?(renderParam: unknown): void }).finalize?.(this._delegate.getRenderParam())
    this._delegate.destroySprim(sprim)
  }

  /** primTypeIndex.cpp:588-597 Hd_PrimTypeIndex<HdBprim>::
   *  _RenderDelegateDestroyPrim: Finalize, then DestroyBprim. */
  private _destroyBprim(bprim: HdBprim): void {
    (bprim as { finalize?(renderParam: unknown): void }).finalize?.(this._delegate.getRenderParam())
    this._delegate.destroyBprim(bprim)
  }

  private _releaseAllPrims(): void {
    for (const [id, entry] of this._rprims) {
      this._finalizeAndDestroyRprim(entry.rprim)
      this._tracker.rprimRemoved(id)
    }
    for (const entry of this._sprims.values()) this._destroySprim(entry.sprim)
    for (const entry of this._bprims.values()) this._destroyBprim(entry.bprim)
    this._geomSubsetPaths.clear()
    this._rprims.clear()
    this._sprims.clear()
    this._bprims.clear()
  }
}

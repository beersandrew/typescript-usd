// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImaging/stageSceneIndex.cpp,
//  pxr/usdImaging/usdImaging/stageSceneIndex.h
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/stageSceneIndex.{h,cpp}
// (OpenUSD 26.11.1).
//
// Divergences:
// - SdfPath is a string. A subprim path is the prim path with the subprim
//   name appended as a property (SdfPath::AppendProperty).

import {
  DataSourceLocator as HdDataSourceLocator, DataSourceLocatorSet as HdDataSourceLocatorSet,
  OverlayContainerDataSource as HdOverlayContainerDataSource,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  type AddedPrimEntry, type ContainerDataSource as HdContainerDataSource, type DirtiedPrimEntry,
  type RemovedPrimEntry, type SceneIndexPrim as HdSceneIndexPrim,
} from 'typescript-usd/hd'
import { Schema as SdfSchema } from 'typescript-usd/sdf'
import { Notice as TfNotice, type NoticeKey as TfNoticeKey } from 'typescript-usd/tf'
import {
  Notice as UsdNotice, PrimIsAbstract as UsdPrimIsAbstract, PrimIsActive as UsdPrimIsActive,
  PrimIsLoaded as UsdPrimIsLoaded, PrimRange as UsdPrimRange, TimeCode as UsdTimeCode,
  TraverseInstanceProxies as UsdTraverseInstanceProxies,
  type Prim as UsdPrim, type Stage as UsdStage,
} from 'typescript-usd/usd'
import { PrimAPI as UsdHydraPrimAPI, Tokens as UsdHydraTokens } from 'typescript-usd/usdHydra'
import { UsdImaging_AdapterManager, type UsdImaging_AdapterEntry } from './adapterManager.ts'
import { UsdImagingDataSourceStage } from './dataSourceStage.ts'
import { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import { UsdImagingPopulationMode, type UsdImagingPrimAdapter } from './primAdapter.ts'
import { UsdImagingSceneIndexCreateArgsSchema } from './sceneIndexCreateArgsSchema.ts'
import { UsdImagingStageSceneIndexInterface } from './stageSceneIndexInterface.ts'
import { UsdImagingTokens } from './tokens.ts'
import { UsdImagingPropertyInvalidationType } from './types.ts'
import './plugInfo.ts'

type UsdPrimFlagsPredicate = ReturnType<typeof UsdTraverseInstanceProxies>

// ---------------------------------------------------------------------------
// SdfPath helpers (string paths).

const _IsAbsoluteRootPath = (path: string): boolean => path === '/'
const _IsPropertyPath = (path: string): boolean => path.includes('.')
const _IsAbsoluteRootOrPrimPath = (path: string): boolean => path.startsWith('/') && !_IsPropertyPath(path)
const _GetPrimPath = (path: string): string => {
  const dot = path.indexOf('.')
  return dot < 0 ? path : path.slice(0, dot)
}
const _GetNameToken = (path: string): string => {
  const dot = path.indexOf('.')
  return dot < 0 ? path.slice(path.lastIndexOf('/') + 1) : path.slice(dot + 1)
}
const _AppendProperty = (path: string, name: string): string => `${path}.${name}`
const _HasPrefix = (path: string, prefix: string): boolean =>
  prefix === '/' ? path.startsWith('/') : path === prefix || path.startsWith(prefix + '/') || path.startsWith(prefix + '.')
const _GetParentPath = (path: string): string => {
  const slash = path.lastIndexOf('/')
  return slash <= 0 ? '/' : path.slice(0, slash)
}
/** SdfPath operator< for prim and property paths (element-wise). */
function _ComparePaths(a: string, b: string): number {
  if (a === b) return 0
  const ea = a === '/' ? [] : a.slice(1).split(/(?=[/.])/)
  const eb = b === '/' ? [] : b.slice(1).split(/(?=[/.])/)
  const n = Math.min(ea.length, eb.length)
  for (let i = 0; i < n; i++) {
    if (ea[i] !== eb[i]) return ea[i]! < eb[i]! ? -1 : 1
  }
  return ea.length - eb.length
}

// ---------------------------------------------------------------------------
// stageSceneIndex.cpp:37-211

function _GetImagingSubprims(prim: UsdPrim, entries: readonly UsdImaging_AdapterEntry[]): string[] {
  switch (entries.length) {
    case 0:
      // If this prim isn't handled by any adapters, make sure we include
      // the trivial subprim "".
      return ['']
    case 1: {
      const subprims = entries[0]!.adapter.getImagingSubprims(prim, entries[0]!.appliedInstanceName)
      // Enforce that the trivial subprim "" always exists, to pick up
      // inherited attributes and for traversal purposes.
      if (!subprims.includes('')) {
        subprims.push('')
      }
      return subprims
    }
    default: {
      // We always add the empty token here and skip it in the loop below.
      // This ensures that we pick up the prim for inherited attributes and
      // for traversal purposes.
      const subprims = ['']
      const subprimsSet = new Set<string>()
      for (const entry of entries) {
        if (!entry.adapter) continue
        for (const subprim of entry.adapter.getImagingSubprims(prim, entry.appliedInstanceName)) {
          if (subprim === '') continue
          if (!subprimsSet.has(subprim)) {
            subprims.push(subprim)
            subprimsSet.add(subprim)
          }
        }
      }
      return subprims
    }
  }
}

function _GetImagingSubprimType(
  entries: readonly UsdImaging_AdapterEntry[], prim: UsdPrim, subprim: string,
): string {
  // strongest non-empty opinion wins
  for (const entry of entries) {
    const result = entry.adapter.getImagingSubprimType(prim, subprim, entry.appliedInstanceName)
    if (result !== '') {
      return result
    }
  }
  return ''
}

function _GetImagingSubprimData(
  entries: readonly UsdImaging_AdapterEntry[], prim: UsdPrim, subprim: string,
  stageGlobals: UsdImagingDataSourceStageGlobals,
): HdContainerDataSource | undefined {
  if (entries.length === 0) {
    return undefined
  }
  if (entries.length === 1) {
    return entries[0]!.adapter.getImagingSubprimData(
      prim, subprim, entries[0]!.appliedInstanceName, stageGlobals)
  }
  const containers: HdContainerDataSource[] = []
  for (const entry of entries) {
    const ds = entry.adapter.getImagingSubprimData(prim, subprim, entry.appliedInstanceName, stageGlobals)
    if (ds) containers.push(ds)
  }
  if (containers.length === 0) {
    return undefined
  }
  if (containers.length === 1) {
    return containers[0]
  }
  return HdOverlayContainerDataSource.new(...containers)
}

function _InvalidateImagingSubprim(
  entries: readonly UsdImaging_AdapterEntry[], prim: UsdPrim, subprim: string,
  properties: readonly string[], invalidationType: UsdImagingPropertyInvalidationType,
): HdDataSourceLocatorSet {
  if (entries.length === 0) {
    return new HdDataSourceLocatorSet()
  }
  if (entries.length === 1) {
    return entries[0]!.adapter.invalidateImagingSubprim(
      prim, subprim, entries[0]!.appliedInstanceName, properties, invalidationType)
  }
  const result = new HdDataSourceLocatorSet()
  for (const entry of entries) {
    for (const locator of entry.adapter.invalidateImagingSubprim(
      prim, subprim, entry.appliedInstanceName, properties, invalidationType)) {
      result.add(locator)
    }
  }
  return result
}

function _GetIncludeUnloadedPrims(createArgs: HdContainerDataSource | undefined): boolean {
  const schema = UsdImagingSceneIndexCreateArgsSchema.getFromParent(createArgs)
  const ds = schema.getIncludeUnloadedPrims()
  if (!ds) {
    return false
  }
  return ds.getTypedValue(0.0)
}

// ---------------------------------------------------------------------------
// stageSceneIndex.cpp:1007-1102 _StageGlobals

class _StageGlobals extends UsdImagingDataSourceStageGlobals {
  private readonly _timeVaryingLocators = new Map<string, HdDataSourceLocatorSet>()
  private _assetPathDependents = new Set<string>()
  private _time: UsdTimeCode = UsdTimeCode.EarliestTime()

  // Datasource-facing API

  /** stageSceneIndex.cpp:1009-1016 */
  flagAsTimeVarying(hydraPath: string, locator: HdDataSourceLocator): void {
    let set = this._timeVaryingLocators.get(hydraPath)
    if (!set) this._timeVaryingLocators.set(hydraPath, set = new HdDataSourceLocatorSet())
    set.add(locator)
  }

  /** stageSceneIndex.cpp:1018-1025 */
  flagAsAssetPathDependent(usdPath: string): void {
    this._assetPathDependents.add(usdPath)
  }

  /** stageSceneIndex.cpp:1027-1030 */
  getTime(): UsdTimeCode {
    return this._time
  }

  // Scene index-facing API

  /** stageSceneIndex.cpp:1032-1044 */
  SetTime(time: UsdTimeCode, dirtied: DirtiedPrimEntry[] | undefined): void {
    this._time = time
    if (dirtied && this._timeVaryingLocators.size !== 0) {
      for (const [primPath, dirtyLocators] of this._timeVaryingLocators) {
        dirtied.push({ primPath, dirtyLocators })
      }
    }
  }

  /** stageSceneIndex.cpp:1046-1058 */
  removeAssetPathDependentsUnder(path: string): void {
    for (const dep of [...this._assetPathDependents]) {
      if (_HasPrefix(dep, path)) this._assetPathDependents.delete(dep)
    }
  }

  /** stageSceneIndex.cpp:1060-1091 */
  invalidateAssetPathDependentsUnder(
    path: string, primsToInvalidate: string[], propertiesToInvalidate: Map<string, string[]>,
  ): void {
    const deps = [...this._assetPathDependents].filter(dep => _HasPrefix(dep, path)).sort(_ComparePaths)
    for (const depPath of deps) {
      if (_IsAbsoluteRootOrPrimPath(depPath)) {
        primsToInvalidate.push(depPath)
      } else if (_IsPropertyPath(depPath)) {
        const primPath = _GetPrimPath(depPath)
        let props = propertiesToInvalidate.get(primPath)
        if (!props) propertiesToInvalidate.set(primPath, props = [])
        props.push(_GetNameToken(depPath))
      }
    }
  }

  /** stageSceneIndex.cpp:1093-1102 */
  clear(): void {
    this._timeVaryingLocators.clear()
    this._time = UsdTimeCode.EarliestTime()
    this._assetPathDependents.clear()
  }
}

/** UsdTimeCode equality (UsdTimeCode::operator==). */
function _TimeEquals(a: UsdTimeCode, b: UsdTimeCode): boolean {
  if (a.isDefault() || b.isDefault()) return a.isDefault() && b.isDefault()
  return a.GetValue() === b.GetValue() && a.isPreTime() === b.isPreTime()
}

type _PrimAdapterPair = [UsdPrim, UsdImagingPrimAdapter]

// ---------------------------------------------------------------------------

/** stageSceneIndex.h:30-189 */
export class UsdImagingStageSceneIndex extends UsdImagingStageSceneIndexInterface {
  private readonly _includeUnloadedPrims: boolean
  private _stage: UsdStage | undefined
  private readonly _stageGlobals = new _StageGlobals()
  private _objectsChangedNoticeKey: TfNoticeKey | undefined

  // Keep track of populated paths for use in _ApplyPendingResyncs(), sorted
  // in SdfPath order on demand.
  private readonly _populatedPaths = new Set<string>()
  // Note: resync paths mean we remove the whole subtree and repopulate.
  private _usdPrimsToResync: string[] = []
  // Property changes get converted into PrimsDirtied messages.
  private _usdPropertiesToUpdate = new Map<string, string[]>()
  private _usdPropertiesToResync = new Map<string, string[]>()

  private readonly _adapterManager = new UsdImaging_AdapterManager()

  /** stageSceneIndex.h:33-37 */
  static new(inputArgs?: HdContainerDataSource): UsdImagingStageSceneIndex {
    return new UsdImagingStageSceneIndex(inputArgs)
  }

  /** stageSceneIndex.cpp:215-220 */
  protected constructor(createArgs?: HdContainerDataSource) {
    super()
    this._includeUnloadedPrims = _GetIncludeUnloadedPrims(createArgs)
  }

  // ------------------------------------------------------------------------
  // Scene index API

  /** stageSceneIndex.cpp:247-297 */
  getPrim(path: string): HdSceneIndexPrim {
    const emptyPrim: HdSceneIndexPrim = { primType: '', dataSource: undefined }

    if (!this._stage) {
      return emptyPrim
    }

    if (_IsAbsoluteRootPath(path)) {
      return { primType: '', dataSource: UsdImagingDataSourceStage.new(this._stage) }
    }

    const primPath = _GetPrimPath(path)

    const prim = this._stage.getPrim(primPath)
    if (!prim) {
      return emptyPrim
    }
    if (prim.isInstanceProxy() && !UsdHydraPrimAPI.shouldExpandInstancesForPrim(prim)) {
      // Instance proxy prims are not reflected into the scene index unless
      // hydra:expandInstances=1 is set on an ancestor.
      return emptyPrim
    }
    if (!this._getPrimPredicate().evaluate(prim)) {
      return emptyPrim
    }

    const subprim = _IsPropertyPath(path) ? _GetNameToken(path) : ''

    const entries = this._adapterManager.lookupAdapters(prim).allAdapters

    let dataSource = _GetImagingSubprimData(entries, prim, subprim, this._stageGlobals)

    if (subprim === '' && !dataSource) {
      dataSource = UsdImagingStageSceneIndex._empty
    }

    return {
      primType: _GetImagingSubprimType(entries, prim, subprim),
      dataSource,
    }
  }
  private static readonly _empty = HdRetainedContainerDataSource.new([], [])

  /** stageSceneIndex.cpp:301-373 */
  getChildPrimPaths(path: string): string[] {
    if (!this._stage) {
      return []
    }

    // If this is a subprim path, treat it as a leaf.
    if (!_IsAbsoluteRootOrPrimPath(path)) {
      return []
    }

    const prim = this._stage.getPrim(path)
    if (!prim) {
      return []
    }

    // Determine if we need to expand instances at this path.
    let expandInstances = false
    if (prim.isInstance() || prim.isInstanceProxy()) {
      expandInstances = UsdHydraPrimAPI.shouldExpandInstancesForPrim(prim)
      if (!expandInstances) {
        // This is an instance or instance proxy, but we are not expanding
        // the instance, so there are no children in the Hydra scene index.
        return []
      }
    }

    const result: string[] = []

    // This function needs to match Populate() in traversal rules. Namely:
    // 1.) Unless prim adapter represents descendent prims, all children of
    //     prim (modulo predicate) are traversed, although some of them may
    //     have null type.
    // 2.) If prim has imaging behaviors and defines subprims other than
    //     TfToken(), those need to be considered as well.

    const entry = this._adapterManager.lookupAdapters(prim)

    if (!(entry.primAdapter &&
        entry.primAdapter.getPopulationMode() === UsdImagingPopulationMode.RepresentsSelfAndDescendents)) {
      let predicate = this._getPrimPredicate()
      if (expandInstances) {
        predicate = predicate.traverseInstanceProxies(true)
      }
      for (const child of prim.getFilteredChildren(predicate)) {
        result.push(child.path)
      }
    }

    const primPath = prim.path
    for (const subprim of _GetImagingSubprims(prim, entry.allAdapters)) {
      if (subprim !== '') {
        result.push(_AppendProperty(primPath, subprim))
      }
    }

    if (_IsAbsoluteRootPath(path)) {
      for (const protoPrim of this._stage.getPrototypes()) {
        result.push(protoPrim.path)
      }
    }

    return result
  }

  // ------------------------------------------------------------------------
  // App-facing API

  /** stageSceneIndex.cpp:377-391. Set the time, and call PrimsDirtied for
   *  any time-varying attributes. PrimsDirtied is only called if the time is
   *  different from the last call or forceDirtyingTimeDeps is true. */
  SetTime(time: UsdTimeCode | number, forceDirtyingTimeDeps = false): void {
    const t = typeof time === 'number' ? new UsdTimeCode(time) : time
    if (!_TimeEquals(this._stageGlobals.getTime(), t) || forceDirtyingTimeDeps) {
      this._setTime(t)
    }
  }

  /** stageSceneIndex.cpp:393-396 */
  getTime(): UsdTimeCode {
    return this._stageGlobals.getTime()
  }

  /** stageSceneIndex.cpp:398-424. Set the USD stage to pull data from. Note
   *  that this will delete all scene index prims and reset stage global
   *  data. */
  SetStage(stage: UsdStage | undefined): void {
    if (this._stage === stage) {
      return
    }

    if (this._stage) {
      this._populatedPaths.clear()
      this._sendPrimsRemoved([{ primPath: '/' }])
      this._stageGlobals.clear()
      this._objectsChangedNoticeKey?.revoke()
      this._objectsChangedNoticeKey = undefined
      this._adapterManager.Reset()
    }

    this._stage = stage

    if (this._stage) {
      const sender = this._stage
      this._objectsChangedNoticeKey = TfNotice.Register(UsdNotice.ObjectsChanged,
        (notice: UsdNotice.ObjectsChanged) => this._onUsdObjectsChanged(notice, sender), sender)
    }

    this._populate()
  }

  /** stageSceneIndex.cpp:426-435 */
  private _setTime(time: UsdTimeCode): void {
    const dirtied: DirtiedPrimEntry[] = []
    this._stageGlobals.SetTime(time, dirtied)
    if (dirtied.length !== 0) {
      this._sendPrimsDirtied(dirtied)
    }
  }

  /** stageSceneIndex.cpp:437-467 */
  private _populate(): void {
    if (!this._stage) {
      return
    }

    const addedPrims: AddedPrimEntry[] = []

    // Populate each subtree, building up a single list of AddedPrimEntries.
    this._populateSubtree(this._stage.getPrim('/'), addedPrims)
    for (const prim of this._stage.getPrototypes()) {
      this._populateSubtree(prim, addedPrims)
    }
    for (const entry of addedPrims) {
      this._populatedPaths.add(entry.primPath)
    }

    this._sendPrimsAdded(addedPrims)
  }

  /** stageSceneIndex.cpp:469-551 */
  private _populateSubtree(subtreeRoot: UsdPrim | undefined, addedPrims: AddedPrimEntry[]): void {
    if (!subtreeRoot) {
      return
    }

    const range = UsdPrimRange.fromPrim(subtreeRoot, UsdTraverseInstanceProxies(this._getPrimPredicate()))

    // During traversal, keep track of whether we are expanding an instance.
    // This will hold the root path of the instance being expanded, or
    // otherwise hold an empty path. This is used to minimize calls to
    // ShouldExpandInstancesForPrim() during traversal.
    let instanceExpansionRoot = ''

    const it = range[Symbol.iterator]()
    for (let next = it.next(); !next.done; next = it.next()) {
      const prim = next.value
      if (prim.path === '/') {
        // XXX for now, we have to make sure the prim at the absolute root
        // path is "added"
        addedPrims.push({ primPath: '/', primType: '' })
        continue
      }

      // Instance traversal.
      if (instanceExpansionRoot !== '') {
        // We have been expanding an instance. Check if we are still under
        // the same instance root.
        if (!_HasPrefix(prim.path, instanceExpansionRoot)) {
          // No longer under the same instance. Reset instance root, and
          // check below if we have entered a new instance.
          instanceExpansionRoot = ''
        }
      }
      // Check if we have reached a new instance to expand.
      if (instanceExpansionRoot === '' && prim.isInstance()) {
        // We do not need to includeAncestors when checking this prim for
        // Hydra-expansion state because we are already keeping track of
        // that in our recursive namespace traversal.
        const includeAncestors = false
        if (UsdHydraPrimAPI.shouldExpandInstancesForPrim(prim, includeAncestors)) {
          // We have reached a new instance and it is marked for expansion.
          instanceExpansionRoot = prim.path
        } else {
          // We have reached a new instance but it is not marked for
          // expansion, so skip its children. Note that this is the
          // expected common case for instances.
          it.pruneChildren()
        }
      }

      const entry = this._adapterManager.lookupAdapters(prim)

      if (entry.primAdapter &&
          entry.primAdapter.getPopulationMode() === UsdImagingPopulationMode.RepresentsSelfAndDescendents) {
        it.pruneChildren()
      }

      // Enumerate the imaging sub-prims.
      const primPath = prim.path
      const subprims = _GetImagingSubprims(prim, entry.allAdapters)

      for (const subprim of subprims) {
        const subpath = subprim === '' ? primPath : _AppendProperty(primPath, subprim)
        addedPrims.push({
          primPath: subpath,
          primType: _GetImagingSubprimType(entry.allAdapters, prim, subprim),
        })
      }
    }
  }

  /** stageSceneIndex.cpp:553-576. Note that it differs from the
   *  UsdPrimDefaultPredicate by not requiring UsdPrimIsDefined. This way, we
   *  pick up instance and over's and their namespace descendants which might
   *  include prototypes instanced by a point instancer.
   *
   *  Over's and their namespace descendants are made unrenderable by
   *  changing their prim type to empty by UsdImaging_PiPrototypeSceneIndex.
   *
   *  The UsdImaging_NiPrototypeSceneIndex is doing something similar for
   *  native instances. */
  private _getPrimPredicate(): UsdPrimFlagsPredicate {
    const commonFlags = UsdPrimIsActive.and(UsdPrimIsAbstract.not())
    if (this._includeUnloadedPrims) {
      return commonFlags
    }
    return commonFlags.and(UsdPrimIsLoaded)
  }

  // ------------------------------------------------------------------------

  /** stageSceneIndex.cpp:580-679 */
  private _onUsdObjectsChanged(notice: UsdNotice.ObjectsChanged, sender: UsdStage): void {
    if (!sender || sender !== this._stage) {
      return
    }

    // These paths represent objects which have been modified in a structural
    // way, for example changing type or composition topology. These paths
    // may be paths to prims or properties. Prim resyncs trigger a
    // repopulation of the subtree rooted at the prim path. Property resyncs
    // are promoted to hydra property invalidations.
    for (const path of notice.getResyncedPaths()) {
      if (_IsAbsoluteRootOrPrimPath(path)) {
        this._usdPrimsToResync.push(path)
      } else if (_IsPropertyPath(path)) {
        this._pushProperty(this._usdPropertiesToResync, _GetPrimPath(path), _GetNameToken(path))
        if (_GetNameToken(path) === UsdHydraTokens.hydraExpandInstances) {
          // Toggling hydra:expandInstances changes the topology of the
          // scene index, so repopulate the affected subtree.
          this._usdPrimsToResync.push(_GetPrimPath(path))
        }
      }

      // Clear out recorded asset path dependencies since they are subsumed
      // by the object resyncs. This ensures we don't have stale entries for
      // dependent objects that have been removed from the scene.
      this._stageGlobals.removeAssetPathDependentsUnder(path)
    }

    // These paths represent objects which have been modified in a
    // non-structural way, for example setting a value. These paths may be
    // paths to prims or properties. Property invalidations flow into hydra
    // as dirty locators. Prim invalidations are promoted to resyncs or
    // ignored.
    const schema = SdfSchema.getInstance()
    for (const path of notice.getChangedInfoOnlyPaths()) {
      if (_IsAbsoluteRootOrPrimPath(path)) {
        // By default, resync the prim if there are any changes to plugin
        // fields and ignore changes to built-in fields. Schemas typically
        // register their own plugin metadata fields instead of relying on
        // built-in fields.
        for (const field of notice.getChangedFields(path)) {
          const fieldDef = schema.getFieldDefinition(field)
          if (fieldDef && fieldDef.isPlugin()) {
            this._usdPrimsToResync.push(path)
            break
          }
        }
      } else if (_IsPropertyPath(path)) {
        if (_GetNameToken(path) === UsdHydraTokens.hydraExpandInstances) {
          // Toggling hydra:expandInstances changes the topology of the
          // scene index, so repopulate the affected subtree.
          this._usdPrimsToResync.push(_GetPrimPath(path))
        }
        this._pushProperty(this._usdPropertiesToUpdate, _GetPrimPath(path), _GetNameToken(path))
      }
    }

    // These paths represent objects under which asset paths have been
    // invalidated. For each such path, we find all of the asset
    // path-dependent objects that have been recorded in the stage globals
    // and invalidate just those objects.
    for (const path of notice.getResolvedAssetPathsResyncedPaths()) {
      this._stageGlobals.invalidateAssetPathDependentsUnder(
        path, this._usdPrimsToResync, this._usdPropertiesToUpdate)
    }
  }

  private _pushProperty(map: Map<string, string[]>, primPath: string, name: string): void {
    let props = map.get(primPath)
    if (!props) map.set(primPath, props = [])
    props.push(name)
  }

  /** stageSceneIndex.cpp:681-728 */
  private _walkResponsibleAncestors(prim: UsdPrim, stopAtFirst: boolean): _PrimAdapterPair[] {
    const stage = this._stage!
    const parentOf = (p: UsdPrim): UsdPrim | undefined =>
      p.path === '/' ? undefined : stage.getPrim(_GetParentPath(p.path))
    const parents: (UsdPrim | undefined)[] = [parentOf(prim)]
    const results: _PrimAdapterPair[] = []
    const visited = new Set<string>()

    while (parents.length !== 0) {
      let parentPrim = parents.shift()
      while (parentPrim) {
        if (visited.has(parentPrim.path)) {
          break
        }
        visited.add(parentPrim.path)

        const primAdapter = this._adapterManager.lookupAdapters(parentPrim).primAdapter

        if (primAdapter && primAdapter.getPopulationMode() === UsdImagingPopulationMode.RepresentsSelfAndDescendents) {
          results.push([parentPrim, primAdapter])
          if (stopAtFirst) {
            return results
          }
          break
        }

        if (parentPrim.isPrototype()) {
          for (const instancePath of stage.getInstances(parentPrim.path)) {
            parents.push(stage.getPrim(instancePath))
          }
          break
        }

        parentPrim = parentOf(parentPrim)
      }
    }

    return results
  }

  /** stageSceneIndex.cpp:730-735 */
  private _findResponsibleAncestors(prim: UsdPrim): _PrimAdapterPair[] {
    return this._walkResponsibleAncestors(prim, /* stopAtFirst = */ false)
  }

  /** stageSceneIndex.cpp:737-742 */
  private _hasResponsibleAncestor(prim: UsdPrim): boolean {
    return this._walkResponsibleAncestors(prim, /* stopAtFirst = */ true).length !== 0
  }

  /** stageSceneIndex.cpp:744-757 */
  private static _deletePrefix(prefix: string, m: Map<string, string[]>): void {
    for (const key of [...m.keys()]) {
      if (_HasPrefix(key, prefix)) m.delete(key)
    }
  }

  /** stageSceneIndex.cpp:759-874 */
  private _applyPendingResyncs(): void {
    if (!this._stage || this._usdPrimsToResync.length === 0) {
      return
    }

    let removedPrims: RemovedPrimEntry[] = []
    const addedPrims: AddedPrimEntry[] = []

    this._usdPrimsToResync.sort(_ComparePaths)
    let lastResynced = 0
    for (let i = 0; i < this._usdPrimsToResync.length; ++i) {
      const primPath = this._usdPrimsToResync[i]!
      // Coalesce paths with a common prefix, so as not to resync /A and
      // /A/B, since due to their hierarchical nature the latter is
      // redundant. Thanks to the sort, all suffixes of path[i] are in a
      // contiguous block to the right of i. We skip all resync paths until
      // we find one that's not a suffix of path[i], which marks the start of
      // a new (possibly 1-element) contiguous block of suffixes of some
      // path.
      if (i > 0 && _HasPrefix(primPath, this._usdPrimsToResync[lastResynced]!)) {
        continue
      }
      lastResynced = i

      const prim = this._stage.getPrim(primPath)

      // For prims represented by an ancestor, we don't want to repopulate
      // (as they wouldn't have been populated in the first place) but
      // instead convert to an empty property name dirtying to be handled in
      // ApplyPendingUpdates. Do not worry about redundant property
      // invalidation in that case.
      const primAdapter = this._adapterManager.lookupAdapters(prim).primAdapter
      if (prim && primAdapter &&
          primAdapter.getPopulationMode() === UsdImagingPopulationMode.RepresentedByAncestor) {
        if (this._hasResponsibleAncestor(prim)) {
          this._usdPropertiesToResync.set(primPath, [''])
          continue
        }
      }

      removedPrims.push({ primPath })
      this._populateSubtree(prim, addedPrims)

      if (_IsAbsoluteRootPath(primPath)) {
        for (const protoPrim of this._stage.getPrototypes()) {
          this._populateSubtree(protoPrim, addedPrims)
        }
      }

      // Prune property updates of resynced prims, which are redundant.
      UsdImagingStageSceneIndex._deletePrefix(primPath, this._usdPropertiesToResync)
      UsdImagingStageSceneIndex._deletePrefix(primPath, this._usdPropertiesToUpdate)
    }

    this._usdPrimsToResync = []

    // Optimization: Rather than sending notifications to remove and then
    // re-add the same prim, we first filter the list of removedPrims to
    // remove any that exist in addedPrims. A single PrimsAdded notification
    // is sufficient to "re-sync" an existing prim.
    {
      const addedPaths = new Set(addedPrims.map(entry => entry.primPath))
      const populated = [...this._populatedPaths].sort(_ComparePaths)
      const filteredRemovedPrims: RemovedPrimEntry[] = []
      for (const entry of removedPrims) {
        // A removedPrims entry indicates that every prim prefixed by that
        // entry's primPath will implicitly be removed. Therefore, to elide a
        // removedPrim entry, we require that every populated child prim is
        // in addedPaths.
        const removedPath = entry.primPath
        for (const path of populated) {
          if (!_HasPrefix(path, removedPath)) continue
          if (!addedPaths.has(path)) {
            // This path will be removed, and not re-added, so make an entry
            // for it specifically.
            filteredRemovedPrims.push({ primPath: path })
          }
        }
      }
      removedPrims = filteredRemovedPrims
    }

    // Update population list.
    for (const entry of removedPrims) {
      this._populatedPaths.delete(entry.primPath)
    }
    for (const entry of addedPrims) {
      this._populatedPaths.add(entry.primPath)
    }

    this._sendPrimsRemoved(removedPrims)
    this._sendPrimsAdded(addedPrims)
  }

  /** stageSceneIndex.cpp:876-917. Apply queued stage edits to imaging scene.
   *  If the USD stage is edited while the scene index is pulling from it,
   *  those edits get queued and deferred. Calling ApplyPendingUpdates will
   *  turn resync requests into PrimsAdded/PrimsRemoved, and property changes
   *  into PrimsDirtied. */
  ApplyPendingUpdates(): void {
    if (!this._stage) {
      return
    }

    if (this._usdPropertiesToUpdate.size === 0 &&
        this._usdPropertiesToResync.size === 0 &&
        this._usdPrimsToResync.length === 0) {
      return
    }

    this._applyPendingResyncs()

    // Changed properties...
    const dirtiedPrims: DirtiedPrimEntry[] = []

    this._computeDirtiedEntries(this._usdPropertiesToResync, this._usdPrimsToResync,
      UsdImagingPropertyInvalidationType.Resync, dirtiedPrims)
    this._usdPropertiesToResync = new Map()

    this._computeDirtiedEntries(this._usdPropertiesToUpdate, this._usdPrimsToResync,
      UsdImagingPropertyInvalidationType.Update, dirtiedPrims)
    this._usdPropertiesToUpdate = new Map()

    // Resync any prims whose property invalidation indicated repopulation
    // was necessary
    if (this._usdPrimsToResync.length !== 0) {
      this._applyPendingResyncs()
    }

    if (dirtiedPrims.length !== 0) {
      this._sendPrimsDirtied(dirtiedPrims)
    }
  }

  /** stageSceneIndex.cpp:919-1005 */
  private _computeDirtiedEntries(
    pathToUsdProperties: Map<string, string[]>, primPathsToResync: string[],
    invalidationType: UsdImagingPropertyInvalidationType, dirtiedPrims: DirtiedPrimEntry[],
  ): void {
    const repopulateLocator = new HdDataSourceLocator(UsdImagingTokens.stageSceneIndexRepopulate)

    // std::map iterates in SdfPath order.
    for (const primPath of [...pathToUsdProperties.keys()].sort(_ComparePaths)) {
      const properties = pathToUsdProperties.get(primPath)!

      const prim = this._stage!.getPrim(primPath)
      if (!prim) continue

      const entry = this._adapterManager.lookupAdapters(prim)

      if (entry.primAdapter &&
          entry.primAdapter.getPopulationMode() === UsdImagingPopulationMode.RepresentedByAncestor) {
        const ancestors = this._findResponsibleAncestors(prim)

        for (const [parentPrim, parentAdapter] of ancestors) {
          // Give the parent adapter an opportunity to invalidate each of the
          // subprims it declares itself. API schema adapters do not
          // participate.
          for (const subprim of parentAdapter.getImagingSubprims(parentPrim)) {
            const dirtyLocators = parentAdapter.invalidateImagingSubprimFromDescendent(
              parentPrim, prim, subprim, properties, invalidationType)

            if (!dirtyLocators.IsEmpty()) {
              const path = subprim === '' ? parentPrim.path : _AppendProperty(parentPrim.path, subprim)
              dirtiedPrims.push({ primPath: path, dirtyLocators })
            }
          }
        }
        if (ancestors.length !== 0) {
          // we were handled by an ancestor prim and need not do the below
          // invalidation on our own.
          continue
        }

        // If a responsible ancestor wasn't found, we've likely been
        // populated and should at least get a chance to handle it ourself
        // below.
      }

      const subprims = _GetImagingSubprims(prim, entry.allAdapters)

      for (const subprim of subprims) {
        const dirtyLocators = _InvalidateImagingSubprim(
          entry.allAdapters, prim, subprim, properties, invalidationType)

        if (!dirtyLocators.IsEmpty()) {
          if (dirtyLocators.contains(repopulateLocator)) {
            primPathsToResync.push(primPath)
          } else {
            const subpath = subprim === '' ? primPath : _AppendProperty(primPath, subprim)
            dirtiedPrims.push({ primPath: subpath, dirtyLocators })
          }
        }
      }
    }
  }
}

// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdSkelImaging/pointsResolvingSceneIndex.cpp,
//  pxr/usdImaging/usdSkelImaging/pointsResolvingSceneIndex.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdSkelImaging/pointsResolvingSceneIndex.{h,cpp}
// (OpenUSD 26.11.1).
//
// Divergence: the std::map<SdfPath, ...> members are Maps keyed by path
// string; where upstream iterates them (or a std::map<SdfPath, bool>) in
// SdfPath order, the keys are sorted with SdfPath's operator< first.

import {
  DataSourceLocatorSet as HdDataSourceLocatorSet, OverlayContainerDataSource as HdOverlayContainerDataSource,
  PrimTypeTokens as HdPrimTypeTokens, SceneIndexPrimView as HdSceneIndexPrimView,
  SingleInputFilteringSceneIndexBase as HdSingleInputFilteringSceneIndexBase,
  SiHasPrefix as HdSiHasPrefix,
  type AddedPrimEntry as HdAddedPrimEntry, type DirtiedPrimEntry as HdDirtiedPrimEntry,
  type RemovedPrimEntry as HdRemovedPrimEntry, type SceneIndexBase as HdSceneIndexBase,
  type SceneIndexPrim as HdSceneIndexPrim,
} from 'typescript-usd/hd'
import { TfDiagnosticMgr, TfDiagnosticType, Error as TfError } from 'typescript-usd/tf'
import { UsdSkelImagingBindingSchema } from './bindingSchema.ts'
import { UsdSkelImagingBlendShapeSchema } from './blendShapeSchema.ts'
import { UsdSkelImagingDataSourceResolvedExtComputationPrim } from './dataSourceResolvedExtComputationPrim.ts'
import { UsdSkelImagingDataSourceResolvedPointsBasedPrim } from './dataSourceResolvedPointsBasedPrim.ts'
import { UsdSkelImagingResolvedSkeletonSchema } from './resolvedSkeletonSchema.ts'
import { UsdSkelImagingExtComputationNameTokens, UsdSkelImagingPrimTypeTokens } from './tokens.ts'
import { UsdSkelImagingDataSourceXformResolver } from './xformResolver.ts'

type _DsHandle = UsdSkelImagingDataSourceResolvedPointsBasedPrim

function TF_CODING_ERROR(message: string): void {
  TfDiagnosticMgr.GetInstance().postError(new TfError(message, TfDiagnosticType.CodingError))
}

/** SdfPath operator< (element-wise from the root; a prefix sorts first). */
function _ComparePaths(a: string, b: string): number {
  // Scans the non-empty elements between '/' and '.' in place (it is sorted
  // with): the same order as comparing a.split(/[/.]/) without empty
  // elements, element by element.
  if (a === b) return 0
  const sep = (c: number) => c === 47 /* / */ || c === 46 /* . */
  let i = 0, j = 0
  for (;;) {
    while (i < a.length && sep(a.charCodeAt(i))) i++
    while (j < b.length && sep(b.charCodeAt(j))) j++
    const aEnd = i >= a.length, bEnd = j >= b.length
    if (aEnd || bEnd) return aEnd === bEnd ? 0 : aEnd ? -1 : 1
    let ei = i, ej = j
    while (ei < a.length && !sep(a.charCodeAt(ei))) ei++
    while (ej < b.length && !sep(b.charCodeAt(ej))) ej++
    const n = Math.min(ei - i, ej - j)
    for (let k = 0; k < n; k++) {
      const d = a.charCodeAt(i + k) - b.charCodeAt(j + k)
      if (d !== 0) return d < 0 ? -1 : 1
    }
    if (ei - i !== ej - j) return ei - i < ej - j ? -1 : 1
    i = ei; j = ej
  }
}

/** SdfPath::AppendChild for the string paths of this port. */
function _AppendChild(path: string, name: string): string {
  return path === '/' ? '/' + name : path + '/' + name
}

/** pointsResolvingSceneIndex.cpp:27-35 */
function _IsPointBasedPrim(primType: string): boolean {
  return primType === HdPrimTypeTokens.mesh ||
    primType === HdPrimTypeTokens.basisCurves ||
    primType === HdPrimTypeTokens.points
}

const _empty: ReadonlySet<string> = new Set()

/** pointsResolvingSceneIndex.cpp:37-47 */
function _Lookup(map: Map<string, Set<string>>, key: string): ReadonlySet<string> {
  return map.get(key) ?? _empty
}

/** std::map<SdfPath, bool>::emplace / insert: keeps an existing entry. */
function _Emplace(map: Map<string, boolean>, key: string, value: boolean): void {
  if (!map.has(key)) map.set(key, value)
}

/** pointsResolvingSceneIndex.cpp:503-517 */
function _PopulateFromDependencies(
  dependencies: Map<string, Set<string>>,
  prefix: string,
  primsNeedingRefreshToHasAddedEntry: Map<string, boolean>,
): void {
  for (const key of [...dependencies.keys()].sort(_ComparePaths)) {
    if (!HdSiHasPrefix(key, prefix)) continue
    for (const primPath of [...dependencies.get(key)!].sort(_ComparePaths)) {
      _Emplace(primsNeedingRefreshToHasAddedEntry, primPath, false)
    }
  }
}

/** pointsResolvingSceneIndex.cpp:676-689 */
function _Remove(key: string, value: string, map: Map<string, Set<string>>): void {
  const it = map.get(key)
  if (!it) {
    return
  }
  it.delete(value)
  if (it.size > 0) {
    return
  }
  map.delete(key)
}

function _Insert(map: Map<string, Set<string>>, key: string, value: string): void {
  let set = map.get(key)
  if (!set) map.set(key, set = new Set())
  set.add(value)
}

const _emptyComputationTokens: readonly string[] = []
let _pointsAndNormalsComputationTokens: readonly string[] | undefined
let _pointsComputationTokens: readonly string[] | undefined

let _instancerLocators: HdDataSourceLocatorSet | undefined

/** pointsResolvingSceneIndex.h:20-134. Adds ext computations to skin to
 *  points of a mesh, point, basisCurves prims. It uses the prim from the
 *  input scene, the targeted skelBlendShape's as well as the resolved
 *  skeleton schema from the targeted skeleton.
 *
 *  Thus, this scene index has to run after the
 *  UsdSkelImagingSkeletonResolvingSceneIndex. */
export class UsdSkelImagingPointsResolvingSceneIndex extends HdSingleInputFilteringSceneIndexBase {
  // For each mesh, point, basisCurve in the input scene that has a bound
  // skeleton (even if the prim at the targeted path is not a Skeleton or
  // empty), store the resolved data source.
  //
  // This scene index overlays it with the input data source.
  private readonly _pathToResolvedPrim = new Map<string, _DsHandle>()

  // Path of a skeleton to paths of resolved prim's depending on that
  // skeleton.
  private readonly _skelPathToPrimPaths = new Map<string, Set<string>>()
  // Same for blend shapes.
  private readonly _blendShapePathToPrimPaths = new Map<string, Set<string>>()
  // Instancer to prims that it instances, that are in a prototype with
  // skelBinding:hasSkelRoot and that are posed by a skeleton.
  private readonly _instancerPathToPrimPaths = new Map<string, Set<string>>()

  /** pointsResolvingSceneIndex.cpp:49-56 */
  static new(inputSceneIndex: HdSceneIndexBase): UsdSkelImagingPointsResolvingSceneIndex {
    return new UsdSkelImagingPointsResolvingSceneIndex(inputSceneIndex)
  }

  /** pointsResolvingSceneIndex.cpp:58-68 */
  protected constructor(inputSceneIndex: HdSceneIndexBase) {
    super(inputSceneIndex)

    for (const path of new HdSceneIndexPrimView(inputSceneIndex)) {
      this._addResolvedPrim(path)
    }
  }

  /** pointsResolvingSceneIndex.cpp:70-139 */
  getPrim(primPath: string): HdSceneIndexPrim {
    const prim = this._getInputSceneIndex().getPrim(primPath)

    ///////////////////////////////////////////////////////////////////////
    // Handle points-based prims - adding resolved data source as overlay.
    if (_IsPointBasedPrim(prim.primType)) {
      if (!prim.dataSource) {
        return prim
      }

      const resolved = this._pathToResolvedPrim.get(primPath)
      if (!resolved) {
        return prim
      }
      return {
        primType: prim.primType,
        dataSource: HdOverlayContainerDataSource.new(resolved, prim.dataSource),
      }
    }

    ///////////////////////////////////////////////////////////////////////
    // Return data source for ext computations.
    if (prim.primType !== '') {
      // We do not expect a prim in the input scene for the ext computations
      // we are adding.
      return prim
    }

    if (prim.dataSource) {
      // As above.
      return prim
    }

    if (primPath === '/') {
      // Our ext computation is a child of the skinned prim.
      return prim
    }

    {
      // Use that our ext computation is a child of the skinned prim.
      const slash = primPath.lastIndexOf('/')
      const computationName = primPath.slice(slash + 1)
      const resolvedPrimPath = slash <= 0 ? '/' : primPath.slice(0, slash)

      const resolved = this._pathToResolvedPrim.get(resolvedPrimPath)
      if (!resolved) {
        return prim
      }

      if (!resolved.hasExtComputations()) {
        return prim
      }

      const ds = UsdSkelImagingDataSourceResolvedExtComputationPrim(resolved, computationName)
      if (ds) {
        return { primType: HdPrimTypeTokens.extComputation, dataSource: ds }
      }
    }

    return prim
  }

  /** pointsResolvingSceneIndex.cpp:141-165 */
  getChildPrimPaths(primPath: string): string[] {
    const result = this._getInputSceneIndex().getChildPrimPaths(primPath)

    // Add ext computations if necessary.
    const resolved = this._pathToResolvedPrim.get(primPath)
    if (!resolved) {
      return result
    }
    if (!resolved.hasExtComputations()) {
      return result
    }

    const computationTokens = this._getResolvedPrimComputations(primPath)
    for (const name of computationTokens) {
      result.push(_AppendChild(primPath, name))
    }

    return result
  }

  /** pointsResolvingSceneIndex.cpp:167-217. Helper to reconstruct the data
   *  source stored for a particular prim in _pathToResolvedPrim, update
   *  dependencies in _skelPathToPrimPaths and _blendShapePathToPrimPaths and
   *  fill in dirty notifications.
   *
   *  The input are prim paths with an annotation (stored in a map). If the
   *  annotation is true, we do not fill the dirty notifcation for the prim
   *  itself. */
  private _processPrimsNeedingRefreshAndSendNotices(
    primsNeedingRefreshToHasAddedEntry: Map<string, boolean>,
    addedEntries: HdAddedPrimEntry[] | undefined,
    removedEntries: HdRemovedPrimEntry[] | undefined,
    dirtiedEntries: HdDirtiedPrimEntry[] | undefined,
  ): void {
    for (const primPath of [...primsNeedingRefreshToHasAddedEntry.keys()].sort(_ComparePaths)) {
      const hasAddedEntry = primsNeedingRefreshToHasAddedEntry.get(primPath)!
      const oldComputationTokens = this._getResolvedPrimComputations(primPath)
      const hadExtComputations = oldComputationTokens.length > 0
      const removed = this._removeResolvedPrim(primPath)
      const added = this._addResolvedPrim(primPath)
      const newComputationTokens = this._getResolvedPrimComputations(primPath)
      const hasExtComputations = newComputationTokens.length > 0

      if (dirtiedEntries) {
        if (!hasAddedEntry && (removed || added)) {
          dirtiedEntries.push({ primPath, dirtyLocators: HdDataSourceLocatorSet.UniversalSet })
          if (hasExtComputations) {
            for (const name of newComputationTokens) {
              dirtiedEntries.push({
                primPath: _AppendChild(primPath, name),
                dirtyLocators: HdDataSourceLocatorSet.UniversalSet,
              })
            }
          }
        }
      }
      if (removedEntries) {
        if (hadExtComputations && !hasExtComputations) {
          for (const name of oldComputationTokens) {
            removedEntries.push({ primPath: _AppendChild(primPath, name) })
          }
        }
      }
      if (addedEntries) {
        if (hasExtComputations && !hadExtComputations) {
          for (const name of newComputationTokens) {
            addedEntries.push({
              primPath: _AppendChild(primPath, name),
              primType: HdPrimTypeTokens.extComputation,
            })
          }
        }
      }
    }
  }

  /** pointsResolvingSceneIndex.cpp:219-248 */
  private _getResolvedPrimComputations(primPath: string): readonly string[] {
    const resolved = this._pathToResolvedPrim.get(primPath)
    if (!resolved) {
      return _emptyComputationTokens
    }
    if (!resolved.hasExtComputations()) {
      return _emptyComputationTokens
    }

    const N = UsdSkelImagingExtComputationNameTokens
    if (resolved.hasNormalsExtComputations()) {
      return _pointsAndNormalsComputationTokens ??= [
        N.pointsAggregatorComputation,
        N.pointsComputation,
        N.normalsAggregatorComputation,
        N.normalsComputation,
      ]
    } else {
      return _pointsComputationTokens ??= [
        N.pointsAggregatorComputation,
        N.pointsComputation,
      ]
    }
  }

  /** pointsResolvingSceneIndex.cpp:250-334 */
  protected _primsAdded(_sender: HdSceneIndexBase, entries: HdAddedPrimEntry[]): void {
    const primsNeedingRefreshToHasAddedEntry = new Map<string, boolean>()

    {
      const hasResolvedPrims = this._pathToResolvedPrim.size > 0
      const hasSkelDependencies = this._skelPathToPrimPaths.size > 0
      const hasBlendDependencies = this._blendShapePathToPrimPaths.size > 0
      const hasInstancerDependencies = this._instancerPathToPrimPaths.size > 0

      for (const entry of entries) {
        if (// Need to refresh if this is a new mesh, ...
            _IsPointBasedPrim(entry.primType) ||
            (hasResolvedPrims &&
             // Need to refresh if this is a resync and this used to be a
             // mesh affected by a skeleton and now is a different prim.
             this._pathToResolvedPrim.has(entry.primPath))) {
          primsNeedingRefreshToHasAddedEntry.set(entry.primPath, true)
        }

        if (hasSkelDependencies) {
          for (const primPath of _Lookup(this._skelPathToPrimPaths, entry.primPath)) {
            _Emplace(primsNeedingRefreshToHasAddedEntry, primPath, false)
          }
        }

        if (hasBlendDependencies) {
          for (const primPath of _Lookup(this._blendShapePathToPrimPaths, entry.primPath)) {
            _Emplace(primsNeedingRefreshToHasAddedEntry, primPath, false)
          }
        }

        if (hasInstancerDependencies) {
          for (const primPath of _Lookup(this._instancerPathToPrimPaths, entry.primPath)) {
            _Emplace(primsNeedingRefreshToHasAddedEntry, primPath, false)
          }
        }
      }
    }

    if (primsNeedingRefreshToHasAddedEntry.size === 0) {
      this._sendPrimsAdded(entries)
      return
    }

    const isObserved = this._isObserved()

    const newAddedEntries: HdAddedPrimEntry[] = []
    const newRemovedEntries: HdRemovedPrimEntry[] = []
    const newDirtiedEntries: HdDirtiedPrimEntry[] = []

    this._processPrimsNeedingRefreshAndSendNotices(
      primsNeedingRefreshToHasAddedEntry,
      isObserved ? newAddedEntries : undefined,
      isObserved ? newRemovedEntries : undefined,
      isObserved ? newDirtiedEntries : undefined)

    if (!isObserved) {
      return
    }

    this._sendPrimsRemoved(newRemovedEntries)

    if (newAddedEntries.length === 0) {
      this._sendPrimsAdded(entries)
    } else {
      this._sendPrimsAdded([...entries, ...newAddedEntries])
    }

    this._sendPrimsDirtied(newDirtiedEntries)
  }

  /** pointsResolvingSceneIndex.cpp:336-353. Helper to process dirtied prim
   *  entries. */
  private _processDirtyLocators(
    primPath: string,
    dirtiedPrimType: string,
    dirtyLocators: HdDataSourceLocatorSet,
    entries: HdDirtiedPrimEntry[] | undefined,
  ): boolean {
    const resolved = this._pathToResolvedPrim.get(primPath)
    if (!resolved) {
      return false
    }

    return resolved.processDirtyLocators(dirtiedPrimType, dirtyLocators, entries)
  }

  /** pointsResolvingSceneIndex.cpp:355-501 */
  protected _primsDirtied(_sender: HdSceneIndexBase, entries: HdDirtiedPrimEntry[]): void {
    const isObserved = this._isObserved()

    const newDirtiedEntries: HdDirtiedPrimEntry[] = []

    const newDirtiedEntriesPtr = isObserved ? newDirtiedEntries : undefined

    const primsNeedingRefreshToHasAddedEntry = new Map<string, boolean>()

    {
      const hasResolvedPrims = this._pathToResolvedPrim.size > 0
      const hasSkelDependencies = this._skelPathToPrimPaths.size > 0
      const hasBlendDependencies = this._blendShapePathToPrimPaths.size > 0
      const hasInstancerDependencies = this._instancerPathToPrimPaths.size > 0

      for (const entry of entries) {
        // Note that the dirty entry doesn't give us any type indication.
        //
        // We avoid look-ups in the maps or calls to the input scene by
        // checking for the existence of certain locators in the dirty
        // locators. Assuming that it is cheaper to query the dirty locators
        // first before doing other look-ups to see whether the prim path is
        // relevant.

        // Early bail: if we did not have any prim having a bound skeleton
        // and we do not change whether this prim is bound to a skeleton.
        if (!hasResolvedPrims &&
            !entry.dirtyLocators.intersects(UsdSkelImagingBindingSchema.getSkeletonLocator())) {
          continue
        }

        // This prim could be a mesh, ... affected by a skeleton. Check
        // whether any locators mean we need to do further dirtying or
        // refreshing the resolved data source.
        if (entry.dirtyLocators.intersects(
            UsdSkelImagingDataSourceResolvedPointsBasedPrim.getDependendendOnDataSourceLocators())) {
          if (this._processDirtyLocators(
              entry.primPath,
              /* primType = */ '',
              entry.dirtyLocators,
              newDirtiedEntriesPtr)) {
            _Emplace(primsNeedingRefreshToHasAddedEntry, entry.primPath, false)
          }
        }

        // This prim could be a skeleton affecting a mesh, ...
        if (hasSkelDependencies &&
            entry.dirtyLocators.intersects(UsdSkelImagingResolvedSkeletonSchema.getDefaultLocator())) {
          for (const primPath of _Lookup(this._skelPathToPrimPaths, entry.primPath)) {
            if (this._processDirtyLocators(
                primPath,
                UsdSkelImagingPrimTypeTokens.skeleton,
                entry.dirtyLocators,
                newDirtiedEntriesPtr)) {
              _Emplace(primsNeedingRefreshToHasAddedEntry, primPath, false)
            }
          }
        }

        // This prim could be a blend shape affecting a mesh, ...
        if (hasBlendDependencies &&
            entry.dirtyLocators.intersects(UsdSkelImagingBlendShapeSchema.getDefaultLocator())) {
          for (const primPath of _Lookup(this._blendShapePathToPrimPaths, entry.primPath)) {
            if (this._processDirtyLocators(
                primPath,
                UsdSkelImagingPrimTypeTokens.skelBlendShape,
                entry.dirtyLocators,
                newDirtiedEntriesPtr)) {
              _Emplace(primsNeedingRefreshToHasAddedEntry, primPath, false)
            }
          }
        }

        const instancerLocators = _instancerLocators ??= new HdDataSourceLocatorSet([
          UsdSkelImagingDataSourceXformResolver.getInstancedByLocator(),
          UsdSkelImagingDataSourceXformResolver.getXformLocator(),
          UsdSkelImagingDataSourceXformResolver.getInstanceXformLocator()])

        if (hasInstancerDependencies &&
            entry.dirtyLocators.intersects(instancerLocators)) {
          for (const primPath of _Lookup(this._instancerPathToPrimPaths, entry.primPath)) {
            if (this._processDirtyLocators(
                primPath,
                HdPrimTypeTokens.instancer,
                entry.dirtyLocators,
                newDirtiedEntriesPtr)) {
              _Emplace(primsNeedingRefreshToHasAddedEntry, primPath, false)
            }
          }
        }
      }
    }

    if (primsNeedingRefreshToHasAddedEntry.size > 0) {
      const newAddedEntries: HdAddedPrimEntry[] = []
      const newRemovedEntries: HdRemovedPrimEntry[] = []

      this._processPrimsNeedingRefreshAndSendNotices(
        primsNeedingRefreshToHasAddedEntry,
        isObserved ? newAddedEntries : undefined,
        isObserved ? newRemovedEntries : undefined,
        newDirtiedEntriesPtr)

      if (!isObserved) {
        return
      }

      this._sendPrimsRemoved(newRemovedEntries)
      this._sendPrimsAdded(newAddedEntries)
    }

    if (!isObserved) {
      return
    }

    if (newDirtiedEntries.length === 0) {
      this._sendPrimsDirtied(entries)
    } else {
      this._sendPrimsDirtied([...entries, ...newDirtiedEntries])
    }
  }

  /** pointsResolvingSceneIndex.cpp:519-608 */
  protected _primsRemoved(_sender: HdSceneIndexBase, entries: HdRemovedPrimEntry[]): void {
    // First removed resolved prim data sources.
    if (this._pathToResolvedPrim.size > 0) {
      for (const entry of entries) {
        for (const path of [...this._pathToResolvedPrim.keys()].sort(_ComparePaths)) {
          if (!HdSiHasPrefix(path, entry.primPath)) continue
          this._removeDependenciesForResolvedPrim(path, this._pathToResolvedPrim.get(path))
          this._pathToResolvedPrim.delete(path)
        }
      }
    }

    const hasSkelDependencies = this._skelPathToPrimPaths.size > 0
    const hasBlendDependencies = this._blendShapePathToPrimPaths.size > 0
    const hasInstancerDependencies = this._instancerPathToPrimPaths.size > 0

    if (!hasSkelDependencies && !hasBlendDependencies && !hasInstancerDependencies) {
      this._sendPrimsRemoved(entries)
      return
    }

    const primsNeedingRefreshToHasAddedEntry = new Map<string, boolean>()

    // Then check for the dependencies.
    for (const entry of entries) {
      if (hasSkelDependencies) {
        _PopulateFromDependencies(
          this._skelPathToPrimPaths, entry.primPath, primsNeedingRefreshToHasAddedEntry)
      }
      if (hasBlendDependencies) {
        _PopulateFromDependencies(
          this._blendShapePathToPrimPaths, entry.primPath, primsNeedingRefreshToHasAddedEntry)
      }
      if (hasInstancerDependencies) {
        _PopulateFromDependencies(
          this._instancerPathToPrimPaths, entry.primPath, primsNeedingRefreshToHasAddedEntry)
      }
    }

    if (primsNeedingRefreshToHasAddedEntry.size === 0) {
      this._sendPrimsRemoved(entries)
      return
    }

    const newAddedEntries: HdAddedPrimEntry[] = []
    const newRemovedEntries: HdRemovedPrimEntry[] = []
    const newDirtiedEntries: HdDirtiedPrimEntry[] = []

    const isObserved = this._isObserved()

    this._processPrimsNeedingRefreshAndSendNotices(
      primsNeedingRefreshToHasAddedEntry,
      isObserved ? newAddedEntries : undefined,
      isObserved ? newRemovedEntries : undefined,
      isObserved ? newDirtiedEntries : undefined)

    if (!isObserved) {
      return
    }

    if (newRemovedEntries.length === 0) {
      this._sendPrimsRemoved(entries)
    } else {
      this._sendPrimsRemoved([...entries, ...newRemovedEntries])
    }

    this._sendPrimsAdded(newAddedEntries)
    this._sendPrimsDirtied(newDirtiedEntries)
  }

  /** pointsResolvingSceneIndex.cpp:610-632. Query input scene for prim at
   *  path. If that prim is potentially affected by a skeleton, construct
   *  the resolving data source, store it, update the dependencies. */
  private _addResolvedPrim(path: string): boolean {
    const prim = this._getInputSceneIndex().getPrim(path)
    if (!_IsPointBasedPrim(prim.primType)) {
      return false
    }

    const ds = UsdSkelImagingDataSourceResolvedPointsBasedPrim.new(
      this._getInputSceneIndex(), path, prim.dataSource)
    if (!ds) {
      return false
    }

    this._addDependenciesForResolvedPrim(path, ds)
    this._pathToResolvedPrim.set(path, ds)

    return true
  }

  /** pointsResolvingSceneIndex.cpp:635-658 */
  private _addDependenciesForResolvedPrim(primPath: string, resolvedPrim: _DsHandle): void {
    const skelPath = resolvedPrim.getSkeletonPath()
    if (skelPath !== '') {
      _Insert(this._skelPathToPrimPaths, skelPath, primPath)
    }
    for (const path of resolvedPrim.getBlendShapeTargetPaths()) {
      _Insert(this._blendShapePathToPrimPaths, path, primPath)
    }

    // Can we move this check up for potential performance improvement?
    if (!resolvedPrim.hasExtComputations()) {
      return
    }

    for (const path of resolvedPrim.getInstancerPaths()) {
      _Insert(this._instancerPathToPrimPaths, path, primPath)
    }
  }

  /** pointsResolvingSceneIndex.cpp:660-674. Remove from _pathToResolvedPrim
   *  and dependencies. */
  private _removeResolvedPrim(primPath: string): boolean {
    const resolved = this._pathToResolvedPrim.get(primPath)
    if (!this._pathToResolvedPrim.has(primPath)) {
      return false
    }

    this._removeDependenciesForResolvedPrim(primPath, resolved)
    this._pathToResolvedPrim.delete(primPath)
    return true
  }

  /** pointsResolvingSceneIndex.cpp:691-714 */
  private _removeDependenciesForResolvedPrim(primPath: string, resolvedPrim: _DsHandle | undefined): void {
    if (!resolvedPrim) {
      return
    }

    const skelPath = resolvedPrim.getSkeletonPath()
    if (skelPath !== '') {
      _Remove(skelPath, primPath, this._skelPathToPrimPaths)
    }

    for (const path of resolvedPrim.getBlendShapeTargetPaths()) {
      _Remove(path, primPath, this._blendShapePathToPrimPaths)
    }

    for (const instancerPath of resolvedPrim.getInstancerPaths()) {
      _Remove(instancerPath, primPath, this._instancerPathToPrimPaths)
    }
  }

  /** pointsResolvingSceneIndex.cpp:716-760. Refetch data source from input
   *  scene and refresh resolved data source in _pathToResolvedPrim. This
   *  does not update the dependencies.
   *
   *  Call this if refetching the data source is necessary, but the paths to
   *  the skeleton and blend shapes have not changed. */
  private _refreshResolvedPrimDataSource(
    primPath: string,
    hasExtComputations: { value: boolean } | undefined,
  ): void {
    if (!this._pathToResolvedPrim.get(primPath)) {
      TF_CODING_ERROR(`Expected data source for resolved points based prim at ${primPath}.`)
    }

    const prim = this._getInputSceneIndex().getPrim(primPath)
    if (!_IsPointBasedPrim(prim.primType)) {
      TF_CODING_ERROR(`Expected points based prim at ${primPath}.`)
      this._pathToResolvedPrim.delete(primPath)
      return
    }

    const entry = UsdSkelImagingDataSourceResolvedPointsBasedPrim.new(
      this._getInputSceneIndex(), primPath, prim.dataSource)

    if (!entry) {
      TF_CODING_ERROR(`Expected resolved points based prim at ${primPath}.`)
      this._pathToResolvedPrim.delete(primPath)
      return
    }
    this._pathToResolvedPrim.set(primPath, entry)

    if (hasExtComputations) {
      hasExtComputations.value = entry.hasExtComputations()
    }
  }

  /** pointsResolvingSceneIndex.cpp:762-795. Refetch data source as above -
   *  filling the dirty notications. */
  private _refreshResolvedPrimDataSources(
    primPaths: ReadonlySet<string>,
    entries: HdDirtiedPrimEntry[] | undefined,
    addedResolvedPrimsWithComputations: Set<string> | undefined,
    removedResolvedPrimsWithComputations: Set<string> | undefined,
  ): void {
    for (const primPath of [...primPaths].sort(_ComparePaths)) {
      const hasExtComputations = { value: false }
      this._refreshResolvedPrimDataSource(primPath, hasExtComputations)
      if (entries) {
        entries.push({ primPath, dirtyLocators: HdDataSourceLocatorSet.UniversalSet })
      }
      if (hasExtComputations.value) {
        addedResolvedPrimsWithComputations?.add(primPath)
        removedResolvedPrimsWithComputations?.delete(primPath)
      } else {
        addedResolvedPrimsWithComputations?.delete(primPath)
        removedResolvedPrimsWithComputations?.add(primPath)
      }
    }
  }
}

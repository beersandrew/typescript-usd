// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdSkelImaging/skeletonResolvingSceneIndex.cpp,
//  pxr/usdImaging/usdSkelImaging/skeletonResolvingSceneIndex.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdSkelImaging/skeletonResolvingSceneIndex.{h,cpp}
// (OpenUSD 26.11.1).
//
// Divergence: std::map<SdfPath, ...> / SdfPathSet are a Map / Set keyed by
// path strings; the ordered lower_bound/HasPrefix walks over them
// (skeletonResolvingSceneIndex.cpp:312-324, 345-353) iterate the whole map
// and test the prefix, visiting the same entries.

import {
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  OverlayContainerDataSource as HdOverlayContainerDataSource,
  PrimTypeTokens as HdPrimTypeTokens,
  SceneIndexPrimView as HdSceneIndexPrimView,
  SingleInputFilteringSceneIndexBase as HdSingleInputFilteringSceneIndexBase,
  SiHasPrefix as HdSiHasPrefix,
  type AddedPrimEntry, type DirtiedPrimEntry, type RemovedPrimEntry,
  type SceneIndexBase as HdSceneIndexBase, type SceneIndexPrim as HdSceneIndexPrim,
} from 'typescript-usd/hd'
import { UsdSkelImagingAnimationSchema } from './animationSchema.ts'
import { UsdSkelImagingDataSourceResolvedSkeletonPrim } from './dataSourceResolvedSkeletonPrim.ts'
import { TF_CODING_ERROR } from './tfDiagnostic.ts'
import { UsdSkelImagingPrimTypeTokens } from './tokens.ts'
import { UsdSkelImagingDataSourceXformResolver } from './xformResolver.ts'

type _DsHandle = UsdSkelImagingDataSourceResolvedSkeletonPrim

const _empty: ReadonlySet<string> = new Set()

/** skeletonResolvingSceneIndex.cpp:22-32 */
function _Lookup(map: Map<string, Set<string>>, key: string): ReadonlySet<string> {
  return map.get(key) ?? _empty
}

/** skeletonResolvingSceneIndex.cpp:312-324 */
function _PopulateFromDependencies(
  dependencies: Map<string, Set<string>>,
  prefix: string,
  primPaths: Set<string>,
): void {
  for (const [path, paths] of dependencies) {
    if (HdSiHasPrefix(path, prefix)) {
      for (const p of paths) primPaths.add(p)
    }
  }
}

/** skeletonResolvingSceneIndex.cpp:463-476 */
function _Remove(key: string, value: string, map: Map<string, Set<string>>): void {
  const set = map.get(key)
  if (!set) {
    return
  }
  set.delete(value)
  if (set.size > 0) {
    return
  }
  map.delete(key)
}

/** std::set<SdfPath> iteration order. */
function _Sorted(paths: Iterable<string>): string[] {
  return [...paths].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

let _instancerLocators: HdDataSourceLocatorSet | undefined

/** skeletonResolvingSceneIndex.h:18-100. For each skeleton prim in the input
 *  scene index, populate the UsdSkelImagingResolvedSkeletonSchema. It also
 *  changes the prim type to mesh and populates the necessary data for the
 *  mesh to serve as guide. */
export class UsdSkelImagingSkeletonResolvingSceneIndex extends HdSingleInputFilteringSceneIndexBase {
  // For each skeleton in input scene, the resolved data source.
  // The scene index overlays it with the input data source.
  private readonly _pathToResolvedSkeleton = new Map<string, _DsHandle>()
  // Prims targeted as animation by skeletons to skeletons.
  private readonly _skelAnimPathToSkeletonPaths = new Map<string, Set<string>>()
  // Instancer to skeletons it instances that are in a prototype
  // with skelBinding:hasSkelRoot.
  private readonly _instancerPathToSkeletonPaths = new Map<string, Set<string>>()

  /** skeletonResolvingSceneIndex.cpp:34-41 */
  static new(inputSceneIndex: HdSceneIndexBase): UsdSkelImagingSkeletonResolvingSceneIndex {
    return new UsdSkelImagingSkeletonResolvingSceneIndex(inputSceneIndex)
  }

  /** skeletonResolvingSceneIndex.cpp:43-53 */
  protected constructor(inputSceneIndex: HdSceneIndexBase) {
    super(inputSceneIndex)
    for (const path of new HdSceneIndexPrimView(inputSceneIndex)) {
      this._addResolvedSkeleton(path)
    }
  }

  /** skeletonResolvingSceneIndex.cpp:55-79 */
  getPrim(primPath: string): HdSceneIndexPrim {
    const prim = this._getInputSceneIndex().getPrim(primPath)

    if (prim.primType !== UsdSkelImagingPrimTypeTokens.skeleton) {
      return prim
    }

    if (!prim.dataSource) {
      return prim
    }

    const ds = this._pathToResolvedSkeleton.get(primPath)
    if (!ds) {
      return prim
    }

    return {
      primType: HdPrimTypeTokens.mesh,
      dataSource: HdOverlayContainerDataSource.new(ds, prim.dataSource),
    }
  }

  /** skeletonResolvingSceneIndex.cpp:81-86 */
  getChildPrimPaths(primPath: string): string[] {
    return this._getInputSceneIndex().getChildPrimPaths(primPath)
  }

  /** skeletonResolvingSceneIndex.cpp:88-189 */
  protected _primsAdded(_sender: HdSceneIndexBase, entries: AddedPrimEntry[]): void {
    const isObserved = this._isObserved()

    let hasSkeletons = this._pathToResolvedSkeleton.size > 0

    const skelsJustAdded = new Set<string>()

    // Indices into entries which need to be changed from skeleton to mesh.
    const entriesIndices: number[] = []

    {
      const n = entries.length

      for (let i = 0; i < n; ++i) {
        const entry = entries[i]!
        if (hasSkeletons) {
          // There might have already been a skeleton here already.
          this._removeResolvedSkeleton(entry.primPath)
        }

        if (entry.primType !== UsdSkelImagingPrimTypeTokens.skeleton) {
          continue
        }

        if (!this._addResolvedSkeleton(entry.primPath)) {
          continue
        }

        entriesIndices.push(i)
        hasSkeletons = true
        skelsJustAdded.add(entry.primPath)
      }
    }

    const newDirtiedEntries: DirtiedPrimEntry[] = []

    const hasSkelAnimDependencies = this._skelAnimPathToSkeletonPaths.size > 0
    const hasInstancerDependencies = this._instancerPathToSkeletonPaths.size > 0

    if (hasSkelAnimDependencies || hasInstancerDependencies) {
      const skelPathsNeedingRefresh = new Set<string>()

      for (const entry of entries) {
        if (hasSkelAnimDependencies) {
          // Schedule resync for each skeleton whose animation
          // relationship points to prim added here.
          for (const primPath of _Lookup(this._skelAnimPathToSkeletonPaths, entry.primPath)) {
            if (skelsJustAdded.has(primPath)) {
              continue
            }
            skelPathsNeedingRefresh.add(primPath)
          }
        }
        if (hasInstancerDependencies) {
          // Schedule resync for each skeleton that is affected by an
          // instancer that gets added/resync'ed here.
          for (const primPath of _Lookup(this._instancerPathToSkeletonPaths, entry.primPath)) {
            if (skelsJustAdded.has(primPath)) {
              continue
            }
            skelPathsNeedingRefresh.add(primPath)
          }
        }
      }
      for (const skelPath of _Sorted(skelPathsNeedingRefresh)) {
        if (isObserved) {
          newDirtiedEntries.push(
            { primPath: skelPath, dirtyLocators: HdDataSourceLocatorSet.UniversalSet })
        }
        this._refreshResolvedSkeletonDataSource(skelPath)
      }
    }

    if (!isObserved) {
      return
    }

    if (entriesIndices.length === 0) {
      this._sendPrimsAdded(entries)
    } else {
      const newEntries = entries.map(entry => ({ ...entry }))
      for (const index of entriesIndices) {
        newEntries[index]!.primType = HdPrimTypeTokens.mesh
      }
      this._sendPrimsAdded(newEntries)
    }
    if (newDirtiedEntries.length > 0) {
      this._sendPrimsDirtied(newDirtiedEntries)
    }
  }

  /** skeletonResolvingSceneIndex.cpp:191-216. Helper to process dirtied prim
   *  entries. */
  private _processDirtyLocators(
    skelPath: string,
    dirtiedPrimType: string,
    dirtyLocators: HdDataSourceLocatorSet,
    entries: DirtiedPrimEntry[] | undefined,
  ): void {
    const ds = this._pathToResolvedSkeleton.get(skelPath)
    if (!ds) {
      return
    }

    if (!ds.processDirtyLocators(dirtiedPrimType, dirtyLocators, entries)) {
      return
    }

    // Need resync - including dependencies.
    this._removeResolvedSkeleton(skelPath)
    this._addResolvedSkeleton(skelPath)
    if (entries) {
      entries.push({ primPath: skelPath, dirtyLocators: HdDataSourceLocatorSet.UniversalSet })
    }
  }

  /** skeletonResolvingSceneIndex.cpp:218-310 */
  protected _primsDirtied(_sender: HdSceneIndexBase, entries: DirtiedPrimEntry[]): void {
    if (this._pathToResolvedSkeleton.size === 0) {
      this._sendPrimsDirtied(entries)
      return
    }

    const isObserved = this._isObserved()

    const newDirtiedEntries: DirtiedPrimEntry[] = []
    const newDirtiedEntriesPtr = isObserved ? newDirtiedEntries : undefined

    {
      const hasAnimDependencies = this._skelAnimPathToSkeletonPaths.size > 0
      const hasInstancerDependencies = this._instancerPathToSkeletonPaths.size > 0

      const instancerLocators = _instancerLocators ??= new HdDataSourceLocatorSet([
        UsdSkelImagingDataSourceXformResolver.getInstancedByLocator(),
        UsdSkelImagingDataSourceXformResolver.getXformLocator(),
        UsdSkelImagingDataSourceXformResolver.getInstanceXformLocator(),
        UsdSkelImagingDataSourceXformResolver.getInstanceAnimationSourceLocator(),
      ])

      for (const entry of entries) {
        if (entry.dirtyLocators.intersects(
          UsdSkelImagingDataSourceResolvedSkeletonPrim.getDependendendOnDataSourceLocators())) {
          this._processDirtyLocators(
            entry.primPath,
            UsdSkelImagingPrimTypeTokens.skeleton,
            entry.dirtyLocators,
            newDirtiedEntriesPtr)
        }

        if (hasAnimDependencies && entry.dirtyLocators.intersects(
          UsdSkelImagingAnimationSchema.getDefaultLocator())) {
          // Make a copy since _ProcessDirtyLocators can modify
          // _skelAnimPathToSkeletonPaths.
          const skelPaths = _Sorted(_Lookup(this._skelAnimPathToSkeletonPaths, entry.primPath))
          for (const skelPath of skelPaths) {
            this._processDirtyLocators(
              skelPath,
              UsdSkelImagingPrimTypeTokens.skelAnimation,
              entry.dirtyLocators,
              newDirtiedEntriesPtr)
          }
        }

        if (hasInstancerDependencies &&
            entry.dirtyLocators.intersects(instancerLocators)) {
          // Make a copy since _ProcessDirtyLocators can modify
          // _instancerPathToSkeletonPaths.
          const skelPaths = _Sorted(_Lookup(this._instancerPathToSkeletonPaths, entry.primPath))
          for (const skelPath of skelPaths) {
            this._processDirtyLocators(
              skelPath,
              HdPrimTypeTokens.instancer,
              entry.dirtyLocators,
              newDirtiedEntriesPtr)
          }
        }
      }
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

  /** skeletonResolvingSceneIndex.cpp:326-401 */
  protected _primsRemoved(_sender: HdSceneIndexBase, entries: RemovedPrimEntry[]): void {
    const isObserved = this._isObserved()

    if (this._pathToResolvedSkeleton.size === 0) {
      this._sendPrimsRemoved(entries)
      return
    }

    // First process the skeleton's.
    //
    for (const entry of entries) {
      // Deleting by prefix - can't use existing _RemoveResolvedSkeleton.
      for (const path of _Sorted(this._pathToResolvedSkeleton.keys())) {
        if (!HdSiHasPrefix(path, entry.primPath)) {
          continue
        }
        this._removeDependenciesForResolvedSkeleton(path, this._pathToResolvedSkeleton.get(path))
        this._pathToResolvedSkeleton.delete(path)
      }
    }

    const newDirtiedEntries: DirtiedPrimEntry[] = []

    const hasSkelAnimationDependencies = this._skelAnimPathToSkeletonPaths.size > 0
    const hasInstancerDependencies = this._instancerPathToSkeletonPaths.size > 0

    if (hasSkelAnimationDependencies || hasInstancerDependencies) {
      const skelPathsNeedingRefresh = new Set<string>()

      // Then dependencies of the skeleton's.
      //
      // Note that the above loop already deleted the dependencies of a
      // skeleton that was just removed.
      //
      for (const entry of entries) {
        if (hasSkelAnimationDependencies) {
          _PopulateFromDependencies(
            this._skelAnimPathToSkeletonPaths, entry.primPath,
            skelPathsNeedingRefresh)
        }
        if (hasInstancerDependencies) {
          _PopulateFromDependencies(
            this._instancerPathToSkeletonPaths, entry.primPath,
            skelPathsNeedingRefresh)
        }
      }

      for (const skelPath of _Sorted(skelPathsNeedingRefresh)) {
        this._refreshResolvedSkeletonDataSource(skelPath)
        if (isObserved) {
          newDirtiedEntries.push(
            { primPath: skelPath, dirtyLocators: HdDataSourceLocatorSet.UniversalSet })
        }
      }
    }

    if (!isObserved) {
      return
    }

    this._sendPrimsRemoved(entries)
    if (newDirtiedEntries.length > 0) {
      this._sendPrimsDirtied(newDirtiedEntries)
    }
  }

  /** skeletonResolvingSceneIndex.cpp:403-426. See whether prim at path is a
   *  skeleton. If yes, add the resolved skeleton data source to internal
   *  data structures including its dependencies - and return true. */
  private _addResolvedSkeleton(path: string): boolean {
    const prim = this._getInputSceneIndex().getPrim(path)
    if (!prim.dataSource) {
      return false
    }
    if (prim.primType !== UsdSkelImagingPrimTypeTokens.skeleton) {
      return false
    }

    const ds = UsdSkelImagingDataSourceResolvedSkeletonPrim.new(
      this._getInputSceneIndex(), path, prim.dataSource)

    this._addDependenciesForResolvedSkeleton(path, ds)

    this._pathToResolvedSkeleton.set(path, ds)

    return true
  }

  /** skeletonResolvingSceneIndex.cpp:428-446. Add dependencies for skeleton
   *  at given path with given data source. */
  private _addDependenciesForResolvedSkeleton(skeletonPath: string, resolvedSkeleton: _DsHandle): void {
    for (const animSource of resolvedSkeleton.getAnimationSource()) {
      if (animSource !== '') {
        // Note that we add the dependency even if there is no prim at
        // animationSource or the prim is not a skelAnimation.
        let set = this._skelAnimPathToSkeletonPaths.get(animSource)
        if (!set) this._skelAnimPathToSkeletonPaths.set(animSource, set = new Set())
        set.add(skeletonPath)
      }
    }

    for (const instancerPath of resolvedSkeleton.getInstancerPaths()) {
      let set = this._instancerPathToSkeletonPaths.get(instancerPath)
      if (!set) this._instancerPathToSkeletonPaths.set(instancerPath, set = new Set())
      set.add(skeletonPath)
    }
  }

  /** skeletonResolvingSceneIndex.cpp:448-461. See whether there was a
   *  skeleton registered at given path. If yes, remove it including its
   *  dependencies - and return true. */
  private _removeResolvedSkeleton(path: string): boolean {
    const ds = this._pathToResolvedSkeleton.get(path)
    if (!ds) {
      return false
    }
    this._removeDependenciesForResolvedSkeleton(path, ds)
    this._pathToResolvedSkeleton.delete(path)
    return true
  }

  /** skeletonResolvingSceneIndex.cpp:478-499. Remove dependencies. */
  private _removeDependenciesForResolvedSkeleton(
    skeletonPath: string,
    resolvedSkeleton: _DsHandle | undefined,
  ): void {
    if (!resolvedSkeleton) {
      return
    }

    for (const animSource of resolvedSkeleton.getAnimationSource()) {
      if (animSource !== '') {
        _Remove(animSource, skeletonPath, this._skelAnimPathToSkeletonPaths)
      }
    }

    for (const instancerPath of resolvedSkeleton.getInstancerPaths()) {
      _Remove(instancerPath, skeletonPath, this._instancerPathToSkeletonPaths)
    }
  }

  /** skeletonResolvingSceneIndex.cpp:501-544. Refreshes data source without
   *  updating dependencies.
   *
   *  Note that this repulls the data sources from the dependencies but does
   *  not update the paths we depend on. */
  private _refreshResolvedSkeletonDataSource(skeletonPath: string): void {
    const entry = this._pathToResolvedSkeleton.get(skeletonPath)

    if (!entry) {
      TF_CODING_ERROR(
        `Expected data source for resolved skeleton at ${skeletonPath}.`)
    }

    this._removeDependenciesForResolvedSkeleton(skeletonPath, entry)

    const prim = this._getInputSceneIndex().getPrim(skeletonPath)
    if (prim.primType !== UsdSkelImagingPrimTypeTokens.skeleton) {
      TF_CODING_ERROR(`Expected skeleton prim at ${skeletonPath}.`)
      this._pathToResolvedSkeleton.delete(skeletonPath)
      return
    }
    if (!prim.dataSource) {
      TF_CODING_ERROR(`Expected data source for prim at ${skeletonPath}.`)
      this._pathToResolvedSkeleton.delete(skeletonPath)
      return
    }

    const newEntry = UsdSkelImagingDataSourceResolvedSkeletonPrim.new(
      this._getInputSceneIndex(), skeletonPath, prim.dataSource)
    this._pathToResolvedSkeleton.set(skeletonPath, newEntry)

    this._addDependenciesForResolvedSkeleton(skeletonPath, newEntry)
  }
}

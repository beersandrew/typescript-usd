// Ported from OpenUSD 26.11.1: pxr/imaging/hd/flatteningSceneIndex.cpp,
//  pxr/imaging/hd/flatteningSceneIndex.h
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/flatteningSceneIndex.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences (no threads in JavaScript):
// - tbb::concurrent_hash_map _recentPrims is a Map; WorkParallelForN loops
//   run serially; atomic data source handles are plain fields.
// - WorkSwapDestroyAsync(prim.dataSource) clears the cached data source of
//   the SdfPathTable entry in place.
// - SdfPathTable iteration with GetNextSubtree() is emulated over the
//   depth-first subtree list returned by SdfPathTable.findSubtreeRange.
// Not ported: TRACE_* and TfAutoMallocTag instrumentation.

import { SdfPath } from 'typescript-usd/sdf/path'
import { PathTable as SdfPathTable } from 'typescript-usd/sdf'
import {
  HdContainerDataSource,
  HdSampledDataSource,
  type HdDataSourceBase,
} from './dataSource.ts'
import {
  HdDataSourceLocator,
  HdDataSourceLocatorSentinelTokens,
  HdDataSourceLocatorSet,
} from './dataSourceLocator.ts'
import { HdSingleInputFilteringSceneIndexBase } from './filteringSceneIndex.ts'
import { HdFlattenedDataSourceProvider } from './flattenedDataSourceProvider.ts'
import { HdInvalidatableContainerDataSource } from './invalidatableContainerDataSource.ts'
import type {
  AddedPrimEntry,
  DirtiedPrimEntry,
  HdSceneIndexBase,
  HdSceneIndexPrim,
  RemovedPrimEntry,
} from './sceneIndex.ts'

type _DataSourceLocatorSetVector = HdDataSourceLocatorSet[]

/**
 * flatteningSceneIndex.cpp:21-87. A cache for HdContainerDataSourceHandle that
 * has suitable semantics for flattened data sources which are stateful and can
 * be invalidated rather than dropped.
 *
 * In particular, the scene index should return the same instance of the
 * flattened data source when queried for the same prim and locator multiple
 * times. If we were to return different instances for different queries, we
 * would need to invalidate all of those instances since a client can
 * potentially hold on to any of them.
 *
 * (TS: "cached but null" is { ds: undefined } rather than a non-container
 * sentinel data source.)
 */
class _ContainerDataSourceCache {
  private _ds: { ds: HdContainerDataSource | undefined } | undefined

  constructor(ds?: HdContainerDataSource | undefined, cached = false) {
    if (cached) this._ds = { ds }
  }

  /** Returns cached result or undefined (nullopt) if not cached. */
  Get(): { ds: HdContainerDataSource | undefined } | undefined {
    return this._ds
  }

  Cache(ds: HdContainerDataSource | undefined): HdContainerDataSource | undefined {
    if (this._ds) return this._ds.ds
    this._ds = { ds }
    return ds
  }

  invalidate(): void {
    this._ds = undefined
  }
}

/** _Insert, flatteningSceneIndex.cpp:205-237: appends the tokens of vec that
 *  are not already in result. (The bit-mask / hash-set split upstream is a
 *  performance detail; the resulting order is the same.) */
function _Insert(vec: readonly string[], result: string[]): void {
  const s = new Set(result)
  for (const t of vec) {
    if (!s.has(t)) result.push(t)
  }
}

/**
 * flatteningSceneIndex.cpp:89-148. Wraps the input scene's prim-level data
 * sources in order to deliver overriden value.
 */
class _PrimLevelWrappingDataSource extends HdContainerDataSource {
  private readonly _primType: string
  private readonly _primSourceCache: _ContainerDataSourceCache
  // Parallel to HdFlatteningSceneIndex::GetFlattenedDataSourceNames()
  private readonly _computedDataSources: _ContainerDataSourceCache[]

  private constructor(
    private readonly _flatteningSceneIndex: HdFlatteningSceneIndex,
    private readonly _primPath: string,
    inputPrim: HdSceneIndexPrim,
  ) {
    super()
    this._primType = inputPrim.primType
    this._primSourceCache = new _ContainerDataSourceCache(inputPrim.dataSource, true)
    this._computedDataSources = _flatteningSceneIndex.getFlattenedDataSourceNames()
      .map(() => new _ContainerDataSourceCache())
  }

  static new(flatteningSceneIndex: HdFlatteningSceneIndex, primPath: string,
    inputPrim: HdSceneIndexPrim): _PrimLevelWrappingDataSource {
    return new _PrimLevelWrappingDataSource(flatteningSceneIndex, primPath, inputPrim)
  }

  /**
   * flatteningSceneIndex.cpp:152-190. Invalidate data sources for prim.
   *
   * The dirtied locators are given by going along
   * HdFlatteningSceneIndex::GetFlattenedDataSourceNames() and
   * relativeDirtyLocators in parallel and prepending the
   * name to the locators in the set.
   *
   * Recall that this prim stores a flattened data source for
   * each name in HdFlatteningSceneIndex::GetFlattenedDataSourceNames().
   *
   * If the corresponding set in relativeDirtyLocators is empty,
   * that flattened data source is untouched.
   * If it is the universal set, the flattened data source gets
   * dropped.
   * If the flattened data source supports invalidation, invalidation
   * is applied. Otherwise, the data source gets dropped.
   *
   * Returns true if any flattened data source was dropped or
   * invalidated.
   */
  primDirtied(relativeDirtyLocators: _DataSourceLocatorSetVector): boolean {
    let anyDirtied = false

    for (let i = 0; i < relativeDirtyLocators.length; i++) {
      if (relativeDirtyLocators[i]!.IsEmpty()) {
        continue
      }

      const dsCache = this._computedDataSources[i]!
      const ds = dsCache.Get()
      if (!ds) {
        continue
      }
      if (!relativeDirtyLocators[i]!.contains(HdDataSourceLocator.EmptyLocator)) {
        if (ds.ds instanceof HdInvalidatableContainerDataSource) {
          anyDirtied = ds.ds.invalidate(relativeDirtyLocators[i]!) || anyDirtied
          continue
        }
      }

      dsCache.invalidate()
      anyDirtied = true
    }

    return anyDirtied
  }

  /** flatteningSceneIndex.cpp:192-196 */
  primContainerDirtied(): void {
    this._primSourceCache.invalidate()
  }

  /** flatteningSceneIndex.cpp:239-252 */
  getNames(): string[] {
    const primSource = this._getPrimSource()

    if (!primSource) {
      return [...this._flatteningSceneIndex.getFlattenedDataSourceNames()]
    }

    const result = [...primSource.getNames()]
    _Insert(this._flatteningSceneIndex.getFlattenedDataSourceNames(), result)
    return result
  }

  /** flatteningSceneIndex.cpp:254-293 */
  Get(name: string): HdDataSourceBase | undefined {
    const dataSourceNames = this._flatteningSceneIndex.getFlattenedDataSourceNames()
    const providers = this._flatteningSceneIndex.getFlattenedDataSourceProviders()

    for (let i = 0; i < dataSourceNames.length; i++) {
      if (name !== dataSourceNames[i]) {
        continue
      }

      const dsCache = this._computedDataSources[i]!
      const ds = dsCache.Get()
      if (ds) {
        return ds.ds
      }

      const ctx = new HdFlattenedDataSourceProvider.Context(
        this._flatteningSceneIndex,
        this._primPath,
        name,
        { primType: this._primType, dataSource: this._getPrimSource() })
      return dsCache.Cache(providers[i]!.getFlattenedDataSource(ctx))
    }

    const primSource = this._getPrimSource()
    if (primSource) {
      return primSource.Get(name)
    }
    return undefined
  }

  /** flatteningSceneIndex.cpp:295-310 */
  private _getPrimSource(): HdContainerDataSource | undefined {
    const primSource = this._primSourceCache.Get()
    if (primSource) {
      return primSource.ds
    }

    // friend access: HdFlatteningSceneIndex::_GetInputSceneIndex
    const prim = this._flatteningSceneIndex['_getInputSceneIndex']().getPrim(this._primPath)
    return this._primSourceCache.Cache(prim.dataSource)
  }
}

/**
 * flatteningSceneIndex.h:44-164, flatteningSceneIndex.cpp:314-622.
 *
 * A scene index that observes an input scene index and produces a comparable
 * scene in which inherited state is represented at leaf prims.
 *
 * This kind of representation is useful for render delegates that
 * require some/all the information to be available at the leaf prims.
 * It is also useful to express scene description composition functionality
 * (e.g., material binding resolution that factors inherited opinions) via
 * flattened data source provider(s).
 */
export class HdFlatteningSceneIndex extends HdSingleInputFilteringSceneIndexBase {
  // _dataSourceNames and _dataSourceProviders run in parallel
  // and indicate that a data source at locator name in a prim data
  // source gets flattened by provider.
  private readonly _dataSourceNames: string[] = []
  private readonly _dataSourceProviders: HdFlattenedDataSourceProvider[] = []

  // Stores all data source names - convenient to quickly send out
  // dirty messages for ancestors of resynced prims.
  private readonly _dataSourceLocatorSet = new HdDataSourceLocatorSet()
  // Stores universal set for each name in data source names - convenient
  // to quickly invalidate all relevant data sourced of ancestors of
  // resynced prim.
  private readonly _relativeDataSourceLocators: _DataSourceLocatorSetVector = []

  private _prims = new SdfPathTable<HdSceneIndexPrim | undefined>(undefined)
  private readonly _recentPrims = new Map<string, HdSceneIndexPrim>()

  /**
   * Creates a new flattening scene index.
   * inputArgs maps names to HdFlattenedDataSourceProviderSharedPtr's.
   * That provider flattens the data sources under the locator name
   * in each prim source.
   */
  static new(inputScene: HdSceneIndexBase,
    inputArgs: HdContainerDataSource | undefined): HdFlatteningSceneIndex {
    return new HdFlatteningSceneIndex(inputScene, inputArgs)
  }

  /** flatteningSceneIndex.cpp:316-344 */
  protected constructor(inputScene: HdSceneIndexBase,
    inputArgs: HdContainerDataSource | undefined) {
    super(inputScene)
    if (!inputArgs) {
      return
    }
    for (const name of inputArgs.getNames()) {
      const ds = inputArgs.Get(name)
      if (!(ds instanceof HdSampledDataSource)) {
        continue
      }
      const provider = ds.GetValue(0.0)
      if (!(provider instanceof HdFlattenedDataSourceProvider)) {
        continue
      }
      this._dataSourceNames.push(name)
      this._dataSourceProviders.push(provider)
      this._dataSourceLocatorSet.insert(new HdDataSourceLocator(name))
      this._relativeDataSourceLocators.push(HdDataSourceLocatorSet.UniversalSet)
    }
  }

  /** Data sources under locator name in a prim source get flattened. */
  getFlattenedDataSourceNames(): readonly string[] {
    return this._dataSourceNames
  }

  /** Providers in the same order as GetFlattenedDataSourceNames. */
  getFlattenedDataSourceProviders(): readonly HdFlattenedDataSourceProvider[] {
    return this._dataSourceProviders
  }

  /** flatteningSceneIndex.cpp:348-394 */
  getPrim(primPath: string): HdSceneIndexPrim {
    const sdfPath = SdfPath.fromString(primPath)
    // Check the hierarchy cache
    const found = this._prims.find(sdfPath)
    const inTable = found !== undefined
    const cached = found?.value
    // SdfPathTable will default-construct entries for ancestors
    // as needed to represent hierarchy, so double-check the
    // dataSource to confirm presence of a cached prim
    if (cached && cached.dataSource) {
      return cached
    }

    // Check the recent prims cache
    const recent = this._recentPrims.get(primPath)
    if (recent) {
      return recent
    }

    // No cache entry found; query input scene
    const inputPrim = this._getInputSceneIndex().getPrim(primPath)

    // If the input scene does not provide a data source, and there
    // are no descendant prims either (as implied by the lack of a
    // SdfPathTable entry in _prims), do not return anything.
    if (!inputPrim.dataSource && !inTable) {
      return inputPrim
    }

    // Wrap the input datasource even when null, to support dirtying
    // down non-contiguous hierarchy
    const prim: HdSceneIndexPrim = {
      primType: inputPrim.primType,
      dataSource: _PrimLevelWrappingDataSource.new(this, primPath, inputPrim),
    }

    // Store in the recent prims cache
    this._recentPrims.set(primPath, prim)
    return prim
  }

  /** flatteningSceneIndex.cpp:396-401 */
  getChildPrimPaths(primPath: string): string[] {
    // we don't change topology so we can dispatch to input
    return this._getInputSceneIndex().getChildPrimPaths(primPath)
  }

  /** flatteningSceneIndex.cpp:403-447 */
  protected _primsAdded(_sender: HdSceneIndexBase, entries: AddedPrimEntry[]): void {
    this._consolidateRecentPrims()

    const dirtyEntries: DirtiedPrimEntry[] = []
    // Check the hierarchy for cached prims to dirty
    for (const entry of entries) {
      this._dirtyHierarchy(
        entry.primPath,
        this._relativeDataSourceLocators,
        this._dataSourceLocatorSet,
        dirtyEntries)
    }

    // Clear out any cached dataSources for prims that have been re-added.
    // They will get updated dataSources in the next call to GetPrim().
    for (const entry of entries) {
      const sdfPath = SdfPath.fromString(entry.primPath)
      const prim = this._prims.get(sdfPath)
      if (prim) {
        this._prims.set(sdfPath, { primType: prim.primType, dataSource: undefined })
      }
    }

    this._sendPrimsAdded(entries)
    if (dirtyEntries.length > 0) {
      this._sendPrimsDirtied(dirtyEntries)
    }
  }

  /** flatteningSceneIndex.cpp:449-476 */
  protected _primsRemoved(_sender: HdSceneIndexBase, entries: RemovedPrimEntry[]): void {
    this._consolidateRecentPrims()

    for (const entry of entries) {
      if (entry.primPath === '/') {
        // Special case removing the whole scene, since this is a common
        // shutdown operation.
        this._prims.clearInParallel()
      } else {
        this._prims.erase(SdfPath.fromString(entry.primPath))
      }
    }
    this._sendPrimsRemoved(entries)
  }

  /** flatteningSceneIndex.cpp:478-556 */
  private _primDirtied(entry: DirtiedPrimEntry, additionalDirty: DirtiedPrimEntry[]): void {
    // Used to invalidate the data sources stored in the
    // _PrimLevelWrappingDataSource.
    const relativeDirtyLocators: _DataSourceLocatorSetVector =
      this._dataSourceNames.map(() => new HdDataSourceLocatorSet())

    // Used to send out DirtiedPrimEntry for descendants.
    // Computed from relativeDirtyLocators.
    const dirtyLocators = new HdDataSourceLocatorSet()

    for (let i = 0; i < this._dataSourceNames.length; i++) {
      // Check data source at locator in prim data source.
      const locator = new HdDataSourceLocator(this._dataSourceNames[i]!)
      if (!entry.dirtyLocators.intersects(locator)) {
        // Nothing to do.
        continue
      }

      if (entry.dirtyLocators.contains(locator)) {
        // Nuke the entire data source at locator.
        relativeDirtyLocators[i] = HdDataSourceLocatorSet.UniversalSet
        dirtyLocators.insert(locator)
        continue
      }
      let relativeDirtyLocatorSet = relativeDirtyLocators[i]!
      // Make intersection relation to locator.
      for (const dirtyLocator of entry.dirtyLocators.intersection(locator)) {
        relativeDirtyLocatorSet.insert(dirtyLocator.removeFirstElement())
      }
      // Let provider expand locators.
      const provider = this._dataSourceProviders[i]!
      relativeDirtyLocatorSet =
        provider.computeDirtyLocatorsForDescendants(relativeDirtyLocatorSet)
      relativeDirtyLocators[i] = relativeDirtyLocatorSet
      if (relativeDirtyLocatorSet.contains(HdDataSourceLocator.EmptyLocator)) {
        // If provider expandede to the universal set, just
        // nuke entire data source.
        dirtyLocators.insert(locator)
        continue
      }
      // Make relative data source locators absolute.
      for (const relativeDirtyLocator of relativeDirtyLocatorSet) {
        dirtyLocators.insert(locator.append(relativeDirtyLocator))
      }
    }

    if (!dirtyLocators.IsEmpty()) {
      this._dirtyHierarchy(entry.primPath, relativeDirtyLocators,
        dirtyLocators, additionalDirty)
    }

    // Mark _PrimLevelWrappingDataSource to refetch input data source again
    // if the dirtyLocators indicate so.
    if (entry.dirtyLocators.contains(_primLevelContainer)) {
      const prim = this._prims.get(SdfPath.fromString(entry.primPath))
      if (prim && prim.dataSource instanceof _PrimLevelWrappingDataSource) {
        prim.dataSource.primContainerDirtied()
      }
    }
  }

  /** flatteningSceneIndex.cpp:558-588 */
  protected _primsDirtied(_sender: HdSceneIndexBase, entries: DirtiedPrimEntry[]): void {
    this._consolidateRecentPrims()

    const dirtyEntries: DirtiedPrimEntry[] = []
    for (const entry of entries) {
      this._primDirtied(entry, dirtyEntries)
    }

    if (dirtyEntries.length === 0) {
      this._sendPrimsDirtied(entries)
    } else {
      this._sendPrimsDirtied([...entries, ...dirtyEntries])
    }
  }

  /** Consolidate _recentPrims into _prims. flatteningSceneIndex.cpp:590-599 */
  private _consolidateRecentPrims(): void {
    for (const [path, prim] of this._recentPrims) {
      this._prims.set(SdfPath.fromString(path), prim)
    }
    this._recentPrims.clear()
  }

  /** flatteningSceneIndex.cpp:601-638 */
  private _dirtyHierarchy(
    primPath: string,
    relativeDirtyLocators: _DataSourceLocatorSetVector,
    dirtyLocators: HdDataSourceLocatorSet,
    dirtyEntries: DirtiedPrimEntry[],
  ): void {
    // XXX: here and elsewhere, if a parent xform is dirtied and the child has
    // resetXformStack, we could skip dirtying the child...

    const range = this._prims.findSubtreeRange(SdfPath.fromString(primPath))
    for (let it = 0; it < range.length;) {
      const [path, prim] = range[it]!

      if (prim && prim.dataSource instanceof _PrimLevelWrappingDataSource) {
        if (prim.dataSource.primDirtied(relativeDirtyLocators)) {
          // If we invalidated any data for any prim besides "primPath"
          // (which already has a notice), generate a new PrimsDirtied
          // notice.
          if (path.pathString !== primPath) {
            dirtyEntries.push({ primPath: path.pathString, dirtyLocators })
          }
        } else {
          // If we didn't invalidate any data, we can safely assume that
          // no downstream prims depended on this prim for their
          // flattened result, and skip to the next subtree. This is
          // an important optimization for (e.g.) scene population,
          // where no data is cached yet...
          // (it.GetNextSubtree(): skip the descendants of path, which
          // follow it contiguously in the depth-first range.)
          ++it
          while (it < range.length && range[it]![0].hasPrefix(path)) ++it
          continue
        }
      }
      ++it
    }
  }
}

/** flatteningSceneIndex.cpp:546-547 */
const _primLevelContainer = new HdDataSourceLocator(HdDataSourceLocatorSentinelTokens.container)

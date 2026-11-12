// Ported from OpenUSD 26.11.1: pxr/imaging/hdsi/locatorCachingSceneIndex.cpp,
//  pxr/imaging/hdsi/locatorCachingSceneIndex.h
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/imaging/hdsi/locatorCachingSceneIndex.{h,cpp}.
//
// Divergences:
// - No threads: the cache mutex is dropped.
// - _PrimCache is an SdfPathTable (erase drops descendants, as upstream);
//   _LocatorDataSourceMap is a Map keyed by the locator's elements joined
//   with NUL (TfHash of the locator upstream).
// - FAITHFULNESS-DEBT(hd-system-messages): HdsiLocatorCachingSceneIndex::
//   _SystemMessage (dropCaches, locatorCachingSceneIndex.cpp:274-282) is not
//   ported because this port's HdSceneIndexBase has no system message API
//   (HdSceneIndexBase::SystemMessage, sceneIndex.h); port that API and this
//   handler with it.
// Not ported: TfAutoMallocTag.

import { SdfPath } from 'typescript-usd/sdf/path'
import { PathTable as SdfPathTable } from 'typescript-usd/sdf'
import {
  ContainerDataSource as HdContainerDataSource,
  DataSourceLocator as HdDataSourceLocator,
  DependencyForwardingSceneIndex as HdDependencyForwardingSceneIndex,
  SingleInputFilteringSceneIndexBase as HdSingleInputFilteringSceneIndexBase,
} from 'typescript-usd/hd'
import type {
  DataSourceBase as HdDataSourceBase,
  SceneIndexBase as HdSceneIndexBase,
  SceneIndexPrim as HdSceneIndexPrim,
  AddedPrimEntry, RemovedPrimEntry, DirtiedPrimEntry,
} from 'typescript-usd/hd'
import { TF_CODING_ERROR, TF_VERIFY } from './tfDiagnostic.ts'

// Cache of data sources within a prim, by locator
type _LocatorDataSourceMap = Map<string, { locator: HdDataSourceLocator,
  ds: HdDataSourceBase | undefined }>

function _Key(locator: HdDataSourceLocator): string {
  return locator.GetString('\u0000')
}

/**
 * locatorCachingSceneIndex.h:21-258, locatorCachingSceneIndex.cpp.
 *
 * A scene index that caches data sources for specified locators
 * on specified prim types.  This avoids redundant computation
 * when scene indexes query the same locator on the same prims
 * multiple times.
 *
 * (See the upstream header for the full discussion of caching scenarios
 * and cache invalidation; HdsiLocatorCachingSceneIndex relies on
 * PrimsDirtied notification to invalidate internal cache state correctly,
 * so AddDependencyForwardingAndCache() inserts an
 * HdDependencyForwardingSceneIndex directly before it.)
 */
export class HdsiLocatorCachingSceneIndex extends HdSingleInputFilteringSceneIndexBase {
  // Cache contents.
  // Upstream's SdfPathTable default-constructs an empty map for the
  // ancestors it inserts implicitly. Here they hold null (an undefined
  // argument would select SdfPathTable's '' default, which has no clear()),
  // so _find() returns a map only where one was stored.
  private _primDsCache = new SdfPathTable<_LocatorDataSourceMap | null>(null)
  private _find(path: string): _LocatorDataSourceMap | undefined {
    return this._primDsCache.get(SdfPath.fromString(path)) ?? undefined
  }

  /**
   * Creates a new HdDependencyForwardingSceneIndex followed by a
   * HdsiLocatorCachingSceneIndex. locatorCachingSceneIndex.cpp:23-34
   */
  static addDependencyForwardingAndCache(
    inputScene: HdSceneIndexBase,
    locatorToCache: HdDataSourceLocator,
    primTypeToCache: string,
    cacheDescendants = true,
  ): HdSceneIndexBase | undefined {
    return HdsiLocatorCachingSceneIndex.new(
      HdDependencyForwardingSceneIndex.new(inputScene),
      locatorToCache, primTypeToCache, cacheDescendants)
  }

  /**
   * Creates a new HdsiLocatorCachingSceneIndex.
   * locatorCachingSceneIndex.cpp:36-53
   *
   * @param inputScene The upstream input scene index to cache
   * @param locatorToCache The data source locator to cache;
   *   for example, HdMaterialSchema::GetDefaultLocator(). Must not be empty.
   * @param primTypeToCache If specified, caching only applies
   *   to prims of this data type; if empty token, caching applies
   *   to all prim types
   */
  static new(
    inputScene: HdSceneIndexBase,
    locatorToCache: HdDataSourceLocator,
    primTypeToCache: string,
    cacheDescendants = true,
  ): HdsiLocatorCachingSceneIndex | undefined {
    if (locatorToCache.IsEmpty()) {
      // This scene index is not intended for prim-level caching.
      TF_CODING_ERROR('HdsiLocatorCachingSceneIndex requires ' +
                      'a non-empty locator to cache.')
      return undefined
    }
    return new HdsiLocatorCachingSceneIndex(
      inputScene, locatorToCache, primTypeToCache, cacheDescendants)
  }

  /** locatorCachingSceneIndex.cpp:166-185 */
  protected constructor(
    inputScene: HdSceneIndexBase,
    private readonly _locatorToCache: HdDataSourceLocator,
    private readonly _primTypeToCache: string,
    private readonly _cacheDescendants: boolean,
  ) {
    super(inputScene)
    // Convenience name for recognizing caches in Hydra Scene Debugger.
    let displayName =
      'HdsiLocatorCachingSceneIndex for ' + _locatorToCache.GetString()
    if (_primTypeToCache !== '') {
      displayName += ' (primType ' + _primTypeToCache + ')'
    }
    this.setDisplayName(displayName)
  }

  /**
   * Retrieve data for the requested locator, populating and
   * re-using cached data sources as appropriate.
   * locatorCachingSceneIndex.cpp:83-164
   */
  _getWithCache(
    primPath: string,
    locator: HdDataSourceLocator,
    inputDataSource: HdContainerDataSource,
  ): HdDataSourceBase | undefined {
    // Require at least one locator entry.
    TF_VERIFY(locator.getElementCount() > 0)
    const name = locator.getLastElement()

    // Are we caching this locator?
    if ((this._cacheDescendants && locator.hasPrefix(this._locatorToCache))
        || locator.Equals(this._locatorToCache)) {
      // Yes.  Check the cache.
      const sdfPath = SdfPath.fromString(primPath)
      const cached = this._find(primPath)?.get(_Key(locator))
      if (cached && cached.ds) {
        // Found cached data for this locator.
        return cached.ds
      }

      // No cached data source found, so pull from input.
      // This is the potentially expensive or repeated operation
      // that we are intending to cache.
      let ds = inputDataSource.Get(name)

      // Recursively wrap containers.
      if (this._cacheDescendants) {
        if (ds instanceof HdContainerDataSource) {
          ds = HdsiLocatorCachingSceneIndex._DataSource.new(this, primPath, locator, ds)
        }
      }

      // Store result in cache.
      if (ds) {
        let map = this._find(primPath)
        if (!map) {
          map = new Map()
          this._primDsCache.set(sdfPath, map)
        }
        map.set(_Key(locator), { locator, ds })
      }

      // Return result.
      return ds
    } else if (this._locatorToCache.hasPrefix(locator)) {
      // Not caching this locator, but we do cache a descendant.
      // Therefore, we need to recursively wrap containers.
      let ds = inputDataSource.Get(name)
      if (ds instanceof HdContainerDataSource) {
        ds = HdsiLocatorCachingSceneIndex._DataSource.new(this, primPath, locator, ds)
      }
      return ds
    } else {
      // No caching of this locator or any descendants.
      return inputDataSource.Get(name)
    }
  }

  /** locatorCachingSceneIndex.cpp:189-201 */
  getPrim(primPath: string): HdSceneIndexPrim {
    const prim = this._getInputSceneIndex().getPrim(primPath)
    if (prim.dataSource
        && (prim.primType === this._primTypeToCache || this._primTypeToCache === '')) {
      // Returned prim containers delegate back to this cache.
      return {
        primType: prim.primType,
        dataSource: HdsiLocatorCachingSceneIndex._DataSource.new(this, primPath,
          HdDataSourceLocator.EmptyLocator, prim.dataSource),
      }
    }
    return prim
  }

  /** locatorCachingSceneIndex.cpp:203-207 */
  getChildPrimPaths(primPath: string): string[] {
    return this._getInputSceneIndex().getChildPrimPaths(primPath)
  }

  /** locatorCachingSceneIndex.cpp:209-227 */
  protected _primsAdded(_sender: HdSceneIndexBase, entries: AddedPrimEntry[]): void {
    // An added prim can change prim contents arbitarily,
    // so all drop cached results for added prims.
    for (const entry of entries) {
      this._find(entry.primPath)?.clear()
    }
    this._sendPrimsAdded(entries)
  }

  /** locatorCachingSceneIndex.cpp:229-243 */
  protected _primsRemoved(_sender: HdSceneIndexBase, entries: RemovedPrimEntry[]): void {
    // Drop cached results for removed prims.
    for (const entry of entries) {
      // SdfPathTable::erase() drops all descendant cache entries.
      if (entry.primPath === '/') {
        this._primDsCache.clear()
      } else {
        this._primDsCache.erase(SdfPath.fromString(entry.primPath))
      }
    }
    this._sendPrimsRemoved(entries)
  }

  /** locatorCachingSceneIndex.cpp:245-272 */
  protected _primsDirtied(_sender: HdSceneIndexBase, entries: DirtiedPrimEntry[]): void {
    // Check for cache entries to invalidate.
    for (const entry of entries) {
      // Fast path rejection: ignore dirtied locators we do not cache.
      if (!entry.dirtyLocators.intersects(this._locatorToCache)) {
        continue
      }
      const primDsCache = this._find(entry.primPath)
      if (!primDsCache) {
        // No data cached for this prim.
        continue
      }
      // Sweep over locators with cached data sources.
      for (const dsCacheEntry of primDsCache.values()) {
        if (!dsCacheEntry.ds) {
          // No data source cached for this locator; ignore.
          continue
        }
        if (entry.dirtyLocators.intersects(dsCacheEntry.locator)) {
          // Drop cached data source.
          // We do not remove the hashmap entry since we expect
          // it to soon be re-populated by observers.
          dsCacheEntry.ds = undefined
        }
      }
    }
    this._sendPrimsDirtied(entries)
  }
}

export namespace HdsiLocatorCachingSceneIndex {
  /**
   * A data source that delegates back to HdsiLocatorCachingSceneIndex,
   * allowing it to manage invalidation.
   * locatorCachingSceneIndex.h:213-232, .cpp:55-81
   */
  export class _DataSource extends HdContainerDataSource {
    private constructor(
      private readonly _cachingSceneIndex: HdsiLocatorCachingSceneIndex,
      private readonly _primPath: string,
      private readonly _locator: HdDataSourceLocator,
      private readonly _inputDataSource: HdContainerDataSource,
    ) { super() }

    static new(cachingSceneIndex: HdsiLocatorCachingSceneIndex, primPath: string,
      locator: HdDataSourceLocator, inputDataSource: HdContainerDataSource): _DataSource {
      return new _DataSource(cachingSceneIndex, primPath, locator, inputDataSource)
    }

    getNames(): string[] {
      // XXX In the future, we could consider caching names.  However,
      // this is generally less important than data sources, since
      // scene index observers are already fully informed about all
      // prims via PrimsAdded notification.  Some scene indexes do invoke
      // GetNames() as part of a data source computation, but the
      // result of that computation can be cached instead.
      return this._inputDataSource.getNames()
    }

    Get(name: string): HdDataSourceBase | undefined {
      return this._cachingSceneIndex._getWithCache(
        this._primPath, this._locator.append(name), this._inputDataSource)
    }
  }
}

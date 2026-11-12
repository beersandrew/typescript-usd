// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/drawItemsCache.cpp,
//  pxr/imaging/hdSt/drawItemsCache.h
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/drawItemsCache.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - The cache key (collection, render tags, render index) is matched by
//   value with HdRprimCollection::Equals rather than hashed.
// - GarbageCollect: upstream evicts entries whose draw item vector is
//   referenced only by the cache (shared_ptr use_count() == 1,
//   drawItemsCache.cpp:113-131). JavaScript has no reference counts, so an
//   entry is evicted when no GetDrawItems call returned it since the
//   previous GarbageCollect.

import { Debug as TfDebug, type Token as TfToken } from 'typescript-usd/tf'
import type { RenderIndex as HdRenderIndex, RprimCollection as HdRprimCollection } from 'typescript-usd/hd'
import { HdStDebugCodes } from './debugCodes.ts'
import type { HdStDrawItem } from './drawItem.ts'
import type { HdStRenderParam } from './renderParam.ts'
import { TF_CODING_ERROR } from './tfDiagnostic.ts'

export type HdDrawItemConstPtrVector = readonly HdStDrawItem[]

/** drawItemsCache.cpp:30-36 */
function _GetMaterialTagsVersion(renderIndex: HdRenderIndex): number {
  const stRenderParam = renderIndex.getRenderDelegate().getRenderParam() as unknown as HdStRenderParam
  return stRenderParam.getMaterialTagsVersion()
}

/** drawItemsCache.cpp:38-44 */
function _GetGeomSubsetDrawItemsVersion(renderIndex: HdRenderIndex): number {
  const stRenderParam = renderIndex.getRenderDelegate().getRenderParam() as unknown as HdStRenderParam
  return stRenderParam.getGeomSubsetDrawItemsVersion()
}

/** drawItemsCache.h:79-104 (_CacheKey) */
interface _CacheKey {
  collection: HdRprimCollection
  renderTags: readonly string[]
  renderIndex: HdRenderIndex
}

/** drawItemsCache.h:106-120 (_CacheValue) */
interface _CacheValue {
  drawItems: HdDrawItemConstPtrVector
  collectionVersion: number
  renderTagsVersion: number
  materialTagsVersion: number
  geomSubsetDrawItemsVersion: number
  usedSinceGarbageCollect: boolean
}

function _KeyEquals(a: _CacheKey, b: _CacheKey): boolean {
  return a.renderIndex === b.renderIndex &&
    a.collection.Equals(b.collection) &&
    a.renderTags.length === b.renderTags.length &&
    a.renderTags.every((t, i) => t === b.renderTags[i])
}

/** drawItemsCache.h:47-142. A cache of the filtered draw items the render
 *  index returns for a collection and a list of render tags. */
export class HdSt_DrawItemsCache {
  private _cache: [_CacheKey, _CacheValue][] = []

  /** drawItemsCache.cpp:46-111 */
  getDrawItems(
    collection: HdRprimCollection,
    renderTags: readonly string[],
    renderIndex: HdRenderIndex | null,
    _curDrawItems: HdDrawItemConstPtrVector | null,
  ): HdDrawItemConstPtrVector | null {
    if (!renderIndex) {
      TF_CODING_ERROR('Received a null render index\n')
      return null
    }

    const key: _CacheKey = { collection: collection.Clone(), renderTags: [...renderTags], renderIndex }
    let entry = this._cache.find(([k]) => _KeyEquals(k, key))
    const cacheMiss = entry === undefined
    if (!entry) {
      entry = [key, {
        drawItems: [],
        collectionVersion: 0,
        renderTagsVersion: 0,
        materialTagsVersion: 0,
        geomSubsetDrawItemsVersion: 0,
        usedSinceGarbageCollect: true,
      }]
      this._cache.push(entry)
    }
    const val = entry[1]
    val.usedSinceGarbageCollect = true
    const staleEntry = !cacheMiss &&
      this._isCacheEntryStale(val, collection.getName(), renderIndex)

    // 3 possibilities:
    // 1. Doesn't exist in cache => Query render index and add entry
    // 2, Exists in cache and stale => Query render index and update entry
    // 3. Exists in cache and up-to-date => Return cached entry
    if (TfDebug.isEnabled(HdStDebugCodes.HDST_DRAWITEMS_CACHE)) {
      const tags = `[${renderTags.map(t => `${t}, `).join('')}]`
      const name = collection.getName()
      TfDebug.msg(HdStDebugCodes.HDST_DRAWITEMS_CACHE, cacheMiss
        ? `[MISS] Didn't find cache entry for collection ${name}, render tags ${tags}. Fetching draw items...\n`
        : staleEntry
          ? `[MISS] Found stale cache entry for collection ${name}, render tags ${tags}. Fetching updated draw items...\n`
          : `[HIT] Found up-to-date cache entry for collection ${name}, render tags ${tags}\n`)
    }

    if (cacheMiss || staleEntry) {
      this._updateCacheEntry(collection, renderTags, renderIndex, val)
    }

    return val.drawItems
  }

  /** drawItemsCache.cpp:113-131 (see the header note). */
  garbageCollect(): void {
    this._cache = this._cache.filter(([, val]) => val.usedSinceGarbageCollect)
    for (const [, val] of this._cache) {
      val.usedSinceGarbageCollect = false
    }
  }

  /** drawItemsCache.cpp:133-156 */
  private _isCacheEntryStale(val: _CacheValue, collectionName: string,
    renderIndex: HdRenderIndex): boolean {
    const tracker = renderIndex.getChangeTracker()
    const collectionVersionChanged =
      val.collectionVersion !== tracker.getCollectionVersion(collectionName)
    const renderTagsVersionChanged =
      val.renderTagsVersion !== tracker.getRenderTagVersion()
    const materialTagsVersionChanged =
      val.materialTagsVersion !== _GetMaterialTagsVersion(renderIndex)
    const geomSubsetDrawItemsChanged =
      val.geomSubsetDrawItemsVersion !== _GetGeomSubsetDrawItemsVersion(renderIndex)

    return collectionVersionChanged ||
      renderTagsVersionChanged ||
      materialTagsVersionChanged ||
      geomSubsetDrawItemsChanged
  }

  /** drawItemsCache.cpp:158-190 */
  private _updateCacheEntry(collection: HdRprimCollection, renderTags: readonly string[],
    renderIndex: HdRenderIndex, val: _CacheValue): void {
    const tracker = renderIndex.getChangeTracker()
    val.collectionVersion = tracker.getCollectionVersion(collection.getName())
    val.renderTagsVersion = tracker.getRenderTagVersion()
    val.materialTagsVersion = _GetMaterialTagsVersion(renderIndex)
    val.geomSubsetDrawItemsVersion = _GetGeomSubsetDrawItemsVersion(renderIndex)

    val.drawItems = []

    const renderParam = renderIndex.getRenderDelegate().getRenderParam() as unknown as HdStRenderParam
    if (renderParam.hasMaterialTag(collection.getMaterialTag() as TfToken) &&
      (renderTags.length === 0 || renderParam.hasAnyRenderTag(renderTags as readonly TfToken[]))) {
      val.drawItems = renderIndex.getDrawItems(collection, renderTags) as unknown as HdStDrawItem[]
    }
    // No need to even call GetDrawItems when we know that
    // there is no prim with the desired tags.
  }
}

/** drawItemsCache.h:144 */
export type HdStDrawItemsCachePtr = HdSt_DrawItemsCache

// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/niPrototypePruningSceneIndex.cpp,
//  pxr/usdImaging/usdImaging/niPrototypePruningSceneIndex.h
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/niPrototypePruningSceneIndex.{h,cpp}
// (OpenUSD 26.11.1).

import {
  SingleInputFilteringSceneIndexBase as HdSingleInputFilteringSceneIndexBase,
  type AddedPrimEntry, type DirtiedPrimEntry, type RemovedPrimEntry,
  type SceneIndexBase as HdSceneIndexBase, type SceneIndexPrim as HdSceneIndexPrim,
} from 'typescript-usd/hd'
import { UsdImagingUsdPrimInfoSchema } from './usdPrimInfoSchema.ts'

const _GetPathElementCount = (path: string): number => path === '/' ? 0 : path.split('/').length - 1
const _GetParentPath = (path: string): string => {
  if (path === '/' || path === '') return ''
  const slash = path.lastIndexOf('/')
  return slash <= 0 ? '/' : path.slice(0, slash)
}

/** niPrototypePruningSceneIndex.cpp:18-31 */
function _IsUsdPrototype(sceneIndex: HdSceneIndexBase, primPath: string): boolean {
  const primSource = sceneIndex.getPrim(primPath).dataSource
  const schema = UsdImagingUsdPrimInfoSchema.getFromParent(primSource)
  const ds = schema.getIsNiPrototype()
  if (!ds) {
    return false
  }
  return !!ds.getTypedValue(0)
}

/** niPrototypePruningSceneIndex.cpp:33-52.
 *  Divergence: SdfPathSet::lower_bound is replaced by checking path and
 *  each of its ancestors for membership (same result). */
function _ContainsPrefixOfPath(pathSet: Set<string>, path: string): boolean {
  // The set holds only root prims (the constructor and _primsAdded add
  // paths with one element), so the only prefix that can be in it is the
  // path's root prim: one lookup instead of one per ancestor.
  // (Ancestors split at '/' only, as _GetParentPath: the root prefix of
  // '/A.x' is '/A.x' itself.)
  if (pathSet.size === 0 || path === '/' || path === '') return false
  const end = path.indexOf('/', 1)
  return pathSet.has(end < 0 ? path : path.slice(0, end))
}

/** niPrototypePruningSceneIndex.cpp:54-100 _FilteredEntries.
 *  Only return entries (e.g., HdSceneIndexObserver::AddedEntries) where
 *  predicate is true.
 *
 *  It implements a copy-on-write pattern, that is, it avoids copying the
 *  given vector if no entry was filtered out. */
function _FilteredEntries<E extends { primPath: string }>(entries: E[], predicate: (primPath: string) => boolean): E[] {
  let i = 0
  for (; i < entries.length; i++) {
    if (!predicate(entries[i]!.primPath)) {
      break
    }
  }
  if (i === entries.length) {
    return entries
  }
  const computedEntries = entries.slice(0, i)
  i++
  for (; i < entries.length; i++) {
    if (predicate(entries[i]!.primPath)) {
      computedEntries.push(entries[i]!)
    }
  }
  return computedEntries
}

/**
 * niPrototypePruningSceneIndex.h:19-60.
 *
 * Removes all prototypes (immediate children of the pseudo root with
 * the data source isUsdPrototype at returning true) from the scene index.
 *
 * Intended to be used by the UsdImagingNiPrototypePropagatingSceneIndex
 * to obtain the Usd Stage without the prototypes.
 */
export class UsdImaging_NiPrototypePruningSceneIndex extends HdSingleInputFilteringSceneIndexBase {
  private readonly _prototypes = new Set<string>()

  /** niPrototypePruningSceneIndex.h:30-36 */
  static new(inputSceneIndex: HdSceneIndexBase): UsdImaging_NiPrototypePruningSceneIndex {
    return new UsdImaging_NiPrototypePruningSceneIndex(inputSceneIndex)
  }

  /** niPrototypePruningSceneIndex.cpp:104-115 */
  private constructor(inputSceneIndex: HdSceneIndexBase) {
    super(inputSceneIndex)
    for (const path of this._getInputSceneIndex().getChildPrimPaths('/')) {
      if (_IsUsdPrototype(this._getInputSceneIndex(), path)) {
        this._prototypes.add(path)
      }
    }
  }

  /** niPrototypePruningSceneIndex.cpp:117-126 */
  getPrim(primPath: string): HdSceneIndexPrim {
    if (_ContainsPrefixOfPath(this._prototypes, primPath)) {
      return { primType: '', dataSource: undefined }
    }
    return this._getInputSceneIndex().getPrim(primPath)
  }

  /** niPrototypePruningSceneIndex.cpp:128-153 */
  getChildPrimPaths(primPath: string): string[] {
    if (this._prototypes.size === 0) {
      return this._getInputSceneIndex().getChildPrimPaths(primPath)
    }

    if (primPath === '/') {
      const result: string[] = []
      for (const child of this._getInputSceneIndex().getChildPrimPaths('/')) {
        if (!this._prototypes.has(child)) {
          result.push(child)
        }
      }
      return result
    }

    if (_ContainsPrefixOfPath(this._prototypes, primPath)) {
      return []
    }

    return this._getInputSceneIndex().getChildPrimPaths(primPath)
  }

  /** niPrototypePruningSceneIndex.cpp:155-180 */
  protected _primsAdded(_sender: HdSceneIndexBase, entries: AddedPrimEntry[]): void {
    const newEntries = _FilteredEntries(entries, (primPath: string) => {
      if (_GetPathElementCount(primPath) === 1) {
        if (_IsUsdPrototype(this._getInputSceneIndex(), primPath)) {
          this._prototypes.add(primPath)
          return false
        } else {
          return true
        }
      } else {
        return !_ContainsPrefixOfPath(this._prototypes, primPath)
      }
    })
    this._sendPrimsAdded(newEntries)
  }

  /** niPrototypePruningSceneIndex.cpp:182-200 */
  protected _primsDirtied(_sender: HdSceneIndexBase, entries: DirtiedPrimEntry[]): void {
    if (this._prototypes.size === 0) {
      this._sendPrimsDirtied(entries)
      return
    }
    const newEntries = _FilteredEntries(entries,
      (primPath: string) => !_ContainsPrefixOfPath(this._prototypes, primPath))
    this._sendPrimsDirtied(newEntries)
  }

  /** niPrototypePruningSceneIndex.cpp:202-226 */
  protected _primsRemoved(_sender: HdSceneIndexBase, entries: RemovedPrimEntry[]): void {
    const newEntries = _FilteredEntries(entries, (primPath: string) => {
      if (primPath === '/') {
        this._prototypes.clear()
        return true
      }
      if (_GetPathElementCount(primPath) === 1) {
        return !this._prototypes.delete(primPath)
      }
      return !_ContainsPrefixOfPath(this._prototypes, primPath)
    })
    this._sendPrimsRemoved(newEntries)
  }
}

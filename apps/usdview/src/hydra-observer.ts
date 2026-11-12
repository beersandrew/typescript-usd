// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdviewq/hydraObserver.cpp,
//  pxr/usdImaging/usdviewq/hydraObserver.h,
//  pxr/usdImaging/usdviewq/hydraSceneDebugger.py,
//  pxr/usdImaging/usdviewq/wrapHydraObserver.cpp
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// UsdviewqHydraObserver, ported from OpenUSD 26.11.1
// pxr/usdImaging/usdviewq/hydraObserver.{h,cpp}, with the Python-facing
// conversions of wrapHydraObserver.cpp that hydraSceneDebugger.py relies on.
//
// It lives in the viewer, not in packages/usd: it is part of usdviewq (the
// usdview application library), which this viewer ports, and upstream says it
// "exists solely in service of the python implementation of Hydra Scene
// Debugger present in usdview" (hydraObserver.h:17-27). The scene index API it
// observes (HdSceneIndexBase, HdSceneIndexNameRegistry, the data sources) is
// the library's.
//
// Paths are the library's scene index path strings (SdfPath upstream).
import {
  ContainerDataSource as HdContainerDataSource,
  FilteringSceneIndexBase as HdFilteringSceneIndexBase,
  SampledDataSource as HdSampledDataSource,
  SceneIndexNameRegistry as HdSceneIndexNameRegistry,
  SceneIndexObserver as HdSceneIndexObserverStatics,
  type AddedPrimEntry, type DataSourceBase as HdDataSourceBase,
  type DataSourceLocator as HdDataSourceLocator,
  type DataSourceLocatorSet as HdDataSourceLocatorSet,
  type DirtiedPrimEntry, type RemovedPrimEntry, type RenamedPrimEntry,
  type SceneIndexBase as HdSceneIndexBase, type SceneIndexObserver as HdSceneIndexObserver,
  type SceneIndexPrim as HdSceneIndexPrim,
} from 'typescript-usd/hd'
import { Value as VtValue } from 'typescript-usd/vt'

/** hydraObserver.h:109-128: aggregate of HdSceneIndexObserver entry types;
 *  exactly one list is non-empty. */
export interface NoticeEntry {
  added: AddedPrimEntry[]
  removed: RemovedPrimEntry[]
  dirtied: DirtiedPrimEntry[]
}
const addedNotice = (added: AddedPrimEntry[]): NoticeEntry => ({ added, removed: [], dirtied: [] })
const removedNotice = (removed: RemovedPrimEntry[]): NoticeEntry => ({ added: [], removed, dirtied: [] })
const dirtiedNotice = (dirtied: DirtiedPrimEntry[]): NoticeEntry => ({ added: [], removed: [], dirtied })

/** hydraObserver.h:153-176 (_Observer), hydraObserver.cpp:216-271 */
class _Observer implements HdSceneIndexObserver {
  notices: NoticeEntry[] = []

  primsAdded(_sender: HdSceneIndexBase, entries: AddedPrimEntry[]): void {
    const back = this.notices.at(-1)
    if (back && back.added.length > 0) back.added.push(...entries)
    else this.notices.push(addedNotice([...entries]))
  }

  primsRemoved(_sender: HdSceneIndexBase, entries: RemovedPrimEntry[]): void {
    const back = this.notices.at(-1)
    if (back && back.removed.length > 0) back.removed.push(...entries)
    else this.notices.push(removedNotice([...entries]))
  }

  primsDirtied(_sender: HdSceneIndexBase, entries: DirtiedPrimEntry[]): void {
    const back = this.notices.at(-1)
    if (back && back.dirtied.length > 0) back.dirtied.push(...entries)
    else this.notices.push(dirtiedNotice([...entries]))
  }

  primsRenamed(sender: HdSceneIndexBase, entries: RenamedPrimEntry[]): void {
    HdSceneIndexObserverStatics.ConvertPrimsRenamedToRemovedAndAdded(sender, entries, this)
  }
}

/** hydraObserver.cpp:176-181 TfDynamic_cast<HdFilteringSceneIndexBaseRefPtr> */
function asFiltering(sceneIndex: HdSceneIndexBase | undefined): HdFilteringSceneIndexBase | undefined {
  return sceneIndex instanceof HdFilteringSceneIndexBase ? sceneIndex : undefined
}

/** hydraObserver.cpp:96-104 */
function displayNameOf(sceneIndex: HdSceneIndexBase | undefined): string {
  if (!sceneIndex) return ''
  return sceneIndex.getDisplayName()
}

export type IndexList = readonly number[]

/** hydraObserver.h:29-185: abstracts pieces necessary for implementing a
 *  Hydra Scene Debugger. */
export class UsdviewqHydraObserver {
  // Cached result for getNestedInputDisplayNames and
  // targetToNestedInputSceneIndex.
  private _nestedInputSceneIndices: HdSceneIndexBase[] | undefined
  private _sceneIndex: HdSceneIndexBase | undefined
  private readonly _observer = new _Observer()

  /** hydraObserver.cpp:17-22 (the destructor): JavaScript has no
   *  destructors, so the owner calls this when it is done. */
  dispose(): void {
    this._sceneIndex?.removeObserver(this._observer)
    this._sceneIndex = undefined
    this._nestedInputSceneIndices = undefined
  }

  /** hydraObserver.cpp:24-29: the names of scene indices previously
   *  registered with HdSceneIndexNameRegistry. */
  static getRegisteredSceneIndexNames(): string[] {
    return HdSceneIndexNameRegistry.GetInstance().getRegisteredNames()
  }

  /** hydraObserver.cpp:31-61: each index is an index into the input scenes
   *  of the previous, starting from the targeted scene index. */
  targetToInputSceneIndex(inputIndices: IndexList): boolean {
    let currentSceneIndex = asFiltering(this._sceneIndex)
    let inputScenes: HdSceneIndexBase[] = []

    const indices = [...inputIndices].reverse()
    while (indices.length > 0 && currentSceneIndex) {
      const i = indices.pop()!

      inputScenes = currentSceneIndex.getInputScenes()

      if (i >= inputScenes.length) {
        return false
      }

      if (indices.length === 0) {
        return this._target(inputScenes[i])
      } else {
        currentSceneIndex = asFiltering(inputScenes[i])
      }
    }

    return false
  }

  /** hydraObserver.cpp:63-68 */
  targetToNamedSceneIndex(name: string): boolean {
    return this._target(HdSceneIndexNameRegistry.GetInstance().getNamedSceneIndex(name))
  }

  /** hydraObserver.cpp:70-87 */
  private _target(sceneIndex: HdSceneIndexBase | undefined): boolean {
    this._nestedInputSceneIndices = undefined

    this._sceneIndex?.removeObserver(this._observer)

    this._observer.notices.length = 0

    this._sceneIndex = sceneIndex
    this._sceneIndex?.addObserver(this._observer)

    return this._sceneIndex !== undefined
  }

  /** hydraObserver.cpp:106-110: the display name of the targeted scene index. */
  getDisplayName(): string {
    return displayNameOf(this._sceneIndex)
  }

  /** hydraObserver.cpp:112-146: the display names of the input scenes of the
   *  scene index reached by following `inputIndices`. */
  getInputDisplayNames(inputIndices: IndexList): string[] {
    const result: string[] = []
    let inputScenes: HdSceneIndexBase[] = []

    let currentSceneIndex = asFiltering(this._sceneIndex)

    const indices = [...inputIndices].reverse()
    while (currentSceneIndex) {
      inputScenes = currentSceneIndex.getInputScenes()

      if (indices.length === 0) {
        for (const inputScene of inputScenes) {
          result.push(displayNameOf(inputScene))
        }

        return result
      }

      const i = indices.pop()!

      if (i < inputScenes.length) {
        currentSceneIndex = asFiltering(inputScenes[i])
      } else {
        break
      }
    }

    return result
  }

  /** hydraObserver.cpp:148-159: every input scene index, breadth first,
   *  starting with the targeted one. */
  getNestedInputDisplayNames(): string[] {
    return this._computeNestedInputSceneIndices().map(displayNameOf)
  }

  /** hydraObserver.cpp:161-172 */
  targetToNestedInputSceneIndex(nestedInputIndex: number): boolean {
    const nested = this._computeNestedInputSceneIndices()

    if (!(nestedInputIndex < nested.length)) {
      return false
    }

    return this._target(nested[nestedInputIndex])
  }

  /** hydraObserver.cpp:174-202 */
  private _computeNestedInputSceneIndices(): HdSceneIndexBase[] {
    if (this._nestedInputSceneIndices) {
      return this._nestedInputSceneIndices
    }

    const nested: HdSceneIndexBase[] = this._nestedInputSceneIndices = []

    // Upstream starts from the (possibly null) targeted refptr; a null entry
    // has the empty display name.
    const visited = new Set<HdSceneIndexBase | undefined>()
    const pending: (HdSceneIndexBase | undefined)[] = [this._sceneIndex]

    while (pending.length > 0) {
      const sceneIndex = pending.shift()
      if (visited.has(sceneIndex)) {
        continue
      }
      visited.add(sceneIndex)
      nested.push(sceneIndex!)
      const filteringSceneIndex = asFiltering(sceneIndex)
      if (!filteringSceneIndex) {
        continue
      }
      for (const inputScene of filteringSceneIndex.getInputScenes()) {
        pending.push(inputScene)
      }
    }
    return nested
  }

  /** hydraObserver.cpp:204-212 */
  getChildPrimPaths(primPath: string): string[] {
    if (this._sceneIndex) {
      return this._sceneIndex.getChildPrimPaths(primPath)
    }

    return []
  }

  /** hydraObserver.cpp:214-222 */
  getPrim(primPath: string): HdSceneIndexPrim {
    if (this._sceneIndex) {
      return this._sceneIndex.getPrim(primPath)
    }

    return { primType: '', dataSource: undefined }
  }

  /** hydraObserver.cpp:274-278: consumers follow a polling pattern. */
  hasPendingNotices(): boolean {
    return this._observer.notices.length > 0
  }

  /** hydraObserver.cpp:280-284: returns and clears the accumulated notices. */
  getPendingNotices(): NoticeEntry[] {
    const notices = this._observer.notices
    this._observer.notices = []
    return notices
  }

  /** hydraObserver.cpp:286-290 */
  clearPendingNotices(): void {
    this._observer.notices.length = 0
  }
}

// ---- wrapHydraObserver.cpp: the values hydraSceneDebugger.py receives ----

/** One notice as the Python binding hands it over (wrapHydraObserver.cpp:42-80). */
export type PendingNotice =
  | readonly ['added', readonly (readonly [primPath: string, primType: string])[]]
  | readonly ['removed', readonly string[]]
  | readonly ['dirtied', readonly (readonly [primPath: string, locators: HdDataSourceLocatorSet])[]]

/** wrapHydraObserver.cpp:42-80 _GetPendingNotices */
export function getPendingNotices(observer: UsdviewqHydraObserver): PendingNotice[] {
  const result: PendingNotice[] = []
  for (const noticeEntry of observer.getPendingNotices()) {
    if (noticeEntry.added.length > 0) {
      result.push(['added', noticeEntry.added.map(entry => [entry.primPath, entry.primType] as const)])
    }
    if (noticeEntry.removed.length > 0) {
      result.push(['removed', noticeEntry.removed.map(entry => entry.primPath)])
    }
    if (noticeEntry.dirtied.length > 0) {
      result.push(['dirtied', noticeEntry.dirtied.map(entry => [entry.primPath, entry.dirtyLocators] as const)])
    }
  }
  return result
}

/** wrapHydraObserver.cpp:82-92 _WrapLocatorSetAsString */
export function locatorSetAsString(locators: HdDataSourceLocatorSet): string {
  let buffer = ''
  for (const locator of locators) {
    buffer += `${locator.GetString()},`
  }
  return buffer
}

/** wrapHydraObserver.cpp:122-131 (ContainerDataSource.Get by locator). */
export function getAtLocator(container: HdContainerDataSource | undefined, locator: HdDataSourceLocator): HdDataSourceBase | undefined {
  return HdContainerDataSource.Get(container, locator)
}

/**
 * A sampled data source's value as wrapHydraObserver.cpp:160-200 hands it to
 * Python: the VtValue of GetValue(0) (_WrapSampledDataSourceGetValue) and its
 * type name (_WrapSampledDataSourceGetTypeString); undefined when empty.
 */
export function sampledValue(ds: HdSampledDataSource): VtValue | undefined {
  const value = HdSampledDataSource._interim_GetVtValue(ds, 0)
  return value.IsEmpty() ? undefined : value
}

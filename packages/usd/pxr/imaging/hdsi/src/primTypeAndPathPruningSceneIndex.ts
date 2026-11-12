// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdsi/primTypeAndPathPruningSceneIndex.cpp,
//  pxr/imaging/hdsi/primTypeAndPathPruningSceneIndex.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/imaging/hdsi/primTypeAndPathPruningSceneIndex.{h,cpp}.
//
// An empty std::function PathPredicate is `undefined` here.
// TRACE_FUNCTION scopes are not ported.

import { MakeTokens as TfMakeTokens } from 'typescript-usd/tf'
import {
  SceneIndexPrimView as HdSceneIndexPrimView,
  SingleInputFilteringSceneIndexBase as HdSingleInputFilteringSceneIndexBase,
  TypedSampledDataSource as HdTypedSampledDataSource,
} from 'typescript-usd/hd'
import type {
  AddedPrimEntry,
  ContainerDataSource as HdContainerDataSource,
  DirtiedPrimEntry,
  RemovedPrimEntry,
  SceneIndexBase as HdSceneIndexBase,
  SceneIndexPrim as HdSceneIndexPrim,
} from 'typescript-usd/hd'
import { TF_CODING_ERROR } from './tfDiagnostic.ts'

/** primTypeAndPathPruningSceneIndex.h:16-20 */
export const HdsiPrimTypeAndPathPruningSceneIndexTokens = TfMakeTokens({
  primTypes: 'primTypes',
})

/** HdsiPrimTypeAndPathPruningSceneIndex::PathPredicate
 *  (primTypeAndPathPruningSceneIndex.h:46) */
export type HdsiPrimTypeAndPathPruningSceneIndexPathPredicate =
  (path: string) => boolean

/** primTypeAndPathPruningSceneIndex.cpp:20-34 */
function _GetPrimTypes(container: HdContainerDataSource | undefined): string[] {
  if (!container) {
    return []
  }
  // HdTypedSampledDataSource<TfTokenVector>::Cast
  const ds =
    container.Get(
      HdsiPrimTypeAndPathPruningSceneIndexTokens.primTypes)
  if (!(ds instanceof HdTypedSampledDataSource)) {
    return []
  }
  const value: unknown = ds.getTypedValue(0.0)
  if (!Array.isArray(value)) {
    return []
  }
  return [...(value as string[])]
}

/**
 * Scene Index that prunes prims if its type is in a given list and
 * its path matches a given predicate.
 *
 * Pruned prims are not removed from the scene index; instead, they
 * are given an empty primType and null dataSource. This is to
 * preserve hierarchy and allow children of the pruned types to still
 * exist.
 *
 * By default, the predicate is empty (empty std::function) and no prims
 * will be pruned.
 *
 * (primTypeAndPathPruningSceneIndex.h:23-87)
 */
export class HdsiPrimTypeAndPathPruningSceneIndex extends HdSingleInputFilteringSceneIndexBase {
  private readonly _primTypes: readonly string[]
  private _pathPredicate: HdsiPrimTypeAndPathPruningSceneIndexPathPredicate | undefined

  /** primTypeAndPathPruningSceneIndex.cpp:38-47 */
  static new(
    inputSceneIndex: HdSceneIndexBase,
    inputArgs: HdContainerDataSource | undefined,
  ): HdsiPrimTypeAndPathPruningSceneIndex {
    return new HdsiPrimTypeAndPathPruningSceneIndex(inputSceneIndex, inputArgs)
  }

  /** primTypeAndPathPruningSceneIndex.cpp:182-192 */
  protected constructor(
    inputSceneIndex: HdSceneIndexBase,
    inputArgs: HdContainerDataSource | undefined,
  ) {
    super(inputSceneIndex)
    this._primTypes = _GetPrimTypes(inputArgs)
    if (this._primTypes.length === 0) {
      TF_CODING_ERROR(
        'Empty prim types given to HdsiPrimTypeAndPathPruningSceneIndex')
    }
  }

  /** Should prim be pruned based on its type?
   *  (primTypeAndPathPruningSceneIndex.cpp:49-57) */
  private _pruneType(primType: string): boolean {
    for (const type of this._primTypes) {
      if (primType === type) {
        return true
      }
    }
    return false
  }

  /** Set predicate returning true if a prim at a particular path
   *  should be pruned. Setting to an empty predicate means that
   *  no prim will be pruned.
   *  (primTypeAndPathPruningSceneIndex.cpp:59-100) */
  setPathPredicate(
    pathPredicate: HdsiPrimTypeAndPathPruningSceneIndexPathPredicate | undefined,
  ): void {
    const oldPathPredicate = this._pathPredicate
    // Set new predicate before we call _SendPrimsAdded which might
    // make client scene indices pull on this scene index.
    this._pathPredicate = pathPredicate

    if (!this._isObserved()) {
      return
    }

    const addedEntries: AddedPrimEntry[] = []

    for (const primPath of new HdSceneIndexPrimView(this._getInputSceneIndex())) {
      // We assume that evaluating path predicate is fast compared to
      // calling GetPrim on the input scene.
      const oldValue = !!oldPathPredicate && oldPathPredicate(primPath)
      const newValue = !!this._pathPredicate && this._pathPredicate(primPath)

      if (oldValue === newValue) {
        continue
      }

      let primType = this._getInputSceneIndex().getPrim(primPath).primType
      if (!this._pruneType(primType)) {
        continue
      }

      if (newValue) {
        primType = ''
      }

      addedEntries.push({ primPath, primType })
    }
    if (addedEntries.length !== 0) {
      this._sendPrimsAdded(addedEntries)
    }
  }

  // HdSceneIndex overrides

  /** primTypeAndPathPruningSceneIndex.cpp:102-115 */
  getPrim(primPath: string): HdSceneIndexPrim {
    // We assume that only few prims are gonna be pruned.

    const prim = this._getInputSceneIndex().getPrim(primPath)
    if (!this._pathPredicate) {
      return prim
    }
    if (this._pruneType(prim.primType) && this._pathPredicate(primPath)) {
      return { primType: '', dataSource: undefined }
    }
    return prim
  }

  /** primTypeAndPathPruningSceneIndex.cpp:117-122 */
  getChildPrimPaths(primPath: string): string[] {
    return this._getInputSceneIndex().getChildPrimPaths(primPath)
  }

  // HdSingleInputFilteringSceneIndexBase overrides

  /** primTypeAndPathPruningSceneIndex.cpp:124-161 */
  protected _primsAdded(_sender: HdSceneIndexBase, entries: AddedPrimEntry[]): void {
    if (!this._isObserved()) {
      return
    }

    const pathPredicate = this._pathPredicate
    if (!pathPredicate) {
      this._sendPrimsAdded(entries)
      return
    }

    // Fast path: if there are no pruned prims, reuse the entry list.
    let anythingToFilter = false
    for (const entry of entries) {
      if (this._pruneType(entry.primType) && pathPredicate(entry.primPath)) {
        anythingToFilter = true
        break
      }
    }
    if (!anythingToFilter) {
      this._sendPrimsAdded(entries)
      return
    }

    // PrimTypes are present.  Filter them out of the entries.
    const filteredEntries: AddedPrimEntry[] = entries.map((e) => ({ ...e }))
    for (const entry of filteredEntries) {
      if (this._pruneType(entry.primType) && pathPredicate(entry.primPath)) {
        entry.primType = ''
      }
    }
    this._sendPrimsAdded(filteredEntries)
  }

  /** primTypeAndPathPruningSceneIndex.cpp:163-169 */
  protected _primsRemoved(_sender: HdSceneIndexBase, entries: RemovedPrimEntry[]): void {
    this._sendPrimsRemoved(entries)
  }

  /** primTypeAndPathPruningSceneIndex.cpp:171-180 */
  protected _primsDirtied(_sender: HdSceneIndexBase, entries: DirtiedPrimEntry[]): void {
    // XXX We could, potentially, filter out entries for prims
    // we have pruned.  For now, we pass through (potentially
    // unnecessary) dirty notification.
    this._sendPrimsDirtied(entries)
  }
}

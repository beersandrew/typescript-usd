// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdsi/prefixPathPruningSceneIndex.cpp,
//  pxr/imaging/hdsi/prefixPathPruningSceneIndex.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/imaging/hdsi/prefixPathPruningSceneIndex.{h,cpp}.
//
// Paths are the string paths this port's Hydra uses; ordering, prefix tests
// and RemoveDescendentPaths go through SdfPath (typescript-usd/sdf/path).
// The SdfPathSet _excludePathPrefixes member declared in
// prefixPathPruningSceneIndex.h:93 is unused upstream and not ported.
// TRACE_FUNCTION scopes are not ported.

import { MakeTokens as TfMakeTokens } from 'typescript-usd/tf'
import { SdfPath } from 'typescript-usd/sdf/path'
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

/** prefixPathPruningSceneIndex.h:16-20 */
export const HdsiPrefixPathPruningSceneIndexTokens = TfMakeTokens({
  excludePathPrefixes: 'excludePathPrefixes',
})

/** SdfPath::operator< */
function _PathCompare(a: string, b: string): number {
  return SdfPath.compare(SdfPath.fromString(a), SdfPath.fromString(b))
}

/** SdfPath::HasPrefix */
function _HasPrefix(path: string, prefix: string): boolean {
  return SdfPath.fromString(path).hasPrefix(SdfPath.fromString(prefix))
}

/** SdfPath::RemoveDescendentPaths (sorts, then removes paths prefixed by
 *  another path of the vector). */
function _RemoveDescendentPaths(paths: string[]): string[] {
  return SdfPath.removeDescendentPaths(paths.map((p) => SdfPath.fromString(p)))
    .map((p) => p.pathString)
}

/** prefixPathPruningSceneIndex.cpp:23-40 */
function _GetExcludePathPrefixes(container: HdContainerDataSource | undefined): string[] {
  if (!container) {
    return []
  }

  // HdTypedSampledDataSource<SdfPathVector>::Cast
  const ds =
    container.Get(
      HdsiPrefixPathPruningSceneIndexTokens.excludePathPrefixes)
  if (!(ds instanceof HdTypedSampledDataSource)) {
    return []
  }
  const value: unknown = ds.getTypedValue(0.0)
  if (!Array.isArray(value)) {
    return []
  }

  return [...(value as string[])]
}

/** Queries `container` to get the exclude path prefixes and returns a sorted
 *  vector of exclude paths with any duplicates or descendent
 *  paths removed. (prefixPathPruningSceneIndex.cpp:42-52) */
function _GetSanitizedExcludePaths(container: HdContainerDataSource | undefined): string[] {
  return _RemoveDescendentPaths(_GetExcludePathPrefixes(container))
}

/** prefixPathPruningSceneIndex.cpp:54-84 */
function _IsPrunedImpl(primPath: string, sortedExcludePaths: readonly string[]): boolean {
  // Recall that sortedExcludePaths is sorted and stripped of descendents.
  // For primPath to be pruned, sortedExcludePaths must either contain
  // primPath or a prefix of primPath.
  //
  // If a prefix of primPath exists, it will be the first element
  // that is less-than primPath. Thus, what we want here is the first
  // element that is less-than-or-equal-to primPath.
  //
  // (Upstream uses lower_bound with reverse iterators and the
  // std::greater_than comparator, i.e. the last element that is
  // less-than-or-equal-to primPath.)
  let lo = 0
  let hi = sortedExcludePaths.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (_PathCompare(sortedExcludePaths[mid]!, primPath) <= 0) {
      lo = mid + 1
    } else {
      hi = mid
    }
  }
  // lo is upper_bound; the element before it is the reverse lower_bound.
  return lo > 0 && _HasPrefix(primPath, sortedExcludePaths[lo - 1]!)
}

/** Returns prefix paths in `a` that are not covered by prefix paths in `b`.
 *  i.e. elements in `a` that are not prefixed by any element in `b`.
 *  (prefixPathPruningSceneIndex.cpp:86-105) */
function _ComputeUncoveredPrefixes(a: readonly string[], b: readonly string[]): string[] {
  const result: string[] = []
  for (const path of a) {
    if (!b.some((prefix) => _HasPrefix(path, prefix))) {
      result.push(path)
    }
  }

  return result
}

/** Returns `inputEntries` if no notice entries are pruned. Otherwise, copies
 *  the entries that are not pruned into `filteredEntries` and returns it.
 *
 *  This helps avoid an unnecessary copy of the input entries when no pruning
 *  is needed.
 *
 *  Note: as upstream, when every entry is pruned, `filteredEntries` is empty
 *  and `inputEntries` is returned. Ported as is.
 *  (prefixPathPruningSceneIndex.cpp:215-239) */
function _RemovePrunedNoticeEntries<E extends { primPath: string }>(
  sortedExcludePaths: readonly string[],
  inputEntries: E[],
  filteredEntries: E[],
): E[] {
  for (const entry of inputEntries) {
    if (!_IsPrunedImpl(entry.primPath, sortedExcludePaths)) {
      filteredEntries.push(entry)
    }
  }

  if (filteredEntries.length === 0) {
    return inputEntries
  }
  return filteredEntries
}

/**
 * A scene index that prunes prims at or below the list of provided
 * prefix paths.
 * The list of prefix paths may be provided at c'tor time using a path vector
 * data source for the "excludePathPrefixes" locator, and updated
 * using the SetExcludePathPrefixes method.
 *
 * Note:
 * "Pruning" is an overloaded term in the context of scene indices and
 * deserves some clarification.
 * The pruning behavior of this scene index removes the subtree of prims
 * rooted at the provided path prefixes. Thus, the topology of the input scene
 * is modified as a result of pruning.
 * Notices are also filtered to exclude entries for paths that are pruned.
 *
 * While this scene index seems similar in nature to
 * HdsiPrimTypeAndPathPruningSceneIndex and HdsiPrimTypePruningSceneIndex, it
 * differs from them in the pruning behavior. The former two scene indices
 * do not modify the topology of the input scene, but instead return an empty
 * prim type and prim container for a prim that is "pruned".
 *
 * (prefixPathPruningSceneIndex.h:23-94)
 */
export class HdsiPrefixPathPruningSceneIndex extends HdSingleInputFilteringSceneIndexBase {
  private _sortedExcludePaths: string[]

  /** prefixPathPruningSceneIndex.cpp:109-118 */
  static new(
    inputSceneIndex: HdSceneIndexBase,
    inputArgs: HdContainerDataSource | undefined,
  ): HdsiPrefixPathPruningSceneIndex {
    return new HdsiPrefixPathPruningSceneIndex(inputSceneIndex, inputArgs)
  }

  /** prefixPathPruningSceneIndex.cpp:307-316 */
  private constructor(
    inputSceneIndex: HdSceneIndexBase,
    inputArgs: HdContainerDataSource | undefined,
  ) {
    super(inputSceneIndex)
    this._sortedExcludePaths = _GetSanitizedExcludePaths(inputArgs)
    // There cannot be an observer when we're creating a filtering scene index.
    // So, we don't need to traverse the input scene to remove pruned prim
    // subtrees.
  }

  // HdSceneIndex overrides

  /** prefixPathPruningSceneIndex.cpp:120-129 */
  getPrim(primPath: string): HdSceneIndexPrim {
    if (this._sortedExcludePaths.length === 0 || !this._isPruned(primPath)) {
      return this._getInputSceneIndex().getPrim(primPath)
    }

    return { primType: '', dataSource: undefined }
  }

  /** prefixPathPruningSceneIndex.cpp:131-150 */
  getChildPrimPaths(primPath: string): string[] {
    const haveExcludePaths = this._sortedExcludePaths.length !== 0
    if (haveExcludePaths && this._isPruned(primPath)) {
      return []
    }

    let childPaths =
      this._getInputSceneIndex().getChildPrimPaths(primPath)

    if (haveExcludePaths) {
      childPaths = this._removePrunedChildren(childPaths)
    }

    return childPaths
  }

  // Public API

  /** prefixPathPruningSceneIndex.cpp:152-213 */
  setExcludePathPrefixes(paths: string[]): void {
    const newPrefixes = _RemoveDescendentPaths(paths)

    if (newPrefixes.length === this._sortedExcludePaths.length &&
        newPrefixes.every((p, i) => p === this._sortedExcludePaths[i])) {
      return
    }

    const oldPrefixes = this._sortedExcludePaths
    this._sortedExcludePaths = []

    if (!this._isObserved()) {
      this._sortedExcludePaths = newPrefixes
      return
    }

    // From the new and old prefixes, we want to determine:
    // (a) the prefixes that are no longer pruned
    // (b) the prefixes that are newly pruned
    //
    const noLongerPrunedPrefixes =
      _ComputeUncoveredPrefixes(oldPrefixes, newPrefixes)

    const inputSi = this._getInputSceneIndex()

    // Add all the prims in each prefix's subtree. Note that this may include
    // descendent prims that are pruned by the new prefixes. We send the added
    // notices first and then the removed notices to address this.
    //
    const addedEntries: AddedPrimEntry[] = []
    for (const prefix of noLongerPrunedPrefixes) {

      for (const primPath of new HdSceneIndexPrimView(inputSi, prefix)) {

        addedEntries.push({
          primPath, primType: inputSi.getPrim(primPath).primType })
      }
    }

    // Use set difference to remove prefixes that were already pruned (i.e.
    // duplicates). These paths are guaranteed to not be in
    // noLongerPrunedPrefixes.
    //
    // (std::set_difference over the two sorted vectors.)
    const oldSet = new Set(oldPrefixes)
    const newlyPrunedPrefixes = newPrefixes.filter((p) => !oldSet.has(p))

    const removedEntries: RemovedPrimEntry[] = []
    for (const prefix of newlyPrunedPrefixes) {
      removedEntries.push({ primPath: prefix })
    }

    this._sortedExcludePaths = newPrefixes
    this._sendPrimsAdded(addedEntries)
    this._sendPrimsRemoved(removedEntries)
  }

  // HdSingleInputFilteringSceneIndexBase overrides

  /** prefixPathPruningSceneIndex.cpp:241-261 */
  protected _primsAdded(_sender: HdSceneIndexBase, entries: AddedPrimEntry[]): void {
    if (!this._isObserved()) {
      return
    }

    if (this._sortedExcludePaths.length === 0) {
      this._sendPrimsAdded(entries)
      return
    }

    const filteredEntries: AddedPrimEntry[] = []
    this._sendPrimsAdded(
      _RemovePrunedNoticeEntries(
        this._sortedExcludePaths, entries, filteredEntries))
  }

  /** prefixPathPruningSceneIndex.cpp:263-283 */
  protected _primsRemoved(_sender: HdSceneIndexBase, entries: RemovedPrimEntry[]): void {
    if (!this._isObserved()) {
      return
    }

    if (this._sortedExcludePaths.length === 0) {
      this._sendPrimsRemoved(entries)
      return
    }

    const filteredEntries: RemovedPrimEntry[] = []
    this._sendPrimsRemoved(
      _RemovePrunedNoticeEntries(
        this._sortedExcludePaths, entries, filteredEntries))
  }

  /** prefixPathPruningSceneIndex.cpp:285-305 */
  protected _primsDirtied(_sender: HdSceneIndexBase, entries: DirtiedPrimEntry[]): void {
    if (!this._isObserved()) {
      return
    }

    if (this._sortedExcludePaths.length === 0) {
      this._sendPrimsDirtied(entries)
      return
    }

    const filteredEntries: DirtiedPrimEntry[] = []
    this._sendPrimsDirtied(
      _RemovePrunedNoticeEntries(
        this._sortedExcludePaths, entries, filteredEntries))
  }

  /** prefixPathPruningSceneIndex.cpp:321-325 */
  private _isPruned(primPath: string): boolean {
    return _IsPrunedImpl(primPath, this._sortedExcludePaths)
  }

  /** prefixPathPruningSceneIndex.cpp:327-347. Returns the filtered vector
   *  instead of erasing in place. */
  private _removePrunedChildren(childPaths: string[]): string[] {
    if (childPaths.length === 0) {
      return childPaths
    }

    return childPaths.filter((childPath) => !this._isPruned(childPath))
  }
}

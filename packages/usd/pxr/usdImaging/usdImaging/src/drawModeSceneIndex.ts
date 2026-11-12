// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/drawModeSceneIndex.cpp,
//  pxr/usdImaging/usdImaging/drawModeSceneIndex.h
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/drawModeSceneIndex.{h,cpp}
// (OpenUSD 26.11.1).
//
// Divergences:
// - SdfPath is a string. _prims is a Map with its keys also kept sorted as
//   SdfPath::operator< orders prim paths, standing for the ordered
//   std::map<SdfPath, ...>, so _FindPrefixOfPath is upstream's lower_bound
//   search. _DeleteSubtree scans the keys.
// - The std::set<SdfPath> of _PrimsDirtied is a sorted array ordered as
//   SdfPath::operator< orders prim paths (element-wise, ancestors first).
// - _PrimsAdded queries the input prims serially (upstream uses
//   WorkParallelForN); the order of the processed entries is the same.

import {
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  SingleInputFilteringSceneIndexBase as HdSingleInputFilteringSceneIndexBase,
} from 'typescript-usd/hd'
import type {
  AddedPrimEntry as HdSceneIndexObserverAddedPrimEntry,
  ContainerDataSource as HdContainerDataSource,
  DirtiedPrimEntry as HdSceneIndexObserverDirtiedPrimEntry,
  RemovedPrimEntry as HdSceneIndexObserverRemovedPrimEntry,
  SceneIndexBase as HdSceneIndexBase,
  SceneIndexPrim as HdSceneIndexPrim,
} from 'typescript-usd/hd'
import { UsdImaging_GetDrawModeStandin, type UsdImaging_DrawModeStandin } from './drawModeStandin.ts'
import { UsdImagingGeomModelSchema, UsdImagingGeomModelSchemaTokens } from './geomModelSchema.ts'
import { TF_VERIFY } from './tfDiagnostic.ts'
import { UsdImagingTokens } from './tokens.ts'

/** SdfPath::GetParentPath().GetNameToken() for an absolute prim path. */
function _ParentNameToken(path: string): string {
  if (path === '/') return ''
  const i = path.lastIndexOf('/')
  const parent = i <= 0 ? '/' : path.slice(0, i)
  if (parent === '/') return ''
  return parent.slice(parent.lastIndexOf('/') + 1)
}

/** SdfPath::GetParentPath() for an absolute prim path ('' for the root). */
function _ParentPath(path: string): string {
  if (path === '/' || path === '') return ''
  const i = path.lastIndexOf('/')
  return i <= 0 ? '/' : path.slice(0, i)
}

/** SdfPath::GetPathElementCount() for an absolute prim path. */
function _PathElementCount(path: string): number {
  if (path === '/' || path === '') return 0
  return path.split('/').length - 1
}

/** SdfPath::HasPrefix() for absolute prim paths. The empty path is a prefix
 *  of nothing. */
function _HasPrefix(path: string, prefix: string): boolean {
  if (prefix === '' || path === '') return false
  if (prefix === '/') return path.startsWith('/')
  return path === prefix || path.startsWith(prefix + '/')
}

/** SdfPath::operator< for absolute prim paths: element-wise comparison from
 *  the root, ancestors before descendants. */
function _PathLess(a: string, b: string): number {
  const ea = a === '/' ? [] : a.split('/').slice(1)
  const eb = b === '/' ? [] : b.split('/').slice(1)
  const n = Math.min(ea.length, eb.length)
  for (let i = 0; i < n; i++) {
    if (ea[i]! < eb[i]!) return -1
    if (ea[i]! > eb[i]!) return 1
  }
  return ea.length - eb.length
}

/** drawModeSceneIndex.cpp:34-63: resolve draw mode for prim from input
 *  scene index. Default draw mode can be expressed by either the empty
 *  token or UsdGeomTokens->default_. */
function _GetDrawMode(path: string, prim: HdSceneIndexPrim): string {
  const empty = ''

  if (_ParentNameToken(path) ===
      UsdImagingTokens.niPropagatedPrototypesScope) {
    // Instance aggregation copies the instance's geomModel onto this
    // grouping prim to hash it; the prim itself is not a model.
    return empty
  }

  const geomModelSchema = UsdImagingGeomModelSchema.getFromParent(prim.dataSource)

  const applySrc = geomModelSchema.getApplyDrawMode()
  if (!applySrc) {
    return empty
  }
  if (!applySrc.getTypedValue(0.0)) {
    return empty
  }

  const modeSrc = geomModelSchema.getDrawMode()
  if (!modeSrc) {
    return empty
  }
  return modeSrc.getTypedValue(0.0)
}

/** The std::map<SdfPath, UsdImaging_DrawModeStandinSharedPtr> of _prims: a
 *  Map whose keys are also kept in SdfPath order (see the header). */
class _StandinMap {
  private readonly _map = new Map<string, UsdImaging_DrawModeStandin>()
  /** The keys, sorted. */
  readonly sortedKeys: string[] = []
  get size(): number { return this._map.size }
  get(path: string): UsdImaging_DrawModeStandin | undefined { return this._map.get(path) }
  keys(): IterableIterator<string> { return this._map.keys() }
  set(path: string, standin: UsdImaging_DrawModeStandin): void {
    if (!this._map.has(path)) {
      this.sortedKeys.splice(_LowerBound(this.sortedKeys, path), 0, path)
    }
    this._map.set(path, standin)
  }
  delete(path: string): void {
    if (!this._map.delete(path)) return
    this.sortedKeys.splice(_LowerBound(this.sortedKeys, path), 1)
  }
}

/** std::lower_bound: the first index whose key is not less than path
 *  (_PathLess's order, compared by character with the separator first, which
 *  orders names element by element). */
function _LowerBound(keys: readonly string[], path: string): number {
  let lo = 0, hi = keys.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (_PathCompare(keys[mid]!, path) < 0) lo = mid + 1
    else hi = mid
  }
  return lo
}

function _PathCompare(a: string, b: string): number {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    const ca = a.charCodeAt(i), cb = b.charCodeAt(i)
    if (ca === cb) continue
    if (ca === 0x2f) return -1
    if (cb === 0x2f) return 1
    return ca - cb
  }
  return a.length - b.length
}

/** drawModeSceneIndex.cpp:69-89. Returns the key. */
function _FindPrefixOfPath(container: _StandinMap, path: string): string | undefined {
  const keys = container.sortedKeys
  // std::map::lower_bound.
  const it = _LowerBound(keys, path)
  if (it < keys.length && keys[it] === path) {
    // Path itself is in the container
    return path
  }
  // If a prefix of path is in container, it will point to the next element
  // in the container, rather than the prefix itself.
  if (it === 0) {
    return undefined
  }
  const prev = keys[it - 1]!
  return _HasPrefix(path, prev) ? prev : undefined
}

/** drawModeSceneIndex.cpp:89-95 */
function _IsImmediateChildOf(path: string, parentPath: string): boolean {
  return _PathElementCount(path) - _PathElementCount(parentPath) === 1 &&
    _HasPrefix(path, parentPath)
}

/** std::set<size_t>: a binary min-heap popping the smallest index. */
class _IndexMinHeap {
  private readonly _heap: number[] = []
  get size(): number { return this._heap.length }
  insert(v: number): void {
    const h = this._heap
    h.push(v)
    let i = h.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (h[p]! <= h[i]!) break
      ;[h[p], h[i]] = [h[i]!, h[p]!]
      i = p
    }
  }
  pop(): number {
    const h = this._heap
    const top = h[0]!
    const last = h.pop()!
    if (h.length > 0) {
      h[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < h.length && h[l]! < h[m]!) m = l
        if (r < h.length && h[r]! < h[m]!) m = r
        if (m === i) break
        ;[h[m], h[i]] = [h[i]!, h[m]!]
        i = m
      }
    }
    return top
  }
}

/** drawModeSceneIndex.cpp:97-164: deduplicates (a later PrimAddedEntry for
 *  the same path wins w.r.t. prim type) and ensures entries for ancestor
 *  paths precede entries for their descendants. */
function _NormalizeAddedEntries(
  entries: readonly HdSceneIndexObserverAddedPrimEntry[],
): HdSceneIndexObserverAddedPrimEntry[] {
  const n = entries.length

  // map of prim path to index of last entry with that path;
  // last encountered duplicate will "win"
  const pathToLastIndex = new Map<string, number>()
  for (let i = 0; i < n; ++i) {
    pathToLastIndex.set(entries[i]!.primPath, i)
  }

  // index of entry[i]'s nearest ancestor;
  // n if no ancestor in entries
  const parent: number[] = new Array<number>(n).fill(n)
  // inverse of parent - indices of entry[i]'s nearest descendants
  const children: number[][] = Array.from({ length: n }, () => [])
  for (let i = 0; i < n; ++i) {
    const path = entries[i]!.primPath
    if (pathToLastIndex.get(path) !== i) { continue }
    if (path === '/') { continue }
    for (let p = _ParentPath(path); ; p = _ParentPath(p)) {
      const it = pathToLastIndex.get(p)
      if (it !== undefined) {
        parent[i] = it
        children[it]!.push(i)
        break
      }
      if (_PathElementCount(p) === 0) { break }
    }
  }

  // Topological sorting (Kahn 1962)

  // sorted output entries (L)
  const sortedEntries: HdSceneIndexObserverAddedPrimEntry[] = []
  // nodes with no incoming edge (S)
  const s = new _IndexMinHeap()
  for (let i = 0; i < n; ++i) {
    if (pathToLastIndex.get(entries[i]!.primPath) === i && parent[i] === n) {
      s.insert(i)
    }
  }

  while (s.size > 0) {
    // pop a node from front of S
    const i = s.pop()
    // push node to L
    sortedEntries.push(entries[i]!)
    // push nearest descendants to S
    for (const ci of children[i]!) {
      s.insert(ci)
    }
  }

  return sortedEntries
}

/** drawModeSceneIndex.h:26-97: a scene index replacing geometry based on
 *  the draw mode.
 *
 *  Note that the draw mode is computed at prim level and only applied to the
 *  prim if apply draw mode is true. Descendants of a prim with non-default
 *  draw mode are dropped and replaced by the stand-in geometry. */
export class UsdImagingDrawModeSceneIndex extends HdSingleInputFilteringSceneIndexBase {
  /** For prims with applyDrawMode, store a DrawModeStandin object
   *  that can be queried for the stand-in geometry.
   *  No path in the map is a prefix of any other path in the map. */
  private readonly _prims = new _StandinMap()

  /** drawModeSceneIndex.cpp:168-176. inputArgs unused for now. In the
   *  future, we might use it to say that we want to break up the geometry
   *  and use UsdPreviewSurface to work across different renderers. */
  static new(
    inputSceneIndex: HdSceneIndexBase,
    inputArgs: HdContainerDataSource | undefined,
  ): UsdImagingDrawModeSceneIndex {
    return new UsdImagingDrawModeSceneIndex(inputSceneIndex, inputArgs)
  }

  /** drawModeSceneIndex.cpp:178-190 */
  protected constructor(
    inputSceneIndex: HdSceneIndexBase,
    _inputArgs: HdContainerDataSource | undefined,
  ) {
    super(inputSceneIndex)

    const rootPath = '/'

    const prim = this._getInputSceneIndex().getPrim(rootPath)

    this._recursePrims(_GetDrawMode(rootPath, prim), rootPath, prim, undefined)
  }

  /** drawModeSceneIndex.cpp:194-209: finds prim or ancestor of prim with
   *  non-trivial drawmode in _prims map. isPathDescendant.value is set to
   *  true if the given path is a descendant of such a prim (but not the prim
   *  itself). */
  private _findStandinForPrimOrAncestor(
    path: string, isPathDescendant?: { value: boolean },
  ): UsdImaging_DrawModeStandin | undefined {
    const key = _FindPrefixOfPath(this._prims, path)
    if (key === undefined) {
      return undefined
    }
    if (isPathDescendant) {
      isPathDescendant.value = _PathElementCount(path) > _PathElementCount(key)
    }
    return this._prims.get(key)
  }

  /** drawModeSceneIndex.cpp:211-225 */
  getPrim(primPath: string): HdSceneIndexPrim {
    // Do we have this prim path or an ancestor prim path in the
    // _prims map?
    const standin = this._findStandinForPrimOrAncestor(primPath)
    if (standin) {
      return standin.getPrim(primPath)
    }

    return this._getInputSceneIndex().getPrim(primPath)
  }

  /** drawModeSceneIndex.cpp:227-254 */
  getChildPrimPaths(primPath: string): string[] {
    // Do we have this prim path or an ancestor prim path in the
    // _prims map?
    const standin = this._findStandinForPrimOrAncestor(primPath)
    if (standin) {
      // standin->GetDescendantPrimPaths() gives all descendants, but
      // we just want the queried prim's direct children so we only
      // want the descendant paths with the full queried path as prefix and
      // exactly one additional path component. This works whether the
      // queried path is for the typeless container (children: standin prim +
      // materials), the standin prim (children: subsets), a subset (children:
      // none), or a material (children: none).
      const paths: string[] = []
      for (const path of standin.getPrimPaths()) {
        if (_IsImmediateChildOf(path, primPath)) {
          paths.push(path)
        }
      }
      return paths
    }

    return this._getInputSceneIndex().getChildPrimPaths(primPath)
  }

  /** drawModeSceneIndex.cpp:256-263: delete path and all descendents from
   *  _prims. */
  private _deleteSubtree(path: string): void {
    for (const key of [...this._prims.keys()]) {
      if (_HasPrefix(key, path)) {
        this._prims.delete(key)
      }
    }
  }

  /** drawModeSceneIndex.cpp:265-293: pull prim at path and recursively its
   *  descendants from input scene index - stopping the recursion when a prim
   *  with non-default drawmode is hit. When a prim has non-trivial drawmode,
   *  the DrawModeStandin object is instantiated instead. */
  private _recursePrims(
    mode: string, path: string, prim: HdSceneIndexPrim,
    entries: HdSceneIndexObserverAddedPrimEntry[] | undefined,
  ): void {
    const standin = UsdImaging_GetDrawModeStandin(mode, path, prim.dataSource)
    if (standin) {
      // The prim needs to be replaced by stand-in geometry.
      // Send added entries for stand-in geometry.
      if (entries) {
        standin.computePrimAddedEntries(entries)
      }
      // And store it.
      this._prims.set(path, standin)
    } else {
      // Mark prim as added and recurse to children.
      if (entries) {
        entries.push({ primPath: path, primType: prim.primType })
      }
      const s = this._getInputSceneIndex()
      for (const childPath of s.getChildPrimPaths(path)) {
        const childPrim = s.getPrim(childPath)
        this._recursePrims(
          _GetDrawMode(childPath, childPrim), childPath, childPrim, entries)
      }
    }
  }

  /** drawModeSceneIndex.cpp:295-461 */
  protected _primsAdded(
    _sender: HdSceneIndexBase,
    entries: HdSceneIndexObserverAddedPrimEntry[],
  ): void {
    const newEntries: HdSceneIndexObserverAddedPrimEntry[] = []
    const removedEntries: HdSceneIndexObserverRemovedPrimEntry[] = []

    // Reorder into topological (ancestors-before-descendants) order, which
    // this handler relies on. See comments below concerning order dependence.
    const sortedEntries = _NormalizeAddedEntries(entries)

    // Loop over notices to determine the prims that have a draw mode. Since
    // the prim container is used to determine this, it can be quite expensive.
    // So, we parallelize the work below with the caveat that we may be querying
    // descendant prims under a tracked prim that has a draw mode.
    // XXX: We preserve the order of the sorted notice entries to work around a
    // bug in backend emulation in the handling of geom subset prims.
    //
    const entryPrimPairs: [HdSceneIndexObserverAddedPrimEntry, HdSceneIndexPrim][] = []
    for (const entry of sortedEntries) {
      const path = entry.primPath
      const prim = this._getInputSceneIndex().getPrim(path)
      entryPrimPairs.push([entry, prim])
    }

    // Serial loop for simplicity because _prims is not thread safe.
    //
    for (const [entry, prim] of entryPrimPairs) {
      const path = entry.primPath

      // Suppress prims from input scene delegate that have an ancestor
      // with a draw mode.
      //
      // XXX: Notice Order Dependence
      // Assume </Foo> has draw mode enabled and </Foo/Bar>
      // does not. _prims contains a standin for </Foo>. Now we
      // disable draw mode on </Foo>. ModelAPIAdapter issues a resync
      // for </Foo> and </Foo/Bar> as Added notices. This code works
      // as written only if the </Foo> Added notice strictly precedes
      // the </Foo/Bar> Added notice.
      //
      // If, for some reason, </Foo/Bar>'s Added notice arrives before
      // </Foo>'s, we will silently quash </Foo/Bar>'s Added notice,
      // and the original geometry never makes it back into the scene.
      // As noted below, a merging scene index can introduce non-
      // deterministic notice ordering due to parallelized notice
      // processing.
      const isPathDescendant = { value: false }
      if (this._findStandinForPrimOrAncestor(path, isPathDescendant)) {
        if (isPathDescendant.value) {
          continue
        }
      }

      const drawMode = _GetDrawMode(path, prim)

      const standin = UsdImaging_GetDrawModeStandin(drawMode, path, prim.dataSource)
      if (standin) {
        // Sending out removed entry here for the following scenario:
        // Assume that the input to the draw mode scene index has a
        // prim with non-default draw mode at /Foo and a prim at /Foo/Bar.
        // The draw mode scene index has not yet received a prims added
        // call for /Foo (thus, there is no entry for /Foo in
        // UsdImagingDrawModeSceneIndex::_prim), yet a client scene
        // index asked for the prim at /Foo/Bar.
        // At this point, the draw mode scene index returns a valid
        // prim for GetPrim(/Foo/Bar) with prim type determined from the
        // input scene index. This is incorrect as the prim should be
        // dropped because of /Foo's draw mode. Similarly, for
        // GetChildPrimPaths.
        // When the PrimsAdded message for /Foo arrived, the
        // UsdImagingDrawModeSceneIndex will update _prim. And it can
        // now rectify the situation by sending out a removes prim
        // message for /Foo.
        //
        // Note that this happens when there are prototype propagating
        // scene indices have been connected to a
        // UsdImagingStageSceneIndex before the call to
        // UsdImagingStageSceneIndex::SetStage.
        // The prototype propagating scene index inserts propagated
        // prototypes into the merging scene index. When a scene
        // index is added to the merging scene index, it traverses
        // it through GetChildPrimPaths to emit the necessary prims
        // added messages. In particular, it might call
        // GetChildPrimPaths for a prim inside a prototype before
        // the PrimsAdded message for that prim was emitted by the
        // UsdImagingStageSceneIndex.
        //
        this._deleteSubtree(path)
        // XXX: We should not send removal for path (</Foo>), since that
        // prim still exists. This is an Added notice, after all. When the
        // removal for </Foo> reaches the merging scene index, it will call
        // GetPrim(</Foo>) and see that a prim still exists there. So it
        // will turn the Removed notice for </Foo> into an Added notice for
        // </Foo> and all its descendants (via GetChildPrimPaths()). Since
        // we also issue Added notices for </Foo> and its descendant standin
        // prims (via ComputePrimAddedEntries()), the merging scene index
        // ends up issuing two separate Added calls for </Foo> and its
        // entire standin subtree. And while notice batching will combine
        // the separate _PrimsAdded() calls into one, it does not
        // deduplicate the individual Added entries. So two full sets of
        // Added entries for the </Foo> standin subtree make it to every
        // downstream consumer, triggering unnecessary prim resyncs.
        //
        // Instead, we issue Removed notices for all the immediate children
        // of </Foo> that will be replaced by the standin, but not for
        // </Foo> itself. No need to descend below immediate children,
        // since removal of a prim removes its subtree. We then issue Added
        // for </Foo> and its new standin descendants.
        for (const childPath of this._getInputSceneIndex().getChildPrimPaths(path)) {
          removedEntries.push({ primPath: childPath })
        }

        // The prim needs to be replaced by stand-in geometry. Note that
        // this is also where the Added notice for the draw-mode-enabled
        // prim we're currently processing gets forwarded to newEntries
        // with its new empty primType.
        standin.computePrimAddedEntries(newEntries)
        this._prims.set(path, standin)
      } else {
        // XXX: Notice Order Dependence
        // If we are here, the prim being added does not have draw mode
        // enabled and has no ancestor with draw mode enabled. But if this
        // prim previously had draw mode enabled, a stand-in for it still
        // exists in the _prims cache, and the standin prims need to be
        // removed from the scene.
        const it = this._prims.get(path)
        if (it) {
          for (const standinPath of it.getPrimPaths()) {
            // Do not remove *this* prim! Just its stand-in descendants.
            if (standinPath !== path) {
              removedEntries.push({ primPath: standinPath })
            }
          }
          // Clear the _prims cache of this standin
          this._deleteSubtree(path)
        }
        // Note that this is where the Added notice for the
        // draw-mode-disabled prim we're currently processing gets forwarded
        // to newEntries with its restored prim type (if any).
        newEntries.push(entry)
      }
    }

    this._sendPrimsRemoved(removedEntries)
    this._sendPrimsAdded(newEntries)
  }

  /** drawModeSceneIndex.cpp:463-482 */
  protected _primsRemoved(
    _sender: HdSceneIndexBase,
    entries: HdSceneIndexObserverRemovedPrimEntry[],
  ): void {
    if (this._prims.size > 0) {
      for (const entry of entries) {
        // Delete corresponding stand-in geometry.
        this._deleteSubtree(entry.primPath)
      }
    }

    if (!this._isObserved()) {
      return
    }

    this._sendPrimsRemoved(entries)
  }

  private static _drawModeLocators: HdDataSourceLocatorSet | undefined

  /** drawModeSceneIndex.cpp:484-650 */
  protected _primsDirtied(
    _sender: HdSceneIndexBase,
    entries: HdSceneIndexObserverDirtiedPrimEntry[],
  ): void {
    // Determine the paths of all prims whose draw mode might have changed.
    const pathSet = new Set<string>()

    const drawModeLocators = UsdImagingDrawModeSceneIndex._drawModeLocators ??=
      new HdDataSourceLocatorSet([
        UsdImagingGeomModelSchema.getDefaultLocator().append(
          UsdImagingGeomModelSchemaTokens.drawMode),
        UsdImagingGeomModelSchema.getDefaultLocator().append(
          UsdImagingGeomModelSchemaTokens.applyDrawMode)])

    for (const entry of entries) {
      if (drawModeLocators.intersects(entry.dirtyLocators)) {
        pathSet.add(entry.primPath)
      }
    }
    const paths = [...pathSet].sort(_PathLess)

    const removedEntries: HdSceneIndexObserverRemovedPrimEntry[] = []
    const addedEntries: HdSceneIndexObserverAddedPrimEntry[] = []

    if (paths.length > 0) {
      // Draw mode changed means we need to remove the stand-in geometry
      // or prims forwarded from the input scene delegate and then (re-)add
      // the stand-in geometry or prims from the input scene delegate.

      // Set this to skip all descendants of a given path.
      let lastPath = ''
      for (const path of paths) {
        // Skip all descendants of lastPath - if lastPath is not empty.
        if (_HasPrefix(path, lastPath)) {
          continue
        }
        lastPath = ''

        // Suppress prims from input scene delegate that have an ancestor
        // with a draw mode.
        const isPathDescendant = { value: false }
        if (this._findStandinForPrimOrAncestor(path, isPathDescendant)) {
          if (isPathDescendant.value) {
            continue
          }
        }

        // Determine new draw mode.
        const prim = this._getInputSceneIndex().getPrim(path)
        const drawMode = _GetDrawMode(path, prim)

        const it = this._prims.get(path)
        if (!it) {
          // Prim used to have default draw mode.
          const standin = UsdImaging_GetDrawModeStandin(drawMode, path, prim.dataSource)
          if (standin) {
            // Prim now has non-default draw mode and we need to use
            // stand-in geometry.
            //
            // Delete old geometry.
            this._deleteSubtree(path)
            removedEntries.push({ primPath: path })
            // Add new stand-in geometry.
            standin.computePrimAddedEntries(addedEntries)
            this._prims.set(path, standin)
            // Do not traverse descendants of this prim.
            lastPath = path
          }
        } else {
          if (it.getDrawMode() !== drawMode) {
            // Draw mode has changed (including changed to default).
            //
            // Delete old geometry.
            this._deleteSubtree(path)
            removedEntries.push({ primPath: path })
            // Different scenarios are possible:
            // 1. The prim was switched to default draw mode. We need
            //    to recursively pull the geometry from the input scene
            //    index again and send corresponding added entries.
            //    If the prim has a descendant with non-default draw
            //    mode, the recursion stops and we use stand-in
            //    geometry instead.
            // 2. The prim switched to a different non-default draw
            //    mode. This can be regarded as the special case where
            //    the recursion immediately stops.
            this._recursePrims(drawMode, path, prim, addedEntries)
            // Since we recursed to all descendants of the prim, ignore
            // any descendants here.
            lastPath = path
          }
        }
      }
    }

    if (this._prims.size === 0) {
      if (removedEntries.length > 0) {
        this._sendPrimsRemoved(removedEntries)
      }
      if (addedEntries.length > 0) {
        this._sendPrimsAdded(addedEntries)
      }
      this._sendPrimsDirtied(entries)
      return
    }

    // Now account for dirtyLocators not related to resolving the draw mode.

    const dirtiedEntries: HdSceneIndexObserverDirtiedPrimEntry[] = []

    for (const entry of entries) {
      const path = entry.primPath
      const isPathDescendant = { value: false }
      const standin = this._findStandinForPrimOrAncestor(path, isPathDescendant)
      if (!standin) {
        // Prim and all its ancestors have default draw mode,
        // just forward entry.
        dirtiedEntries.push(entry)
        continue
      }

      if (isPathDescendant.value) {
        // Descendants of prims with non-default draw mode can be ignored.
        continue
      }

      // Prim replaced by stand-in geometry has changed. Determine how
      // stand-in geometry is affected by changed attributed on prim.
      // ProcessDirtyLocators will do this; if the prim has changed in a
      // way that requires us to regenerate it (e.g., an axis has been added
      // or removed), it will set needsRefresh to true and we can then call
      // _RefreshDrawModeStandin. Note that _RefreshDrawModeStandin calls
      // _SendPrimsRemoved and _SendPrimsAdded as needed.

      const needsRefresh = { value: false }
      standin.processDirtyLocators(entry.dirtyLocators, dirtiedEntries, needsRefresh)
      if (needsRefresh.value) {
        const newStandin = UsdImaging_GetDrawModeStandin(
          standin.getDrawMode(),
          path,
          this._getInputSceneIndex().getPrim(path).dataSource)
        if (!TF_VERIFY(newStandin)) {
          continue
        }
        removedEntries.push({ primPath: path })
        newStandin!.computePrimAddedEntries(addedEntries)
        this._prims.set(path, newStandin!)
      }
    }
    if (removedEntries.length > 0) {
      this._sendPrimsRemoved(removedEntries)
    }
    if (addedEntries.length > 0) {
      this._sendPrimsAdded(addedEntries)
    }
    if (dirtiedEntries.length > 0) {
      this._sendPrimsDirtied(dirtiedEntries)
    }
  }
}

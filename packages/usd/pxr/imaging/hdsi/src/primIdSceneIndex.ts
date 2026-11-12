// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdsi/primIdSceneIndex.cpp,
//  pxr/imaging/hdsi/primIdSceneIndex.h
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/imaging/hdsi/primIdSceneIndex.{h,cpp}.
//
// Paths are the string paths this port's Hydra uses. The SdfPathTable
// _pathToId is a Map holding only the paths that have (or had) an id: the
// empty entries the table adds for ancestors answer GetId as an absent entry
// does, and a subtree is the paths at or below a path. TRACE_FUNCTION scopes
// are not ported.

import { Type as TfType } from 'typescript-usd/tf'
import { SdfPath } from 'typescript-usd/sdf/path'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import {
  ContainerDataSource as HdContainerDataSource,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  OverlayContainerDataSource as HdOverlayContainerDataSource,
  PrimIdSchema as HdPrimIdSchema,
  PrimTypeIsGprim as HdPrimTypeIsGprim,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  SceneGlobalsSchema as HdSceneGlobalsSchema,
  SceneIndexPrimView as HdSceneIndexPrimView,
  SingleInputFilteringSceneIndexBase as HdSingleInputFilteringSceneIndexBase,
  VectorDataSource as HdVectorDataSource,
} from 'typescript-usd/hd'
import type {
  AddedPrimEntry,
  DataSourceBase as HdDataSourceBase,
  DirtiedPrimEntry,
  RemovedPrimEntry,
  SceneIndexBase as HdSceneIndexBase,
  SceneIndexPrim as HdSceneIndexPrim,
} from 'typescript-usd/hd'

const _SdfPathType = TfType.declare('SdfPath')

/** primIdSceneIndex.cpp:38-58 _OptionalPrimId: an id, or undefined. */
type _OptionalPrimId = number | undefined

/** A slot of _idToPathOrNextFreeId (primIdSceneIndex.cpp:202-212): the path
 *  an id is assigned to, or the next free id of the free list. */
type _IdSlot = { path: string } | { nextFreeId: _OptionalPrimId }

function _IsInSubtree(path: string, root: string): boolean {
  return SdfPath.fromString(path).hasPrefix(SdfPath.fromString(root))
}

/**
 * Scene index state (primIdSceneIndex.cpp:60-217): mapping between
 * imageable prim paths and their prim ids.
 */
class _PrimIdInfo {
  // Prim path to prim Id. We do not add an entry for non-imageable prims.
  private _pathToId = new Map<string, _OptionalPrimId>()
  // Inverse of the above path table. If the element at index i holds a
  // path, then i is the Id assigned to the prim at that path. All other
  // elements form a linked list of unassigned Ids.
  private _idToPathOrNextFreeId: _IdSlot[] = []
  // Head of the linked list of free ids (not necessarily the smallest free
  // Id).
  private _firstFreeId: _OptionalPrimId = undefined

  /** primIdSceneIndex.cpp:67-80: assign an id to the given path if it does
   *  not have one yet. Returns true if a new id was assigned. */
  assignIdToPath(path: string): boolean {
    if (this._pathToId.get(path) !== undefined) {
      // Already has a prim Id.
      return false
    }
    // Assign the new prim Id.
    this._pathToId.set(path, this._allocateId(path))
    return true
  }

  /** primIdSceneIndex.cpp:82-100: free the id of the given path but not the
   *  descendants. Returns true if the prim had an Id (and it was freed). */
  removeAssignedIdForPath(path: string): boolean {
    const id = this._pathToId.get(path)
    if (id === undefined) {
      return false
    }
    this._freeId(id)
    this._pathToId.delete(path)
    return true
  }

  /** primIdSceneIndex.cpp:102-117: free the ids of the given path and all
   *  its descendants. Returns true if any id was freed. */
  removeSubtree(path: string): boolean {
    let freed = false
    for (const [entryPath, id] of [...this._pathToId]) {
      if (!_IsInSubtree(entryPath, path)) continue
      if (id !== undefined) {
        this._freeId(id)
        freed = true
      }
      this._pathToId.delete(entryPath)
    }
    return freed
  }

  /** primIdSceneIndex.cpp:119-124 */
  clear(): void {
    this._pathToId = new Map()
    this._idToPathOrNextFreeId = []
    this._firstFreeId = undefined
  }

  /** primIdSceneIndex.cpp:126-135: the id assigned to path or undefined. */
  getId(path: string): _OptionalPrimId {
    return this._pathToId.get(path)
  }

  /** primIdSceneIndex.cpp:137-141: the total number of assigned and free
   *  ids. It is an upper bound of any prim id. */
  getNumIds(): number {
    return this._idToPathOrNextFreeId.length
  }

  /** primIdSceneIndex.cpp:143-156: the path for id, or the empty path if id
   *  is out of range or free. */
  getPathFromId(id: number): string {
    const slot = this._idToPathOrNextFreeId[id]
    if (!slot || !('path' in slot)) {
      return ''
    }
    return slot.path
  }

  /** primIdSceneIndex.cpp:159-184: allocate an id for the given path. */
  private _allocateId(path: string): number {
    if (this._firstFreeId !== undefined) {
      // Re-use a free Id if possible.
      const id = this._firstFreeId
      // The slot holds the next free id in the list.
      const slot = this._idToPathOrNextFreeId[id]!
      if ('nextFreeId' in slot) {
        this._firstFreeId = slot.nextFreeId
        this._idToPathOrNextFreeId[id] = { path }
      }
      return id
    }
    // Use a new Id.
    const id = this._idToPathOrNextFreeId.length
    this._idToPathOrNextFreeId.push({ path })
    return id
  }

  /** primIdSceneIndex.cpp:186-192: free the given id (push it onto the
   *  linked list). */
  private _freeId(id: number): void {
    this._idToPathOrNextFreeId[id] = { nextFreeId: this._firstFreeId }
    this._firstFreeId = id
  }
}

/** primIdSceneIndex.cpp:219-277: prim-level container data source for an
 *  imageable prim overlaying the input data source with the prim Id schema. */
class _PrimDataSource extends HdContainerDataSource {
  constructor(
    private readonly _inputDataSource: HdContainerDataSource | undefined,
    private readonly _primIdInfo: _PrimIdInfo,
    private readonly _primPath: string,
  ) { super() }

  static new(
    inputDataSource: HdContainerDataSource | undefined,
    primIdInfo: _PrimIdInfo,
    primPath: string,
  ): _PrimDataSource {
    return new _PrimDataSource(inputDataSource, primIdInfo, primPath)
  }

  getNames(): string[] {
    const names = this._inputDataSource ? [...this._inputDataSource.getNames()] : []
    if (!names.includes(HdPrimIdSchema.getSchemaToken())) {
      names.push(HdPrimIdSchema.getSchemaToken())
    }
    return names
  }

  Get(name: string): HdDataSourceBase | undefined {
    if (name === HdPrimIdSchema.getSchemaToken()) {
      return this._computePrimIdDataSource()
    }
    return this._inputDataSource?.Get(name)
  }

  /** primIdSceneIndex.cpp:259-271: looks up primId in table and puts it
   *  into HdPrimIdSchema. */
  private _computePrimIdDataSource(): HdContainerDataSource | undefined {
    const id = this._primIdInfo.getId(this._primPath)
    if (id === undefined) {
      return undefined
    }
    return new HdPrimIdSchema.Builder()
      .setPrimId(new HdRetainedTypedSampledDataSource<number>(id, VtValueTypes.uint))
      .build()
  }
}

/** primIdSceneIndex.cpp:279-306: reverse prim id to path table as data
 *  source. */
class _PrimIdTableDataSource extends HdVectorDataSource {
  constructor(private readonly _primIdInfo: _PrimIdInfo) { super() }

  static new(primIdInfo: _PrimIdInfo): _PrimIdTableDataSource {
    return new _PrimIdTableDataSource(primIdInfo)
  }

  getNumElements(): number {
    return this._primIdInfo.getNumIds()
  }

  getElement(element: number): HdDataSourceBase | undefined {
    const path = this._primIdInfo.getPathFromId(element)
    if (path === '') {
      return undefined
    }
    return new HdRetainedTypedSampledDataSource<string>(path, _SdfPathType)
  }
}

/**
 * A scene index assigning a unique prim id to every gprim (HdPrimIdSchema)
 * and serving the inverse table as the primIdToPath of the
 * HdSceneGlobalsSchema at the root prim (primIdSceneIndex.h:39-83).
 */
export class HdsiPrimIdSceneIndex extends HdSingleInputFilteringSceneIndexBase {
  // State for this scene index.
  private readonly _primIdInfo = new _PrimIdInfo()
  // Prim-level container ({ sceneGlobals : { primId : <reverse table> } })
  // overlaid on the root prim.
  private readonly _rootPrimOverlayDataSource: HdContainerDataSource

  /** primIdSceneIndex.h:42-48: creates a new prim id scene index. */
  static new(inputScene: HdSceneIndexBase): HdsiPrimIdSceneIndex {
    return new HdsiPrimIdSceneIndex(inputScene)
  }

  /** primIdSceneIndex.cpp:312-332 */
  protected constructor(inputScene: HdSceneIndexBase) {
    super(inputScene)
    this._rootPrimOverlayDataSource = HdRetainedContainerDataSource.new(
      [HdSceneGlobalsSchema.getSchemaToken()],
      [new HdSceneGlobalsSchema.Builder()
        .setPrimIdToPath(_PrimIdTableDataSource.new(this._primIdInfo))
        .build()])

    const input = this._getInputSceneIndex()
    for (const primPath of new HdSceneIndexPrimView(input)) {
      if (HdPrimTypeIsGprim(input.getPrim(primPath).primType)) {
        this._primIdInfo.assignIdToPath(primPath)
      }
    }
  }

  /** primIdSceneIndex.cpp:336-359 */
  getPrim(primPath: string): HdSceneIndexPrim {
    const prim = this._getInputSceneIndex().getPrim(primPath)

    if (primPath === '/') {
      // Serve the primIdToPath field of the HdSceneGlobalsSchema for the
      // root prim.
      return {
        primType: prim.primType,
        dataSource: HdOverlayContainerDataSource.overlayedContainerDataSources(
          this._rootPrimOverlayDataSource, prim.dataSource),
      }
    }

    if (HdPrimTypeIsGprim(prim.primType)) {
      // Wrap prim to populate the primId schema (lazily).
      return {
        primType: prim.primType,
        dataSource: _PrimDataSource.new(prim.dataSource, this._primIdInfo, primPath),
      }
    }

    return prim
  }

  /** primIdSceneIndex.cpp:361-365 */
  getChildPrimPaths(primPath: string): string[] {
    return this._getInputSceneIndex().getChildPrimPaths(primPath)
  }

  /** primIdSceneIndex.cpp:367-405 */
  protected _primsAdded(_sender: HdSceneIndexBase, entries: AddedPrimEntry[]): void {
    let primIdsChanged = false
    for (const entry of entries) {
      if (HdPrimTypeIsGprim(entry.primType)) {
        // Assign a new primId unless the prim already has one.
        if (this._primIdInfo.assignIdToPath(entry.primPath)) {
          primIdsChanged = true
        }
      } else {
        // Free the primId if the prim had one.
        if (this._primIdInfo.removeAssignedIdForPath(entry.primPath)) {
          primIdsChanged = true
        }
      }
    }

    if (!this._isObserved()) {
      return
    }

    this._sendPrimsAdded(entries)
    if (primIdsChanged) {
      this._sendPrimIdToPathDirtied()
    }
  }

  /** primIdSceneIndex.cpp:407-442 */
  protected _primsRemoved(_sender: HdSceneIndexBase, entries: RemovedPrimEntry[]): void {
    let primIdsChanged = false
    for (const entry of entries) {
      const primPath = entry.primPath
      if (primPath === '/') {
        this._primIdInfo.clear()
        primIdsChanged = true
        break
      }
      // Free the ids of prim path and all its descendants.
      if (this._primIdInfo.removeSubtree(primPath)) {
        primIdsChanged = true
      }
    }

    if (!this._isObserved()) {
      return
    }

    this._sendPrimsRemoved(entries)
    if (primIdsChanged) {
      this._sendPrimIdToPathDirtied()
    }
  }

  /** primIdSceneIndex.cpp:444-450 */
  protected _primsDirtied(_sender: HdSceneIndexBase, entries: DirtiedPrimEntry[]): void {
    this._sendPrimsDirtied(entries)
  }

  private _sendPrimIdToPathDirtied(): void {
    this._sendPrimsDirtied([{
      primPath: '/',
      dirtyLocators: new HdDataSourceLocatorSet(HdSceneGlobalsSchema.getPrimIdToPathLocator()),
    }])
  }
}

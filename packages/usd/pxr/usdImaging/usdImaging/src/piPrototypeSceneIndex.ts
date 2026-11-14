// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/piPrototypeSceneIndex.cpp,
//  pxr/usdImaging/usdImaging/piPrototypeSceneIndex.h
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/piPrototypeSceneIndex.{h,cpp}
// (OpenUSD 26.11.1).
//
// Divergence: upstream _PrimsAdded classifies entries with WorkParallelForN
// and thread-local vectors; this port runs the same two passes serially.

import {
  BlockDataSource as HdBlockDataSource,
  InstancedBySchema as HdInstancedBySchema,
  OverlayContainerDataSource as HdOverlayContainerDataSource,
  PrimTypeTokens as HdPrimTypeTokens,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  SceneIndexPrimView as HdSceneIndexPrimView,
  SingleInputFilteringSceneIndexBase as HdSingleInputFilteringSceneIndexBase,
  VisibilitySchema as HdVisibilitySchema,
  XformSchema as HdXformSchema,
  type AddedPrimEntry, type ContainerDataSource as HdContainerDataSource,
  type DirtiedPrimEntry, type RemovedPrimEntry,
  type SceneIndexBase as HdSceneIndexBase, type SceneIndexPrim as HdSceneIndexPrim,
} from 'typescript-usd/hd'
import { UsdImagingGeomModelSchema, UsdImagingGeomModelSchemaTokens } from './geomModelSchema.ts'
import { UsdImaging_PrototypeSceneIndexUtils } from './prototypeSceneIndexUtils.ts'
import { UsdImagingUsdPrimInfoSchema, UsdImagingUsdPrimInfoSchemaTokens } from './usdPrimInfoSchema.ts'

const { isRenderablePrimType: IsRenderablePrimType } = UsdImaging_PrototypeSceneIndexUtils

const _GetParentPath = (path: string): string => {
  if (path === '/' || path === '') return ''
  const slash = path.lastIndexOf('/')
  return slash <= 0 ? '/' : path.slice(0, slash)
}
const _HasPrefix = (path: string, prefix: string): boolean =>
  prefix === '/' ? path.startsWith('/') : path === prefix || path.startsWith(prefix + '/')

/** piPrototypeSceneIndex.cpp:45-56 */
function _ContainsStrictPrefixOfPath(pathSet: Set<string>, path: string): boolean {
  for (let p = _GetParentPath(path); p !== ''; p = _GetParentPath(p)) {
    if (pathSet.has(p)) {
      return true
    }
  }
  return false
}

/** piPrototypeSceneIndex.cpp:58-74 */
function _ComputeUnderlaySource(instancer: string, prototypeRoot: string): HdContainerDataSource | undefined {
  if (!instancer) {
    return undefined
  }
  return HdRetainedContainerDataSource.new(
    [HdInstancedBySchema.getSchemaToken()],
    [new HdInstancedBySchema.Builder()
      .setPaths(HdRetainedTypedSampledDataSource.new([instancer]))
      .setPrototypeRoots(HdRetainedTypedSampledDataSource.new([prototypeRoot]))
      .build()])
}

let _prototypeRootOverlaySource: HdContainerDataSource | undefined
/** piPrototypeSceneIndex.cpp:76-92 */
function _ComputePrototypeRootOverlaySource(instancer: string): HdContainerDataSource | undefined {
  if (!instancer) {
    return undefined
  }
  _prototypeRootOverlaySource ??= HdRetainedContainerDataSource.new(
    [HdXformSchema.getSchemaToken()],
    [new HdXformSchema.Builder()
      .setResetXformStack(HdRetainedTypedSampledDataSource.new(true))
      .build()])
  return _prototypeRootOverlaySource
}

let _prototypeRootUnderlaySource: HdContainerDataSource | undefined
/** piPrototypeSceneIndex.cpp:94-113 */
function _ComputePrototypeRootUnderlaySource(instancer: string): HdContainerDataSource | undefined {
  if (!instancer) {
    return undefined
  }
  _prototypeRootUnderlaySource ??= HdRetainedContainerDataSource.new(
    // By underlaying this data, we do not override visibility
    // explicitly authored on a prototype instanced by a point
    // instancer in USD.
    [HdVisibilitySchema.getSchemaToken()],
    [new HdVisibilitySchema.Builder()
      .setVisibility(HdRetainedTypedSampledDataSource.new(true))
      .build()])
  return _prototypeRootUnderlaySource
}

/** piPrototypeSceneIndex.cpp:115-129 */
function _IsOverOrInstance(prim: HdSceneIndexPrim): boolean {
  if (prim.primType === HdPrimTypeTokens.instancer) {
    return true
  }
  const schema = UsdImagingUsdPrimInfoSchema.getFromParent(prim.dataSource)
  const ds = schema.getSpecifier()
  if (!ds) {
    return false
  }
  return ds.getTypedValue(0) === UsdImagingUsdPrimInfoSchemaTokens.over
}

let _unrenderableOverlaySource: HdContainerDataSource | undefined
/** piPrototypeSceneIndex.cpp:165-196 */
function _MakeUnrenderable(prim: HdSceneIndexPrim): void {
  // Force the prim type to empty.
  if (IsRenderablePrimType(prim.primType)) {
    prim.primType = ''
  }

  if (!prim.dataSource) {
    return
  }

  // Note that native USD instances are still picked up by the
  // native instance scene indices even when the prim type is empty.
  //
  // We explicitly block the data source indicating a USD instanced.
  //
  // This, unfortuantely, means that a point instancing scene index
  // needs to know about a native instancing token.
  //
  _unrenderableOverlaySource ??= HdRetainedContainerDataSource.new(
    [UsdImagingUsdPrimInfoSchema.getSchemaToken(), UsdImagingGeomModelSchema.getSchemaToken()],
    [
      HdRetainedContainerDataSource.new(
        [UsdImagingUsdPrimInfoSchemaTokens.niPrototypePath],
        [HdBlockDataSource.new()]),
      HdRetainedContainerDataSource.new(
        [UsdImagingGeomModelSchemaTokens.applyDrawMode],
        [HdRetainedTypedSampledDataSource.new(false)]),
    ])
  prim.dataSource = HdOverlayContainerDataSource.new(_unrenderableOverlaySource, prim.dataSource)
}

/**
 * piPrototypeSceneIndex.h:20-155.
 *
 * A scene index that prepares all prims under a given prototype root
 * to be instanced by the given point instancer. It is supposed to be
 * preceeded by a UsdImagingRerootingSceneIndex and is used by the
 * prototype propagating scene index.
 *
 * It forces an empty type on prims that are under an instancer within
 * the prototype (and this scene index could also do this for prim's
 * under a USD "over" within the prototype in the future).
 *
 * It also adds an instanced by data source to all prims within the
 * prototype whose type has not been forced to empty. It also adds
 * xform:resetXformStack to the prototype root.
 *
 * (See piPrototypeSceneIndex.h:28-119 for the worked example.)
 */
export class UsdImaging_PiPrototypeSceneIndex extends HdSingleInputFilteringSceneIndexBase {
  // Instancers and overs within the prototype.
  // Note that this does not include instancers or overs nested
  // under an instancer or over.
  protected readonly _instancersAndOvers = new Set<string>()

  /** piPrototypeSceneIndex.cpp:133-143 */
  static new(inputSceneIndex: HdSceneIndexBase, instancer: string, prototypeRoot: string): UsdImaging_PiPrototypeSceneIndex {
    return new UsdImaging_PiPrototypeSceneIndex(inputSceneIndex, instancer, prototypeRoot)
  }

  /** piPrototypeSceneIndex.cpp:145-155 */
  protected constructor(
    inputSceneIndex: HdSceneIndexBase,
    protected readonly _instancer: string,
    protected readonly _prototypeRoot: string,
  ) {
    super(inputSceneIndex)
    this._populate()
  }

  /** piPrototypeSceneIndex.cpp:157-170 */
  protected _populate(): void {
    const view = new HdSceneIndexPrimView(this._getInputSceneIndex(), this._prototypeRoot)
    const it = view[Symbol.iterator]()
    for (let r = it.next(); !r.done; r = it.next()) {
      const path = r.value
      const prim = this._getInputSceneIndex().getPrim(path)
      if (_IsOverOrInstance(prim)) {
        this._instancersAndOvers.add(path)
        it.skipDescendants()
      }
    }
  }

  private _underlay: HdContainerDataSource | undefined | null = null

  /** piPrototypeSceneIndex.cpp:198-243 */
  getPrim(primPath: string): HdSceneIndexPrim {
    const prim = { ...this._getInputSceneIndex().getPrim(primPath) }

    if (!_HasPrefix(primPath, this._prototypeRoot)) {
      return prim
    }

    if (_ContainsStrictPrefixOfPath(this._instancersAndOvers, primPath)) {
      // Render all prims under an instancer or over invisible.
      _MakeUnrenderable(prim)
      return prim
    }

    if (!prim.dataSource) {
      return prim
    }

    const dsVec: HdContainerDataSource[] = []

    if (primPath === this._prototypeRoot) {
      const ds = _ComputePrototypeRootOverlaySource(this._instancer)
      if (ds) {
        dsVec.push(ds)
      }
    }

    dsVec.push(prim.dataSource)

    if (primPath === this._prototypeRoot) {
      const ds = _ComputePrototypeRootUnderlaySource(this._instancer)
      if (ds) {
        dsVec.push(ds)
      }
    }

    // The underlay depends only on this index's instancer and prototype
    // root, and retained data sources do not change: built once (upstream
    // builds it on every call).
    if (this._underlay === null) this._underlay = _ComputeUnderlaySource(this._instancer, this._prototypeRoot)
    const ds = this._underlay
    if (ds) {
      dsVec.push(ds)
    }

    if (dsVec.length > 1) {
      prim.dataSource = HdOverlayContainerDataSource.new(...dsVec)
    }

    return prim
  }

  /** piPrototypeSceneIndex.cpp:245-250 */
  getChildPrimPaths(primPath: string): string[] {
    return this._getInputSceneIndex().getChildPrimPaths(primPath)
  }

  /** piPrototypeSceneIndex.cpp:252-321 */
  protected _primsAdded(_sender: HdSceneIndexBase, entries: AddedPrimEntry[]): void {
    // First pass: Identify instancers and overs and also things that used to
    // be instancers/overs but are no longer.
    const toAdd: string[] = []
    const toRemove: string[] = []
    for (const entry of entries) {
      // Rather than consult the entry's primType, we use `GetPrim()`
      // (since we are calling it anyways).
      if (_IsOverOrInstance(this._getInputSceneIndex().getPrim(entry.primPath))) {
        toAdd.push(entry.primPath)
      } else if (this._instancersAndOvers.has(entry.primPath)) {
        // Note that this scene index does not handle adding prims
        // that are underneath a prim that goes from prototype to
        // no longer a prototype.  It is assuming an upstream scene
        // index will re-add the necessary prims.
        toRemove.push(entry.primPath)
      }
    }

    // Commit results back into _instancersAndOvers.
    for (const path of toRemove) {
      this._instancersAndOvers.delete(path)
    }
    for (const path of toAdd) {
      this._instancersAndOvers.add(path)
    }

    // Second pass: Clear out types for any prims under instancers or overs.
    const newEntries: AddedPrimEntry[] = entries.map(entry => {
      if (_ContainsStrictPrefixOfPath(this._instancersAndOvers, entry.primPath)) {
        if (IsRenderablePrimType(entry.primType)) {
          return { primPath: entry.primPath, primType: '' }
        }
      }
      return entry
    })

    // Note that we do not handle the case that the type of a prim
    // changes and we get a single AddedPrimEntry about it.
    //
    // E.g. if a prim becomes an instancer, we need to re-sync
    // its namespace descendants since their type change to empty.
    // Similarly, if a prim was an instancer.

    this._sendPrimsAdded(newEntries)
  }

  /** piPrototypeSceneIndex.cpp:323-329 */
  protected _primsDirtied(_sender: HdSceneIndexBase, entries: DirtiedPrimEntry[]): void {
    this._sendPrimsDirtied(entries)
  }

  /** piPrototypeSceneIndex.cpp:331-363 */
  protected _primsRemoved(_sender: HdSceneIndexBase, entries: RemovedPrimEntry[]): void {
    if (this._instancersAndOvers.size > 0) {
      // Collapse entries to their minimal subtree roots so we don't
      // scan _instancersAndOvers once per leaf prim.
      const roots = _RemoveDescendentPaths(entries.map(entry => entry.primPath))

      for (const root of roots) {
        for (const i of [...this._instancersAndOvers]) {
          if (_HasPrefix(i, root)) {
            this._instancersAndOvers.delete(i)
          }
        }
      }
    }

    this._sendPrimsRemoved(entries)
  }
}

/** SdfPath::RemoveDescendentPaths on string prim paths. */
function _RemoveDescendentPaths(paths: string[]): string[] {
  const sorted = [...new Set(paths)].sort((a, b) => a.length - b.length)
  const result: string[] = []
  for (const p of sorted) {
    if (!result.some(r => _HasPrefix(p, r))) result.push(p)
  }
  return result
}

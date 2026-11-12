// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/unloadedDrawModeSceneIndex.cpp,
//  pxr/usdImaging/usdImaging/unloadedDrawModeSceneIndex.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/unloadedDrawModeSceneIndex.{h,cpp}
// (OpenUSD 26.11.1).

import {
  OverlayContainerDataSource as HdOverlayContainerDataSource,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
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
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { UsdImagingGeomModelSchema, UsdImagingGeomModelSchemaTokens } from './geomModelSchema.ts'
import { UsdImagingUsdPrimInfoSchema } from './usdPrimInfoSchema.ts'

/** unloadedDrawModeSceneIndex.cpp:31-41 */
function _IsPrimLoaded(primSource: HdContainerDataSource | undefined): boolean {
  const schema = UsdImagingUsdPrimInfoSchema.getFromParent(primSource)
  const ds = schema.getIsLoaded()
  if (ds) {
    return ds.getTypedValue(0.0)
  }
  return true
}

let _dataSourceForcingBoundsDrawMode: HdContainerDataSource | undefined

/** unloadedDrawModeSceneIndex.cpp:43-58 */
function _DataSourceForcingBoundsDrawMode(): HdContainerDataSource {
  return _dataSourceForcingBoundsDrawMode ??= HdRetainedContainerDataSource.new(
    [UsdImagingGeomModelSchema.getSchemaToken()],
    [new UsdImagingGeomModelSchema.Builder()
      .setApplyDrawMode(
        new HdRetainedTypedSampledDataSource(true, VtValueTypes.bool))
      .setDrawMode(
        new HdRetainedTypedSampledDataSource(
          UsdImagingGeomModelSchemaTokens.bounds, VtValueTypes.token))
      .build()])
}

/** unloadedDrawModeSceneIndex.h:21-56: a scene index that sets the draw mode
 *  for unloaded prims to show bounds. */
export class UsdImagingUnloadedDrawModeSceneIndex extends HdSingleInputFilteringSceneIndexBase {
  /** unloadedDrawModeSceneIndex.cpp:15-21 */
  static new(inputSceneIndex: HdSceneIndexBase): UsdImagingUnloadedDrawModeSceneIndex {
    return new UsdImagingUnloadedDrawModeSceneIndex(inputSceneIndex)
  }

  /** unloadedDrawModeSceneIndex.cpp:23-27 */
  protected constructor(inputSceneIndex: HdSceneIndexBase) {
    super(inputSceneIndex)
  }

  /** unloadedDrawModeSceneIndex.cpp:60-73 */
  getPrim(primPath: string): HdSceneIndexPrim {
    const prim = this._getInputSceneIndex().getPrim(primPath)

    if (!_IsPrimLoaded(prim.dataSource)) {
      return {
        primType: prim.primType,
        dataSource: HdOverlayContainerDataSource.new(
          _DataSourceForcingBoundsDrawMode(),
          prim.dataSource),
      }
    }

    return prim
  }

  /** unloadedDrawModeSceneIndex.cpp:75-80 */
  getChildPrimPaths(primPath: string): string[] {
    return this._getInputSceneIndex().getChildPrimPaths(primPath)
  }

  /** unloadedDrawModeSceneIndex.cpp:82-88 */
  protected _primsAdded(
    _sender: HdSceneIndexBase, entries: HdSceneIndexObserverAddedPrimEntry[],
  ): void {
    this._sendPrimsAdded(entries)
  }

  /** unloadedDrawModeSceneIndex.cpp:90-99 */
  protected _primsDirtied(
    _sender: HdSceneIndexBase, entries: HdSceneIndexObserverDirtiedPrimEntry[],
  ): void {
    // Loading/unloading prims forces a resync (prims removed
    // and added). So nothing to do here.

    this._sendPrimsDirtied(entries)
  }

  /** unloadedDrawModeSceneIndex.cpp:101-107 */
  protected _primsRemoved(
    _sender: HdSceneIndexBase, entries: HdSceneIndexObserverRemovedPrimEntry[],
  ): void {
    this._sendPrimsRemoved(entries)
  }
}

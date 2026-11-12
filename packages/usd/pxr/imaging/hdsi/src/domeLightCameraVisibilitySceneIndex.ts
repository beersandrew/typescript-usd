// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdsi/domeLightCameraVisibilitySceneIndex.cpp,
//  pxr/imaging/hdsi/domeLightCameraVisibilitySceneIndex.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/imaging/hdsi/domeLightCameraVisibilitySceneIndex.{h,cpp}.
//
// The SdfPathSet of dome light paths is a Set of string paths, iterated in
// SdfPath::operator< order where upstream iterates the set; the
// lower_bound/HasPrefix erase loop of _PrimsRemoved
// (domeLightCameraVisibilitySceneIndex.cpp:170-175) becomes a scan for paths
// prefixed by the removed path, which erases the same elements.
// TRACE_FUNCTION/TRACE_SCOPE scopes are not ported.

import { MakeTokens as TfMakeTokens } from 'typescript-usd/tf'
import { SdfPath } from 'typescript-usd/sdf/path'
import {
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  LightSchema as HdLightSchema,
  OverlayContainerDataSource as HdOverlayContainerDataSource,
  PrimTypeTokens as HdPrimTypeTokens,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  SiHasPrefix as HdSiHasPrefix,
  SingleInputFilteringSceneIndexBase as HdSingleInputFilteringSceneIndexBase,
  TypedSampledDataSource as HdTypedSampledDataSource,
} from 'typescript-usd/hd'
import type {
  AddedPrimEntry,
  DirtiedPrimEntry,
  RemovedPrimEntry,
  SceneIndexBase as HdSceneIndexBase,
  SceneIndexPrim as HdSceneIndexPrim,
} from 'typescript-usd/hd'

/** domeLightCameraVisibilitySceneIndex.h:16-21 */
export const HdsiDomeLightCameraVisibilitySceneIndexTokens = TfMakeTokens({
  cameraVisibility: 'cameraVisibility',
})

/** SdfPath::operator< (SdfPathSet ordering). */
function _PathLess(a: string, b: string): number {
  return SdfPath.compare(SdfPath.fromString(a), SdfPath.fromString(b))
}

/** HdsiDomeLightCameraVisibilitySceneIndex_Impl::_CameraVisibilityDataSource
 *  (domeLightCameraVisibilitySceneIndex.cpp:25-47) */
class _CameraVisibilityDataSource extends HdTypedSampledDataSource<boolean> {
  cameraVisibility = true

  static new(): _CameraVisibilityDataSource {
    return new _CameraVisibilityDataSource()
  }

  private constructor() {
    super()
  }

  getTypedValue(_shutterOffset: number): boolean {
    return this.cameraVisibility
  }

  GetContributingSampleTimesForInterval(
    _startTime: number, _endTime: number, _outSampleTimes?: number[],
  ): boolean {
    return false
  }
}

/**
 * Scene Index that overrides the cameraVisibility of each dome light.
 *
 * More precisely, it overrrides the bool data source at locator
 * light:cameraVisibility for each prim of type domeLight.
 *
 * (domeLightCameraVisibilitySceneIndex.h:32-82)
 */
export class HdsiDomeLightCameraVisibilitySceneIndex extends HdSingleInputFilteringSceneIndexBase {
  private readonly _cameraVisibilityDataSource: _CameraVisibilityDataSource
  private readonly _domeLightPaths = new Set<string>()

  /** domeLightCameraVisibilitySceneIndex.cpp:53-64 */
  static new(inputSceneIndex: HdSceneIndexBase): HdsiDomeLightCameraVisibilitySceneIndex {
    const result = new HdsiDomeLightCameraVisibilitySceneIndex(inputSceneIndex)
    result.setDisplayName('Dome Light Camera Visibility Scene Index')
    return result
  }

  /** domeLightCameraVisibilitySceneIndex.cpp:66-72 */
  protected constructor(inputSceneIndex: HdSceneIndexBase) {
    super(inputSceneIndex)
    this._cameraVisibilityDataSource = _CameraVisibilityDataSource.new()
  }

  /** domeLightCameraVisibilitySceneIndex.cpp:77-110 */
  setDomeLightCameraVisibility(visibility: boolean): void {
    if (this._cameraVisibilityDataSource.cameraVisibility === visibility) {
      return
    }

    this._cameraVisibilityDataSource.cameraVisibility = visibility

    if (!this._isObserved()) {
      return
    }

    if (this._domeLightPaths.size === 0) {
      return
    }

    const entries: DirtiedPrimEntry[] = []

    const locators = new HdDataSourceLocatorSet(
      HdLightSchema.getDefaultLocator()
        .append(
          HdsiDomeLightCameraVisibilitySceneIndexTokens
            .cameraVisibility))
    for (const primPath of [...this._domeLightPaths].sort(_PathLess)) {
      entries.push({ primPath, dirtyLocators: locators })
    }

    this._sendPrimsDirtied(entries)
  }

  /** domeLightCameraVisibilitySceneIndex.cpp:112-129 */
  getPrim(primPath: string): HdSceneIndexPrim {
    const prim = this._getInputSceneIndex().getPrim(primPath)
    if (prim.primType === HdPrimTypeTokens.domeLight) {
      return {
        primType: prim.primType,
        dataSource: HdOverlayContainerDataSource.new(
          HdRetainedContainerDataSource.new(
            [HdLightSchema.getSchemaToken()],
            [HdRetainedContainerDataSource.new(
              [HdsiDomeLightCameraVisibilitySceneIndexTokens
                .cameraVisibility],
              [this._cameraVisibilityDataSource])]),
          prim.dataSource),
      }
    }
    return prim
  }

  /** domeLightCameraVisibilitySceneIndex.cpp:131-136 */
  getChildPrimPaths(primPath: string): string[] {
    return this._getInputSceneIndex().getChildPrimPaths(primPath)
  }

  /** domeLightCameraVisibilitySceneIndex.cpp:138-158 */
  protected _primsAdded(_sender: HdSceneIndexBase, entries: AddedPrimEntry[]): void {
    for (const entry of entries) {
      if (entry.primType === HdPrimTypeTokens.domeLight) {
        this._domeLightPaths.add(entry.primPath)
      } else {
        this._domeLightPaths.delete(entry.primPath)
      }
    }

    this._sendPrimsAdded(entries)
  }

  /** domeLightCameraVisibilitySceneIndex.cpp:160-180 */
  protected _primsRemoved(_sender: HdSceneIndexBase, entries: RemovedPrimEntry[]): void {
    if (this._domeLightPaths.size !== 0) {
      for (const entry of entries) {
        for (const path of [...this._domeLightPaths]) {
          if (HdSiHasPrefix(path, entry.primPath)) {
            this._domeLightPaths.delete(path)
          }
        }
      }
    }

    this._sendPrimsRemoved(entries)
  }

  /** domeLightCameraVisibilitySceneIndex.cpp:182-188 */
  protected _primsDirtied(_sender: HdSceneIndexBase, entries: DirtiedPrimEntry[]): void {
    this._sendPrimsDirtied(entries)
  }
}

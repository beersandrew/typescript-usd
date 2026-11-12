// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/rootOverridesSceneIndex.cpp,
//  pxr/usdImaging/usdImaging/rootOverridesSceneIndex.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/rootOverridesSceneIndex.{h,cpp}
// (OpenUSD 26.11.1).

import { Matrix4d as GfMatrix4d } from 'typescript-usd/gf'
import {
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  OverlayContainerDataSource as HdOverlayContainerDataSource,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  SingleInputFilteringSceneIndexBase as HdSingleInputFilteringSceneIndexBase,
  TypedSampledDataSource as HdTypedSampledDataSource,
  VisibilitySchema as HdVisibilitySchema,
  VisibilitySchemaTokens as HdVisibilitySchemaTokens,
  XformSchema as HdXformSchema,
  XformSchemaTokens as HdXformSchemaTokens,
  type AddedPrimEntry,
  type ContainerDataSource as HdContainerDataSource,
  type DirtiedPrimEntry,
  type RemovedPrimEntry,
  type SceneIndexBase as HdSceneIndexBase,
  type SceneIndexPrim as HdSceneIndexPrim,
} from 'typescript-usd/hd'

/** rootOverridesSceneIndex.cpp:19-23 */
class _RootOverlayInfo {
  transform: GfMatrix4d = new GfMatrix4d(1.0)
  visibility = true
}

/** rootOverridesSceneIndex.cpp:25-50: data source for locator
 *  xform/matrix. */
class _MatrixSource extends HdTypedSampledDataSource<GfMatrix4d> {
  static new(info: _RootOverlayInfo): _MatrixSource {
    return new _MatrixSource(info)
  }

  private constructor(private readonly _info: _RootOverlayInfo) {
    super()
  }

  getTypedValue(_t: number): GfMatrix4d {
    return this._info.transform
  }

  GetContributingSampleTimesForInterval(_s: number, _e: number, _out?: number[]): boolean {
    return false
  }
}

/** rootOverridesSceneIndex.cpp:52-77: data source for locator
 *  visibility/visibility. */
class _VisibilitySource extends HdTypedSampledDataSource<boolean> {
  static new(info: _RootOverlayInfo): _VisibilitySource {
    return new _VisibilitySource(info)
  }

  private constructor(private readonly _info: _RootOverlayInfo) {
    super()
  }

  getTypedValue(_t: number): boolean {
    return this._info.visibility
  }

  GetContributingSampleTimesForInterval(_s: number, _e: number, _out?: number[]): boolean {
    return false
  }
}

/** rootOverridesSceneIndex.h:22-75: overrides some data sources on the root
 *  prim. */
export class UsdImagingRootOverridesSceneIndex extends HdSingleInputFilteringSceneIndexBase {
  private readonly _rootOverlayInfo: _RootOverlayInfo
  private readonly _rootOverlayDs: HdContainerDataSource

  /** rootOverridesSceneIndex.cpp:83-90 */
  static new(inputSceneIndex: HdSceneIndexBase): UsdImagingRootOverridesSceneIndex {
    return new UsdImagingRootOverridesSceneIndex(inputSceneIndex)
  }

  /** rootOverridesSceneIndex.cpp:92-107 */
  protected constructor(inputSceneIndex: HdSceneIndexBase) {
    super(inputSceneIndex)
    this._rootOverlayInfo = new _RootOverlayInfo()
    this._rootOverlayDs = HdRetainedContainerDataSource.new(
      [HdXformSchema.getSchemaToken(), HdVisibilitySchema.getSchemaToken()],
      [
        HdRetainedContainerDataSource.new(
          [HdXformSchemaTokens.matrix],
          [_MatrixSource.new(this._rootOverlayInfo)]),
        HdRetainedContainerDataSource.new(
          [HdVisibilitySchemaTokens.visibility],
          [_VisibilitySource.new(this._rootOverlayInfo)]),
      ])
  }

  /** rootOverridesSceneIndex.cpp:109-126 */
  setRootTransform(transform: GfMatrix4d): void {
    if (this._rootOverlayInfo.transform.equals(transform)) {
      return
    }

    // GfMatrix4d is a value type upstream: keep a copy.
    this._rootOverlayInfo.transform = new GfMatrix4d(transform)

    const entries: DirtiedPrimEntry[] = [
      {
        primPath: '/',
        dirtyLocators: new HdDataSourceLocatorSet([
          HdXformSchema.getDefaultLocator().append(HdXformSchemaTokens.matrix)]),
      }]

    this._sendPrimsDirtied(entries)
  }

  /** rootOverridesSceneIndex.cpp:128-132 */
  getRootTransform(): GfMatrix4d {
    return this._rootOverlayInfo.transform
  }

  /** rootOverridesSceneIndex.cpp:134-151 */
  setRootVisibility(visibility: boolean): void {
    if (this._rootOverlayInfo.visibility === visibility) {
      return
    }

    this._rootOverlayInfo.visibility = visibility

    const entries: DirtiedPrimEntry[] = [
      {
        primPath: '/',
        dirtyLocators: new HdDataSourceLocatorSet([
          HdVisibilitySchema.getDefaultLocator().append(HdVisibilitySchemaTokens.visibility)]),
      }]

    this._sendPrimsDirtied(entries)
  }

  /** rootOverridesSceneIndex.cpp:153-157 */
  getRootVisibility(): boolean {
    return this._rootOverlayInfo.visibility
  }

  /** rootOverridesSceneIndex.cpp:159-172 */
  getPrim(primPath: string): HdSceneIndexPrim {
    const prim = this._getInputSceneIndex().getPrim(primPath)

    if (primPath === '/') {
      return {
        primType: prim.primType,
        dataSource: HdOverlayContainerDataSource.new(
          this._rootOverlayDs,
          prim.dataSource),
      }
    }

    return prim
  }

  /** rootOverridesSceneIndex.cpp:174-179 */
  getChildPrimPaths(primPath: string): string[] {
    return this._getInputSceneIndex().getChildPrimPaths(primPath)
  }

  /** rootOverridesSceneIndex.cpp:181-187 */
  protected _primsAdded(_sender: HdSceneIndexBase, entries: AddedPrimEntry[]): void {
    this._sendPrimsAdded(entries)
  }

  /** rootOverridesSceneIndex.cpp:189-195 */
  protected _primsDirtied(_sender: HdSceneIndexBase, entries: DirtiedPrimEntry[]): void {
    this._sendPrimsDirtied(entries)
  }

  /** rootOverridesSceneIndex.cpp:197-203 */
  protected _primsRemoved(_sender: HdSceneIndexBase, entries: RemovedPrimEntry[]): void {
    this._sendPrimsRemoved(entries)
  }
}

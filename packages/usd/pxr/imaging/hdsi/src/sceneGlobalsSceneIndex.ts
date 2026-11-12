// Ported from OpenUSD 26.11.1: pxr/imaging/hdsi/sceneGlobalsSceneIndex.cpp,
//  pxr/imaging/hdsi/sceneGlobalsSceneIndex.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/imaging/hdsi/sceneGlobalsSceneIndex.{h,cpp}.
//
// std::optional members are `undefined` when unset. SdfPath values are the
// string paths this port's Hydra uses.

import {
  ContainerDataSource as HdContainerDataSource,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  OverlayContainerDataSource as HdOverlayContainerDataSource,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  SceneGlobalsSchema as HdSceneGlobalsSchema,
  SceneGlobalsSchemaTokens as HdSceneGlobalsSchemaTokens,
  SingleInputFilteringSceneIndexBase as HdSingleInputFilteringSceneIndexBase,
} from 'typescript-usd/hd'
import type {
  AddedPrimEntry,
  DataSourceBase as HdDataSourceBase,
  DataSourceLocator as HdDataSourceLocator,
  DirtiedPrimEntry,
  RemovedPrimEntry,
  SceneIndexBase as HdSceneIndexBase,
  SceneIndexPrim as HdSceneIndexPrim,
} from 'typescript-usd/hd'

/** sceneGlobalsSceneIndex.h:19-20: undefined -> 2 : Make SGSI a filtering
 *  scene index. */
export const HDSI_SGSI_API_VERSION = 2

/** HdSceneGlobalsSchema::GetDefaultPrimPath (sceneGlobalsSchema.h), i.e.
 *  SdfPath::AbsoluteRootPath(). hd/src/sceneGlobalsSchema.ts does not port
 *  GetDefaultPrimPath, so it is spelled here. */
const _defaultPrimPath = '/'

/** Checks whether t0 and t1 are equal when interpreted as time codes (similar
 *  to UsdTimeCode), that is the default time is encoded as NaN.
 *  (sceneGlobalsSceneIndex.cpp:21-35) */
function _IsEqualTimeCode(t0: number, t1: number): boolean {
  // a == NaN is always false. So catch the case where both
  // are NaN first.
  if (Number.isNaN(t0) && Number.isNaN(t1)) {
    return true
  }

  // Normal comparison. Note that if only one is NaN, this still
  // returns false.
  return t0 === t1
}

/** sceneGlobalsSceneIndex.cpp:81-91 */
function _OptionalToRetainedDataSource<T>(
  value: T | undefined,
): HdDataSourceBase | undefined {
  if (value !== undefined) {
    return HdRetainedTypedSampledDataSource.new(value)
  } else {
    return undefined
  }
}

/** HdsiSceneGlobalsSceneIndex::_SceneGlobalsSchemaDataSource
 *  (sceneGlobalsSceneIndex.cpp:37-116) */
class _SceneGlobalsSchemaDataSource extends HdContainerDataSource {
  // The scene index owns this data source and mutates its state directly.
  _activeRenderPassPrim: string | undefined
  _activeRenderSettingsPrim: string | undefined
  _primaryCameraPrim: string | undefined
  _currentFrame: number | undefined
  _timeCodesPerSecond: number | undefined
  _sceneStateId: number | undefined

  static new(): _SceneGlobalsSchemaDataSource {
    return new _SceneGlobalsSchemaDataSource()
  }

  /** sceneGlobalsSceneIndex.cpp:66-79 */
  getNames(): string[] {
    return [
      HdSceneGlobalsSchemaTokens.activeRenderPassPrim,
      HdSceneGlobalsSchemaTokens.activeRenderSettingsPrim,
      HdSceneGlobalsSchemaTokens.primaryCameraPrim,
      HdSceneGlobalsSchemaTokens.currentFrame,
      HdSceneGlobalsSchemaTokens.timeCodesPerSecond,
      HdSceneGlobalsSchemaTokens.sceneStateId,
    ]
  }

  /** sceneGlobalsSceneIndex.cpp:93-116 */
  Get(name: string): HdDataSourceBase | undefined {
    if (name === HdSceneGlobalsSchemaTokens.activeRenderPassPrim) {
      return _OptionalToRetainedDataSource(this._activeRenderPassPrim)
    }
    if (name === HdSceneGlobalsSchemaTokens.activeRenderSettingsPrim) {
      return _OptionalToRetainedDataSource(this._activeRenderSettingsPrim)
    }
    if (name === HdSceneGlobalsSchemaTokens.primaryCameraPrim) {
      return _OptionalToRetainedDataSource(this._primaryCameraPrim)
    }
    if (name === HdSceneGlobalsSchemaTokens.currentFrame) {
      return _OptionalToRetainedDataSource(this._currentFrame)
    }
    if (name === HdSceneGlobalsSchemaTokens.timeCodesPerSecond) {
      return _OptionalToRetainedDataSource(this._timeCodesPerSecond)
    }
    if (name === HdSceneGlobalsSchemaTokens.sceneStateId) {
      return _OptionalToRetainedDataSource(this._sceneStateId)
    }

    return undefined
  }
}

/**
 * Scene index that populates the "sceneGlobals" data source as modeled
 * by HdSceneGlobalsSchema and provides public API to mutate it.
 * This provides a way for applications to control high-level scene behavior.
 *
 * (sceneGlobalsSceneIndex.h:22-113)
 */
export class HdsiSceneGlobalsSceneIndex extends HdSingleInputFilteringSceneIndexBase {
  private readonly _sceneGlobalsSchemaDataSource: _SceneGlobalsSchemaDataSource

  /** sceneGlobalsSceneIndex.cpp:122-130 */
  static new(inputSceneIndex: HdSceneIndexBase): HdsiSceneGlobalsSceneIndex {
    const result = new HdsiSceneGlobalsSceneIndex(inputSceneIndex)
    result.setDisplayName('Scene Globals Scene Index')
    return result
  }

  /** sceneGlobalsSceneIndex.cpp:263-267 */
  protected constructor(inputSceneIndex: HdSceneIndexBase) {
    super(inputSceneIndex)
    this._sceneGlobalsSchemaDataSource = _SceneGlobalsSchemaDataSource.new()
  }

  // --------------------------------------------------------------------------
  // Public (non-virtual) API
  // --------------------------------------------------------------------------

  /** Caches the provided path and notifies any observers when the active
   *  render pass prim path is modified.
   *  (sceneGlobalsSceneIndex.cpp:132-151) */
  setActiveRenderPassPrimPath(path: string): void {
    if (this._sceneGlobalsSchemaDataSource._activeRenderPassPrim === path) {
      return
    }

    // A scene index downstream will invalidate and update the
    // sceneGlobals.activeRenderSettingsPrim locator (if the render pass points
    // to a valid render settings prim).
    // We keep things simple in this scene index.
    this._sceneGlobalsSchemaDataSource._activeRenderPassPrim = path

    if (this._isObserved()) {
      this._sendDirtied(HdSceneGlobalsSchema.getActiveRenderPassPrimLocator())
    }
  }

  /** Caches the provided path and notifies any observers when the active
   *  render settings prim path is modified.
   *  (sceneGlobalsSceneIndex.cpp:153-168) */
  setActiveRenderSettingsPrimPath(path: string): void {
    if (this._sceneGlobalsSchemaDataSource._activeRenderSettingsPrim === path) {
      return
    }

    this._sceneGlobalsSchemaDataSource._activeRenderSettingsPrim = path

    if (this._isObserved()) {
      this._sendDirtied(HdSceneGlobalsSchema.getActiveRenderSettingsPrimLocator())
    }
  }

  /** Set the path to use as the primaryCameraPrim in the scene
   *  globals schema. (sceneGlobalsSceneIndex.cpp:170-185) */
  setPrimaryCameraPrimPath(path: string): void {
    if (this._sceneGlobalsSchemaDataSource._primaryCameraPrim === path) {
      return
    }

    this._sceneGlobalsSchemaDataSource._primaryCameraPrim = path

    if (this._isObserved()) {
      this._sendDirtied(HdSceneGlobalsSchema.getPrimaryCameraPrimLocator())
    }
  }

  /** Set the frame number to use the as the currentFrame in the
   *  scene globals schema. (sceneGlobalsSceneIndex.cpp:187-204) */
  setCurrentFrame(currentFrame: number): void {
    // XXX We might need to add a flag to force dirtying of the Frame locator
    // even if the time has not changed
    if (this._sceneGlobalsSchemaDataSource._currentFrame !== undefined &&
        _IsEqualTimeCode(this._sceneGlobalsSchemaDataSource._currentFrame, currentFrame)) {
      return
    }

    this._sceneGlobalsSchemaDataSource._currentFrame = currentFrame

    if (this._isObserved()) {
      this._sendDirtied(HdSceneGlobalsSchema.getCurrentFrameLocator())
    }
  }

  /** Set the timeCodesPerSecond to use the as the currentFrame in the
   *  scene globals schema. (sceneGlobalsSceneIndex.cpp:206-220) */
  setTimeCodesPerSecond(timeCodesPerSecond: number): void {
    if (this._sceneGlobalsSchemaDataSource._timeCodesPerSecond === timeCodesPerSecond) {
      return
    }

    this._sceneGlobalsSchemaDataSource._timeCodesPerSecond = timeCodesPerSecond

    if (this._isObserved()) {
      this._sendDirtied(HdSceneGlobalsSchema.getTimeCodesPerSecondLocator())
    }
  }

  /** Injects an arbitrary value that identifies the state of the input scene
   *  at that point in time. This value ends up in the render index scene
   *  globals once that state is processed by Hydra. This is useful for the
   *  client to identify when certain scene edits have been processed by
   *  Hydra. (sceneGlobalsSceneIndex.cpp:222-236) */
  setSceneStateId(id: number): void {
    if (this._sceneGlobalsSchemaDataSource._sceneStateId === id) {
      return
    }

    this._sceneGlobalsSchemaDataSource._sceneStateId = id

    if (this._isObserved()) {
      this._sendDirtied(HdSceneGlobalsSchema.getSceneStateIdLocator())
    }
  }

  /** The `_SendPrimsDirtied({{GetDefaultPrimPath(), locator}})` each setter
   *  above sends. */
  private _sendDirtied(locator: HdDataSourceLocator): void {
    this._sendPrimsDirtied([{
      primPath: _defaultPrimPath,
      dirtyLocators: new HdDataSourceLocatorSet(locator),
    }])
  }

  // --------------------------------------------------------------------------
  // Satisfying HdSceneIndexBase
  // --------------------------------------------------------------------------

  /** sceneGlobalsSceneIndex.cpp:238-254 */
  getPrim(primPath: string): HdSceneIndexPrim {
    const prim = this._getInputSceneIndex().getPrim(primPath)

    // Overlay a data source at the scene globals locator for the default prim.
    if (primPath === _defaultPrimPath) {
      return {
        primType: prim.primType,
        dataSource:
          HdOverlayContainerDataSource.overlayedContainerDataSources(
            HdRetainedContainerDataSource.new(
              [HdSceneGlobalsSchemaTokens.sceneGlobals],
              [this._sceneGlobalsSchemaDataSource]),
            prim.dataSource),
      }
    }

    return prim
  }

  /** sceneGlobalsSceneIndex.cpp:256-261 */
  getChildPrimPaths(primPath: string): string[] {
    return this._getInputSceneIndex().getChildPrimPaths(primPath)
  }

  // --------------------------------------------------------------------------
  // Satisfying HdSingleInputFilteringSceneIndexBase
  // --------------------------------------------------------------------------

  /** sceneGlobalsSceneIndex.cpp:269-275 */
  protected _primsAdded(_sender: HdSceneIndexBase, entries: AddedPrimEntry[]): void {
    this._sendPrimsAdded(entries)
  }

  /** sceneGlobalsSceneIndex.cpp:277-285 */
  protected _primsRemoved(_sender: HdSceneIndexBase, entries: RemovedPrimEntry[]): void {
    // XXX Since this is now a filtering scene index, handle removals of
    //     the active render settings prim.
    this._sendPrimsRemoved(entries)
  }

  /** sceneGlobalsSceneIndex.cpp:287-293 */
  protected _primsDirtied(_sender: HdSceneIndexBase, entries: DirtiedPrimEntry[]): void {
    this._sendPrimsDirtied(entries)
  }

  // XXX Handle renames by sending a dirty notice that the active render settings
  //     prim has changed.
}

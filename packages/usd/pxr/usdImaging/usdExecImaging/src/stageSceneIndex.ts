// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdExecImaging/stageSceneIndex.cpp,
//  pxr/usdImaging/usdExecImaging/stageSceneIndex.h,
//  pxr/usdImaging/usdImagingGL/engine.cpp
// Copyright 2016, 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdExecImaging/stageSceneIndex.{h,cpp}
// (OpenUSD 26.11.1).
//
// The TF_REGISTRY_FUNCTION(TfType) block (stageSceneIndex.cpp:13-26) runs
// when this module loads: it defines the TfType with its base and sets the
// factory, as loading the usdExecImaging library does upstream. The plugInfo
// Types entry that declares the type to the plugin system is registered by
// plugInfo.ts. Together they let UsdImagingGLEngine manufacture this scene
// index through PlugRegistry and the TfType factory without importing this
// library (usdImagingGL/engine.cpp:1722-1745).
//
// Divergences:
// - SetStage(stage) replaces the request; upstream the previous request is
//   destroyed when its last shared owner releases it. Here it is destroyed
//   when the scene index drops it (see request.ts).
// - SetTime also accepts a number, as UsdImagingStageSceneIndex.SetTime does.

import type { SceneIndexPrim as HdSceneIndexPrim } from 'typescript-usd/hd'
import { Type as TfType } from 'typescript-usd/tf'
import { TimeCode as UsdTimeCode, type Stage as UsdStage } from 'typescript-usd/usd'
import {
  UsdImagingStageSceneIndexInterface, UsdImagingStageSceneIndexInterfaceFactory,
  UsdImagingStageSceneIndexInterfaceType,
} from 'typescript-usd/usdImaging'
import { UsdExecImaging_Request, type UsdExecImaging_RequestSharedPtr } from './request.ts'

/**
 * A scene index that provides values computed by exec
 * (stageSceneIndex.h:22-98).
 *
 * UsdExecImaging_StageSceneIndex is an initial scene index that has no
 * upstream scene indices. The scene index builds and maintains an exec request
 * for a UsdStage and provides data sources for prims when the values of those
 * data sources must be computed by exec. The UsdExecImaging_StageSceneIndex
 * also sends PrimsDirtied notifications for prims when their computed values
 * are invalidated.
 *
 * UsdExecImaging_StageSceneIndex registers a factory with TfType, so that it
 * can be manufactured from usdImagingGL without linking directly to
 * usdExecImaging.
 */
export class UsdExecImaging_StageSceneIndex extends UsdImagingStageSceneIndexInterface {
  private _request: UsdExecImaging_RequestSharedPtr = null
  // UsdTimeCode's default constructor is time 0.
  private _time = new UsdTimeCode()

  /** stageSceneIndex.cpp:28-32 */
  static new(): UsdExecImaging_StageSceneIndex {
    return new UsdExecImaging_StageSceneIndex()
  }

  // ------------------------------------------------------------------------
  // Scene index API

  /** stageSceneIndex.cpp:38-49 */
  getPrim(primPath: string): HdSceneIndexPrim {
    return {
      // UsdExecImaging_StageSceneIndex provides no opinion for the prim type.
      // The prim type is overridden by UsdImagingStageSceneIndex.
      primType: '',

      // Data source.
      dataSource: this._request ? this._request.getPrimData(primPath) : undefined,
    }
  }

  /** stageSceneIndex.cpp:51-55 */
  getChildPrimPaths(_primPath: string): string[] {
    return []
  }

  // ------------------------------------------------------------------------
  // UsdExecImagingStageSceneIndexInterface API

  /**
   * Sets the USD stage (stageSceneIndex.cpp:57-66).
   *
   * The scene index constructs an exec system for the provided stage.
   * This will reset all state held in the scene index.
   *
   * The scene index registers a listener for changes to the scene by
   * virtue of creating an ExecUsdSystem for the stage. When scene changes
   * occur, the invalidation notices are retained by the scene index and
   * flushed to downstream scene indices on the next call to
   * ApplyPendingUpdates.
   */
  SetStage(stage: UsdStage | undefined): void {
    // The previous request's last owner here (see the header comment).
    this._request?._destroy()
    if (stage) {
      this._request = UsdExecImaging_Request.new(stage)
    } else {
      this._request = null
    }
  }

  /**
   * Sets the time at which computed values are evaluated
   * (stageSceneIndex.cpp:68-77).
   *
   * This calls PrimsDirtied for all prims with time-varying computed values.
   * The updated values are recomputed on the next call to GetPrim or
   * ApplyPendingUpdates.
   *
   * PrimsDirtied is only called if the time is different from the last call.
   */
  SetTime(time: UsdTimeCode | number): void {
    const t = typeof time === 'number' ? new UsdTimeCode(time) : time
    if (this._request) {
      this._time = t
      this._request.SetTime(t)
      this._request.refresh()
      this._sendPrimsDirtied(this._request.takeDirtiedPrimEntries())
    }
  }

  /** Returns the current time (stageSceneIndex.cpp:79-83). */
  getTime(): UsdTimeCode {
    return this._time
  }

  /**
   * Calls PrimsDirtied for computed values that have changed due to scene
   * changes (stageSceneIndex.cpp:85-92).
   *
   * When a scene change occurs that invalidates one or more computed values,
   * the invalidation events are retained by this scene index until calling
   * this method. The exec request is recomputed prior to calling
   * PrimsDirtied.
   */
  ApplyPendingUpdates(): void {
    if (this._request) {
      this._request.refresh()
      this._sendPrimsDirtied(this._request.takeDirtiedPrimEntries())
    }
  }
}

/** The TfType of UsdExecImaging_StageSceneIndex. */
// TF_REGISTRY_FUNCTION(TfType) (stageSceneIndex.cpp:13-26): register a factory
// for UsdExecImaging_StageSceneIndex, so that an instance can be manufactured
// from another library without explicitly linking against usdExecImaging.
export const UsdExecImaging_StageSceneIndexType: TfType = TfType.define(
  'UsdExecImaging_StageSceneIndex', [UsdImagingStageSceneIndexInterfaceType])
UsdExecImaging_StageSceneIndexType.setFactory(
  new UsdImagingStageSceneIndexInterfaceFactory(UsdExecImaging_StageSceneIndex))

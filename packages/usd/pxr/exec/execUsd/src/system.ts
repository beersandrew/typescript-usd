// Ported from OpenUSD 26.11.1: pxr/exec/execUsd/system.cpp,
//  pxr/exec/execUsd/system.h, pxr/exec/exec/pluginData.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/execUsd/system.h and system.cpp.
//
// ~ExecUsdSystem is Destroy(): it destroys the notice listener (which
// unregisters from the stage data) and then runs ~ExecSystem, in C++ member
// then base order (system.cpp:61).
//
// Plugin loading (docs/openexec-x1.md decision D4): compilation looks up
// computations for a schema and loads the schema's Exec plugin with the
// synchronous PlugPlugin::Load (exec/pluginData.cpp). On the web a library
// plugin's module is imported asynchronously, so before the first
// PrepareRequest or Compute, callers await
// `_interim_ExecLoadPluginsAsync()` from `typescript-usd/exec/_internal`.

import { TF_CODING_ERROR } from 'typescript-usd/tf'
import { SdfPath } from 'typescript-usd/sdf/path'
import type { Notice as UsdNotice, Stage as UsdStage, TimeCode as UsdTimeCode } from 'typescript-usd/usd'
import { EfTime } from 'typescript-usd/ef'
import { EsfUsdSceneAdapter, EsfUsdStageData } from 'typescript-usd/esfUsd'
import {
  ExecSystem,
  type Exec_RequestImpl,
  type ExecRequestComputedValueInvalidationCallback,
  type ExecRequestTimeChangeInvalidationCallback,
} from 'typescript-usd/exec'

import { ExecUsdCacheView } from './cacheView.ts'
import { ExecUsdRequest } from './request.ts'
import { ExecUsd_RequestImpl } from './requestImpl.ts'
import type { ExecUsdValueKey } from './valueKey.ts'
import type { ExecUsdValueOverrideVector } from './valueOverride.ts'

// This object subscribes to scene changes on the UsdStage and delivers those
// changes to the base ExecSystem (system.h:157-160, system.cpp:31-53).
class _NoticeListener extends EsfUsdStageData.ListenerBase {
  private readonly _system: ExecUsdSystem
  private readonly _stageData: EsfUsdStageData

  // system.cpp:34-39
  constructor(system: ExecUsdSystem, stage: UsdStage) {
    super()
    this._system = system
    this._stageData = EsfUsdStageData.registerStage(stage, this)
  }

  // ~_NoticeListener (system.cpp:41-43).
  destroy(): void {
    this._stageData.unregister(this)
  }

  // system.cpp:140-190
  _didObjectsChanged(
    objectsChanged: UsdNotice.ObjectsChanged,
    changedTargetPaths: EsfUsdStageData.ChangedPathSet,
  ): void {
    const resyncedPaths = objectsChanged.getResyncedPaths()

    // If any objects were resynced, check for request expiration.
    if (!resyncedPaths.empty()) {
      const expired: ExecUsd_RequestImpl[] = []
      const expireRequests = (base: Exec_RequestImpl): void => {
        const impl = base as ExecUsd_RequestImpl
        impl.expireInvalidIndices()
        // We cannot discard requests from within this callback because the
        // request tracker is locked during its execution.
        if (impl.getExpiredIndices().areAllSet()) {
          expired.push(impl)
        }
      }
      this._system._parallelForEachRequest(expireRequests)

      for (const impl of expired) {
        impl.discard()
      }
    }

    const changeProcessor = new ExecSystem._ChangeProcessor(this._system)
    try {
      for (const path of resyncedPaths) {
        changeProcessor.didResync(SdfPath.fromString(path))
      }

      for (const path of objectsChanged.getResolvedAssetPathsResyncedPaths()) {
        changeProcessor.didResync(SdfPath.fromString(path))
      }

      for (const path of objectsChanged.getChangedInfoOnlyPaths()) {
        changeProcessor.didChangeInfoOnly(
          SdfPath.fromString(path), objectsChanged.getChangedFields(path))
      }

      for (const path of changedTargetPaths) {
        changeProcessor.didChangeIncomingConnections(path)
      }
    } finally {
      // ~_ChangeProcessor at the end of the function's scope.
      changeProcessor.dispose()
    }
  }
}

/**
 * The implementation of a system to procedurally compute values based on USD
 * scene description and computation definitions (system.h:33-161).
 *
 * ExecUsdSystem specializes the base ExecSystem class and owns USD-specific
 * structures and logic necessary to compile, schedule and evaluate requested
 * computation values.
 */
export class ExecUsdSystem extends ExecSystem {
  private _noticeListener: _NoticeListener | null

  /** system.cpp:55-59 */
  constructor(stage: UsdStage) {
    super(EsfUsdSceneAdapter.adaptStage(stage))
    this._noticeListener = new _NoticeListener(this, stage)
  }

  /** ~ExecUsdSystem (system.cpp:61). */
  override destroy(): void {
    const noticeListener = this._noticeListener
    this._noticeListener = null
    noticeListener?.destroy()
    super.destroy()
  }

  [Symbol.dispose](): void {
    this.destroy()
  }

  /**
   * Changes the `time` at which values are computed (system.h:60-75,
   * system.cpp:63-67).
   *
   * Calling this method re-resolves time-dependent inputs from the scene
   * graph at the new `time`, and determines which of these inputs are
   * *actually* changing between the old and new time. Computed values that
   * are dependent on the changing inputs are then invalidated, and requests
   * are notified of the time change.
   */
  changeTime(time: UsdTimeCode): void {
    this._changeTime(new EfTime(time))
  }

  /**
   * Builds a request for the given `valueKeys` (system.h:77-110,
   * system.cpp:69-83).
   *
   * The optionally provided `valueCallback` will be invoked when previously
   * computed value keys become invalid as a result of authored value changes
   * or structural invalidation of the scene. The optionally provided
   * `timeCallback` will be invoked when previously computed value keys
   * become invalid as a result of time changing.
   *
   * The client must not call into execution (including, but not limited to
   * Compute() or value extraction) from within the callbacks.
   *
   * The request takes ownership of `valueKeys` (upstream moves the vector).
   */
  buildRequest(
    valueKeys: ExecUsdValueKey[],
    valueCallback: ExecRequestComputedValueInvalidationCallback | null = null,
    timeCallback: ExecRequestTimeChangeInvalidationCallback | null = null,
  ): ExecUsdRequest {
    return new ExecUsdRequest(
      new ExecUsd_RequestImpl(
        this,
        valueKeys,
        valueCallback,
        timeCallback))
  }

  /**
   * Prepares a given `request` for execution (system.h:112-120,
   * system.cpp:85-98).
   *
   * This ensures the exec network is compiled and scheduled for the value
   * keys in the request.
   */
  prepareRequest(request: ExecUsdRequest): void {
    if (!request.isValid()) {
      TF_CODING_ERROR('Cannot prepare an expired request')
      return
    }

    const requestImpl = request._getImpl()
    requestImpl.Compile()
    requestImpl.schedule()
  }

  /**
   * Executes the given `request` and returns a cache view for extracting the
   * computed values (system.h:122-130, system.cpp:100-117).
   *
   * This implicitly calls PrepareRequest().
   */
  compute(request: ExecUsdRequest): ExecUsdCacheView {
    if (!request.isValid()) {
      TF_CODING_ERROR('Cannot compute an expired request')
      return new ExecUsdCacheView()
    }

    const requestImpl = request._getImpl()

    // Before computing values, make sure that the request has been prepared.
    requestImpl.Compile()
    requestImpl.schedule()

    return requestImpl.compute()
  }

  /**
   * Executes the given `request` in the presence of `valueOverrides`, and
   * returns a cache view for extracting the computed values
   * (system.h:132-154, system.cpp:119-138).
   *
   * If an override value is provided, it must have the same type as the
   * computed value; otherwise, a coding error is emitted.
   */
  computeWithOverrides(
    request: ExecUsdRequest,
    valueOverrides: ExecUsdValueOverrideVector,
  ): ExecUsdCacheView {
    if (!request.isValid()) {
      TF_CODING_ERROR('Cannot compute an expired request')
      return new ExecUsdCacheView()
    }

    const requestImpl = request._getImpl()

    // Before computing values, make sure that the request has been prepared.
    requestImpl.Compile()
    requestImpl.schedule()

    return requestImpl.computeWithOverrides(valueOverrides)
  }
}

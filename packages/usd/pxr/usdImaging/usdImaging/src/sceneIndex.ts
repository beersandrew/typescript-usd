// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImaging/sceneIndex.cpp,
//  pxr/usdImaging/usdImaging/sceneIndex.h,
//  pxr/imaging/hd/filteringSceneIndex.h
// Copyright 2021, 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/sceneIndex.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - HdEncapsulatingSceneIndexBase (hd/filteringSceneIndex.h:40-111) is not
//   ported to hd/src; GetEncapsulatedScenes is a plain method here.
// - The two upstream New overloads (sceneIndex.h:61-87) are one New taking
//   either SceneIndexAppendCallbacks or the deprecated single-argument
//   UsdImagingSceneIndexAppendCallback, told apart by typeof function.
// - The embedded _Observer (sceneIndex.h:150-185) is held strongly by the
//   final scene index (JavaScript observer storage is strong); destroy()
//   removes it, the web lifetime adaptation of ~UsdImagingSceneIndex, as
//   HdSingleInputFilteringSceneIndexBase.destroy does.

import {
  SceneIndexBase as HdSceneIndexBase,
  type AddedPrimEntry,
  type ContainerDataSource as HdContainerDataSource,
  type DirtiedPrimEntry,
  type NoticeBatchingSceneIndex as HdNoticeBatchingSceneIndex,
  type RemovedPrimEntry,
  type RenamedPrimEntry,
  type SceneIndexObserver as HdSceneIndexObserver,
  type SceneIndexPrim as HdSceneIndexPrim,
} from 'typescript-usd/hd'
import type { Stage as UsdStage, TimeCode as UsdTimeCode } from 'typescript-usd/usd'
import {
  UsdImagingCreateSceneIndices,
  type UsdImagingSceneIndexAppendCallback,
  type UsdImagingSceneIndices,
} from './sceneIndices.ts'
import type { UsdImagingSelectionSceneIndex } from './selectionSceneIndex.ts'
import type { UsdImagingStageSceneIndex } from './stageSceneIndex.ts'

/** UsdImagingSceneIndex::SceneIndexAppendCallback (sceneIndex.h:39-44):
 *  a callback to insert additional scene indices into the UsdImaging chain. */
export type UsdImagingSceneIndexSceneIndexAppendCallback = (
  inputScene: HdSceneIndexBase,
  sceneIndexCreateArgs: HdContainerDataSource | undefined,
) => HdSceneIndexBase

/** UsdImagingSceneIndex::SceneIndexAppendCallbacks (sceneIndex.h:46-58):
 *  callbacks a client can use to insert scene indices at specific points
 *  in the UsdImaging chain.
 *
 *  Note that these callbacks cannot be in sceneIndexCreateArgs since
 *  HdSampledDataSource::GetValue() returns a VtValue which requires an
 *  object of a class having an operator==. */
export interface UsdImagingSceneIndexSceneIndexAppendCallbacks {
  /** Inserts scene indices right after the stage scene index (and its
   *  material caching scene index). */
  overridesSceneIndexCallback?: UsdImagingSceneIndexSceneIndexAppendCallback
}

/** Bind sceneIndexCreateArgs into the given callback to produce the
 *  (deprecated) single-argument callback that UsdImagingCreateSceneIndices
 *  expects. (sceneIndex.cpp:16-31) */
function _BindSceneIndexCreateArgs(
  callback: UsdImagingSceneIndexSceneIndexAppendCallback | undefined,
  sceneIndexCreateArgs: HdContainerDataSource | undefined,
): UsdImagingSceneIndexAppendCallback | undefined {
  if (!callback) {
    return undefined
  }
  return (inputScene: HdSceneIndexBase) =>
    callback(inputScene, sceneIndexCreateArgs)
}

/**
 * A scene index encapsulating the chain of scene indices (resolving, e.g.,
 * USD native instancing) that is needed by a client to consume a UsdStage.
 *
 * (sceneIndex.h:32-203)
 */
export class UsdImagingSceneIndex extends HdSceneIndexBase {
  private readonly _stageSceneIndex: UsdImagingStageSceneIndex
  private readonly _postInstancingNoticeBatchingSceneIndex: HdNoticeBatchingSceneIndex
  private readonly _selectionSceneIndex: UsdImagingSelectionSceneIndex
  private readonly _finalSceneIndex: HdSceneIndexBase
  private readonly _observer: HdSceneIndexObserver
  private _destroyed = false

  /** Create the chain of scene indices.
   *
   *  The sceneIndexCreateArgs is cast to UsdImagingSceneIndexCreateArgsSchema
   *  when configuring the usdImaging scene indices.
   *  (sceneIndex.h:60-71)
   *
   *  Passing a function as the second argument is the deprecated overload
   *  taking a single-argument overridesSceneIndexCallback
   *  (sceneIndex.h:73-87). */
  static new(
    sceneIndexCreateArgs: HdContainerDataSource | undefined,
    sceneIndexAppendCallbacks?:
      UsdImagingSceneIndexSceneIndexAppendCallbacks | UsdImagingSceneIndexAppendCallback,
  ): UsdImagingSceneIndex {
    if (typeof sceneIndexAppendCallbacks === 'function') {
      /** @deprecated sceneIndex.h:73-87 */
      const overridesSceneIndexCallback = sceneIndexAppendCallbacks
      const callbacks: UsdImagingSceneIndexSceneIndexAppendCallbacks = {}
      callbacks.overridesSceneIndexCallback =
        (inputScene: HdSceneIndexBase, _createArgs: HdContainerDataSource | undefined) =>
          overridesSceneIndexCallback(inputScene)
      return UsdImagingSceneIndex.new(sceneIndexCreateArgs, callbacks)
    }
    return new UsdImagingSceneIndex(
      UsdImagingCreateSceneIndices(
        sceneIndexCreateArgs,
        _BindSceneIndexCreateArgs(
          sceneIndexAppendCallbacks?.overridesSceneIndexCallback,
          sceneIndexCreateArgs)))
  }

  /** sceneIndex.cpp:33-58. The (sceneIndexCreateArgs, callbacks)
   *  constructor delegates to this one; New above does that delegation. */
  private constructor(sceneIndices: UsdImagingSceneIndices) {
    super()
    this._stageSceneIndex = sceneIndices.stageSceneIndex
    this._postInstancingNoticeBatchingSceneIndex =
      sceneIndices.postInstancingNoticeBatchingSceneIndex
    this._selectionSceneIndex = sceneIndices.selectionSceneIndex
    this._finalSceneIndex = sceneIndices.finalSceneIndex
    // _Observer (sceneIndex.h:150-185)
    this._observer = {
      primsAdded: (_sender: HdSceneIndexBase, entries: AddedPrimEntry[]) =>
        this._sendPrimsAdded(entries),
      primsRemoved: (_sender: HdSceneIndexBase, entries: RemovedPrimEntry[]) =>
        this._sendPrimsRemoved(entries),
      primsDirtied: (_sender: HdSceneIndexBase, entries: DirtiedPrimEntry[]) =>
        this._sendPrimsDirtied(entries),
      primsRenamed: (_sender: HdSceneIndexBase, entries: RenamedPrimEntry[]) =>
        this._sendPrimsRenamed(entries),
    }
    this._finalSceneIndex.addObserver(this._observer)
  }

  /** ~UsdImagingSceneIndex (sceneIndex.cpp:60): see the file comment. */
  destroy(): void {
    if (this._destroyed) return
    this._destroyed = true
    this._finalSceneIndex.removeObserver(this._observer)
  }

  // ------------------------------------------------------------------------
  // (Encapsulating) Scene index API

  /** sceneIndex.cpp:62-66 */
  getPrim(primPath: string): HdSceneIndexPrim {
    return this._finalSceneIndex.getPrim(primPath)
  }

  /** sceneIndex.cpp:68-72 */
  getChildPrimPaths(primPath: string): string[] {
    return this._finalSceneIndex.getChildPrimPaths(primPath)
  }

  /** sceneIndex.cpp:74-78 */
  getEncapsulatedScenes(): HdSceneIndexBase[] {
    return [this._finalSceneIndex]
  }

  // ------------------------------------------------------------------------
  // App-facing API

  /** Set the USD stage to pull data from. Note that this will delete all
   *  scene index prims and reset stage global data.
   *  (sceneIndex.cpp:80-84) */
  SetStage(stage: UsdStage | undefined): void {
    this._stageSceneIndex.SetStage(stage)
  }

  /** Set the time, and call PrimsDirtied for any time-varying attributes.
   *
   *  PrimsDirtied is only called if the time is different from the last call
   *  or forceDirtyingTimeDeps is true.
   *  (sceneIndex.cpp:86-91) */
  SetTime(time: UsdTimeCode | number, forceDirtyingTimeDeps = false): void {
    this._stageSceneIndex.SetTime(time, forceDirtyingTimeDeps)
  }

  /** Return the current time. (sceneIndex.cpp:93-97) */
  getTime(): UsdTimeCode {
    return this._stageSceneIndex.getTime()
  }

  /** Apply queued stage edits to imaging scene.
   *  If the USD stage is edited while the scene index is pulling from it,
   *  those edits get queued and deferred.  Calling ApplyPendingUpdates will
   *  turn resync requests into PrimsAdded/PrimsRemoved, and property changes
   *  into PrimsDirtied.
   *  (sceneIndex.cpp:99-103) */
  ApplyPendingUpdates(): void {
    return this._stageSceneIndex.ApplyPendingUpdates()
  }

  /** Given a path (including usd proxy path inside a native instance) of
   *  a USD prim, determine the corresponding prim in the Usd scene index
   *  (filtered by the UsdImagingNiPrototypePropagatingSceneIndex) and
   *  populate its selections data source.
   *  (sceneIndex.cpp:105-109) */
  addSelection(path: string): void {
    this._selectionSceneIndex.addSelection(path)
  }

  /** Reset the scene index selection state. (sceneIndex.cpp:111-115) */
  clearSelection(): void {
    this._selectionSceneIndex.clearSelection()
  }

  /** Can be used to batch notices. (sceneIndex.h:144-148) */
  getPostInstancingNoticeBatchingSceneIndex(): HdNoticeBatchingSceneIndex {
    return this._postInstancingNoticeBatchingSceneIndex
  }
}

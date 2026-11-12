// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/stageSceneIndexInterface.cpp,
//  pxr/usdImaging/usdImaging/stageSceneIndexInterface.h,
//  pxr/usdImaging/usdImagingGL/engine.cpp
// Copyright 2016, 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/stageSceneIndexInterface.{h,cpp}
// (OpenUSD 26.11.1).
//
// The interface for initial scene indices that populate the Hydra scene from
// a UsdStage, and the TfType factory classes that let usdImagingGL
// manufacture one (UsdExecImaging_StageSceneIndex) through the plugin system
// without linking against its library (usdImagingGL/engine.cpp:1722-1745).
//
// Divergences:
// - TfType::FactoryBase is a C++ vtable anchor; the factory classes here are
//   plain classes stored with TfType.SetFactory (base/tf/type.ts).
// - SetTime also accepts a number (a numeric UsdTimeCode), as
//   UsdImagingStageSceneIndex.SetTime does in this port.

import { SceneIndexBase as HdSceneIndexBase } from 'typescript-usd/hd'
import { Type as TfType } from 'typescript-usd/tf'
import type { Stage as UsdStage, TimeCode as UsdTimeCode } from 'typescript-usd/usd'

/** An interface for initial scene indices that populate the Hydra scene with
 *  prims and data sources from a UsdStage (stageSceneIndexInterface.h:28-59). */
export abstract class UsdImagingStageSceneIndexInterface extends HdSceneIndexBase {
  /** Set the USD stage to pull data from. Note that this will delete all
   *  scene index prims and reset stage global data. */
  abstract SetStage(stage: UsdStage | undefined): void

  /** Set the time, and call PrimsDirtied for any time-varying attributes.
   *
   *  PrimsDirtied is only called if the time is different from the last
   *  call. */
  abstract SetTime(time: UsdTimeCode | number): void

  /** Return the current time. */
  abstract getTime(): UsdTimeCode

  /** Apply queued stage edits to imaging scene.
   *
   *  If the USD stage is edited while the scene index is pulling from it,
   *  those edits get queued and deferred. Calling ApplyPendingUpdates will
   *  turn resync requests into PrimsAdded/PrimsRemoved, and property changes
   *  into PrimsDirtied. */
  abstract ApplyPendingUpdates(): void
}

/** A factory interface that constructs instances of
 *  UsdImagingStageSceneIndexInterface. Instances can be constructed without
 *  arguments (stageSceneIndexInterface.h:61-70). */
export abstract class UsdImagingStageSceneIndexInterfaceFactoryBase {
  abstract new(): UsdImagingStageSceneIndexInterface
}

/** A trivial implementation of UsdImagingStageSceneIndexInterfaceFactoryBase
 *  that manufactures instances of T (stageSceneIndexInterface.h:72-85). The
 *  constructor stands in for the template argument. */
export class UsdImagingStageSceneIndexInterfaceFactory<T extends UsdImagingStageSceneIndexInterface>
  extends UsdImagingStageSceneIndexInterfaceFactoryBase {
  readonly #ctor: new () => T
  constructor(ctor: new () => T) {
    super()
    this.#ctor = ctor
  }

  new(): T {
    return new this.#ctor()
  }
}

/** The TfType of UsdImagingStageSceneIndexInterface. */
// TF_REGISTRY_FUNCTION(TfType) (stageSceneIndexInterface.cpp:13-16).
export const UsdImagingStageSceneIndexInterfaceType: TfType =
  TfType.define('UsdImagingStageSceneIndexInterface')

// Ported from OpenUSD 26.11.1: pxr/imaging/hd/sprim.cpp,
//  pxr/imaging/hd/sprim.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/imaging/hd/sprim.h — HdSprim (state/shader prim base class)
// Used for cameras, lights, materials, etc.

import type { HdDirtyBits } from './changeTracker.ts'
import type { HdSceneIndexPrim } from './sceneIndex.ts'
import type { HdSceneDelegate } from './sceneDelegate.ts'
import type { HdRenderParam } from './renderDelegate.ts'
import type { HdDirtyBitsRef } from './dirtyBitsTranslator.ts'

export abstract class HdSprim {
  private _id: string
  constructor(id: string) { this._id = id }
  getId(): string { return this._id }
  // sprim.h:67-69 Sync(sceneDelegate, renderParam, dirtyBits*) for prims inserted
  // through HdSceneDelegate (HdDirtyBits* is an HdDirtyBitsRef box), or the
  // scene-index-only render index's Sync(sceneIndexPrim, dirtyBits)
  // (renderIndex.ts, FAITHFULNESS-DEBT(hd-render-index-legacy-sync)). A
  // subclass implements the convention its render index path uses.
  abstract sync(
    sceneDelegateOrPrim: HdSceneDelegate | HdSceneIndexPrim,
    renderParamOrDirtyBits: HdRenderParam | null | undefined | HdDirtyBits,
    dirtyBits?: HdDirtyBitsRef,
  ): void
  abstract getInitialDirtyBitsMask(): HdDirtyBits
}

// Ported from OpenUSD 26.11.1: pxr/imaging/hd/bprim.cpp,
//  pxr/imaging/hd/bprim.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/imaging/hd/bprim.h — HdBprim (buffer/blob prim base class)
// Used for render buffers, textures, etc.

import type { HdDirtyBits } from './changeTracker.ts'
import type { HdSceneIndexPrim } from './sceneIndex.ts'
import type { HdSceneDelegate } from './sceneDelegate.ts'
import type { HdRenderParam } from './renderDelegate.ts'
import type { HdDirtyBitsRef } from './dirtyBitsTranslator.ts'

export abstract class HdBprim {
  private _id: string
  constructor(id: string) { this._id = id }
  getId(): string { return this._id }
  // bprim.h:52-54 Sync(sceneDelegate, renderParam, dirtyBits*) for prims inserted
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

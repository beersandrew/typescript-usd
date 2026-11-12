// Ported from OpenUSD 26.11.1: pxr/imaging/hd/renderPass.cpp,
//  pxr/imaging/hd/renderPass.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/renderPass.{h,cpp}.

import type { HdRenderIndex } from './renderIndex.ts'
import type { HdRenderPassState } from './renderPassState.ts'
import { HdRprimCollection } from './rprimCollection.ts'

export abstract class HdRenderPass {
  private _collection: HdRprimCollection

  constructor(
    private readonly _renderIndex: HdRenderIndex,
    collection: HdRprimCollection,
  ) {
    this._collection = collection.Clone()
  }

  getRprimCollection(): HdRprimCollection { return this._collection }

  setRprimCollection(collection: HdRprimCollection): void {
    if (this._collection.Equals(collection)) return
    this._collection = collection.Clone()
    this._markCollectionDirty()
  }

  getRenderIndex(): HdRenderIndex { return this._renderIndex }
  /** renderPass.cpp:50-62: enqueue the collection to be synced during Hydra
   *  Sync (the collection paths are ignored), then let derived classes sync. */
  sync(): void {
    const index = this._renderIndex as HdRenderIndex & {
      enqueueCollectionToSync?: (collection: HdRprimCollection) => void
    }
    index.enqueueCollectionToSync?.(this._collection)
    this._sync()
  }
  Execute(renderPassState: HdRenderPassState, renderTags: readonly string[]): void {
    this._execute(renderPassState, renderTags)
  }
  isConverged(): boolean { return true }

  protected abstract _execute(
    renderPassState: HdRenderPassState,
    renderTags: readonly string[],
  ): void
  protected _markCollectionDirty(): void {}
  protected _sync(): void {}
}

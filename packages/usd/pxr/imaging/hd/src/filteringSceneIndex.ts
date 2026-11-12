// Ported from OpenUSD 26.11.1: pxr/imaging/hd/filteringSceneIndex.cpp,
//  pxr/imaging/hd/filteringSceneIndex.h
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/imaging/hd/filteringSceneIndex.{h,cpp}
// HdFilteringSceneIndexBase / HdSingleInputFilteringSceneIndexBase

import {
  HdSceneIndexBase,
  type AddedPrimEntry,
  type DirtiedPrimEntry,
  type HdSceneIndexObserver,
  type HdSceneIndexPrim,
  type RemovedPrimEntry,
  type RenamedPrimEntry,
} from './sceneIndex.ts'

// An abstract base class for scene indexes that have one or more input scene
// indexes which serve as a basis for their own scene.
export abstract class HdFilteringSceneIndexBase extends HdSceneIndexBase {
  abstract getInputScenes(): HdSceneIndexBase[]
}

// Fallback scene index used when an invalid input is passed to the filtering
// scene index constructor.
class _NoOpSceneIndex extends HdSceneIndexBase {
  getPrim(_primPath: string): HdSceneIndexPrim {
    return { primType: '', dataSource: undefined }
  }
  getChildPrimPaths(_primPath: string): string[] {
    return []
  }
}

// An abstract base class for a filtering scene index that observes a single
// input scene index. Subclasses override the protected _PrimsAdded/_PrimsRemoved
// /_PrimsDirtied hooks (invoked when the input scene index sends notifications)
// as well as GetPrim/GetChildPrimPaths.
export abstract class HdSingleInputFilteringSceneIndexBase extends HdFilteringSceneIndexBase {
  private _inputSceneIndex: HdSceneIndexBase
  private _observer: HdSceneIndexObserver
  private _destroyed = false

  protected constructor(inputSceneIndex: HdSceneIndexBase | undefined) {
    super()

    // The observer forwards the input's notifications into our protected hooks.
    this._observer = {
      primsAdded: (sender, entries) => this._primsAdded(sender, entries),
      primsRemoved: (sender, entries) => this._primsRemoved(sender, entries),
      primsDirtied: (sender, entries) => this._primsDirtied(sender, entries),
      primsRenamed: (sender, entries) => this._primsRenamed(sender, entries),
    }

    if (inputSceneIndex) {
      this._inputSceneIndex = inputSceneIndex
      inputSceneIndex.addObserver(this._observer)
    } else {
      // TF_CODING_ERROR("Invalid input sceneIndex.")
      this._inputSceneIndex = new _NoOpSceneIndex()
    }
  }

  getInputScenes(): HdSceneIndexBase[] {
    return [this._inputSceneIndex]
  }

  // Returns the input scene. It is always safe to call and dereference this
  // return value; if constructed with a null scene index, a fallback is used.
  protected _getInputSceneIndex(): HdSceneIndexBase {
    return this._inputSceneIndex
  }

  // C++ scene-index observer handles are weak, so destroying the embedded
  // observer ends forwarding automatically (filteringSceneIndex.h:158-193).
  // JavaScript observer storage is strong; explicit teardown is the web
  // lifetime adaptation of releasing the final filtering-scene-index ref.
  destroy(): void {
    if (this._destroyed) return
    this._destroyed = true
    this._inputSceneIndex.removeObserver(this._observer)
  }

  protected abstract _primsAdded(
    sender: HdSceneIndexBase,
    entries: AddedPrimEntry[],
  ): void

  protected abstract _primsRemoved(
    sender: HdSceneIndexBase,
    entries: RemovedPrimEntry[],
  ): void

  protected abstract _primsDirtied(
    sender: HdSceneIndexBase,
    entries: DirtiedPrimEntry[],
  ): void

  // Base implementation converts prim renamed messages into removes and adds.
  protected _primsRenamed(
    sender: HdSceneIndexBase,
    entries: RenamedPrimEntry[],
  ): void {
    const removed: RemovedPrimEntry[] = []
    const added: AddedPrimEntry[] = []
    for (const entry of entries) {
      removed.push({ primPath: entry.oldPrimPath })
      added.push({ primPath: entry.newPrimPath, primType: '' })
    }
    this._primsRemoved(sender, removed)
    this._primsAdded(sender, added)
  }
}

// Ported from OpenUSD 26.11.1: pxr/imaging/hd/noticeBatchingSceneIndex.cpp,
//  pxr/imaging/hd/noticeBatchingSceneIndex.h
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/noticeBatchingSceneIndex.{h,cpp} (OpenUSD
// 26.11.1): a filtering scene index that, while batching is enabled, holds
// the notices it receives and sends them (consecutive notices of one kind
// merged) when batching is disabled or Flush() is called.

import { HdSingleInputFilteringSceneIndexBase } from './filteringSceneIndex.ts'
import type {
  AddedPrimEntry,
  DirtiedPrimEntry,
  HdSceneIndexBase,
  HdSceneIndexPrim,
  RemovedPrimEntry,
} from './sceneIndex.ts'

/** noticeBatchingSceneIndex.h:75-94 */
type _BatchEntry =
  | { kind: 'added', entries: AddedPrimEntry[] }
  | { kind: 'removed', entries: RemovedPrimEntry[] }
  | { kind: 'dirtied', entries: DirtiedPrimEntry[] }

export class HdNoticeBatchingSceneIndex extends HdSingleInputFilteringSceneIndexBase {
  private _batchingEnabled = false
  private _batches: _BatchEntry[] = []

  /** noticeBatchingSceneIndex.h:24-28 */
  static new(inputSceneIndex: HdSceneIndexBase): HdNoticeBatchingSceneIndex {
    return new HdNoticeBatchingSceneIndex(inputSceneIndex)
  }

  /** noticeBatchingSceneIndex.cpp:15-19 */
  protected constructor(inputSceneIndex: HdSceneIndexBase) {
    super(inputSceneIndex)
  }

  /** noticeBatchingSceneIndex.cpp:23-27 */
  getPrim(primPath: string): HdSceneIndexPrim {
    return this._getInputSceneIndex().getPrim(primPath)
  }

  /** noticeBatchingSceneIndex.cpp:29-33 */
  getChildPrimPaths(primPath: string): string[] {
    return this._getInputSceneIndex().getChildPrimPaths(primPath)
  }

  /** noticeBatchingSceneIndex.cpp:35-60 */
  protected _primsAdded(_sender: HdSceneIndexBase, entries: AddedPrimEntry[]): void {
    if (this._batchingEnabled) {
      const last = this._batches[this._batches.length - 1]
      if (last?.kind === 'added') {
        last.entries.push(...entries)
        return
      }
      this._batches.push({ kind: 'added', entries: [...entries] })
    } else {
      this._sendPrimsAdded(entries)
    }
  }

  /** noticeBatchingSceneIndex.cpp:62-87 */
  protected _primsRemoved(_sender: HdSceneIndexBase, entries: RemovedPrimEntry[]): void {
    if (this._batchingEnabled) {
      const last = this._batches[this._batches.length - 1]
      if (last?.kind === 'removed') {
        last.entries.push(...entries)
        return
      }
      this._batches.push({ kind: 'removed', entries: [...entries] })
    } else {
      this._sendPrimsRemoved(entries)
    }
  }

  /** noticeBatchingSceneIndex.cpp:89-114 */
  protected _primsDirtied(_sender: HdSceneIndexBase, entries: DirtiedPrimEntry[]): void {
    if (this._batchingEnabled) {
      const last = this._batches[this._batches.length - 1]
      if (last?.kind === 'dirtied') {
        last.entries.push(...entries)
        return
      }
      this._batches.push({ kind: 'dirtied', entries: [...entries] })
    } else {
      this._sendPrimsDirtied(entries)
    }
  }

  /** noticeBatchingSceneIndex.cpp:116-120 */
  isBatchingEnabled(): boolean {
    return this._batchingEnabled
  }

  /** noticeBatchingSceneIndex.cpp:122-131 */
  setBatchingEnabled(enabled: boolean): void {
    if (this._batchingEnabled !== enabled) {
      this._batchingEnabled = enabled
      if (!enabled && this._batches.length > 0) {
        this.flush()
      }
    }
  }

  /** noticeBatchingSceneIndex.cpp:133-152 */
  flush(): void {
    const batches = this._batches
    this._batches = []
    for (const batchEntry of batches) {
      switch (batchEntry.kind) {
        case 'added': this._sendPrimsAdded(batchEntry.entries); break
        case 'dirtied': this._sendPrimsDirtied(batchEntry.entries); break
        case 'removed': this._sendPrimsRemoved(batchEntry.entries); break
      }
    }
  }
}

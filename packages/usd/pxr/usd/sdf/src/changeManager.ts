// Ported from OpenUSD 26.11.1: pxr/usd/sdf/changeManager.cpp,
//  pxr/usd/sdf/changeManager.h, pxr/usd/sdf/changeBlock.cpp,
//  pxr/usd/sdf/changeBlock.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Sdf_ChangeManager and SdfChangeBlock from OpenUSD v26.08
// pxr/usd/sdf/changeManager.{h,cpp} and changeBlock.{h,cpp}: the change
// records of the mutations made inside the outermost change block are
// collected per layer and sent as SdfNotice::LayersDidChange when it closes.
// Each layer mutation opens its own block, so a mutation made outside any
// block is sent immediately.

import { sdfChangeListFromLayerChanges, type SdfLayerChangeListVec } from './changeList.ts'
import type { Layer, SdfLayerChange } from './layer.ts'
import { SdfNotice } from './notice.ts'
import type { SdfSpec } from './spec.ts'

interface ChangeManagerData {
  // The change records of each layer changed in this round, in the order
  // the layers first changed.
  changes: Map<Layer, SdfLayerChange[]>
  outermostBlock: SdfChangeBlock | null
  // Specs to remove if inert when the outermost block closes.
  removeIfInert: SdfSpec[]
}

let changeSerialNumber = 1

export class Sdf_ChangeManager {
  private static _instance: Sdf_ChangeManager | undefined
  private _data: ChangeManagerData = { changes: new Map(), outermostBlock: null, removeIfInert: [] }

  static get(): Sdf_ChangeManager {
    return Sdf_ChangeManager._instance ??= new Sdf_ChangeManager()
  }

  /** @internal Records one mutation of a layer that notifies. */
  _addChange(layer: Layer, change: SdfLayerChange): void {
    const block = new SdfChangeBlock()
    try {
      const changes = this._data.changes.get(layer)
      if (changes) changes.push(change)
      else this._data.changes.set(layer, [change])
    } finally {
      block.close()
    }
  }

  /**
   * ExtractLocalChanges (changeManager.cpp:143-161): removes and returns the
   * pending changes for a layer.
   */
  extractLocalChanges(layer: Layer): SdfLayerChange[] {
    const changes = this._data.changes.get(layer) ?? []
    this._data.changes.delete(layer)
    return changes
  }

  /** @internal */
  _openChangeBlock(block: SdfChangeBlock): boolean {
    if (this._data.outermostBlock) return false
    this._data.outermostBlock = block
    return true
  }

  /** @internal */
  _closeChangeBlock(block: SdfChangeBlock): void {
    if (this._data.outermostBlock !== block) {
      throw new Error('Improperly nested SdfChangeBlocks!')
    }
    // Process removes while the change block is still open.
    this._processRemoveIfInert()
    // Send notices with no change block open.
    this._data.outermostBlock = null
    this._sendNotices()
  }

  // RemoveSpecIfInert (changeManager.cpp:103-109): processed when the
  // outermost change block closes.
  removeSpecIfInert(spec: SdfSpec): void {
    const block = new SdfChangeBlock()
    try {
      this._data.removeIfInert.push(spec)
    } finally {
      block.close()
    }
  }

  // _ProcessRemoveIfInert (changeManager.cpp:111-134).
  private _processRemoveIfInert(): void {
    if (this._data.removeIfInert.length === 0) return
    const remove = this._data.removeIfInert
    this._data.removeIfInert = []
    for (const spec of remove) spec.getLayer()._removeIfInert(spec)
  }

  // _SendNoticesForChangeList (changeManager.cpp:42-73).
  private _sendNoticesForChangeList(
    layer: Layer, changeList: SdfLayerChangeListVec<Layer>[number][1],
  ): void {
    if (layer._updateLastDirtinessState()) {
      new SdfNotice.LayerDirtinessChanged().send(layer)
    }
    const entry = changeList.getEntryList().find(([path]) => path.isAbsoluteRootPath())?.[1]
    if (!entry) return
    for (const [key] of entry.infoChanged) new SdfNotice.LayerInfoDidChange(key).send(layer)
    if (entry.flags.didChangeIdentifier) {
      new SdfNotice.LayerIdentifierDidChange(entry.oldIdentifier, layer.identifier).send(layer)
    }
    if (entry.flags.didReplaceContent) new SdfNotice.LayerDidReplaceContent().send(layer)
    if (entry.flags.didReloadContent) new SdfNotice.LayerDidReloadContent().send(layer)
  }

  // _SendNotices (changeManager.cpp:163-219).
  private _sendNotices(): void {
    const pending = this._data.changes
    this._data.changes = new Map()
    const changes: SdfLayerChangeListVec<Layer> = []
    for (const [layer, records] of pending) {
      changes.push([layer, sdfChangeListFromLayerChanges(layer, records)])
    }
    if (changes.length === 0) return

    for (const [layer, changeList] of changes) this._sendNoticesForChangeList(layer, changeList)

    const serialNumber = changeSerialNumber++

    // Send global notice.
    new SdfNotice.LayersDidChange(changes, serialNumber).send()

    // Send per-layer notices.
    const notice = new SdfNotice.LayersDidChangeSentPerLayer(changes, serialNumber)
    for (const [layer] of changes) notice.send(layer)
  }
}

/**
 * SdfChangeBlock: DANGER DANGER DANGER. Please make sure you have read and
 * fully understand the issues around SdfChangeBlock before using it. Batches
 * the change notification of the edits made while it is open; notices are
 * sent when the outermost block closes. TypeScript has no destructors, so
 * blocks are closed explicitly, or opened with sdfChangeBlock().
 */
export class SdfChangeBlock {
  private _isOutermost: boolean
  private _closed = false

  constructor() {
    this._isOutermost = Sdf_ChangeManager.get()._openChangeBlock(this)
  }

  close(): void {
    if (this._closed) return
    this._closed = true
    if (this._isOutermost) Sdf_ChangeManager.get()._closeChangeBlock(this)
  }
}

/** Runs fn inside an SdfChangeBlock. fn must not be async. */
export function sdfChangeBlock<T>(fn: () => T): T {
  const block = new SdfChangeBlock()
  try {
    return fn()
  } finally {
    block.close()
  }
}

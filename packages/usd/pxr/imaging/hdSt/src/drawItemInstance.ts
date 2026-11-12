// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/drawItemInstance.cpp,
//  pxr/imaging/hdSt/drawItemInstance.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/drawItemInstance.{h,cpp} (OpenUSD 26.11.1).

import type { HdSt_DrawBatch } from './drawBatch.ts'
import type { HdStDrawItem } from './drawItem.ts'

/** drawItemInstance.h:25-86. A container to store instance state for a
 *  drawitem: visibility, the batch it belongs to and its index there. */
export class HdStDrawItemInstance {
  private _batch: HdSt_DrawBatch | null = null
  private readonly _drawItem: HdStDrawItem
  private _batchIndex = 0
  private _visible: boolean

  /** drawItemInstance.cpp:15-21 */
  constructor(drawItem: HdStDrawItem) {
    this._drawItem = drawItem
    this._visible = drawItem.getVisible()
  }

  /** drawItemInstance.cpp:27-36 */
  setVisible(visible: boolean): void {
    if (this._visible !== visible) {
      this._visible = visible
      if (this._batch) {
        this._batch.drawItemInstanceChanged(this)
      }
    }
  }

  /** drawItemInstance.h:44 */
  isVisible(): boolean { return this._visible }

  /** drawItemInstance.cpp:38-42 */
  setBatchIndex(batchIndex: number): void {
    this._batchIndex = batchIndex
  }

  /** drawItemInstance.h:57 */
  getBatchIndex(): number { return this._batchIndex }

  /** drawItemInstance.cpp:44-48 */
  setBatch(batch: HdSt_DrawBatch | null): void {
    this._batch = batch
  }

  /** drawItemInstance.h:69 */
  getDrawItem(): HdStDrawItem { return this._drawItem }
}

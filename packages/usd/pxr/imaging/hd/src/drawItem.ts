// Ported from OpenUSD 26.11.1: pxr/imaging/hd/drawItem.cpp,
//  pxr/imaging/hd/drawItem.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/imaging/hd/drawItem.h — HdDrawItem.
//
// A draw item is a light-weight representation of an HdRprim's resources and
// material to be used for rendering. It owns an HdDrawingCoord and holds a const
// reference to the rprim's shared data; the per-resource BARs are reached by
// indexing the shared data's barContainer through the drawing coord.

import { HdDrawingCoord } from './drawingCoord.ts'
import type { HdRprimSharedData, HdRprimBounds } from './rprimSharedData.ts'

export class HdDrawItem {
  // configuration of how to bundle the drawing coordinate for this draw item
  // out of BARs in sharedData.
  private _drawingCoord = new HdDrawingCoord()
  // pointer to shared data across reprs, owned by rprim.
  private _sharedData: HdRprimSharedData
  // organizes draw items into collections by material properties.
  private _materialTag = ''

  constructor(sharedData: HdRprimSharedData) {
    this._sharedData = sharedData
  }

  getRprimID(): string { return this._sharedData.rprimID }

  getBounds(): HdRprimBounds { return this._sharedData.bounds }

  getDrawingCoord(): HdDrawingCoord { return this._drawingCoord }

  // Returns the authored visibility, expressed by the delegate.
  getVisible(): boolean { return this._sharedData.visible }

  getMaterialTag(): string { return this._materialTag }
  setMaterialTag(materialTag: string): void { this._materialTag = materialTag }

  /** The destructor (~HdDrawItem, a DrawItemUniquePtr deleted by its
   *  HdRepr): drops the shared_ptrs the draw item holds. Nothing to drop
   *  here; HdStDrawItem overrides it. */
  destroy(): void {}

  // protected accessors (mirror _GetDrawingCoord / _GetSharedData)
  protected _getDrawingCoord(): HdDrawingCoord { return this._drawingCoord }
  protected _getSharedData(): HdRprimSharedData { return this._sharedData }
}

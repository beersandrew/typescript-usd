// Ported from OpenUSD 26.11.1: pxr/imaging/hd/repr.cpp, pxr/imaging/hd/repr.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/repr.{h,cpp} (OpenUSD 26.11.1): HdRepr.
//
// Deliberate divergences:
// - HdReprSelector (repr.h:24-98) was first ported into displayStyle.ts; it is
//   re-exported here, where upstream declares it.
// - DrawItemUniquePtr ownership is plain array membership; a draw item the
//   repr drops (clearGeomSubsetDrawItems, destroy) is destroyed with
//   HdDrawItem.destroy(), the unique_ptr's delete.

import type { HdDrawItem } from './drawItem.ts'
export { HdReprSelector } from './displayStyle.ts'

/** repr.h:105-195 */
export class HdRepr {
  // Contains normal draw items first, potentially followed by geom subset
  // draw items (repr.h:186-191).
  private _drawItems: HdDrawItem[] = []
  // Index into _drawItems indicating where the geom subset draw items begin.
  private _geomSubsetsStart = 0

  /** repr.h:117-119 */
  getDrawItems(): readonly HdDrawItem[] { return this._drawItems }

  /** repr.h:123-127: do not use for geom subset draw items. */
  addDrawItem(item: HdDrawItem): void {
    this._drawItems.splice(this._geomSubsetsStart, 0, item)
    this._geomSubsetsStart++
  }

  /** repr.h:132-134 */
  getDrawItem(index: number): HdDrawItem | null { return this._drawItems[index] ?? null }

  /** repr.h:156-158: only for geom subset draw items. */
  addGeomSubsetDrawItem(item: HdDrawItem): void { this._drawItems.push(item) }

  /** repr.h:161-165 */
  getDrawItemForGeomSubset(reprDescIndex: number, numGeomSubsets: number,
    geomSubsetIndex: number): HdDrawItem | null {
    return this._drawItems[this._geomSubsetsStart + reprDescIndex * numGeomSubsets
      + geomSubsetIndex] ?? null
  }

  /** repr.h:168-171 */
  clearGeomSubsetDrawItems(): void {
    for (const item of this._drawItems.splice(this._geomSubsetsStart)) item.destroy()
  }

  /** The destructor (~HdRepr): deletes the draw items. */
  destroy(): void {
    const items = this._drawItems
    this._drawItems = []
    this._geomSubsetsStart = 0
    for (const item of items) item.destroy()
  }
}

// Ported from OpenUSD 26.11.1: pxr/imaging/hd/bufferArray.cpp,
//  pxr/imaging/hd/bufferArray.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/bufferArray.{h,cpp} (OpenUSD 26.11.1).
//
// A HdBufferArray owns the backing GPU buffer(s) for a layout (one spec
// vector) and packs multiple ranges into it.
//
// Divergences:
// - PLATFORM-DIVERGENCE(hd-bar-shared-ptr): the range list holds the ranges
//   themselves; a range whose `_expired` flag is set is the expired weak_ptr
//   (see bufferArrayRange.ts). GetRange returns the range (callers test
//   `_expired` where upstream calls lock()).
// - FAITHFULNESS-DEBT(hd-bufferarray-legacy-api): GarbageCollect, DebugDump
//   and GetMaxNumElements have defaults; RemoveUnusedRanges also flags
//   reallocation and reports whether a range went away; SetNeedsReallocation
//   (overridden by the hdSt buffer arrays) and destroy are on the base.
// - destroy() is the destructor.

import { HdPerfLog } from './perfLog.ts'
import type { HdBufferArrayRange } from './bufferArrayRange.ts'

export { HdBufferArrayRange } from './bufferArrayRange.ts'

/** bufferArray.h:45-53 */
export enum HdBufferArrayUsageHintBits {
  HdBufferArrayUsageHintBitsImmutable   = 1 << 0,
  HdBufferArrayUsageHintBitsSizeVarying = 1 << 1,
  HdBufferArrayUsageHintBitsUniform     = 1 << 2,
  HdBufferArrayUsageHintBitsStorage     = 1 << 3,
  HdBufferArrayUsageHintBitsVertex      = 1 << 4,
  HdBufferArrayUsageHintBitsIndex       = 1 << 5,
}
/** bufferArray.h:54 */
export type HdBufferArrayUsageHint = number

/** bufferArray.cpp:15 */
let _uniqueVersion = 0

/** bufferArray.h:62-176 */
export abstract class HdBufferArray {
  readonly role: string
  readonly usageHint: HdBufferArrayUsageHint

  protected _needsReallocation = false
  private _rangeList: HdBufferArrayRange[] = []
  private readonly _garbageCollectionPerfToken: string
  protected _version: number
  protected _maxNumRanges = 1

  /** bufferArray.cpp:17-31 */
  constructor(role: string, garbageCollectionPerfToken: string, usageHint: HdBufferArrayUsageHint) {
    this.role = role
    this._garbageCollectionPerfToken = garbageCollectionPerfToken
    this.usageHint = usageHint
    this._version = _uniqueVersion++
  }

  /** bufferArray.h:74 */
  getRole(): string { return this.role }

  /** bufferArray.h:78-80 */
  getVersion(): number { return this._version }

  /** bufferArray.cpp:38-42 */
  incrementVersion(): void {
    this._version = _uniqueVersion++
  }

  /** bufferArray.cpp:44-81. Single-threaded: the atomic counter is the
   *  range list length. */
  tryAssignRange(range: HdBufferArrayRange): boolean {
    if (this._rangeList.length >= this._maxNumRanges) {
      return false
    }
    this._rangeList.push(range)
    range.setBufferArray(this)
    this._needsReallocation = true
    return true
  }

  /** bufferArray.h:94. Returns true if the array became empty. */
  garbageCollect(): boolean { return false }

  /** bufferArray.h:100-102 */
  abstract reallocate(ranges: HdBufferArrayRange[], curRangeOwner: HdBufferArray): void

  /** bufferArray.cpp:133-139 */
  getMaxNumElements(): number {
    return this._maxNumRanges
  }

  /** bufferArray.h:109 */
  debugDump(): string { return '' }

  /** bufferArray.h:112 */
  getRangeCount(): number { return this._rangeList.length }

  /** bufferArray.cpp:109-117 */
  getRange(idx: number): HdBufferArrayRange | undefined {
    return this._rangeList[idx]
  }

  /** bufferArray.cpp:83-107. Expired ranges are replaced by the last range
   *  in the list, as upstream does. */
  removeUnusedRanges(): boolean {
    let numRanges = this._rangeList.length
    let removed = false
    let idx = 0
    while (idx < numRanges) {
      if (this._rangeList[idx]!._expired) {
        this._rangeList[idx] = this._rangeList[numRanges - 1]!
        --numRanges
        removed = true
        if (this._garbageCollectionPerfToken) {
          HdPerfLog.GetInstance().incrementCounter(this._garbageCollectionPerfToken)
        }
      } else {
        ++idx
      }
    }
    this._rangeList.length = numRanges
    if (removed) this._needsReallocation = true
    return removed
  }

  /** bufferArray.h:124-126 */
  needsReallocation(): boolean { return this._needsReallocation }

  setNeedsReallocation(): void { this._needsReallocation = true }

  /** bufferArray.h:129-131 */
  isImmutable(): boolean {
    return (this.usageHint & HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsImmutable) !== 0
  }

  /** bufferArray.h:134-136 */
  getUsageHint(): HdBufferArrayUsageHint { return this.usageHint }

  /** bufferArray.h:145 */
  protected _setMaxNumRanges(max: number): void { this._maxNumRanges = max }

  /** bufferArray.cpp:119-131 */
  protected _setRangeList(ranges: readonly HdBufferArrayRange[]): void {
    this._rangeList = [...ranges]
    for (const r of ranges) r.setBufferArray(this)
  }

  getMaxNumRanges(): number { return this._maxNumRanges }

  /** The destructor. */
  abstract destroy(): void
}

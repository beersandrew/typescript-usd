// Ported from OpenUSD 26.11.1: pxr/imaging/hd/bufferArrayRange.cpp,
//  pxr/imaging/hd/bufferArrayRange.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/bufferArrayRange.{h,cpp} (OpenUSD 26.11.1).
//
// A HdBufferArrayRange is a prim's sub-allocation (an element offset + count)
// in one HdBufferArray; it owns no GPU memory.
//
// Divergences:
// - PLATFORM-DIVERGENCE(hd-bar-shared-ptr): ranges are shared_ptrs upstream and
//   buffer arrays hold weak_ptrs; the destructor notifies the owning array.
//   JS has no shared_ptr use_count, so ranges carry an explicit reference
//   count: every holder that keeps a range beyond the call that got it (an
//   HdBufferArrayRangeContainer slot, an HdInstanceRegistry entry, a member
//   such as HdStExtComputation::_inputRange or HdStInstancer::
//   _instancePrimvarRange) calls _retain() where upstream copies the
//   shared_ptr into it and release() where upstream reassigns or destroys
//   that copy. Local and argument shared_ptrs, which upstream drops before
//   any GarbageCollect can run, are not counted. When the count returns to
//   zero the range is expired (the weak_ptrs the buffer arrays hold stop
//   locking) and _onExpired, the destructor analog the hdSt ranges override,
//   runs once. A range no holder ever retained never expires: holders that
//   are not counted (the hdx tasks, HdStRenderPassState, the dispatch
//   buffers, unit tests) keep their ranges for their lifetime, where
//   upstream frees a range whose only shared_ptr is dropped.
// - GetBufferSpecs returns the specs instead of filling an out vector.
//   ReadData returns `unknown` (a VtValue for the hdSt ranges). operator<< is
//   DebugDump returning text.
// - HdBufferArrayRangeContainer stays in rprimSharedData.ts.

import type { HdBufferArray, HdBufferArrayUsageHint } from './bufferArray.ts'
import type { HdBufferSource } from './bufferSource.ts'
import type { HdBufferSpec } from './bufferSpec.ts'
import { TF_CODING_ERROR } from './tfDiagnostic.ts'

/** bufferArrayRange.h:28-111 */
export abstract class HdBufferArrayRange {
  private _holders = 0
  private _isExpired = false

  /** PLATFORM-DIVERGENCE(hd-bar-shared-ptr): a holder copies the shared_ptr
   *  (see the header). */
  _retain(): this {
    if (this._isExpired) {
      TF_CODING_ERROR('HdBufferArrayRange retained after it expired')
      return this
    }
    ++this._holders
    return this
  }

  /** PLATFORM-DIVERGENCE(hd-bar-shared-ptr): a holder drops its shared_ptr
   *  copy; the last one runs the destructor (see the header). */
  release(): void {
    if (this._holders <= 0) {
      TF_CODING_ERROR('HdBufferArrayRange released more often than retained')
      return
    }
    if (--this._holders === 0) {
      this._isExpired = true
      this._onExpired()
    }
  }

  /** shared_ptr::use_count() of the counted holders (see the header). */
  _useCount(): number { return this._holders }

  /** PLATFORM-DIVERGENCE(hd-bar-shared-ptr): the weak_ptr's expired(). */
  get _expired(): boolean { return this._isExpired }

  /** The destructor analog, run once when the range expires. */
  protected _onExpired(): void {}

  /** bufferArrayRange.h:44 */
  abstract isValid(): boolean

  /** bufferArrayRange.h:47 */
  abstract isAssigned(): boolean

  /** bufferArrayRange.h:50 */
  abstract isImmutable(): boolean

  /** bufferArrayRange.h:53 */
  abstract requiresStaging(): boolean

  /** bufferArrayRange.h:57 */
  abstract resize(numElements: number): boolean

  /** bufferArrayRange.h:60 */
  abstract copyData(bufferSource: HdBufferSource): void

  /** bufferArrayRange.h:63 */
  abstract ReadData(name: string): unknown

  /** bufferArrayRange.h:67 */
  abstract getElementOffset(): number

  /** bufferArrayRange.h:71 */
  abstract getByteOffset(resourceName: string): number

  /** bufferArrayRange.h:74 */
  abstract getNumElements(): number

  /** bufferArrayRange.h:77 */
  abstract getVersion(): number

  /** bufferArrayRange.h:81 */
  abstract incrementVersion(): void

  /** bufferArrayRange.h:84 */
  abstract getMaxNumElements(): number

  /** bufferArrayRange.h:87 */
  abstract getUsageHint(): HdBufferArrayUsageHint

  /** bufferArrayRange.h:90 */
  abstract setBufferArray(bufferArray: HdBufferArray | null): void

  /** bufferArrayRange.h:93; operator<< (bufferArrayRange.cpp:11-17). */
  abstract debugDump(): string

  /** bufferArrayRange.h:96-98 */
  isAggregatedWith(other: HdBufferArrayRange | null | undefined): boolean {
    return !!other && this._getAggregation() === other._getAggregation()
  }

  /** bufferArrayRange.h:101 */
  abstract getBufferSpecs(): HdBufferSpec[]

  /** bufferArrayRange.h:105 */
  protected abstract _getAggregation(): unknown
}

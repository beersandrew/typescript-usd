// Ported from OpenUSD 26.11.1: pxr/imaging/hd/bufferSource.cpp,
//  pxr/imaging/hd/bufferSource.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/bufferSource.{h,cpp} (OpenUSD 26.11.1).
//
// A buffer source is CPU-side data destined for one channel of a buffer-array
// range, not yet committed. The resource registry collects sources, resolves
// them (the Resolve() state machine lets a source wait on a prerequisite),
// then copies the resolved bytes into the range's GPU sub-allocation.
//
// Divergences:
// - GetData returns the bytes as a typed array (`void const*` upstream). A
//   source with no data returns an empty view (upstream nullptr) after the
//   same coding error, so callers need no null check.
// - GetBufferSpecs returns the specs instead of appending to an out vector.
// - The atomic state is a plain field (single-threaded).
// - HdVtBufferSource lives in vtBufferSource.ts, as upstream.

import { Tf_HashState, TfDiagnosticMgr, TfDiagnosticType, Error as TfError } from 'typescript-usd/tf'
import { type HdTupleType, HdDataSizeOfTupleType, HdType } from './types.ts'
import type { HdBufferSpec } from './bufferSpec.ts'

function TF_CODING_ERROR(message: string): void {
  TfDiagnosticMgr.GetInstance().postError(new TfError(message, TfDiagnosticType.CodingError))
}

function TF_VERIFY(cond: boolean): boolean {
  if (!cond) TF_CODING_ERROR('Failed verification')
  return cond
}

const _emptyData = new Uint8Array(0)

/** bufferSource.h:241-245 State */
const enum _State { UNRESOLVED = 0, BEING_RESOLVED, RESOLVED, RESOLVE_ERROR }

/** bufferSource.h:36-238 */
export abstract class HdBufferSource {
  private _state: _State

  /** bufferSource.h:39-43, 244 */
  constructor(state: number = _State.UNRESOLVED) {
    this._state = state
  }

  /** bufferSource.h:50 */
  abstract getName(): string

  /** bufferSource.h:53-54 */
  abstract getBufferSpecs(): HdBufferSpec[]

  /** bufferSource.cpp:28-32 (TfHashAppend, bufferSource.cpp:13-22). */
  computeHash(): bigint {
    const h = new Tf_HashState()
    const tt = this.getTupleType()
    const data = this.getData()
    const size = HdDataSizeOfTupleType(tt) * this.getNumElements()
    h.append(new Uint8Array(data.buffer, data.byteOffset, Math.min(size, data.byteLength)))
    h.append(this.getName(), [BigInt(tt.type), BigInt(tt.count)])
    return h.getCode()
  }

  /** bufferSource.h:68-90 */
  abstract resolve(): boolean

  /** bufferSource.h:93-95 */
  abstract getData(): ArrayBufferView

  /** bufferSource.h:98 */
  abstract getTupleType(): HdTupleType

  /** bufferSource.h:102 */
  abstract getNumElements(): number

  /** bufferSource.h:105-107 */
  isResolved(): boolean {
    return this._state >= _State.RESOLVED
  }

  /** bufferSource.h:110-112 */
  hasResolveError(): boolean {
    return this._state === _State.RESOLVE_ERROR
  }

  /** bufferSource.cpp:34-38 */
  hasPreChainedBuffer(): boolean {
    return false
  }

  /** bufferSource.cpp:40-44 */
  getPreChainedBuffer(): HdBufferSource | null {
    return null
  }

  /** bufferSource.cpp:46-50 */
  hasChainedBuffer(): boolean {
    return false
  }

  /** bufferSource.cpp:52-56 */
  getChainedBuffers(): HdBufferSource[] {
    return []
  }

  /** bufferSource.cpp:58-62 */
  isValid(): boolean {
    return this._checkValid()
  }

  /** bufferSource.h:163-166 */
  protected _setResolved(): void {
    TF_VERIFY(this._state === _State.BEING_RESOLVED)
    this._state = _State.RESOLVED
  }

  /** bufferSource.h:174-177 */
  protected _setResolveError(): void {
    TF_VERIFY(this._state === _State.BEING_RESOLVED)
    this._state = _State.RESOLVE_ERROR
  }

  /** bufferSource.h:190-194 */
  protected _tryLock(): boolean {
    if (this._state !== _State.UNRESOLVED) return false
    this._state = _State.BEING_RESOLVED
    return true
  }

  /** bufferSource.h:200 */
  protected abstract _checkValid(): boolean

  /** bufferSource.h:241 */
  protected static readonly UNRESOLVED = _State.UNRESOLVED
  protected static readonly BEING_RESOLVED = _State.BEING_RESOLVED
  protected static readonly RESOLVED = _State.RESOLVED
  protected static readonly RESOLVE_ERROR = _State.RESOLVE_ERROR
}

/** bufferSource.h:209-217. A buffer source that is resolved on construction. */
export abstract class HdResolvedBufferSource extends HdBufferSource {
  constructor() {
    super(_State.RESOLVED)
  }

  /** bufferSource.h:214-215 */
  resolve(): boolean { return true }
}

/** bufferSource.h:223-248. A buffer source whose data is computed during
 *  Resolve() and stored with _SetResult. */
export abstract class HdComputedBufferSource extends HdBufferSource {
  private _result: HdBufferSource | null = null

  /** bufferSource.cpp:72-80 */
  getName(): string {
    if (!this._result) {
      return ''
    }
    return this._result.getName()
  }

  /** bufferSource.cpp:66-70 */
  override computeHash(): bigint {
    return 0n
  }

  /** bufferSource.cpp:82-91 */
  getData(): ArrayBufferView {
    if (!this._result) {
      TF_CODING_ERROR('HdComputedBufferSource::GetData() called without ' +
                      'setting the result.')
      return _emptyData
    }
    return this._result.getData()
  }

  /** bufferSource.cpp:93-102 */
  getTupleType(): HdTupleType {
    if (!this._result) {
      TF_CODING_ERROR('HdComputedBufferSource::GetTupleType() called ' +
                      'without setting the result.')
      return { type: HdType.HdTypeInvalid, count: 0 }
    }
    return this._result.getTupleType()
  }

  /** bufferSource.cpp:104-109 */
  getNumElements(): number {
    // GetNumElements returns 0 for the empty result.
    return this._result ? this._result.getNumElements() : 0
  }

  /** bufferSource.h:241-243 */
  protected _setResult(result: HdBufferSource): void {
    this._result = result
  }
}

/** bufferSource.h:255-269. A buffer source used only for its Resolve() side
 *  effect (e.g. building a table other sources depend on). */
export abstract class HdNullBufferSource extends HdBufferSource {
  /** bufferSource.cpp:118-124 */
  getName(): string {
    TF_CODING_ERROR("HdNullBufferSource can't be scheduled with a buffer range")
    return ''
  }

  /** bufferSource.cpp:126-131 */
  getData(): ArrayBufferView {
    TF_CODING_ERROR("HdNullBufferSource can't be scheduled with a buffer range")
    return _emptyData
  }

  /** bufferSource.cpp:112-116 */
  override computeHash(): bigint {
    return 0n
  }

  /** bufferSource.cpp:140-144 */
  getNumElements(): number {
    return 0
  }

  /** bufferSource.cpp:133-138 */
  getTupleType(): HdTupleType {
    TF_CODING_ERROR("HdNullBufferSource can't be scheduled with a buffer " +
                    'range')
    return { type: HdType.HdTypeInvalid, count: 0 }
  }

  /** bufferSource.cpp:146-150 */
  getBufferSpecs(): HdBufferSpec[] {
    // nothing
    return []
  }
}


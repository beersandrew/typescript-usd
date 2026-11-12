// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdSt/extCompComputedInputSource.cpp,
//  pxr/imaging/hdSt/extCompComputedInputSource.h
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/extCompComputedInputSource.{h,cpp} (OpenUSD
// 26.11.1).

import type { Value as VtValue } from 'typescript-usd/vt'
import type { HdStExtCompCpuComputation } from './extCompCpuComputation.ts'
import { HdSt_ExtCompInputSource } from './extCompInputSource.ts'

/** extCompCpuComputation.cpp:21-22 INVALID_OUTPUT_INDEX
 *  (std::numeric_limits<size_t>::max()), here so this module does not need
 *  the computation class at load time. */
const _INVALID_OUTPUT_INDEX = Number.MAX_SAFE_INTEGER

/** extCompComputedInputSource.h:23-62. An Hd Buffer Source Computation that
 *  is used to bind an ExtComputation input to a specific output of another
 *  ExtComputation. */
export class HdSt_ExtCompComputedInputSource extends HdSt_ExtCompInputSource {
  private readonly _sourceOutputIdx: number

  /** extCompComputedInputSource.cpp:13-22. Constructs the computation,
   *  binding inputName to sourceOutputName on buffer source representation
   *  of the source computation. */
  constructor(
    name: string,
    private readonly _source: HdStExtCompCpuComputation,
    sourceOutputName: string,
  ) {
    super(name)
    this._sourceOutputIdx = _source.getOutputIndex(sourceOutputName)
  }

  /** extCompComputedInputSource.cpp:26-45. Returns true once the source
   *  computation has been resolved. */
  override resolve(): boolean {
    const sourceValid = this._source.isValid()
    if (sourceValid) {
      if (!this._source.isResolved()) {
        return false
      }
    }

    if (!this._tryLock()) return false

    if (!sourceValid || this._source.hasResolveError()) {
      this._setResolveError()
      return true
    }

    this._setResolved()
    return true
  }

  /** extCompComputedInputSource.cpp:47-51. Obtains the value of the output
   *  from the source computation. */
  GetValue(): VtValue {
    return this._source.getOutputByIndex(this._sourceOutputIdx)
  }

  /** extCompComputedInputSource.cpp:54-60. Returns true if the binding is
   *  successful. */
  protected override _checkValid(): boolean {
    return (this._source !== null && this._source !== undefined &&
      (this._sourceOutputIdx !== _INVALID_OUTPUT_INDEX))
  }
}

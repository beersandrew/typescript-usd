// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdSt/extCompGpuPrimvarBufferSource.cpp,
//  pxr/imaging/hdSt/extCompGpuPrimvarBufferSource.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/extCompGpuPrimvarBufferSource.{h,cpp}
// (OpenUSD 26.11.1).

import { HashCombine as TfHashCombine } from 'typescript-usd/tf'
import {
  NullBufferSource as HdNullBufferSource,
  type BufferSpec as HdBufferSpec, type TupleType as HdTupleType,
} from 'typescript-usd/hd'

/** extCompGpuPrimvarBufferSource.h:25-67. A buffer source mapped to an
 *  output of an ExtComp CPU computation. */
export class HdStExtCompGpuPrimvarBufferSource extends HdNullBufferSource {
  /** extCompGpuPrimvarBufferSource.cpp:16-27 */
  constructor(
    private readonly _name: string,
    private readonly _tupleType: HdTupleType,
    private readonly _numElements: number,
    private readonly _compId: string,
  ) {
    super()
  }

  /** extCompGpuPrimvarBufferSource.cpp:29-34 */
  override getName(): string {
    return this._name
  }

  /** extCompGpuPrimvarBufferSource.cpp:36-44. Simply return a hash based on
   *  the computation and primvar names, instead of hashing the contents of
   *  the inputs to the computation. This effectively disables primvar
   *  sharing when using computed primvars. */
  override computeHash(): bigint {
    return TfHashCombine(this._compId, this._name)
  }

  /** extCompGpuPrimvarBufferSource.cpp:46-53 */
  override resolve(): boolean {
    if (!this._tryLock()) return false
    this._setResolved()
    return true
  }

  /** extCompGpuPrimvarBufferSource.cpp:55-60 */
  protected override _checkValid(): boolean {
    return true
  }

  /** extCompGpuPrimvarBufferSource.cpp:62-67 */
  override getNumElements(): number {
    return this._numElements
  }

  /** extCompGpuPrimvarBufferSource.cpp:69-74 */
  override getTupleType(): HdTupleType {
    return this._tupleType
  }

  /** extCompGpuPrimvarBufferSource.cpp:76-82 */
  override getBufferSpecs(): HdBufferSpec[] {
    return [{ name: this._name, tupleType: this._tupleType }]
  }
}

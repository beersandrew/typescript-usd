// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdSt/extCompPrimvarBufferSource.cpp,
//  pxr/imaging/hdSt/extCompPrimvarBufferSource.h
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/extCompPrimvarBufferSource.{h,cpp} (OpenUSD
// 26.11.1).
//
// Divergence: GetData returns the HdVtBufferSource's data view (upstream
// keeps its raw pointer, which points into the computation's output VtValue).

import { HashCombine as TfHashCombine } from 'typescript-usd/tf'
import {
  BufferSource as HdBufferSource, TupleTypeEquals as HdTupleTypeEquals,
  Type as HdType, VtBufferSource as HdVtBufferSource,
  type BufferSpec as HdBufferSpec, type TupleType as HdTupleType,
} from 'typescript-usd/hd'
import { HdStExtCompCpuComputation } from './extCompCpuComputation.ts'
import { TF_WARN } from './tfDiagnostic.ts'

const _emptyData = new Uint8Array(0)

/** extCompPrimvarBufferSource.h:25-98. Hd Buffer Source that binds a
 *  primvar to a Ext Computation output. This buffer source is responsible
 *  for providing the data for the primvar. */
export class HdStExtCompPrimvarBufferSource extends HdBufferSource {
  private readonly _sourceOutputIdx: number
  private _rawDataPtr: ArrayBufferView | null = null

  /** extCompPrimvarBufferSource.cpp:15-28. Constructs a new primvar buffer
   *  source called primvarName and binds it to the output called
   *  sourceOutputName from the computation identified by source. */
  constructor(
    private readonly _primvarName: string,
    private readonly _source: HdStExtCompCpuComputation,
    sourceOutputName: string,
    private readonly _tupleType: HdTupleType,
  ) {
    super()
    this._sourceOutputIdx = _source.getOutputIndex(sourceOutputName)
  }

  /** extCompPrimvarBufferSource.cpp:32-36 */
  getName(): string {
    return this._primvarName
  }

  /** extCompPrimvarBufferSource.cpp:38-42 */
  getBufferSpecs(): HdBufferSpec[] {
    return [{ name: this._primvarName, tupleType: this._tupleType }]
  }

  /** extCompPrimvarBufferSource.cpp:44-58. Hashes the source computation's
   *  name and the primvar name. */
  override computeHash(): bigint {
    return TfHashCombine(this._source.getName(), this._primvarName)
  }

  /** extCompPrimvarBufferSource.cpp:60-96. Waits for the source
   *  computation to be resolved and then binds the output. */
  resolve(): boolean {
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

    const output = new HdVtBufferSource(this._primvarName,
      this._source.getOutputByIndex(this._sourceOutputIdx))

    // Validate output type and count matches what is expected.
    if (!HdTupleTypeEquals(output.getTupleType(), this._tupleType)) {
      TF_WARN(`Output type mismatch on ${this._primvarName}. `)
      this._setResolveError()
      return true
    }
    if (output.getNumElements() !== this._source.getNumElements()) {
      TF_WARN(`Output elements mismatch on ${this._primvarName}. `)
      this._setResolveError()
      return true
    }

    this._rawDataPtr = output.getData()

    this._setResolved()
    return true
  }

  /** extCompPrimvarBufferSource.cpp:99-103 */
  getData(): ArrayBufferView {
    return this._rawDataPtr ?? _emptyData
  }

  /** extCompPrimvarBufferSource.cpp:105-109 */
  getTupleType(): HdTupleType {
    return this._tupleType
  }

  /** extCompPrimvarBufferSource.cpp:111-115 */
  getNumElements(): number {
    return this._source.getNumElements()
  }

  /** extCompPrimvarBufferSource.cpp:117-124 */
  protected _checkValid(): boolean {
    return (this._source !== null && this._source !== undefined &&
      (this._sourceOutputIdx !== HdStExtCompCpuComputation.INVALID_OUTPUT_INDEX) &&
      (this._tupleType.type !== HdType.HdTypeInvalid))
  }
}

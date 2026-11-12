// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/basisCurvesTopology.cpp,
//  pxr/imaging/hdSt/basisCurvesTopology.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/basisCurvesTopology.{h,cpp} (OpenUSD 26.11.1).
//
// Divergence: HdSt_BasisCurvesTopology::New takes the source topology and
// copies its fields through the HdBasisCurvesTopology constructor (the copy
// constructor, basisCurvesTopology.cpp:21-24), including the topological
// visibility.

import { Array as VtArray, Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import {
  BasisCurvesTopology as HdBasisCurvesTopology,
  Tokens as HdTokens,
  VtBufferSource as HdVtBufferSource,
  type BufferSource as HdBufferSource,
} from 'typescript-usd/hd'
import { HdSt_BasisCurvesIndexBuilderComputation } from './basisCurvesComputations.ts'
import { TF_VERIFY } from './tfDiagnostic.ts'

/** basisCurvesTopology.h:22-46 */
export class HdSt_BasisCurvesTopology extends HdBasisCurvesTopology {
  // PLATFORM-DIVERGENCE(hd-instance-use-count), hd/src/instanceRegistry.ts:
  // the shared_ptr holders (the HdInstanceRegistry entry and the rprims
  // that share it) are counted; the last release runs the destructor.
  private _holders = 0

  /** A holder copies the shared_ptr. */
  _retain(): this {
    ++this._holders
    return this
  }

  /** A holder drops its shared_ptr. */
  release(): void {
    if (!TF_VERIFY(this._holders > 0, 'HdSt_BasisCurvesTopology released too often')) return
    if (--this._holders === 0) this._destroy()
  }

  /** shared_ptr::use_count() of the counted holders. */
  _useCount(): number { return this._holders }

  /** The destructor: nothing to drop. */
  private _destroy(): void {}

  /** basisCurvesTopology.cpp:15-19 */
  static new(src: HdBasisCurvesTopology): HdSt_BasisCurvesTopology {
    return new HdSt_BasisCurvesTopology(src)
  }

  /** basisCurvesTopology.cpp:21-24 */
  private constructor(src: HdBasisCurvesTopology) {
    super(src.getCurveType(), src.getCurveBasis(), src.getCurveWrap(),
      src.getCurveVertexCounts(), src.getCurveIndices())
    this.setInvisiblePoints(src.getInvisiblePoints())
    this.setInvisibleCurves(src.getInvisibleCurves())
  }

  /** basisCurvesTopology.cpp:31-56 */
  getPointsIndexBuilderComputation(): HdBufferSource {
    // This is simple enough to return the result right away, instead of
    // using a computed buffer source.
    const vertexCounts = this.getCurveVertexCounts()
    let numVerts = 0
    for (const count of vertexCounts) {
      numVerts += count
    }

    const finalIndices = new Int32Array(numVerts)
    const curveIndices = this.getCurveIndices()
    if (curveIndices.length === 0) {
      for (let i = 0; i < numVerts; ++i) {
        finalIndices[i] = i
      }
    } else {
      for (let i = 0; i < numVerts; ++i) {
        finalIndices[i] = curveIndices[i]!
      }
    }

    // Note: The primitive param buffer isn't bound.
    return new HdVtBufferSource(HdTokens.indices,
      VtValue.createArray(VtArray._adopt<number>(VtValueTypes.int, finalIndices)))
  }

  /** basisCurvesTopology.cpp:58-63 */
  getIndexBuilderComputation(forceLines: boolean): HdBufferSource {
    return new HdSt_BasisCurvesIndexBuilderComputation(this, forceLines)
  }
}

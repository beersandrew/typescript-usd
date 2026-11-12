// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/basisCurvesComputations.cpp,
//  pxr/imaging/hdSt/basisCurvesComputations.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/basisCurvesComputations.{h,cpp}
// (OpenUSD 26.11.1).
//
// Divergences:
// - GetBufferSpecs returns the specs instead of filling an out vector.
// - The templates HdSt_ExpandVarying<T> and
//   HdSt_BasisCurvesPrimvarInterpolaterComputation<T> are generic over the
//   element type of a typescript-usd/vt VtArray; the element type travels
//   with the array.
// - The index arrays are built in typed storage (VtArray._Adopt over an
//   Int32Array) rather than std::vector<GfVec2i/GfVec4i>.
// - HD_TRACE_FUNCTION is not ported.

import { Array as VtArray, Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import {
  ComputedBufferSource as HdComputedBufferSource,
  Interpolation as HdInterpolation,
  Tokens as HdTokens,
  Type as HdType,
  VtBufferSource as HdVtBufferSource,
  type BasisCurvesTopology as HdBasisCurvesTopology,
  type BufferSource as HdBufferSource,
  type BufferSpec as HdBufferSpec,
} from 'typescript-usd/hd'
import type { HdSt_BasisCurvesTopology } from './basisCurvesTopology.ts'
import { TF_VERIFY, TF_WARN } from './tfDiagnostic.ts'

/** basisCurvesComputations.h:34-41 IndexAndPrimIndex */
interface _IndexAndPrimIndex {
  indices: VtValue
  primIndices: VtValue
}

function _IntArray(values: readonly number[] | Int32Array): VtValue {
  return VtValue.createArray(VtArray._adopt<number>(VtValueTypes.int, Int32Array.from(values)))
}

/** basisCurvesComputations.h:28-61 */
export class HdSt_BasisCurvesIndexBuilderComputation extends HdComputedBufferSource {
  private readonly _topology: HdBasisCurvesTopology
  private readonly _forceLines: boolean
  private _primitiveParam: HdBufferSource | null = null

  /** basisCurvesComputations.cpp:20-25 */
  constructor(topology: HdBasisCurvesTopology, forceLines: boolean) {
    super()
    this._topology = topology
    this._forceLines = forceLines
  }

  /** basisCurvesComputations.cpp:27-46 */
  override getBufferSpecs(): HdBufferSpec[] {
    const specs: HdBufferSpec[] = []
    // index buffer
    if (!this._forceLines && this._topology.getCurveType() === HdTokens.cubic) {
      specs.push({ name: HdTokens.indices, tupleType: { type: HdType.HdTypeInt32Vec4, count: 1 } })
    } else {
      specs.push({ name: HdTokens.indices, tupleType: { type: HdType.HdTypeInt32Vec2, count: 1 } })
    }

    // primitive index buffer (curve id per curve segment) is used only
    // when the basis curve has uniform primvars.
    // XXX: we currently create it even when the curve has no uniform primvars
    specs.push({ name: HdTokens.primitiveParam, tupleType: { type: HdType.HdTypeInt32, count: 1 } })
    return specs
  }

  /** Maps the generated n-wide indices through the authored curve indices
   *  (the `HasIndices()` branches of basisCurvesComputations.cpp:74-96,
   *  150-172, 333-362). */
  private _mapIndices(indices: number[], width: number): Int32Array {
    const finalIndices = new Int32Array(indices.length)
    // If have topology has indices set, map the generated indices
    // with the given indices.
    if (!this._topology.hasIndices()) {
      finalIndices.set(indices)
    } else {
      const curveIndices = this._topology.getCurveIndices()
      const maxIndex = curveIndices.length - 1
      const count = indices.length / width
      for (let lineNum = 0; lineNum < count; ++lineNum) {
        for (let v = 0; v < width; ++v) {
          const i = Math.min(indices[lineNum * width + v]!, maxIndex)
          finalIndices[lineNum * width + v] = curveIndices[i]!
        }
      }
    }
    return finalIndices
  }

  /** basisCurvesComputations.cpp:48-105 */
  private _buildLinesIndexArray(): _IndexAndPrimIndex {
    // Note: This is used only when the wrap mode is segmented and is similar to
    //       the GL_LINES primitive mode. Vertices (0,1) form a line, (2,3) form
    //       the next line and so on.
    const indices: number[] = []
    const primIndices: number[] = []
    const vertexCounts = this._topology.getCurveVertexCounts()

    let vertexIndex = 0
    let curveIndex = 0
    for (const count of vertexCounts) {
      for (let i = 0; i < count; i += 2) {
        indices.push(vertexIndex, vertexIndex + 1)
        vertexIndex += 2
        primIndices.push(curveIndex)
      }
      curveIndex++
    }

    return {
      indices: VtValue.createArray(VtArray._adopt(VtValueTypes.GfVec2i, this._mapIndices(indices, 2))),
      primIndices: _IntArray(primIndices),
    }
  }

  /** basisCurvesComputations.cpp:107-181 */
  private _buildLineSegmentIndexArray(): _IndexAndPrimIndex {
    // Note: This is similiar to the GL_LINE_STRIP and GL_LINE_LOOP primitive
    //       modes where each pair of adjacent vertices form a line.
    const basis = this._topology.getCurveBasis()
    const wrap = this._topology.getCurveWrap()
    // Skip first and last segments for catRom when not using pinned wrap mode
    // since the curve interpolates at all except the end points.
    const skipFirstAndLastSegs =
      (basis === HdTokens.catmullRom ||
        basis === HdTokens.centripetalCatmullRom) &&
      wrap !== HdTokens.pinned

    const indices: number[] = []
    // primIndices stores the curve index that generated each line segment.
    const primIndices: number[] = []
    const vertexCounts = this._topology.getCurveVertexCounts()
    const periodic = wrap === HdTokens.periodic
    let vertexIndex = 0 // Index of next vertex to emit
    let curveIndex = 0  // Index of next curve to emit
    // For each curve
    for (const count of vertexCounts) {
      let v0 = vertexIndex
      let v1: number
      // Store first vert index incase we are wrapping
      const firstVert = v0
      ++vertexIndex
      for (let i = 1; i < count; ++i) {
        v1 = vertexIndex
        ++vertexIndex
        if (!skipFirstAndLastSegs || (i > 1 && i < count - 1)) {
          indices.push(v0, v1)
          // Map this line segment back to the curve it came from
          primIndices.push(curveIndex)
        }
        v0 = v1
      }
      if (periodic) {
        indices.push(v0, firstVert)
        primIndices.push(curveIndex)
      }
      ++curveIndex
    }

    return {
      indices: VtValue.createArray(VtArray._adopt(VtValueTypes.GfVec2i, this._mapIndices(indices, 2))),
      primIndices: _IntArray(primIndices),
    }
  }

  /** basisCurvesComputations.cpp:183-369 (see the segment diagram there) */
  private _buildCubicIndexArray(): _IndexAndPrimIndex {
    const indices: number[] = []
    const primIndices: number[] = []

    const vertexCounts = this._topology.getCurveVertexCounts()
    const periodic = this._topology.getCurveWrap() === HdTokens.periodic
    let vStep: number
    const basis = this._topology.getCurveBasis()
    if (basis === HdTokens.bezier) {
      vStep = 3
    } else {
      vStep = 1
    }

    // The "pinned" wrap mode is relevant only to bspline and catmull-rom
    // curves to make the interpolated curve begin and end at the first and last
    // control vertices respectively.
    // Instead of computing the phantom points using reflection such that
    // p[-1] = 2 * p[0] - p[1] and p[n] = 2 * p[n-1] - p[n-2],
    // we simply repeat the start and end points (once for catmull-rom and twice
    // for bspline) to generate additional segment(s) at the start and end of
    // each curve. This simplifies the implementation considerably by avoiding
    // expansion of authored primvar data and factoring it when computing the
    // topology index buffer.
    //
    const pinned = (this._topology.getCurveWrap() === HdTokens.pinned) &&
      (vStep === 1)

    const addPinnedSegment = (startIndex: number, curveIndex: number,
      cvCount: number, start: boolean): void => {
      // Triplicate the start/end vertex for bspline and duplicate for
      // catmull-rom. This generates 2 segments each at the start and end
      // of each curve for bspline and 1 for catmull-rom curves.
      if (start) {
        const v0 = startIndex
        const endIndex = v0 + cvCount - 1
        const v1 = Math.min(v0 + 1, endIndex)
        const v2 = Math.min(v0 + 2, endIndex)

        if (basis === HdTokens.bspline) {
          indices.push(v0, v0, v0, v1)
          primIndices.push(curveIndex)
        }

        indices.push(v0, v0, v1, v2)
        primIndices.push(curveIndex)
      } else {
        const n = indices.length
        const lastSeg = [indices[n - 4]!, indices[n - 3]!, indices[n - 2]!, indices[n - 1]!]
        indices.push(lastSeg[1]!, lastSeg[2]!, lastSeg[3]!, lastSeg[3]!)
        primIndices.push(curveIndex)

        if (basis === HdTokens.bspline) {
          indices.push(lastSeg[2]!, lastSeg[3]!, lastSeg[3]!, lastSeg[3]!)
          primIndices.push(curveIndex)
        }
      }
    }

    let vertexIndex = 0
    let curveIndex = 0
    for (const count of vertexCounts) {
      if (count < 2) {
        // Minimum vertex count is 2 for pinned curves and 4 otherwise.
        vertexIndex += count
        curveIndex++
        continue
      }

      // If we're closing the curve, make sure that we have enough
      // segments to wrap all the way back to the beginning.
      // Note that the value calculated  does _not_ account for the additional
      // segments for pinned (non-periodic) curves.
      // (this should match the logic in
      //  HdBasisCurvesTopology::CalculateNeededNumberOfVaryingControlPoints)
      const numSegs = periodic ?
        Math.max(Math.trunc(count / vStep), 1) :
        Math.trunc(Math.max(count - 4, 0) / vStep) + 1

      if (pinned) {
        addPinnedSegment(vertexIndex, curveIndex, count, /*start =*/ true)
      }

      for (let i = 0; i < numSegs; ++i) {
        // Set up curve segments based on curve basis
        const offset = i * vStep
        for (let v = 0; v < 4; ++v) {
          // If there are not enough verts to round out the segment
          // just repeat the last vert.
          indices.push(periodic ?
            vertexIndex + ((offset + v) % count) :
            vertexIndex + Math.min(offset + v, count - 1))
        }
        primIndices.push(curveIndex)
      }

      if (pinned) {
        addPinnedSegment(vertexIndex, curveIndex, count, /*start =*/ false)
      }

      vertexIndex += count
      curveIndex++
    }

    return {
      indices: VtValue.createArray(VtArray._adopt(VtValueTypes.GfVec4i, this._mapIndices(indices, 4))),
      primIndices: _IntArray(primIndices),
    }
  }

  /** basisCurvesComputations.cpp:371-405 */
  override resolve(): boolean {
    if (!this._tryLock()) return false

    let result: _IndexAndPrimIndex

    if (!this._forceLines && this._topology.getCurveType() === HdTokens.cubic) {
      result = this._buildCubicIndexArray()
    } else {
      if (this._topology.getCurveWrap() === HdTokens.segmented) {
        result = this._buildLinesIndexArray()
      } else {
        result = this._buildLineSegmentIndexArray()
      }
    }

    this._setResult(new HdVtBufferSource(HdTokens.indices, result.indices))

    // the primitive param buffer is used only when the basis curve
    // has uniform primvars.
    // XXX: we currently create it even when the curve has no uniform primvars
    this._primitiveParam = new HdVtBufferSource(HdTokens.primitiveParam,
      result.primIndices)

    this._setResolved()
    return true
  }

  /** basisCurvesComputations.cpp:407-411 */
  protected override _checkValid(): boolean {
    return true
  }

  /** basisCurvesComputations.cpp:413-417 */
  override hasChainedBuffer(): boolean {
    return true
  }

  /** basisCurvesComputations.cpp:419-423 */
  override getChainedBuffers(): HdBufferSource[] {
    return [this._primitiveParam!]
  }
}

/** basisCurvesComputations.h:64-144 */
export function HdSt_ExpandVarying<T>(id: string, name: string,
  numVerts: number, vertexCounts: readonly number[],
  wrap: string, basis: string,
  authoredValues: VtArray<T>, fallbackValue: T): VtArray<T> {
  const outputValues = new VtArray<T>([], authoredValues.getElementType())
  outputValues.resize(numVerts, fallbackValue)

  let srcIndex = 0
  let dstIndex = 0

  if (wrap === HdTokens.periodic) {
    // XXX(HYD-2238): Add support for periodic curves.
    TF_WARN(`HdStBasisCurves(${id}) - Periodic expansion hasn't been` +
      ` implemented; expanding primvar ${name} as if non-periodic.`)
  }

  if (basis === HdTokens.catmullRom ||
    basis === HdTokens.centripetalCatmullRom ||
    basis === HdTokens.bspline) {
    for (const nVerts of vertexCounts) {
      // Handling for the case of potentially incorrect vertex counts
      if (nVerts < 1) {
        continue
      }

      // For splines with a vstep of 1, we are doing linear interpolation
      // between segments, so all we do here is duplicate the first and
      // last outputValues. Since these are never acutally used during
      // drawing, it would also work just to set the value to 0.
      outputValues.set(dstIndex, authoredValues.get(srcIndex))
      ++dstIndex
      for (let i = 1; i < nVerts - 2; ++i) {
        outputValues.set(dstIndex, authoredValues.get(srcIndex))
        ++dstIndex; ++srcIndex
      }
      outputValues.set(dstIndex, authoredValues.get(srcIndex))
      ++dstIndex
      outputValues.set(dstIndex, authoredValues.get(srcIndex))
      ++dstIndex; ++srcIndex
    }
    TF_VERIFY(srcIndex === authoredValues.length)
    TF_VERIFY(dstIndex === numVerts)
  } else if (basis === HdTokens.bezier) {
    for (const nVerts of vertexCounts) {
      // Handling for the case of potentially incorrect vertex counts
      if (nVerts < 1) {
        continue
      }

      // For bezier splines, we map the linear values to cubic values
      // the begin value gets mapped to the first two vertices and
      // the end value gets mapped to the last two vertices in a segment.
      // shaders can choose to access value[1] and value[2] when linearly
      // interpolating a value, which happens to match up with the
      // indexing to use for catmullRom and bSpline basis.
      const vStep = 3
      outputValues.set(dstIndex, authoredValues.get(srcIndex))
      ++dstIndex // don't increment the srcIndex
      outputValues.set(dstIndex, authoredValues.get(srcIndex))
      ++dstIndex; ++srcIndex

      // vstep - 1 control points will have an interpolated value
      for (let i = 2; i < nVerts - 2; i += vStep) {
        outputValues.set(dstIndex, authoredValues.get(srcIndex))
        ++dstIndex // don't increment the srcIndex
        outputValues.set(dstIndex, authoredValues.get(srcIndex))
        ++dstIndex // don't increment the srcIndex
        outputValues.set(dstIndex, authoredValues.get(srcIndex))
        ++dstIndex; ++srcIndex
      }
      outputValues.set(dstIndex, authoredValues.get(srcIndex))
      ++dstIndex // don't increment the srcIndex
      outputValues.set(dstIndex, authoredValues.get(srcIndex))
      ++dstIndex; ++srcIndex
    }
    TF_VERIFY(srcIndex === authoredValues.length)
    TF_VERIFY(dstIndex === numVerts)
  } else {
    // (outputValues is already filled with fallbackValue.)
    TF_WARN(`HdStBasisCurves(${id}) - Varying interpolation of primvar ${name} has` +
      ` unsupported basis ${basis}, using fallback value for rendering`)
  }

  return outputValues
}

/** A VtArray of `n` copies of `value`. */
function _Filled<T>(elementType: VtArray<T>, n: number, value: T): VtArray<T> {
  const array = new VtArray<T>([], elementType.getElementType())
  array.resize(n, value)
  return array
}

/** basisCurvesComputations.h:147-296 */
export class HdSt_BasisCurvesPrimvarInterpolaterComputation<T> extends HdComputedBufferSource {
  /** basisCurvesComputations.h:150-166 */
  constructor(
    private readonly _topology: HdSt_BasisCurvesTopology,
    private readonly _authoredPrimvar: VtArray<T>,
    private readonly _id: string,
    private readonly _name: string,
    private readonly _interpolation: HdInterpolation,
    private readonly _fallbackValue: T,
    private readonly _hdType: HdType,
  ) {
    super()
  }

  /** basisCurvesComputations.h:168-269 */
  override resolve(): boolean {
    if (!this._tryLock()) return false

    // Varying primvars are expanded to per-vertex, so the expected vertex
    // primvar size is used below.
    const numVertsExpected =
      this._topology.calculateNeededNumberOfControlPoints()
    let primvars: VtArray<T> = _Filled(this._authoredPrimvar, numVertsExpected,
      this._fallbackValue)
    const authoredSize = this._authoredPrimvar.length

    // Special handling for when points is size 0
    if (authoredSize === 0 && this._name === HdTokens.points) {
      primvars = this._authoredPrimvar
    } else if (this._interpolation === HdInterpolation.HdInterpolationVertex) {
      if (authoredSize === numVertsExpected) {
        primvars = this._authoredPrimvar
      } else if (authoredSize === 1) {
        // Treat it as a constant primvar.
        primvars = _Filled(this._authoredPrimvar, numVertsExpected,
          this._authoredPrimvar.get(0))
      } else if (this._topology.hasIndices() &&
        authoredSize > numVertsExpected) {
        // When indices are supplied and don't cover the length of the
        // authored primvar (e.g., we have 10 points but the indices
        // reference upto 7), truncate the primvar to that referenced by
        // the indices.
        // Note that the underspecified scenario (wherein the authored
        // primvar size is lesser than the expectation) gets the
        // fallback treatment in the else clause below.
        primvars = this._authoredPrimvar.slice(0, numVertsExpected)
      } else {
        // (primvars is already filled with _fallbackValue.)
        TF_WARN(`HdStBasisCurves(${this._id})` +
          `- Primvar ${this._name}` +
          ' has incorrect size for vertex interpolation ' +
          `(need ${numVertsExpected}, got ${authoredSize}` +
          `), using fallback value ${String(this._fallbackValue)}` +
          ' for rendering.')
      }
    } else if (this._interpolation === HdInterpolation.HdInterpolationVarying) {
      const numVaryingExpected =
        this._topology.calculateNeededNumberOfVaryingControlPoints()

      if (authoredSize === numVaryingExpected) {
        if (this._topology.getCurveType() === HdTokens.linear) {
          // Varying primvars are specified per-vertex for linear.
          primvars = this._authoredPrimvar
        } else {
          // Expand the authored primvar to per-vertex.
          primvars = HdSt_ExpandVarying<T>(
            this._id, this._name, numVertsExpected,
            this._topology.getCurveVertexCounts(),
            this._topology.getCurveWrap(), this._topology.getCurveBasis(),
            this._authoredPrimvar, this._fallbackValue)
        }
      } else if (authoredSize === 1) {
        // Treat it as a constant primvar.
        primvars = _Filled(this._authoredPrimvar, numVertsExpected,
          this._authoredPrimvar.get(0))
      } else {
        // (primvars is already filled with _fallbackValue.)
        TF_WARN(`HdStBasisCurves(${this._id})` +
          `- Primvar ${this._name}` +
          ' has incorrect size for varying interpolation ' +
          `(need ${numVaryingExpected}, got ${authoredSize}` +
          `), using fallback value ${String(this._fallbackValue)}` +
          ' for rendering.')
      }
    }

    this._setResult(new HdVtBufferSource(this._name, VtValue.createArray(primvars)))

    this._setResolved()
    return true
  }

  /** basisCurvesComputations.h:271-273 */
  override getBufferSpecs(): HdBufferSpec[] {
    return [{ name: this._name, tupleType: { type: this._hdType, count: 1 } }]
  }

  /** basisCurvesComputations.h:276-278 */
  protected override _checkValid(): boolean {
    return true
  }
}

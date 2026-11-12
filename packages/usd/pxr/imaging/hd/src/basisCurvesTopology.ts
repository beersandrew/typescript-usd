// Ported from OpenUSD 26.11.1: pxr/imaging/hd/basisCurvesTopology.cpp,
//  pxr/imaging/hd/basisCurvesTopology.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Faithful port of pxr/imaging/hd/basisCurvesTopology.{h,cpp}
//
// HdBasisCurvesTopology holds the raw input topology data for basisCurves.
// The Type, Basis and Wrap mode combined describe the curve and its segments.
//
//   Type == linear : curve is a bunch of line segments, basis is ignored.
//   Type == cubic  : the curve type is specified by basis (bezier, bspline,
//                    catmullRom, or centripetalCatmullRom).
//
//   Wrap == segmented   : GL_LINES; vertex counts is 2 * number of segments.
//   Wrap == nonperiodic : GL_LINE_STRIP; each entry is the vertex count of a
//                         segment, first and last vertices are not joined.
//   Wrap == periodic    : GL_LINE_LOOP; an additional line joins the first and
//                         last vertex in each segment.
//   Wrap == pinned      : (cubic bspline/catmullRom) interpolate to endpoints.

//
// Divergences: ComputeHash hashes the token text instead of the TfToken
// object bytes (basisCurvesTopology.cpp:118-135 hashes `sizeof(TfToken)`
// bytes); the hash is only an instancing key. operator== is Equals().

import { ArchHash64 } from 'typescript-usd/arch'
import { HdTopology } from './topology.ts'

const _encoder = new TextEncoder()
function _HashInts(values: readonly number[], seed: bigint): bigint {
  const bytes = new Uint8Array(Int32Array.from(values).buffer)
  return ArchHash64(bytes, bytes.length, seed)
}
function _HashString(value: string, seed: bigint): bigint {
  const bytes = _encoder.encode(value)
  return ArchHash64(bytes, bytes.length, seed)
}
function _ArraysEqual(a: readonly number[], b: readonly number[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; ++i) if (a[i] !== b[i]) return false
  return true
}

// Curve type / basis / wrap tokens (mirrors HdTokens).
export const HdCurveTokens = {
  linear: 'linear',
  cubic: 'cubic',
  bezier: 'bezier',
  bspline: 'bspline',
  catmullRom: 'catmullRom',
  centripetalCatmullRom: 'centripetalCatmullRom',
  nonperiodic: 'nonperiodic',
  periodic: 'periodic',
  pinned: 'pinned',
  segmented: 'segmented',
} as const

function _ComputeNumPoints(
  curveVertexCounts: number[],
  indices: number[],
): number {
  if (indices.length === 0) {
    let sum = 0
    for (const c of curveVertexCounts) sum += c
    return sum
  }
  let maxIndex = indices[0]!
  for (const i of indices) if (i > maxIndex) maxIndex = i
  return 1 + maxIndex
}

export class HdBasisCurvesTopology extends HdTopology {
  private _curveType: string
  private _curveBasis: string
  private _curveWrap: string
  private _curveVertexCounts: number[]
  private _curveIndices: number[]
  private _invisiblePoints: number[]
  private _invisibleCurves: number[]
  private _numPoints: number

  constructor(
    curveType: string,
    curveBasis: string,
    curveWrap: string,
    curveVertexCounts: number[],
    curveIndices: number[] = [],
  ) {
    super()
    this._curveType = curveType
    this._curveBasis = curveBasis
    this._curveWrap = curveWrap
    this._curveVertexCounts = curveVertexCounts
    this._curveIndices = curveIndices
    this._invisiblePoints = []
    this._invisibleCurves = []

    // Validation, mirroring the C++ constructor.
    if (
      this._curveType !== HdCurveTokens.linear &&
      this._curveType !== HdCurveTokens.cubic
    ) {
      // Curve type must be 'linear' or 'cubic'.
      this._curveType = HdCurveTokens.linear
      this._curveBasis = ''
    }
    if (curveBasis === HdCurveTokens.linear && curveType === HdCurveTokens.cubic) {
      // Basis 'linear' passed in to 'cubic' curveType -> convert to linear.
      this._curveType = HdCurveTokens.linear
      this._curveBasis = ''
    }

    this._numPoints = _ComputeNumPoints(this._curveVertexCounts, this._curveIndices)
  }

  setInvisiblePoints(invisiblePoints: number[]): void {
    this._invisiblePoints = invisiblePoints
  }
  getInvisiblePoints(): number[] {
    return this._invisiblePoints
  }
  setInvisibleCurves(invisibleCurves: number[]): void {
    this._invisibleCurves = invisibleCurves
  }
  getInvisibleCurves(): number[] {
    return this._invisibleCurves
  }

  getCurveVertexCounts(): number[] {
    return this._curveVertexCounts
  }
  getCurveIndices(): number[] {
    return this._curveIndices
  }
  getNumCurves(): number {
    return this._curveVertexCounts.length
  }
  getNumPoints(): number {
    return this._numPoints
  }

  getCurveType(): string {
    return this._curveType
  }
  getCurveBasis(): string {
    return this._curveBasis
  }
  getCurveWrap(): string {
    return this._curveWrap
  }

  /** basisCurvesTopology.cpp:118-135 */
  override computeHash(): bigint {
    let hash = 0n
    hash = _HashString(this._curveBasis, hash)
    hash = _HashString(this._curveType, hash)
    hash = _HashString(this._curveWrap, hash)
    hash = _HashInts(this._curveVertexCounts, hash)
    hash = _HashInts(this._curveIndices, hash)
    // Note: We don't hash topological visibility, because it is treated as a
    // per-prim opinion, and hence, shouldn't break topology sharing.
    return hash
  }

  /** basisCurvesTopology.cpp:97-110 operator== */
  Equals(other: HdBasisCurvesTopology): boolean {
    return this._curveType === other._curveType &&
      this._curveBasis === other._curveBasis &&
      this._curveWrap === other._curveWrap &&
      _ArraysEqual(this._curveVertexCounts, other._curveVertexCounts) &&
      _ArraysEqual(this._curveIndices, other._curveIndices) &&
      _ArraysEqual(this._invisiblePoints, other._invisiblePoints) &&
      _ArraysEqual(this._invisibleCurves, other._invisibleCurves)
  }

  hasIndices(): boolean {
    return this._curveIndices.length > 0
  }

  /// Figure out how many vertices / control points this topology references.
  calculateNeededNumberOfControlPoints(): number {
    // Computed on construction; accounts for authored indices.
    return this._numPoints
  }

  /// Figure out how many control points with varying data this topology needs.
  calculateNeededNumberOfVaryingControlPoints(): number {
    if (this.getCurveType() === HdCurveTokens.linear) {
      // For linear curves, varying and vertex interpolation is identical.
      return this.calculateNeededNumberOfControlPoints()
    }

    let numVarying = 0
    let numSegs = 0
    let vStep = 0
    const wrap = this.getCurveWrap() === HdCurveTokens.periodic

    if (this.getCurveBasis() === HdCurveTokens.bezier) {
      vStep = 3
    } else {
      vStep = 1
    }

    for (const count of this._curveVertexCounts) {
      // Partial handling for potentially incorrect vertex counts.
      if (count < 1) {
        continue
      }
      if (wrap) {
        numSegs = Math.max(Math.floor(count / vStep), 1)
        numVarying += numSegs
      } else {
        numSegs = Math.floor(Math.max(count - 4, 0) / vStep) + 1
        numVarying += numSegs + 1
      }
    }

    return numVarying
  }
}

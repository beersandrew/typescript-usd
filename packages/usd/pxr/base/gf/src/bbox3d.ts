// Ported from OpenUSD 26.11.1: pxr/base/gf/bbox3d.cpp, pxr/base/gf/bbox3d.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// typescript-usd/gf — GfBBox3d value type.
//
// Mirrors OpenUSD pxr/base/gf/bbox3d.{h,cpp}. A GfBBox3d is an arbitrarily
// oriented 3D bounding box: an axis-aligned box (GfRange3d) plus a GfMatrix4d
// that transforms it into the correct space, plus a "zero-area primitives"
// flag (used to loosen intersection culling for lines/points).
//
// The aligned-range / volume / centroid / combine math is ported verbatim from
// bbox3d.cpp (same operation order so float rounding matches the Pixar oracle).
// Row-vector convention throughout (v' = v·M); translation lives in row 3
// (matrix element [3][0..2]), matching GfMatrix4d storage.
//
// C++ operator -> TS method mapping:
//   operator==            -> .equals(other)
//   operator!=            -> !.equals(other)
//   Set(...)/SetMatrix/.. -> return `this` (mirrors the python return_self<>())
//
// No FAITHFULNESS-DEBT: faithful, verbatim-algorithm port.

import { GfMatrix4d } from './matrixData.ts'
import { GfRange3d } from './range.ts'
import { GfVec3d } from './vec.ts'

// bbox3d.cpp _SetMatrices PRECISION_LIMIT.
const PRECISION_LIMIT = 1.0e-13

export class GfBBox3d {
  /** The axis-aligned box. */
  private _box: GfRange3d
  /** Transformation matrix. */
  private _matrix: GfMatrix4d
  /** Inverse of the transformation matrix. */
  private _inverse: GfMatrix4d
  /** Flag indicating whether the matrix is degenerate. */
  private _isDegenerate: boolean
  /** Flag indicating whether the bbox contains zero-area primitives. */
  private _hasZeroAreaPrimitives: boolean

  /**
   * Constructors (mirrors the four C++ ctors):
   *   GfBBox3d()                          -> empty box, identity matrix
   *   GfBBox3d(other: GfBBox3d)           -> copy
   *   GfBBox3d(box: GfRange3d)            -> box, identity matrix
   *   GfBBox3d(box: GfRange3d, m: Matrix) -> box + transform (Set)
   */
  constructor(a?: GfBBox3d | GfRange3d, m?: GfMatrix4d) {
    this._box = new GfRange3d()
    this._matrix = new GfMatrix4d()
    this._inverse = new GfMatrix4d()
    this._isDegenerate = false
    this._hasZeroAreaPrimitives = false

    if (a === undefined) {
      // Default: empty box, identity matrix/inverse.
      this._matrix.setIdentity()
      this._inverse.setIdentity()
      return
    }
    if (a instanceof GfBBox3d) {
      // Copy constructor.
      this._box = new GfRange3d(a._box)
      this._matrix = new GfMatrix4d(a._matrix)
      this._inverse = new GfMatrix4d(a._inverse)
      this._isDegenerate = a._isDegenerate
      this._hasZeroAreaPrimitives = a._hasZeroAreaPrimitives
      return
    }
    // a is a GfRange3d.
    this._box = new GfRange3d(a)
    if (m === undefined) {
      this._matrix.setIdentity()
      this._inverse.setIdentity()
    } else {
      this._setMatrices(m)
    }
  }

  /** Sets the axis-aligned box and transformation matrix. Returns this. */
  Set(box: GfRange3d, matrix: GfMatrix4d): this {
    this._box = new GfRange3d(box)
    this._setMatrices(matrix)
    return this
  }

  /** Sets the transformation matrix only. Returns this. */
  setMatrix(matrix: GfMatrix4d): this {
    this._setMatrices(matrix)
    return this
  }

  /** Sets the range of the axis-aligned box only. Returns this. */
  setRange(box: GfRange3d): this {
    this._box = new GfRange3d(box)
    return this
  }

  /** Returns the range of the axis-aligned untransformed box. Returns a copy:
   * OpenUSD returns a const reference, and mutating the stored range would
   * bypass this box's cached state. */
  getRange(): GfRange3d {
    return new GfRange3d(this._box)
  }

  /** The stored range itself, not a copy: upstream's GetRange returns a
   *  const reference (bbox3d.h). For read-only use in hot paths
   *  (GfFrustum.IntersectsViewVolume); callers must not mutate it. */
  _getRangeConstRef(): GfRange3d {
    return this._box
  }

  /** The stored matrix itself, not a copy (upstream GetMatrix returns a
   *  const reference); read-only, see _GetRangeConstRef. */
  _getMatrixConstRef(): GfMatrix4d {
    return this._matrix
  }

  /** Synonym of GetRange (compatibility). */
  getBox(): GfRange3d {
    return this.getRange()
  }

  /** Returns the transformation matrix. Returns a copy, so mutating it cannot
   * leave the cached inverse stale (OpenUSD returns a const reference). */
  getMatrix(): GfMatrix4d {
    return new GfMatrix4d(this._matrix)
  }

  /** Returns the inverse of the transformation matrix (identity if singular),
   * as a copy. */
  getInverseMatrix(): GfMatrix4d {
    return new GfMatrix4d(this._inverse)
  }

  /** Sets the zero-area primitives flag. Returns this. */
  setHasZeroAreaPrimitives(hasThem: boolean): this {
    this._hasZeroAreaPrimitives = hasThem
    return this
  }

  /** Returns the current state of the zero-area primitives flag. */
  hasZeroAreaPrimitives(): boolean {
    return this._hasZeroAreaPrimitives
  }

  /** Returns the volume of the box (0 for an empty box). */
  getVolume(): number {
    if (this._box.IsEmpty()) return 0.0
    // The volume of a transformed box is its untransformed volume times the
    // determinant of the upper-left 3x3 of the xform matrix.
    const size = this._box.getSize().data
    return Math.abs(this._matrix.getDeterminant3() * size[0]! * size[1]! * size[2]!)
  }

  /**
   * Transforms the bounding box by the given (global) matrix; post-multiplies
   * the box's matrix by `matrix`. Returns this.
   */
  Transform(matrix: GfMatrix4d): this {
    this._setMatrices(this._matrix.getMultiply(matrix))
    return this
  }

  /**
   * Returns the axis-aligned range that results from applying the
   * transformation matrix to the axis-aligned box and aligning the result.
   * Method: James Arvo, Graphics Gems I, pp 548-550.
   */
  ComputeAlignedRange(): GfRange3d {
    if (this._box.IsEmpty()) return new GfRange3d(this._box)

    const M = this._matrix
    // Translate the origin and use the result as the min and max.
    const trans = [M.getElement(3, 0), M.getElement(3, 1), M.getElement(3, 2)]
    const alignedMin: [number, number, number] = [trans[0]!, trans[1]!, trans[2]!]
    const alignedMax: [number, number, number] = [trans[0]!, trans[1]!, trans[2]!]

    const min = this._box.getMin().data
    const max = this._box.getMax().data

    for (let j = 0; j < 3; j++) {
      for (let i = 0; i < 3; i++) {
        const mij = M.getElement(i, j)
        const a = min[i]! * mij
        const b = max[i]! * mij
        if (a < b) {
          alignedMin[j]! += a
          alignedMax[j]! += b
        } else {
          alignedMin[j]! += b
          alignedMax[j]! += a
        }
      }
    }

    return new GfRange3d(new GfVec3d(...alignedMin), new GfVec3d(...alignedMax))
  }

  /** Synonym for ComputeAlignedRange (compatibility). */
  computeAlignedBox(): GfRange3d {
    return this.ComputeAlignedRange()
  }

  /**
   * Returns the centroid of the bounding box, computed as the transformed
   * centroid of the range.
   */
  computeCentroid(): GfVec3d {
    const a = this.getRange().getMax()
    const b = this.getRange().getMin()
    // 0.5 * (a + b)
    const mid = a.add(b).getScaled(0.5)
    return this.getMatrix().Transform(mid) as GfVec3d
  }

  /**
   * Combines two bboxes, returning a new bbox that contains both. Uses the
   * coordinate space of whichever of the two original boxes produces the
   * smaller resulting box.
   */
  static combine(b1: GfBBox3d, b2: GfBBox3d): GfBBox3d {
    let result: GfBBox3d

    // If either box is empty, use the other as is.
    if (b1.getRange().IsEmpty()) {
      result = new GfBBox3d(b2)
    } else if (b2.getRange().IsEmpty()) {
      result = new GfBBox3d(b1)
    }

    // If both boxes are degenerate, combine their projected boxes. Otherwise,
    // transform the degenerate box into the space of the other and combine.
    else if (b1._isDegenerate) {
      if (b2._isDegenerate) {
        result = new GfBBox3d(
          GfRange3d.getUnion(b1.ComputeAlignedRange(), b2.ComputeAlignedRange()),
        )
      } else {
        result = GfBBox3d._combineInOrder(b2, b1)
      }
    } else if (b2._isDegenerate) {
      result = GfBBox3d._combineInOrder(b1, b2)
    }

    // Non-degenerate case: neither box is empty and they are in different
    // spaces. Merge in each of the two spaces; whichever merge is smaller (by
    // volume) is the one we use.
    else {
      const result1 = GfBBox3d._combineInOrder(b1, b2)
      const result2 = GfBBox3d._combineInOrder(b2, b1)

      const v1 = result1.getVolume()
      const v2 = result2.getVolume()
      const tolerance = Math.max(1e-10, 1e-6 * Math.abs(Math.max(v1, v2)))

      result =
        Math.abs(v1 - v2) <= tolerance ? result1 : v1 < v2 ? result1 : result2
    }

    // The zero-area-primitives flag is set if either input box has it set.
    result.setHasZeroAreaPrimitives(
      b1.hasZeroAreaPrimitives() || b2.hasZeroAreaPrimitives(),
    )

    return result
  }

  /**
   * Used by Combine() once the target coordinate space is chosen: b2 is
   * transformed into the space of b1 and the results are merged in that space.
   */
  private static _combineInOrder(b1: GfBBox3d, b2: GfBBox3d): GfBBox3d {
    // Transform b2 into b1's space to get b2t.
    const b2t = new GfBBox3d()
    b2t._box = new GfRange3d(b2._box)
    b2t._matrix = b2._matrix.getMultiply(b1._inverse)
    b2t._inverse = b1._matrix.getMultiply(b2._inverse)

    // Compute the projection of this box into b1's space.
    const proj = b2t.ComputeAlignedRange()

    // Extend b1 by this box to get the result.
    const result = new GfBBox3d(b1)
    result._box.unionWith(proj)
    return result
  }

  /**
   * Sets the transformation matrix and the inverse, checking for degeneracies.
   * (bbox3d.cpp GfBBox3d::_SetMatrices.)
   */
  private _setMatrices(matrix: GfMatrix4d): void {
    this._isDegenerate = false
    this._matrix = new GfMatrix4d(matrix)
    const det = matrix.getDeterminant()
    this._inverse = matrix.getInverse(PRECISION_LIMIT)

    // Check for degenerate matrix.
    if (Math.abs(det) <= PRECISION_LIMIT) {
      this._isDegenerate = true
      this._inverse.setIdentity()
    }
  }

  /**
   * operator== — component-wise: the axis-aligned boxes and transformation
   * matrices must match exactly.
   */
  equals(b: GfBBox3d): boolean {
    return this._box.equals(b._box) && this._matrix.equals(b._matrix)
  }

  /** Deterministic hash key; equal bboxes (and copies) hash equal. */
  hash(): string {
    return `${this._box.hash()}|${this._matrix.hash()}`
  }

  /** operator<< — "[(range) matrix zeroArea]". */
  toString(): string {
    return `[(${this._box.toString()}) (${this._matrix.toString()}) ${
      this._hasZeroAreaPrimitives ? 'true' : 'false'
    }]`
  }

  /** Python repr — Gf.BBox3d(range, matrix). */
  repr(): string {
    return `Gf.BBox3d(${this._box.repr()}, ${this._matrix.repr()})`
  }
}

// Ported from OpenUSD 26.11.1: pxr/base/gf/plane.cpp, pxr/base/gf/plane.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// typescript-usd/gf — GfPlane value type + GfFitPlaneToPoints free function.
//
// Mirrors OpenUSD pxr/base/gf/plane.{h,cpp}. A GfPlane is a 3D plane stored as a
// unit-length normal vector plus the (signed) distance of the plane from the
// origin measured along that normal. It can also represent a half-space (the
// side the normal points into).
//
// C++ operator -> TS method mapping (documented on each method):
//   operator==            -> .equals(other)
//   operator!=            -> !.equals(other)
//
// Algorithms (Set/GetEquation/Transform/IntersectsPositiveHalfSpace and the
// GfFitPlaneToPoints linear-least-squares fit) are ported verbatim from
// plane.cpp — same operation order so floating rounding matches the Pixar
// oracle. No FAITHFULNESS-DEBT.

import { GfVec3d, GfVec4d, GfDot } from './vec.ts'
import { GfMatrix2d, GfMatrix4d } from './matrixData.ts'
import { GfRange3d } from './range.ts'

/** GfAbs analogue. */
const GfAbs = (x: number): number => Math.abs(x)

export class GfPlane {
  /** The normal to the plane. Points in direction of half-space. */
  private _normal: GfVec3d
  /** Distance from the plane to the origin. */
  private _distance: number

  /**
   * Overloaded constructor mirroring the four GfPlane ctors:
   *   GfPlane()                                  -> undefined (zero) plane
   *   GfPlane(normal: GfVec3d, distance: number) -> normal + distance
   *   GfPlane(normal: GfVec3d, point: GfVec3d)   -> normal through a point
   *   GfPlane(p0, p1, p2: GfVec3d)               -> plane through 3 points
   *   GfPlane(eqn: GfVec4d)                       -> ax+by+cz+d=0 equation
   */
  constructor()
  constructor(normal: GfVec3d, distanceToOrigin: number)
  constructor(normal: GfVec3d, point: GfVec3d)
  constructor(p0: GfVec3d, p1: GfVec3d, p2: GfVec3d)
  constructor(eqn: GfVec4d)
  constructor(
    a?: GfVec3d | GfVec4d,
    b?: number | GfVec3d,
    c?: GfVec3d,
  ) {
    // Default ctor leaves parameters "undefined"; mirror with a zero plane.
    this._normal = new GfVec3d(0, 0, 0)
    this._distance = 0
    if (a === undefined) {
      return
    }
    if (a instanceof GfVec4d) {
      this.setFromEquation(a)
      return
    }
    if (c !== undefined) {
      // (p0, p1, p2)
      this.setFromPoints(a, b as GfVec3d, c)
      return
    }
    if (typeof b === 'number') {
      this.Set(a, b)
      return
    }
    // (normal, point)
    this.setFromNormalAndPoint(a, b as GfVec3d)
  }

  /**
   * Sets this to the plane perpendicular to `normal` at `distanceToOrigin`
   * units from the origin. The normal is normalized to unit length first.
   * (plane.h Set(normal, distance), inline.) Returns this (the Python binding's
   * Set returns the plane).
   */
  Set(normal: GfVec3d, distanceToOrigin: number): this {
    this._normal = normal.GetNormalized()
    this._distance = distanceToOrigin
    return this
  }

  /**
   * Sets this to the plane perpendicular to `normal` passing through `point`.
   * (plane.cpp Set(normal, point).)
   */
  setFromNormalAndPoint(normal: GfVec3d, point: GfVec3d): this {
    this._normal = normal.GetNormalized()
    this._distance = GfDot(this._normal, point)
    return this
  }

  /**
   * Sets this to the plane containing the three given points. The normal is
   * the cross product of (p1 - p0) (p2 - p0). Results are undefined if the
   * points are collinear. (plane.cpp Set(p0, p1, p2).)
   */
  setFromPoints(p0: GfVec3d, p1: GfVec3d, p2: GfVec3d): this {
    this._normal = (p1.subtract(p0) as GfVec3d)
      .Cross(p2.subtract(p0) as GfVec3d)
      .GetNormalized()
    this._distance = GfDot(this._normal, p0)
    return this
  }

  /**
   * Sets this to the plane given by eqn[0]*x + eqn[1]*y + eqn[2]*z + eqn[3] = 0.
   * (plane.cpp Set(eqn).)
   */
  setFromEquation(eqn: GfVec4d): this {
    const normal = new GfVec3d(eqn.get(0), eqn.get(1), eqn.get(2))
    this._distance = -eqn.get(3)
    const l = normal.Normalize()
    if (l !== 0.0) {
      this._distance /= l
    }
    this._normal = normal
    return this
  }

  /** Returns the unit-length normal vector of the plane. */
  getNormal(): GfVec3d {
    return this._normal
  }

  /** Returns the distance of the plane from the origin. */
  getDistanceFromOrigin(): number {
    return this._distance
  }

  /** Python property alias for GetNormal (p.normal). */
  get normal(): GfVec3d {
    return this._normal
  }

  /** Python property alias for GetDistanceFromOrigin (p.distanceFromOrigin). */
  get distanceFromOrigin(): number {
    return this._distance
  }

  /**
   * Give the coefficients of the equation of the plane (a GfVec4d), suitable
   * for OpenGL clip-plane calls. (plane.cpp GetEquation().)
   */
  getEquation(): GfVec4d {
    return new GfVec4d(
      this._normal.get(0),
      this._normal.get(1),
      this._normal.get(2),
      -this._distance,
    )
  }

  /**
   * operator== — component-wise equality test. The normals and distances must
   * match exactly for planes to be considered equal.
   */
  equals(p: GfPlane): boolean {
    return this._normal.equals(p._normal) && this._distance === p._distance
  }

  /**
   * Returns the distance of point `p` from the plane. Positive if the point is
   * on the side of the plane containing the normal. (plane.h: p * _normal -
   * _distance.)
   */
  getDistance(p: GfVec3d): number {
    return GfDot(p, this._normal) - this._distance
  }

  /** Return the projection of `p` onto the plane. (plane.h.) */
  project(p: GfVec3d): GfVec3d {
    // p - GetDistance(p) * _normal
    return p.subtract(this._normal.getScaled(this.getDistance(p))) as GfVec3d
  }

  /**
   * Transforms the plane by the given matrix. The plane equation is transformed
   * by the adjoint (inverse transpose) of the matrix so the normal is not
   * scaled incorrectly. Mutates this and returns it. (plane.cpp Transform().)
   */
  Transform(matrix: GfMatrix4d): this {
    const adjoint = matrix.getInverse().getTranspose()
    // GetEquation() * adjoint  (row-vector v·M convention)
    const eqn = adjoint.multVecMatrix(this.getEquation()) as GfVec4d
    this.setFromEquation(eqn)
    return this
  }

  /**
   * Flip the plane normal (if necessary) so that `p` is in the positive
   * half-space. Mutates this and returns it (the Python binding's Reorient
   * returns the plane). (plane.h Reorient().)
   */
  reorient(p: GfVec3d): this {
    if (this.getDistance(p) < 0) {
      this._normal = this._normal.getNegated()
      this._distance = -this._distance
    }
    return this
  }

  /**
   * Returns true if the given aligned bounding box is at least partially on the
   * positive side (the one the normal points into) of the plane, OR if the
   * given point is on the plane or within its positive half-space.
   * (plane.cpp / plane.h IntersectsPositiveHalfSpace overloads.)
   */
  intersectsPositiveHalfSpace(arg: GfRange3d | GfVec3d): boolean {
    if (arg instanceof GfRange3d) {
      const box = arg
      if (box.IsEmpty()) {
        return false
      }
      // The maximum of the inner product between the normal and any point in
      // the box.
      let d = 0.0
      const min = box.getMin().data
      const max = box.getMax().data
      const n = this._normal.data
      for (let i = 0; i < 3; i++) {
        const b = n[i]! >= 0 ? max[i]! : min[i]!
        d += n[i]! * b
      }
      return d >= this._distance
    }
    // point overload: GetDistance(pt) >= 0
    return this.getDistance(arg) >= 0.0
  }

  /** ostream form: "[(nx ny nz) distance]". (plane.cpp operator<<.) */
  toString(): string {
    return `[${this._normal.toString()} ${this._distance}]`
  }

  /** repr round-trippable through the (normal, distance) constructor. */
  repr(): string {
    // wrapPlane.cpp:33-35 calls TfPyRepr for both the Vec3d and double.
    const repr = (value: number): string => {
      if (Object.is(value, -0)) return '-0.0'
      if (!Number.isFinite(value)) return Number.isNaN(value) ? 'nan' : value < 0 ? '-inf' : 'inf'
      const magnitude = Math.abs(value)
      const text = magnitude && (magnitude < 1e-4 || magnitude >= 1e16) ? value.toExponential() : String(value)
      return text.includes('e') ? text.replace(/e([+-])(\d)$/, 'e$10$2') : text.includes('.') ? text : text + '.0'
    }
    return `Gf.Plane(Gf.Vec3d(${Array.from(this._normal.data, repr).join(', ')}), ${repr(this._distance)})`
  }
}

/**
 * Fits a plane to the given points using linear least squares (minimizing the
 * sum of squares of vertical distances). Verbatim port of GfFitPlaneToPoints
 * (plane.cpp).
 *
 * - Throws if fewer than three points are given (upstream TF_CODING_ERROR; the
 *   Python binding raises Tf.ErrorException).
 * - Returns null if the points are collinear (no plane can be determined).
 * - Otherwise returns the fitted GfPlane. With exactly three points the result
 *   is the exact plane through them. The normal orientation is arbitrary.
 */
export function GfFitPlaneToPoints(points: readonly GfVec3d[]): GfPlane | null {
  // Less than three points doesn't define a unique plane.
  if (points.length < 3) {
    throw new Error('Need three points to correctly fit a plane')
  }

  // Centroid of the points becomes the origin of the fit plane.
  let sumOfPoints = new GfVec3d(0.0, 0.0, 0.0)
  for (const p of points) {
    sumOfPoints = sumOfPoints.add(p) as GfVec3d
  }
  const centroid = sumOfPoints.getDivided(points.length) as GfVec3d

  // Sums \sum (x_i)^2, \sum (x_i)(y_i), etc., over points relative to centroid.
  let xx = 0.0
  let xy = 0.0
  let xz = 0.0
  let yy = 0.0
  let yz = 0.0
  let zz = 0.0
  for (const p of points) {
    const offset = p.subtract(centroid).data
    xx += offset[0]! * offset[0]!
    xy += offset[0]! * offset[1]!
    xz += offset[0]! * offset[2]!
    yy += offset[1]! * offset[1]!
    yz += offset[1]! * offset[2]!
    zz += offset[2]! * offset[2]!
  }

  // Three least-squares cases (force one coefficient to 1 to avoid the trivial
  // solution): A^T A for a=1, b=1, c=1.
  const ata1 = new GfMatrix2d(yy, yz, yz, zz)
  const ata2 = new GfMatrix2d(xx, xz, xz, zz)
  const ata3 = new GfMatrix2d(xx, xy, xy, yy)

  const det1 = GfAbs(ata1.getDeterminant())
  const det2 = GfAbs(ata2.getDeterminant())
  const det3 = GfAbs(ata3.getDeterminant())
  const equation: [number, number, number] = [0, 0, 0]
  if (det1 > 0.0 && det1 > det2 && det1 > det3) {
    const lse = ata1.getInverse().multMatrixVec([-xy, -xz])
    equation[0] = 1.0
    equation[1] = lse.get(0)
    equation[2] = lse.get(1)
  } else if (det2 > 0.0 && det2 > det3) {
    const lse = ata2.getInverse().multMatrixVec([-xy, -yz])
    equation[0] = lse.get(0)
    equation[1] = 1.0
    equation[2] = lse.get(1)
  } else if (det3 > 0.0) {
    const lse = ata3.getInverse().multMatrixVec([-xz, -yz])
    equation[0] = lse.get(0)
    equation[1] = lse.get(1)
    equation[2] = 1.0
  } else {
    // det(A^T A) is zero in all cases — collinear points; no plane.
    return null
  }

  // Move the plane (currently through the origin) to intersect the centroid:
  // d = -{a,b,c} . {x,y,z}
  const eqVec = new GfVec3d(equation[0], equation[1], equation[2])
  const d = -GfDot(eqVec, centroid)
  const fitPlane = new GfPlane()
  fitPlane.setFromEquation(
    new GfVec4d(equation[0], equation[1], equation[2], d),
  )
  return fitPlane
}

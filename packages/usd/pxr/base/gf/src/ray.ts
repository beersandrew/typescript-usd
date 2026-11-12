// Ported from OpenUSD 26.11.1: pxr/base/gf/ray.cpp, pxr/base/gf/ray.h,
//  pxr/base/gf/testenv/testGfRay.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// typescript-usd/gf — GfRay value type.
//
// Mirrors OpenUSD pxr/base/gf/ray.{h,cpp}. A GfRay is an origin (start point)
// plus a direction vector (NOT normalized by default — t is parametric in units
// of the direction's length). Used for intersection testing against lines,
// segments, planes, triangles, spheres, axis-aligned and oriented boxes,
// cylinders and cones.
//
// C++ operator -> TS method mapping:
//   GfRay(start, dir)                 -> new GfRay(start, dir)
//   GetStartPoint()/GetDirection()    -> GetStartPoint()/GetDirection()
//   .startPoint/.direction (python)   -> get/set startPoint, get/set direction
//   GetPoint(t)                       -> GetPoint(t)
//   Transform(m)                      -> Transform(m)  (mutates, returns this)
//   FindClosestPoint(p, *t)           -> FindClosestPoint(p): {point, rayDistance}
//   operator==                        -> equals(other)
//   Intersect(...) overloads          -> Intersect(...) (dispatched on arg type)
//   free GfFindClosestPoints(ray, ..) -> GfFindClosestPoints(ray, line|seg)
//
// The intersection math is ported VERBATIM from ray.cpp (operation order
// preserved so floating rounding matches the Pixar oracle). One subtlety
// faithfully reproduced: the triangle barycentric `gamma` is a float32 in C++
// (`float gamma = 1.0 - (alpha + beta);`), so it is rounded through Math.fround
// here — this is why the captured gamma golden is 0.3333333432674408, not the
// double 1/3. No FAITHFULNESS-DEBT.
//
// NOTE: GfRay::Intersect(GfFrustum) exists in ray.h but is intentionally OMITTED
// here — testGfRay.py does not exercise it and GfFrustum is not yet ported.

import { GfVec2d, GfVec3d, GfDot } from './vec.ts'
import { GfMatrix4d } from './matrixData.ts'
import { GfPlane } from './plane.ts'
import { GfRange3d } from './range.ts'
import { GfBBox3d } from './bbox3d.ts'
import {
  GfLine,
  GfFindClosestPoints as GfFindClosestPointsLine,
  type ClosestPointsResult,
} from './line.ts'
import {
  GfLineSeg,
  GfFindClosestPointsLineSeg,
} from './lineSeg.ts'

// pxr/base/gf/limits.h
const GF_MIN_VECTOR_LENGTH = 1e-10
// ray.cpp's static tolerance used by _SolveQuadratic / GfIsClose.
const tolerance = 1e-6

const GfAbs = (x: number): number => Math.abs(x)
const GfSqr = (x: number): number => x * x
const GfSqrt = (x: number): number => Math.sqrt(x)
/** C copysign(mag, sign): copysign(1, +0) == +1, copysign(1, -0) == -1. */
const copysign = (mag: number, sign: number): number =>
  sign < 0 || Object.is(sign, -0) ? -mag : mag
/** Scalar GfIsClose (math.h): |a-b| < epsilon. */
const GfIsClose = (a: number, b: number, eps: number): boolean =>
  GfAbs(a - b) < eps

/** Result of GfRay.Intersect(triangle). */
export interface RayTriangleHit {
  hit: boolean
  distance: number
  barycentricCoords: GfVec3d
  frontFacing: boolean
}
/** Result of GfRay.Intersect(plane). */
export interface RayPlaneHit {
  hit: boolean
  distance: number
  frontFacing: boolean
}
/** Result of GfRay.Intersect(box/sphere/cylinder/cone). */
export interface RayEnterExitHit {
  hit: boolean
  enterDistance: number
  exitDistance: number
}
/** Result of GfRay.FindClosestPoint(point). */
export interface RayClosestPointResult {
  point: GfVec3d
  rayDistance: number
}

export class GfRay {
  private _startPoint: GfVec3d
  private _direction: GfVec3d

  /**
   * Default ctor leaves the ray "undefined" upstream; here it is a zero ray.
   * The (start, direction) ctor calls SetPointAndDirection.
   */
  constructor(startPoint?: GfVec3d, direction?: GfVec3d) {
    this._startPoint = new GfVec3d()
    this._direction = new GfVec3d()
    if (startPoint !== undefined && direction !== undefined) {
      this.setPointAndDirection(startPoint, direction)
    }
  }

  /** Sets the ray from a starting point and a direction. */
  setPointAndDirection(startPoint: GfVec3d, direction: GfVec3d): void {
    this._startPoint = new GfVec3d(startPoint)
    this._direction = new GfVec3d(direction)
  }

  /** Sets the ray from a starting point and an ending point. */
  setEnds(startPoint: GfVec3d, endPoint: GfVec3d): void {
    this._startPoint = new GfVec3d(startPoint)
    this._direction = endPoint.subtract(startPoint) as GfVec3d
  }

  /** Returns the starting point of the ray. */
  getStartPoint(): GfVec3d {
    return this._startPoint
  }

  /** Returns the direction vector (not guaranteed unit length). */
  getDirection(): GfVec3d {
    return this._direction
  }

  /** Python property alias: r.startPoint. */
  get startPoint(): GfVec3d {
    return this._startPoint
  }
  set startPoint(p: GfVec3d) {
    this._startPoint = new GfVec3d(p)
  }
  /** Python property alias: r.direction. */
  get direction(): GfVec3d {
    return this._direction
  }
  set direction(d: GfVec3d) {
    this._direction = new GfVec3d(d)
  }

  /** Returns the point `distance` (parametric) units along the direction. */
  getPoint(distance: number): GfVec3d {
    // _startPoint + distance * _direction
    return this._startPoint.add(this._direction.getScaled(distance)) as GfVec3d
  }

  /** Transforms the ray by `matrix` (mutates this, returns this). */
  Transform(matrix: GfMatrix4d): this {
    this._startPoint = matrix.Transform(this._startPoint) as GfVec3d
    this._direction = matrix.transformDir(this._direction) as GfVec3d
    return this
  }

  /**
   * Returns the point on the ray closest to `point`, and its parametric
   * distance along the ray. Verbatim port of GfRay::FindClosestPoint.
   */
  findClosestPoint(point: GfVec3d): RayClosestPointResult {
    const l = new GfLine()
    const len = l.Set(this._startPoint, this._direction)
    const r = l.findClosestPoint(point)
    let lrd = r.t
    if (lrd < 0.0) lrd = 0.0
    return { point: l.getPoint(lrd), rayDistance: lrd / len }
  }

  /** operator== : exact component match of start point and direction. */
  equals(r: GfRay): boolean {
    return this._startPoint.equals(r._startPoint) &&
      this._direction.equals(r._direction)
  }

  /** ostream form: "[(x y z) >> (x y z)]". */
  toString(): string {
    return `[${this._startPoint.toString()} >> ${this._direction.toString()}]`
  }

  // ---- Intersection methods (overloaded, dispatched on argument types) ----

  intersect(
    p0: GfVec3d, p1: GfVec3d, p2: GfVec3d, maxDist?: number,
  ): RayTriangleHit
  intersect(plane: GfPlane): RayPlaneHit
  intersect(box: GfRange3d): RayEnterExitHit
  intersect(box: GfBBox3d): RayEnterExitHit
  intersect(center: GfVec3d, radius: number): RayEnterExitHit
  intersect(origin: GfVec3d, axis: GfVec3d, radius: number): RayEnterExitHit
  intersect(
    origin: GfVec3d, axis: GfVec3d, radius: number, height: number,
  ): RayEnterExitHit
  intersect(
    a: GfVec3d | GfPlane | GfRange3d | GfBBox3d,
    b?: GfVec3d | number,
    c?: GfVec3d | number,
    d?: number,
  ): RayTriangleHit | RayPlaneHit | RayEnterExitHit {
    if (a instanceof GfPlane) {
      return this._intersectPlane(a)
    }
    if (a instanceof GfRange3d) {
      return this._intersectRange(a)
    }
    if (a instanceof GfBBox3d) {
      return this._intersectBBox(a)
    }
    // a is a GfVec3d here.
    if (b instanceof GfVec3d) {
      if (c instanceof GfVec3d) {
        // triangle (p0, p1, p2, maxDist?)
        return this._intersectTriangle(a, b, c, d)
      }
      // cylinder (origin, axis, radius) or cone (origin, axis, radius, height)
      const radius = c as number
      if (d !== undefined) {
        return this._intersectCone(a, b, radius, d)
      }
      return this._intersectCylinder(a, b, radius)
    }
    // sphere (center, radius)
    return this._intersectSphere(a, b as number)
  }

  private _intersectTriangle(
    p0: GfVec3d, p1: GfVec3d, p2: GfVec3d, maxDist?: number,
  ): RayTriangleHit {
    const fail: RayTriangleHit = {
      hit: false, distance: 0.0,
      barycentricCoords: new GfVec3d(0, 0, 0), frontFacing: false,
    }
    const maxDistance = maxDist === undefined ? Infinity : maxDist

    // Intersect the ray with the plane containing the three points.
    const plane = new GfPlane(p0, p1, p2)
    const ph = this._intersectPlane(plane)
    if (!ph.hit) {
      // frontFacing is reported even on a non-hit in C++ only when set; on a
      // miss we report the default (false), matching the Python binding.
      return fail
    }
    const intersectionDist = ph.distance
    const frontFacing = ph.frontFacing

    if (intersectionDist > maxDistance) {
      return fail
    }

    // Find the largest component of the plane normal. The other two
    // dimensions are the axes of the aligned plane used to project.
    const n = plane.getNormal().data
    const xAbs = GfAbs(n[0]!)
    const yAbs = GfAbs(n[1]!)
    const zAbs = GfAbs(n[2]!)
    let axis0: number
    let axis1: number
    if (xAbs > yAbs && xAbs > zAbs) {
      axis0 = 1; axis1 = 2
    } else if (yAbs > zAbs) {
      axis0 = 2; axis1 = 0
    } else {
      axis0 = 0; axis1 = 1
    }

    const sp = this._startPoint.data
    const dir = this._direction.data
    const a0 = p0.data
    const a1 = p1.data
    const a2 = p2.data

    const inter0 = sp[axis0]! + intersectionDist * dir[axis0]!
    const inter1 = sp[axis1]! + intersectionDist * dir[axis1]!
    const d0 = new GfVec2d(inter0 - a0[axis0]!, inter1 - a0[axis1]!).data
    const d1 = new GfVec2d(a1[axis0]! - a0[axis0]!, a1[axis1]! - a0[axis1]!).data
    const d2 = new GfVec2d(a2[axis0]! - a0[axis0]!, a2[axis1]! - a0[axis1]!).data

    // XXX This code can miss some intersections on very tiny tris.
    let beta = (d0[1]! * d1[0]! - d0[0]! * d1[1]!) /
      (d2[1]! * d1[0]! - d2[0]! * d1[1]!)
    // clamp beta to 0 if it is only very slightly less than 0
    if (beta < 0 && beta > -GF_MIN_VECTOR_LENGTH) {
      beta = 0
    }
    if (beta < 0.0 || beta > 1.0) {
      return fail
    }
    let alpha = -1.0
    if (d1[1]! < -GF_MIN_VECTOR_LENGTH || d1[1]! > GF_MIN_VECTOR_LENGTH) {
      alpha = (d0[1]! - beta * d2[1]!) / d1[1]!
    } else {
      alpha = (d0[0]! - beta * d2[0]!) / d1[0]!
    }

    // clamp alpha to 0 if it is only very slightly less than 0
    if (alpha < 0 && alpha > -GF_MIN_VECTOR_LENGTH) {
      alpha = 0
    }

    // gamma is a float32 in C++ (`float gamma = ...`); reproduce via fround.
    let gamma = Math.fround(1.0 - (alpha + beta))
    if (gamma < 0 && gamma > -GF_MIN_VECTOR_LENGTH) {
      gamma = 0
    }
    if (alpha < 0.0 || gamma < 0.0) {
      return fail
    }

    return {
      hit: true,
      distance: intersectionDist,
      barycentricCoords: new GfVec3d(gamma, alpha, beta),
      frontFacing,
    }
  }

  private _intersectPlane(plane: GfPlane): RayPlaneHit {
    const fail: RayPlaneHit = { hit: false, distance: 0.0, frontFacing: false }

    // The dot product of the ray direction and the plane normal indicates the
    // angle between them. Reject glancing intersections (and zero normals).
    const d = GfDot(this._direction, plane.getNormal())
    if (d < GF_MIN_VECTOR_LENGTH && d > -GF_MIN_VECTOR_LENGTH) {
      return fail
    }

    // Get a point on the plane.
    const planePoint = plane.getNormal().getScaled(plane.getDistanceFromOrigin())

    // Compute the parametric distance t to the plane.
    const t = GfDot(planePoint.subtract(this._startPoint), plane.getNormal()) / d
    if (t < 0.0) {
      return fail
    }

    return { hit: true, distance: t, frontFacing: d < 0.0 }
  }

  private _intersectRange(box: GfRange3d): RayEnterExitHit {
    const fail: RayEnterExitHit = { hit: false, enterDistance: 0, exitDistance: 0 }
    if (box.IsEmpty()) {
      return fail
    }

    const DBL_MAX = Number.MAX_VALUE
    let maxNearest = -DBL_MAX
    let minFarthest = DBL_MAX

    const dir = this._direction.data
    const start = this._startPoint.data
    const bmin = box.getMin().data
    const bmax = box.getMax().data

    for (let i = 0; i < 3; i++) {
      // Skip dimensions almost parallel to the ray.
      let d = dir[i]!
      if (GfAbs(d) < GF_MIN_VECTOR_LENGTH) {
        // ray parallel to this set of planes; if origin not between them, miss.
        if (start[i]! < bmin[i]! || start[i]! > bmax[i]!) {
          return fail
        } else {
          continue
        }
      }

      d = 1.0 / d
      let t1 = d * (bmin[i]! - start[i]!)
      let t2 = d * (bmax[i]! - start[i]!)

      // Make sure t1 is the nearer one.
      if (t1 > t2) {
        const tmp = t1
        t1 = t2
        t2 = tmp
      }

      if (t1 > maxNearest) maxNearest = t1
      if (t2 < minFarthest) minFarthest = t2
    }

    if (maxNearest > minFarthest || minFarthest < 0.0) {
      return fail
    }

    return { hit: true, enterDistance: maxNearest, exitDistance: minFarthest }
  }

  private _intersectBBox(box: GfBBox3d): RayEnterExitHit {
    // Transform the ray to the local space of the bbox; intersection time is
    // invariant under the transform.
    const localRay = new GfRay(this._startPoint, this._direction)
    localRay.Transform(box.getInverseMatrix())
    return localRay._intersectRange(box.getRange())
  }

  private _intersectSphere(center: GfVec3d, radius: number): RayEnterExitHit {
    const p1 = this._startPoint
    const p2 = p1.add(this._direction) as GfVec3d

    const pd1 = p1.data
    const pd2 = p2.data
    const cd = center.data
    const x1 = pd1[0]!, y1 = pd1[1]!, z1 = pd1[2]!
    const x2 = pd2[0]!, y2 = pd2[1]!, z2 = pd2[2]!
    const x3 = cd[0]!, y3 = cd[1]!, z3 = cd[2]!

    const A = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1) + (z2 - z1) * (z2 - z1)
    const B = 2 * ((x2 - x1) * (x1 - x3) + (y2 - y1) * (y1 - y3) + (z2 - z1) * (z1 - z3))
    const C = x3 * x3 + y3 * y3 + z3 * z3 + x1 * x1 + y1 * y1 + z1 * z1 -
      2 * (x3 * x1 + y3 * y1 + z3 * z1) - radius * radius

    return this._solveQuadratic(A, B, C)
  }

  private _intersectCylinder(
    origin: GfVec3d, axis: GfVec3d, radius: number,
  ): RayEnterExitHit {
    const unitAxis = axis.GetNormalized()

    const delta = this._startPoint.subtract(origin) as GfVec3d
    const u = this._direction.subtract(
      unitAxis.getScaled(GfDot(this._direction, unitAxis)),
    ) as GfVec3d
    const v = delta.subtract(
      unitAxis.getScaled(GfDot(delta, unitAxis)),
    ) as GfVec3d

    const a = GfDot(u, u)
    const b = 2.0 * GfDot(u, v)
    const c = GfDot(v, v) - GfSqr(radius)

    return this._solveQuadratic(a, b, c)
  }

  private _intersectCone(
    origin: GfVec3d, axis: GfVec3d, radius: number, height: number,
  ): RayEnterExitHit {
    const unitAxis = axis.GetNormalized()

    // Apex of cone.
    const apex = origin.add(unitAxis.getScaled(height)) as GfVec3d

    const delta = this._startPoint.subtract(apex) as GfVec3d
    const u = this._direction.subtract(
      unitAxis.getScaled(GfDot(this._direction, unitAxis)),
    ) as GfVec3d
    const v = delta.subtract(
      unitAxis.getScaled(GfDot(delta, unitAxis)),
    ) as GfVec3d

    const p = GfDot(this._direction, unitAxis)
    const q = GfDot(delta, unitAxis)

    const cos2 = GfSqr(height) / (GfSqr(height) + GfSqr(radius))
    const sin2 = 1 - cos2

    const a = cos2 * GfDot(u, u) - sin2 * GfSqr(p)
    const b = 2.0 * (cos2 * GfDot(u, v) - sin2 * p * q)
    const c = cos2 * GfDot(v, v) - sin2 * GfSqr(q)

    const res = this._solveQuadratic(a, b, c)
    if (!res.hit) {
      return { hit: false, enterDistance: 0, exitDistance: 0 }
    }

    let enterDistance = res.enterDistance
    let exitDistance = res.exitDistance

    // Eliminate any solutions on the (mirror) double cone.
    const enterValid =
      GfDot(unitAxis, this.getPoint(enterDistance).subtract(apex)) <= 0.0
    const exitValid =
      GfDot(unitAxis, this.getPoint(exitDistance).subtract(apex)) <= 0.0

    if (!enterValid && !exitValid) {
      // Solutions lie only on the double cone.
      return { hit: false, enterDistance: 0, exitDistance: 0 }
    }

    if (!enterValid) {
      enterDistance = exitDistance
    } else if (!exitValid) {
      exitDistance = enterDistance
    }

    return { hit: true, enterDistance, exitDistance }
  }

  /**
   * Solves a*t^2 + b*t + c = 0, returning the (ordered) solutions in
   * enter/exit. Verbatim port of GfRay::_SolveQuadratic.
   */
  private _solveQuadratic(a: number, b: number, c: number): RayEnterExitHit {
    const fail: RayEnterExitHit = { hit: false, enterDistance: 0, exitDistance: 0 }

    if (GfIsClose(a, 0.0, tolerance)) {
      if (GfIsClose(b, 0.0, tolerance)) {
        // Degenerate solution.
        return fail
      }
      const t = -c / b
      if (t < 0.0) {
        return fail
      }
      return { hit: true, enterDistance: t, exitDistance: t }
    }

    // Discriminant.
    const disc = GfSqr(b) - 4.0 * a * c

    if (GfIsClose(disc, 0.0, tolerance)) {
      // Tangent.
      const t = -b / (2.0 * a)
      if (t < 0.0) {
        return fail
      }
      return { hit: true, enterDistance: t, exitDistance: t }
    }

    if (disc < 0.0) {
      // No intersection.
      return fail
    }

    // Two intersection points.
    const q = -0.5 * (b + copysign(1.0, b) * GfSqrt(disc))
    let t0 = q / a
    let t1 = c / q

    if (t0 > t1) {
      const tmp = t0
      t0 = t1
      t1 = tmp
    }

    if (t1 >= 0) {
      return { hit: true, enterDistance: t0, exitDistance: t1 }
    }

    return fail
  }
}

/** Result of GfFindClosestPoints(ray, line|seg). */
export interface RayClosestPointsResult {
  intersects: boolean
  rayPoint: GfVec3d
  /** Closest point on the line / segment. */
  otherPoint: GfVec3d
  rayDistance: number
  /** Parametric distance on the line / segment. */
  otherDistance: number
}

/**
 * Computes the closest points between a ray and a line (or line segment).
 * Verbatim port of the free GfFindClosestPoints(GfRay, GfLine/GfLineSeg).
 * Returns intersects=false when the lines were close enough to parallel that no
 * points could be computed.
 */
export function GfFindClosestPoints(
  ray: GfRay,
  other: GfLine | GfLineSeg,
): RayClosestPointsResult {
  const miss: RayClosestPointsResult = {
    intersects: false,
    rayPoint: new GfVec3d(),
    otherPoint: new GfVec3d(),
    rayDistance: 0,
    otherDistance: 0,
  }

  const l = new GfLine()
  const len = l.Set(ray.getStartPoint(), ray.getDirection())

  let r: ClosestPointsResult
  if (other instanceof GfLineSeg) {
    r = GfFindClosestPointsLineSeg(l, other)
  } else {
    r = GfFindClosestPointsLine(l, other)
  }
  if (!r.intersects) {
    return miss
  }

  let rd = r.t1
  if (rd < 0.0) rd = 0.0

  return {
    intersects: true,
    rayPoint: l.getPoint(rd),
    otherPoint: r.p2,
    rayDistance: rd / len,
    otherDistance: r.t2,
  }
}

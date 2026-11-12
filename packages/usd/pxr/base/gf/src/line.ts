// Ported from OpenUSD 26.11.1: pxr/base/gf/line.cpp, pxr/base/gf/line.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// typescript-usd/gf — GfLine: basic 3D line value type.
//
// Mirrors OpenUSD pxr/base/gf/line.{h,cpp}. A line is point + normalized
// direction in the parametric form p = p0 + t * dir (dir normalized in the
// ctor / Set, so t is a unit distance).
//
// C++ operator -> TS method mapping:
//   GfLine(p0, dir)                  -> new GfLine(p0, dir)
//   Set(p0, dir) -> length           -> Set(p0, dir): number
//   GetPoint(t)                      -> GetPoint(t)
//   GetDirection()                   -> GetDirection()
//   FindClosestPoint(point, *t)      -> FindClosestPoint(point): { point, t }
//   operator==                       -> equals(other)
//   free GfFindClosestPoints(l1, l2) -> GfFindClosestPoints(l1, l2)
//
// Algorithms are ported verbatim from line.cpp (operation order preserved so
// rounding matches the Pixar oracle).

import { GfVec3d } from './vec.ts'

/** GfClamp(value, min, max): mirrors pxr/base/gf/math.h GfClamp. */
function GfClamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

/** Scalar GfIsClose(a, b, eps): |a - b| <= eps (pxr/base/gf/math.h). */
function GfIsCloseScalar(a: number, b: number, epsilon: number): boolean {
  return Math.abs(a - b) <= epsilon
}

/** Result of the free GfFindClosestPoints(line, line) function. */
export interface ClosestPointsResult {
  /** false if the lines were close to parallel (other fields undefined). */
  intersects: boolean
  p1: GfVec3d
  p2: GfVec3d
  t1: number
  t2: number
}

/** Result of GfLine.FindClosestPoint(point). */
export interface ClosestPointResult {
  point: GfVec3d
  t: number
}

export class GfLine {
  // Parametric description: l(t) = _p0 + t * _dir (dir normalized).
  private _p0: GfVec3d
  private _dir: GfVec3d

  /**
   * Construct a line from a point and direction. The direction is normalized.
   * The default (no-arg) constructor leaves the line at the origin with a zero
   * direction (upstream leaves it undefined; we use a defined zero state).
   */
  constructor(p0?: GfVec3d, dir?: GfVec3d) {
    this._p0 = new GfVec3d()
    this._dir = new GfVec3d()
    if (p0 !== undefined && dir !== undefined) {
      this.Set(p0, dir)
    }
  }

  /** Set point + direction; returns the (pre-normalization) direction length. */
  Set(p0: GfVec3d, dir: GfVec3d): number {
    this._p0 = new GfVec3d(p0)
    this._dir = new GfVec3d(dir)
    return this._dir.Normalize()
  }

  /** Return the point on the line at p0 + t * dir. */
  getPoint(t: number): GfVec3d {
    return this._p0.add(this._dir.getScaled(t))
  }

  /** Return the normalized direction of the line. */
  getDirection(): GfVec3d {
    return this._dir
  }

  /**
   * Mirrors the python `direction` property setter (wrapLine.cpp
   * SetDirectionHelper): re-Sets the line keeping its current base point, so
   * the new direction is normalized.
   */
  setDirection(dir: GfVec3d): void {
    this.Set(this.getPoint(0.0), dir)
  }

  /** GetPoint(0) — the line's base point (mirrors the .point/getter usage). */
  getP0(): GfVec3d {
    return this._p0
  }

  /**
   * Returns the point on the line closest to `point` and its parametric
   * distance t along the line. Verbatim port of GfLine::FindClosestPoint.
   */
  findClosestPoint(point: GfVec3d): ClosestPointResult {
    // Vector from the start point to the given point.
    const v = point.subtract(this._p0)
    // Length of the projection of v onto the line.
    const lt = v.dot(this._dir)
    return { point: this.getPoint(lt), t: lt }
  }

  /** operator== : exact component match of point and direction. */
  equals(l: GfLine): boolean {
    return this._p0.equals(l._p0) && this._dir.equals(l._dir)
  }

  /** ostream form, mirroring operator<<. */
  toString(): string {
    return `(point:${this.getPoint(0.0).toString()} direction:${this._dir.toString()})`
  }
}

/**
 * Computes the closest points between two lines. Verbatim port of the free
 * GfFindClosestPoints(GfLine, GfLine). Returns intersects=false when the lines
 * are close enough to parallel that no points can be computed.
 */
export function GfFindClosestPoints(
  l1: GfLine,
  l2: GfLine,
): ClosestPointsResult {
  const p1 = l1.getP0()
  const d1 = l1.getDirection()
  const p2 = l2.getP0()
  const d2 = l2.getDirection()

  const a = d1.dot(d2)
  const b = d1.dot(d1)
  const c = d1.dot(p1) - d1.dot(p2)
  const d = d2.dot(d2)
  const e = a
  const f = d2.dot(p1) - d2.dot(p2)

  const denom = a * e - b * d

  // Denominator == 0 means the lines are parallel; no intersection.
  if (GfIsCloseScalar(denom, 0, 1e-6)) {
    return { intersects: false, p1: new GfVec3d(), p2: new GfVec3d(), t1: 0, t2: 0 }
  }

  const lt1 = (c * d - a * f) / denom
  const lt2 = (c * e - b * f) / denom

  return {
    intersects: true,
    p1: l1.getPoint(lt1),
    p2: l2.getPoint(lt2),
    t1: lt1,
    t2: lt2,
  }
}

export { GfClamp }

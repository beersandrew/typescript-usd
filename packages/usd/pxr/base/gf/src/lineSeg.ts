// Ported from OpenUSD 26.11.1: pxr/base/gf/lineSeg.cpp, pxr/base/gf/lineSeg.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// typescript-usd/gf — GfLineSeg: basic 3D line segment value type.
//
// Mirrors OpenUSD pxr/base/gf/lineSeg.{h,cpp}. A segment spans p0..p1 and is
// stored internally as a GfLine (point + normalized direction) plus the
// distance _length from p0 to p1, so GetPoint(t) maps t in [0,1] across the
// segment. Builds on GfLine (./line.ts).
//
// C++ operator -> TS method mapping:
//   GfLineSeg(p0, p1)                       -> new GfLineSeg(p0, p1)
//   GetPoint(t)                             -> GetPoint(t)
//   GetDirection()                          -> GetDirection()
//   GetLength()                             -> GetLength()
//   FindClosestPoint(point, *t)             -> FindClosestPoint(point)
//   operator==                              -> equals(other)
//   free GfFindClosestPoints(line, seg)     -> GfFindClosestPoints(line, seg)
//   free GfFindClosestPoints(seg1, seg2)    -> GfFindClosestPoints(seg1, seg2)
//
// Algorithms are ported verbatim from lineSeg.cpp (operation order preserved
// so rounding matches the Pixar oracle).

import { GfVec3d } from './vec.ts'
import {
  GfLine,
  GfClamp,
  GfFindClosestPoints as GfFindClosestPointsLine,
  type ClosestPointResult,
  type ClosestPointsResult,
} from './line.ts'

export class GfLineSeg {
  private _line: GfLine
  private _length: number // distance from p0 to p1

  /**
   * Construct a segment spanning two points. The default (no-arg) constructor
   * yields a degenerate zero-length segment at the origin.
   */
  constructor(p0?: GfVec3d, p1?: GfVec3d) {
    this._line = new GfLine()
    this._length = 0
    if (p0 !== undefined && p1 !== undefined) {
      // _length = _line.Set(p0, p1 - p0)
      this._length = this._line.Set(p0, p1.subtract(p0))
    }
  }

  /** Return the point on the segment at parameter t: p0 + t*(p1 - p0). */
  getPoint(t: number): GfVec3d {
    return this._line.getPoint(t * this._length)
  }

  /** Return the normalized direction of the segment. */
  getDirection(): GfVec3d {
    return this._line.getDirection()
  }

  /** Return the length of the segment (distance p0 -> p1). */
  GetLength(): number {
    return this._length
  }

  /** Internal access to the backing GfLine (mirrors the friend grant). */
  getLine(): GfLine {
    return this._line
  }

  /**
   * Returns the point on the segment closest to `point` and the clamped
   * parametric distance t in [0,1]. Verbatim port of
   * GfLineSeg::FindClosestPoint.
   */
  findClosestPoint(point: GfVec3d): ClosestPointResult {
    let lt: number
    if (this._length === 0.0) {
      lt = 0.0
    } else {
      const r = this._line.findClosestPoint(point)
      lt = GfClamp(r.t / this._length, 0, 1)
    }
    return { point: this.getPoint(lt), t: lt }
  }

  /** operator== : the backing lines and lengths must match exactly. */
  equals(l: GfLineSeg): boolean {
    return this._line.equals(l._line) && this._length === l._length
  }

  /** ostream form, mirroring operator<<. */
  toString(): string {
    return `(point 1:${this.getPoint(0.0).toString()} point 2:${this.getPoint(1.0).toString()})`
  }
}

/**
 * Computes the closest points on a line and a segment. Verbatim port of
 * GfFindClosestPoints(const GfLine&, const GfLineSeg&).
 */
export function GfFindClosestPointsLineSeg(
  line: GfLine,
  seg: GfLineSeg,
): ClosestPointsResult {
  const r = GfFindClosestPointsLine(line, seg.getLine())
  if (!r.intersects) {
    return { intersects: false, p1: new GfVec3d(), p2: new GfVec3d(), t1: 0, t2: 0 }
  }

  let cp1 = r.p1
  let lt1 = r.t1
  let lt2 = GfClamp(r.t2 / seg.GetLength(), 0, 1)
  const cp2 = seg.getPoint(lt2)

  // If we clamp the segment, move the line point to the closest point on the
  // line to the clamped point.
  if (lt2 <= 0 || lt2 >= 1) {
    const c = line.findClosestPoint(cp2)
    cp1 = c.point
    lt1 = c.t
  }

  return { intersects: true, p1: cp1, p2: cp2, t1: lt1, t2: lt2 }
}

/**
 * Computes the closest points on two segments. Verbatim port of
 * GfFindClosestPoints(const GfLineSeg&, const GfLineSeg&).
 */
export function GfFindClosestPointsSegSeg(
  seg1: GfLineSeg,
  seg2: GfLineSeg,
): ClosestPointsResult {
  const r = GfFindClosestPointsLine(seg1.getLine(), seg2.getLine())
  if (!r.intersects) {
    return { intersects: false, p1: new GfVec3d(), p2: new GfVec3d(), t1: 0, t2: 0 }
  }

  const lt1 = GfClamp(r.t1 / seg1.GetLength(), 0, 1)
  const lt2 = GfClamp(r.t2 / seg2.GetLength(), 0, 1)

  return {
    intersects: true,
    p1: seg1.getPoint(lt1),
    p2: seg2.getPoint(lt2),
    t1: lt1,
    t2: lt2,
  }
}

/**
 * Overloaded free function matching upstream's `GfFindClosestPoints` name,
 * dispatching by argument type:
 *   (GfLine, GfLine)       -> line/line  (from ./line.ts)
 *   (GfLine, GfLineSeg)    -> line/seg
 *   (GfLineSeg, GfLineSeg) -> seg/seg
 */
export function GfFindClosestPoints(a: GfLine, b: GfLine): ClosestPointsResult
export function GfFindClosestPoints(a: GfLine, b: GfLineSeg): ClosestPointsResult
export function GfFindClosestPoints(a: GfLineSeg, b: GfLineSeg): ClosestPointsResult
export function GfFindClosestPoints(
  a: GfLine | GfLineSeg,
  b: GfLine | GfLineSeg,
): ClosestPointsResult {
  if (a instanceof GfLineSeg && b instanceof GfLineSeg) {
    return GfFindClosestPointsSegSeg(a, b)
  }
  if (a instanceof GfLine && b instanceof GfLineSeg) {
    return GfFindClosestPointsLineSeg(a, b)
  }
  if (a instanceof GfLine && b instanceof GfLine) {
    return GfFindClosestPointsLine(a, b)
  }
  throw new TypeError('GfFindClosestPoints: unsupported argument types')
}

// Ported from OpenUSD 26.11.1: pxr/base/gf/lineSeg2d.cpp,
//  pxr/base/gf/lineSeg2d.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.08 pxr/base/gf/lineSeg2d.{h,cpp}.
import { GfLine2d, GfFindClosestPoints2d, type GfLine2dClosestPoints } from './line2d.ts'
import { GfVec2d } from './vec.ts'

export class GfLineSeg2d {
  #line = new GfLine2d()
  #length = 0

  constructor(p0?: GfVec2d, p1?: GfVec2d) {
    if (p0 && p1) this.#length = this.#line.Set(p0, p1.subtract(p0))
  }
  getPoint(t: number): GfVec2d { return this.#line.getPoint(t * this.#length) }
  getDirection(): GfVec2d { return this.#line.getDirection() }
  GetLength(): number { return this.#length }
  findClosestPoint(point: GfVec2d): { point: GfVec2d, t: number } {
    const closest = this.#line.findClosestPoint(point)
    const distance = Math.max(0, Math.min(this.#length, closest.t))
    return {
      point: this.#line.getPoint(distance),
      t: this.#length === 0 ? 0 : distance / this.#length,
    }
  }
  _getLine(): GfLine2d { return this.#line }
  equals(other: GfLineSeg2d): boolean {
    return this.#line.equals(other.#line) && this.#length === other.#length
  }
}

export function GfFindClosestPointsLineSeg2d(
  line: GfLine2d,
  segment: GfLineSeg2d,
): GfLine2dClosestPoints {
  const result = GfFindClosestPoints2d(line, segment._getLine())
  if (!result.success) return result
  const t2 = Math.max(0, Math.min(1, result.t2! / segment.GetLength()))
  const p2 = segment.getPoint(t2)
  const closest = line.findClosestPoint(p2)
  return { success: true, p1: closest.point, p2, t1: closest.t, t2 }
}

export function GfFindClosestPointsSegSeg2d(
  a: GfLineSeg2d,
  b: GfLineSeg2d,
): GfLine2dClosestPoints {
  const result = GfFindClosestPoints2d(a._getLine(), b._getLine())
  if (!result.success) return result
  const t1 = Math.max(0, Math.min(1, result.t1! / a.GetLength()))
  const t2 = Math.max(0, Math.min(1, result.t2! / b.GetLength()))
  return { success: true, p1: a.getPoint(t1), p2: b.getPoint(t2), t1, t2 }
}

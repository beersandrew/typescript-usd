// Ported from OpenUSD 26.11.1: pxr/base/gf/line2d.cpp, pxr/base/gf/line2d.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.08 pxr/base/gf/line2d.{h,cpp}.
import { GfVec2d } from './vec.ts'

export interface GfLine2dClosestPoints {
  success: boolean
  p1?: GfVec2d
  p2?: GfVec2d
  t1?: number
  t2?: number
}

export class GfLine2d {
  #p0 = new GfVec2d()
  #direction = new GfVec2d()

  constructor(p0?: GfVec2d, direction?: GfVec2d) {
    if (p0 && direction) this.Set(p0, direction)
  }
  Set(p0: GfVec2d, direction: GfVec2d): number {
    this.#p0 = new GfVec2d(p0)
    this.#direction = new GfVec2d(direction)
    return this.#direction.Normalize()
  }
  getPoint(t: number): GfVec2d {
    return this.#p0.add(this.#direction.getScaled(t))
  }
  getDirection(): GfVec2d { return new GfVec2d(this.#direction) }
  findClosestPoint(point: GfVec2d): { point: GfVec2d, t: number } {
    const t = point.subtract(this.#p0).dot(this.#direction)
    return { point: this.getPoint(t), t }
  }
  equals(other: GfLine2d): boolean {
    return this.#p0.equals(other.#p0) && this.#direction.equals(other.#direction)
  }
}

export function GfFindClosestPoints2d(
  l1: GfLine2d,
  l2: GfLine2d,
): GfLine2dClosestPoints {
  // OpenUSD v26.08 line2d.cpp:42-67.
  const d1 = l1.getDirection()
  const d2 = l2.getDirection()
  const p1 = l1.getPoint(0)
  const p2 = l2.getPoint(0)
  const d1d2 = d1.dot(d2)
  const denom = 1 - d1d2 * d1d2
  if (Math.abs(denom) < 1e-6) return { success: false }
  const delta = p2.subtract(p1)
  const d1Delta = d1.dot(delta)
  const d2Delta = d2.dot(delta)
  const t1 = (d1Delta - d1d2 * d2Delta) / denom
  const t2 = (d1d2 * d1Delta - d2Delta) / denom
  return { success: true, p1: l1.getPoint(t1), p2: l2.getPoint(t2), t1, t2 }
}

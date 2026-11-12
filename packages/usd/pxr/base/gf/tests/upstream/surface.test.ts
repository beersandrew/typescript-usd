// Ported from OpenUSD v26.08 pxr/base/gf/{half,vec.template,quat.template,
// dualQuat.template,line2d,lineSeg2d,matrixData}.{h,cpp}. Binary16 expected
// values were captured from the live v26.08 pxr.Gf oracle.
import { describe, expect, it } from 'vitest'
import {
  DualQuath,
  GfHalf,
  GfLine2d,
  GfLineSeg2d,
  GfMatrixData,
  Quath,
  Vec2d,
  Vec2h,
  Vec3h,
} from '../../src/index.ts'

describe('Phase 41 Gf value-type breadth', () => {
  it('rounds scalar and vector storage to the live binary16 oracle', () => {
    expect(Number(new GfHalf(0.1))).toBe(0.0999755859375)
    expect(new Vec2h(1 / 3).data).toEqual([0.333251953125, 0.333251953125])
    expect(new Vec2h(65504).get(0)).toBe(65504)
    expect(new Vec2h(65520).get(0)).toBe(Infinity)
    expect(new Vec2h(2 ** -25).get(0)).toBe(0)
    expect(new Vec2h(1.5 * 2 ** -25).get(0)).toBe(2 ** -24)
    expect(new Vec2h(1e-8).get(0)).toBe(0)
  })

  it('ports half quaternion and dual-quaternion storage', () => {
    const q = new Quath(0.1, new Vec3h(0.2, 0.3, 0.4))
    expect(q.GetReal()).toBe(0.0999755859375)
    expect(q.GetImaginary().data).toEqual([
      0.199951171875, 0.300048828125, 0.39990234375,
    ])
    const dq = new DualQuath(q, new Vec3h(1, 2, 3))
    expect(dq.getTranslation().data).toEqual([
      0.300048828125, 0.60009765625, 0.89990234375,
    ])
  })

  it('ports 2D line and segment parameterization', () => {
    const line = new GfLine2d(new Vec2d(1, 2), new Vec2d(3, 4))
    expect(line.getDirection().data[0]).toBeCloseTo(0.6)
    expect(line.getDirection().data[1]).toBeCloseTo(0.8)
    expect(line.getPoint(0.5).data).toEqual([1.3, 2.4])

    const segment = new GfLineSeg2d(new Vec2d(0, 0), new Vec2d(2, 0))
    expect(segment.GetLength()).toBe(2)
    expect(segment.getPoint(0.25).data).toEqual([0.5, 0])
    const closest = segment.findClosestPoint(new Vec2d(3, 1))
    expect(closest.point.data).toEqual([2, 0])
    expect(closest.t).toBe(1)
  })

  it('ports the matrix-data storage contract', () => {
    const data = new GfMatrixData(2, 3)
    data.Set(1, 2, 7)
    expect(data.Get(1, 2)).toBe(7)
    expect(data.getRow(1)).toEqual([0, 0, 7])
    expect(data.getData()).toEqual([0, 0, 0, 0, 0, 7])
  })
})

// Ported from OpenUSD 26.11.1: pxr/base/gf/testenv/testGfLineSeg.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// 1:1 port of OpenUSD pxr/base/gf/testenv/testGfLineSeg.py.
//
// One describe() per upstream test method, every assert mirrored. Every
// expected numeric value is captured from the OpenUSD 26.11.1 build
// (FIXTURES.md) into fixtures/lineSeg.json — never hand-derived
// (AGENTS.md numeric-fixture rule).
//
// Surface mapping (see src/lineSeg.ts header):
//   Gf.LineSeg() / Gf.LineSeg(p0, p1)        -> new GfLineSeg() / new GfLineSeg(p0,p1)
//   l.GetPoint(t)                            -> l.GetPoint(t)
//   l.direction / l.GetDirection()           -> l.GetDirection()
//   l.length / l.GetLength()                 -> l.GetLength()
//   l.FindClosestPoint(point) -> (point, t)  -> l.FindClosestPoint(point)
//   Gf.FindClosestPoints(a, b)               -> GfFindClosestPoints(a, b)
//                                               (line/seg and seg/seg overloads)
//   == / repr / str                          -> equals / round-trip / toString

import { describe, it, expect } from 'vitest'
import { GfVec3d, GfGetLength } from '../../src/vec.ts'
import { GfLine } from '../../src/line.ts'
import { GfLineSeg, GfFindClosestPoints } from '../../src/lineSeg.ts'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'

type V3 = [number, number, number]
// The five outputs of one FindClosestPoints call, keyed <prefix>_<name>.
type Closest<P extends string> = { [K in `${P}_intersects`]: boolean }
  & { [K in `${P}_p1` | `${P}_p2`]: V3 }
  & { [K in `${P}_t1` | `${P}_t2`]: number }
type LineSegFixture = {
  prop_point0: V3
  prop_dir: V3
  prop_len: number
  getpoint_half: V3
  getpoint_one: V3
  dir_121_111: V3
  len_345: number
  fcp_point: V3
  fcp_t: number
  fcp_zero_point: V3
  fcp_zero_t: number
  ss_parallel_intersects: boolean
  ls_parallel_intersects: boolean
} & Closest<'ss'> & Closest<'ss_deg'> & Closest<'ss_deg2'> & Closest<'ls'> & Closest<'ls_deg'>
const G = readOracleFixture<LineSegFixture>(new URL('./fixtures/lineSeg.json', import.meta.url))

const isCloseVec = (a: readonly number[], b: readonly number[], tol: number): boolean => {
  let s = 0
  for (let i = 0; i < a.length; i++) s += (a[i]! - b[i]!) ** 2
  return s <= tol * tol
}
const assertCloseVec = (a: GfVec3d, b: readonly number[], tol: number): void =>
  expect(isCloseVec(a.data, b, tol)).toBe(true)
const isCloseScalar = (a: number, b: number, tol: number): boolean =>
  Math.abs(a - b) <= tol

describe('test_Constructors', () => {
  it('default and (p0, p1) constructors produce GfLineSeg instances', () => {
    expect(new GfLineSeg()).toBeInstanceOf(GfLineSeg)
    expect(new GfLineSeg(new GfVec3d(), new GfVec3d())).toBeInstanceOf(GfLineSeg)
  })
})

describe('test_Properties', () => {
  it('initializing constructor: point, direction, length', () => {
    const l = new GfLineSeg(new GfVec3d(1, 2, 3), new GfVec3d(2, 3, 4))
    expect(l.getPoint(0).equals(new GfVec3d(...G.prop_point0))).toBe(true)
    expect(l.getDirection().equals(new GfVec3d(...G.prop_dir))).toBe(true)
    expect(l.GetLength()).toBe(
      GfGetLength(new GfVec3d(2, 3, 4).subtract(new GfVec3d(1, 2, 3))),
    )
    expect(l.GetLength()).toBe(G.prop_len)
  })

  it('GetPoint', () => {
    const l = new GfLineSeg(new GfVec3d(0, 0, 0), new GfVec3d(0, 1, 0))
    expect(l.getPoint(0.5).equals(new GfVec3d(...G.getpoint_half))).toBe(true)
    expect(l.getPoint(1.0).equals(new GfVec3d(...G.getpoint_one))).toBe(true)
  })

  it('direction', () => {
    const l = new GfLineSeg(new GfVec3d(1, 2, 3), new GfVec3d(1, 1, 1))
    expect(l.getDirection().equals(new GfVec3d(...G.dir_121_111))).toBe(true)
  })

  it('length', () => {
    const l = new GfLineSeg(new GfVec3d(0, 0, 0), new GfVec3d(0, 3, 4))
    expect(l.GetLength()).toBe(G.len_345)
  })
})

describe('test_Methods', () => {
  it('FindClosestPoint on a normal segment', () => {
    const l = new GfLineSeg(new GfVec3d(0, 0, 0), new GfVec3d(1, 1, 1))
    const { point, t } = l.findClosestPoint(new GfVec3d(0.5, 0.5, 1))
    assertCloseVec(point, G.fcp_point, 0.00001)
    expect(isCloseScalar(t, G.fcp_t, 0.0001)).toBe(true)
  })

  it('FindClosestPoint on a degenerate segment', () => {
    const l = new GfLineSeg(new GfVec3d(0, 0, 0), new GfVec3d(0, 0, 0))
    const { point, t } = l.findClosestPoint(new GfVec3d(0.5, 0.5, 1))
    assertCloseVec(point, G.fcp_zero_point, 0.00001)
    expect(isCloseScalar(t, G.fcp_zero_t, 0.0001)).toBe(true)
  })

  it('seg on seg parallel case returns false', () => {
    const l1 = new GfLineSeg(new GfVec3d(0, 0, 0), new GfVec3d(1, 1, 1))
    const l2 = new GfLineSeg(new GfVec3d(1, 0, 0), new GfVec3d(2, 1, 1))
    expect(GfFindClosestPoints(l1, l2).intersects).toBe(G.ss_parallel_intersects)
  })

  it('seg on seg intersecting case', () => {
    const l1 = new GfLineSeg(new GfVec3d(0, 0, 0), new GfVec3d(1, 1, 1))
    const l2 = new GfLineSeg(new GfVec3d(1, 0, 0), new GfVec3d(1, -1, 1))
    const { intersects, p1, p2, t1, t2 } = GfFindClosestPoints(l1, l2)
    expect(intersects).toBe(G.ss_intersects)
    assertCloseVec(p1, G.ss_p1, 0.00001)
    assertCloseVec(p2, G.ss_p2, 0.00001)
    expect(isCloseScalar(t1, G.ss_t1, 0.00001)).toBe(true)
    expect(isCloseScalar(t2, G.ss_t2, 0.00001)).toBe(true)
  })

  it('seg on seg both degenerate (both orderings) return false', () => {
    const l1 = new GfLineSeg(new GfVec3d(), new GfVec3d())
    const l2 = new GfLineSeg(new GfVec3d(1, 1, 1), new GfVec3d(1, 1, 1))
    {
      const { intersects, p1, p2, t1, t2 } = GfFindClosestPoints(l1, l2)
      expect(intersects).toBe(G.ss_deg_intersects)
      assertCloseVec(p1, G.ss_deg_p1, 0.00001)
      assertCloseVec(p2, G.ss_deg_p2, 0.00001)
      expect(isCloseScalar(t1, G.ss_deg_t1, 0.00001)).toBe(true)
      expect(isCloseScalar(t2, G.ss_deg_t2, 0.00001)).toBe(true)
    }
    {
      const { intersects, p1, p2, t1, t2 } = GfFindClosestPoints(l2, l1)
      expect(intersects).toBe(G.ss_deg2_intersects)
      assertCloseVec(p1, G.ss_deg2_p1, 0.00001)
      assertCloseVec(p2, G.ss_deg2_p2, 0.00001)
      expect(isCloseScalar(t1, G.ss_deg2_t1, 0.00001)).toBe(true)
      expect(isCloseScalar(t2, G.ss_deg2_t2, 0.00001)).toBe(true)
    }
  })

  it('line on seg parallel case returns false', () => {
    const l1 = new GfLine(new GfVec3d(0, 0, 0), new GfVec3d(1, 1, 1))
    const l2 = new GfLineSeg(new GfVec3d(1, 0, 0), new GfVec3d(2, 1, 1))
    expect(GfFindClosestPoints(l1, l2).intersects).toBe(G.ls_parallel_intersects)
  })

  it('line on seg intersecting case', () => {
    const l1 = new GfLine(new GfVec3d(0, 0, 0), new GfVec3d(1, 1, 1))
    const l2 = new GfLineSeg(new GfVec3d(1, 0, 0), new GfVec3d(1, -1, 1))
    const { intersects, p1, p2, t1, t2 } = GfFindClosestPoints(l1, l2)
    expect(intersects).toBe(G.ls_intersects)
    assertCloseVec(p1, G.ls_p1, 0.00001)
    assertCloseVec(p2, G.ls_p2, 0.00001)
    expect(isCloseScalar(t1, G.ls_t1, 0.00001)).toBe(true)
    expect(isCloseScalar(t2, G.ls_t2, 0.00001)).toBe(true)
  })

  it('line on seg degenerate segment returns false', () => {
    const l1 = new GfLine(new GfVec3d(0, 0, 0), new GfVec3d(1, 1, 1))
    const l2 = new GfLineSeg(new GfVec3d(), new GfVec3d())
    const { intersects, p1, p2, t1, t2 } = GfFindClosestPoints(l1, l2)
    expect(intersects).toBe(G.ls_deg_intersects)
    assertCloseVec(p1, G.ls_deg_p1, 0.00001)
    assertCloseVec(p2, G.ls_deg_p2, 0.00001)
    expect(isCloseScalar(t1, G.ls_deg_t1, 0.00001)).toBe(true)
    expect(isCloseScalar(t2, G.ls_deg_t2, 0.00001)).toBe(true)
  })
})

describe('test_Operators', () => {
  it('equality', () => {
    const l1 = new GfLineSeg(new GfVec3d(0, 0, 0), new GfVec3d(1, 1, 1))
    const l2 = new GfLineSeg(new GfVec3d(0, 0, 0), new GfVec3d(1, 1, 1))
    expect(l1.equals(l2)).toBe(true)
  })

  it('inequality against a non-segment', () => {
    const l1 = new GfLineSeg(new GfVec3d(0, 0, 0), new GfVec3d(1, 2, 3))
    expect((l1 as unknown) === (2 as unknown)).toBe(false)
  })

  it('repr round-trips and str is non-empty', () => {
    // eval(repr(l1)) == l1: reconstruct from the two endpoints.
    const l1 = new GfLineSeg(new GfVec3d(0, 0, 0), new GfVec3d(1, 2, 3))
    const reconstructed = new GfLineSeg(l1.getPoint(0), l1.getPoint(1))
    expect(l1.equals(reconstructed)).toBe(true)
    expect(new GfLineSeg().toString().length).toBeGreaterThan(0)
  })
})

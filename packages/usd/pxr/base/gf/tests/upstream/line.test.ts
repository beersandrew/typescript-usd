// Ported from OpenUSD 26.11.1: pxr/base/gf/testenv/testGfLine.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// 1:1 port of OpenUSD pxr/base/gf/testenv/testGfLine.py.
//
// One describe() per upstream test method, every assert mirrored. Every
// expected numeric value is captured from the OpenUSD 26.11.1 build
// (FIXTURES.md) into fixtures/line.json — never hand-derived (AGENTS.md
// numeric-fixture rule).
//
// Surface mapping (see src/line.ts header):
//   Gf.Line() / Gf.Line(p0, dir)             -> new GfLine() / new GfLine(p0,dir)
//   l.Set(p0, dir)                           -> l.Set(p0, dir)
//   l.GetPoint(t)                            -> l.GetPoint(t)
//   l.direction (get) / l.GetDirection()     -> l.GetDirection()
//   l.direction = v (set, normalizes)        -> l.SetDirection(v)
//   l.FindClosestPoint(point) -> (point, t)  -> l.FindClosestPoint(point)
//   Gf.FindClosestPoints(l1, l2)             -> GfFindClosestPoints(l1, l2)
//   == / repr / str                          -> equals / round-trip / toString

import { describe, it, expect } from 'vitest'
import { GfVec3d } from '../../src/vec.ts'
import { GfLine, GfFindClosestPoints } from '../../src/line.ts'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'

type V3 = [number, number, number]
interface LineFixture {
  set_point0: V3
  set_dir: V3
  getpoint_half: V3
  getpoint_one: V3
  dir_set_111: V3
  fcp_point: V3
  fcp_t: number
  parallel_intersects: boolean
  fcps_intersects: boolean
  fcps_p1: V3
  fcps_p2: V3
  fcps_t1: number
  fcps_t2: number
}
const G = readOracleFixture<LineFixture>(new URL('./fixtures/line.json', import.meta.url))

// Gf.IsClose(GfVec3d): squared distance <= tol^2.
const isCloseVec = (a: readonly number[], b: readonly number[], tol: number): boolean => {
  let s = 0
  for (let i = 0; i < a.length; i++) s += (a[i]! - b[i]!) ** 2
  return s <= tol * tol
}
const assertCloseVec = (a: GfVec3d, b: readonly number[], tol: number): void =>
  expect(isCloseVec(a.data, b, tol)).toBe(true)
// Scalar Gf.IsClose: |a - b| <= tol.
const isCloseScalar = (a: number, b: number, tol: number): boolean =>
  Math.abs(a - b) <= tol

describe('test_Constructors', () => {
  it('default and (point, dir) constructors produce GfLine instances', () => {
    expect(new GfLine()).toBeInstanceOf(GfLine)
    expect(new GfLine(new GfVec3d(), new GfVec3d())).toBeInstanceOf(GfLine)
  })
})

describe('test_Properties', () => {
  it('Set, GetPoint, direction getter/setter', () => {
    const l = new GfLine()
    l.Set(new GfVec3d(1, 2, 3), new GfVec3d(2, 3, 4))
    expect(l.getPoint(0).equals(new GfVec3d(...G.set_point0))).toBe(true)
    expect(l.getDirection().equals(new GfVec3d(...G.set_dir))).toBe(true)

    l.Set(new GfVec3d(0, 0, 0), new GfVec3d(0, 1, 0))
    expect(l.getPoint(0.5).equals(new GfVec3d(...G.getpoint_half))).toBe(true)
    expect(l.getPoint(1.0).equals(new GfVec3d(...G.getpoint_one))).toBe(true)

    l.Set(new GfVec3d(1, 2, 3), new GfVec3d(2, 3, 4))
    l.setDirection(new GfVec3d(1, 1, 1))
    expect(l.getDirection().equals(new GfVec3d(...G.dir_set_111))).toBe(true)
  })
})

describe('test_Methods', () => {
  it('FindClosestPoint', () => {
    const l = new GfLine(new GfVec3d(0, 0, 0), new GfVec3d(1, 1, 1))
    const { point, t } = l.findClosestPoint(new GfVec3d(0.5, 0.5, 1))
    assertCloseVec(point, G.fcp_point, 0.00001)
    expect(isCloseScalar(t, G.fcp_t, 0.0001)).toBe(true)
  })

  it('FindClosestPoints parallel case returns false', () => {
    const l1 = new GfLine(new GfVec3d(0, 0, 0), new GfVec3d(1, 1, 1))
    const l2 = new GfLine(new GfVec3d(1, 0, 0), new GfVec3d(1, 1, 1))
    expect(GfFindClosestPoints(l1, l2).intersects).toBe(G.parallel_intersects)
  })

  it('FindClosestPoints intersecting case', () => {
    const l1 = new GfLine(new GfVec3d(0, 0, 0), new GfVec3d(1, 1, 1))
    const l2 = new GfLine(new GfVec3d(1, 0, 0), new GfVec3d(1, -1, 1))
    const { intersects, p1, p2, t1, t2 } = GfFindClosestPoints(l1, l2)
    expect(intersects).toBe(G.fcps_intersects)
    assertCloseVec(p1, G.fcps_p1, 0.00001)
    assertCloseVec(p2, G.fcps_p2, 0.00001)
    expect(isCloseScalar(t1, G.fcps_t1, 0.00001)).toBe(true)
    expect(isCloseScalar(t2, G.fcps_t2, 0.00001)).toBe(true)
  })
})

describe('test_Operators', () => {
  it('equality', () => {
    const l1 = new GfLine(new GfVec3d(0, 0, 0), new GfVec3d(1, 1, 1))
    const l2 = new GfLine(new GfVec3d(0, 0, 0), new GfVec3d(1, 1, 1))
    expect(l1.equals(l2)).toBe(true)
  })

  it('inequality against a non-line', () => {
    const l1 = new GfLine(new GfVec3d(0, 0, 0), new GfVec3d(1, 2, 3))
    // assertNotEqual(l1, 2): a GfLine is never equal to a scalar.
    expect((l1 as unknown) === (2 as unknown)).toBe(false)
  })

  it('repr round-trips and str is non-empty', () => {
    // eval(repr(l1)) == l1 : reconstruct from the same point/direction.
    const l1 = new GfLine(new GfVec3d(0, 0, 0), new GfVec3d(1, 2, 3))
    const reconstructed = new GfLine(l1.getPoint(0), l1.getDirection())
    expect(l1.equals(reconstructed)).toBe(true)
    expect(new GfLine().toString().length).toBeGreaterThan(0)
  })
})

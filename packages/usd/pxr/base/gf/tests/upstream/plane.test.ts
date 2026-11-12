// Ported from OpenUSD 26.11.1: pxr/base/gf/testenv/testGfPlane.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// 1:1 port of OpenUSD pxr/base/gf/testenv/testGfPlane.py.
//
// One describe() per upstream test method, every assert mirrored. The goldens
// are captured from the OpenUSD 26.11.1 build (FIXTURES.md) into
// fixtures/plane.json; the remaining expectations are upstream's own asserts —
// never hand-derived (AGENTS.md numeric-fixture rule).
//
// Adaptations of Python-only constructs (documented inline, never silently
// skipped):
//   - Gf.Plane(...) overloads -> GfPlane ctor / SetFrom* (see plane.ts).
//   - p.Set(...) returning the plane (Python return-self) -> .Set/.SetFrom*
//     return `this`.
//   - eval(repr(p)) == p  -> reconstruct via the (normal, distance) ctor and
//     compare with .equals (the repr is exactly that ctor call).
//   - Tf.ErrorException for < 3 points -> GfFitPlaneToPoints throws.
//   - Gf.FitPlaneToPoints returning None for collinear -> returns null.
import { describe, it, expect } from 'vitest'
import { GfVec3d, GfVec4d, GfDot } from '../../src/vec.ts'
import { GfMatrix4d } from '../../src/matrixData.ts'
import { GfRange3d } from '../../src/range.ts'
import { makeRotation } from '../../src/rotation.ts'
import { GfPlane, GfFitPlaneToPoints } from '../../src/plane.ts'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'

// ---- goldens captured from the OpenUSD 26.11.1 build ----
type Vec3 = [number, number, number]
type PlaneFixture = Record<
  | 'normalized111' | 'plane111_1_normal' | 'plane_normalpoint_normal' | 'plane_3pts_normal'
  | 'plane_vec4_normal' | 'project_333' | 'transform_normal' | 'reorient_neg_normal'
  | 'reorient_result_normal' | 'fit1_normal' | 'fit_proj_a' | 'fit_proj_b' | 'fit_proj_c'
  | 'fit_proj_d' | 'fit_proj_e' | 'p1_normal' | 'fit3_expectedNormal',
  Vec3
> &
  Record<
    | 'plane111_1_distance' | 'plane111_10_distance' | 'plane_normalpoint_distance'
    | 'plane_3pts_distance' | 'plane_vec4_distance' | 'getDistance_222' | 'getDistance_origin'
    | 'transform_distance' | 'fit1_dotZ' | 'fit1_distance' | 'fit2_dotZ' | 'fit2_distance'
    | 'p1_distance' | 'p2_dot' | 'p2_distance' | 'p3_dot' | 'p3_distance' | 'fit3_dot'
    | 'fit3_distance',
    number
  > & {
    plane_3pts2_equation: [number, number, number, number]
    plane_3pts2_eqn_checks: number[]
    repr: string
    collinear_result: null
  }

const G = readOracleFixture<PlaneFixture>(new URL('./fixtures/plane.json', import.meta.url))

// Gf.IsClose for vectors: squared distance <= tol^2.
const isCloseVec = (a: readonly number[], b: readonly number[], tol: number): boolean => {
  let s = 0
  for (let i = 0; i < a.length; i++) s += (a[i]! - b[i]!) ** 2
  return s <= tol * tol
}
// Gf.IsClose for scalars: |a-b| <= tol.
const isCloseScalar = (a: number, b: number, tol: number): boolean =>
  Math.abs(a - b) <= tol

describe('test_Constructors', () => {
  it('constructs the five GfPlane forms', () => {
    expect(new GfPlane()).toBeInstanceOf(GfPlane)
    expect(new GfPlane(new GfVec3d(1, 1, 1), 1)).toBeInstanceOf(GfPlane)
    expect(new GfPlane(new GfVec3d(1, 1, 1), new GfVec3d(1, 1, 1))).toBeInstanceOf(GfPlane)
    expect(
      new GfPlane(new GfVec3d(0, 0, 1), new GfVec3d(0, 1, 0), new GfVec3d(1, 0, 0)),
    ).toBeInstanceOf(GfPlane)
    expect(new GfPlane(new GfVec4d(3, 4, 0, 5))).toBeInstanceOf(GfPlane)
  })
})

describe('test_Properties', () => {
  it('Set variants equal the matching constructor', () => {
    const p = new GfPlane()
    expect(p.Set(new GfVec3d(1, 1, 1), 1).equals(new GfPlane(new GfVec3d(1, 1, 1), 1))).toBe(true)
    expect(
      p
        .setFromNormalAndPoint(new GfVec3d(1, 1, 1), new GfVec3d(1, 1, 1))
        .equals(new GfPlane(new GfVec3d(1, 1, 1), new GfVec3d(1, 1, 1))),
    ).toBe(true)
    expect(
      p
        .setFromPoints(new GfVec3d(0, 0, 1), new GfVec3d(0, 1, 0), new GfVec3d(1, 0, 0))
        .equals(
          new GfPlane(new GfVec3d(0, 0, 1), new GfVec3d(0, 1, 0), new GfVec3d(1, 0, 0)),
        ),
    ).toBe(true)
  })

  it('exposes normal and distanceFromOrigin', () => {
    let p = new GfPlane(new GfVec3d(1, 1, 1), 1)
    // Gf.Vec3d(1,1,1).GetNormalized()
    expect(p.normal.equals(new GfVec3d(1, 1, 1).GetNormalized())).toBe(true)
    expect(p.normal.data).toEqual(G.plane111_1_normal)

    p = new GfPlane(new GfVec3d(1, 1, 1), 10)
    expect(p.distanceFromOrigin).toBe(G.plane111_10_distance)
  })
})

describe('test_vec4d', () => {
  it('builds a plane from the equation Vec4d', () => {
    const p = new GfPlane(new GfVec4d(3, 4, 0, 5))
    // Gf.Vec3d(3,4,0) / 5
    expect(isCloseVec(p.normal.data, G.plane_vec4_normal, 1e-15)).toBe(true)
    expect(p.distanceFromOrigin).toBe(G.plane_vec4_distance)
  })

  it('a plane through three points satisfies its own equation', () => {
    const pt0 = new GfVec3d(2, 3, 1)
    const pt1 = new GfVec3d(5, 1, 2)
    const pt2 = new GfVec3d(6, 0, 7)

    const p = new GfPlane(pt0, pt1, pt2)
    const eqn = p.getEquation()
    for (const [i, pt] of [pt0, pt1, pt2].entries()) {
      const v =
        eqn.get(0) * pt.get(0) +
        eqn.get(1) * pt.get(1) +
        eqn.get(2) * pt.get(2) +
        eqn.get(3)
      expect(isCloseScalar(v, G.plane_3pts2_eqn_checks[i]!, 1e-12)).toBe(true)
    }
  })
})

describe('test_Operators', () => {
  it('equality and inequality', () => {
    const p1 = new GfPlane(new GfVec3d(1, 1, 1), 10)
    const p2 = new GfPlane(new GfVec3d(1, 1, 1), 20)
    expect(p1.equals(new GfPlane(new GfVec3d(1, 1, 1), 10))).toBe(true)
    expect(p1.equals(p2)).toBe(false)
    expect(!p1.equals(new GfPlane(new GfVec3d(1, 1, 1), 10))).toBe(false)
    expect(!p1.equals(p2)).toBe(true)
  })
})

describe('test_Methods', () => {
  it('GetDistance', () => {
    let p = new GfPlane(new GfVec3d(1, 1, 1), 1)
    expect(isCloseScalar(p.getDistance(new GfVec3d(2, 2, 2)), G.getDistance_222, 0.00001)).toBe(true)

    p = new GfPlane(new GfVec3d(1, 1, 1), 0)
    expect(isCloseScalar(p.getDistance(new GfVec3d(0, 0, 0)), G.getDistance_origin, 0.00001)).toBe(true)
  })

  it('Project', () => {
    const p = new GfPlane(new GfVec3d(0, 1, 0), 0)
    expect(p.project(new GfVec3d(3, 3, 3)).equals(new GfVec3d(...G.project_333))).toBe(true)
  })

  it('Transform', () => {
    const p = new GfPlane(new GfVec3d(1, 1, 1), 0)
    p.Transform(new GfMatrix4d().setRotate(makeRotation([1, 0, 0], 30)))
    expect(
      isCloseVec(p.normal.data, G.transform_normal, 0.0001),
    ).toBe(true)
  })

  it('Reorient', () => {
    const p = new GfPlane(new GfVec3d(1, 1, 1), 1)
    const negNormal = p.normal.getScaled(-1)
    expect(negNormal.equals(p.reorient(new GfVec3d()).normal)).toBe(true)
  })

  it('IntersectsPositiveHalfSpace(Range3d)', () => {
    let b = new GfRange3d()
    expect(new GfPlane(new GfVec3d(1, 1, 1), 1).intersectsPositiveHalfSpace(b)).toBe(false)

    b = new GfRange3d(new GfVec3d(-1, -1, -1), new GfVec3d(1, 1, 1))
    expect(new GfPlane(new GfVec3d(1, 1, 1), 1).intersectsPositiveHalfSpace(b)).toBe(true)
    expect(new GfPlane(new GfVec3d(1, 1, -1), 1).intersectsPositiveHalfSpace(b)).toBe(true)
    expect(new GfPlane(new GfVec3d(1, -1, 1), 1).intersectsPositiveHalfSpace(b)).toBe(true)
    expect(new GfPlane(new GfVec3d(1, -1, -1), 1).intersectsPositiveHalfSpace(b)).toBe(true)
    expect(new GfPlane(new GfVec3d(-1, 1, 1), 1).intersectsPositiveHalfSpace(b)).toBe(true)
    expect(new GfPlane(new GfVec3d(-1, 1, -1), 1).intersectsPositiveHalfSpace(b)).toBe(true)
    expect(new GfPlane(new GfVec3d(-1, -1, 1), 1).intersectsPositiveHalfSpace(b)).toBe(true)
    expect(new GfPlane(new GfVec3d(-1, -1, -1), 1).intersectsPositiveHalfSpace(b)).toBe(true)

    const p = new GfPlane(new GfVec3d(1, 1, 1), 10)
    expect(
      p.intersectsPositiveHalfSpace(new GfRange3d(new GfVec3d(), new GfVec3d(1, 1, 1))),
    ).toBe(false)
  })

  it('IntersectsPositiveHalfSpace(Vec3d)', () => {
    let p = new GfPlane(new GfVec3d(1, 1, 1), 1)
    expect(p.intersectsPositiveHalfSpace(new GfVec3d(1, 1, 1))).toBe(true)

    p = new GfPlane(new GfVec3d(1, 1, 1), 10)
    expect(p.intersectsPositiveHalfSpace(new GfVec3d())).toBe(false)
  })

  it('repr round-trips and str is non-empty', () => {
    const p = new GfPlane(new GfVec3d(1, 1, 1), 10)
    // eval(repr(p)) == p : the repr is the (normal, distance) ctor call.
    const rebuilt = new GfPlane(p.getNormal(), p.getDistanceFromOrigin())
    expect(rebuilt.equals(p)).toBe(true)
    expect(p.repr()).toBe(G.repr)

    expect(new GfPlane().toString().length).toBeGreaterThan(0)
  })
})

describe('test_Fitting', () => {
  it('collinear points do not define a plane', () => {
    const a = new GfVec3d(0, 0, 0)
    const b = new GfVec3d(1, 0, 0)
    const c = new GfVec3d(2, 0, 0)
    expect(GfFitPlaneToPoints([a, b, c])).toBe(G.collinear_result)
  })

  it('cannot fit a plane to two or fewer points', () => {
    const a = new GfVec3d(0, 0, 0)
    const b = new GfVec3d(1, 0, 0)
    expect(() => GfFitPlaneToPoints([a, b])).toThrow()
  })

  it('perfect fit, unit vectors', () => {
    const a = new GfVec3d(0, 0, 0)
    const b = new GfVec3d(1, 0, 0)
    const c = new GfVec3d(0, 1, 0)
    const p = GfFitPlaneToPoints([a, b, c])!
    expect(isCloseScalar(GfDot(p.getNormal(), GfVec3d.zAxis()), G.fit1_dotZ, 1e-7)).toBe(true)
    expect(isCloseScalar(p.getDistanceFromOrigin(), G.fit1_distance, 1e-7)).toBe(true)
  })

  it('perfect fit, non-unit vectors', () => {
    const a = new GfVec3d(0, 0, 0)
    const b = new GfVec3d(1.5, 0, 0)
    const c = new GfVec3d(0, 3.2, 0)
    const p = GfFitPlaneToPoints([a, b, c])!
    expect(isCloseScalar(GfDot(p.getNormal(), GfVec3d.zAxis()), G.fit2_dotZ, 1e-7)).toBe(true)
    expect(isCloseScalar(p.getDistanceFromOrigin(), G.fit2_distance, 1e-7)).toBe(true)
  })

  it('more complicated plane (3 and 5 points)', () => {
    const p1 = new GfPlane(new GfVec4d(3, 4, 0, 5)) // equation constructor
    const a = p1.project(new GfVec3d(2, 3, 6))
    const b = p1.project(new GfVec3d(34, -2, 2))
    const c = p1.project(new GfVec3d(-3, 7, -8))
    const d = p1.project(new GfVec3d(4, 1, 1))
    const e = p1.project(new GfVec3d(87, 67, 92))

    const p2 = GfFitPlaneToPoints([a, b, c])!
    expect(isCloseScalar(GfDot(p1.getNormal(), p2.getNormal()), G.p2_dot, 1e-7)).toBe(true)
    expect(isCloseScalar(p1.getDistanceFromOrigin(), p2.getDistanceFromOrigin(), 1e-7)).toBe(true)

    const p3 = GfFitPlaneToPoints([a, b, c, d, e])!
    expect(isCloseScalar(GfDot(p1.getNormal(), p3.getNormal()), G.p3_dot, 1e-7)).toBe(true)
    expect(isCloseScalar(p1.getDistanceFromOrigin(), p3.getDistanceFromOrigin(), 1e-7)).toBe(true)
  })

  it('imperfect plane fit (lower accuracy)', () => {
    const a = new GfVec3d(1.1, 1, 5)
    const b = new GfVec3d(1, 1.1, 2)
    const c = new GfVec3d(2, 2.1, -4)
    const d = new GfVec3d(2.1, 2, 1)
    const e = new GfVec3d(25.3, 25.2, 3)
    const f = new GfVec3d(25.1, 25.4, 6)
    const p = GfFitPlaneToPoints([a, b, c, d, e, f])!
    const expectedNormal = new GfVec3d(1, -1, 0).GetNormalized()
    // places=2 -> tolerance ~ 0.5e-2 (Python assertAlmostEqual rounds to 2 dp).
    expect(isCloseScalar(GfDot(p.getNormal(), expectedNormal), 1.0, 0.5e-2)).toBe(true)
    expect(isCloseScalar(p.getDistanceFromOrigin(), 0.0, 0.5e-2)).toBe(true)
  })
})

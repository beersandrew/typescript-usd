// Ported from OpenUSD 26.11.1: pxr/base/gf/testenv/testGfFrustum.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// 1:1 port of OpenUSD pxr/base/gf/testenv/testGfFrustum.py.
//
// One describe() per upstream test_* method; every assert mirrored. Numeric
// goldens for the IsClose comparisons are captured from the OpenUSD 26.11.1
// build (FIXTURES.md) into fixtures/frustum.json; they match the inline
// literals in the upstream .py. Exact-equality asserts use componentwise .equals; tolerance
// asserts use a Gf.IsClose-style squared-distance helper.

import { describe, it, expect } from 'vitest'
import { GfFrustum } from '../../src/frustum.ts'
import { GfVec2d, GfVec3d, GfVec4d, GfIsClose } from '../../src/vec.ts'
import { GfMatrix4d } from '../../src/matrixData.ts'
import { GfRange1d, GfRange2d, GfRange3d } from '../../src/range.ts'
import { GfBBox3d } from '../../src/bbox3d.ts'
import { makeRotation, rotationEqual, type Rotation } from '../../src/rotation.ts'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'

type V2 = [number, number]
type V3 = [number, number, number]
type Window = [V2, V2]
type Ray = [V3, V3]
interface FrustumFixture {
  setRotate_viewDir: V3
  setRotate_upVec: V3
  fromMatrix_corners: V3[]
  fromMatrix_cornersAt20: V3[]
  fromMatrix_cornersAt90: V3[]
  fromMatrix_cornersAt55: V3[]
  narrowed: Record<
    'ortho_v2_00' | 'ortho_v3_00m1' | 'ortho_v3_pt' | 'persp_v3_00m1' | 'persp_v3_pt' |
    'persp_behind', Window>
  pickRays: Record<'persp_win' | 'ortho_win' | 'persp_world_axis' | 'persp_world' | 'ortho_world', Ray>
  transform_nearFar: V2
}
// Captured from the OpenUSD 26.11.1 build (FIXTURES.md).
const G = readOracleFixture<FrustumFixture>(new URL('./fixtures/frustum.json', import.meta.url))
const vec3 = (v: V3): GfVec3d => new GfVec3d(v[0], v[1], v[2])

// Gf.Rotation(axis, angle) -> functional Rotation.
const Rot = (axis: [number, number, number], angle: number): Rotation =>
  makeRotation(axis, angle)

// Gf.IsClose(GfVec, GfVec, tol).
const isClose = (a: GfVec3d | GfVec4d, b: GfVec3d | GfVec4d, tol: number): boolean =>
  GfIsClose(a, b, tol)

describe('test_Constructors', () => {
  it('default + copy construct', () => {
    expect(new GfFrustum()).toBeInstanceOf(GfFrustum)
    expect(new GfFrustum(new GfFrustum())).toBeInstanceOf(GfFrustum)

    // code coverage: force instantiation of the frustum planes, then copy.
    const f = new GfFrustum()
    f.intersects(new GfVec3d())
    const f2 = new GfFrustum(f)
    expect(f2).toBeInstanceOf(GfFrustum)
  })
})

describe('test_Operators', () => {
  it('copy is equal', () => {
    const f1 = new GfFrustum()
    const f2 = new GfFrustum(f1)
    expect(f1.equals(f2)).toBe(true)
  })
})

describe('test_PlaneIntersection', () => {
  it('two defaults with planes forced are equal', () => {
    const f1 = new GfFrustum()
    const f2 = new GfFrustum()
    f1.intersects(new GfVec3d())
    f2.intersects(new GfVec3d())
    expect(f1.equals(f2)).toBe(true)
  })
})

describe('test_Position', () => {
  it('differing positions are unequal', () => {
    const f1 = new GfFrustum()
    const f2 = new GfFrustum()
    f1.position = new GfVec3d(1, 0, 0)
    f2.position = new GfVec3d(0, 1, 0)
    expect(f1.equals(f2)).toBe(false)
  })
})

describe('test_Properties', () => {
  it('round-trips each property', () => {
    const f = new GfFrustum()
    f.position = new GfVec3d(1, 2, 3)
    expect(f.position.equals(new GfVec3d(1, 2, 3))).toBe(true)

    f.rotation = Rot([1, 1, 1], 30)
    expect(rotationEqual(f.rotation, Rot([1, 1, 1], 30))).toBe(true)

    f.window = new GfRange2d(new GfVec2d(0, 1), new GfVec2d(2, 3))
    expect(f.window.equals(new GfRange2d(new GfVec2d(0, 1), new GfVec2d(2, 3)))).toBe(true)

    f.nearFar = new GfRange1d(1, 2)
    expect(f.nearFar.equals(new GfRange1d(1, 2))).toBe(true)

    f.viewDistance = 10
    expect(f.viewDistance).toBe(10)

    f.projectionType = GfFrustum.Orthographic
    expect(f.projectionType).toBe(GfFrustum.Orthographic)
    f.projectionType = GfFrustum.Perspective
    expect(f.projectionType).toBe(GfFrustum.Perspective)
  })
})

describe('test_Projection', () => {
  it('perspective + orthographic get/set', () => {
    const f = new GfFrustum()
    f.setPerspective(10, true, 20, 30, 40)
    expect(f.getPerspective(true)).toEqual([10, 20, 30, 40])
    expect(f.getFOV(true)).toBe(10)
    f.setPerspective(10, false, 20, 30, 40)
    expect(f.getPerspective(false)).toEqual([10, 20, 30, 40])
    expect(f.getFOV(false)).toBe(10)
    expect(f.getFOV()).toBe(10)

    const f2 = new GfFrustum()
    f2.projectionType = GfFrustum.Orthographic
    expect(f2.getPerspective(true)).toBeNull()
    expect(f2.getFOV(true)).toBe(0.0)
    expect(f2.getFOV(false)).toBe(0.0)

    expect(GfFrustum.getReferencePlaneDepth()).toBe(1.0)

    f2.setOrthographic(10, 20, 30, 40, 50, 60)
    expect(f2.getOrthographic()).toEqual([10, 20, 30, 40, 50, 60])
    expect(f2.getFOV()).toBe(0.0)

    const f3 = new GfFrustum()
    f3.projectionType = GfFrustum.Perspective
    expect(f3.getOrthographic()).toBeNull()
  })
})

describe('test_Intersection', () => {
  it('orthographic + perspective point intersections after FitToSphere', () => {
    let f = new GfFrustum()
    f.projectionType = GfFrustum.Orthographic
    f.fitToSphere(new GfVec3d(0, 0, 0), 1)
    expect(f.intersects(new GfVec3d(0, 0, 0))).toBe(true)
    expect(f.intersects(new GfVec3d(0.9, 0, 0))).toBe(true)
    expect(f.intersects(new GfVec3d(0, 0.9, 0))).toBe(true)
    expect(f.intersects(new GfVec3d(0, 0, 0.9))).toBe(true)
    expect(f.intersects(new GfVec3d(-0.9, 0, 0))).toBe(true)
    expect(f.intersects(new GfVec3d(0, -0.9, 0))).toBe(true)
    expect(f.intersects(new GfVec3d(0, 0, -0.9))).toBe(true)

    f = new GfFrustum()
    f.projectionType = GfFrustum.Perspective
    f.fitToSphere(new GfVec3d(1, 1, 1), 1, 0.2)
    expect(f.intersects(new GfVec3d(1, 1, 1))).toBe(true)
    expect(f.intersects(new GfVec3d(2.1, 1, 1))).toBe(true)
    expect(f.intersects(new GfVec3d(1, 2.1, 1))).toBe(true)
    expect(f.intersects(new GfVec3d(1, 1, 2.1))).toBe(true)
    expect(f.intersects(new GfVec3d(-0.1, 1, 1))).toBe(true)
    expect(f.intersects(new GfVec3d(1, -0.1, 1))).toBe(true)
    expect(f.intersects(new GfVec3d(1, 1, -0.1))).toBe(true)
  })
})

describe('test_CodeCoverage', () => {
  it('FitToSphere over assorted windows does not throw', () => {
    let f = new GfFrustum()
    f.projectionType = GfFrustum.Perspective
    f.window = new GfRange2d(new GfVec2d(10, 20), new GfVec2d(30, 40))
    f.fitToSphere(new GfVec3d(), 1)
    f.window = new GfRange2d(new GfVec2d(30, 40), new GfVec2d(10, 20))
    f.fitToSphere(new GfVec3d(), 1)
    f.window = new GfRange2d(new GfVec2d(), new GfVec2d())
    f.fitToSphere(new GfVec3d(), 1)
    f = new GfFrustum()
    f.projectionType = GfFrustum.Perspective
    f.window = new GfRange2d(new GfVec2d(-30, -40), new GfVec2d(10, 20))
    f.fitToSphere(new GfVec3d(), 1)
    expect(f).toBeInstanceOf(GfFrustum)
  })
})

describe('test_Transform', () => {
  it('scales near/far by the matrix; window flip handled', () => {
    const f = new GfFrustum()
    f.Transform(new GfMatrix4d(2))
    // nearFar == 2 * Gf.Frustum().nearFar  => (2, 20).
    const expected = new GfFrustum().nearFar.getMultiplied(2)
    expect(f.nearFar.equals(expected)).toBe(true)
    expect(f.nearFar.getMin()).toBe(G.transform_nearFar[0])
    expect(f.nearFar.getMax()).toBe(G.transform_nearFar[1])

    f.Transform(new GfMatrix4d(-2))
    f.window = new GfRange2d(new GfVec2d(1, 1), new GfVec2d(-1, -1))
    f.Transform(new GfMatrix4d(1))
    expect(f).toBeInstanceOf(GfFrustum)
  })
})

describe('test_SetRotate', () => {
  it('view direction and up vector after a rotation transform', () => {
    let f = new GfFrustum()
    expect(f.computeViewDirection().equals(new GfVec3d(0, 0, -1))).toBe(true)
    let m = new GfMatrix4d().setRotate(Rot([1, 1, 1], 30))
    expect(isClose(
      new GfFrustum().Transform(m).computeViewDirection(),
      vec3(G.setRotate_viewDir), 0.0001)).toBe(true)

    f = new GfFrustum()
    expect(f.computeUpVector().equals(new GfVec3d(0, 1, 0))).toBe(true)
    m = new GfMatrix4d().setRotate(Rot([1, 1, 1], 30))
    expect(isClose(
      new GfFrustum().Transform(m).computeUpVector(),
      vec3(G.setRotate_upVec), 0.0001)).toBe(true)
  })
})

describe('test_ComputeViewFrame', () => {
  it('default frame is the standard basis', () => {
    const f = new GfFrustum()
    const { side, up, view } = f.computeViewFrame()
    expect(side.equals(new GfVec3d(1, 0, 0))).toBe(true)
    expect(up.equals(new GfVec3d(0, 1, 0))).toBe(true)
    expect(view.equals(new GfVec3d(0, 0, -1))).toBe(true)
  })
})

describe('test_ComputeLookAtPoint', () => {
  it('look-at point for perspective and orthographic', () => {
    const f = new GfFrustum()
    expect(f.computeLookAtPoint().equals(new GfVec3d(0, 0, -5))).toBe(true)
    f.projectionType = GfFrustum.Orthographic
    expect(f.computeLookAtPoint().equals(new GfVec3d(0, 0, -5))).toBe(true)
  })
})

describe('test_ComputeViewInverse', () => {
  it('view matrix is the inverse rotation; inverse is the rotation', () => {
    const f = new GfFrustum()
    f.Transform(new GfMatrix4d().setRotate(Rot([1, 1, 1], 60)))

    let r1 = f.computeViewMatrix().multMatrixVec(new GfVec4d(1, 2, 3, 4)) as GfVec4d
    let r2 = new GfMatrix4d().setRotate(Rot([1, 1, 1], 60)).getInverse()
      .multMatrixVec(new GfVec4d(1, 2, 3, 4)) as GfVec4d
    expect(isClose(r1, r2, 0.0001)).toBe(true)

    r1 = f.computeViewInverse().multMatrixVec(new GfVec4d(1, 2, 3, 4)) as GfVec4d
    r2 = new GfMatrix4d().setRotate(Rot([1, 1, 1], 60))
      .multMatrixVec(new GfVec4d(1, 2, 3, 4)) as GfVec4d
    expect(isClose(r1, r2, 0.0001)).toBe(true)
  })
})

describe('test_ComputeProjectionMatrix', () => {
  it('runs for orthographic and perspective', () => {
    const f = new GfFrustum()
    f.projectionType = GfFrustum.Orthographic
    expect(f.computeProjectionMatrix()).toBeInstanceOf(GfMatrix4d)
    f.projectionType = GfFrustum.Perspective
    expect(f.computeProjectionMatrix()).toBeInstanceOf(GfMatrix4d)
  })
})

describe('test_ComputeAspectRatio', () => {
  it('aspect ratio + corners after a diagonal transform (perspective)', () => {
    const f = new GfFrustum().Transform(new GfMatrix4d(new GfVec4d(3, 2, 1, 1)))
    expect(f.computeAspectRatio()).toBe(1.5)
    const corners = f.computeCorners()
    expect(corners[0]!.equals(new GfVec3d(-3, -2, -1))).toBe(true)
    expect(corners[1]!.equals(new GfVec3d(3, -2, -1))).toBe(true)
    expect(corners[2]!.equals(new GfVec3d(-3, 2, -1))).toBe(true)
    expect(corners[3]!.equals(new GfVec3d(3, 2, -1))).toBe(true)
    expect(corners[4]!.equals(new GfVec3d(-30, -20, -10))).toBe(true)
    expect(corners[5]!.equals(new GfVec3d(30, -20, -10))).toBe(true)
    expect(corners[6]!.equals(new GfVec3d(-30, 20, -10))).toBe(true)
    expect(corners[7]!.equals(new GfVec3d(30, 20, -10))).toBe(true)
  })
})

describe('test_ComputeCorners', () => {
  it('orthographic corners after a diagonal transform', () => {
    const f = new GfFrustum()
    f.projectionType = GfFrustum.Orthographic
    f.Transform(new GfMatrix4d(new GfVec4d(3, 2, 1, 1)))
    const corners = f.computeCorners()
    expect(corners[0]!.equals(new GfVec3d(-3, -2, -1))).toBe(true)
    expect(corners[1]!.equals(new GfVec3d(3, -2, -1))).toBe(true)
    expect(corners[2]!.equals(new GfVec3d(-3, 2, -1))).toBe(true)
    expect(corners[3]!.equals(new GfVec3d(3, 2, -1))).toBe(true)
    expect(corners[4]!.equals(new GfVec3d(-3, -2, -10))).toBe(true)
    expect(corners[5]!.equals(new GfVec3d(3, -2, -10))).toBe(true)
    expect(corners[6]!.equals(new GfVec3d(-3, 2, -10))).toBe(true)
    expect(corners[7]!.equals(new GfVec3d(3, 2, -10))).toBe(true)
  })
})

describe('test_ComputeNarrowedFrustum', () => {
  it('narrowed windows for orthographic and perspective', () => {
    const f = new GfFrustum()
    f.projectionType = GfFrustum.Orthographic
    f.Transform(new GfMatrix4d(new GfVec4d(3, 2, 1, 1)))

    let narrowF = f.computeNarrowedFrustum(new GfVec2d(0, 0), new GfVec2d(0.1, 0.1))
    expect(close2(narrowF.window.getMin(), G.narrowed.ortho_v2_00[0])).toBe(true)
    expect(close2(narrowF.window.getMax(), G.narrowed.ortho_v2_00[1])).toBe(true)

    narrowF = f.computeNarrowedFrustum(new GfVec3d(0, 0, -1), new GfVec2d(0.1, 0.1))
    expect(close2(narrowF.window.getMin(), G.narrowed.ortho_v3_00m1[0])).toBe(true)
    expect(close2(narrowF.window.getMax(), G.narrowed.ortho_v3_00m1[1])).toBe(true)

    narrowF = f.computeNarrowedFrustum(new GfVec3d(0.1, 0.2, -5), new GfVec2d(0.1, 0.1))
    expect(close2(narrowF.window.getMin(), G.narrowed.ortho_v3_pt[0])).toBe(true)
    expect(close2(narrowF.window.getMax(), G.narrowed.ortho_v3_pt[1])).toBe(true)

    f.projectionType = GfFrustum.Perspective
    narrowF = f.computeNarrowedFrustum(new GfVec3d(0, 0, -1), new GfVec2d(0.1, 0.1))
    expect(close2(narrowF.window.getMin(), G.narrowed.persp_v3_00m1[0])).toBe(true)
    expect(close2(narrowF.window.getMax(), G.narrowed.persp_v3_00m1[1])).toBe(true)

    narrowF = f.computeNarrowedFrustum(new GfVec3d(0.1, 0.2, -5), new GfVec2d(0.1, 0.1))
    expect(close2(narrowF.window.getMin(), G.narrowed.persp_v3_pt[0])).toBe(true)
    expect(close2(narrowF.window.getMax(), G.narrowed.persp_v3_pt[1])).toBe(true)

    // A point behind the eye returns the same frustum's window.
    narrowF = f.computeNarrowedFrustum(new GfVec3d(0, 0, 1), new GfVec2d(0.1, 0.1))
    expect(close2(narrowF.window.getMin(), G.narrowed.persp_behind[0])).toBe(true)
    expect(close2(narrowF.window.getMax(), G.narrowed.persp_behind[1])).toBe(true)
  })
})

describe('test_ComputePickRay', () => {
  it('perspective and orthographic pick rays', () => {
    const f0 = new GfFrustum()
    f0.window = new GfRange2d(new GfVec2d(3, 3), new GfVec2d(4, 4))
    f0.computeNarrowedFrustum(new GfVec2d(3, 3), new GfVec2d(100, 100))

    let r = new GfFrustum().computePickRay(new GfVec2d(2, 2))
    expect(isClose(r.startPoint, vec3(G.pickRays.persp_win[0]), 0.00001)).toBe(true)
    expect(isClose(r.direction, vec3(G.pickRays.persp_win[1]), 0.00001)).toBe(true)

    const fo = new GfFrustum()
    fo.projectionType = GfFrustum.Orthographic
    r = fo.computePickRay(new GfVec2d(2, 2))
    expect(isClose(r.startPoint, vec3(G.pickRays.ortho_win[0]), 0.00001)).toBe(true)
    expect(isClose(r.direction, vec3(G.pickRays.ortho_win[1]), 0.00001)).toBe(true)

    r = new GfFrustum().computePickRay(new GfVec3d(0, 0, -2))
    expect(isClose(r.startPoint, vec3(G.pickRays.persp_world_axis[0]), 0.00001)).toBe(true)
    expect(isClose(r.direction, vec3(G.pickRays.persp_world_axis[1]), 0.00001)).toBe(true)

    r = new GfFrustum().computePickRay(new GfVec3d(2, 2, -1))
    expect(isClose(r.startPoint, vec3(G.pickRays.persp_world[0]), 0.00001)).toBe(true)
    expect(isClose(r.direction, vec3(G.pickRays.persp_world[1]), 0.00001)).toBe(true)

    const fo2 = new GfFrustum()
    fo2.projectionType = GfFrustum.Orthographic
    r = fo2.computePickRay(new GfVec3d(2, 2, -2))
    expect(isClose(r.startPoint, vec3(G.pickRays.ortho_world[0]), 0.00001)).toBe(true)
    expect(isClose(r.direction, vec3(G.pickRays.ortho_world[1]), 0.00001)).toBe(true)
  })
})

describe('test_EmptyFrustumIntersection', () => {
  it('point / bbox / segment / triangle edge cases', () => {
    expect(new GfFrustum().intersects(new GfBBox3d())).toBe(false)
    expect(new GfFrustum().intersects(
      new GfBBox3d(new GfRange3d(new GfVec3d(-1, -1, -1), new GfVec3d(1, 1, 1))))).toBe(true)
    expect(new GfFrustum().intersects(new GfVec3d(0, 0, -1))).toBe(true)
    expect(new GfFrustum().intersects(new GfVec3d(0, 0, 0))).toBe(false)

    // triangles
    expect(new GfFrustum().intersects(
      new GfVec3d(), new GfVec3d(1, 1, 1), new GfVec3d(0, 0, 1))).toBe(false)
    expect(new GfFrustum().intersects(
      new GfVec3d(), new GfVec3d(-1, -1, -1), new GfVec3d(0, 0, 1))).toBe(true)

    expect(new GfFrustum().intersects(
      new GfVec3d(0, 100, -100), new GfVec3d(-100, -100, 100), new GfVec3d(100, -100, 100))).toBe(false)
    expect(new GfFrustum().intersects(
      new GfVec3d(0, 10, 100), new GfVec3d(-100, -10, -10), new GfVec3d(100, -10, -10))).toBe(true)
    expect(new GfFrustum().intersects(
      new GfVec3d(0, 1, 1), new GfVec3d(50, 0, -50), new GfVec3d(-50, 0, -50))).toBe(true)

    expect(new GfFrustum().intersects(
      new GfVec3d(), new GfVec3d(-1, -1, -1), new GfVec3d(0, 0, 1))).toBe(true)

    // segments
    expect(new GfFrustum().intersects(new GfVec3d(0, 0, 0), new GfVec3d(1, 1, -1))).toBe(true)
    expect(new GfFrustum().intersects(new GfVec3d(-100, 0, -1), new GfVec3d(100, 0, -1))).toBe(true)
    expect(new GfFrustum().intersects(new GfVec3d(0, 100, -1), new GfVec3d(0, -100, -1))).toBe(true)
    expect(new GfFrustum().intersects(new GfVec3d(-100, 0, 1), new GfVec3d(100, 0, -1))).toBe(false)
    expect(new GfFrustum().intersects(new GfVec3d(0, 0, 0), new GfVec3d(1, 1, 1))).toBe(false)
  })
})

describe('test_Str', () => {
  it('non-empty string for both projection types', () => {
    const f = new GfFrustum()
    f.projectionType = GfFrustum.Perspective
    expect(f.toString().length).toBeGreaterThan(0)
    f.projectionType = GfFrustum.Orthographic
    expect(f.toString().length).toBeGreaterThan(0)
  })
})

describe('test_IntersectionViewVolume', () => {
  it('boxes in / out / enclosing a perspective view volume', () => {
    // A viewProjMat for a persp cam looking down the Y axis at the origin.
    const viewMat = new GfMatrix4d(
      1.0, 0.0, 0.0, 0.0,
      0.0, 0.0, -1.0, 0.0,
      0.0, 1.0, 0.0, 0.0,
      0.0, 0.0, -20, 1.0)
    const projMat = new GfMatrix4d(
      4.241894005673533, 0.0, 0.0, 0.0,
      0.0, 4.2418940586972074, 0.0, 0.0,
      0.0, 0.0, -1, -1.0,
      0.0, 0.0, -20, 0.0)
    const viewProjMat = viewMat.getMultiply(projMat)

    let b = new GfBBox3d(new GfRange3d(new GfVec3d(0, 0, 0), new GfVec3d(1, 1, 1)))
    expect(GfFrustum.intersectsViewVolume(b, viewProjMat)).toBe(true)

    b = new GfBBox3d(new GfRange3d(new GfVec3d(100, 0, 0), new GfVec3d(101, 1, 1)))
    expect(GfFrustum.intersectsViewVolume(b, viewProjMat)).toBe(false)

    b = new GfBBox3d(new GfRange3d(new GfVec3d(-1e9, -1e9, -1e9), new GfVec3d(1e9, 1e9, 1e9)))
    expect(GfFrustum.intersectsViewVolume(b, viewProjMat)).toBe(true)
  })
})

describe('test_Serialization', () => {
  it('reconstruction from the same parameters is equal', () => {
    const f = new GfFrustum(
      new GfVec3d(3, 4, 5), Rot([1, 2, 3], 40),
      new GfRange2d(new GfVec2d(-0.2, -0.3), new GfVec2d(0.2, 0.33)),
      new GfRange1d(10, 100),
      GfFrustum.Perspective,
      20)

    // eval(repr(f)) == f : reconstruct from the same params.
    const f2 = new GfFrustum(
      new GfVec3d(3, 4, 5), Rot([1, 2, 3], 40),
      new GfRange2d(new GfVec2d(-0.2, -0.3), new GfVec2d(0.2, 0.33)),
      new GfRange1d(10, 100),
      GfFrustum.Perspective,
      20)

    const f3 = new GfFrustum(
      new GfVec3d(3, 4, 5), Rot([1, 2, 3], 40),
      new GfRange2d(new GfVec2d(-0.2, -0.3), new GfVec2d(0.2, 0.33)),
      new GfRange1d(10, 100),
      GfFrustum.Perspective,
      20)

    expect(f.equals(f2)).toBe(true)
    expect(f.equals(f3)).toBe(true)
    expect(f.viewDistance).toBeCloseTo(20.0, 12)
    expect(f2.viewDistance).toBeCloseTo(20.0, 12)
  })
})

describe('test_ConstructFromMatrix', () => {
  it('corners + corners-at-distance from a camera matrix', () => {
    const m = new GfMatrix4d(
      0.9987016645043332, -0.035803686178599, -0.036236464677155, 0.0,
      0.0362364646771555, 0.999278702502407, 0.011357524061459, 0.0,
      0.0358036861785999, -0.012655859557126, 0.999278702502407, 0.0,
      3.0, -6.0, 5.0, 1.0)

    const f = new GfFrustum(
      m,
      new GfRange2d(new GfVec2d(-0.22, -0.2), new GfVec2d(0.2, 0.33)),
      new GfRange1d(20, 90),
      GfFrustum.Perspective)

    // Native goldens (== the inline literals in testGfFrustum.py).
    const results = G.fromMatrix_corners.map(vec3)

    const corners = f.computeCorners()
    expect(corners.length).toBe(results.length)
    for (let i = 0; i < results.length; i++) {
      expect(isClose(corners[i]!, results[i]!, 0.0001)).toBe(true)
    }

    let cad = f.computeCornersAtDistance(20)
    for (let i = 0; i < cad.length; i++) {
      expect(isClose(cad[i]!, results[i]!, 0.0001)).toBe(true)
    }

    cad = f.computeCornersAtDistance(90)
    for (let i = 0; i < cad.length; i++) {
      expect(isClose(cad[i]!, results[i + 4]!, 0.0001)).toBe(true)
    }

    cad = f.computeCornersAtDistance((20 + 90) / 2.0)
    for (let i = 0; i < cad.length; i++) {
      const mid = results[i]!.add(results[i + 4]!).getScaled(0.5) as GfVec3d
      expect(isClose(cad[i]!, mid, 0.0001)).toBe(true)
    }
  })
})

describe('test_Hash', () => {
  it('hash is stable and equal for copies', () => {
    const frustum = new GfFrustum(
      new GfVec3d(1.0, 2.0, 3.0),
      Rot([1.0, 0.0, 0.0], 90.0),
      new GfRange2d(new GfVec2d(-0.5, 0.5), new GfVec2d(-1.0, 1.0)),
      new GfRange1d(1.0, 1000.0),
      GfFrustum.Perspective,
      10.0)

    expect(frustum.hash()).toBe(frustum.hash())
    expect(frustum.hash()).toBe(new GfFrustum(frustum).hash())
  })
})

// Gf.IsClose for 2-component window points (compared as GfVec3d with z=0).
function close2(v: GfVec2d, expected: [number, number]): boolean {
  const d = v.data
  const dx = d[0]! - expected[0]
  const dy = d[1]! - expected[1]
  return dx * dx + dy * dy <= 0.0001 * 0.0001
}

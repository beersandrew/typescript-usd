// Ported from OpenUSD 26.11.1: pxr/base/gf/testenv/testGfRay.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// 1:1 port of OpenUSD pxr/base/gf/testenv/testGfRay.py.
//
// One describe() per upstream test method, every assert mirrored. The goldens
// are captured from the OpenUSD 26.11.1 build (FIXTURES.md) into
// fixtures/ray.json; the remaining expectations are upstream's own asserts —
// never hand-derived (AGENTS.md numeric-fixture rule).
//
// GfRay::Intersect(GfFrustum) is NOT exercised by testGfRay.py and GfFrustum is
// not yet ported, so the frustum overload is omitted from the port entirely.
import { describe, it, expect } from 'vitest'
import { GfVec3d } from '../../src/vec.ts'
import { GfMatrix4d } from '../../src/matrixData.ts'
import { GfPlane } from '../../src/plane.ts'
import { GfRange3d } from '../../src/range.ts'
import { GfBBox3d } from '../../src/bbox3d.ts'
import { GfLine } from '../../src/line.ts'
import { GfLineSeg } from '../../src/lineSeg.ts'
import { makeRotation, rotateInto } from '../../src/rotation.ts'
import { GfRay, GfFindClosestPoints } from '../../src/ray.ts'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'

// ---- goldens captured from the OpenUSD 26.11.1 build ----
type Vec3 = [number, number, number]
interface ClosestPoints {
  intersects: boolean
  rayPoint: Vec3
  linePoint: Vec3
  rayDistance: number
  lineDistance: number
}
interface TriangleHit {
  hit: boolean
  distance: number
  bary: Vec3
  frontFacing: boolean
}
interface PlaneHit {
  hit: boolean
  distance: number
  frontFacing: boolean
}
// [hit, enterDistance, exitDistance]
type RangeHit = [boolean, number, number]
interface RayFixture {
  transform_start: Vec3
  transform_dir: Vec3
  fcp_point: Vec3
  fcp_dist: number
  fcp_line1: ClosestPoints
  fcp_line2_intersects: boolean
  fcp_seg1: ClosestPoints & { closestRayPtToNearEnd: Vec3; rayDistToNearEnd: number }
  fcp_seg2_intersects: boolean
  tri1: TriangleHit
  tri2_hit: boolean
  tri3: TriangleHit
  tri_onsurface: PlaneHit
  plane1: PlaneHit
  plane2_hit: boolean
  plane3: PlaneHit
  box1: RangeHit
  box2: RangeHit
  box3: RangeHit
  box4: RangeHit
  box5: RangeHit
  box6: RangeHit
  box7: RangeHit
  box8: RangeHit
  box9: RangeHit
  obox: RangeHit
  sph1: RangeHit
  sph2: RangeHit
  sph3: RangeHit
  sph4: RangeHit
  sph5: RangeHit
  sph6: RangeHit
  sph7: RangeHit
  sph8: RangeHit
  sph8_negz: number
  str_ray: string
  repr_ray: string
}

const G = readOracleFixture<RayFixture>(new URL('./fixtures/ray.json', import.meta.url))

const epsilon = 1e-6

// Gf.IsClose(GfVec3d): squared distance <= tol^2 (componentwise tolerance).
const isCloseVec = (a: readonly number[], b: readonly number[], tol: number): boolean => {
  let s = 0
  for (let i = 0; i < a.length; i++) s += (a[i]! - b[i]!) ** 2
  return s <= tol * tol
}
const assertCloseVec = (a: GfVec3d, b: readonly number[], tol: number): void =>
  expect(isCloseVec(a.data, b, tol)).toBe(true)
// Gf.IsClose(scalar): |a-b| < eps.
const assertCloseScalar = (a: number, b: number, tol: number): void =>
  expect(Math.abs(a - b) < tol).toBe(true)

const V = (x = 0, y = 0, z = 0): GfVec3d => new GfVec3d(x, y, z)
const ZAxis = (): GfVec3d => GfVec3d.zAxis()
const XAxis = (): GfVec3d => GfVec3d.xAxis() as GfVec3d
const YAxis = (): GfVec3d => GfVec3d.yAxis() as GfVec3d

describe('GfRay', () => {
  it('test_Ray', () => {
    expect(new GfRay()).toBeInstanceOf(GfRay)
    expect(new GfRay(V(), V())).toBeInstanceOf(GfRay)
  })

  it('test_SetPointAndDirection', () => {
    const r = new GfRay()
    r.setPointAndDirection(V(1, 2, 3), V(2, 3, 4))
    expect(r.startPoint.equals(V(1, 2, 3))).toBe(true)
    expect(r.direction.equals(V(2, 3, 4))).toBe(true)
  })

  it('test_SetEnds', () => {
    const r = new GfRay()
    r.setEnds(V(3, 2, 1), V(4, 3, 2))
    expect(r.startPoint.equals(V(3, 2, 1))).toBe(true)
    expect(r.direction.equals(V(4, 3, 2).subtract(V(3, 2, 1)) as GfVec3d)).toBe(true)
    expect(r.getPoint(0).equals(V(3, 2, 1))).toBe(true)
    expect(r.getPoint(1).equals(V(4, 3, 2))).toBe(true)
    // Gf.Lerp(0.5, (3,2,1), (4,3,2)) == GetPoint(0.5)
    assertCloseVec(r.getPoint(0.5), [3.5, 2.5, 1.5], epsilon)
  })

  it('test_Properties', () => {
    const r = new GfRay()
    r.startPoint = V(1, 2, 3)
    expect(r.startPoint.equals(V(1, 2, 3))).toBe(true)
    r.direction = V(3, 2, 1)
    expect(r.direction.equals(V(3, 2, 1))).toBe(true)
  })

  it('test_Transform', () => {
    const r = new GfRay(V(1, 2, 3), V(2, 3, 4))
    r.Transform(new GfMatrix4d().setRotate(makeRotation([1, 0, 0], 30)))
    assertCloseVec(r.startPoint, G.transform_start, 0.00001)
    assertCloseVec(r.direction, G.transform_dir, 0.00001)
  })

  it('test_FindClosestPoint', () => {
    let r = new GfRay(V(), V(3, 4, 5))
    const { point: p, rayDistance: dist } = r.findClosestPoint(V(1, 1, 1))
    assertCloseVec(p, G.fcp_point, 0.00001)
    assertCloseScalar(dist, G.fcp_dist, 0.00001)

    // non-intersecting case
    r = new GfRay(V(), V(3, 4, 5))
    let l = new GfLine(V(1, 0, 0), V(3, 3, 3))
    let res = GfFindClosestPoints(r, l)
    expect(res.intersects).toBe(G.fcp_line1.intersects)
    expect(res.rayPoint.equals(V(...G.fcp_line1.rayPoint))).toBe(true)
    assertCloseVec(res.otherPoint, G.fcp_line1.linePoint, 0.00001)
    expect(res.rayDistance).toBe(G.fcp_line1.rayDistance)
    assertCloseScalar(res.otherDistance, G.fcp_line1.lineDistance, 0.00001)

    r = new GfRay(V(), V(3, 4, 5))
    l = new GfLine(V(1, 0, 0), V(3, 4, 5))
    res = GfFindClosestPoints(r, l)
    expect(res.intersects).toBe(G.fcp_line2_intersects)

    // closest point on this line segment to the ray is the near end (1,0,0)
    r = new GfRay(V(), V(3, 4, 5))
    let ls = new GfLineSeg(V(1, 0, 0), V(3, 3, 3))
    res = GfFindClosestPoints(r, ls)
    const near = r.findClosestPoint(V(1, 0, 0))
    expect(res.intersects).toBe(G.fcp_seg1.intersects)
    assertCloseVec(res.rayPoint, near.point.data, 0.00001)
    assertCloseVec(res.otherPoint, G.fcp_seg1.linePoint, 0.00001)
    assertCloseScalar(res.rayDistance, near.rayDistance, 0.00001)
    assertCloseScalar(res.otherDistance, G.fcp_seg1.lineDistance, 0.00001)

    r = new GfRay(V(), V(3, 4, 5))
    ls = new GfLineSeg(V(1, 0, 0), V(4, 4, 5))
    res = GfFindClosestPoints(r, ls)
    expect(res.intersects).toBe(G.fcp_seg2_intersects)
  })

  it('test_Equality', () => {
    const r = new GfRay()
    r.setPointAndDirection(V(1, 2, 3), V(2, 3, 4))
    expect(r.equals(new GfRay(V(1, 2, 3), V(2, 3, 4)))).toBe(true)
    expect(r.equals(new GfRay(V(1, 2, 3), V(4, 3, 2)))).toBe(false)
  })

  it('test_Intersect', () => {
    let r = new GfRay(V(), V(1, 1, 1))
    let hit = r.intersect(V(1, 0, 0), V(0, 1, 0), V(0, 0, 1))
    expect(hit.hit).toBe(G.tri1.hit)
    assertCloseScalar(hit.distance, G.tri1.distance, 0.00001)
    assertCloseVec(hit.barycentricCoords, G.tri1.bary, 0.00001)
    expect(hit.frontFacing).toBe(G.tri1.frontFacing)

    r = new GfRay(V(), V(1, 1, 1))
    hit = r.intersect(V(5, 0, 0), V(5, 5, 0), V(5, 0, 5))
    expect(hit.hit).toBe(G.tri2_hit)

    r = new GfRay(V(57.171, 91.9027, 6.53313), V(0.0386784, 0.682603, 0.696032))
    const p1 = V(38.1018, 62.1285, 70.9721)
    const p2 = V(66.1114, 30.6822, 38.1398)
    const p3 = V(72.8148, 83.26, 74.535)
    hit = r.intersect(p1, p2, p3)
    expect(hit.hit).toBe(G.tri3.hit)
    expect(hit.distance).toBe(G.tri3.distance)
    expect(hit.barycentricCoords.equals(V(...G.tri3.bary))).toBe(true)
    expect(hit.frontFacing).toBe(G.tri3.frontFacing)
  })

  it('test_IntersectNumericalPrecision', () => {
    // Tickle the numerics of triangle edge intersections. These may not
    // activate the fuzz handling on all architectures; we only assert no throw.
    const r = new GfRay(
      V(-3.4691279999999995454, -14.354708800000000934, 163.16137119999999072),
      V(1, 0, 0),
    )
    const p1 = V(4.0969199999999998951, -17.020839999999999748, 167.70099999999999341)
    const p2 = V(0.093717998399999835613, -13.818282001600001863, 163.69779799840000578)
    const p3 = V(4.0969199999999998951, -15.219400000000000261, 162.29667999999998074)
    expect(() => {
      r.intersect(p1, p2, p3)
      r.intersect(p3, p1, p2)
      r.intersect(p2, p3, p1)
    }).not.toThrow()
  })

  it('test_IntersectTriangle', () => {
    // Ray originates on surface of triangle, direction equal to triangle normal
    const r = new GfRay(V(0, 0, 0), ZAxis())
    const hit = r.intersect(V(0, 0, 0), V(1, 0, 0), V(0, 1, 0))
    expect(hit.hit).toBe(G.tri_onsurface.hit)
    assertCloseScalar(hit.distance, G.tri_onsurface.distance, 0.00001)
    expect(hit.frontFacing).toBe(G.tri_onsurface.frontFacing)
  })

  it('test_IntersectPlane', () => {
    let p = new GfPlane(V(1, 1, 1), 2)
    let r = new GfRay(V(), V(1, 1, 1))
    let hit = r.intersect(p)
    expect(hit.hit).toBe(G.plane1.hit)
    assertCloseScalar(hit.distance, G.plane1.distance, 0.00001)
    expect(hit.frontFacing).toBe(G.plane1.frontFacing)

    p = new GfPlane(V(1, 0, 0), 2)
    r = new GfRay(V(), V(0, 1, 0))
    hit = r.intersect(p)
    expect(hit.hit).toBe(G.plane2_hit)

    // Ray originates on surface of plane, direction equal to plane normal
    p = new GfPlane(ZAxis(), V(0, 0, 0))
    r = new GfRay(V(0, 0, 0), ZAxis())
    hit = r.intersect(p)
    expect(hit.hit).toBe(G.plane3.hit)
    assertCloseScalar(hit.distance, G.plane3.distance, 0.00001)
    expect(hit.frontFacing).toBe(G.plane3.frontFacing)
  })

  it('test_IntersectBox', () => {
    let box = new GfRange3d(V(1, 1, 1), V(2, 2, 2))
    let r = new GfRay(V(), V(1.5, 1.5, 2))
    let hit = r.intersect(box)
    expect(hit.hit).toBe(G.box1[0])
    assertCloseScalar(hit.enterDistance, G.box1[1], 0.00001)
    assertCloseScalar(hit.exitDistance, G.box1[2], 0.00001)

    box = new GfRange3d(V(1, 1, 1), V())
    r = new GfRay(V(), V(1.5, 1.5, 2))
    hit = r.intersect(box)
    expect(hit.hit).toBe(G.box2[0])

    box = new GfRange3d(V(), V(1, 1, 1))
    r = new GfRay(V(2, 2, 2), V(1, 0, 0))
    hit = r.intersect(box)
    expect(hit.hit).toBe(G.box3[0])

    box = new GfRange3d(V(), V(1, 1, 1))
    r = new GfRay(V(2, 0.5, 0.5), V(-1, 0, 0))
    hit = r.intersect(box)
    expect(hit.hit).toBe(G.box4[0])

    box = new GfRange3d(V(), V(1, 1, 1))
    r = new GfRay(V(0.5, 0.5, 0.5), V(1, 0, 0))
    hit = r.intersect(box)
    expect(hit.hit).toBe(G.box5[0])
    assertCloseScalar(hit.enterDistance, G.box5[1], 0.00001)
    assertCloseScalar(hit.exitDistance, G.box5[2], 0.00001)

    box = new GfRange3d(V(1, 1, 1), V(2, 2, 2))
    r = new GfRay(V(), V(5, 1, 1))
    hit = r.intersect(box)
    expect(hit.hit).toBe(G.box6[0])

    // Ray originates on surface of box
    box = new GfRange3d(V(), V(1, 1, 1))
    r = new GfRay(V(0.5, 0.5, 1), ZAxis())
    hit = r.intersect(box)
    expect(hit.hit).toBe(G.box7[0])
    assertCloseScalar(hit.enterDistance, G.box7[1], 0.00001)
    assertCloseScalar(hit.exitDistance, G.box7[2], 0.00001)

    // rays parallel to bboxes
    box = new GfRange3d(V(1, 1, 1), V(2, 2, 2))
    r = new GfRay(V(1.5, 0, 0), V(0, 1, 0))
    hit = r.intersect(box)
    expect(hit.hit).toBe(G.box8[0])
    r = new GfRay(V(1.5, 0, 1.5), V(0, 1, 0))
    hit = r.intersect(box)
    expect(hit.hit).toBe(G.box9[0])
  })

  it('test_IntersectOrientedBox', () => {
    // Rotate (1,0,0) to (1,1,1), and translate by (3,3,3)
    const xform = new GfMatrix4d(rotateInto([1, 0, 0], [1, 1, 1]), V(3, 3, 3))
    const box = new GfBBox3d(new GfRange3d(V(-1, -1, -1), V(1, 1, 1)), xform)
    const r = new GfRay(V(0, 0, 0), V(1, 1, 1))
    const hit = r.intersect(box)
    expect(hit.hit).toBe(G.obox[0])
    assertCloseScalar(hit.enterDistance, G.obox[1], 0.00001)
    assertCloseScalar(hit.exitDistance, G.obox[2], 0.00001)
  })

  it('test_IntersectSphere', () => {
    let center = V(0, 1, 0)
    let radius = 0.5
    let r = new GfRay(V(0, 0, 0), V(0, 1, 0)) // direct hit
    let hit = r.intersect(center, radius)
    expect(hit.hit).toBe(G.sph1[0])
    assertCloseScalar(hit.enterDistance, G.sph1[1], 0.00001)
    assertCloseScalar(hit.exitDistance, G.sph1[2], 0.00001)

    r = new GfRay(V(0, 1.5, 0), V(0, 1, 0)) // ray on surface of sphere
    hit = r.intersect(center, radius)
    expect(hit.hit).toBe(G.sph2[0])
    assertCloseScalar(hit.enterDistance, G.sph2[1], 0.00001)
    assertCloseScalar(hit.exitDistance, G.sph2[2], 0.00001)

    r = new GfRay(V(0, 2, 0), V(0, 1, 0)) // intersects behind start point
    hit = r.intersect(center, radius)
    expect(hit.hit).toBe(G.sph3[0])

    r = new GfRay(V(0, 1, 0), V(0, 1, 0)) // ray inside sphere
    hit = r.intersect(center, radius)
    expect(hit.hit).toBe(G.sph4[0])
    assertCloseScalar(hit.enterDistance, G.sph4[1], 0.00001)
    assertCloseScalar(hit.exitDistance, G.sph4[2], 0.00001)

    // Infinite ray: intersection beyond the magnitude of the direction vector
    r = new GfRay(V(0, 0, 0), V(0, 0.1, 0))
    hit = r.intersect(center, radius)
    expect(hit.hit).toBe(G.sph5[0])
    assertCloseScalar(hit.enterDistance, G.sph5[1], 0.00001)
    assertCloseScalar(hit.exitDistance, G.sph5[2], 0.00001)

    r = new GfRay(V(2, 0, 0), V(0, 1, 0)) // total miss
    hit = r.intersect(center, radius)
    expect(hit.hit).toBe(G.sph6[0])

    r = new GfRay(V(0.5, 0, 0), V(0, 1, 0)) // tangent
    hit = r.intersect(center, radius)
    expect(hit.hit).toBe(G.sph7[0])
    assertCloseScalar(hit.enterDistance, G.sph7[1], 0.00001)
    assertCloseScalar(hit.exitDistance, G.sph7[2], 0.00001)

    // Ray is tangential to sphere
    const z = -1.7695346483064331
    r = new GfRay(V(0.0, 1.0, z), ZAxis())
    center = V(0.0, 0.0, 0.0)
    radius = 1.0
    hit = r.intersect(center, radius)
    expect(hit.hit).toBe(G.sph8[0])
    assertCloseScalar(hit.enterDistance, G.sph8[1], epsilon)
    assertCloseScalar(hit.exitDistance, G.sph8[2], epsilon)
  })

  it('test_IntersectCylinder', () => {
    // Z-axis aligned cylinder
    let origin = V(0, 0, 0)
    const axis = ZAxis()
    const radius = 1

    // Ray inside cylinder, orthogonal to surface
    let ray = new GfRay(origin, XAxis())
    let hit = ray.intersect(origin, axis, radius)
    expect(hit.hit).toBe(true)
    assertCloseScalar(hit.enterDistance, -radius, epsilon)
    assertCloseScalar(hit.exitDistance, radius, epsilon)

    // orthogonal to surface (parametric distance)
    ray = new GfRay(origin, XAxis().getDivided(2.0) as GfVec3d)
    hit = ray.intersect(origin, axis, radius)
    expect(hit.hit).toBe(true)
    assertCloseScalar(hit.enterDistance, -2.0 * radius, epsilon)
    assertCloseScalar(hit.exitDistance, 2.0 * radius, epsilon)

    // orthogonal to surface (scaled axis)
    ray = new GfRay(origin, XAxis())
    hit = ray.intersect(origin, axis.getScaled(2.0) as GfVec3d, radius)
    expect(hit.hit).toBe(true)
    assertCloseScalar(hit.enterDistance, -radius, epsilon)
    assertCloseScalar(hit.exitDistance, radius, epsilon)

    // Ray behind cylinder, orthogonal to surface
    const x = radius * (1 + 0.5) // fixed value in (epsilon, 1] range
    const distance = x - radius
    ray = new GfRay(V(-x, 0, 0), XAxis())
    hit = ray.intersect(origin, axis, radius)
    expect(hit.hit).toBe(true)
    assertCloseScalar(hit.enterDistance, distance, epsilon)
    assertCloseScalar(hit.exitDistance, distance + 2.0 * radius, epsilon)

    // Ray in front of cylinder, orthogonal to surface
    ray = new GfRay(V(x, 0, 0), XAxis())
    hit = ray.intersect(origin, axis, radius)
    expect(hit.hit).toBe(false)

    // Ray inside cylinder, along z-axis
    ray = new GfRay(origin, ZAxis())
    hit = ray.intersect(origin, axis, radius)
    expect(hit.hit).toBe(false)

    // Ray inside cylinder, parallel to surface
    ray = new GfRay(V(radius / 2.0, 0, 0), ZAxis())
    hit = ray.intersect(origin, axis, radius)
    expect(hit.hit).toBe(false)

    // Ray on surface, parallel to surface
    ray = new GfRay(V(radius, 0, 0), ZAxis())
    hit = ray.intersect(origin, axis, radius)
    expect(hit.hit).toBe(false)

    // Ray outside cylinder, parallel to surface
    ray = new GfRay(V(x, 0, 0), ZAxis())
    hit = ray.intersect(origin, axis, radius)
    expect(hit.hit).toBe(false)

    // Ray behind cylinder, not orthogonal to surface
    const direction = V(1, 0, 1).GetNormalized() as GfVec3d
    ray = new GfRay(V(-x, 0, 0), direction)
    hit = ray.intersect(origin, axis, radius)
    expect(hit.hit).toBe(true)
    assertCloseScalar(hit.enterDistance, distance * Math.sqrt(2), epsilon)
    assertCloseScalar(hit.exitDistance, (distance + 2.0 * radius) * Math.sqrt(2), epsilon)

    // Non-uniform origin (fixed deterministic values in (epsilon, 1])
    origin = V(0.3, 0.7, 0.1)
    ray = new GfRay(origin, XAxis())
    hit = ray.intersect(origin, axis, radius)
    expect(hit.hit).toBe(true)
    assertCloseScalar(hit.enterDistance, -radius, epsilon)
    assertCloseScalar(hit.exitDistance, radius, epsilon)

    // Non-uniform radius
    const radius2 = 4.2
    origin = V(0, 0, 0)
    ray = new GfRay(origin, XAxis())
    hit = ray.intersect(origin, axis, radius2)
    expect(hit.hit).toBe(true)
    assertCloseScalar(hit.enterDistance, -radius2, epsilon)
    assertCloseScalar(hit.exitDistance, radius2, epsilon)

    // Rotated frame
    origin = V(0, 0, 0)
    const axis2 = V(1, 0, 1)
    ray = new GfRay(V(0, 0, 0), V(1, 0, -1).GetNormalized() as GfVec3d)
    hit = ray.intersect(origin, axis2, 1)
    expect(hit.hit).toBe(true)
    assertCloseScalar(hit.enterDistance, -1, epsilon)
    assertCloseScalar(hit.exitDistance, 1, epsilon)
  })

  it('test_IntersectCone', () => {
    // Z-axis aligned cone
    let origin = V(0, 0, 0)
    const axis = ZAxis()
    const radius = 1
    const x = radius * (1 + 0.5) // fixed value in (epsilon, 1] range

    const heights = [1, 2]
    for (const height of heights) {
      // Ray inside cone, orthogonal to axis
      let ray = new GfRay(origin, XAxis())
      let hit = ray.intersect(origin, axis, radius, height)
      expect(hit.hit).toBe(true)
      assertCloseScalar(hit.enterDistance, -radius, epsilon)
      assertCloseScalar(hit.exitDistance, radius, epsilon)

      // orthogonal to axis (parametric distance)
      ray = new GfRay(origin, XAxis().getDivided(2.0) as GfVec3d)
      hit = ray.intersect(origin, axis, radius, height)
      expect(hit.hit).toBe(true)
      assertCloseScalar(hit.enterDistance, -2.0 * radius, epsilon)
      assertCloseScalar(hit.exitDistance, 2.0 * radius, epsilon)

      // orthogonal to surface (scaled axis) — note: cylinder overload (3 args)
      ray = new GfRay(origin, XAxis())
      hit = ray.intersect(origin, axis.getScaled(2.0) as GfVec3d, radius)
      expect(hit.hit).toBe(true)
      assertCloseScalar(hit.enterDistance, -radius, epsilon)
      assertCloseScalar(hit.exitDistance, radius, epsilon)

      // Ray behind cone, orthogonal to axis
      let distance = x - radius
      ray = new GfRay(V(-x, 0, 0), XAxis())
      hit = ray.intersect(origin, axis, radius, height)
      expect(hit.hit).toBe(true)
      assertCloseScalar(hit.enterDistance, distance, epsilon)
      assertCloseScalar(hit.exitDistance, distance + 2.0 * radius, epsilon)

      // Ray in front of cone, orthogonal to axis
      ray = new GfRay(V(x, 0, 0), XAxis())
      hit = ray.intersect(origin, axis, radius, height)
      expect(hit.hit).toBe(false)

      // Ray inside cone, along z-axis
      ray = new GfRay(origin, ZAxis())
      hit = ray.intersect(origin, axis, radius, height)
      expect(hit.hit).toBe(true)
      assertCloseScalar(hit.enterDistance, height, epsilon)
      assertCloseScalar(hit.exitDistance, height, epsilon)

      // Ray above cone, along z-axis
      const zAbove = height * 5 // fixed value > 1 (was random.uniform(1+eps,10))
      ray = new GfRay(V(0, 0, zAbove), YAxis())
      hit = ray.intersect(origin, axis, radius, height)
      expect(hit.hit).toBe(false)

      // Ray inside cone, parallel to z-axis
      ray = new GfRay(V(radius / 2.0, 0, 0), ZAxis())
      distance = height / 2.0
      hit = ray.intersect(origin, axis, radius, height)
      expect(hit.hit).toBe(true)
      assertCloseScalar(hit.enterDistance, distance, epsilon)
      assertCloseScalar(hit.exitDistance, distance, epsilon)

      // Ray on surface, parallel to surface
      ray = new GfRay(V(radius, 0, 0), V(-radius, 0, height))
      hit = ray.intersect(origin, axis, radius, height)
      expect(hit.hit).toBe(false)
    }

    // Ray parallel to cone
    const height = 1
    const direction = V(1, 0, height / radius).GetNormalized() as GfVec3d

    // Ray inside and parallel to cone, a = 0 in quadratic
    let ray = new GfRay(origin, direction)
    let distance = Math.sqrt(radius ** 2 + height ** 2) / 2.0
    let hit = ray.intersect(origin, axis, radius, height)
    expect(hit.hit).toBe(true)
    assertCloseScalar(hit.enterDistance, distance, epsilon)
    assertCloseScalar(hit.exitDistance, distance, epsilon)

    // Ray outside and parallel to cone, a = 0 in quadratic
    ray = new GfRay(V(x, 0, 0), direction)
    hit = ray.intersect(origin, axis, radius, height)
    expect(hit.hit).toBe(false)

    // Ray parallel to cone, a = c = 0 in quadratic
    ray = new GfRay(V(radius, 0, 0), direction)
    hit = ray.intersect(origin, axis, radius, height)
    expect(hit.hit).toBe(true)
    assertCloseScalar(hit.enterDistance, 0.0, epsilon)
    assertCloseScalar(hit.exitDistance, 0.0, epsilon)

    // Ray parallel to cone, a = b = c = 0 in quadratic
    ray = new GfRay(V(-radius, 0, 0), direction)
    hit = ray.intersect(origin, axis, radius, height)
    expect(hit.hit).toBe(false)

    // Ray above cone, orthogonal to axis
    const zAbove = height * 5
    ray = new GfRay(V(0, 0, zAbove), XAxis())
    hit = ray.intersect(origin, axis, radius, height)
    expect(hit.hit).toBe(false)

    // Non-uniform origin (fixed deterministic values in (epsilon, 1])
    origin = V(0.3, 0.7, 0.1)
    ray = new GfRay(origin, XAxis())
    hit = ray.intersect(origin, axis, radius, height)
    expect(hit.hit).toBe(true)
    assertCloseScalar(hit.enterDistance, -radius, epsilon)
    assertCloseScalar(hit.exitDistance, radius, epsilon)

    // Non-uniform radius
    const radius2 = 4.2
    origin = V(0, 0, 0)
    ray = new GfRay(origin, XAxis())
    hit = ray.intersect(origin, axis, radius2, height)
    expect(hit.hit).toBe(true)
    assertCloseScalar(hit.enterDistance, -radius2, epsilon)
    assertCloseScalar(hit.exitDistance, radius2, epsilon)

    // Y-axis aligned cone
    origin = V(0, 0, 0)
    const yaxis = YAxis()
    ray = new GfRay(V(0, 0, 0), ZAxis())
    hit = ray.intersect(origin, yaxis, 1, height)
    expect(hit.hit).toBe(true)
    assertCloseScalar(hit.enterDistance, -1, epsilon)
    assertCloseScalar(hit.exitDistance, 1, epsilon)

    // Rotated frame
    origin = V(0, 0, 0)
    const axis2 = V(1, 0, 1)
    ray = new GfRay(V(0, 0, 0), V(1, 0, -1).GetNormalized() as GfVec3d)
    hit = ray.intersect(origin, axis2, 1)
    expect(hit.hit).toBe(true)
    assertCloseScalar(hit.enterDistance, -1, epsilon)
    assertCloseScalar(hit.exitDistance, 1, epsilon)
  })

  it('test_Str', () => {
    // Python tests eval(repr(r)) == r; here we test the TS equivalents:
    // toString() round-trips structurally and a default ray has a string form.
    const r = new GfRay(V(0.5, 0, 0), V(0, 1, 0))
    expect(r.toString()).toBe(G.str_ray)
    // structural round-trip of the (startPoint, direction) form
    const r2 = new GfRay(r.getStartPoint(), r.getDirection())
    expect(r.equals(r2)).toBe(true)
    expect(new GfRay().toString().length).toBeGreaterThan(0)
  })
})

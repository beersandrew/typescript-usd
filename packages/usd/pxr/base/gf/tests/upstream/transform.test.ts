// Ported from OpenUSD 26.11.1: pxr/base/gf/testenv/testGfTransform.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// 1:1 port of OpenUSD pxr/base/gf/testenv/testGfTransform.py.
//
// One describe() per upstream test method, every assert mirrored. Every numeric
// expectation not asserted literally by upstream is captured from the OpenUSD
// 26.11.1 build (FIXTURES.md) into fixtures/transform.json — never
// hand-derived (AGENTS.md numeric-fixture rule). Recapture it (FIXTURES.md)
// if upstream moves.
//
// API mapping (GfTransform's class API onto typescript-usd/gf):
//   Gf.Transform() / Set / SetMatrix / SetIdentity / GetMatrix  -> same names
//   t.translation/rotation/scale/pivotPosition/pivotOrientation -> get/set props
//   Gf.Rotation(axis, angle)                                    -> makeRotation
//   t1 == t2 / t1 != t2                                         -> .equals
//   t1 *= t2                                                    -> .MultiplyInPlace
//   t1 * t2                                                     -> GfTransform.Multiply
//   eval(repr(t)) == t                                          -> repr round-trip
import { describe, it, expect } from 'vitest'
import { GfTransform } from '../../src/transform.ts'
import { GfVec3d } from '../../src/vec.ts'
import { GfMatrix4d } from '../../src/matrixData.ts'
import {
  type Vec3,
  type Rotation,
  makeRotation,
  identityRotation,
  getNormalized3,
} from '../../src/rotation.ts'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'

interface TransformFixture {
  ctor_m: number[]
  ctor_tm: number[]
  setmatrix_rot_axis: number[]
  setmatrix_rot_angle: number
  axis111_norm: number[]
  set456_matrix: number[]
  mulassign_axis: number[]
  mulassign_angle: number
  mul_axis: number[]
  mul_angle: number
  scale011: number[]
}
// Captured from the OpenUSD 26.11.1 build (FIXTURES.md).
const G = readOracleFixture<TransformFixture>(new URL('./fixtures/transform.json', import.meta.url))

// Gf.IsClose for vectors/rows: squared distance <= tol^2 (componentwise).
const isCloseArr = (a: readonly number[], b: readonly number[], tol: number): boolean => {
  let s = 0
  for (let i = 0; i < a.length; i++) s += (a[i]! - b[i]!) ** 2
  return s <= tol * tol
}
const assertCloseArr = (a: readonly number[], b: readonly number[], tol: number): void =>
  expect(isCloseArr(a, b, tol)).toBe(true)

// eval(repr(t)) == t : the repr is reconstructable in the 3x constructor order
// (translation, rotation, scale, pivotPosition, pivotOrientation). Strip the
// Gf.* tokens (so the "3" in "Vec3d" can't leak in) then read the 17 numbers.
const evalRepr = (s: string): GfTransform => {
  const nums = s
    .replace(/Gf\.Vec3d|Gf\.Rotation|Gf\.Transform/g, '')
    .match(/-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/g)!
    .map((x) => parseFloat(x))
  const tr = new GfVec3d(nums[0]!, nums[1]!, nums[2]!)
  const rot = makeRotation([nums[3]!, nums[4]!, nums[5]!], nums[6]!)
  const sc = new GfVec3d(nums[7]!, nums[8]!, nums[9]!)
  const pp = new GfVec3d(nums[10]!, nums[11]!, nums[12]!)
  const po = makeRotation([nums[13]!, nums[14]!, nums[15]!], nums[16]!)
  return new GfTransform(tr, rot, sc, pp, po)
}
const assertReprRoundTrips = (t: GfTransform): void =>
  expect(evalRepr(t.repr()).equals(t)).toBe(true)

describe('test_Constructors', () => {
  it('default + all-component (3x) + GfMatrix4d constructors', () => {
    // assertIsInstance — each form yields a well-formed GfTransform.
    expect(new GfTransform() instanceof GfTransform).toBe(true)
    expect(
      new GfTransform(
        new GfVec3d(0, 0, 0),
        identityRotation(),
        new GfVec3d(0, 0, 0),
        new GfVec3d(0, 0, 0),
        identityRotation(),
      ) instanceof GfTransform,
    ).toBe(true)

    // GfMatrix4d constructor: rotation matrix should round-trip through GetMatrix.
    const rotation = makeRotation([0.5, 0.6, 0.7], 123)
    const m = new GfMatrix4d(1.0)
    m.setRotate(rotation)
    const t = new GfTransform(m)
    const tm = t.getMatrix()
    const tol = 0.001
    for (let i = 0; i < 4; i++) {
      assertCloseArr(tm.getRow(i).data, m.getRow(i).data, tol)
    }

    // Oracle-captured: m and tm, for extra confidence.
    const ctorM = G.ctor_m
    assertCloseArr(m.GetArray(), ctorM, 1e-9)
    assertCloseArr(tm.GetArray(), ctorM, tol)
  })
})

describe('test_Properties', () => {
  it('Set (3x form) populates the components', () => {
    const t = new GfTransform()
    t.Set(
      new GfVec3d(2, 3, 4),
      makeRotation([1, 0, 0], 90),
      new GfVec3d(1, 2, 3),
      new GfVec3d(0, 0, 0),
      makeRotation([1, 1, 1], 30),
    )
    expect(t.translation.equals(new GfVec3d(2, 3, 4))).toBe(true)
    expect(rotEqual(t.rotation, makeRotation([1, 0, 0], 90))).toBe(true)
    expect(t.scale.equals(new GfVec3d(1, 2, 3))).toBe(true)
    expect(t.pivotPosition.equals(new GfVec3d(0, 0, 0))).toBe(true)
    expect(rotEqual(t.pivotOrientation, makeRotation([1, 1, 1], 30))).toBe(true)
    assertReprRoundTrips(t)
  })

  it('SetMatrix factors a pure rotation; identity round-trips', () => {
    let t = new GfTransform()
    assertReprRoundTrips(t)

    t.setMatrix(new GfMatrix4d().setRotate(makeRotation([1, 1, 1], 30)))
    // Oracle-captured axis/angle.
    assertCloseArr(t.rotation.axis, getNormalized3([1, 1, 1]), 0.0001)
    expect(Math.abs(t.rotation.angle - 30)).toBeLessThanOrEqual(0.0001)
    assertReprRoundTrips(t)

    // SetMatrix(identity).GetMatrix() == identity
    expect(t.setMatrix(new GfMatrix4d(1)).getMatrix().equals(new GfMatrix4d(1))).toBe(true)

    // Set (3x) then GetMatrix matches the oracle.
    t = new GfTransform()
    t.Set(
      new GfVec3d(4, 5, 6),
      makeRotation([1, 0, 0], 90),
      new GfVec3d(1, 2, 3),
      new GfVec3d(2, 3, 4),
      makeRotation([1, 1, 1], 30),
    )
    assertReprRoundTrips(t)
    const set456 = G.set456_matrix
    assertCloseArr(t.getMatrix().GetArray(), set456, 1e-9)
  })

  it('SetIdentity + property setters', () => {
    const t = new GfTransform()
    t.setIdentity()
    assertReprRoundTrips(t)
    expect(t.getMatrix().equals(new GfMatrix4d(1))).toBe(true)

    t.scale = new GfVec3d(1, 2, 3)
    assertReprRoundTrips(t)
    expect(t.scale.equals(new GfVec3d(1, 2, 3))).toBe(true)

    t.pivotOrientation = makeRotation(GfVec3d.xAxis().data as Vec3, 30)
    assertReprRoundTrips(t)
    expect(rotEqual(t.pivotOrientation, makeRotation(GfVec3d.xAxis().data as Vec3, 30))).toBe(true)

    t.pivotPosition = new GfVec3d(3, 2, 1)
    assertReprRoundTrips(t)
    expect(t.pivotPosition.equals(new GfVec3d(3, 2, 1))).toBe(true)

    t.translation = new GfVec3d(3, 4, 5)
    assertReprRoundTrips(t)
    expect(t.translation.equals(new GfVec3d(3, 4, 5))).toBe(true)

    t.rotation = makeRotation(GfVec3d.yAxis().data as Vec3, 60)
    assertReprRoundTrips(t)
    expect(rotEqual(t.rotation, makeRotation(GfVec3d.yAxis().data as Vec3, 60))).toBe(true)

    expect(new GfTransform().toString().length).toBeGreaterThan(0)
  })
})

describe('test_Methods', () => {
  it('equality / inequality', () => {
    const t1 = new GfTransform()
    const t2 = new GfTransform()
    t1.setMatrix(new GfMatrix4d().setRotate(makeRotation([1, 1, 1], 60)))
    t2.setMatrix(new GfMatrix4d().setRotate(makeRotation([1, 1, 1], 60)))
    assertReprRoundTrips(t1)
    expect(t1.equals(t2)).toBe(true)

    t2.setMatrix(new GfMatrix4d().setRotate(makeRotation(GfVec3d.zAxis().data as Vec3, 60)))
    expect(t1.equals(t2)).toBe(false)
  })

  it('*= (MultiplyInPlace)', () => {
    const t1 = new GfTransform()
    const t2 = new GfTransform()
    t1.setMatrix(new GfMatrix4d().setRotate(makeRotation([1, 1, 1], 60)))
    t2.rotation = makeRotation(GfVec3d.yAxis().data as Vec3, 60)
    t1.multiplyInPlace(t2)
    assertReprRoundTrips(t1)
    assertCloseArr(t1.rotation.axis, [0.495572, 0.858356, 0.132788], 0.0001)
    expect(Math.abs(t1.rotation.angle - 105.447)).toBeLessThanOrEqual(0.0001)
  })

  it('binary * (Multiply)', () => {
    const t1 = new GfTransform()
    const t2 = new GfTransform()
    t1.setMatrix(new GfMatrix4d().setRotate(makeRotation([1, 1, 1], 60)))
    t2.rotation = makeRotation(GfVec3d.yAxis().data as Vec3, 60)
    const t3 = GfTransform.multiply(t1, t2)
    assertReprRoundTrips(t3)
    assertCloseArr(t3.rotation.axis, [0.495572, 0.858356, 0.132788], 0.0001)
    expect(Math.abs(t3.rotation.angle - 105.447)).toBeLessThanOrEqual(0.0001)
  })

  it('SetMatrix with a zero scale axis', () => {
    const t1 = new GfTransform()
    const m = new GfMatrix4d().setScale(new GfVec3d(0, 1, 1))
    t1.setMatrix(m)
    assertCloseArr(t1.scale.data, [0.0, 1, 1], 1e-4)
  })
})

// GfRotation exact equality (axis + angle), mirroring rotationEqual.
function rotEqual(a: Rotation, b: Rotation): boolean {
  return (
    a.axis[0] === b.axis[0] &&
    a.axis[1] === b.axis[1] &&
    a.axis[2] === b.axis[2] &&
    a.angle === b.angle
  )
}

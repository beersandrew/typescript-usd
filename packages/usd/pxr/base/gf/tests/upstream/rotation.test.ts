// Ported from OpenUSD 26.11.1: pxr/base/gf/testenv/testGfRotation.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// 1:1 port of OpenUSD pxr/base/gf/testenv/testGfRotation.py.
//
// One describe() per upstream test method, every assert mirrored. This file is
// the CONFORMANCE oracle for the "Rotation" capability: its green/red result IS the
// capability's status (not curation). Every
// expected value is captured from the OpenUSD 26.11.1 build
// (FIXTURES.md) into fixtures/rotation.json — never hand-derived
// (AGENTS.md numeric-fixture rule).
//
// Mapping of GfRotation's class API onto typescript-usd/gf's functional surface:
//   Gf.Rotation(axis, angle) / SetAxisAngle  -> makeRotation
//   Gf.Rotation().SetIdentity()              -> identityRotation
//   r.GetQuat() / SetQuat / GetQuaternion    -> rotationToQuat / quatToRotation
//   r.SetRotateInto(a, b)                    -> rotateInto
//   r.GetInverse()                           -> rotationInverse
//   r1 * r2 (operator*)                      -> composeRotations(r1, r2)
//   r * scale / scale * r                    -> scaleRotationAngle
//   r / scale                                -> divideRotationAngle
//   r.TransformDir(v)                        -> transformDir
//   r.Decompose(a0, a1, a2)                  -> decomposeRotation
//   Gf.Rotation.RotateOntoProjected(...)     -> rotateOntoProjected
//   operator== / repr / str / hash           -> rotationEqual / rotationRepr /
//                                               rotationStr / rotationHash
import { describe, it, expect } from 'vitest'
import {
  type Vec3,
  type Quat,
  type Rotation,
  makeRotation,
  identityRotation,
  rotationToQuat,
  quatToRotation,
  rotateInto,
  rotationInverse,
  scaleRotationAngle,
  divideRotationAngle,
  rotationEqual,
  rotationStr,
  rotationRepr,
  rotationHash,
  rotateOntoProjected,
  composeRotations,
  transformDir,
  decomposeRotation,
  rotationToMatrix,
  matrixTransformDir,
  extractRotation,
} from '../../src/index.ts'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'

type RotationValue = { axis: Vec3; angle: number }
interface RotationFixture {
  constructors: {
    setAxisAngle: RotationValue
    setAxisAngle_repr: string
    quat_real: number
    quat_imag: Vec3
    setQuaternion: RotationValue
    getQuaternion_real: number
    getQuaternion_imag: Vec3
    rotInto_xy: RotationValue
    rotInto_same: RotationValue
    identity: RotationValue
    rotInto_opp: RotationValue
    setIdentity: RotationValue
    axisSetterNormalizes: RotationValue
    expected_norm_123: Vec3
    inv_in: RotationValue
    inv_out: RotationValue
  }
  decompose: Record<'d_111_30_xyz' | 'd_100_30_xyz' | 'd_100_30_zxy' | 'd_100_30_yzx' | 'd_numerical', Vec3>
  transformDir: { dirf: Vec3; dirf_mat: Vec3; dird: Vec3; dird_mat: Vec3; str: string }
  operators: Record<'degenerate' | 'imul_rot' | 'imul_scale' | 'idiv_scale' | 'mul_rot' | 'mul_scale'
    | 'rmul_scale' | 'div_scale' | 'noncomm_r3' | 'noncomm_r4' | 'assoc_left' | 'assoc_right'
    | 'extractRot', RotationValue>
  rotateOntoProjected: { axis_norm: Vec3 } & Record<'c1' | 'c2' | 'c3' | 'c4' | 'c5' | 'c6', RotationValue>
  hash: { copy_equal: RotationValue }
}
const G = readOracleFixture<RotationFixture>(new URL('./fixtures/rotation.json', import.meta.url))
const GC = G.constructors, GD = G.decompose, GO = G.operators, GP = G.rotateOntoProjected

// GfIsClose(GfVec3d): squared distance <= tol^2 (componentwise tolerance check).
const isCloseVec = (a: readonly number[], b: readonly number[], tol: number): boolean => {
  let s = 0
  for (let i = 0; i < a.length; i++) s += (a[i]! - b[i]!) ** 2
  return s <= tol * tol
}
const assertCloseVec = (a: readonly number[], b: readonly number[], tol: number): void =>
  expect(isCloseVec(a, b, tol)).toBe(true)

// eval(repr(r)) == r : repr round-trips through the constructor (makeRotation).
const evalRepr = (s: string): Rotation => {
  const m = s.match(
    /Gf\.Rotation\(Gf\.Vec3d\(([^,]+),\s*([^,]+),\s*([^)]+)\),\s*([^)]+)\)/,
  )!
  return makeRotation(
    [parseFloat(m[1]!), parseFloat(m[2]!), parseFloat(m[3]!)],
    parseFloat(m[4]!),
  )
}
const assertReprRoundTrips = (r: Rotation): void =>
  expect(rotationEqual(evalRepr(rotationRepr(r)), r)).toBe(true)

const X: Vec3 = [1, 0, 0], Y: Vec3 = [0, 1, 0], Z: Vec3 = [0, 0, 1]

describe('test_Constructors', () => {
  it('constructs valid rotations from the supported argument forms', () => {
    // assertIsInstance(...) — each form yields a well-formed {axis, angle}.
    for (const r of [
      identityRotation(),                  // Gf.Rotation()
      makeRotation([0, 0, 0], 0),          // Gf.Rotation(Gf.Vec3d(), 0)
      quatToRotation([1, 0, 0, 0]),        // Gf.Rotation(Gf.Quaternion())
      rotateInto([0, 0, 0], [0, 0, 0]),    // Gf.Rotation(Gf.Vec3d(), Gf.Vec3d())
    ]) {
      expect(r.axis.length).toBe(3)
      expect(typeof r.angle).toBe('number')
    }
  })

  it('SetAxisAngle', () => {
    const r = makeRotation([0, 1, 0], 30)
    assertReprRoundTrips(r)
    expect(r.axis).toEqual(GC.setAxisAngle.axis)
    expect(r.angle).toBe(GC.setAxisAngle.angle)
  })

  it('SetQuaternion → axis/angle', () => {
    // q = Gf.Quaternion(1, Gf.Vec3d(1,0,0)).GetNormalized()  (w,x,y,z)
    const q: Quat = [GC.quat_real, ...GC.quat_imag]
    const r = quatToRotation(q)
    assertReprRoundTrips(r)
    assertCloseVec(r.axis, GC.setQuaternion.axis, 0.00001)
    expect(Math.abs(r.angle - GC.setQuaternion.angle)).toBeLessThanOrEqual(0.00001)
  })

  it('SetRotateInto', () => {
    let r = rotateInto([1, 0, 0], [0, 1, 0])
    assertReprRoundTrips(r)
    expect(r.axis).toEqual(GC.rotInto_xy.axis)
    expect(r.angle).toBe(GC.rotInto_xy.angle)

    r = rotateInto([1, 0, 0], [1, 0, 0])
    assertReprRoundTrips(r)
    expect(rotationEqual(r, identityRotation())).toBe(true)

    r = rotateInto([1, 0, 0], [-1, 0, 0])
    assertReprRoundTrips(r)
    expect(r.axis).toEqual(GC.rotInto_opp.axis)
    expect(r.angle).toBe(GC.rotInto_opp.angle)
  })

  it('SetIdentity', () => {
    const r = identityRotation()
    assertReprRoundTrips(r)
    expect(r.axis).toEqual(GC.setIdentity.axis)
    expect(r.angle).toBe(GC.setIdentity.angle)
  })

  it('axis setter normalizes; angle setter is raw', () => {
    // r.axis = Gf.Vec3d(1,2,3); r.angle = 720
    const r = makeRotation([1, 2, 3], 720)
    assertReprRoundTrips(r)
    expect(r.axis).toEqual(GC.expected_norm_123)
    expect(r.angle).toBe(GC.axisSetterNormalizes.angle)
  })

  it('GetQuaternion round-trips SetQuaternion', () => {
    const q: Quat = [GC.quat_real, ...GC.quat_imag]
    const r = quatToRotation(q)
    assertReprRoundTrips(r)
    const qq = rotationToQuat(r)
    expect(Math.abs(q[0] - qq[0])).toBeLessThanOrEqual(0.00001)        // real
    assertCloseVec([q[1], q[2], q[3]], [qq[1], qq[2], qq[3]], 0.00001) // imaginary
  })

  it('GetInverse', () => {
    const r = makeRotation([0, 1, 0], 720)
    assertReprRoundTrips(r)
    expect(rotationEqual(rotationInverse(r), makeRotation(GC.inv_out.axis, GC.inv_out.angle))).toBe(true)
  })
})

describe('test_Decompose', () => {
  it('R(1,1,1; 30) about X,Y,Z', () => {
    const r = makeRotation([1, 1, 1], 30)
    assertReprRoundTrips(r)
    // Degenerate (all-X) decompose is exercised for coverage; no assert on it.
    decomposeRotation(r, X, X, X)
    const euler = decomposeRotation(r, X, Y, Z)
    assertCloseVec(euler, GD.d_111_30_xyz, 0.0001)
  })

  it('R(1,0,0; 30) about permuted orthogonal axes', () => {
    const r = makeRotation([1, 0, 0], 30)
    assertCloseVec(decomposeRotation(r, X, Y, Z), GD.d_100_30_xyz, 0.0001)
    assertCloseVec(decomposeRotation(r, Z, X, Y), GD.d_100_30_zxy, 0.0001)
    assertCloseVec(decomposeRotation(r, Y, Z, X), GD.d_100_30_yzx, 0.0001)
  })

  it('numerical-edge case R(Y; 90)', () => {
    const v1: Vec3 = [1, 0, 0], v2: Vec3 = [0, 1, 0], v3: Vec3 = [0, 0, 1]
    const r = makeRotation(v2, 90)
    const result = decomposeRotation(r, v1, v2, v3)
    assertCloseVec(result, GD.d_numerical, 0.00001)
  })
})

describe('test_TransformDir', () => {
  it('matches Matrix4d().SetRotate(r).TransformDir for Vec3f and Vec3d inputs', () => {
    const r = makeRotation([1, 1, 1], 30)
    const dirf: Vec3 = [3, 4, 5]
    const dird: Vec3 = [5, 4, 3]

    expect(transformDir(r, dirf)).toEqual(matrixTransformDir(rotationToMatrix(r), dirf))
    expect(transformDir(r, dird)).toEqual(matrixTransformDir(rotationToMatrix(r), dird))

    // Oracle-captured values (extra confidence beyond the path-equality check).
    assertCloseVec(transformDir(r, dirf), G.transformDir.dirf, 1e-9)
    assertCloseVec(transformDir(r, dird), G.transformDir.dird, 1e-9)

    assertReprRoundTrips(r)
    expect(rotationStr(r).length).toBeGreaterThan(0)
  })
})

describe('test_Operators', () => {
  const assertRotationIsClose = (r1: Rotation, r2: Rotation, epsilon = 1e-15): void => {
    assertCloseVec(r1.axis, r2.axis, epsilon)
    expect(r1.angle).toBeCloseTo(r2.angle, 7)
  }

  it('equality / inequality', () => {
    const r1 = makeRotation([1, 1, 1], 30)
    const r2 = makeRotation([1, 1, 1], 30)
    const r3 = makeRotation([1, 0, 0], 60)
    for (const r of [r1, r2, r3]) assertReprRoundTrips(r)
    expect(rotationEqual(r1, r2)).toBe(true)
    expect(rotationEqual(r1, r3)).toBe(false)
  })

  it('*= rotation, *= scale, /= scale', () => {
    // coverage: degenerate self-compose
    let d = makeRotation([0, 0, 0], 0)
    d = composeRotations(d, d)
    expect(d.angle).toBe(GO.degenerate.angle)

    let r1 = makeRotation([1, 1, 1], 30)
    const r2 = makeRotation([1, 1, 1], 60)
    r1 = composeRotations(r1, r2)
    assertCloseVec(r1.axis, GO.imul_rot.axis, 0.00001)
    expect(Math.abs(r1.angle - GO.imul_rot.angle)).toBeLessThanOrEqual(0.00001)
    r1 = scaleRotationAngle(r1, 10)
    assertCloseVec(r1.axis, GO.imul_scale.axis, 0.00001)
    expect(Math.abs(r1.angle - GO.imul_scale.angle)).toBeLessThanOrEqual(0.00001)
    r1 = divideRotationAngle(r1, 10)
    assertCloseVec(r1.axis, GO.idiv_scale.axis, 0.00001)
    expect(Math.abs(r1.angle - GO.idiv_scale.angle)).toBeLessThanOrEqual(0.00001)
  })

  it('binary * (compose), * scale, scale *, / scale', () => {
    const r1 = makeRotation([1, 1, 1], 30)
    const r2 = makeRotation([1, 1, 1], 60)

    let tmp = composeRotations(r1, r2)
    assertCloseVec(tmp.axis, GO.mul_rot.axis, 0.00001)
    expect(Math.abs(tmp.angle - GO.mul_rot.angle)).toBeLessThanOrEqual(0.00001)

    tmp = scaleRotationAngle(r1, 10)
    assertCloseVec(tmp.axis, GO.mul_scale.axis, 0.00001)
    expect(Math.abs(tmp.angle - GO.mul_scale.angle)).toBeLessThanOrEqual(0.00001)

    tmp = scaleRotationAngle(r1, 10) // 10 * r1
    assertCloseVec(tmp.axis, GO.rmul_scale.axis, 0.00001)
    expect(Math.abs(tmp.angle - GO.rmul_scale.angle)).toBeLessThanOrEqual(0.00001)

    tmp = divideRotationAngle(r1, 10)
    assertCloseVec(tmp.axis, GO.div_scale.axis, 0.00001)
    expect(Math.abs(tmp.angle - GO.div_scale.angle)).toBeLessThanOrEqual(0.00001)
  })

  it('non-commutativity', () => {
    const r1 = makeRotation([1, 0, 0], 45)
    const r2 = makeRotation([0, 1, 0], 45)
    const r3 = composeRotations(r1, r2)
    const r4 = composeRotations(r2, r1)
    expect(r3.axis[0]).toBe(r4.axis[0])
    expect(r3.axis[1]).toBe(r4.axis[1])
    expect(r3.axis[2]).toBe(-r4.axis[2])
    expect(r3.angle).toBe(r4.angle)
  })

  it('associativity', () => {
    const r1 = makeRotation([1, 0, 0], 45)
    const r2 = makeRotation([0, 1, 0], 45)
    const r6 = makeRotation([0, 0, 1], 45)
    assertRotationIsClose(
      composeRotations(composeRotations(r1, r2), r6),
      composeRotations(r1, composeRotations(r2, r6)),
    )
  })

  it('quaternion-set repr round-trip via ExtractRotation', () => {
    const m = rotationToMatrix(makeRotation([1, 1, 1], 30))
    const r = extractRotation(m)
    assertReprRoundTrips(r)
  })
})

describe('test_RotateOntoProjected', () => {
  const axis: Vec3 = [1, 2, 3]

  it('projected-equal vectors → zero angle', () => {
    let rot = rotateOntoProjected([1, 2, 3], [1, 0, 0], axis)
    expect(rot.angle).toBe(GP.c1.angle)
    expect(rot.axis).toEqual(GP.c1.axis)

    rot = rotateOntoProjected([1, 0, 0], [1, 2, 3], axis)
    expect(rot.angle).toBe(GP.c2.angle)
    expect(rot.axis).toEqual(GP.c2.axis)
  })

  it('signed angle about the axis (case A)', () => {
    const v1: Vec3 = [-2, 5, -7], v2: Vec3 = [1, 9, -5]
    let rot = rotateOntoProjected(v2, v1, axis)
    assertCloseVec([rot.angle], [GP.c3.angle], 0.00001)
    expect(rot.axis).toEqual(GP.c3.axis)

    rot = rotateOntoProjected(v1, v2, axis)
    assertCloseVec([rot.angle], [GP.c4.angle], 0.00001)
    expect(rot.axis).toEqual(GP.c4.axis)
  })

  it('signed angle about the axis (case B)', () => {
    const v1: Vec3 = [3, -8, -6], v2: Vec3 = [10, -2, 7]
    let rot = rotateOntoProjected(v2, v1, axis)
    assertCloseVec([rot.angle], [GP.c5.angle], 0.00001)
    expect(rot.axis).toEqual(GP.c5.axis)

    rot = rotateOntoProjected(v1, v2, axis)
    assertCloseVec([rot.angle], [GP.c6.angle], 0.00001)
    expect(rot.axis).toEqual(GP.c6.axis)
  })
})

describe('test_Hash', () => {
  it('hash is consistent and equal for equal rotations', () => {
    const rot = makeRotation([1, 0, 0], 40)
    expect(rotationHash(rot)).toBe(rotationHash(rot))
    // hash(rot) == hash(Gf.Rotation(rot))  — a structural copy
    const copy: Rotation = { axis: [...rot.axis] as Vec3, angle: rot.angle }
    expect(rotationHash(rot)).toBe(rotationHash(copy))
  })
})

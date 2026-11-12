// Ported from OpenUSD 26.11.1: pxr/base/gf/testenv/testGfRotation.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// GfMatrix4d rotation/decomposition surface (the matrix-side capability).
// Split out of the GfRotation 1:1 port so rotation.test.ts can mirror
// testGfRotation.py exactly while these GfMatrix4d checks (SetRotate output,
// Extract*, SetLookAt, Factor, Orthonormalize) keep backing the "Matrix"
// capability. Every expected value was captured from the Pixar OpenUSD build
// (the v26.05 reference build, pxr.Gf, python 3.9.21) — never hand-derived.
import { describe, it, expect } from 'vitest'
import {
  type Matrix4,
  type Vec3,
  type Quat,
  makeRotation,
  rotationToMatrix,
  extractRotation,
  extractRotationQuat,
  setLookAt,
  factorMatrix,
  orthonormalizeMatrix,
} from '../../src/index.ts'

const TOL = 1e-12

const closeArr = (a: readonly number[], b: readonly number[], tol = TOL): void => {
  expect(a.length).toBe(b.length)
  for (let i = 0; i < a.length; i++) expect(a[i]!).toBeCloseTo(b[i]!, -Math.log10(tol))
}

describe('GfMatrix4d::SetRotate(GfRotation)', () => {
  it('Rz(90)', () => {
    closeArr(rotationToMatrix(makeRotation([0, 0, 1], 90)), [
      2.220446049250313e-16, 1, 0, 0, -1, 2.220446049250313e-16, 0, 0,
      0, 0, 1, 0, 0, 0, 0, 1,
    ], 1e-12)
  })
  it('R(1,2,3; 35)', () => {
    closeArr(rotationToMatrix(makeRotation([1, 2, 3], 35)), [
      0.8320697554112066, 0.4857196743770794, -0.26783636805512184, 0,
      -0.4340488298882199, 0.8708228887778513, 0.23080101744417247, 0,
      0.34534263478841104, -0.07578848397759398, 0.9354114443889257, 0,
      0, 0, 0, 1,
    ], 1e-12)
  })
})

describe('GfMatrix4d::ExtractRotation / ExtractRotationQuat (round-trip)', () => {
  const cases: [Vec3, number, Quat][] = [
    [[0, 0, 1], 90, [0.7071067811865476, 0, 0, 0.7071067811865475]],
    [[1, 2, 3], 35, [0.9537169507482269, 0.08036700542578053, 0.16073401085156105,
      0.24110101627734157]],
    [[1, 0, 0], 179, [0.008726535498373897, 0.9999619230641713, 0, 0]],
  ]
  for (const [axis, angle, quat] of cases) {
    it(`axis ${axis} angle ${angle}`, () => {
      const m = rotationToMatrix(makeRotation(axis, angle))
      closeArr(extractRotationQuat(m), quat, 1e-9)
      const er = extractRotation(m)
      closeArr(er.axis, makeRotation(axis, angle).axis, 1e-9)
      expect(er.angle).toBeCloseTo(angle, 9)
    })
  }
})

describe('GfMatrix4d::SetLookAt', () => {
  it('eye +Z looking at origin, up +Y → identity rotation + translate', () => {
    closeArr(setLookAt([0, 0, 10], [0, 0, 0], [0, 1, 0]), [
      1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -10, 1,
    ], 1e-12)
  })
  it('eye (5,5,5)', () => {
    closeArr(setLookAt([5, 5, 5], [0, 0, 0], [0, 1, 0]), [
      0.7071067811865475, -0.40824829046386296, 0.5773502691896257, 0,
      0, 0.8164965809277259, 0.5773502691896257, 0,
      -0.7071067811865475, -0.40824829046386296, 0.5773502691896257, 0,
      0, 0, -8.660254037844386, 1,
    ], 1e-12)
  })
  it('eye (1,2,3) center (4,5,6) up +Z', () => {
    closeArr(setLookAt([1, 2, 3], [4, 5, 6], [0, 0, 1]), [
      0.7071067811865475, -0.40824829046386296, -0.5773502691896257, 0,
      -0.7071067811865475, -0.40824829046386296, -0.5773502691896257, 0,
      0, 0.8164965809277259, -0.5773502691896257, 0,
      0.7071067811865475, -1.224744871391589, 3.4641016151377544, 1,
    ], 1e-12)
  })
})

describe('GfMatrix4d::Factor (S·R·T decomposition)', () => {
  it('scale(2,3,4) · Rz(30) · T(5,6,7)', () => {
    const M: Matrix4 = [
      1.7320508075688774, 0.9999999999999999, 0, 0,
      -1.4999999999999998, 2.598076211353316, 0, 0,
      0, 0, 4, 0, 5, 6, 7, 1,
    ]
    const f = factorMatrix(M)
    expect(f.nonSingular).toBe(true)
    closeArr(f.scale, [2, 3, 4], 1e-9)
    closeArr(f.translation, [5, 6, 7], 1e-12)
    closeArr(f.rotation, [
      1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
    ], 1e-9)
    closeArr(f.shear, [
      0.8660254037844387, 0.49999999999999994, 0, 0,
      -0.4999999999999999, 0.8660254037844386, 0, 0,
      0, 0, 1, 0, 0, 0, 0, 1,
    ], 1e-9)
  })
  it('uniform scale(2) · Ry(90) · T(-1,2,-3)', () => {
    const M: Matrix4 = [
      4.440892098500626e-16, 0, -2, 0, 0, 2, 0, 0,
      2, 0, 4.440892098500626e-16, 0, -1, 2, -3, 1,
    ]
    const f = factorMatrix(M)
    expect(f.nonSingular).toBe(true)
    closeArr(f.scale, [2, 2, 2], 1e-9)
    closeArr(f.translation, [-1, 2, -3], 1e-12)
    // shear should be the pure Ry(90) rotation
    closeArr(f.shear, [
      2.220446049250313e-16, 0, -1, 0, 0, 1, 0, 0,
      1, 0, 2.220446049250313e-16, 0, 0, 0, 0, 1,
    ], 1e-9)
  })
})

describe('GfMatrix4d::Orthonormalize', () => {
  it('near-orthonormal basis', () => {
    const M: Matrix4 = [
      1, 0.01, 0, 0, 0, 1, 0.02, 0, 0.03, 0, 1, 0, 0, 0, 0, 1,
    ]
    closeArr(orthonormalizeMatrix(M), [
      0.9998742953607919, 0.005224902439920564, -0.014969765237080409, 0,
      -0.005073792372962961, 0.9999359751904856, 0.010114452570901633, 0,
      0.015021662866944806, -0.01003722330104827, 0.9998367885775742, 0,
      0, 0, 0, 1,
    ], 1e-9)
  })
  it('diagonal basis → identity rotation', () => {
    const M: Matrix4 = [
      2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 4, 0, 0, 0, 0, 1,
    ]
    closeArr(orthonormalizeMatrix(M), [
      1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
    ], 1e-12)
  })
})

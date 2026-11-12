// Ported from OpenUSD 26.11.1: pxr/base/gf/testenv/testGfQuaternion.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// 1:1 port of OpenUSD pxr/base/gf/testenv/testGfQuaternion.py.
//
// One describe() per upstream test method, every assert mirrored. Every numeric
// expectation is captured from the OpenUSD 26.11.1 build
// (FIXTURES.md) into fixtures/quaternion.json — never hand-derived
// (AGENTS.md numeric-fixture rule).
//
// Upstream iterates over four (quatType, vec3Type, closeVal) tuples:
//   (Gf.Quaternion, Gf.Vec3d, 1e-5), (Gf.Quatd, Gf.Vec3d, 1e-5),
//   (Gf.Quatf, Gf.Vec3f, 1e-4),     (Gf.Quath, Gf.Vec3h, 1e-3).
// We port the first three. Gf.Quath / Gf.Vec3h is the documented half-precision
// precision-twin EXCLUSION (typescript-usd memory gf-math-classification; vec.ts ships
// no GfVec3h), so it cannot be exercised and is intentionally omitted — not an
// it.skip, just absent with this explanation.
//
// API mapping (Python property/operator -> TS method):
//   q.real / q.imaginary       -> q.GetReal() / q.GetImaginary()
//   q.real = / q.imaginary =    -> q.SetReal() / q.SetImaginary()
//   q1 * q2 (quat product)     -> q1.GetMultiply(q2)
//   q *= q2 / q *= s            -> q.MultiplyInPlace(q2) / q.ScaleInPlace(s)
//   q * s / s * q               -> q.GetScaled(s)
//   q / s / q /= s              -> q.GetDivided(s) / q.DivideInPlace(s)
//   q + q2 / q += q2            -> q.Add(q2) / q.AddInPlace(q2)
//   q - q2 / q -= q2            -> q.Subtract(q2) / q.SubtractInPlace(q2)
//   q == q2                     -> q.equals(q2)
//   Gf.Dot(q1, q2)             -> GfQuatDot(q1, q2)
//   Gf.Slerp(a, q0, q1)        -> GfSlerp(a, q0, q1)
//   Python Normalize() returns the quat; our Normalize() returns the pre-length
//     (faithful to C++), so we normalize in place and read the object.
import { describe, it, expect } from 'vitest'
import {
  GfQuaternion,
  GfQuatd,
  GfQuatf,
  GfSlerp,
  GfQuatDot,
  type AnyQuat,
} from '../../src/quaternion.ts'
import { GfVec3d, GfVec3f, type GfVec, type VecLike } from '../../src/vec.ts'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'

type V3 = [number, number, number]
interface QuatValue { real: number; imaginary: V3 }
interface QuaternionFixture {
  length_1_234: number
  normalized_1_234: QuatValue
  normalize_1_234: QuatValue
  normalized_1_123: QuatValue
  inverse_of_normalized_1_123: QuatValue
  slerp_half: QuatValue
  slerp_opposing: QuatValue
  slerp_equal: QuatValue
  dot: number
  square: QuatValue
  transform_r1: V3
  transform_r2: V3
}
const G = readOracleFixture<QuaternionFixture>(new URL('./fixtures/quaternion.json', import.meta.url))

// Gf.IsClose for scalars: |a - b| <= tol.
const isClose = (a: number, b: number, tol: number): boolean =>
  Math.abs(a - b) <= tol

// Gf.IsClose for vecs: squared distance <= tol^2.
const isCloseVec = (a: readonly number[], b: readonly number[], tol: number): boolean => {
  let s = 0
  for (let i = 0; i < a.length; i++) s += (a[i]! - b[i]!) ** 2
  return s <= tol * tol
}

// A per-type test harness, standing in for upstream's (quatType, vec3Type,
// closeVal) tuple plus the constructor variations.
interface Spec {
  name: string
  closeVal: number
  generic: boolean // true only for Gf.Quaternion (lacks 4-arg ctor / Transform / Conjugate)
  Quat: abstract new (...args: never[]) => AnyQuat
  newQ(real?: number, im?: VecLike): AnyQuat
  new4(real: number, i: number, j: number, k: number): AnyQuat
  copyQ(q: AnyQuat): AnyQuat
  zero(): AnyQuat
  identity(): AnyQuat
  vec(x?: number, y?: number, z?: number): GfVec
}

const specs: Spec[] = [
  {
    name: 'GfQuaternion',
    closeVal: 0.00001,
    generic: true,
    Quat: GfQuaternion,
    newQ: (real?, im?) =>
      im !== undefined
        ? new GfQuaternion(real!, im)
        : real !== undefined
          ? new GfQuaternion(real)
          : new GfQuaternion(),
    new4: () => {
      throw new Error('GfQuaternion has no 4-coefficient constructor')
    },
    copyQ: (q) => new GfQuaternion(q),
    zero: () => GfQuaternion.getZero(),
    identity: () => GfQuaternion.getIdentity(),
    vec: (x = 0, y = 0, z = 0) => new GfVec3d(x, y, z),
  },
  {
    name: 'GfQuatd',
    closeVal: 0.00001,
    generic: false,
    Quat: GfQuatd,
    newQ: (real?, im?) =>
      im !== undefined
        ? new GfQuatd(real!, im)
        : real !== undefined
          ? new GfQuatd(real)
          : new GfQuatd(),
    new4: (real, i, j, k) => new GfQuatd(real, i, j, k),
    copyQ: (q) => new GfQuatd(q),
    zero: () => GfQuatd.getZero(),
    identity: () => GfQuatd.getIdentity(),
    vec: (x = 0, y = 0, z = 0) => new GfVec3d(x, y, z),
  },
  {
    name: 'GfQuatf',
    closeVal: 0.0001,
    generic: false,
    Quat: GfQuatf,
    newQ: (real?, im?) =>
      im !== undefined
        ? new GfQuatf(real!, im)
        : real !== undefined
          ? new GfQuatf(real)
          : new GfQuatf(),
    new4: (real, i, j, k) => new GfQuatf(real, i, j, k),
    copyQ: (q) => new GfQuatf(q),
    zero: () => GfQuatf.getZero(),
    identity: () => GfQuatf.getIdentity(),
    vec: (x = 0, y = 0, z = 0) => new GfVec3f(x, y, z),
  },
]

describe('test_Constructors', () => {
  for (const s of specs) {
    it(s.name, () => {
      expect(s.newQ()).toBeInstanceOf(s.Quat)
      expect(s.newQ(0)).toBeInstanceOf(s.Quat)
      expect(s.newQ(1, s.vec(1, 1, 1))).toBeInstanceOf(s.Quat)
      expect(s.identity()).toBeInstanceOf(s.Quat)

      let q = s.newQ(2)
      expect(q.GetReal()).toBe(2)
      expect(q.GetImaginary().equals(s.vec(0, 0, 0))).toBe(true)

      if (!s.generic) {
        // This constructor is not supported by Gf.Quaternion.
        q = s.new4(1, 2, 3, 4)
        expect(q.GetReal()).toBe(1)
        expect(q.GetImaginary().equals(s.vec(2, 3, 4))).toBe(true)
      }

      q = s.newQ(1, s.vec(2, 3, 4))
      expect(q.GetReal()).toBe(1)
      expect(q.GetImaginary().equals(s.vec(2, 3, 4))).toBe(true)

      q = s.newQ(1, [2, 3, 4])
      expect(q.GetReal()).toBe(1)
      expect(q.GetImaginary().equals(s.vec(2, 3, 4))).toBe(true)
    })
  }

  it('cross-precision conversions', () => {
    // Conversions among Quat[f,d]. Quath (and Vec3h) are the documented
    // half-precision exclusion, so those conversions are omitted.
    expect(new GfQuatf(new GfQuatd())).toBeInstanceOf(GfQuatf)
    expect(new GfQuatd(new GfQuatf())).toBeInstanceOf(GfQuatd)
  })
})

describe('test_Properties', () => {
  for (const s of specs) {
    it(s.name, () => {
      const q = s.newQ()
      q.setReal(10)
      expect(q.GetReal()).toBe(10)
      q.setImaginary(s.vec(1, 2, 3))
      expect(q.GetImaginary().equals(s.vec(1, 2, 3))).toBe(true)
    })
  }
})

describe('test_Methods', () => {
  for (const s of specs) {
    it(s.name, () => {
      const cv = s.closeVal

      expect(s.zero().equals(s.newQ(0))).toBe(true)
      expect(s.identity().equals(s.newQ(1, s.vec()))).toBe(true)

      expect(s.zero().GetLength()).toBe(0)
      expect(s.identity().GetLength()).toBe(1)

      // golden: length_1_234
      expect(isClose(s.newQ(1, s.vec(2, 3, 4)).GetLength(), G.length_1_234, cv)).toBe(true)

      // golden: normalized_1_234
      let q = s.newQ(1, s.vec(2, 3, 4)).GetNormalized()
      expect(isClose(q.GetReal(), G.normalized_1_234.real, cv)).toBe(true)
      expect(isCloseVec(q.GetImaginary().data, G.normalized_1_234.imaginary, cv)).toBe(true)

      q = s.newQ(1, s.vec(2, 3, 4)).GetNormalized(10)
      expect(q.equals(s.identity())).toBe(true)

      // Python Normalize() returns the quat; our Normalize() returns the
      // pre-length, so normalize in place then read the object. golden:
      // normalize_1_234
      q = s.newQ(1, s.vec(2, 3, 4))
      q.Normalize()
      expect(isClose(q.GetReal(), G.normalize_1_234.real, cv)).toBe(true)
      expect(isCloseVec(q.GetImaginary().data, G.normalize_1_234.imaginary, cv)).toBe(true)

      q = s.newQ(1, s.vec(2, 3, 4))
      q.Normalize(10)
      expect(q.equals(s.identity())).toBe(true)

      // Inverse of the identity is the identity.
      q = s.identity()
      expect(q.equals(q.getInverse())).toBe(true)

      // For a unit quaternion the inverse is the conjugate (real same, imag negated).
      q = s.newQ(1, s.vec(1, 2, 3))
      q.Normalize()
      const re = q.GetReal()
      const im = q.GetImaginary().data
      expect(isClose(q.getInverse().GetReal(), re, cv)).toBe(true)
      expect(
        isCloseVec(q.getInverse().GetImaginary().data, im.map((x) => -x), cv),
      ).toBe(true)
    })
  }
})

describe('test_Operators', () => {
  for (const s of specs) {
    it(s.name, () => {
      const cv = s.closeVal

      let q1 = s.newQ(1, s.vec(2, 3, 4))
      const q2 = s.newQ(1, s.vec(2, 3, 4))
      expect(q1.equals(q2)).toBe(true)
      expect(!q1.equals(q2)).toBe(false)
      q2.setReal(2)
      expect(!q1.equals(q2)).toBe(true)

      let q = s.newQ(1, s.vec(2, 3, 4)).getMultiply(s.zero())
      expect(q.equals(s.zero())).toBe(true)

      q = s.newQ(1, s.vec(2, 3, 4)).getMultiply(s.identity())
      expect(q.equals(s.newQ(1, s.vec(2, 3, 4)))).toBe(true)

      q = s.newQ(1, s.vec(2, 3, 4))
      q.multiplyInPlace(s.zero())
      expect(q.equals(s.zero())).toBe(true)

      q = s.newQ(1, s.vec(2, 3, 4))
      let qOriginal = q
      q.multiplyInPlace(s.identity())
      expect(q.equals(s.newQ(1, s.vec(2, 3, 4)))).toBe(true)
      expect(q === qOriginal).toBe(true)

      q.scaleInPlace(10)
      expect(q.equals(s.newQ(10, s.vec(20, 30, 40)))).toBe(true)
      expect(q === qOriginal).toBe(true)
      q = q.getScaled(10)
      expect(q.equals(s.newQ(100, s.vec(200, 300, 400)))).toBe(true)
      q = q.getScaled(10) // 10 * q
      expect(q.equals(s.newQ(1000, s.vec(2000, 3000, 4000)))).toBe(true)
      qOriginal = q
      q.divideInPlace(100)
      expect(q.equals(s.newQ(10, s.vec(20, 30, 40)))).toBe(true)
      expect(q === qOriginal).toBe(true)
      q = q.getDivided(10)
      expect(q.equals(s.newQ(1, s.vec(2, 3, 4)))).toBe(true)

      qOriginal = q
      q.addInPlace(q)
      expect(q.equals(s.newQ(2, s.vec(4, 6, 8)))).toBe(true)
      expect(q === qOriginal).toBe(true)

      q.subtractInPlace(s.newQ(1, s.vec(2, 3, 4)))
      expect(q.equals(s.newQ(1, s.vec(2, 3, 4)))).toBe(true)
      expect(q === qOriginal).toBe(true)

      q = q.add(q)
      expect(q.equals(s.newQ(2, s.vec(4, 6, 8)))).toBe(true)

      q = q.subtract(s.newQ(1, s.vec(2, 3, 4)))
      expect(q.equals(s.newQ(1, s.vec(2, 3, 4)))).toBe(true)

      // golden: square
      q = q.getMultiply(q)
      expect(q.equals(s.newQ(G.square.real, s.vec(...G.square.imaginary)))).toBe(true)

      q1 = s.newQ(1, s.vec(2, 3, 4)).GetNormalized()
      const q2n = s.newQ(4, s.vec(3, 2, 1)).GetNormalized()
      expect(GfSlerp(0, q1, q2n).equals(q1)).toBe(true)
      expect(GfSlerp(1, q1, q2n).equals(q2n)).toBe(true)
      q = GfSlerp(0.5, q1, q2n)
      // golden: slerp_half
      expect(isClose(q.GetReal(), G.slerp_half.real, cv)).toBe(true)
      expect(isCloseVec(q.GetImaginary().data, G.slerp_half.imaginary, cv)).toBe(true)

      // code coverage goodness — opposing imaginary parts. golden: slerp_opposing
      let qa = s.newQ(0, s.vec(1, 1, 1))
      let qb = s.newQ(0, s.vec(-1, -1, -1))
      q = GfSlerp(0.5, qa, qb)
      expect(isClose(q.GetReal(), G.slerp_opposing.real, cv)).toBe(true)
      expect(isCloseVec(q.GetImaginary().data, G.slerp_opposing.imaginary, cv)).toBe(true)

      // equal inputs. golden: slerp_equal
      qa = s.newQ(0, s.vec(1, 1, 1))
      qb = s.newQ(0, s.vec(1, 1, 1))
      q = GfSlerp(0.5, qa, qb)
      expect(isClose(q.GetReal(), G.slerp_equal.real, cv)).toBe(true)
      expect(isCloseVec(q.GetImaginary().data, G.slerp_equal.imaginary, cv)).toBe(true)

      // repr round-trip analogue: reconstruct from components, must equal.
      const rebuilt = s.newQ(q.GetReal(), q.GetImaginary())
      expect(rebuilt.equals(q)).toBe(true)

      // str must be non-empty.
      expect(s.newQ().toString().length).toBeGreaterThan(0)

      if (s.generic) {
        // The remaining tests are not for Gf.Quaternion.
        return
      }

      // golden: dot
      const d1 = s.newQ(1, [2, 3, 4])
      const d2 = s.newQ(2, [3, 4, 5])
      expect(isClose(GfQuatDot(d1, d2), G.dot, cv)).toBe(true)

      // GetConjugate only exists on Quatd/Quatf/Quath.
      const conj = (s.newQ(1, s.vec(2, 3, 4)) as GfQuatd | GfQuatf).getConjugate()
      expect(conj.equals(s.newQ(1, s.vec(2, 3, 4).getNegated()))).toBe(true)

      // q is a 90 degree rotation around Z axis.
      const theta = (90 * Math.PI) / 180
      const cosHalfTheta = Math.cos(theta / 2)
      const sinHalfTheta = Math.sin(theta / 2)
      const qz = s.newQ(cosHalfTheta, s.vec(0, 0, 1).getScaled(sinHalfTheta)) as
        | GfQuatd
        | GfQuatf
      const p = s.vec(1, 0, 0) // point on the x-axis

      // golden: transform_r1 (r2 is checked against r1, as upstream does)
      const r1 = qz
        .getMultiply(s.newQ(0, p))
        .getMultiply(qz.getInverse())
        .GetImaginary()
      const r2 = qz.Transform(p)
      expect(isCloseVec(r1.data, G.transform_r1, cv)).toBe(true)
      expect(isCloseVec(r1.data, r2.data, cv)).toBe(true)
    })
  }
})

describe('test_Hash', () => {
  for (const s of specs) {
    it(s.name, () => {
      const q = s.newQ(1, s.vec(2, 3, 4))
      expect(q.hash()).toBe(q.hash())
      expect(q.hash()).toBe(s.copyQ(q).hash())
    })
  }
})

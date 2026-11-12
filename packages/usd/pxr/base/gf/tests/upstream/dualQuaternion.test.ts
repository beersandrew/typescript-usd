// Ported from OpenUSD 26.11.1: pxr/base/gf/testenv/testGfDualQuaternion.py
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// 1:1 port of OpenUSD pxr/base/gf/testenv/testGfDualQuaternion.py.
//
// One describe() per upstream test method, every assert mirrored. Every numeric
// expectation is captured from the OpenUSD 26.11.1 build
// (FIXTURES.md) into fixtures/dualQuaternion.json — never hand-derived (AGENTS.md
// numeric-fixture rule).
//
// Upstream runs the same body over (DualQuatd, DualQuatf, DualQuath). The half
// tuple is the documented precision-twin exclusion (typescript-usd memory
// gf-math-classification; GfQuath / GfVec3h are not ported), so this port runs
// the d/f tuples only — by design, NOT a silent skip.
//
// GfDualQuat C++ operator -> TS method mapping used below:
//   dq1 * dq2 (operator*)      -> dq1.GetMultiply(dq2)
//   dq *= dq2                   -> reassign dq = dq.GetMultiply(dq2)
//   dq * s / s * dq             -> dq.GetScaled(s)
//   dq / s                      -> dq.GetDivided(s)
//   dq1 + dq2 / +=              -> dq1.Add(dq2)
//   dq1 - dq2 / -=              -> dq1.Subtract(dq2)
//   operator==                  -> .equals(dq)
//   Gf.Dot(dq1, dq2)            -> GfDualQuatDot(dq1, dq2)
import { describe, it, expect } from 'vitest'
import { GfDualQuatd, GfDualQuatf, GfDualQuatDot, type AnyDualQuat } from '../../src/dualQuat.ts'
import { GfQuatd, GfQuatf } from '../../src/quaternion.ts'
import { GfVec3d, GfVec3f } from '../../src/vec.ts'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'

// Gf.IsClose for vectors: squared distance <= tol^2 (componentwise tolerance).
const isCloseVec = (a: readonly number[], b: readonly number[], tol: number): boolean => {
  let s = 0
  for (let i = 0; i < a.length; i++) s += (a[i]! - b[i]!) ** 2
  return s <= tol * tol
}
const isClose = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol

// Goldens captured from the OpenUSD 26.11.1 build (FIXTURES.md).
type QuatPair = [number, number[]]
type DualQuatValue = { real: QuatPair; dual: QuatPair }
type Gold = {
  length_q1234: number[]
  normalized: DualQuatValue
  inverse: DualQuatValue
  normalized_translation: number[]
  ctor_rt_dual_imaginary: number[]
  ctor_rt_translation: number[]
  self_mul: DualQuatValue
  dot: number
  transform: Record<'000' | '111' | '100' | '010' | '001' | 'translation', number[]>
}
const GOLD = readOracleFixture<{ d: Gold; f: Gold }>(
  new URL('./fixtures/dualQuaternion.json', import.meta.url),
)

// ---------------------------------------------------------------------------
// Per-precision config. Mirrors upstream's testClasses tuple (sans DualQuath).
// ---------------------------------------------------------------------------

type Cfg = {
  tag: 'd' | 'f'
  closeVal: number
  DQ: typeof GfDualQuatd | typeof GfDualQuatf
  makeDQ: (...args: ConstructorParameters<typeof GfDualQuatd>) => AnyDualQuat
  makeQ: (real?: number, i?: number, j?: number, k?: number) => GfQuatd | GfQuatf
  makeQV: (real: number, v: GfVec3d | GfVec3f) => GfQuatd | GfQuatf
  makeV3: (x?: number, y?: number, z?: number) => GfVec3d | GfVec3f
  gold: typeof GOLD.d
}

const configs: Cfg[] = [
  {
    tag: 'd',
    closeVal: 0.00001,
    DQ: GfDualQuatd,
    makeDQ: (...a) => new GfDualQuatd(...a),
    makeQ: (real = 0, i?, j?, k?) =>
      i === undefined ? new GfQuatd(real) : new GfQuatd(real, i, j!, k!),
    makeQV: (real, v) => new GfQuatd(real, v),
    makeV3: (x, y, z) =>
      x === undefined ? new GfVec3d(0, 0, 0) : y === undefined ? new GfVec3d(x) : new GfVec3d(x, y!, z!),
    gold: GOLD.d,
  },
  {
    tag: 'f',
    closeVal: 0.0001,
    DQ: GfDualQuatf,
    makeDQ: (...a) => new GfDualQuatf(...a),
    makeQ: (real = 0, i?, j?, k?) =>
      i === undefined ? new GfQuatf(real) : new GfQuatf(real, i, j!, k!),
    makeQV: (real, v) => new GfQuatf(real, v),
    makeV3: (x, y, z) =>
      x === undefined ? new GfVec3f(0, 0, 0) : y === undefined ? new GfVec3f(x) : new GfVec3f(x, y!, z!),
    gold: GOLD.f,
  },
]

// The dual quaternion a fixture value [real, [i, j, k]] pair describes.
const makeDQValue = (c: Cfg, v: DualQuatValue): AnyDualQuat =>
  c.makeDQ(c.makeQV(v.real[0], c.makeV3(...(v.real[1] as [number, number, number]))),
    c.makeQV(v.dual[0], c.makeV3(...(v.dual[1] as [number, number, number]))))

describe('GfDualQuaternion', () => {
  describe.each(configs)('test_Constructors [$tag]', (c) => {
    it('constructor variants build the right type', () => {
      expect(c.makeDQ()).toBeInstanceOf(c.DQ)
      expect(c.makeDQ(0)).toBeInstanceOf(c.DQ)
      expect(c.makeDQ(c.makeQV(1, c.makeV3(0)))).toBeInstanceOf(c.DQ)
      expect(c.makeDQ(c.makeQV(1, c.makeV3(0)), c.makeQV(1, c.makeV3(1, 1, 1)))).toBeInstanceOf(c.DQ)
      expect(c.makeDQ(c.makeQV(1, c.makeV3(0)), c.makeV3(1, 1, 1))).toBeInstanceOf(c.DQ)
      expect(c.DQ.getIdentity()).toBeInstanceOf(c.DQ)
      expect(c.makeDQ(c.makeDQ())).toBeInstanceOf(c.DQ)
    })

    it('DQ(2): real=Q(2), dual=Q(0)', () => {
      const dq = c.makeDQ(2)
      expect(dq.GetReal().equals(c.makeQ(2))).toBe(true)
      expect(dq.getDual().equals(c.makeQ(0))).toBe(true)
    })

    it('DQ(Q(1,2,3,4)): real=Q(1,2,3,4), dual=Q(0)', () => {
      const dq = c.makeDQ(c.makeQ(1, 2, 3, 4))
      expect(dq.GetReal().equals(c.makeQ(1, 2, 3, 4))).toBe(true)
      expect(dq.getDual().equals(c.makeQ(0))).toBe(true)
    })

    it('DQ(Q(1,2,3,4), Q(5,6,7,8)): explicit real + dual', () => {
      const dq = c.makeDQ(c.makeQ(1, 2, 3, 4), c.makeQ(5, 6, 7, 8))
      expect(dq.GetReal().equals(c.makeQ(1, 2, 3, 4))).toBe(true)
      expect(dq.getDual().equals(c.makeQ(5, 6, 7, 8))).toBe(true)
    })

    it('DQ(Q(1), V3(1,2,3)): rotation + translation', () => {
      const dq = c.makeDQ(c.makeQV(1, c.makeV3(0)), c.makeV3(1, 2, 3))
      expect(dq.GetReal().equals(c.makeQ(1))).toBe(true)
      expect(dq.getDual().GetReal()).toBe(0)
      expect(isCloseVec(dq.getDual().GetImaginary().data, c.gold.ctor_rt_dual_imaginary, c.closeVal)).toBe(true)
      expect(isCloseVec(dq.getTranslation().data, c.gold.ctor_rt_translation, c.closeVal)).toBe(true)
    })
  })

  // Cross-precision conversion constructors (DualQuath excluded).
  it('test_Constructors: conversions between DualQuat[f,d]', () => {
    expect(new GfDualQuatf(new GfDualQuatd())).toBeInstanceOf(GfDualQuatf)
    expect(new GfDualQuatd(new GfDualQuatf())).toBeInstanceOf(GfDualQuatd)
  })

  describe.each(configs)('test_Properties [$tag]', (c) => {
    it('real / dual property set+get', () => {
      const dq = c.makeDQ()
      dq.setReal(c.makeQV(1, c.makeV3(0)))
      expect(dq.GetReal().equals(c.makeQV(1, c.makeV3(0)))).toBe(true)
      dq.setDual(c.makeQV(2, c.makeV3(0)))
      expect(dq.getDual().equals(c.makeQV(2, c.makeV3(0)))).toBe(true)
    })
  })

  describe.each(configs)('test_Methods [$tag]', (c) => {
    it('GetZero / GetIdentity', () => {
      expect(c.DQ.getZero().equals(c.makeDQ(0))).toBe(true)
      expect(c.DQ.getIdentity().equals(c.makeDQ(1))).toBe(true)
    })

    it('GetLength', () => {
      expect(c.DQ.getZero().GetLength()).toEqual([0, 0])
      expect(c.DQ.getIdentity().GetLength()).toEqual([1, 0])
      const len = c.makeDQ(c.makeQV(1, c.makeV3(2, 3, 4))).GetLength()
      expect(isClose(len[0], c.gold.length_q1234[0]!, c.closeVal)).toBe(true)
      expect(isClose(len[1], c.gold.length_q1234[1]!, c.closeVal)).toBe(true)
    })

    it('GetNormalized', () => {
      const dq = c.makeDQ(c.makeQV(1, c.makeV3(2, 3, 4)), c.makeQV(5, c.makeV3(6, 7, 8))).GetNormalized()
      const re = dq.GetReal()
      const du = dq.getDual()
      expect(isClose(re.GetReal(), c.gold.normalized.real[0] as number, c.closeVal)).toBe(true)
      expect(isCloseVec(re.GetImaginary().data, c.gold.normalized.real[1], c.closeVal)).toBe(true)
      expect(isClose(du.GetReal(), c.gold.normalized.dual[0] as number, c.closeVal)).toBe(true)
      expect(isCloseVec(du.GetImaginary().data, c.gold.normalized.dual[1], c.closeVal)).toBe(true)
    })

    it('GetNormalized(10) -> identity', () => {
      const dq = c.makeDQ(c.makeQV(1, c.makeV3(2, 3, 4)), c.makeQV(5, c.makeV3(6, 7, 8))).GetNormalized(10)
      expect(dq.equals(c.DQ.getIdentity())).toBe(true)
    })

    it('Normalize (in place)', () => {
      const dq = c.makeDQ(c.makeQV(1, c.makeV3(2, 3, 4)), c.makeQV(5, c.makeV3(6, 7, 8)))
      dq.Normalize()
      const re = dq.GetReal()
      const du = dq.getDual()
      expect(isClose(re.GetReal(), c.gold.normalized.real[0] as number, c.closeVal)).toBe(true)
      expect(isCloseVec(re.GetImaginary().data, c.gold.normalized.real[1], c.closeVal)).toBe(true)
      expect(isClose(du.GetReal(), c.gold.normalized.dual[0] as number, c.closeVal)).toBe(true)
      expect(isCloseVec(du.GetImaginary().data, c.gold.normalized.dual[1], c.closeVal)).toBe(true)
    })

    it('Normalize(10) -> identity', () => {
      const dq = c.makeDQ(c.makeQV(1, c.makeV3(2, 3, 4)), c.makeQV(5, c.makeV3(6, 7, 8)))
      dq.Normalize(10)
      expect(dq.equals(c.DQ.getIdentity())).toBe(true)
    })

    it('GetInverse', () => {
      const id = c.DQ.getIdentity()
      expect(id.equals(id.getInverse())).toBe(true)
      const dq = c.makeDQ(c.makeQV(1, c.makeV3(2, 3, 4)), c.makeQV(5, c.makeV3(6, 7, 8))).getInverse()
      const re = dq.GetReal()
      const du = dq.getDual()
      expect(isClose(re.GetReal(), c.gold.inverse.real[0] as number, c.closeVal)).toBe(true)
      expect(isCloseVec(re.GetImaginary().data, c.gold.inverse.real[1], c.closeVal)).toBe(true)
      expect(isClose(du.GetReal(), c.gold.inverse.dual[0] as number, c.closeVal)).toBe(true)
      expect(isCloseVec(du.GetImaginary().data, c.gold.inverse.dual[1], c.closeVal)).toBe(true)
    })

    it('GetTranslation / SetTranslation', () => {
      const dq = c.makeDQ(c.makeQV(1, c.makeV3(2, 3, 4)), c.makeQV(5, c.makeV3(6, 7, 8))).GetNormalized()
      expect(isCloseVec(dq.getTranslation().data, c.gold.normalized_translation, c.closeVal)).toBe(true)
      dq.setTranslation(c.makeV3(1, 1, 1))
      expect(isCloseVec(dq.getTranslation().data, [1, 1, 1], c.closeVal)).toBe(true)
    })
  })

  describe.each(configs)('test_Operators [$tag]', (c) => {
    const base = () => c.makeDQ(c.makeQV(1, c.makeV3(2, 3, 4)), c.makeQV(5, c.makeV3(6, 7, 8)))

    it('equality / inequality', () => {
      const dq1 = base()
      const dq2 = base()
      expect(dq1.equals(dq2)).toBe(true)
      expect(dq1.equals(dq2)).not.toBe(false)
      dq2.setReal(c.makeQV(2, c.makeV3(2, 3, 4)))
      expect(dq1.equals(dq2)).toBe(false)
    })

    it('+= / -=', () => {
      let dq = base()
      dq = dq.add(dq)
      expect(dq.equals(c.makeDQ(c.makeQV(2, c.makeV3(4, 6, 8)), c.makeQV(10, c.makeV3(12, 14, 16))))).toBe(true)
      dq = dq.subtract(base())
      expect(dq.equals(base())).toBe(true)
    })

    it('*= identity / *= self', () => {
      let dq = base()
      dq = dq.getMultiply(c.DQ.getIdentity())
      expect(dq.equals(base())).toBe(true)
      dq = dq.getMultiply(base())
      expect(
        dq.equals(makeDQValue(c, c.gold.self_mul)),
      ).toBe(true)
    })

    it('*= scalar / /= scalar', () => {
      let dq = base()
      dq = dq.getScaled(10)
      expect(dq.equals(c.makeDQ(c.makeQV(10, c.makeV3(20, 30, 40)), c.makeQV(50, c.makeV3(60, 70, 80))))).toBe(true)
      dq = dq.getDivided(10)
      expect(dq.equals(base())).toBe(true)
    })

    it('binary + - * (dq) and scalar * /', () => {
      let dq = base()
      dq = dq.add(dq)
      expect(dq.equals(c.makeDQ(c.makeQV(2, c.makeV3(4, 6, 8)), c.makeQV(10, c.makeV3(12, 14, 16))))).toBe(true)
      dq = dq.subtract(base())
      expect(dq.equals(base())).toBe(true)
      dq = dq.getMultiply(dq)
      expect(
        dq.equals(makeDQValue(c, c.gold.self_mul)),
      ).toBe(true)

      dq = base()
      dq = dq.getScaled(10)
      expect(dq.equals(c.makeDQ(c.makeQV(10, c.makeV3(20, 30, 40)), c.makeQV(50, c.makeV3(60, 70, 80))))).toBe(true)
      dq = dq.getScaled(0.5)
      expect(dq.equals(c.makeDQ(c.makeQV(5, c.makeV3(10, 15, 20)), c.makeQV(25, c.makeV3(30, 35, 40))))).toBe(true)
      dq = dq.getDivided(5)
      expect(dq.equals(base())).toBe(true)
    })

    it('repr round-trip + str', () => {
      // Python: assertEqual(dq, eval(repr(dq))). TS equivalent: copy ctor round-trips.
      const dq = base()
      expect(c.makeDQ(dq).equals(dq)).toBe(true)
      expect(c.makeDQ().toString().length).toBeGreaterThan(0)
    })

    it('Gf.Dot', () => {
      const dq1 = c.makeDQ(c.makeQV(1, c.makeV3(2, 3, 4)), c.makeQV(1, c.makeV3(2, 3, 4)))
      const dq2 = c.makeDQ(c.makeQV(2, c.makeV3(3, 4, 5)), c.makeQV(2, c.makeV3(3, 4, 5)))
      expect(isClose(GfDualQuatDot(dq1, dq2), c.gold.dot, c.closeVal)).toBe(true)
    })

    it('GetConjugate', () => {
      const dq = base()
      expect(dq.equals(dq.getConjugate().getConjugate())).toBe(true)
      const re = dq.GetReal()
      const du = dq.getDual()
      const cre = dq.getConjugate().GetReal()
      const cdu = dq.getConjugate().getDual()
      expect(isClose(cre.GetReal(), re.getConjugate().GetReal(), c.closeVal)).toBe(true)
      expect(isCloseVec(cre.GetImaginary().data, re.getConjugate().GetImaginary().data, c.closeVal)).toBe(true)
      expect(isClose(cdu.GetReal(), du.getConjugate().GetReal(), c.closeVal)).toBe(true)
      expect(isCloseVec(cdu.GetImaginary().data, du.getConjugate().GetImaginary().data, c.closeVal)).toBe(true)
    })

    it('Transform', () => {
      const rotOnly = c.makeDQ(c.makeQV(1, c.makeV3(2, 3, 4))).GetNormalized()
      expect(rotOnly.Transform(c.makeV3(0)).equals(c.makeV3(0))).toBe(true)

      const dq = base().GetNormalized()
      expect(dq.Transform(c.makeV3(0)).equals(dq.getTranslation())).toBe(true)
      expect(isCloseVec(dq.Transform(c.makeV3(1, 1, 1)).data, c.gold.transform['111'], c.closeVal)).toBe(true)
      expect(isCloseVec(dq.Transform(c.makeV3(1, 0, 0)).data, c.gold.transform['100'], c.closeVal)).toBe(true)
      expect(isCloseVec(dq.Transform(c.makeV3(0, 1, 0)).data, c.gold.transform['010'], c.closeVal)).toBe(true)
      expect(isCloseVec(dq.Transform(c.makeV3(0, 0, 1)).data, c.gold.transform['001'], c.closeVal)).toBe(true)
    })
  })

  describe.each(configs)('test_Hash [$tag]', (c) => {
    it('hash is stable and matches copies', () => {
      const dq = c.makeDQ(c.makeQV(1, c.makeV3(2, 3, 4)), c.makeQV(2, c.makeV3(3, 4, 5)))
      expect(dq.hash()).toBe(dq.hash())
      expect(dq.hash()).toBe(c.makeDQ(dq).hash())
    })
  })
})

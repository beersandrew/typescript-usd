// Ported from OpenUSD 26.11.1: pxr/base/gf/testenv/testGfMath.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// 1:1 port of OpenUSD pxr/base/gf/testenv/testGfMath.py.
//
// One describe() per upstream test_* method, every assert mirrored. Numeric
// expectations are captured from the OpenUSD 26.11.1 build
// (FIXTURES.md) into fixtures/math.json; the remaining literals (float overloads, Sgn) are
// the upstream testGfMath.py assertions themselves — never hand-derived
// (AGENTS.md numeric-fixture rule).
//
// Name mapping: the Python Gf module exposes these free functions without the
// "Gf" prefix, and exposes the C++ float overloads under a trailing "f"
// (Sqrt/Sqrtf, ...). Our TS surface keeps the upstream C++ "Gf" prefix and the
// "f" suffix for the float overloads (see src/math.ts).
//   SmoothStep        -> GfSmoothStep
//   _HalfRoundTrip    -> halfRoundTrip helper below (test-only Gf binding)
//   RadiansToDegrees  -> GfRadiansToDegrees   DegreesToRadians -> GfDegreesToRadians
//   Sqr               -> GfSqr (scalar + GfVec)     Sgn -> GfSgn
//   Sqrt/Sqrtf        -> GfSqrt/GfSqrtf       Exp/Expf -> GfExp/GfExpf
//   Log/Logf          -> GfLog/GfLogf         Floor/Floorf -> GfFloor/GfFloorf
//   Ceil/Ceilf        -> GfCeil/GfCeilf       Abs/Absf -> GfAbs/GfAbsf
//   Round/Roundf      -> GfRound/GfRoundf     Pow/Powf -> GfPow/GfPowf
//   Clamp/Clampf      -> GfClamp/GfClampf     Mod/Modf -> GfMod/GfModf
//   Dot               -> GfDot                CompMult -> GfCompMult
//   CompDiv           -> GfCompDiv
import { describe, it, expect } from 'vitest'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'
import {
  GfSmoothStep,
  GfRadiansToDegrees,
  GfDegreesToRadians,
  GfSqr,
  GfSgn,
  GfSqrt,
  GfSqrtf,
  GfExp,
  GfExpf,
  GfLog,
  GfLogf,
  GfFloor,
  GfFloorf,
  GfCeil,
  GfCeilf,
  GfAbs,
  GfAbsf,
  GfRound,
  GfRoundf,
  GfPow,
  GfPowf,
  GfClamp,
  GfClampf,
  GfMod,
  GfModf,
  GfDot,
  GfCompMult,
  GfCompDiv,
} from '../../src/math.ts'
import {
  GfVec2i,
  GfVec3i,
  GfVec2d,
  GfVec3d,
  GfVec4d,
  GfVec2f,
  GfVec3f,
  GfVec4f,
} from '../../src/vec.ts'

const E = Math.E

const G = readOracleFixture<Record<string, number>>(
  new URL('./fixtures/math.json', import.meta.url),
)

// _HalfRoundTrip: the Python Gf module exposes a test-only binding that
// converts a value to GfHalf (IEEE float16) and back to double. Half is the
// documented precision-twin exclusion (vec.ts header), so there is no GfHalf
// value type; this helper reproduces the round trip directly (round-to-nearest,
// ties-to-even f16 conversion) purely to mirror the upstream test. It throws
// TypeError on non-number input, matching the Python binding's behaviour.
function halfRoundTrip(x: unknown): number {
  if (typeof x !== 'number') {
    throw new TypeError('halfRoundTrip: expected a number')
  }
  // double -> float32 -> float16 bits (round to nearest even) -> double.
  const f = Math.fround(x)
  const dv = new DataView(new ArrayBuffer(4))
  dv.setFloat32(0, f)
  const bits = dv.getUint32(0)

  const sign = (bits >>> 16) & 0x8000
  const exp32 = (bits >>> 23) & 0xff
  const mant32 = bits & 0x7fffff

  let half: number
  if (exp32 === 0xff) {
    // Inf / NaN.
    half = sign | 0x7c00 | (mant32 ? 0x200 : 0)
  } else {
    const e = exp32 - 127 + 15
    if (e >= 0x1f) {
      half = sign | 0x7c00 // overflow -> inf
    } else if (e <= 0) {
      if (e < -10) {
        half = sign // underflow -> zero
      } else {
        // Subnormal half: include the implicit leading 1.
        const m = mant32 | 0x800000
        const shift = 14 - e
        let h = m >>> shift
        // round to nearest even
        const rem = m & ((1 << shift) - 1)
        const halfway = 1 << (shift - 1)
        if (rem > halfway || (rem === halfway && (h & 1))) h += 1
        half = sign | h
      }
    } else {
      let h = (e << 10) | (mant32 >>> 13)
      const rem = mant32 & 0x1fff
      if (rem > 0x1000 || (rem === 0x1000 && (h & 1))) h += 1
      half = sign | h
    }
  }
  half &= 0xffff

  // half bits -> double.
  const hSign = half & 0x8000 ? -1 : 1
  const hExp = (half >>> 10) & 0x1f
  const hMant = half & 0x3ff
  if (hExp === 0) {
    return hSign * Math.pow(2, -14) * (hMant / 1024)
  }
  if (hExp === 0x1f) {
    return hMant ? NaN : hSign * Infinity
  }
  return hSign * Math.pow(2, hExp - 15) * (1 + hMant / 1024)
}

describe('test_SmoothStep', () => {
  it('blends smoothly between min and max', () => {
    const t1 = GfSmoothStep(0, 1, 0.25)
    const t2 = GfSmoothStep(0, 1, 0.75)
    expect(GfSmoothStep(0, 1, 0)).toBe(G.SmoothStep_0_1_0)
    expect(GfSmoothStep(0, 1, 1)).toBe(G.SmoothStep_0_1_1)
    expect(GfSmoothStep(0, 1, 0.5)).toBe(G.SmoothStep_0_1_half)
    expect(t1 > 0 && t1 < 0.5 && t2 > 0.5 && t2 < 1).toBe(true)
    // Captured goldens: exact hermite values.
    expect(t1).toBe(G.SmoothStep_0_1_25)
    expect(t2).toBe(G.SmoothStep_0_1_75)
  })
})

describe('test_HalfRoundTrip', () => {
  it('round-trips exact half values and rejects non-numbers', () => {
    expect(halfRoundTrip(1.0)).toBe(G.HalfRoundTrip_1p0)
    expect(halfRoundTrip(1)).toBe(G.HalfRoundTrip_1)
    expect(halfRoundTrip(2)).toBe(G.HalfRoundTrip_2)
    expect(() => halfRoundTrip([])).toThrow(TypeError)
  })
})

describe('test_RadiansDegrees', () => {
  it('converts radians<->degrees', () => {
    expect(GfRadiansToDegrees(0)).toBe(0)
    expect(GfRadiansToDegrees(Math.PI)).toBe(G.RadiansToDegrees_pi)
    expect(GfRadiansToDegrees(4 * Math.PI)).toBe(G.RadiansToDegrees_4pi)

    expect(GfDegreesToRadians(0)).toBe(0)
    expect(GfDegreesToRadians(180)).toBe(G.DegreesToRadians_180)
    expect(GfDegreesToRadians(4 * 360)).toBe(G.DegreesToRadians_1440)
  })
})

describe('test_Sqr', () => {
  it('squares scalars and vectors (dot with self)', () => {
    expect(GfSqr(3)).toBe(9)
    expect(GfSqr(Math.sqrt(2))).toBeCloseTo(G.Sqr_sqrt2!, 7)
    expect(GfSqr(new GfVec2i(1, 2))).toBe(G.Sqr_Vec2i)
    expect(GfSqr(new GfVec3i(1, 2, 3))).toBe(G.Sqr_Vec3i)
    expect(GfSqr(new GfVec2d(1, 2))).toBe(G.Sqr_Vec2d)
    expect(GfSqr(new GfVec3d(1, 2, 3))).toBe(G.Sqr_Vec3d)
    expect(GfSqr(new GfVec4d(1, 2, 3, 4))).toBe(G.Sqr_Vec4d)
    expect(GfSqr(new GfVec2f(1, 2))).toBe(G.Sqr_Vec2f)
    expect(GfSqr(new GfVec3f(1, 2, 3))).toBe(G.Sqr_Vec3f)
    expect(GfSqr(new GfVec4f(1, 2, 3, 4))).toBe(G.Sqr_Vec4f)
  })
})

describe('test_Sgn', () => {
  it('returns -1, 0, or 1', () => {
    expect(GfSgn(-3)).toBe(-1)
    expect(GfSgn(3)).toBe(1)
    expect(GfSgn(0)).toBe(0)
    expect(GfSgn(-3.3)).toBe(-1)
    expect(GfSgn(3.3)).toBe(1)
    expect(GfSgn(0.0)).toBe(0)
  })
})

describe('test_Sqrt', () => {
  it('sqrt (double and float)', () => {
    expect(GfSqrt(2)).toBeCloseTo(Math.sqrt(2), 5)
    expect(GfSqrtf(2)).toBeCloseTo(Math.sqrt(2), 5)
    expect(GfSqrt(2)).toBe(G.Sqrt_2)
    expect(GfSqrtf(2)).toBeCloseTo(G.Sqrtf_2!, 6)
  })
})

describe('test_Exp', () => {
  it('exp (double and float)', () => {
    expect(GfSqr(E)).toBeCloseTo(GfExp(2), 5)
    expect(GfSqr(E)).toBeCloseTo(GfExpf(2), 5)
    expect(GfExp(2)).toBeCloseTo(G.Exp_2!, 12)
    expect(GfExpf(2)).toBeCloseTo(G.Expf_2!, 5)
  })
})

describe('test_Log', () => {
  it('log (double and float)', () => {
    expect(GfLog(E)).toBe(G.Log_e)
    expect(GfLog(GfExp(E))).toBeCloseTo(E, 5)
    expect(GfLogf(E)).toBeCloseTo(G.Logf_e!, 5)
    expect(GfLogf(GfExpf(E))).toBeCloseTo(E, 5)
  })
})

describe('test_Floor', () => {
  it('floor (double and float)', () => {
    expect(GfFloor(3.141)).toBe(G.Floor_3p141)
    expect(GfFloor(-3.141)).toBe(G.Floor_neg3p141)
    expect(GfFloorf(3.141)).toBe(3)
    expect(GfFloorf(-3.141)).toBe(-4)
  })
})

describe('test_Ceil', () => {
  it('ceil (double and float)', () => {
    expect(GfCeil(3.141)).toBe(G.Ceil_3p141)
    expect(GfCeil(-3.141)).toBe(G.Ceil_neg3p141)
    expect(GfCeilf(3.141)).toBe(4)
    expect(GfCeilf(-3.141)).toBe(-3)
  })
})

describe('test_Abs', () => {
  it('abs (double and float)', () => {
    expect(GfAbs(-3.141)).toBeCloseTo(G.Abs_neg3p141!, 6)
    expect(GfAbs(3.141)).toBeCloseTo(3.141, 6)
    expect(GfAbsf(-3.141)).toBeCloseTo(3.141, 6)
    expect(GfAbsf(3.141)).toBeCloseTo(3.141, 6)
  })
})

describe('test_Round', () => {
  it('round to nearest, ties to even (double and float)', () => {
    expect(GfRound(3.1)).toBe(G.Round_3p1)
    expect(GfRound(3.5)).toBe(G.Round_3p5)
    expect(GfRound(-3.1)).toBe(G.Round_neg3p1)
    expect(GfRound(-3.6)).toBe(G.Round_neg3p6)
    expect(GfRoundf(3.1)).toBe(3)
    expect(GfRoundf(3.5)).toBe(4)
    expect(GfRoundf(-3.1)).toBe(-3)
    expect(GfRoundf(-3.6)).toBe(-4)
  })
})

describe('test_Pow', () => {
  it('pow (double and float)', () => {
    expect(GfPow(2, 4)).toBe(G.Pow_2_4)
    expect(GfPowf(2, 4)).toBe(16)
  })
})

describe('test_Clamp', () => {
  it('clamp (double and float)', () => {
    expect(GfClamp(3.141, 3.1, 3.2)).toBeCloseTo(G.Clamp_in!, 5)
    expect(GfClamp(2.141, 3.1, 3.2)).toBeCloseTo(G.Clamp_lo!, 5)
    expect(GfClamp(4.141, 3.1, 3.2)).toBeCloseTo(G.Clamp_hi!, 5)
    expect(GfClampf(3.141, 3.1, 3.2)).toBeCloseTo(3.141, 5)
    expect(GfClampf(2.141, 3.1, 3.2)).toBeCloseTo(3.1, 5)
    expect(GfClampf(4.141, 3.1, 3.2)).toBeCloseTo(3.2, 5)
  })
})

describe('test_Mod', () => {
  it('mod with correct negative behaviour (double and float)', () => {
    expect(GfMod(5, 3)).toBe(G.Mod_5_3)
    expect(GfMod(-5, 3)).toBe(G.Mod_neg5_3)
    expect(GfModf(5, 3)).toBe(2)
    expect(GfModf(-5, 3)).toBe(1)
  })
})

describe('test_Dot', () => {
  it('scalar dot is the product', () => {
    expect(GfDot(2.0, 3.0)).toBe(G.Dot_pos)
    expect(GfDot(-2.0, 3.0)).toBe(G.Dot_neg)
  })
})

describe('test_CompMult', () => {
  it('scalar component-wise multiply is the product', () => {
    expect(GfCompMult(2.0, 3.0)).toBe(G.CompMult_pos)
    expect(GfCompMult(-2.0, 3.0)).toBe(G.CompMult_neg)
  })
})

describe('test_CompDiv', () => {
  it('scalar component-wise divide is the quotient', () => {
    expect(GfCompDiv(6.0, 3.0)).toBe(G.CompDiv_pos)
    expect(GfCompDiv(-6.0, 3.0)).toBe(G.CompDiv_neg)
  })
})

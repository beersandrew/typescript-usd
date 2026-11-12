// Ported from OpenUSD 26.11.1: pxr/base/gf/testenv/testGfDecomposeRotation.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// 1:1 port of OpenUSD pxr/base/gf/testenv/testGfDecomposeRotation.py.
//
// One describe() per upstream test method, every assert mirrored. Exercises the
// 4-angle swing-twist solver GfRotation::DecomposeRotation / DecomposeRotation3
// / MatchClosestEulerRotation (ported in ../../src/rotation.ts).
//
// Numeric goldens for the DecomposeRotation / DecomposeRotation3 cases and the
// MatchClosestEulerRotation three/four-channel cases are captured from the
// OpenUSD 26.11.1 build (FIXTURES.md) into
// fixtures/decomposeRotation.json — never hand-derived (AGENTS.md
// numeric-fixture rule). The recompose-roundtrip checks, the gimbal-lock edge cases, and the
// random one/two-channel MatchClosestEulerRotation checks assert mathematical
// PROPERTIES (recompose(decompose(rot)) == rot; result within Pi of hint and
// equivalent mod 2Pi) rather than fixed numbers, so they need no goldens — the
// random inputs are generated locally since only the property matters.
import { describe, it, expect } from 'vitest'
import {
  GfDecomposeRotation,
  GfDecomposeRotation3,
  GfMatchClosestEulerRotation,
} from '../../src/rotation.ts'
import { GfMatrix3d, GfMatrix4d } from '../../src/matrixData.ts'
import { GfVec3d } from '../../src/vec.ts'
import { GfRadiansToDegrees } from '../../src/math.ts'
import { makeRotation } from '../../src/rotation.ts'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'

type Angles4 = [number, number, number, number]
type DecomposeCases<K extends string> = Record<K | 'noHints' | 'hint1' | 'hint2' | 'shift2pi', Angles4>
type ZeroCases = DecomposeCases<'gimbal1' | 'gimbal2'>
interface DecomposeRotationFixture {
  allAngles: DecomposeCases<'hint3' | 'hint4' | 'gimbal1' | 'gimbal2'>
  zeroTw: ZeroCases
  zeroFB: ZeroCases
  zeroLR: ZeroCases
  zeroSw: ZeroCases
  swingShift: DecomposeCases<'hint3' | 'hint4' | 'hint3b'>
  decompose3: Record<'noHints' | 'hint1', [number, number, number]>
  matchThree: Record<'flipFBLRSW' | 'flipTWLRSW' | 'flipTWFBSW' | 'flipTWFBLR' | 'noFlip', Angles4>
  matchFour: Record<'case0' | 'case1' | 'case2' | 'case3' | 'case3b', Angles4>
  constants: Record<'valOuter' | 'valInner' | 'hint' | 'pi' | 'swShift', number>
}
const G = readOracleFixture<DecomposeRotationFixture>(
  new URL('./fixtures/decomposeRotation.json', import.meta.url),
)

// ---------------------------------------------------------------------------
// Shared fixtures + helpers (mirror the module-level helpers in the .py).
// ---------------------------------------------------------------------------

const fbAxis = new GfVec3d(1, 0, 0)
const lrAxis = new GfVec3d(0, 1, 0)
const swAxis = new GfVec3d(0, 0, 1)

// axes[order] = (fbAxis, lrAxis, swAxis)-style triple per the .py.
const axes: Record<string, [GfVec3d, GfVec3d, GfVec3d]> = {
  XYZ: [fbAxis, lrAxis, swAxis],
  YXZ: [lrAxis, fbAxis, swAxis],
  ZXY: [swAxis, fbAxis, lrAxis],
  XZY: [fbAxis, swAxis, lrAxis],
  YZX: [lrAxis, swAxis, fbAxis],
  ZYX: [swAxis, lrAxis, fbAxis],
}
const ORDERS = Object.keys(axes)

// ComposeRotation: recompose a rotation from a rotation order + radian angles.
function composeRotation(order: string, v: readonly number[]): GfMatrix4d {
  const a = axes[order]!
  const twRot = makeRotation([a[2].get(0), a[2].get(1), a[2].get(2)], GfRadiansToDegrees(v[0]!))
  const fbRot = makeRotation([a[0].get(0), a[0].get(1), a[0].get(2)], GfRadiansToDegrees(v[1]!))
  const lrRot = makeRotation([a[1].get(0), a[1].get(1), a[1].get(2)], GfRadiansToDegrees(v[2]!))
  const swRot = makeRotation([a[2].get(0), a[2].get(1), a[2].get(2)], GfRadiansToDegrees(v[3]!))
  const twMat = new GfMatrix3d(twRot)
  const fbMat = new GfMatrix3d(fbRot)
  const lrMat = new GfMatrix3d(lrRot)
  const swMat = new GfMatrix3d(swRot)
  const prod = twMat.getMultiply(fbMat).getMultiply(lrMat).getMultiply(swMat)
  return new GfMatrix4d(prod, new GfVec3d(0, 0, 0))
}

// IsMatrixClose: per-row GfIsClose (squared distance of the difference <= eps^2).
function isMatrixClose(x: GfMatrix4d, y: GfMatrix4d, epsilon = 1e-6): boolean {
  for (let i = 0; i < 4; i++) {
    const a = x.getRow(i).data
    const b = y.getRow(i).data
    let s = 0
    for (let j = 0; j < 4; j++) s += (a[j]! - b[j]!) ** 2
    if (!(s <= epsilon * epsilon)) return false
  }
  return true
}

// assertAlmostEqual(places=5) helper (Python unittest default rounds to places).
function almostEqual(actual: number, expected: number, places = 5): void {
  expect(actual).toBeCloseTo(expected, places)
}

const ROT = new GfMatrix4d(
  -0.77657773110174733, 0.41334436580878597, -0.47547183177449759, 0.0,
  0.53325734733674601, 0.029348545343396093, -0.8454438268729656, 0.0,
  -0.33550503583141722, -0.91010169659239692, -0.24321034680169412, 0.0,
  0.0, 0.0, 0.0, 1.0,
)

type Hint = number | null

// Decompose `rot` for a given rotation order, mirroring the .py kwarg wiring
// (twAxis = axes[order][2], fbAxis = axes[order][0], lrAxis = axes[order][1]).
function decompose(
  rot: GfMatrix4d,
  order: string,
  tw: Hint,
  fb: Hint,
  lr: Hint,
  sw: Hint,
  useHint: boolean,
  swShift: number | null = null,
): [number, number, number, number] {
  const a = axes[order]!
  return GfDecomposeRotation(rot, a[2], a[0], a[1], 1.0, {
    thetaTwHint: tw,
    thetaFBHint: fb,
    thetaLRHint: lr,
    thetaSwHint: sw,
    useHint,
    swShift,
  })
}

// Faithful port of _TestDecomposeRotation: optionally check the XYZ result
// against an expected tuple, then verify decompose->recompose round-trips for
// every rotation order.
function testDecomposeRotation(
  rot: GfMatrix4d,
  opts: {
    order?: string
    tw?: Hint
    fb?: Hint
    lr?: Hint
    sw?: Hint
    useHint?: boolean
    expected?: readonly number[]
  } = {},
): void {
  const order = opts.order ?? 'XYZ'
  // `null` is a meaningful Hint (zero this channel), so distinguish it from
  // "not supplied" (which defaults to 300, matching the .py signature).
  const tw = opts.tw === undefined ? 300 : opts.tw
  const fb = opts.fb === undefined ? 300 : opts.fb
  const lr = opts.lr === undefined ? 300 : opts.lr
  const sw = opts.sw === undefined ? 300 : opts.sw
  const useHint = opts.useHint ?? false

  if (opts.expected !== undefined) {
    const result = decompose(rot, order, tw, fb, lr, sw, useHint)
    for (let i = 0; i < opts.expected.length; i++) almostEqual(result[i]!, opts.expected[i]!)
    expect(isMatrixClose(composeRotation(order, result), rot)).toBe(true)
  }

  for (const key of ORDERS) {
    const result = decompose(rot, key, tw, fb, lr, sw, useHint)
    expect(isMatrixClose(composeRotation(key, result), rot)).toBe(true)
  }
}

// ---------------------------------------------------------------------------
// test_DecomposeRotationsAllAngles
// ---------------------------------------------------------------------------

describe('test_DecomposeRotationsAllAngles', () => {
  it('decomposes all four angles (with and without hints)', () => {
    // No hints
    testDecomposeRotation(ROT, {
      tw: 300, fb: 300, lr: 300, sw: 300, useHint: false,
      expected: G.allAngles.noHints,
    })
    // Use hints variation 1
    testDecomposeRotation(ROT, {
      tw: -2.0, fb: 2.0, lr: 1.0, sw: 0.0, useHint: true,
      expected: G.allAngles.hint1,
    })
    // Use hints variation 2
    testDecomposeRotation(ROT, {
      tw: 1.5, fb: 1.0, lr: -2.0, sw: 0.0, useHint: true,
      expected: G.allAngles.hint2,
    })
    // Use hints variation 3
    testDecomposeRotation(ROT, {
      tw: 1.5, fb: -2.0, lr: -1.0, sw: 3.0, useHint: true,
      expected: G.allAngles.hint3,
    })
    // Use hints variation 4
    testDecomposeRotation(ROT, {
      tw: -1.5, fb: -1.0, lr: 2.0, sw: 3.0, useHint: true,
      expected: G.allAngles.hint4,
    })
    // Use hints shifted by multiples of 2pi
    testDecomposeRotation(ROT, {
      tw: 14.0, fb: 4.0, lr: -20.0, sw: -16, useHint: true,
      expected: G.allAngles.shift2pi,
    })

    // Gimbal locked rotation 1
    const g = new GfMatrix4d(
      -0.70710678118654746, 0.0, 0.70710678118654768, 0.0,
      -0.70710678118654768, 0.0, -0.70710678118654746, 0.0,
      0.0, -1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0,
    )
    testDecomposeRotation(g, {
      tw: 300, fb: 300, lr: 300, sw: 300, useHint: false,
      expected: G.allAngles.gimbal1,
    })

    // Gimbal locked rotation 2
    const g2 = new GfMatrix4d(
      -0.70710678118654746, 0.0, -0.70710678118654768, 0.0,
      -0.70710678118654768, 0.0, 0.70710678118654746, 0.0,
      0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0,
    )
    testDecomposeRotation(g2, {
      tw: 300, fb: 300, lr: 300, sw: 300, useHint: false,
      expected: G.allAngles.gimbal2,
    })
  })
})

// ---------------------------------------------------------------------------
// test_DecomposeRotationsZeroTw
// ---------------------------------------------------------------------------

describe('test_DecomposeRotationsZeroTw', () => {
  it('decomposes with Tw zeroed', () => {
    testDecomposeRotation(ROT, {
      tw: null, fb: 300, lr: 300, sw: 300, useHint: false,
      expected: G.zeroTw.noHints,
    })
    testDecomposeRotation(ROT, {
      tw: null, fb: 1.0, lr: 3.0, sw: 0.0, useHint: true,
      expected: G.zeroTw.hint1,
    })
    testDecomposeRotation(ROT, {
      tw: null, fb: -2.0, lr: 1.0, sw: 3.0, useHint: true,
      expected: G.zeroTw.hint2,
    })
    testDecomposeRotation(ROT, {
      tw: null, fb: -14.0, lr: 19.0, sw: -4.0, useHint: true,
      expected: G.zeroTw.shift2pi,
    })

    const gtw1 = new GfMatrix4d(
      0.0, 0.0, -1.0, 0.0,
      -0.70710678118654746, -0.70710678118654768, 0.0, 0.0,
      -0.70710678118654768, 0.70710678118654746, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0,
    )
    testDecomposeRotation(gtw1, {
      tw: null, fb: 300, lr: 300, sw: 300, useHint: false,
      expected: G.zeroTw.gimbal1,
    })

    const gtw2 = new GfMatrix4d(
      0.0, 0.0, 1.0, 0.0,
      -0.70710678118654746, 0.70710678118654768, 0.0, 0.0,
      -0.70710678118654768, -0.70710678118654746, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0,
    )
    testDecomposeRotation(gtw2, {
      tw: null, fb: 300, lr: 300, sw: 300, useHint: false,
      expected: G.zeroTw.gimbal2,
    })
  })
})

// ---------------------------------------------------------------------------
// test_DecomposeRotationsZeroFB
// ---------------------------------------------------------------------------

describe('test_DecomposeRotationsZeroFB', () => {
  it('decomposes with FB zeroed', () => {
    testDecomposeRotation(ROT, {
      tw: 300, fb: null, lr: 300, sw: 300, useHint: false,
      expected: G.zeroFB.noHints,
    })
    testDecomposeRotation(ROT, {
      tw: -1.0, fb: null, lr: 2.0, sw: -2.0, useHint: true,
      expected: G.zeroFB.hint1,
    })
    testDecomposeRotation(ROT, {
      tw: 2.0, fb: null, lr: -2.0, sw: 1.0, useHint: true,
      expected: G.zeroFB.hint2,
    })
    testDecomposeRotation(ROT, {
      tw: 21.0, fb: null, lr: 30.0, sw: -12.0, useHint: true,
      expected: G.zeroFB.shift2pi,
    })

    const gfb1 = new GfMatrix4d(
      -0.70710678118654746, 0.70710678118654768, 0.0, 0.0,
      -0.70710678118654768, -0.70710678118654746, 0.0, 0.0,
      0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0,
    )
    testDecomposeRotation(gfb1, {
      tw: 300, fb: null, lr: 300, sw: 300, useHint: false,
      expected: G.zeroFB.gimbal1,
    })

    const gfb2 = new GfMatrix4d(
      -0.70710678118654746, -0.70710678118654768, 0.0, 0.0,
      -0.70710678118654768, 0.70710678118654746, 0.0, 0.0,
      0.0, 0.0, -1.0, 0.0, 0.0, 0.0, 0.0, 1.0,
    )
    testDecomposeRotation(gfb2, {
      tw: 300, fb: null, lr: 300, sw: 300, useHint: false,
      expected: G.zeroFB.gimbal2,
    })
  })
})

// ---------------------------------------------------------------------------
// test_DecomposeRotationsZeroLR
// ---------------------------------------------------------------------------

describe('test_DecomposeRotationsZeroLR', () => {
  it('decomposes with LR zeroed', () => {
    testDecomposeRotation(ROT, {
      tw: 300, fb: 300, lr: null, sw: 300, useHint: false,
      expected: G.zeroLR.noHints,
    })
    testDecomposeRotation(ROT, {
      tw: -3.0, fb: 2.0, lr: null, sw: 0.0, useHint: true,
      expected: G.zeroLR.hint1,
    })
    testDecomposeRotation(ROT, {
      tw: 0.0, fb: -2.0, lr: null, sw: 3.0, useHint: true,
      expected: G.zeroLR.hint2,
    })
    testDecomposeRotation(ROT, {
      tw: 13.0, fb: 5.0, lr: null, sw: -23.0, useHint: true,
      expected: G.zeroLR.shift2pi,
    })

    const glr1 = new GfMatrix4d(
      -0.70710678118654746, 0.70710678118654768, 0.0, 0.0,
      -0.70710678118654768, -0.70710678118654746, 0.0, 0.0,
      0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0,
    )
    testDecomposeRotation(glr1, {
      tw: 300, fb: 300, lr: null, sw: 300, useHint: false,
      expected: G.zeroLR.gimbal1,
    })

    const glr2 = new GfMatrix4d(
      -0.70710678118654746, -0.70710678118654768, 0.0, 0.0,
      -0.70710678118654768, 0.70710678118654746, 0.0, 0.0,
      0.0, 0.0, -1.0, 0.0, 0.0, 0.0, 0.0, 1.0,
    )
    testDecomposeRotation(glr2, {
      tw: 300, fb: 300, lr: null, sw: 300, useHint: false,
      expected: G.zeroLR.gimbal2,
    })
  })
})

// ---------------------------------------------------------------------------
// test_DecomposeRotationsZeroSw
// ---------------------------------------------------------------------------

describe('test_DecomposeRotationsZeroSw', () => {
  it('decomposes with Sw zeroed', () => {
    testDecomposeRotation(ROT, {
      tw: 300, fb: 300, lr: 300, sw: null, useHint: false,
      expected: G.zeroSw.noHints,
    })
    testDecomposeRotation(ROT, {
      tw: -2.0, fb: 2, lr: 1.0, sw: null, useHint: true,
      expected: G.zeroSw.hint1,
    })
    testDecomposeRotation(ROT, {
      tw: 2.0, fb: -1.0, lr: -2.0, sw: null, useHint: true,
      expected: G.zeroSw.hint2,
    })
    testDecomposeRotation(ROT, {
      tw: -20.0, fb: 8, lr: -12, sw: null, useHint: true,
      expected: G.zeroSw.shift2pi,
    })

    const g = new GfMatrix4d(
      -0.70710678118654746, 0.0, 0.70710678118654768, 0.0,
      -0.70710678118654768, 0.0, -0.70710678118654746, 0.0,
      0.0, -1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0,
    )
    testDecomposeRotation(g, {
      tw: 300, fb: 300, lr: 300, sw: null, useHint: false,
      expected: G.zeroSw.gimbal1,
    })

    const g2 = new GfMatrix4d(
      -0.70710678118654746, 0.0, -0.70710678118654768, 0.0,
      -0.70710678118654768, 0.0, 0.70710678118654746, 0.0,
      0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0,
    )
    testDecomposeRotation(g2, {
      tw: 300, fb: 300, lr: 300, sw: null, useHint: false,
      expected: G.zeroSw.gimbal2,
    })
  })
})

// ---------------------------------------------------------------------------
// test_DecomposeWithSwingShift
// ---------------------------------------------------------------------------

describe('test_DecomposeWithSwingShift', () => {
  it('decomposes into four angles using swing shift', () => {
    const swShift = 2.132495
    // Final rotation with swing applied to the matrix.
    const swMat = new GfMatrix4d(
      new GfMatrix3d(makeRotation([0, 0, 1], GfRadiansToDegrees(swShift))),
      new GfVec3d(0, 0, 0),
    )
    const rotWithSwing = ROT.getMultiply(swMat)

    const twAxis = new GfVec3d(0, 0, 1)
    const fb = new GfVec3d(1, 0, 0)
    const lr = new GfVec3d(0, 1, 0)
    const dec = (tw: Hint, fbH: Hint, lrH: Hint, sw: Hint, useHint: boolean): [number, number, number, number] =>
      GfDecomposeRotation(ROT, twAxis, fb, lr, 1, {
        thetaTwHint: tw, thetaFBHint: fbH, thetaLRHint: lrH, thetaSwHint: sw,
        useHint, swShift,
      })

    const check = (
      result: readonly number[],
      expected: readonly number[],
    ): void => {
      for (let i = 0; i < expected.length; i++) almostEqual(result[i]!, expected[i]!)
      expect(isMatrixClose(composeRotation('XYZ', result), rotWithSwing)).toBe(true)
    }

    // No hints
    check(dec(300, 300, 300, 300, false),
      G.swingShift.noHints)
    // Hints variation 1
    check(dec(0, 0, 0, 0, true),
      G.swingShift.hint1)
    // Hints variation 2
    check(dec(-2.0, -2.0, 2.0, -1.0, true),
      G.swingShift.hint2)
    // Hints variation 3
    check(dec(-2.0, 2.0, 1.0, 3.0, true),
      G.swingShift.hint3)
    // Hints variation 4
    check(dec(2.0, 1.0, -2.0, 3.0, true),
      G.swingShift.hint4)
    // Hints variation 3 (repeated in the .py)
    check(dec(-2.0, 2.0, 1.0, 3.0, true),
      G.swingShift.hint3b)
    // Use hints shifted by multiples of 2pi
    check(dec(14.0, 4.0, -20.0, -16, true),
      G.swingShift.shift2pi)
  })
})

// ---------------------------------------------------------------------------
// test_DecomposeRotation3
// ---------------------------------------------------------------------------

describe('test_DecomposeRotation3', () => {
  it('returns a 3-tuple identical to the zero-Sw decomposition', () => {
    const twAxis = new GfVec3d(0, 0, 1)
    const fb = new GfVec3d(1, 0, 0)
    const lr = new GfVec3d(0, 1, 0)

    // No hints
    let [thetaTw, thetaFB, thetaLR] = GfDecomposeRotation3(ROT, twAxis, fb, lr, 1)
    almostEqual(thetaTw, G.decompose3.noHints[0])
    almostEqual(thetaFB, G.decompose3.noHints[1])
    almostEqual(thetaLR, G.decompose3.noHints[2])
    expect(isMatrixClose(composeRotation('XYZ', [thetaTw, thetaFB, thetaLR, 0.0]), ROT)).toBe(true)

    // Hints variation 1
    ;[thetaTw, thetaFB, thetaLR] = GfDecomposeRotation3(ROT, twAxis, fb, lr, 1, -2.0, 2, 1.0, true)
    almostEqual(thetaTw, G.decompose3.hint1[0])
    almostEqual(thetaFB, G.decompose3.hint1[1])
    almostEqual(thetaLR, G.decompose3.hint1[2])
    expect(isMatrixClose(composeRotation('XYZ', [thetaTw, thetaFB, thetaLR, 0.0]), ROT)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// test_GimbalLockEdgeCases
// ---------------------------------------------------------------------------

describe('test_GimbalLockEdgeCases', () => {
  it('round-trips every axis-swap permutation with each angle zeroed', () => {
    const mats: GfMatrix3d[] = []
    const neg = (v: GfVec3d): GfVec3d => new GfVec3d(-v.get(0), -v.get(1), -v.get(2))
    const fixHand = (m: GfMatrix3d): GfMatrix3d =>
      m.isLeftHanded() ? (m.getScalarMultiply(-1.0) as GfMatrix3d) : m

    for (const key of ORDERS) {
      const a = axes[key]!
      const build = (r0: GfVec3d, r1: GfVec3d, r2: GfVec3d): void => {
        const m = new GfMatrix3d(1.0)
        m.setRow(0, r0); m.setRow(1, r1); m.setRow(2, r2)
        mats.push(fixHand(m))
      }
      build(a[0], a[1], a[2])
      build(neg(a[0]), neg(a[1]), a[2])
      build(neg(a[0]), a[1], neg(a[2]))
      build(a[0], neg(a[1]), neg(a[2]))
    }

    for (const mat of mats) {
      const rot = new GfMatrix4d(mat, new GfVec3d(0, 0, 0))
      testDecomposeRotation(rot)
      testDecomposeRotation(rot, { tw: null })
      testDecomposeRotation(rot, { fb: null })
      testDecomposeRotation(rot, { lr: null })
      testDecomposeRotation(rot, { sw: null })
    }
  })
})

// ---------------------------------------------------------------------------
// TestClosestEulerRotation
// ---------------------------------------------------------------------------

const TWO_PI = 2.0 * Math.PI
// Python's % returns a result with the sign of the divisor; JS's % uses the
// dividend. Replicate Python semantics for the equivalence-mod-2pi check.
const pymod = (x: number, m: number): number => ((x % m) + m) % m

// Deterministic RNG (mulberry32) — the random one/two-channel tests assert
// mathematical PROPERTIES, so any reproducible stream over the range works.
function makeRng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const NUM_TESTS = 100
const TEST_RANGE = 12.0 * Math.PI

const M3 = G.matchThree, M4 = G.matchFour

describe('TestClosestEulerRotation', () => {
  // Mirrors _TestEquivalentRotation: a null channel must be 0; otherwise the
  // result is within Pi of the hint and equivalent to val modulo 2*Pi.
  const testEquivalentRotation = (val: number | null, hint: number, result: number): void => {
    if (val === null) {
      expect(result).toBe(0.0)
      return
    }
    expect(Math.abs(result - hint)).toBeLessThanOrEqual(Math.PI + 1e-9)
    expect(pymod(val, TWO_PI)).toBeCloseTo(pymod(result, TWO_PI), 6)
  }

  it('testOneChannel', () => {
    const rng = makeRng(0xC0FFEE)
    for (let channel = 0; channel < 4; channel++) {
      for (let i = 0; i < NUM_TESTS; i++) {
        const hint: number[] = [0, 0, 0, 0]
        const val: (number | null)[] = [null, null, null, null]
        hint[channel] = (rng() * 2 - 1) * TEST_RANGE
        val[channel] = (rng() * 2 - 1) * TEST_RANGE
        const result = GfMatchClosestEulerRotation(
          hint[0]!, hint[1]!, hint[2]!, hint[3]!,
          val[0]!, val[1]!, val[2]!, val[3]!,
        )
        for (let c = 0; c < 4; c++) testEquivalentRotation(val[c]!, hint[c]!, result[c]!)
      }
    }
  })

  it('testTwoChannels', () => {
    const rng = makeRng(0x1234)
    for (let i = 0; i < NUM_TESTS; i++) {
      // Pick two distinct channels.
      const idx1 = Math.floor(rng() * 4)
      let idx2 = Math.floor(rng() * 4)
      while (idx2 === idx1) idx2 = Math.floor(rng() * 4)
      const vals: (number | null)[] = [null, null, null, null]
      const hints: number[] = [0, 0, 0, 0]
      vals[idx1] = (rng() * 2 - 1) * TEST_RANGE
      vals[idx2] = (rng() * 2 - 1) * TEST_RANGE
      hints[idx1] = (rng() * 2 - 1) * TEST_RANGE
      hints[idx2] = (rng() * 2 - 1) * TEST_RANGE
      const result = GfMatchClosestEulerRotation(
        hints[0]!, hints[1]!, hints[2]!, hints[3]!,
        vals[0]!, vals[1]!, vals[2]!, vals[3]!,
      )
      for (let c = 0; c < 4; c++) testEquivalentRotation(vals[c]!, hints[c]!, result[c]!)
    }
  })

  it('testThreeChannels', () => {
    const valOuter = (5.0 * Math.PI) / 6.0
    const valInner = Math.PI / 5.0
    const hint = Math.PI / 2.0

    // Test flips in FB/LR/SW (captured from the OpenUSD build via genfix).
    let result = GfMatchClosestEulerRotation(0, 0, hint, 0, null, valOuter, valInner, valOuter)
    expect(result[0]).toBe(M3.flipFBLRSW[0])
    almostEqual(result[1], M3.flipFBLRSW[1])
    almostEqual(result[2], M3.flipFBLRSW[2])
    almostEqual(result[3], M3.flipFBLRSW[3])

    // Test flips in TW/LR/SW
    result = GfMatchClosestEulerRotation(0, 0, hint, 0, valOuter, null, valInner, valOuter)
    expect(result[1]).toBe(M3.flipTWLRSW[1])
    almostEqual(result[0], M3.flipTWLRSW[0])
    almostEqual(result[2], M3.flipTWLRSW[2])
    almostEqual(result[3], M3.flipTWLRSW[3])

    // Test flips in TW/FB/SW
    result = GfMatchClosestEulerRotation(0, hint, 0, 0, valOuter, valInner, null, valOuter)
    expect(result[2]).toBe(M3.flipTWFBSW[2])
    almostEqual(result[0], M3.flipTWFBSW[0])
    almostEqual(result[1], M3.flipTWFBSW[1])
    almostEqual(result[3], M3.flipTWFBSW[3])

    // Test flips in TW/FB/LR
    result = GfMatchClosestEulerRotation(0, hint, 0, 0, valOuter, valInner, valOuter, null)
    expect(result[3]).toBe(M3.flipTWFBLR[3])
    almostEqual(result[0], M3.flipTWFBLR[0])
    almostEqual(result[1], M3.flipTWFBLR[1])
    almostEqual(result[2], M3.flipTWFBLR[2])

    // Test no flipping necessary
    result = GfMatchClosestEulerRotation(0, hint, 0, hint, null, valOuter, valInner, valOuter)
    expect(result[0]).toBe(M3.noFlip[0])
    expect(result[1]).toBe(M3.noFlip[1])
    expect(result[2]).toBe(M3.noFlip[2])
    expect(result[3]).toBe(M3.noFlip[3])
  })

  it('testFourChannels', () => {
    const valOuter = (5.0 * Math.PI) / 6.0
    const valInner = Math.PI / 5.0
    const hint = Math.PI / 2.0

    // Case 0, no flipping
    let result = GfMatchClosestEulerRotation(0, 0, hint, hint, valOuter, valInner, valInner, valOuter)
    almostEqual(result[0], M4.case0[0])
    almostEqual(result[1], M4.case0[1])
    almostEqual(result[2], M4.case0[2])
    almostEqual(result[3], M4.case0[3])

    // Case 1, transform 1st 3
    result = GfMatchClosestEulerRotation(0, hint, 0, hint, valOuter, valInner, valInner, valOuter)
    almostEqual(result[0], M4.case1[0])
    almostEqual(result[1], M4.case1[1])
    almostEqual(result[2], M4.case1[2])
    almostEqual(result[3], M4.case1[3])

    // Case 2, 1 & 3 composed
    result = GfMatchClosestEulerRotation(0, hint, hint, 0, valOuter, valInner, valInner, valOuter)
    almostEqual(result[0], M4.case2[0])
    almostEqual(result[1], M4.case2[1])
    almostEqual(result[2], M4.case2[2])
    almostEqual(result[3], M4.case2[3])

    // Case 3, transform last 3
    result = GfMatchClosestEulerRotation(hint, 0, hint, 0, valOuter, valInner, valInner, valOuter)
    expect(result[0]).toBe(M4.case3[0])
    almostEqual(result[1], M4.case3[1])
    almostEqual(result[2], M4.case3[2])
    almostEqual(result[3], M4.case3[3])

    // Case 3, transform last 3 + 2pi flip on FB
    result = GfMatchClosestEulerRotation(hint, hint, hint, 0, valOuter, valInner, valInner, valOuter)
    expect(result[0]).toBe(M4.case3b[0])
    almostEqual(result[1], M4.case3b[1])
    almostEqual(result[2], M4.case3b[2])
    almostEqual(result[3], M4.case3b[3])
  })
})

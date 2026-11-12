// Ported from OpenUSD 26.11.1: pxr/base/ts/testenv/testTsSplineBaking.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.08 pxr/base/ts/testenv/testTsSplineBaking.cpp. The
// baked knots in fixtures/tsOracle.json ("bake") were captured from the
// v26.11.1 build (FIXTURES.md).
import { describe, expect, it } from 'vitest'
import { Interval as GfInterval } from 'typescript-usd/gf'
import {
  AntiRegressionAuthoringSelector, AntiRegressionNone, ExtrapMode, LoopParams,
  Spline, TsTest_Museum, type Knot,
} from '../../src/index.ts'
import { expectKnotsClose, interval, oracle } from './tsOracle.ts'

const OPEN = false
const valueTypes = ['double', 'float', 'GfHalf'] as const
// testTsSplineBaking.cpp:96-101.
const epsilons: Record<(typeof valueTypes)[number], number> = {
  double: 1.0e-10,
  float: 1.0e-5,
  GfHalf: 7.0e-3,
}

const lerp = (u: number, a: number, b: number): number => (1 - u) * a + u * b

// TsKnotMap::GetTimeSpan.
function timeSpan(knots: readonly Knot[]): GfInterval {
  if (knots.length === 0) return new GfInterval()
  return new GfInterval(knots[0]!.getTime(), knots[knots.length - 1]!.getTime())
}

function knotsEqual(a: readonly Knot[], b: readonly Knot[]): boolean {
  return a.length === b.length && a.every((k, i) => k.equals(b[i]!))
}

// testTsSplineBaking.cpp:26-37.
function NormalizeInterval(spline: Spline, iv: GfInterval): GfInterval {
  const normInterval = iv.clone()
  if (spline.getPostExtrapolation().mode === ExtrapMode.ValueBlock ||
      !spline.isPostExtrapolationValid()) {
    normInterval.setMax(iv.getMax(), OPEN)
  }
  return normInterval
}

// testTsSplineBaking.cpp:39-71: knot span, widened by inner loops.
function TimeInterval(name: string): GfInterval {
  const spline = TsTest_Museum.getSplineByName(name, 'double')
  const knotInterval = timeSpan(spline.getKnots())
  if (spline.hasInnerLoops()) {
    knotInterval.unionWith(spline.getInnerLoopParams().getLoopedInterval())
  }
  return knotInterval
}

// testTsSplineBaking.cpp:103-170.
function VerifySplineEquivalence(
  spline1: Spline, spline2: Spline, iv: GfInterval, epsilon: number, msg: string,
): void {
  for (let i = 0; i < 101; ++i) {
    const t = lerp(i / 100.0, iv.getMin(), iv.getMax())
    let v1: number | undefined
    let v2: number | undefined
    if (i === 100 && iv.isMaxOpen()) {
      v1 = spline1.evalPreValue(t)
      v2 = spline2.evalPreValue(t)
    } else {
      v1 = spline1.eval(t)
      v2 = spline2.eval(t)
    }
    if (v1 === undefined && v2 === undefined) continue
    const where = `${msg}: time=${t} interval=${iv.toString()}`
    expect(v1 !== undefined && v2 !== undefined, `${where}: value-block mismatch (${v1}, ${v2})`).toBe(true)
    expect(Math.abs(v1! - v2!) < epsilon, `${where}: ${v1} vs ${v2}`).toBe(true)
  }
}

describe('testTsSplineBaking', () => {
  // testTsSplineBaking.cpp:172-237.
  for (const name of TsTest_Museum.getAllNames()) {
    it(`TestBakeInnerLoops: ${name}`, () => {
      for (const valueType of valueTypes) {
        const splineId = `${name}<${valueType}>`
        const spline1 = TsTest_Museum.getSplineByName(name, valueType)
        const spline2 = spline1.clone()
        const knots1 = spline1.getKnots()
        expect(spline2.bakeInnerLoops(), splineId).toBe(true)
        const knots2 = spline2.getKnots()

        if (spline1.hasInnerLoops()) {
          expect(spline1.equals(spline2), `${splineId}: unchanged after BakeInnerLoops`).toBe(false)
        } else {
          expect(spline1.equals(spline2), `${splineId}: changed after BakeInnerLoops`).toBe(true)
        }
        expect(spline2.getInnerLoopParams().equals(new LoopParams()), splineId).toBe(true)
        expect(spline1.equals(TsTest_Museum.getSplineByName(name, valueType)), splineId).toBe(true)

        const verifyInterval = timeSpan(knots1).getUnion(timeSpan(knots2))
        VerifySplineEquivalence(spline1, spline2, NormalizeInterval(spline1, verifyInterval),
          epsilons[valueType], splineId)
      }
    })
  }

  // testTsSplineBaking.cpp:239-302.
  for (const name of TsTest_Museum.getAllNames()) {
    it(`TestGetKnotsWithInnerLoopsBaked: ${name}`, () => {
      for (const valueType of valueTypes) {
        const splineId = `${name}<${valueType}>`
        const spline1 = TsTest_Museum.getSplineByName(name, valueType)
        const spline2 = TsTest_Museum.getSplineByName(name, valueType)
        const spline3 = new Spline(valueType)
        const knots1 = spline1.getKnots()
        const bakedKnots = spline1.getKnotsWithInnerLoopsBaked()
        expect(spline1.equals(TsTest_Museum.getSplineByName(name, valueType)), splineId).toBe(true)

        spline2.bakeInnerLoops()
        expect(knotsEqual(bakedKnots, spline2.getKnots()),
          `${splineId}: GetKnotsWithInnerLoopsBaked differs from BakeInnerLoops`).toBe(true)

        const selector = new AntiRegressionAuthoringSelector(AntiRegressionNone)
        spline3.setKnots(bakedKnots)
        selector.close()
        spline3.setPreExtrapolation(spline1.getPreExtrapolation())
        spline3.setPostExtrapolation(spline1.getPostExtrapolation())

        const verifyInterval = timeSpan(knots1).getUnion(timeSpan(bakedKnots))
        VerifySplineEquivalence(spline1, spline3, NormalizeInterval(spline1, verifyInterval),
          epsilons[valueType], splineId)
      }
    })
  }

  // testTsSplineBaking.cpp:304-372.
  for (const name of TsTest_Museum.getAllNames()) {
    it(`TestGetKnotsWithLoopsBaked: ${name}`, () => {
      const iv = TimeInterval(name)
      for (const valueType of valueTypes) {
        const splineId = `${name}<${valueType}>`
        const spline1 = TsTest_Museum.getSplineByName(name, valueType)
        const shortInterval = new GfInterval(
          lerp(0.25, iv.getMin(), iv.getMax()), lerp(0.75, iv.getMin(), iv.getMax()))
        const longInterval = new GfInterval(
          lerp(-0.5, iv.getMin(), iv.getMax()), lerp(1.5, iv.getMin(), iv.getMax()))

        const shortSpline = new Spline(valueType)
        const mediumSpline = new Spline(valueType)
        const longSpline = new Spline(valueType)
        const selector = new AntiRegressionAuthoringSelector(AntiRegressionNone)
        shortSpline.setKnots(spline1.getKnotsWithLoopsBaked(shortInterval))
        mediumSpline.setKnots(spline1.getKnotsWithLoopsBaked(iv))
        longSpline.setKnots(spline1.getKnotsWithLoopsBaked(longInterval))
        selector.close()
        longSpline.setPreExtrapolation(spline1.getPreExtrapolation())
        longSpline.setPostExtrapolation(spline1.getPostExtrapolation())

        VerifySplineEquivalence(spline1, shortSpline,
          NormalizeInterval(spline1, shortInterval), epsilons[valueType], `${splineId} short`)
        VerifySplineEquivalence(spline1, mediumSpline,
          NormalizeInterval(spline1, iv), epsilons[valueType], `${splineId} medium`)
        VerifySplineEquivalence(spline1, longSpline,
          NormalizeInterval(spline1, longInterval), epsilons[valueType], `${splineId} long`)
      }
    })
  }
})

describe('testTsSplineBaking: v26.11.1 baked knots', () => {
  for (const [name, expected] of Object.entries(oracle.bake)) {
    it(name, () => {
      const spline = TsTest_Museum.getSplineByName(name)
      expectKnotsClose(spline.getKnotsWithLoopsBaked(interval(expected.interval)),
        expected.loopsBaked, `${name} GetKnotsWithLoopsBaked`)
      expectKnotsClose(spline.getKnotsWithInnerLoopsBaked(), expected.innerBaked,
        `${name} GetKnotsWithInnerLoopsBaked`)
    })
  }
})

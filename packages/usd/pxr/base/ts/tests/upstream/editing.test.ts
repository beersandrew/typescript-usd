// Ported from OpenUSD 26.11.1:
//  pxr/base/ts/testenv/testTsRegressionPreventer.py,
//  pxr/base/ts/testenv/testTsRegressionPreventerCpp.cpp,
//  pxr/base/ts/testenv/testTsSplineBaking.cpp,
//  pxr/base/ts/testenv/testTsSplineBreakdown.py,
//  pxr/base/ts/testenv/testTsSplineTransforms.cpp
// Copyright 2024, 2025, 2026 Pixar. Tomorrow Open Source Technology License
//  1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.08 pxr/base/ts/testenv/testTsSplineBreakdown.py,
// testTsSplineBaking.cpp, testTsSplineTransforms.cpp,
// testTsRegressionPreventer.py, and testTsRegressionPreventerCpp.cpp.
// Expected values were captured from the v26.08 reference Python build.
import { describe, expect, it } from 'vitest'
import { Interval as GfInterval } from 'typescript-usd/gf'
import {
  AntiRegressionAuthoringSelector, AntiRegressionKeepRatio, InterpCurve,
  InterpLinear, Knot, LoopParams, RegressionPreventer, Spline,
} from '../../src/index.ts'

function linearSpline(): Spline {
  const spline = new Spline()
  spline.setKnot(new Knot({ time: 0, value: 0, nextInterp: InterpLinear }))
  spline.setKnot(new Knot({ time: 2, value: 2, nextInterp: InterpLinear }))
  return spline
}

describe('testTsSplineBreakdown', () => {
  it('inserts a shape-preserving knot', () => {
    const spline = linearSpline()
    const before = Array.from({ length: 21 }, (_, i) => spline.eval(i / 10))
    expect(spline.canBreakdown(0.75).value).toBe(true)
    expect(spline.breakdown(0.75)?.equals(new GfInterval(0, 2))).toBe(true)
    expect(spline.getKnot(0.75)?.GetValue()).toBe(0.75)
    expect(Array.from({ length: 21 }, (_, i) => spline.eval(i / 10))).toEqual(before)
    expect(spline.canBreakdown(0.75).value).toBe(false)
  })
})

describe('testTsSplineBaking', () => {
  it('bakes inner loop echoes and preserves evaluated values', () => {
    const spline = linearSpline()
    spline.setInnerLoopParams(new LoopParams(0, 2, 1, 2, 10))
    const oracle = [-10, -5, 0, 5, 10, 15, 20, 25, 30]
    const times = [-2, -1, 0, 1, 2, 3, 4, 5, 6]
    expect(times.map(t => spline.eval(t))).toEqual(oracle)
    expect(spline.bakeInnerLoops()).toBe(true)
    expect(spline.hasInnerLoops()).toBe(false)
    expect(times.map(t => spline.eval(t))).toEqual(oracle)
  })
})

describe('testTsSplineTransforms', () => {
  it('time-scales knot times, widths and slopes', () => {
    const spline = new Spline()
    spline.setKnot(new Knot({
      time: 1, value: 3, nextInterp: InterpCurve,
      preTanWidth: 2, preTanSlope: 4, postTanWidth: 3, postTanSlope: 6,
    }))
    // Negative scale reverses the knot's sides (splineData.h:640-680).
    const scaled = spline.getTimeScaled(-2, 10)
    const knot = scaled.getKnots()[0]!
    expect(knot.getTime()).toBe(8)
    expect(knot.getPreTanWidth()).toBe(6)
    expect(knot.getPostTanWidth()).toBe(4)
    expect(knot.getPreTanSlope()).toBe(-3)
    expect(knot.getPostTanSlope()).toBe(-2)
  })

  it('concatenates compatible boundary splines', () => {
    const a = linearSpline()
    const b = new Spline()
    b.setKnot(new Knot({ time: 2, value: 2, nextInterp: InterpLinear }))
    b.setKnot(new Knot({ time: 4, value: 8 }))
    const result = Spline.concatenate([a, b])
    expect(result.getKnots().map(k => k.getTime())).toEqual([0, 2, 4])
    expect(result.eval(3)).toBe(5)
  })
})

describe('testTsRegressionPreventer / testTsRegressionPreventerCpp', () => {
  it('leaves a non-curve segment alone', () => {
    const spline = linearSpline()
    const active = new Knot({ time: 0, value: 0, nextInterp: InterpCurve, postTanWidth: 4 })
    const result = new RegressionPreventer(spline, 0).Set(active)
    expect(result).toBeDefined()
    expect(result!.adjusted).toBe(false)
    expect(result!.havePostSegment).toBe(false)
    expect(spline.hasRegressiveTangents()).toBe(true)
    expect(spline.getKnot(0)!.getPostTanWidth()).toBe(4)
  })

  it('adjusts crossing tangent widths of a curve segment', () => {
    const selector = new AntiRegressionAuthoringSelector(AntiRegressionKeepRatio)
    const spline = new Spline()
    spline.setKnot(new Knot({ time: 0, value: 0, nextInterp: InterpCurve }))
    spline.setKnot(new Knot({ time: 2, value: 2, nextInterp: InterpLinear }))
    const active = new Knot({ time: 0, value: 0, nextInterp: InterpCurve, postTanWidth: 4 })
    const result = new RegressionPreventer(spline, 0).Set(active)
    expect(result!.getDebugDescription()).toBe(
      'TsRegressionPreventer::SetResult:\n  adjusted: true\n  havePreSegment: false\n' +
      '  preActiveAdjusted: false\n  preActiveAdjustedWidth: 0.000000\n' +
      '  preOppositeAdjusted: false\n  preOppositeAdjustedWidth: 0.000000\n' +
      '  havePostSegment: true\n  postActiveAdjusted: true\n' +
      '  postActiveAdjustedWidth: 1.999980\n  postOppositeAdjusted: false\n' +
      '  postOppositeAdjustedWidth: 0.000000\n')
    expect(spline.hasRegressiveTangents()).toBe(false)
    expect(spline.getKnot(0)!.getPostTanWidth()).toBeCloseTo(1.99998, 12)
    expect(spline.getKnot(2)!.getPreTanWidth()).toBe(0)
    selector.close()
  })
})

// Ported from OpenUSD 26.11.1: pxr/base/ts/testenv/testTsBugs.py,
//  pxr/base/ts/testenv/testTsDerivatives.py,
//  pxr/base/ts/testenv/testTsSplineEval.cpp,
//  pxr/base/ts/testenv/testTsSplineValueBlock.py,
//  pxr/base/ts/testenv/tsTest_TsVsBezier.py
// Copyright 2023, 2024, 2025 Pixar. Tomorrow Open Source Technology License
//  1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.08 pxr/base/ts/testenv/testTsSplineEval.cpp,
// testTsDerivatives.py, testTsBugs.py, testTsSplineValueBlock.py, and
// tsTest_TsVsBezier.py. Numeric expectations were captured from the v26.08
// reference Python build.
import { describe, expect, it } from 'vitest'
import {
  AntiRegressionAuthoringSelector, AntiRegressionNone, CurveTypeHermite,
  ExtrapLoopOscillate, ExtrapLoopRepeat, ExtrapSloped, ExtrapValueBlock,
  Extrapolation, InterpCurve, InterpLinear, Knot, Spline,
} from '../../src/index.ts'

function close(actual: number | undefined, expected: number | undefined, digits = 10): void {
  if (expected === undefined) expect(actual).toBeUndefined()
  else expect(actual).toBeCloseTo(expected, digits)
}

function curve(): Spline {
  const spline = new Spline()
  spline.setKnot(new Knot({
    time: 0, value: 1, nextInterp: InterpCurve,
    postTanWidth: 0.8, postTanSlope: 4,
  }))
  spline.setKnot(new Knot({
    time: 2, value: 5, preValue: 4, nextInterp: InterpCurve,
    preTanWidth: 0.7, preTanSlope: -2,
  }))
  return spline
}

describe('testTsSplineEval / testTsDerivatives', () => {
  it('matches v26.08 Bezier values and derivatives', () => {
    const selector = new AntiRegressionAuthoringSelector(AntiRegressionNone)
    const spline = curve()
    const oracle = [
      [0.25, 1.9685478006735224, 3.7249557241665014],
      [0.5, 2.8489789423330576, 3.2881046663334264],
      [1, 4.159361298560299, 1.820171844363886],
      [1.5, 4.5728512887998685, -0.19872413813107653],
    ] as const
    for (const [time, value, derivative] of oracle) {
      close(spline.eval(time), value, 9)
      close(spline.evalDerivative(time), derivative, 9)
    }
    close(spline.evalPreValue(2), 4)
    close(spline.eval(2), 5)
    close(spline.evalPreDerivative(2), -2)
    selector.close()
  })

  it('matches v26.08 Hermite values and derivatives', () => {
    const spline = curve()
    spline.setCurveType(CurveTypeHermite)
    close(spline.eval(0.5), 2.78125)
    close(spline.evalDerivative(0.5), 3.0625)
    close(spline.eval(1.5), 4.46875)
    close(spline.evalDerivative(1.5), 0.0625)
  })
})

describe('testTsBugs / tsTest_TsVsBezier', () => {
  it('evaluates regressive Bezier time tangents with runtime KeepRatio', () => {
    const selector = new AntiRegressionAuthoringSelector(AntiRegressionNone)
    const spline = new Spline()
    spline.setKnot(new Knot({ time: 0, value: 0, nextInterp: InterpCurve, postTanWidth: 3, postTanSlope: 1 }))
    spline.setKnot(new Knot({ time: 2, value: 2, preTanWidth: 2, preTanSlope: 1 }))
    close(spline.eval(0.5), 0.49999864382886083, 5)
    close(spline.eval(1.5), 1.500000035878512, 5)
    close(spline.evalDerivative(1), 1, 9)
    selector.close()
  })

  it('matches v26.08 looped extrapolation values', () => {
    const spline = new Spline()
    spline.setKnot(new Knot({ time: 1, value: 2, nextInterp: InterpLinear }))
    spline.setKnot(new Knot({ time: 3, value: 6 }))
    spline.setPreExtrapolation(new Extrapolation(ExtrapLoopRepeat))
    spline.setPostExtrapolation(new Extrapolation(ExtrapLoopRepeat))
    expect([-1, 0, 4, 5, 7].map(t => spline.eval(t))).toEqual([-2, 0, 8, 10, 14])
    spline.setPreExtrapolation(new Extrapolation(ExtrapLoopOscillate))
    spline.setPostExtrapolation(new Extrapolation(ExtrapLoopOscillate))
    expect([-1, 0, 4, 5, 7].map(t => spline.eval(t))).toEqual([6, 4, 4, 2, 6])
  })
})

describe('testTsSplineValueBlock', () => {
  it('blocks both extrapolation regions including the post-side knot', () => {
    const spline = new Spline()
    spline.setKnot(new Knot({ time: 1, value: 2, nextInterp: InterpLinear }))
    spline.setKnot(new Knot({ time: 3, value: 6 }))
    spline.setPreExtrapolation(new Extrapolation(ExtrapValueBlock))
    spline.setPostExtrapolation(new Extrapolation(ExtrapValueBlock))
    expect(spline.eval(0)).toBeUndefined()
    expect(spline.evalPreValue(1)).toBeUndefined()
    expect(spline.eval(1)).toBe(2)
    expect(spline.evalPreValue(3)).toBe(6)
    expect(spline.eval(3)).toBeUndefined()
    expect(spline.eval(4)).toBeUndefined()
  })

  it('uses authored sloped extrapolation', () => {
    const spline = curve()
    spline.setPreExtrapolation(new Extrapolation(ExtrapSloped, 3))
    spline.setPostExtrapolation(new Extrapolation(ExtrapSloped, 3))
    close(spline.eval(-1), -2)
    close(spline.eval(3), 8)
  })
})

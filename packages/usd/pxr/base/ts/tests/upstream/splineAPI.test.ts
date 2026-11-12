// Ported from OpenUSD 26.11.1: pxr/base/ts/testenv/testTsSplineAPI.cpp,
//  pxr/base/ts/testenv/testTsSplineAPIPy.py,
//  pxr/base/ts/testenv/testTsThreadedCOW.cpp,
//  pxr/base/ts/testenv/tsTest_TsFramework.py
// Copyright 2023, 2024, 2025 Pixar. Tomorrow Open Source Technology License
//  1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.08 pxr/base/ts/testenv/testTsSplineAPI.cpp,
// testTsSplineAPIPy.py, and testTsThreadedCOW.cpp. tsTest_TsFramework.py is
// ported in tsTestFramework.test.ts.
import { describe, expect, it } from 'vitest'
import { Interval as GfInterval } from 'typescript-usd/gf'
import {
  CurveTypeHermite, ExtrapLoopRepeat, Extrapolation, InterpCurve, Knot,
  LoopParams, Spline, TsTest_Museum,
} from '../../src/index.ts'

function knot(time: number, value: number): Knot {
  return new Knot({ time, value, nextInterp: InterpCurve })
}

describe('testTsSplineAPI / testTsSplineAPIPy', () => {
  it('exposes knot-map mutation, spline state and predicates', () => {
    const spline = new Spline()
    expect(spline.IsEmpty()).toBe(true)
    spline.setKnot(knot(2, 4))
    spline.setKnot(knot(0, 1))
    expect(spline.getKnots().map(k => k.getTime())).toEqual([0, 2])
    expect(spline.getKnots().has(2)).toBe(true)
    expect(spline.getKnot(2)?.GetValue()).toBe(4)
    spline.setCurveType(CurveTypeHermite)
    expect(spline.getCurveType()).toBe(CurveTypeHermite)
    spline.removeKnot(0)
    expect(spline.getKnots()).toHaveLength(1)
    spline.clearKnots()
    expect(spline.IsEmpty()).toBe(true)
  })

  it('reports loops and value types', () => {
    const spline = new Spline('float')
    spline.setKnot(knot(0, 0))
    spline.setKnot(knot(2, 2))
    spline.setPreExtrapolation(new Extrapolation(ExtrapLoopRepeat))
    const loop = new LoopParams(0, 2, 1, 1, 3)
    spline.setInnerLoopParams(loop)
    expect(spline.GetValueTypeName()).toBe('float')
    expect(spline.hasLoops()).toBe(true)
    expect(spline.hasInnerLoops()).toBe(true)
    expect(spline.hasExtrapolatingLoops()).toBe(true)
  })
})

describe('testTsThreadedCOW', () => {
  it('keeps cloned storage independent under mutation', () => {
    const source = new Spline()
    source.setKnot(knot(0, 1))
    const copy = source.clone()
    copy.setKnot(knot(1, 3))
    expect(source.getKnots()).toHaveLength(1)
    expect(copy.getKnots()).toHaveLength(2)
    const fetched = copy.getKnot(1)!
    fetched.setValue(9)
    expect(copy.getKnot(1)?.GetValue()).toBe(3)
  })
})

describe('TsSpline::GetKnots(interval)', () => {
  // knotMap.cpp:61-125; expected knot times captured from the v26.08 build.
  it('includes the knots bounding the segments the interval touches', () => {
    const times = (name: string, min: number, max: number): number[] =>
      TsTest_Museum.getSplineByName(name).getKnots(new GfInterval(min, max)).map(k => k.getTime())
    expect(times('TwoKnotBezier', 2, 4)).toEqual([1, 5])
    expect(times('FourKnotBezier', 1.75, 3.25)).toEqual([1, 2, 3, 4])
  })
})

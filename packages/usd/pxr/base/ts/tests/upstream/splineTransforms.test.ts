// Ported from OpenUSD 26.11.1: pxr/base/ts/testenv/testTsSplineTransforms.cpp
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.08 pxr/base/ts/testenv/testTsSplineTransforms.cpp
// (TestTruncate and TestGetTimeScaled). The truncated and time-scaled splines
// in fixtures/tsOracle.json were captured from the v26.11.1 build
// (FIXTURES.md).
import { describe, expect, it } from 'vitest'
import { Interval as GfInterval } from 'typescript-usd/gf'
import {
  ExtrapMode, Extrapolation, InterpCurve, Knot, Spline, TsTest_Museum,
} from '../../src/index.ts'
import { expectSplineClose, interval, oracle } from './tsOracle.ts'

const inf = Infinity
const OPEN = false
const CLOSED = true

// testTsSplineTransforms.cpp:44-129.
function VerifySplineEquivalence(
  spline1: Spline, spline2: Spline, truncInterval: GfInterval,
  checkInterval: GfInterval, epsilon: number, msg: string,
): void {
  for (let i = 0; i < 101; ++i) {
    const u = i / 100.0
    const t = (1 - u) * checkInterval.getMin() + u * checkInterval.getMax()
    let v1: number | undefined
    let v2: number | undefined
    if (i === 100 && checkInterval.isMaxOpen()) {
      v1 = spline1.evalPreValue(t)
      v2 = spline2.evalPreValue(t)
    } else {
      v1 = spline1.eval(t)
      v2 = spline2.eval(t)
    }
    if (v1 === undefined && v2 === undefined) continue
    const where = `${msg}: time=${t} truncInterval=${truncInterval.toString()} ` +
      `checkInterval=${checkInterval.toString()}`
    expect(v1 !== undefined && v2 !== undefined,
      `${where}: value-block mismatch (${v1}, ${v2})`).toBe(true)
    expect(Math.abs(v1! - v2!) < epsilon, `${where}: ${v1} vs ${v2}`).toBe(true)
  }
}

function checkIntervalFor(truncInterval: GfInterval): GfInterval {
  const checkInterval = truncInterval.clone()
  if (!checkInterval.isMinFinite()) {
    checkInterval.setMin(Math.min(checkInterval.getMax() - 100, -100.0), CLOSED)
  }
  if (!checkInterval.isMaxFinite()) {
    checkInterval.setMax(checkInterval.getMin() + 200, OPEN)
  }
  return checkInterval
}

describe('testTsSplineTransforms: TestTruncate', () => {
  // testTsSplineTransforms.cpp:131-216.
  it('TestTruncateBaseCases', () => {
    const knots: Knot[] = []
    const knot = new Knot()
    knot.SetTime(3)
    knot.setValue(5.0)
    knots.push(knot.clone())
    knot.setPreValue(2.0)
    knots.push(knot.clone())

    const sloped = new Extrapolation(ExtrapMode.Sloped)
    sloped.slope = 5.0
    const extraps: [Extrapolation, string][] = [
      [new Extrapolation(ExtrapMode.ValueBlock), 'ValueBlock'],
      [new Extrapolation(ExtrapMode.Held), 'Held'],
      [new Extrapolation(ExtrapMode.Linear), 'Linear'],
      [new Extrapolation(ExtrapMode.LoopRepeat), 'LoopRepeat'],
      [new Extrapolation(ExtrapMode.LoopReset), 'LoopReset'],
      [new Extrapolation(ExtrapMode.LoopOscillate), 'LoopOscillate'],
      [sloped, 'Sloped'],
    ]

    const splines: [Spline, string][] = []
    for (const [extrap, extrapName] of extraps) {
      for (const k of knots) {
        const spline = new Spline()
        spline.setKnot(k)
        spline.setPreExtrapolation(extrap)
        spline.setPostExtrapolation(extrap)
        splines.push([spline,
          `BaseCaseSpline_Extrap${extrapName}${k.isDualValued() ? '_OneKnot' : '_OneKnotDV'}`])
      }
    }
    splines.push([new Spline(), 'BaseCaseSpline_Empty'])

    const intervals = [
      new GfInterval(-inf, +inf, OPEN, OPEN),
      new GfInterval(1.0, +inf, CLOSED, OPEN),
      new GfInterval(-inf, 5.0, OPEN, OPEN),
      new GfInterval(1.0, 5.0, CLOSED, OPEN),
      new GfInterval(3.0, 5.0, CLOSED, OPEN),
      new GfInterval(4.0, 5.0, CLOSED, OPEN),
      new GfInterval(1.0, 3.0, CLOSED, OPEN),
      new GfInterval(1.0, 2.0, CLOSED, OPEN),
    ]
    for (const [spline, splineId] of splines) {
      for (const truncInterval of intervals) {
        const truncated = spline.getTruncated(truncInterval)
        VerifySplineEquivalence(spline, truncated, truncInterval,
          checkIntervalFor(truncInterval), 1e-10, splineId)
      }
    }
  })

  // testTsSplineTransforms.cpp:218-325.
  const regressiveNames = [
    'CenterVertical', 'Cusp', 'FourThirdOneThird', 'FringeVert', 'OneThirdFourThird',
    'RegressiveLoop', 'RegressivePostC', 'RegressivePostFringe', 'RegressivePostG',
    'RegressivePostJ', 'RegressivePreC', 'RegressivePreFringe', 'RegressivePreG',
    'RegressivePreJ', 'RegressiveS', 'RegressiveSBothOut', 'RegressiveSPostOut',
    'RegressiveSPreOut', 'RegressiveSStandard', 'VerticalTorture',
  ]
  const scales = [
    new GfInterval(0, 1, CLOSED, OPEN),
    new GfInterval(0.1, 0.9, CLOSED, OPEN),
    new GfInterval(0.6, 1.5, CLOSED, OPEN),
    new GfInterval(-0.5, 0.4, CLOSED, OPEN),
    new GfInterval(-1, 2, CLOSED, OPEN),
    new GfInterval(-3.4, -0.1, CLOSED, OPEN),
    new GfInterval(10.2, 12.2, CLOSED, OPEN),
    new GfInterval(-inf, 0.8, OPEN, OPEN),
    new GfInterval(3.5, +inf, CLOSED, OPEN),
    new GfInterval(-inf, +inf, OPEN, OPEN),
  ]
  for (const name of TsTest_Museum.getAllNames()) {
    it(`TestTruncateMuseumCases: ${name}`, () => {
      const spline = TsTest_Museum.getSplineByName(name)
      const knots = spline.getKnots()
      if (knots.length < 2) {
        expect(oracle.truncate[name]).toBeUndefined()
        return
      }
      const epsilon = regressiveNames.includes(name) ? 0.01 : 1.0e-10
      const knotSpan = new GfInterval(knots[0]!.getTime(), knots[knots.length - 1]!.getTime())
      const spanSize = knotSpan.getSize()
      const expected = oracle.truncate[name]!

      scales.forEach((scale, i) => {
        const min = !scale.isMinFinite() ? -inf : knotSpan.getMin() + scale.getMin() * spanSize
        const max = !scale.isMaxFinite() ? +inf : knotSpan.getMax() + (scale.getMax() - 1) * spanSize
        const truncInterval = new GfInterval(min, max, scale.isMinClosed(), scale.isMaxClosed())
        expect(truncInterval.equals(interval(expected[i]!.interval)), `${name} interval ${i}`).toBe(true)

        const truncated = spline.getTruncated(truncInterval)
        expect(truncated.getKnots().length > 0, `${name}: truncated spline has no knots`).toBe(true)
        VerifySplineEquivalence(spline, truncated, truncInterval,
          checkIntervalFor(truncInterval), epsilon, name)
        expectSplineClose(truncated, expected[i]!.spline, `${name} ${truncInterval.toString()}`, 1e-8)
      })
    })
  }

  // testTsSplineTransforms.cpp:327-350.
  it('TestTruncateSpecificCases', () => {
    const splineOsc = new Spline()
    splineOsc.setPostExtrapolation(new Extrapolation(ExtrapMode.LoopOscillate))
    const k1 = new Knot()
    k1.SetTime(5)
    k1.setValue(10.0)
    k1.setNextInterpolation(InterpCurve)
    const k2 = new Knot()
    k2.SetTime(10)
    k2.setValue(5.0)
    splineOsc.setKnots([k1, k2])
    const oscInterval = new GfInterval(10, 12.5, CLOSED, OPEN)
    const truncOsc = splineOsc.getTruncated(oscInterval)
    VerifySplineEquivalence(splineOsc, truncOsc, oscInterval, oscInterval, 1e-10, 'splineOsc')
    expectSplineClose(truncOsc, oracle.truncateOsc, 'splineOsc')
  })
})

describe('testTsSplineTransforms: TestGetTimeScaled', () => {
  for (const name of oracle.museumNames) {
    it(name, () => {
      const spline = TsTest_Museum.getSplineByName(name)
      const [a, b] = oracle.timeScaled[name]!
      expectSplineClose(spline.getTimeScaled(2.0, 3.0), a!, `${name} x2+3`)
      expectSplineClose(spline.getTimeScaled(-0.5, 7.0), b!, `${name} x-0.5+7`)
    })
  }

  it('rejects a zero scale', () => {
    expect(TsTest_Museum.getSplineByName('TwoKnotBezier').getTimeScaled(0, 1).IsEmpty()).toBe(true)
  })
})

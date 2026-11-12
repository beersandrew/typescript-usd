// Ported from OpenUSD 26.11.1: pxr/base/ts/testenv/testTsSplineBreakdown.py
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.08 pxr/base/ts/testenv/testTsSplineBreakdown.py.
// Affected intervals and the resulting splines in fixtures/tsOracle.json
// ("breakdown") were captured from the v26.11.1 build (FIXTURES.md).
import { describe, expect, it } from 'vitest'
import { Interval as GfInterval } from 'typescript-usd/gf'
import {
  CurveType, ExtrapMode, Extrapolation, InterpCurve, InterpHeld, InterpLinear,
  InterpValueBlock, Knot, LoopParams, Spline, TangentAlgorithm, type InterpMode,
} from '../../src/index.ts'
import { expectClose, expectIntervalEqual, expectSplineClose, oracle } from './tsOracle.ts'

// testTsSplineBreakdown.py:44-82: compact knot description.
interface K {
  time: number
  value: number
  interp: InterpMode
  preTan?: [number, number]
  postTan?: [number, number]
  preAlg?: TangentAlgorithm
  postAlg?: TangentAlgorithm
}
function GetTsKnot(k: K): Knot {
  return new Knot({
    time: k.time, value: k.value, nextInterp: k.interp,
    preTanWidth: k.preTan?.[0] ?? 0, preTanSlope: k.preTan?.[1] ?? 0,
    postTanWidth: k.postTan?.[0] ?? 0, postTanSlope: k.postTan?.[1] ?? 0,
    preTanAlgorithm: k.preAlg ?? TangentAlgorithm.None,
    postTanAlgorithm: k.postAlg ?? TangentAlgorithm.None,
  })
}

// testTsSplineBreakdown.py:112-158.
function GenSpline(opts: {
  knots?: K[], curveType?: CurveType, loopParams?: LoopParams,
  preExtrap?: Extrapolation, postExtrap?: Extrapolation,
}): Spline {
  const spline = new Spline()
  if (opts.curveType !== undefined) spline.setCurveType(opts.curveType)
  for (const knot of opts.knots ?? []) spline.setKnot(GetTsKnot(knot))
  if (opts.loopParams) spline.setInnerLoopParams(opts.loopParams)
  if (opts.preExtrap) spline.setPreExtrapolation(opts.preExtrap)
  if (opts.postExtrap) spline.setPostExtrapolation(opts.postExtrap)
  return spline
}

const times60 = Array.from({ length: 60 }, (_, i) => i / 10)

describe('testTsSplineBreakdown', () => {
  // testTsSplineBreakdown.py:163-194.
  it('test_Interpolation', () => {
    const knots: K[] = [
      { time: 1.0, value: 1.0, interp: InterpValueBlock },
      { time: 2.0, value: 2.0, interp: InterpHeld },
      { time: 3.0, value: 3.0, interp: InterpLinear },
      { time: 4.0, value: 4.0, interp: InterpCurve, preTan: [0.5, 0], postTan: [0.5, 0] },
      { time: 5.0, value: 5.0, interp: InterpHeld, preTan: [0.5, 0] },
    ]
    let caseIndex = 0
    for (const algorithm of [TangentAlgorithm.None, TangentAlgorithm.Custom, TangentAlgorithm.AutoEase]) {
      const algoKnots = knots.map(k => ({ ...k, preAlg: algorithm, postAlg: algorithm }))
      for (const curveType of [CurveType.Bezier, CurveType.Hermite]) {
        const expected = oracle.breakdown.interpolation[caseIndex++]!
        expect([expected.alg, expected.curveType]).toEqual([algorithm, curveType])
        const msg = `algorithm=${algorithm} curveType=${curveType}`

        const spline1 = GenSpline({ knots: algoKnots, curveType })
        const spline2 = GenSpline({ knots: algoKnots, curveType })
        expectSplineClose(spline2, expected.before, `${msg} before`)

        const results = [1.25, 2.25, 3.25, 4.25].map(t => spline2.breakdown(t))
        expect(results[0]?.equals(new GfInterval(1, 2)), msg).toBe(true)
        expect(results[1]?.equals(new GfInterval(2, 3)), msg).toBe(true)
        expect(results[2]?.equals(new GfInterval(3, 4)), msg).toBe(true)
        expect(results[3]?.equals(new GfInterval(4, 5)), msg).toBe(true)
        results.forEach((r, i) => expectIntervalEqual(r, expected.results[i]!, `${msg} result ${i}`))
        expectSplineClose(spline2, expected.after, `${msg} after`)

        times60.forEach((t, i) => {
          const b = spline1.eval(t)
          const a = spline2.eval(t)
          if (b === undefined) expect(a, `${msg} t=${t}`).toBeUndefined()
          else expect(a, `${msg} t=${t}`).toBeCloseTo(b, 6)
          expectClose(a, expected.eval[i]!, `${msg} oracle t=${t}`)
        })
      }
    }
  })

  // testTsSplineBreakdown.py:197-224.
  it('test_Extrapolation', () => {
    const knots: K[] = [
      { time: 1.0, value: 1.0, interp: InterpCurve },
      { time: 3.0, value: 2.0, interp: InterpCurve },
      { time: 5.0, value: 1.0, interp: InterpCurve },
    ]
    const modes = [ExtrapMode.ValueBlock, ExtrapMode.Held, ExtrapMode.Linear, ExtrapMode.Sloped,
      ExtrapMode.LoopRepeat, ExtrapMode.LoopReset, ExtrapMode.LoopOscillate]
    modes.forEach((mode, index) => {
      const expected = oracle.breakdown.extrapolation[index]!
      expect(expected.mode).toBe(mode)
      const extrap = new Extrapolation(mode)
      const spline1 = GenSpline({ knots, preExtrap: extrap, postExtrap: extrap })
      const spline2 = GenSpline({ knots, preExtrap: extrap, postExtrap: extrap })
      const msg = `mode=${ExtrapMode[mode]}`

      const r1 = spline2.breakdown(0.5)
      const r2 = spline2.breakdown(5.5)
      if (extrap.isLooping()) {
        expect(r1, msg).toBeUndefined()
        expect(r2, msg).toBeUndefined()
      } else {
        expect(r1?.equals(new GfInterval(0.5, 1.0)), msg).toBe(true)
        expect(r2?.equals(new GfInterval(5.0, 5.5)), msg).toBe(true)
      }
      expectIntervalEqual(r1, expected.results[0]!, `${msg} r1`)
      expectIntervalEqual(r2, expected.results[1]!, `${msg} r2`)
      expectSplineClose(spline2, expected.after, `${msg} after`)

      times60.forEach((t, i) => {
        const b = spline1.eval(t)
        const a = spline2.eval(t)
        if (b === undefined) expect(a, `${msg} t=${t}`).toBeUndefined()
        else expect(a, `${msg} t=${t}`).toBeCloseTo(b, 6)
        expectClose(a, expected.eval[i]!, `${msg} oracle t=${t}`)
      })
    })
  })

  // testTsSplineBreakdown.py:227-305.
  it('test_InnerLooping', () => {
    const simpleKnots: K[] = [
      { time: 112, value: 8.8, interp: InterpCurve, preTan: [0, 0], postTan: [0.9, 15.0] },
      { time: 137, value: 0.0, interp: InterpCurve, preTan: [1.3, -5.3], postTan: [1.8, -5.3] },
      { time: 145, value: 8.5, interp: InterpCurve, preTan: [1.0, 12.5], postTan: [1.2, 12.5] },
      { time: 155, value: 20.2, interp: InterpCurve, preTan: [0.7, -15.7], postTan: [0.8, -15.7] },
      { time: 181, value: 38.2, interp: InterpCurve, preTan: [2.0, -9.0] },
    ]
    const simpleLoop = new LoopParams(137, 155, 1, 1, 20.2)

    const spline1 = GenSpline({ knots: simpleKnots, loopParams: simpleLoop })
    const spline2 = GenSpline({ knots: simpleKnots, loopParams: simpleLoop })

    const expected = oracle.breakdown.innerLooping
    ;[115, 125, 145, 150, 165, 175].forEach((t, i) => {
      const e = expected.results[i]!
      const can = spline2.canBreakdown(t)
      expect(can.value, `CanBreakdown(${t})`).toBe(e.can)
      expect(can.reason, `CanBreakdown(${t}) reason`).toBe(e.reason)
      const result = spline2.breakdown(t)
      if (can.value) expect(result, `Breakdown(${t})`).toBeDefined()
      else expect(result, `Breakdown(${t})`).toBeUndefined()
      expectIntervalEqual(result, e.result, `Breakdown(${t})`)
    })
    expectSplineClose(spline2, expected.after, 'after')

    for (const t of [112, 115, 137, 145, 150, 175, 181]) {
      expect(spline2.eval(t), `knot at time ${t}`).toBeCloseTo(spline1.eval(t)!, 8)
    }

    const unchanged: [number, number][] = [[105, 115], [119, 132], [137, 150], [175, 185]]
    const changed: [number, number][] = [[115, 119], [132, 137], [150, 175]]

    for (const [lo, hi] of unchanged) {
      for (let i = lo * 10; i <= hi * 10; i++) {
        const t = i / 10
        expect(spline2.eval(t), `time ${t}`).toBeCloseTo(spline1.eval(t)!, 8)
      }
    }
    for (const [lo, hi] of changed) {
      let allClose = true
      for (let i = lo * 10; i <= hi * 10; i++) {
        if (!(Math.abs(spline1.eval(i / 10)! - spline2.eval(i / 10)!) < 1.0e-8)) allClose = false
      }
      expect(allClose, `Span [${lo}..${hi}] should have changes but does not.`).toBe(false)
    }

    for (const [t, v] of expected.eval) {
      expectClose(spline2.eval(t), v, `oracle t=${t}`)
    }
  })
})

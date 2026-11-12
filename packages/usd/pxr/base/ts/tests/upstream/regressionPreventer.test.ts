// Ported from OpenUSD 26.11.1:
//  pxr/base/ts/testenv/testTsRegressionPreventer.py,
//  pxr/base/ts/testenv/testTsRegressionPreventerCpp.cpp
// Copyright 2024, 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.08 pxr/base/ts/testenv/testTsRegressionPreventer.py
// and testTsRegressionPreventerCpp.cpp. SetResult descriptions and resulting
// splines in fixtures/tsOracle.json ("regressionPreventer") were captured from
// the v26.11.1 build (FIXTURES.md).
import { describe, expect, it } from 'vitest'
import {
  AntiRegressionAuthoringSelector, AntiRegressionContain, AntiRegressionKeepRatio,
  AntiRegressionKeepStart, AntiRegressionMode, AntiRegressionNone, RegressionPreventer,
  Ts_RegressionPreventerBatchAccess as RP, Ts_Segment, Ts_SegmentInterp,
  TsRegressionPreventerInteractiveMode, TsTest_Baseliner as Baseliner, TsTest_Museum,
  TsTest_MuseumDataId, TsTest_SampleBezier as SampleBezier, TsTest_SampleTimes as STimes,
  TsTest_TsEvaluator as Evaluator, type Spline,
} from '../../src/index.ts'
import { baselineIO } from './baselineIO.ts'
import { expectSplineClose, oracle } from './tsOracle.ts'

const io = baselineIO('testTsRegressionPreventer')

const arModes = [AntiRegressionNone, AntiRegressionContain, AntiRegressionKeepRatio,
  AntiRegressionKeepStart]
const interactiveModes = [TsRegressionPreventerInteractiveMode.ModeLimitActive,
  TsRegressionPreventerInteractiveMode.ModeLimitOpposite]

function withMode<T>(mode: AntiRegressionMode, fn: () => T): T {
  const selector = new AntiRegressionAuthoringSelector(mode)
  try {
    return fn()
  } finally {
    selector.close()
  }
}

// testTsRegressionPreventer.py:22-151.
function DoTest(
  caseName: string, museumId: TsTest_MuseumDataId, knotTime: number,
  { knotDelta = 0, preDelta = 0, postDelta = 0, isRegressive = false, isInitiallyRegressive = false } = {},
): void {
  const expected = oracle.regressionPreventer.find(c => c.caseName === caseName)!
  expect(expected, caseName).toBeDefined()

  const origSpline = withMode(AntiRegressionNone, () => TsTest_Museum.getSpline(museumId))

  const knot = origSpline.getKnot(knotTime)!
  knot.SetTime(knot.getTime() + knotDelta)
  knot.setPreTanWidth(knot.getPreTanWidth() + preDelta)
  knot.setPostTanWidth(knot.getPostTanWidth() + postDelta)

  const unfilteredSpline = origSpline.clone()
  const nonPreventer = withMode(AntiRegressionNone,
    () => new RegressionPreventer(unfilteredSpline, knotTime))
  expect(nonPreventer.Set(knot), caseName).toBeDefined()

  const bezSamples = SampleBezier(unfilteredSpline, 200)

  const regressiveBefore = withMode(AntiRegressionKeepRatio,
    () => unfilteredSpline.hasRegressiveTangents())
  expect(regressiveBefore, `${caseName}: HasRegressiveTangents mismatch beforehand`).toBe(isRegressive)
  expect(regressiveBefore, caseName).toBe(expected.regressiveBefore)

  const modes = [...arModes, ...interactiveModes]
  modes.forEach((mode, index) => {
    const e = expected.modes[index]!
    expect(e.mode, caseName).toBe(mode)
    const subCaseStr = caseName + e.name.replace(/ /g, '')

    const spline = origSpline.clone()
    const preventer = arModes.includes(mode as AntiRegressionMode)
      ? withMode(mode as AntiRegressionMode, () => new RegressionPreventer(spline, knotTime))
      : new RegressionPreventer(spline, knotTime, mode as TsRegressionPreventerInteractiveMode)

    const result = preventer.Set(knot)
    expect(result, subCaseStr).toBeDefined()
    expect(result!.getDebugDescription(6), `${subCaseStr}: SetResult`).toBe(e.result)
    expectSplineClose(spline, e.spline, subCaseStr)

    const times = new STimes(spline)
    times.addStandardTimes()
    const samples = new Evaluator().eval(spline, times)
    const baseliner = Baseliner.createForParamCompare(subCaseStr, spline, samples, 6, io)
    baseliner.setCreationString(result!.getDebugDescription(6))
    baseliner.addReferenceSpline('Bezier', unfilteredSpline, bezSamples)
    expect(baseliner.validate(), `${subCaseStr}: baseline\n${baseliner.messages.join('\n')}`).toBe(true)

    const regressiveAfter = withMode(AntiRegressionKeepRatio,
      () => unfilteredSpline.hasRegressiveTangents())
    if (mode === AntiRegressionNone) {
      expect(regressiveAfter, `${subCaseStr}: HasRegressiveTangents mismatch afterward`).toBe(isRegressive)
    } else {
      expect(spline.hasRegressiveTangents(), `${subCaseStr}: HasRegressiveTangents returns True afterward`)
        .toBe(false)
    }
    expect(spline.hasRegressiveTangents(), subCaseStr).toBe(e.regressiveAfter)

    if (mode === AntiRegressionContain || mode === AntiRegressionKeepRatio ||
        mode === AntiRegressionKeepStart) {
      const batchSpline = unfilteredSpline.clone()
      withMode(mode, () => batchSpline.adjustRegressiveTangents())
      expectSplineClose(batchSpline, e.batch!, `${subCaseStr}: batch spline`)

      const editSpline = origSpline.clone()
      editSpline.removeKnot(knotTime)
      withMode(mode, () => editSpline.setKnot(knot))
      expectSplineClose(editSpline, e.edit!, `${subCaseStr}: edit spline`)

      if (!isInitiallyRegressive) {
        DiffSplines(spline, batchSpline, `${subCaseStr}: batch spline differs`)
        DiffSplines(spline, editSpline, `${subCaseStr}: edit spline differs`)
      }
    }
  })
}

// testTsRegressionPreventer.py:153-191: floating-point fields agree to 1e-6.
function DiffSplines(spline1: Spline, spline2: Spline, msg: string): void {
  const k1 = spline1.getKnots()
  const k2 = spline2.getKnots()
  expect(k2.length, msg).toBe(k1.length)
  k1.forEach((a, i) => {
    const b = k2[i]!
    for (const [x, y] of [
      [a.getTime(), b.getTime()], [a.GetValue(), b.GetValue()],
      [a.getPreTanWidth(), b.getPreTanWidth()], [a.getPostTanWidth(), b.getPostTanWidth()],
      [a.getPreTanSlope(), b.getPreTanSlope()], [a.getPostTanSlope(), b.getPostTanSlope()],
    ] as const) {
      expect(Math.abs(x - y) <= 1e-6, `${msg}: knot ${i} ${x} vs ${y}`).toBe(true)
    }
  })
}

describe('testTsRegressionPreventer', () => {
  it('test_Noop', () => {
    DoTest('Noop', TsTest_MuseumDataId.NearCenterVertical, 0, { isRegressive: false })
  })
  it('test_InitiallyRegressive', () => {
    DoTest('InitiallyRegressive', TsTest_MuseumDataId.RegressiveS, 156,
      { isRegressive: true, isInitiallyRegressive: true })
  })
  it('test_PreRegressive', () => {
    DoTest('PreRegressive', TsTest_MuseumDataId.NearCenterVertical, 0,
      { postDelta: 0.5, isRegressive: true })
  })
  it('test_PostRegressive', () => {
    DoTest('PostRegressive', TsTest_MuseumDataId.NearCenterVertical, 1,
      { preDelta: 0.5, isRegressive: true })
  })
  it('test_MoveStart', () => {
    DoTest('MoveStart', TsTest_MuseumDataId.NearCenterVertical, 0,
      { knotDelta: 0.4, isRegressive: true })
  })
  it('test_Replace', () => {
    DoTest('Replace', TsTest_MuseumDataId.FourKnotBezier, 2,
      { knotDelta: 1, isRegressive: false })
  })
  it('test_Reorder', () => {
    DoTest('Reorder', TsTest_MuseumDataId.FourKnotBezier, 2,
      { knotDelta: 1.2, isRegressive: true })
  })
})

const interpModes = [Ts_SegmentInterp.ValueBlock, Ts_SegmentInterp.Held,
  Ts_SegmentInterp.Linear, Ts_SegmentInterp.Bezier, Ts_SegmentInterp.Hermite]

describe('testTsRegressionPreventerCpp', () => {
  // testTsRegressionPreventerCpp.cpp:44-74.
  it('TestQueryNonRegressiveSegments', () => {
    const segment = new Ts_Segment([0.0, 0.0], [1.0, 1.0], [2.0, -1.0], [3.0, 0.0])
    for (const arMode of arModes) {
      for (const interp of interpModes) {
        segment.interp = interp
        expect(RP.isSegmentRegressive(segment, arMode), `${segment.toString()} ${arMode}`).toBe(false)
      }
    }
  })

  // testTsRegressionPreventerCpp.cpp:76-109.
  it('TestQueryRegressiveSegments', () => {
    const segment = new Ts_Segment([0.0, 0.0], [4.0, 1.0], [-1.0, -1.0], [3.0, 0.0])
    for (const arMode of arModes) {
      for (const interp of interpModes) {
        segment.interp = interp
        expect(RP.isSegmentRegressive(segment, arMode), `${segment.toString()} ${arMode}`)
          .toBe(interp === Ts_SegmentInterp.Bezier)
      }
    }
  })

  // testTsRegressionPreventerCpp.cpp:111-146.
  it('TestProcessNonRegressiveSegments', () => {
    const segment = new Ts_Segment([0.0, 0.0], [1.0, 1.0], [2.0, -1.0], [3.0, 0.0])
    for (const arMode of arModes) {
      for (const interp of interpModes) {
        segment.interp = interp
        const copy = segment.clone()
        expect(RP.processSegment(copy, arMode), `${segment.toString()} ${arMode}`).toBe(false)
        expect(copy.equals(segment), `${segment.toString()} -> ${copy.toString()}`).toBe(true)
      }
    }
  })

  // testTsRegressionPreventerCpp.cpp:148-246.
  it('TestProcessRegressiveSegments', () => {
    const segment = new Ts_Segment([0.0, 0.0], [6.0, 1.0], [0.0, -1.0], [3.0, 0.0])
    for (const arMode of arModes) {
      for (const interp of interpModes) {
        segment.interp = interp
        const copy = segment.clone()
        const isBezier = interp === Ts_SegmentInterp.Bezier
        const expected = segment.clone()
        if (isBezier) {
          switch (arMode) {
            case AntiRegressionNone:
              break
            case AntiRegressionContain:
              expected.t0 = [3.0, 0.5]
              expected.t1 = [0.0, -1.0]
              break
            case AntiRegressionKeepRatio: {
              const ratio = 2.0
              const scale = (Math.sqrt(ratio) + ratio + 1) / (ratio * ratio + ratio + 1)
              const postTan: [number, number] = [expected.t0[0] - expected.p0[0], expected.t0[1] - expected.p0[1]]
              const preTan: [number, number] = [expected.t1[0] - expected.p1[0], expected.t1[1] - expected.p1[1]]
              expected.t0 = [expected.p0[0] + postTan[0] * scale, expected.p0[1] + postTan[1] * scale]
              expected.t1 = [expected.p1[0] + preTan[0] * scale, expected.p1[1] + preTan[1] * scale]
              break
            }
            case AntiRegressionKeepStart:
              expected.t0 = [4.0, 2.0 / 3.0]
              expected.t1 = [2.0, -1.0 / 3.0]
              break
          }
        }
        const adjusted = RP.processSegment(copy, arMode)
        const tolerance = 3.2e-5
        expect(adjusted, `${segment.toString()} ${arMode}`)
          .toBe(isBezier && arMode !== AntiRegressionNone)
        expect(copy.IsClose(expected, tolerance),
          `${segment.toString()} -> ${copy.toString()}, expected ${expected.toString()}`).toBe(true)
      }
    }
  })
})


// Ported from OpenUSD 26.11.1: pxr/base/ts/testenv/tsTest_TsVsBezier.py,
//  pxr/base/ts/tsTest_SampleBezier.cpp
// Copyright 2023, 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD 26.11.1 pxr/base/ts/testenv/tsTest_TsVsBezier.py
// (registration tsTest_TsVsBezier): every eligible Museum spline evaluated by
// Ts is compared with a de Casteljau sampling of the same Bezier
// (tsTest_SampleBezier.cpp). Case selection and tolerances follow
// tsTest_TsVsBezier.py:41-106; graph output (Comparator.Init/Write) is
// optional upstream and skipped here.
import { describe, expect, it } from 'vitest'
import {
  TsCurveTypeBezier, TsExtrapSloped, TsTangentAlgorithmAutoEase,
  TsTest_Comparator as Comparator, TsTest_Museum as Museum,
  TsTest_SampleBezier as SampleBezier, TsTest_SampleTimes as STimes,
  TsTest_TsEvaluator as Evaluator,
} from '../../src/index.ts'

// tsTest_TsVsBezier.py:64-100.
function eligible(name: string): boolean {
  if (name.startsWith('Regressive')) return false
  const spline = Museum.getSplineByName(name)
  if (spline.getCurveType() !== TsCurveTypeBezier ||
      spline.hasInnerLoops() ||
      spline.getPreExtrapolation().mode === TsExtrapSloped ||
      spline.getPostExtrapolation().mode === TsExtrapSloped ||
      spline.getPreExtrapolation().isLooping() ||
      spline.getPostExtrapolation().isLooping()) return false
  for (const knot of spline.getKnots()) {
    if (knot.isDualValued() ||
        knot.getPreTanAlgorithm() === TsTangentAlgorithmAutoEase ||
        knot.getPostTanAlgorithm() === TsTangentAlgorithmAutoEase) return false
  }
  return true
}

const names = Museum.getAllNames().filter(eligible)

describe('tsTest_TsVsBezier', () => {
  it('selects at least one Museum case', () => {
    expect(names.length).toBeGreaterThan(0)
  })

  // tsTest_TsVsBezier.py:13-55 (_DoTest).
  it.each(names)('test_%s', name => {
    const spline = Museum.getSplineByName(name)
    const bezSamples = SampleBezier(spline, 200)
    const times = new STimes()
    times.addTimes(bezSamples.map(s => s.time))
    const evalSamples = new Evaluator().eval(spline, times)
    const comparator = new Comparator(name)
    comparator.addSpline('Bezier', spline, bezSamples)
    comparator.addSpline('Ts', spline, evalSamples)
    const tolerance = ['FourThirdOneThird', 'FringeVert',
      'OneThirdFourThird', 'VerticalTorture'].includes(name) ? 1e-1 : 1e-12
    expect(comparator.getMaxDiff()).toBeLessThan(tolerance)
  })
})

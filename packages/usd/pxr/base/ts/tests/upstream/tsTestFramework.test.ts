// Ported from OpenUSD 26.11.1: pxr/base/ts/testenv/tsTest_TsFramework.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.08 pxr/base/ts/testenv/tsTest_TsFramework.py. The
// baselines are the upstream tsTest_TsFramework.testenv/baseline files.
import { describe, expect, it } from 'vitest'
import {
  TsTest_Baseliner as Baseliner, TsTest_Comparator as Comparator,
  TsTest_Grapher as Grapher, TsTest_Museum as Museum, TsTest_MuseumDataId,
  TsTest_SampleTimes as STimes, TsTest_TsEvaluator as Evaluator,
} from '../../src/index.ts'
import { baselineIO } from './baselineIO.ts'

const io = baselineIO('tsTest_TsFramework')

describe('tsTest_TsFramework', () => {
  it('test_Grapher', () => {
    const spline1 = Museum.getSpline(TsTest_MuseumDataId.TwoKnotBezier)
    const spline2 = Museum.getSpline(TsTest_MuseumDataId.TwoKnotLinear)
    const times = new STimes(spline1)
    times.addStandardTimes()
    const samples1 = new Evaluator().eval(spline1, times)
    const samples2 = new Evaluator().eval(spline2, times)
    const grapher = new Grapher('test_Grapher')
    grapher.addSpline('Bezier', spline1, samples1)
    grapher.addSpline('Linear', spline2, samples2)
    if (Grapher.init()) {
      grapher.write('test_Grapher.png')
    }
    expect(grapher.getSplines()).toHaveLength(2)
  })

  it('test_Comparator', () => {
    const spline1 = Museum.getSpline(TsTest_MuseumDataId.TwoKnotBezier)
    const spline2 = Museum.getSpline(TsTest_MuseumDataId.TwoKnotLinear)
    const times = new STimes(spline1)
    times.addStandardTimes()
    const samples1 = new Evaluator().eval(spline1, times)
    const samples2 = new Evaluator().eval(spline2, times)
    const comparator = new Comparator('test_Comparator')
    comparator.addSpline('Bezier', spline1, samples1)
    comparator.addSpline('Linear', spline2, samples2)
    if (Comparator.init()) {
      comparator.write('test_Comparator.png')
    }
    expect(comparator.getMaxDiff() < 1.0).toBe(true)
  })

  it('test_Baseline', () => {
    const spline = Museum.getSpline(TsTest_MuseumDataId.TwoKnotBezier)
    const times = new STimes(spline)
    times.addStandardTimes()
    const samples = new Evaluator().eval(spline, times)
    const baseliner = Baseliner.createForEvalCompare('test_Baseline', spline, samples, 6, io)
    expect(baseliner.validate(), baseliner.messages.join('\n')).toBe(true)
  })

  it('test_BaselineParams', () => {
    const spline = Museum.getSpline(TsTest_MuseumDataId.TwoKnotBezier)
    const times = new STimes(spline)
    times.addStandardTimes()
    const samples = new Evaluator().eval(spline, times)
    const baseliner = Baseliner.createForParamCompare('test_BaselineParams', spline, samples, 6, io)
    expect(baseliner.validate(), baseliner.messages.join('\n')).toBe(true)
  })

  it('test_BaselineFail', () => {
    const spline1 = Museum.getSpline(TsTest_MuseumDataId.TwoKnotBezier)
    const spline2 = Museum.getSpline(TsTest_MuseumDataId.TwoKnotLinear)
    const times = new STimes(spline1)
    times.addStandardTimes()
    const samples = new Evaluator().eval(spline2, times)

    const refSpline = Museum.getSpline(TsTest_MuseumDataId.TwoKnotBezier)
    const refKnot = refSpline.getKnots()[0]!
    refKnot.setPostTanSlope(refKnot.getPostTanSlope() * 0.8)
    refSpline.setKnot(refKnot)
    const refSamples = new Evaluator().eval(refSpline, times)

    const baseliner = Baseliner.createForEvalCompare('test_BaselineFail', spline1, samples, 6, io)
    baseliner.addReferenceSpline('Reference', refSpline, refSamples)
    expect(baseliner.validate()).toBe(false)
    // The upstream baseline predates the current spline description, so v26.08
    // reports a structure mismatch here.
    expect(baseliner.messages).toContain('Error: test_BaselineFail: spline structure mismatch')
  })

  it('test_BaselineParamsFail', () => {
    const spline1 = Museum.getSpline(TsTest_MuseumDataId.TwoKnotBezier)
    const spline2 = Museum.getSpline(TsTest_MuseumDataId.TwoKnotLinear)
    const times = new STimes(spline2)
    times.addStandardTimes()
    const samples = new Evaluator().eval(spline2, times)

    const refSpline = spline1
    const refKnot = refSpline.getKnots()[0]!
    refKnot.setPostTanSlope(refKnot.getPostTanSlope() * 0.8)
    refSpline.setKnot(refKnot)
    const refSamples = new Evaluator().eval(refSpline, times)

    const baseliner = Baseliner.createForParamCompare('test_BaselineParamsFail', spline2, samples, 6, io)
    baseliner.addReferenceSpline('Reference', refSpline, refSamples)
    expect(baseliner.validate()).toBe(false)
    expect(baseliner.messages).toContain('Error: test_BaselineParamsFail: spline structure mismatch')
  })
})

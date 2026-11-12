// Ported from OpenUSD 26.11.1: pxr/base/ts/tsTest_TsEvaluator.cpp,
//  pxr/base/ts/tsTest_TsEvaluator.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { Interval as GfInterval } from 'typescript-usd/gf'
import type { TsSpline } from './spline.ts'
import { TsTest_SampleTimes } from './tsTest_SampleTimes.ts'
import { TsTest_Sample, type TsTest_SampleVec } from './tsTest_Types.ts'
import type { TsSplineSamples, TsSplineSamplesWithSources } from './types.ts'

// Ported from OpenUSD v26.08 pxr/base/ts/tsTest_TsEvaluator.h and
// tsTest_TsEvaluator.cpp.
export class TsTest_TsEvaluator {
  // tsTest_TsEvaluator.cpp:19-43: value-blocked samples report 0.
  eval(spline: TsSpline, sampleTimes: TsTest_SampleTimes): TsTest_SampleVec {
    if (spline.getKnots().length === 0) {
      return []
    }
    const result: TsTest_SampleVec = []
    for (const time of sampleTimes.getTimes()) {
      const value = time.pre ? spline.evalPreValue(time.time) : spline.eval(time.time)
      result.push(new TsTest_Sample(time.time, value ?? 0))
    }
    return result
  }

  // tsTest_TsEvaluator.cpp:45-61.
  Sample(
    spline: TsSpline, timeInterval: GfInterval, timeScale: number,
    valueScale: number, tolerance: number, withSources = false,
  ): TsSplineSamples | TsSplineSamplesWithSources | undefined {
    return spline.Sample(timeInterval, timeScale, valueScale, tolerance, withSources)
  }
}

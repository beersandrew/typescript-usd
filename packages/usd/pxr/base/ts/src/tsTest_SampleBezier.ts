// Ported from OpenUSD 26.11.1: pxr/base/ts/tsTest_SampleBezier.cpp,
//  pxr/base/ts/tsTest_SampleBezier.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import type { TsKnot } from './knot.ts'
import type { TsSpline } from './spline.ts'
import { TsTest_Sample, type TsTest_SampleVec } from './tsTest_Types.ts'
import { TsCurveType } from './types.ts'

// Ported from OpenUSD v26.08 pxr/base/ts/tsTest_SampleBezier.h and
// tsTest_SampleBezier.cpp.

type V2 = [number, number]
const lerp2 = (t: number, a: V2, b: V2): V2 => [(1 - t) * a[0] + t * b[0], (1 - t) * a[1] + t * b[1]]

// tsTest_SampleBezier.cpp:17-55.
function _ComputeSample(knot0: TsKnot, knot1: TsKnot, t: number): TsTest_Sample {
  const p0: V2 = [knot0.getTime(), knot0.GetValue()]
  const tan1: V2 = [knot0.getPostTanWidth(), knot0.getPostTanSlope() * knot0.getPostTanWidth()]
  const p1: V2 = [p0[0] + tan1[0], p0[1] + tan1[1]]
  const p3: V2 = [knot1.getTime(), knot1.GetValue()]
  const tan2: V2 = [-knot1.getPreTanWidth(), -knot1.getPreTanSlope() * knot1.getPreTanWidth()]
  const p2: V2 = [p3[0] + tan2[0], p3[1] + tan2[1]]

  const lerp11 = lerp2(t, p0, p1)
  const lerp12 = lerp2(t, p1, p2)
  const lerp13 = lerp2(t, p2, p3)
  const lerp21 = lerp2(t, lerp11, lerp12)
  const lerp22 = lerp2(t, lerp12, lerp13)
  const lerp31 = lerp2(t, lerp21, lerp22)
  return new TsTest_Sample(lerp31[0], lerp31[1])
}

// tsTest_SampleBezier.cpp:57-102.
export function TsTest_SampleBezier(spline: TsSpline, numSamples: number): TsTest_SampleVec {
  if (spline.getCurveType() !== TsCurveType.Bezier) {
    return []
  }
  const knots = spline.getKnots()
  if (knots.length < 2) {
    return []
  }
  const samplesPerSegment = Math.trunc(numSamples / knots.length)
  const tPerSample = 1.0 / (samplesPerSegment + 1)

  const result: TsTest_SampleVec = []
  for (let k = 0; k + 1 < knots.length; k++) {
    for (let j = 0; j < samplesPerSegment; j++) {
      const t = tPerSample * j
      result.push(_ComputeSample(knots[k]!, knots[k + 1]!, t))
    }
  }

  const lastKnot = knots[knots.length - 1]!
  result.push(new TsTest_Sample(lastKnot.getTime(), lastKnot.GetValue()))
  return result
}

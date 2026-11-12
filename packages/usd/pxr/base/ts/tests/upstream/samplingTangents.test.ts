// Ported from OpenUSD 26.11.1: pxr/base/ts/testenv/testTsSegmentIterator.cpp,
//  pxr/base/ts/testenv/testTsSplineSampling.cpp,
//  pxr/base/ts/testenv/testTsTangentAlgorithms.py,
//  pxr/base/ts/testenv/testTsTangentConversion.cpp
// Copyright 2024, 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.08 pxr/base/ts/testenv/testTsSplineSampling.cpp,
// testTsTangentAlgorithms.py, and testTsTangentConversion.cpp.
// testTsSegmentIterator.cpp is ported in segmentIterator.test.ts.
import { describe, expect, it } from 'vitest'
import {
  ConvertFromStandardTangent, ConvertToStandardTangent, InterpCurve, Knot,
  Spline, TangentAlgorithmAutoEase,
} from '../../src/index.ts'

const interval = (min: number, max: number) => ({
  getMin: () => min,
  getMax: () => max,
  IsEmpty: () => max < min,
})

describe('testTsSplineSampling', () => {
  it('adaptively samples curve endpoints and midpoint tolerance', () => {
    const spline = new Spline()
    spline.setKnot(new Knot({ time: 0, value: 0, nextInterp: InterpCurve, postTanWidth: 1, postTanSlope: 4 }))
    spline.setKnot(new Knot({ time: 2, value: 2, preTanWidth: 1, preTanSlope: -2 }))
    const coarse = spline.Sample(interval(0, 2), 1, 1, 10)!
    const fine = spline.Sample(interval(0, 2), 1, 1, 1e-3)!
    expect(coarse.polylines[0]).toHaveLength(2)
    expect(fine.polylines[0]!.length).toBeGreaterThan(2)
    expect(fine.polylines[0]![0]).toEqual([0, 0])
    expect(fine.polylines[0]!.at(-1)).toEqual([2, 2])
  })
})

describe('testTsTangentAlgorithms', () => {
  it('matches the v26.08 AutoEase slope and widths', () => {
    const spline = new Spline()
    for (const [time, value] of [[0, 0], [1, 1], [3, 2]] as const) {
      spline.setKnot(new Knot({
        time, value, nextInterp: InterpCurve,
        preTanWidth: 0.5, postTanWidth: 0.5,
        preTanAlgorithm: TangentAlgorithmAutoEase,
        postTanAlgorithm: TangentAlgorithmAutoEase,
      }))
    }
    const middle = spline.getKnot(1)!
    expect(middle.getPreTanWidth()).toBeCloseTo(1 / 3, 14)
    expect(middle.getPostTanWidth()).toBeCloseTo(2 / 3, 14)
    expect(middle.getPreTanSlope()).toBeCloseTo(0.7962962962962963, 14)
    expect(middle.getPostTanSlope()).toBeCloseTo(0.7962962962962963, 14)
  })
})

describe('testTsTangentConversion', () => {
  it('matches v26.08 conversion combinations', () => {
    expect(ConvertToStandardTangent(6, 9, true, true, false)).toEqual([2, 1.5])
    expect(ConvertToStandardTangent(6, 9, false, true, true)).toEqual([2, -3])
    expect(ConvertFromStandardTangent(2, 3, true, true, false)).toEqual([6, 18])
    expect(ConvertFromStandardTangent(2, 3, false, true, true)).toEqual([6, -9])
  })
})

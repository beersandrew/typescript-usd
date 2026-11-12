// Ported from OpenUSD 26.11.1: pxr/base/ts/testenv/testTsSplineSampling.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.08 pxr/base/ts/testenv/testTsSplineSampling.cpp.
// The polylines in fixtures/tsOracle.json ("sample") were captured from the
// v26.11.1 build (FIXTURES.md).
import { describe, expect, it } from 'vitest'
import { Interval as GfInterval } from 'typescript-usd/gf'
import {
  Spline, SplineSamples, SplineSamplesWithSources, TsTest_Museum,
} from '../../src/index.ts'
import { expectClose, interval, oracle } from './tsOracle.ts'

type V2 = [number, number]
type Polyline = readonly (readonly [number, number])[]

const lerp = (u: number, a: number, b: number): number => (1 - u) * a + u * b
const lerp2 = (u: number, a: V2, b: V2): V2 => [lerp(u, a[0], b[0]), lerp(u, a[1], b[1])]
const lengthSq = (v: V2): number => v[0] * v[0] + v[1] * v[1]
const sub = (a: V2, b: V2): V2 => [a[0] - b[0], a[1] - b[1]]
const compMult = (a: V2, b: V2): V2 => [a[0] * b[0], a[1] * b[1]]

// testTsSplineSampling.cpp:30-63.
function FindPolyline(t: number, polylines: readonly Polyline[]): [V2, V2] | undefined {
  for (const polyline of polylines) {
    if (t < polyline[0]![0]) {
      return undefined
    }
    if (t > polyline[polyline.length - 1]![0]) {
      continue
    }
    for (let i = 1; i < polyline.length; ++i) {
      if (polyline[i]![0] >= t) {
        return [[...polyline[i - 1]!], [...polyline[i]!]]
      }
    }
  }
  return undefined
}

// testTsSplineSampling.cpp:66-83.
function PointToSegmentDistanceSq(point: V2, v0: V2, v1: V2): number {
  const segLengthSq = lengthSq(sub(v1, v0))
  if (segLengthSq === 0) {
    return lengthSq(sub(point, v0))
  }
  const d = sub(point, v0)
  const s = sub(v1, v0)
  const alpha = Math.min(Math.max((d[0] * s[0] + d[1] * s[1]) / segLengthSq, 0.0), 1.0)
  const closestPt = lerp2(alpha, v0, v1)
  return lengthSq(sub(point, closestPt))
}

// testTsSplineSampling.cpp:86-187.
function VerifySpline(
  spline: Spline, timeInterval: GfInterval, polylines: readonly Polyline[],
  timeScale: number, valueScale: number, tolerance: number,
): string | undefined {
  const toleranceSq = tolerance * tolerance
  const t0 = timeInterval.getMin()
  const t1 = timeInterval.getMax()
  const testPoints = 101
  for (let i = 0; i < testPoints; ++i) {
    const alpha = i / (testPoints - 1)
    const t = lerp(alpha, t0, t1)
    const found = FindPolyline(t, polylines)
    let v: number | undefined
    if (found) {
      const [v0, v1] = found
      const deltaT = v1[0] - v0[0]
      const lineSegAlpha = deltaT > 0 ? (t - v0[0]) / deltaT : 0.0
      v = lineSegAlpha > 0.5 ? spline.evalPreValue(t) : spline.eval(t)
    } else {
      v = spline.eval(t)
    }
    const hasValue = v !== undefined
    if (hasValue !== (found !== undefined)) {
      return `There was a ${hasValue ? 'spline value but no sample' : 'sample but no spline value'} at time = ${t}`
    }
    if (!found || v === undefined) continue
    const scales: V2 = [timeScale, valueScale]
    const splinePt = compMult([t, v], scales)
    const distSq = PointToSegmentDistanceSq(splinePt, compMult(found[0], scales), compMult(found[1], scales))
    if (distSq > toleranceSq) {
      return `The spline point at time = ${t} is not close to the sampled spline (distance = ${Math.sqrt(distSq)})`
    }
  }
  return undefined
}

// testTsSplineSampling.cpp:192-371.
function VerifySamples(
  spline: Spline, polylines: readonly Polyline[],
  timeScale: number, valueScale: number, tolerance: number,
): string | undefined {
  const toleranceSq = tolerance * tolerance
  const scales: V2 = [timeScale, valueScale]
  const evalAt = (time: number, pre: boolean): number | undefined =>
    pre ? spline.evalPreValue(time) : spline.eval(time)

  for (const polyline of polylines) {
    for (let j = 0; j < polyline.length - 1; ++j) {
      const prev: V2 = [...polyline[j]!]
      const next: V2 = [...polyline[j + 1]!]
      const samplePts: V2[] = []
      const splinePts: V2[] = []
      for (let k = 0; k < 5; ++k) {
        const u = k / 4.0
        samplePts[k] = lerp2(u, prev, next)
        const value = evalAt(samplePts[k]![0], k === 4)
        if (value === undefined) {
          return `Failed to eval spline at time ${samplePts[k]![0]}`
        }
        splinePts[k] = [samplePts[k]![0], value]
      }

      for (let k = 0; k < 5; ++k) {
        const sampled = compMult(samplePts[k]!, scales)
        const evaluated = compMult(splinePts[k]!, scales)
        if (lengthSq(sub(evaluated, sampled)) <= toleranceSq) {
          continue
        }

        const testPts: V2[] = [
          prev,
          lerp2(0.5, prev, samplePts[k]!),
          splinePts[k]!,
          lerp2(0.5, next, samplePts[k]!),
          next,
        ]

        let maxIter = 50
        while (maxIter-- > 0) {
          testPts[1] = [testPts[1]![0], spline.eval(testPts[1]![0]) ?? testPts[1]![1]]
          testPts[3] = [testPts[3]![0], spline.evalPreValue(testPts[3]![0]) ?? testPts[3]![1]]
          let minErrorSq = Infinity
          let errIndex = -1
          const scaledPts: V2[] = []
          let scaledCenter: V2 = [0, 0]
          for (let n = 0; n < 5; ++n) {
            scaledPts[n] = compMult(testPts[n]!, scales)
            scaledCenter = [scaledCenter[0] + scaledPts[n]![0], scaledCenter[1] + scaledPts[n]![1]]
            const errorSq = lengthSq(sub(sampled, scaledPts[n]!))
            if (errorSq < minErrorSq) {
              minErrorSq = errorSq
              errIndex = n
            }
          }
          if (minErrorSq <= toleranceSq) {
            break
          }
          scaledCenter = [scaledCenter[0] / 5, scaledCenter[1] / 5]
          let farIndex = -1
          for (let n = 0; n < 5; ++n) {
            if (lengthSq(sub(scaledCenter, scaledPts[n]!)) > toleranceSq) {
              farIndex = n
              break
            }
          }
          if (farIndex < 0) {
            return `Sample evaluation exceeds tolerance at time ${samplePts[k]![0]} (error ${Math.sqrt(minErrorSq)})`
          }
          if (errIndex < 2) {
            testPts[4] = testPts[2]!
            testPts[2] = testPts[1]!
          } else if (errIndex === 2) {
            testPts[0] = testPts[1]!
            testPts[4] = testPts[3]!
          } else {
            testPts[0] = testPts[2]!
            testPts[2] = testPts[3]!
          }
          testPts[1] = [lerp(0.5, testPts[0]![0], testPts[2]![0]), testPts[1]![1]]
          testPts[3] = [lerp(0.5, testPts[2]![0], testPts[4]![0]), testPts[3]![1]]
        }
        if (maxIter <= 0) {
          return 'Sample evaluation did not converge within 50 iterations.'
        }
      }
    }
  }
  return undefined
}

// testTsSplineSampling.cpp:373-389.
function VerifySampleError(
  spline: Spline, timeInterval: GfInterval, polylines: readonly Polyline[],
  timeScale: number, valueScale: number, tolerance: number,
): string | undefined {
  return VerifySamples(spline, polylines, timeScale, valueScale, tolerance) ??
    VerifySpline(spline, timeInterval, polylines, timeScale, valueScale, tolerance)
}

// testTsSplineSampling.cpp:391-516.
function DoOneSample(
  splineName: string, sampleFunc: 'Sample' | 'SampleWithSources', valueTypeName: string,
  timeInterval: GfInterval, timeScale: number, valueScale: number, tolerance: number,
): void {
  const spline = TsTest_Museum.getSplineByName(splineName, valueTypeName)
  const withSources = sampleFunc === 'SampleWithSources'
  const samples = spline.Sample(timeInterval, timeScale, valueScale, tolerance, withSources)
  const msg = `${sampleFunc}<${valueTypeName}>(${splineName}, ${timeInterval.toString()}, ` +
    `${timeScale}, ${valueScale}, ${tolerance})`
  expect(samples, msg).toBeDefined()
  if (withSources) {
    expect(samples, msg).toBeInstanceOf(SplineSamplesWithSources)
    expect((samples as SplineSamplesWithSources).sources, msg)
      .toHaveLength(samples!.polylines.length)
  } else {
    expect(samples, msg).toBeInstanceOf(SplineSamples)
  }
  expect(VerifySampleError(spline, timeInterval, samples!.polylines,
    timeScale, valueScale, tolerance), msg).toBeUndefined()
}

// testTsSplineSampling.cpp:518-610.
function DoTest(sampleFunc: 'Sample' | 'SampleWithSources'): void {
  const xPixels = 500, yPixels = 500
  for (const name of TsTest_Museum.getAllNames()) {
    it(`${sampleFunc}: ${name}`, () => {
      const spline = TsTest_Museum.getSplineByName(name)
      const knots = spline.getKnots()
      const knotSpan = new GfInterval(knots[0]!.getTime(), knots[knots.length - 1]!.getTime())
      if (spline.hasInnerLoops()) {
        knotSpan.unionWith(spline.getInnerLoopParams().getLoopedInterval())
      }
      const knotSpanSize = knotSpan.getSize()
      const longSpan = new GfInterval(knotSpan.getMin() - 1.5 * knotSpanSize,
        knotSpan.getMax() + 1.5 * knotSpanSize)
      const shortSpan = new GfInterval(knotSpan.getMin() + 0.25 * knotSpanSize,
        knotSpan.getMax() - 0.25 * knotSpanSize)
      const preSpan = new GfInterval(knotSpan.getMin() - 1.5 * knotSpanSize,
        knotSpan.getMin() - 0.5 * knotSpanSize)
      const postSpan = new GfInterval(knotSpan.getMax() + 0.5 * knotSpanSize,
        knotSpan.getMax() + 1.5 * knotSpanSize)

      let minValue = Infinity
      let maxValue = -Infinity
      for (const knot of knots) {
        const value = spline.eval(knot.getTime())
        if (value !== undefined) {
          minValue = Math.min(minValue, value)
          maxValue = Math.max(maxValue, value)
        }
      }
      const valueRangeSize = maxValue - minValue
      const timeScale = xPixels / Math.max(knotSpanSize, 1.0)
      const valueScale = yPixels / Math.max(valueRangeSize, 1.0)

      DoOneSample(name, sampleFunc, 'float', knotSpan, timeScale, valueScale, 1.0)
      DoOneSample(name, sampleFunc, 'GfHalf', longSpan, timeScale, valueScale, 10.0)
      DoOneSample(name, sampleFunc, 'double', shortSpan, timeScale, valueScale, 0.5)
      DoOneSample(name, sampleFunc, 'float', preSpan, timeScale, valueScale, 1.0)
      DoOneSample(name, sampleFunc, 'float', postSpan, timeScale, valueScale, 1.0)
    })
  }
}

describe('testTsSplineSampling: TestSample', () => {
  DoTest('Sample')
})

describe('testTsSplineSampling: TestSampleWithSources', () => {
  DoTest('SampleWithSources')
})

describe('testTsSplineSampling: v26.11.1 polylines and sources', () => {
  for (const name of oracle.museumNames) {
    it(name, () => {
      const expected = oracle.sample[name]!
      const spline = TsTest_Museum.getSplineByName(name)
      const samples = spline.Sample(interval(expected.interval), 1.0, 1.0, 0.01, true) as
        SplineSamplesWithSources
      expect(samples.sources, `${name} sources`).toEqual(expected.sources)
      expect(samples.polylines.map(p => p.length), `${name} polyline sizes`)
        .toEqual(expected.polylines.map(p => p.length))
      expected.polylines.forEach((polyline, i) => polyline.forEach((v, j) => {
        expectClose(samples.polylines[i]![j]![0], v[0], `${name} polyline ${i} vertex ${j} time`)
        expectClose(samples.polylines[i]![j]![1], v[1], `${name} polyline ${i} vertex ${j} value`)
      }))
    })
  }

  it('rejects invalid sampling arguments', () => {
    const spline = TsTest_Museum.getSplineByName('TwoKnotBezier')
    expect(spline.Sample(new GfInterval(), 1, 1, 1)).toBeUndefined()
    expect(spline.Sample(new GfInterval(0, 1), 0, 1, 1)).toBeUndefined()
    expect(spline.Sample(new GfInterval(0, 1), 1, 0, 1)).toBeUndefined()
    expect(spline.Sample(new GfInterval(0, 1), 1, 1, 0)).toBeUndefined()
    expect(new Spline().Sample(new GfInterval(0, 1), 1, 1, 1)?.polylines).toEqual([])
  })
})

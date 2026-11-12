// Shared loader for fixtures/tsOracle.json, captured from the OpenUSD v26.11.1
// build (FIXTURES.md).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect } from 'vitest'
import { Interval as GfInterval } from 'typescript-usd/gf'
import type { Knot, Spline } from '../../src/index.ts'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'

export type OracleNumber = number | 'inf' | '-inf' | 'nan'
export type OracleValue = OracleNumber | null | 'error'

export interface KnotJson {
  time: number
  value: number
  preValue: number | null
  nextInterp: number
  preTanWidth: number
  preTanSlope: number
  postTanWidth: number
  postTanSlope: number
  preTanAlgorithm: number
  postTanAlgorithm: number
}
export interface SplineJson {
  curveType: number
  pre: { mode: number, slope: number }
  post: { mode: number, slope: number }
  loop: [number, number, number, number, number]
  knots: KnotJson[]
}
export type IntervalJson = [OracleNumber, OracleNumber, boolean, boolean]

export interface OracleJson {
  museumNames: string[]
  museum: Record<string, { spline: SplineJson, eval: [number, ...OracleValue[]][] }>
  breakdown: {
    interpolation: {
      alg: number, curveType: number, before: SplineJson, results: IntervalJson[],
      after: SplineJson, eval: (number | null)[]
    }[]
    extrapolation: {
      mode: number, results: (IntervalJson | null)[], after: SplineJson, eval: (number | null)[]
    }[]
    innerLooping: {
      results: { time: number, can: boolean, reason: string, result: IntervalJson | null }[]
      after: SplineJson
      eval: [number, number | null][]
    }
  }
  truncate: Record<string, { interval: IntervalJson, spline: SplineJson }[]>
  truncateOsc: SplineJson
  sample: Record<string, { interval: IntervalJson, polylines: [number, number][][], sources: number[] }>
  bake: Record<string, { interval: IntervalJson, loopsBaked: KnotJson[], innerBaked: KnotJson[] }>
  timeScaled: Record<string, SplineJson[]>
  regressionPreventer: {
    caseName: string, museum: string, knotTime: number, knotDelta: number,
    preDelta: number, postDelta: number, regressiveBefore: boolean,
    modes: {
      mode: number, name: string, result: string, spline: SplineJson,
      regressiveAfter: boolean, batch?: SplineJson, edit?: SplineJson
    }[]
  }[]
}

export const oracle = readOracleFixture(fileURLToPath(
  new URL('./fixtures/tsOracle.json', import.meta.url))) as OracleJson

export function num(v: OracleNumber): number {
  if (v === 'inf') return Infinity
  if (v === '-inf') return -Infinity
  if (v === 'nan') return NaN
  return v
}

export function interval(j: IntervalJson): GfInterval {
  return new GfInterval(num(j[0]), num(j[1]), j[2], j[3])
}

/** Relative-and-absolute closeness used for values ported bit-for-bit. */
export function expectClose(actual: number | undefined, expected: OracleValue, msg: string, tol = 1e-9): void {
  if (expected === 'error') return
  if (expected === null) {
    expect(actual, msg).toBeUndefined()
    return
  }
  const e = num(expected)
  expect(actual, msg).toBeDefined()
  const a = actual!
  if (Number.isNaN(e)) {
    expect(Number.isNaN(a), `${msg}: expected NaN, got ${a}`).toBe(true)
    return
  }
  if (!Number.isFinite(e)) {
    expect(a, msg).toBe(e)
    return
  }
  const scale = Math.max(1, Math.abs(e))
  expect(Math.abs(a - e) <= tol * scale, `${msg}: expected ${e}, got ${a}`).toBe(true)
}

export function expectKnotsClose(knots: readonly Knot[], expected: KnotJson[], msg: string, tol = 1e-9): void {
  expect(knots.map(k => k.getTime()), `${msg}: knot times`).toHaveLength(expected.length)
  expected.forEach((e, i) => {
    const k = knots[i]!
    const m = `${msg}: knot ${i} (t=${e.time})`
    expectClose(k.getTime(), e.time, `${m} time`, tol)
    expectClose(k.GetValue(), e.value, `${m} value`, tol)
    expect(k.isDualValued(), `${m} dualValued`).toBe(e.preValue !== null)
    if (e.preValue !== null) expectClose(k.getPreValue(), e.preValue, `${m} preValue`, tol)
    expect(k.getNextInterpolation(), `${m} nextInterp`).toBe(e.nextInterp)
    expectClose(k.getPreTanWidth(), e.preTanWidth, `${m} preTanWidth`, tol)
    expectClose(k.getPreTanSlope(), e.preTanSlope, `${m} preTanSlope`, tol)
    expectClose(k.getPostTanWidth(), e.postTanWidth, `${m} postTanWidth`, tol)
    expectClose(k.getPostTanSlope(), e.postTanSlope, `${m} postTanSlope`, tol)
    expect(k.getPreTanAlgorithm(), `${m} preTanAlgorithm`).toBe(e.preTanAlgorithm)
    expect(k.getPostTanAlgorithm(), `${m} postTanAlgorithm`).toBe(e.postTanAlgorithm)
  })
}

export function expectSplineClose(spline: Spline, expected: SplineJson, msg: string, tol = 1e-9): void {
  expect(spline.getCurveType(), `${msg}: curveType`).toBe(expected.curveType)
  const pre = spline.getPreExtrapolation()
  const post = spline.getPostExtrapolation()
  expect(pre.mode, `${msg}: pre extrap`).toBe(expected.pre.mode)
  expect(post.mode, `${msg}: post extrap`).toBe(expected.post.mode)
  // Python reports the slope member regardless of mode.
  expectClose(pre.slope, expected.pre.slope, `${msg}: pre slope`, tol)
  expectClose(post.slope, expected.post.slope, `${msg}: post slope`, tol)
  const lp = spline.getInnerLoopParams()
  expect([lp.protoStart, lp.protoEnd, lp.numPreLoops, lp.numPostLoops, lp.valueOffset],
    `${msg}: loop params`).toEqual(expected.loop)
  expectKnotsClose(spline.getKnots(), expected.knots, msg, tol)
}

export function expectIntervalEqual(actual: GfInterval | undefined, expected: IntervalJson | null, msg: string): void {
  if (expected === null) {
    expect(actual, msg).toBeUndefined()
    return
  }
  expect(actual, msg).toBeDefined()
  expect(actual!.equals(interval(expected)), `${msg}: got ${actual!.toString()}`).toBe(true)
}

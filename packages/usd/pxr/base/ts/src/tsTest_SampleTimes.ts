// Ported from OpenUSD 26.11.1: pxr/base/ts/tsTest_SampleTimes.cpp,
//  pxr/base/ts/tsTest_SampleTimes.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import type { TsSpline } from './spline.ts'
import { TsInterpMode } from './types.ts'

// Ported from OpenUSD v26.08 pxr/base/ts/tsTest_SampleTimes.h and
// tsTest_SampleTimes.cpp.

// tsTest_SampleTimes.h:29-57 and tsTest_SampleTimes.cpp:16-51.
export class TsTest_SampleTime {
  constructor(public time = 0.0, public pre = false) {}

  lessThan(other: TsTest_SampleTime): boolean {
    return this.time < other.time ||
      (this.time === other.time && this.pre && !other.pre)
  }

  equals(other: TsTest_SampleTime): boolean {
    return this.time === other.time && this.pre === other.pre
  }

  toString(): string {
    return `Ts.TsTest_SampleTimes.SampleTime(${this.time}, ${this.pre ? 'True' : 'False'})`
  }
}

/** std::set<SampleTime>: ordered by SampleTime::operator<, unique. */
class SampleTimeSet {
  readonly #items: TsTest_SampleTime[] = []

  insert(t: TsTest_SampleTime): void {
    let lo = 0, hi = this.#items.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (this.#items[mid]!.lessThan(t)) lo = mid + 1
      else hi = mid
    }
    const at = this.#items[lo]
    if (at && !t.lessThan(at)) return
    this.#items.splice(lo, 0, new TsTest_SampleTime(t.time, t.pre))
  }

  get size(): number { return this.#items.length }
  values(): readonly TsTest_SampleTime[] { return this.#items }
}

export class TsTest_SampleTimes {
  static readonly SampleTime = TsTest_SampleTime

  readonly #hasSpline: boolean
  readonly #spline: TsSpline | undefined
  readonly #times = new SampleTimeSet()

  // tsTest_SampleTimes.cpp:70-81.
  constructor(spline?: TsSpline) {
    this.#hasSpline = spline !== undefined
    this.#spline = spline?.clone()
  }

  // tsTest_SampleTimes.cpp:53-68.
  #getKnotTimes(): SampleTimeSet {
    const result = new SampleTimeSet()
    let held = false
    for (const knot of this.#spline!.getKnots()) {
      if (held || knot.isDualValued()) {
        result.insert(new TsTest_SampleTime(knot.getTime(), true))
      }
      result.insert(new TsTest_SampleTime(knot.getTime()))
      held = knot.getNextInterpolation() === TsInterpMode.Held
    }
    return result
  }

  // tsTest_SampleTimes.cpp:83-95.
  addTimes(times: readonly (number | TsTest_SampleTime)[]): void {
    for (const time of times) {
      this.#times.insert(typeof time === 'number' ? new TsTest_SampleTime(time) : time)
    }
  }

  // tsTest_SampleTimes.cpp:97-107.
  addKnotTimes(): void {
    if (!this.#hasSpline) return
    for (const t of this.#getKnotTimes().values()) this.#times.insert(t)
  }

  // tsTest_SampleTimes.cpp:109-138.
  addUniformInterpolationTimes(numSamples: number): void {
    if (!this.#hasSpline) return
    if (numSamples < 1) return
    const knotTimes = this.#getKnotTimes().values()
    if (knotTimes.length < 2) return
    const firstTime = knotTimes[0]!.time
    const lastTime = knotTimes[knotTimes.length - 1]!.time
    const knotRange = lastTime - firstTime
    const step = knotRange / (numSamples + 1)
    for (let i = 0; i < numSamples - 1; i++) {
      this.#times.insert(new TsTest_SampleTime(firstTime + i * step))
    }
  }

  // tsTest_SampleTimes.cpp:140-183.
  addExtrapolationTimes(extrapolationFactor: number): void {
    if (!this.#hasSpline) return
    if (extrapolationFactor <= 0.0) return
    const spline = this.#spline!
    const preLoop = spline.getPreExtrapolation().isLooping()
    const postLoop = spline.getPostExtrapolation().isLooping()
    if (preLoop && postLoop) return
    const knotTimes = this.#getKnotTimes().values()
    if (knotTimes.length < 2) return
    const firstTime = knotTimes[0]!.time
    const lastTime = knotTimes[knotTimes.length - 1]!.time
    const knotRange = lastTime - firstTime
    const extrap = extrapolationFactor * knotRange
    if (!preLoop) this.#times.insert(new TsTest_SampleTime(firstTime - extrap))
    if (!postLoop) this.#times.insert(new TsTest_SampleTime(lastTime + extrap))
  }

  // tsTest_SampleTimes.cpp:185-271.
  addExtrapolatingLoopTimes(numIterations: number, numSamplesPerIteration: number): void {
    if (!this.#hasSpline) return
    if (numIterations <= 0) return
    const spline = this.#spline!
    const preLoop = spline.getPreExtrapolation().isLooping()
    const postLoop = spline.getPostExtrapolation().isLooping()
    if (!preLoop && !postLoop) return
    const knotTimes = this.#getKnotTimes().values()
    if (knotTimes.length < 2) return
    const firstTime = knotTimes[0]!.time
    const lastTime = knotTimes[knotTimes.length - 1]!.time
    const knotRange = lastTime - firstTime

    const knotRangeTimes = new TsTest_SampleTimes(spline)
    knotRangeTimes.addKnotTimes()
    knotRangeTimes.addUniformInterpolationTimes(numSamplesPerIteration)
    const knotRangeSet = knotRangeTimes.getTimes()

    if (preLoop) {
      for (let i = -numIterations; i < 0; i++) {
        for (const sample of knotRangeSet) {
          this.#times.insert(new TsTest_SampleTime(sample.time + knotRange * i, sample.pre))
        }
      }
      for (let i = -numIterations; i <= 0; i++) {
        this.#times.insert(new TsTest_SampleTime(firstTime + knotRange * i, true))
      }
    }
    if (postLoop) {
      for (let i = 1; i <= numIterations; i++) {
        for (const sample of knotRangeSet) {
          this.#times.insert(new TsTest_SampleTime(sample.time + knotRange * i, sample.pre))
        }
      }
      for (let i = 0; i <= numIterations; i++) {
        this.#times.insert(new TsTest_SampleTime(lastTime + knotRange * i, true))
      }
    }
  }

  // tsTest_SampleTimes.cpp:273-279.
  addStandardTimes(): void {
    this.addKnotTimes()
    this.addUniformInterpolationTimes(200)
    this.addExtrapolationTimes(0.2)
    this.addExtrapolatingLoopTimes(3, 200)
  }

  getTimes(): readonly TsTest_SampleTime[] {
    return this.#times.values()
  }

  getMinTime(): number {
    const times = this.#times.values()
    return times.length === 0 ? NaN : times[0]!.time
  }

  getMaxTime(): number {
    const times = this.#times.values()
    return times.length === 0 ? NaN : times[times.length - 1]!.time
  }
}

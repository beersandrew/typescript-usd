// Ported from OpenUSD 26.11.1: pxr/base/ts/TsTest_Comparator.py
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import type { TsSpline } from './spline.ts'
import { TsTest_Grapher, TsTest_GrapherDiff } from './TsTest_Grapher.ts'
import { TsTest_SampleTime } from './tsTest_SampleTimes.ts'
import type { TsTest_Sample, TsTest_SampleVec } from './tsTest_Types.ts'

// Ported from OpenUSD v26.08 pxr/base/ts/TsTest_Comparator.py.
export class TsTest_Comparator {
  // TsTest_Comparator.py:13-15.
  static init(): boolean {
    return TsTest_Grapher.init()
  }

  readonly #sampleSets: TsTest_SampleVec[] = []
  readonly #grapher: TsTest_Grapher
  #haveCompared = false
  #diffs: TsTest_GrapherDiff[] = []
  #maxDiff = 0
  #maxDiffSamples: [TsTest_Sample, TsTest_Sample] | undefined
  #maxDiffSampleTime: TsTest_SampleTime | undefined
  /** Lines TsTest_Comparator.py would print. */
  readonly messages: string[] = []

  // TsTest_Comparator.py:17-20.
  constructor(title: string, widthPx = 1000, heightPx = 1500) {
    this.#grapher = new TsTest_Grapher(title, widthPx, heightPx)
  }

  // TsTest_Comparator.py:22-29.
  addSpline(name: string, spline: TsSpline, samples: TsTest_SampleVec, baked?: TsSpline): void {
    this.#sampleSets.push(samples)
    this.#grapher.addSpline(name, spline, samples, baked)
  }

  Display(): void {
    this.#compare()
    this.#grapher.Display()
  }

  write(filePath: string): void {
    this.#compare()
    this.#grapher.write(filePath)
  }

  getMaxDiff(): number {
    this.#compare()
    return this.#maxDiff
  }

  getMaxDiffSamples(): [TsTest_SampleTime | undefined, [TsTest_Sample, TsTest_Sample] | undefined] {
    this.#compare()
    return [this.#maxDiffSampleTime, this.#maxDiffSamples]
  }

  // TsTest_Comparator.py:47-57.
  verifyDiffs(label: string, tolerance: number): boolean {
    this.#compare()
    if (this.#maxDiff > tolerance) {
      const preStr = this.#maxDiffSampleTime?.pre ? ' (pre)' : ''
      this.messages.push(`${label}: max diff ${this.#maxDiff} exceeds ${tolerance} ` +
        `at time ${this.#maxDiffSampleTime?.time}${preStr}, ` +
        `values ${this.#maxDiffSamples?.[0].value} and ${this.#maxDiffSamples?.[1].value}`)
      return false
    }
    return true
  }

  // TsTest_Comparator.py:59-66.
  #compare(): void {
    if (this.#haveCompared) {
      return
    }
    this.#findDiffs()
    this.#grapher.addDiffData(this.#diffs)
    this.#haveCompared = true
  }

  // TsTest_Comparator.py:68-101.
  #findDiffs(): void {
    this.#diffs = []
    this.#maxDiff = 0

    if (this.#sampleSets.length < 2) {
      throw new Error('Comparator: must call AddSpline at least twice')
    }
    const set0 = this.#sampleSets[0]!
    const set1 = this.#sampleSets[1]!
    if (set0.length !== set1.length) {
      throw new Error('Mismatched eval results')
    }

    const numSamples = set0.length
    for (let i = 0; i < numSamples; i++) {
      const sample1 = set0[i]!
      const sample2 = set1[i]!

      if (sample2.time - sample1.time > 1e-4) {
        throw new Error(`Mismatched eval times at index ${i}`)
      }

      const diff = sample2.value - sample1.value
      this.#diffs.push(new TsTest_GrapherDiff(sample1.time, diff))

      const absDiff = Math.abs(diff)
      if (absDiff > this.#maxDiff) {
        this.#maxDiff = absDiff
        this.#maxDiffSamples = [sample1, sample2]
        const isPre = i < numSamples - 1 &&
          Math.abs(set0[i + 1]!.time - sample1.time) < 1e-4
        this.#maxDiffSampleTime = new TsTest_SampleTime(sample1.time, isPre)
      }
    }
  }
}

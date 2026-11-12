// Ported from OpenUSD 26.11.1: pxr/base/ts/TsTest_Grapher.py
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import type { TsSpline } from './spline.ts'
import type { TsTest_SampleVec } from './tsTest_Types.ts'

// Ported from OpenUSD v26.08 pxr/base/ts/TsTest_Grapher.py. The graph
// rendering uses matplotlib; typescript-usd has no matplotlib, so Init() takes the
// TsTest_Grapher.py:144-159 ImportError path and reports graphics disabled.

// TsTest_Grapher.py:15-21.
export class TsTest_GrapherSpline {
  constructor(
    readonly name: string,
    readonly spline: TsSpline,
    readonly samples: TsTest_SampleVec,
    readonly baked: TsSpline,
    readonly colorIndex: number | undefined,
  ) {}
}

// TsTest_Grapher.py:23-26.
export class TsTest_GrapherDiff {
  constructor(public time: number, public value: number) {}
}

export class TsTest_Grapher {
  static readonly Spline = TsTest_GrapherSpline
  static readonly Diff = TsTest_GrapherDiff

  // TsTest_Grapher.py:144-159.
  static init(): boolean {
    return false
  }

  readonly #splines: TsTest_GrapherSpline[] = []
  #diffs: TsTest_GrapherDiff[] | undefined

  // TsTest_Grapher.py:161-201.
  constructor(
    readonly title?: string,
    readonly widthPx = 1000,
    readonly heightPx = 750,
    readonly dataAspect?: number,
    readonly includeScales = true,
    readonly includeBox = true,
  ) {}

  // TsTest_Grapher.py:203-212.
  addSpline(name: string, spline: TsSpline, samples: TsTest_SampleVec,
    baked?: TsSpline, colorIndex?: number): void {
    this.#splines.push(new TsTest_GrapherSpline(name, spline, samples, baked ?? spline, colorIndex))
  }

  // TsTest_Grapher.py:214-215.
  addDiffData(diffs: TsTest_GrapherDiff[]): void {
    this.#diffs = diffs
  }

  getSplines(): readonly TsTest_GrapherSpline[] { return this.#splines }
  getDiffData(): readonly TsTest_GrapherDiff[] | undefined { return this.#diffs }

  // TsTest_Grapher.py:217-227 require matplotlib.
  Display(): void {
    throw new Error('TsTest_Grapher: graphical output is disabled (no matplotlib)')
  }
  write(_filePath: string): void {
    throw new Error('TsTest_Grapher: graphical output is disabled (no matplotlib)')
  }
}

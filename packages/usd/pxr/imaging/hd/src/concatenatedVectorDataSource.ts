// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hd/concatenatedVectorDataSource.cpp,
//  pxr/imaging/hd/concatenatedVectorDataSource.h
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/concatenatedVectorDataSource.{h,cpp}
// (OpenUSD 26.11.1).
//
// The initializer-list, (count, vectors) and two/three-source constructors
// are folded into one variadic New.

import { HdVectorDataSource, type HdDataSourceBase } from './dataSource.ts'

/** concatenatedVectorDataSource.h:15-74: lazily composes two or more vector
 *  data source by concatenating all the elements (in the order in which the
 *  vector data sources are listed). */
export class HdConcatenatedVectorDataSource extends HdVectorDataSource {
  private readonly _sources: (HdVectorDataSource | undefined)[]

  /** concatenatedVectorDataSource.cpp:11-41 */
  private constructor(sources: (HdVectorDataSource | undefined)[]) {
    super()
    this._sources = sources
  }

  static new(...sources: (HdVectorDataSource | undefined)[]): HdConcatenatedVectorDataSource {
    return new HdConcatenatedVectorDataSource(sources)
  }

  /** concatenatedVectorDataSource.cpp:43-54. Creates
   *  HdConcatenatedVectorDataSource from sources, but only if needed. If one
   *  of given handles is null, the other handle is returned instead. */
  static concatenatedVectorDataSources(
    src1: HdVectorDataSource | undefined,
    src2: HdVectorDataSource | undefined,
  ): HdVectorDataSource | undefined {
    if (!src1) {
      return src2
    }
    if (!src2) {
      return src1
    }
    return HdConcatenatedVectorDataSource.new(src1, src2)
  }

  /** concatenatedVectorDataSource.cpp:56-68 */
  getNumElements(): number {
    let total = 0

    for (const source of this._sources) {
      if (source) {
        total += source.getNumElements()
      }
    }

    return total
  }

  /** concatenatedVectorDataSource.cpp:70-86 */
  getElement(i: number): HdDataSourceBase | undefined {
    let runningTotal = 0

    for (const source of this._sources) {
      if (source) {
        const nextTotal = runningTotal + source.getNumElements()
        if (runningTotal <= i && i < nextTotal) {
          return source.getElement(i - runningTotal)
        }
        runningTotal = nextTotal
      }
    }

    return undefined
  }
}

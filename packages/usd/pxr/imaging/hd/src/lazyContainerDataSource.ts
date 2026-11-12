// Ported from OpenUSD 26.11.1: pxr/imaging/hd/lazyContainerDataSource.cpp,
//  pxr/imaging/hd/lazyContainerDataSource.h
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/lazyContainerDataSource.{h,cpp}
// (OpenUSD 26.11.1).

import { HdContainerDataSource, type HdDataSourceBase } from './dataSource.ts'

/** lazyContainerDataSource.h:17-44: a container data source lazily
 *  evaluating the given thunk to forward all calls to. */
export class HdLazyContainerDataSource extends HdContainerDataSource {
  private _src: HdContainerDataSource | undefined
  private _evaluated = false

  private constructor(private readonly _thunk: () => HdContainerDataSource | undefined) { super() }

  static new(thunk: () => HdContainerDataSource | undefined): HdLazyContainerDataSource {
    return new HdLazyContainerDataSource(thunk)
  }

  /** lazyContainerDataSource.cpp:19-26 */
  getNames(): string[] {
    const src = this._getSrc()
    if (src) {
      return src.getNames()
    }
    return []
  }

  /** lazyContainerDataSource.cpp:28-35 */
  Get(name: string): HdDataSourceBase | undefined {
    const src = this._getSrc()
    if (src) {
      return src.Get(name)
    }
    return undefined
  }

  /** lazyContainerDataSource.cpp:37-47. Upstream stores the result only
   *  when it is non-null (an atomic load of a null handle re-runs the
   *  thunk); this port does the same. */
  private _getSrc(): HdContainerDataSource | undefined {
    if (this._evaluated) {
      return this._src
    }
    const src = this._thunk()
    if (src) {
      this._src = src
      this._evaluated = true
    }
    return src
  }
}

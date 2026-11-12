// Ported from OpenUSD 26.11.1: pxr/imaging/hd/mapContainerDataSource.cpp,
//  pxr/imaging/hd/mapContainerDataSource.h
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/mapContainerDataSource.{h,cpp}
// (OpenUSD 26.11.1).

import { HdContainerDataSource, type HdDataSourceBase } from './dataSource.ts'

/** mapContainerDataSource.h:16-46: applies a function to all data sources
 *  in a container data source (non-recursively). */
export class HdMapContainerDataSource extends HdContainerDataSource {
  private constructor(
    private readonly _f: ((ds: HdDataSourceBase) => HdDataSourceBase | undefined) | undefined,
    private readonly _src: HdContainerDataSource | undefined,
  ) { super() }

  static new(
    f: ((ds: HdDataSourceBase) => HdDataSourceBase | undefined) | undefined,
    src: HdContainerDataSource | undefined,
  ): HdMapContainerDataSource {
    return new HdMapContainerDataSource(f, src)
  }

  /** mapContainerDataSource.cpp:21-28 */
  getNames(): string[] {
    if (!this._src) {
      return []
    }
    return this._src.getNames()
  }

  /** mapContainerDataSource.cpp:30-45 */
  Get(name: string): HdDataSourceBase | undefined {
    if (!this._src) {
      return undefined
    }
    const ds = this._src.Get(name)
    if (!ds) {
      return undefined
    }
    if (!this._f) {
      return ds
    }
    return this._f(ds)
  }
}

// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdSkelImaging/dataSourceUtils.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdSkelImaging/dataSourceUtils.h (OpenUSD 26.11.1).
//
// Divergences:
// - UsdSkelImagingGetTypedValue returns undefined where upstream returns the
//   value-initialized `{}` of the data source's value type; callers spell out
//   the default they need (see _UsdSkelImagingToArray for arrays).
// - _UsdSkelImagingToArray is an addition of this port: data source values
//   that are VtArrays upstream are VtArray, plain arrays or typed arrays here
//   (see pxr/imaging/hd/src/dataSourceTypeDefs.ts); it returns the elements
//   as a plain array, empty for a missing value (the empty VtArray upstream).

import type { SampledDataSource as HdSampledDataSource } from 'typescript-usd/hd'
import { Array as VtArray, Value as VtValue } from 'typescript-usd/vt'

/** dataSourceUtils.h:14-50. A thunk for shared pointers computing the result
 *  only once and caching it. (The atomic compare-exchange of upstream is not
 *  needed in single-threaded JavaScript.) */
export abstract class UsdSkelImagingSharedPtrThunk<T> {
  private _data: T | undefined

  /** dataSourceUtils.h:27-41 */
  Get(): T | undefined {
    if (this._data !== undefined) {
      return this._data
    }
    this._data = this._compute()
    return this._data
  }

  /** dataSourceUtils.h:43 */
  invalidate(): void { this._data = undefined }

  /** dataSourceUtils.h:46 */
  protected abstract _compute(): T | undefined
}

/** dataSourceUtils.h:52-62 */
export function UsdSkelImagingGetTypedValue<T>(
  ds: { getTypedValue(shutterOffset: number): T } | undefined,
  shutterOffset = 0.0,
): T | undefined {
  if (!ds) {
    return undefined
  }
  return ds.getTypedValue(shutterOffset)
}

/** The elements of an array-valued data source value (see the header). */
export function _UsdSkelImagingToArray<T>(value: unknown): T[] {
  if (value === undefined || value === null) return []
  if (value instanceof VtValue) return value.IsEmpty() ? [] : _UsdSkelImagingToArray<T>(value.UncheckedGet())
  if (value instanceof VtArray) return (value as VtArray<T>).toArray()
  if (Array.isArray(value)) return value as T[]
  if (ArrayBuffer.isView(value)) return Array.from(value as unknown as ArrayLike<T>)
  return []
}

/** The sampled data source's typed value as an array (see the header). */
export function _UsdSkelImagingGetArray<T>(
  ds: HdSampledDataSource | undefined,
  shutterOffset = 0.0,
): T[] {
  if (!ds) return []
  const typed = ds as unknown as { getTypedValue?: (t: number) => unknown }
  return _UsdSkelImagingToArray<T>(
    typed.getTypedValue ? typed.getTypedValue(shutterOffset) : ds.GetValue(shutterOffset))
}

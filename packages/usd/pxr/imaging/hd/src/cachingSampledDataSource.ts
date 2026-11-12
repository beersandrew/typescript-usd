// Ported from OpenUSD 26.11.1: pxr/imaging/hd/cachingSampledDataSource.h
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/imaging/hd/cachingSampledDataSource.h.
//
// HdCachingSampledDataSource and HdCachingTypedSampledDataSource cache the
// values obtained from GetValue and GetTypedValue across subsequent calls;
// the values are freed when the caching data source is freed.
//
// Divergences:
// - The cache is a Map keyed by shutter offset in place of
//   tbb::concurrent_hash_map (cachingSampledDataSource.h:42, :108): there is
//   one thread.
// - HdSampledDataSource::GetValue returns the source's value as is in this
//   port (dataSource.ts), so the cached value is whatever the input returns.
// - HdCachingTypedSampledDataSource::GetValue returns the typed value, as
//   typed sampled data sources do in this port (HdTypedSampledDataSource
//   GetValue), where upstream wraps it in a VtValue
//   (cachingSampledDataSource.h:129-132).

import { HdSampledDataSource, HdTypedSampledDataSource } from './dataSource.ts'

/** cachingSampledDataSource.h:24-87
 *
 * A sampled data source which maintains a cache of values from the upstream
 * sampled data source, with values persisting until all handles to the data
 * source are released. For a given data source (or copies of that data
 * source) GetValue for a shutter offset will receive answers drawn from the
 * upstream data source, but subsequent calls at that shutter offset against
 * the same handle will receive a cached value. */
export class HdCachingSampledDataSource extends HdSampledDataSource {
  private readonly _cache = new Map<number, unknown>()

  static new(input: HdSampledDataSource | undefined): HdCachingSampledDataSource {
    return new HdCachingSampledDataSource(input)
  }

  /** cachingSampledDataSource.h:80-81 */
  protected constructor(protected readonly _input: HdSampledDataSource | undefined) {
    super()
  }

  /** cachingSampledDataSource.h:44-62 */
  GetValue(shutterOffset: number): unknown {
    if (!this._input) {
      return undefined
    }

    // Lookup value in cache
    if (this._cache.has(shutterOffset)) {
      return this._cache.get(shutterOffset)
    }
    // Cache miss compute value and store
    const value = this._input.GetValue(shutterOffset)
    this._cache.set(shutterOffset, value)
    return value
  }

  /** cachingSampledDataSource.h:64-77 */
  GetContributingSampleTimesForInterval(
    startTime: number,
    endTime: number,
    outSampleTimes: number[],
  ): boolean {
    if (!this._input) {
      return false
    }

    return this._input.GetContributingSampleTimesForInterval(
      startTime, endTime, outSampleTimes)
  }
}

/** cachingSampledDataSource.h:89-154
 *
 * A typed sampled data source which maintains a cache of values from the
 * upstream sampled data source (see HdCachingSampledDataSource). */
export class HdCachingTypedSampledDataSource<T> extends HdTypedSampledDataSource<T> {
  private readonly _cache = new Map<number, T>()

  static new<T>(input: HdTypedSampledDataSource<T> | undefined): HdCachingTypedSampledDataSource<T> {
    return new HdCachingTypedSampledDataSource<T>(input)
  }

  /** cachingSampledDataSource.h:149-150 */
  protected constructor(protected readonly _input: HdTypedSampledDataSource<T> | undefined) {
    super()
  }

  /** cachingSampledDataSource.h:110-127 */
  getTypedValue(shutterOffset: number): T {
    if (!this._input) {
      return undefined as T
    }

    // Lookup value in cache
    if (this._cache.has(shutterOffset)) {
      return this._cache.get(shutterOffset)!
    }
    // Cache miss compute value and store
    const value = this._input.getTypedValue(shutterOffset)
    this._cache.set(shutterOffset, value)
    return value
  }

  /** cachingSampledDataSource.h:134-146 */
  GetContributingSampleTimesForInterval(
    startTime: number,
    endTime: number,
    outSampleTimes: number[],
  ): boolean {
    if (!this._input) {
      return false
    }

    return this._input.GetContributingSampleTimesForInterval(
      startTime, endTime, outSampleTimes)
  }
}

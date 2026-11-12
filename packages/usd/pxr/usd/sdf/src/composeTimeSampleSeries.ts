// Ported from OpenUSD 26.11.1: pxr/usd/sdf/composeTimeSampleSeries.h,
//  pxr/usd/sdf/types.cpp
// Copyright 2016, 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// SdfComposeTimeSampleSeries (pxr/usd/sdf/composeTimeSampleSeries.h, OpenUSD
// 26.11.1) and SdfComposeTimeSampleMaps (types.cpp:124-145).
import { SdfPathExpression } from './pathExpression.ts'

// Sdf_timesEqualDefaultFn (composeTimeSampleSeries.h:16-19).
// GfIsClose for doubles: |t1 - t2| < epsilon.
const timesEqualDefault = (t1: number, t2: number) => Math.abs(t1 - t2) < 1e-6

/**
 * Compose the stronger series `[time, value]` over the weaker one. `compose`
 * returns the composed value, or undefined to use the stronger value;
 * `output` receives the results in strictly increasing time
 * (composeTimeSampleSeries.h:47-139).
 */
export function sdfComposeTimeSampleSeries<V>(
  strong: readonly (readonly [number, V])[],
  weak: readonly (readonly [number, V])[],
  compose: (strong: V, weak: V) => V | undefined,
  output: (value: V, time: number) => void,
  timesEqual: (t1: number, t2: number) => boolean = timesEqualDefault,
): void {
  // If either series is empty, just copy the other.
  if (weak.length === 0) {
    for (const [time, value] of strong) output(value, time)
    return
  }
  if (strong.length === 0) {
    for (const [time, value] of weak) output(value, time)
    return
  }
  const held = (series: readonly (readonly [number, V])[], iter: number, time: number) =>
    iter === series.length || (!timesEqual(series[iter]![0], time) && iter !== 0) ? iter - 1 : iter

  let strongIter = 0
  let weakIter = 0
  while (strongIter !== strong.length || weakIter !== weak.length) {
    const strongTime = strongIter === strong.length ? Infinity : strong[strongIter]![0]
    const weakTime = weakIter === weak.length ? Infinity : weak[weakIter]![0]
    if (strongTime <= weakTime) {
      const composed = compose(strong[strongIter]![1], weak[held(weak, weakIter, strongTime)]![1])
      output(composed !== undefined ? composed : strong[strongIter]![1], strongTime)
    } else {
      const composed = compose(strong[held(strong, strongIter, weakTime)]![1], weak[weakIter]![1])
      // A non-composing stronger sample hides weaker samples.
      if (composed !== undefined) output(composed, weakTime)
    }
    // Advance the iterator whose next time is less, or the one that has
    // samples remaining; at the same time advance both.
    if (strongIter === strong.length) ++weakIter
    else if (weakIter === weak.length) ++strongIter
    else if (timesEqual(strongTime, weakTime)) { ++strongIter; ++weakIter }
    else if (strongTime < weakTime) ++strongIter
    else ++weakIter
  }
}

// VtValueTryComposeOver for the composing value types registered in sdf: an
// SdfPathExpression composes over another (pathExpression.cpp:46-50). Other
// values do not compose here.
function tryComposeOver(strong: unknown, weak: unknown): unknown {
  if (strong instanceof SdfPathExpression && weak instanceof SdfPathExpression) {
    return strong.composeOver(weak)
  }
  return undefined
}

/** SdfComposeTimeSampleMaps (types.cpp:124-145): compose a stronger
 * SdfTimeSampleMap over a weaker one. */
export function sdfComposeTimeSampleMaps(
  strong: ReadonlyMap<number, unknown>, weak: ReadonlyMap<number, unknown>,
): Map<number, unknown> {
  const sorted = (map: ReadonlyMap<number, unknown>) => [...map].sort((a, b) => a[0] - b[0])
  const result = new Map<number, unknown>()
  sdfComposeTimeSampleSeries(sorted(strong), sorted(weak), tryComposeOver,
    (value, time) => { result.set(time, value) })
  return result
}

// Ported from OpenUSD 26.11.1: pxr/base/work/loops.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/base/work/loops.h (OpenUSD 26.11.1). Without concurrency
// every loop takes upstream's serial branch (loops.h:171-191, 315-336).

import { WorkHasConcurrency } from './threadLimits.ts'

/** WorkSerialForN (loops.h:141-146). */
export function WorkSerialForN(n: number, fn: (begin: number, end: number) => void): void {
  fn(0, n)
}

/**
 * WorkParallelForN (loops.h:163-210). The serial branch is taken whenever
 * concurrency is limited to 1, which it always is here.
 */
export function WorkParallelForN(n: number, callback: (begin: number, end: number) => void,
  _grainSize = 1): void {
  if (n === 0) return
  if (WorkHasConcurrency()) {
    // Unreachable: WorkGetPhysicalConcurrencyLimit() is 1 (threadLimits.ts).
    throw new Error('WorkParallelForN: no parallel implementation (loops.h:171-187)')
  }
  WorkSerialForN(n, callback)
}

/** WorkParallelForEach (loops.h:310-337): std::for_each when serial. */
export function WorkParallelForEach<T>(items: Iterable<T>, fn: (item: T) => void): void {
  for (const item of items) fn(item)
}

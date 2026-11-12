// Ported from OpenUSD 26.11.1: pxr/base/work/threadLimits.cpp,
//  pxr/base/work/threadLimits.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/base/work/threadLimits.{h,cpp} (OpenUSD 26.11.1).
//
// JavaScript runs a library on one thread, so the physical concurrency limit
// is 1 and every limit normalizes to 1. PXR_WORK_THREAD_LIMIT is honoured as
// upstream reads it (threadLimits.cpp:19-25), but cannot raise the limit
// above the physical one (threadLimits.cpp:61-75 clamps to it as well).

import { TfEnvSetting, TfGetEnvSetting } from 'typescript-usd/tf'

// threadLimits.cpp:19-25
const PXR_WORK_THREAD_LIMIT = new TfEnvSetting<number>(
  'PXR_WORK_THREAD_LIMIT', 0,
  'Limits the number of threads the application may spawn. 0 (default) ' +
  'allows for maximum concurrency as determined by the number of physical ' +
  'cores, or the process\'s affinity mask, whichever is smaller. Note that ' +
  'the environment variable (if set to a non-zero value) will override any ' +
  'value passed to Work thread-limiting API calls.')

let _concurrencyLimit = 1

/** WorkGetPhysicalConcurrencyLimit (threadLimits.h:50): one thread. */
export function WorkGetPhysicalConcurrencyLimit(): number {
  return 1
}

// Work_NormalizeThreadCount (threadLimits.cpp:39-48).
function Work_NormalizeThreadCount(n: number): number {
  return n >= 0 ? n : Math.max(1, n + WorkGetPhysicalConcurrencyLimit())
}

/** WorkGetConcurrencyLimitSetting (threadLimits.h:38). */
export function WorkGetConcurrencyLimitSetting(): number {
  return Work_NormalizeThreadCount(TfGetEnvSetting(PXR_WORK_THREAD_LIMIT))
}

/** WorkGetConcurrencyLimit (threadLimits.h:31). */
export function WorkGetConcurrencyLimit(): number {
  return _concurrencyLimit
}

/** WorkHasConcurrency (threadLimits.h:44): false on the single JS thread. */
export function WorkHasConcurrency(): boolean {
  return WorkGetConcurrencyLimit() > 1
}

/** WorkSetConcurrencyLimit (threadLimits.h:63); clamped to the physical limit. */
export function WorkSetConcurrencyLimit(n: number): void {
  const setting = WorkGetConcurrencyLimitSetting()
  const requested = setting !== 0 ? setting : (n === 0 ? WorkGetPhysicalConcurrencyLimit() : n)
  _concurrencyLimit = Math.max(1, Math.min(requested, WorkGetPhysicalConcurrencyLimit()))
}

/** WorkSetConcurrencyLimitArgument (threadLimits.h:81). */
export function WorkSetConcurrencyLimitArgument(n: number): void {
  WorkSetConcurrencyLimit(Work_NormalizeThreadCount(n))
}

/** WorkSetMaximumConcurrencyLimit (threadLimits.h:89). */
export function WorkSetMaximumConcurrencyLimit(): void {
  WorkSetConcurrencyLimit(WorkGetPhysicalConcurrencyLimit())
}

/** WorkSupportsGranularThreadLimits (threadLimits.h:97). */
export function WorkSupportsGranularThreadLimits(): boolean {
  return true
}

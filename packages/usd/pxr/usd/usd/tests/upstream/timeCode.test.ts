// Ported from OpenUSD 26.11.1: pxr/usd/usd/testenv/testUsdTimeCode.py
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of the registered v26.05 testenv/testUsdTimeCode.py.
// The three native methods were also run against the matching live build.

import { describe, expect, it } from 'vitest'
import { TimeCode as UsdTimeCode } from 'typescript-usd/usd'

describe('UsdTimeCode', () => {
  it('round-trips a sequence of numeric and pre-time values', () => {
    const time1 = new UsdTimeCode(1)
    const time2 = UsdTimeCode.PreTime(2)
    expect(UsdTimeCode.test_TimeCodeSequenceRoundTrip([time1, time2]))
      .toEqual([time1, time2])
  })

  it('reports pre-time source state', () => {
    const time = UsdTimeCode.PreTime(1)
    expect(time.isDefault()).toBe(false)
    expect(time.isNumeric()).toBe(true)
    expect(time.isPreTime()).toBe(true)
  })

  it('orders default, numeric, and pre-time values', () => {
    const times = [
      UsdTimeCode.Default(),
      UsdTimeCode.EarliestTime(),
      new UsdTimeCode(1),
      UsdTimeCode.PreTime(2),
      new UsdTimeCode(2),
      UsdTimeCode.PreTime(3),
      new UsdTimeCode(3),
    ]
    expect(times.map(Number)).toEqual([...times].sort((a, b) => Number(a) - Number(b)).map(Number))
    expect(times.every((time, i) => i === 0 || Number(times[i - 1]) < Number(time))).toBe(true)
  })
})

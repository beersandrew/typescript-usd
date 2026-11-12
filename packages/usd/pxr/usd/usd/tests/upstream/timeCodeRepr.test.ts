// Ported from OpenUSD 26.11.1: pxr/usd/usd/testenv/testUsdTimeCodeRepr.py
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of the registered v26.05 testenv/testUsdTimeCodeRepr.py.
// JavaScript's toString() is the package counterpart of the Python repr
// assertions; object equality replaces Python eval(repr(...)).

import { describe, expect, it } from 'vitest'
import { TimeCode as UsdTimeCode } from 'typescript-usd/usd'

describe('UsdTimeCode representation', () => {
  it('represents default time', () => {
    const time = UsdTimeCode.Default()
    expect(time.toString()).toBe('Usd.TimeCode.Default()')
    expect(time).toEqual(UsdTimeCode.Default())
  })

  it('represents earliest time', () => {
    const time = UsdTimeCode.EarliestTime()
    expect(time.toString()).toBe('Usd.TimeCode.EarliestTime()')
    expect(time).toEqual(UsdTimeCode.EarliestTime())
  })

  it('represents default construction and construction from a zero-valued time type', () => {
    expect(new UsdTimeCode().toString()).toBe('Usd.TimeCode()')
    expect(new UsdTimeCode({ GetValue: () => 0 }).toString()).toBe('Usd.TimeCode()')
  })

  it('represents numeric construction and construction from a numeric time type', () => {
    expect(new UsdTimeCode(123).toString()).toBe('Usd.TimeCode(123.0)')
    expect(new UsdTimeCode({ GetValue: () => 12 }).toString()).toBe('Usd.TimeCode(12.0)')
  })

  it('represents pre-time construction from numeric time types', () => {
    expect(UsdTimeCode.PreTime(123).toString()).toBe('Usd.TimeCode.PreTime(123.0)')
    expect(UsdTimeCode.PreTime({ GetValue: () => 12 }).toString())
      .toBe('Usd.TimeCode.PreTime(12.0)')
  })

  it('represents the pre-time of earliest time', () => {
    const time = UsdTimeCode.PreTime(UsdTimeCode.EarliestTime().GetValue())
    expect(time.toString()).toBe(
      'Usd.TimeCode.PreTime(Usd.TimeCode.EarliestTime().GetValue())',
    )
  })
})

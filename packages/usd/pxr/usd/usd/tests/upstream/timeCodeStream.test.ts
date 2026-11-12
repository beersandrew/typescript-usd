// Ported from OpenUSD 26.11.1: pxr/usd/usd/testenv/testUsdTimeCodeStream.cpp,
//  pxr/usd/usd/timeCode.cpp
// Copyright 2016, 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usd/testenv/testUsdTimeCodeStream.cpp
// (registered as testUsdTimeCodeStream). Stream insertion is
// usdTimeCodeToStreamString (operator<<, timeCode.cpp:33-49); stream
// extraction is usdTimeCodeFromStreamString (operator>>,
// timeCode.cpp:51-94), which returns undefined where the stream would set
// failbit, leaving the caller's time code unchanged.

import { describe, expect, it } from 'vitest'
import {
  TimeCode as UsdTimeCode, TimeCodeTokens as UsdTimeCodeTokens,
  usdTimeCodeFromStreamString, usdTimeCodeToStreamString,
} from 'typescript-usd/usd'

const getStringByStreamInsertion = (timeCode: UsdTimeCode) =>
  usdTimeCodeToStreamString(timeCode)

function getTimeCodeByStreamExtraction(value: string, inputTime: UsdTimeCode): UsdTimeCode {
  return usdTimeCodeFromStreamString(value) ?? inputTime
}

// UsdTimeCode::operator== compares value and pre-time state.
function expectSameTime(actual: UsdTimeCode, expected: UsdTimeCode): void {
  expect(actual.isPreTime()).toBe(expected.isPreTime())
  expect(actual.GetValue()).toBe(expected.GetValue())
}

describe('testUsdTimeCodeStream', () => {
  const defaultConstructedTime = new UsdTimeCode()
  const defaultTime = UsdTimeCode.Default()
  const earliestTime = UsdTimeCode.EarliestTime()
  const preTimeEarliestTime = UsdTimeCode.PreTime(earliestTime.GetValue())
  const defaultTimeValue = 123.0
  const numericTime = new UsdTimeCode(defaultTimeValue)
  const preTime = UsdTimeCode.PreTime(defaultTimeValue)
  // TfStringPrintf("%.f", defaultTimeValue)
  const numericValueString = defaultTimeValue.toFixed(0)
  const preTimeValueString = `${UsdTimeCodeTokens.PRE_TIME} ${defaultTimeValue.toFixed(0)}`

  it('stream insertion', () => {
    expect(getStringByStreamInsertion(defaultConstructedTime)).toBe('0')
    expect(getStringByStreamInsertion(defaultTime)).toBe(UsdTimeCodeTokens.DEFAULT)
    expect(getStringByStreamInsertion(earliestTime)).toBe(UsdTimeCodeTokens.EARLIEST)
    expect(getStringByStreamInsertion(preTimeEarliestTime)).toBe(
      `${UsdTimeCodeTokens.PRE_TIME} ${UsdTimeCodeTokens.EARLIEST}`)
    expect(getStringByStreamInsertion(numericTime)).toBe(numericValueString)
    expect(getStringByStreamInsertion(preTime)).toBe(preTimeValueString)
  })

  it('stream extraction', () => {
    expectSameTime(getTimeCodeByStreamExtraction('0', numericTime), defaultConstructedTime)
    expectSameTime(getTimeCodeByStreamExtraction(
      `${UsdTimeCodeTokens.PRE_TIME} ${UsdTimeCodeTokens.EARLIEST}`, numericTime),
    preTimeEarliestTime)
    const t = getTimeCodeByStreamExtraction(UsdTimeCodeTokens.DEFAULT, numericTime)
    expect(t.isDefault()).toBe(true)
    expect(t.isPreTime()).toBe(false)
    expectSameTime(getTimeCodeByStreamExtraction(UsdTimeCodeTokens.EARLIEST, numericTime),
      earliestTime)
    expectSameTime(getTimeCodeByStreamExtraction('123', defaultTime), numericTime)

    // Bad data should leave the input time code unchanged.
    expectSameTime(getTimeCodeByStreamExtraction('bogus', numericTime), numericTime)
    expectSameTime(getTimeCodeByStreamExtraction('5sometext', numericTime), numericTime)

    expectSameTime(getTimeCodeByStreamExtraction(
      `${UsdTimeCodeTokens.PRE_TIME} ${defaultTimeValue.toFixed(0)}`, preTime), preTime)

    // Bad data should leave the input time code unchanged.
    expectSameTime(getTimeCodeByStreamExtraction(
      `${UsdTimeCodeTokens.PRE_TIME} bogus`, preTime), preTime)
    expectSameTime(getTimeCodeByStreamExtraction(
      `${UsdTimeCodeTokens.PRE_TIME} ${UsdTimeCodeTokens.DEFAULT}`, preTime), preTime)
  })
})

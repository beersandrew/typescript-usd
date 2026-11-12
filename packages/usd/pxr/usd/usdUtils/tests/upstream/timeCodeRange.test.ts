// Ported from OpenUSD 26.11.1: pxr/base/gf/math.h,
//  pxr/usd/usdUtils/testenv/testUsdUtilsTimeCodeRange.cpp,
//  pxr/usd/usdUtils/testenv/testUsdUtilsTimeCodeRange.py,
//  pxr/usd/usdUtils/wrapTimeCodeRange.cpp
// Copyright 2016, 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usdUtils/testenv/testUsdUtilsTimeCodeRange.py
// (registered as testUsdUtilsTimeCodeRange; no testenv directory).
//
// API mapping (wrapTimeCodeRange.cpp):
//   - UsdUtils.TimeCodeRange(...) is new TimeCodeRange(...); the
//     startTimeCode / endTimeCode / stride properties are getStartTimeCode() /
//     getEndTimeCode() / getStride(); IsValid() is isValid().
//   - UsdUtils.TimeCodeRange.Tokens is UsdUtilsTimeCodeRangeTokens.
//   - The frameSpec property is UsdUtilsTimeCodeRangeToStreamString (also
//     toString()), the stream insertion the wrapper calls.
//   - list(timeCodeRange) is [...timeCodeRange]; equality is equals().
//   - A Tf.ErrorException raised for a TF_CODING_ERROR is an error posted to
//     a TfErrorMark.
//   - Gf.IsClose(a, b, eps) on doubles is |a - b| < eps (gf/math.h:28-30).
//
// Not ported: the repr() half of _ValidateFrameSpecAndRepr checks the
// Python __repr__ the wrapper defines (wrapTimeCodeRange.cpp:43-52); it has
// no TypeScript counterpart.
import { describe, expect, it } from 'vitest'
import { Mark as TfErrorMark } from 'typescript-usd/tf'
import { TimeCode as UsdTimeCode } from 'typescript-usd/usd'
import {
  TimeCodeRange, UsdUtilsTimeCodeRangeToStreamString, UsdUtilsTimeCodeRangeTokens,
} from 'typescript-usd/usdUtils'

const isClose = (a: number, b: number, eps: number): boolean => Math.abs(a - b) < eps
const values = (range: TimeCodeRange): number[] => [...range].map(t => t.GetValue())
const timeCodes = (...values: number[]): number[] => values.map(v => new UsdTimeCode(v).GetValue())

// `with self.assertRaises(Tf.ErrorException):`
function expectCodingError(action: () => unknown): void {
  const mark = new TfErrorMark()
  try {
    action()
    expect(mark.isClean()).toBe(false)
  } finally {
    mark.clear()
    mark.dispose()
  }
}

// testUsdUtilsTimeCodeRange.py:24-33 (frameSpec half only)
function validateFrameSpec(timeCodeRange: TimeCodeRange, frameSpec?: string): void {
  if (frameSpec === undefined) {
    expect(UsdUtilsTimeCodeRangeToStreamString(timeCodeRange)).toBe('NONE')
  } else {
    expect(UsdUtilsTimeCodeRangeToStreamString(timeCodeRange)).toBe(frameSpec)
    expect(timeCodeRange.toString()).toBe(frameSpec)
  }
}

function expectRoundTrip(timeCodeRange: TimeCodeRange): void {
  const frameSpecRange = TimeCodeRange.CreateFromFrameSpec(UsdUtilsTimeCodeRangeToStreamString(timeCodeRange))
  expect(frameSpecRange.equals(timeCodeRange)).toBe(true)
}

function expectIsCloseValues(timeCodeRange: TimeCodeRange, expected: number[]): void {
  const got = values(timeCodeRange)
  expect(got.length).toBe(expected.length)
  for (let i = 0; i < expected.length; i++) expect(isClose(got[i]!, expected[i]!, 1e-9)).toBe(true)
}

describe('TestUsdUtilsTimeCodeRange', () => {
  // testUsdUtilsTimeCodeRange.py:17-21
  it('testTimeCodeRangeTokens', () => {
    expect(UsdUtilsTimeCodeRangeTokens.EmptyTimeCodeRange).toBe('NONE')
    expect(UsdUtilsTimeCodeRangeTokens.RangeSeparator).toBe(':')
    expect(UsdUtilsTimeCodeRangeTokens.StrideSeparator).toBe('x')
  })

  // testUsdUtilsTimeCodeRange.py:35-44
  it('testDefaultTimeCodeRange', () => {
    const timeCodeRange = new TimeCodeRange()
    validateFrameSpec(timeCodeRange)
    expect(timeCodeRange.isValid()).toBe(false)
    expect([...timeCodeRange]).toEqual([])
  })

  // testUsdUtilsTimeCodeRange.py:46-62
  it('testSingleTimeCodeRange', () => {
    const timeCodeRange = new TimeCodeRange(123.0)
    validateFrameSpec(timeCodeRange, '123')
    expect(timeCodeRange.getStartTimeCode().GetValue()).toBe(123.0)
    expect(timeCodeRange.getEndTimeCode().GetValue()).toBe(123.0)
    expect(timeCodeRange.getStride()).toBe(1.0)
    expect(timeCodeRange.isValid()).toBe(true)
    expect(values(timeCodeRange)).toEqual(timeCodes(123.0))
    expectRoundTrip(timeCodeRange)
  })

  // testUsdUtilsTimeCodeRange.py:64-86
  it('testAscendingTimeCodeRange', () => {
    const timeCodeRange = new TimeCodeRange(101.0, 105.0)
    validateFrameSpec(timeCodeRange, '101:105')
    expect(timeCodeRange.getStartTimeCode().GetValue()).toBe(101.0)
    expect(timeCodeRange.getEndTimeCode().GetValue()).toBe(105.0)
    expect(timeCodeRange.getStride()).toBe(1.0)
    expect(timeCodeRange.isValid()).toBe(true)
    expect(values(timeCodeRange)).toEqual(timeCodes(101.0, 102.0, 103.0, 104.0, 105.0))
    expectRoundTrip(timeCodeRange)
  })

  // testUsdUtilsTimeCodeRange.py:88-110
  it('testDescendingTimeCodeRange', () => {
    const timeCodeRange = new TimeCodeRange(105.0, 101.0)
    validateFrameSpec(timeCodeRange, '105:101')
    expect(timeCodeRange.getStartTimeCode().GetValue()).toBe(105.0)
    expect(timeCodeRange.getEndTimeCode().GetValue()).toBe(101.0)
    expect(timeCodeRange.getStride()).toBe(-1.0)
    expect(timeCodeRange.isValid()).toBe(true)
    expect(values(timeCodeRange)).toEqual(timeCodes(105.0, 104.0, 103.0, 102.0, 101.0))
    expectRoundTrip(timeCodeRange)
  })

  // testUsdUtilsTimeCodeRange.py:112-155
  it('testTwosTimeCodeRange', () => {
    let timeCodeRange = new TimeCodeRange(101.0, 109.0, 2.0)
    validateFrameSpec(timeCodeRange, '101:109x2')
    expect(timeCodeRange.getStartTimeCode().GetValue()).toBe(101.0)
    expect(timeCodeRange.getEndTimeCode().GetValue()).toBe(109.0)
    expect(timeCodeRange.getStride()).toBe(2.0)
    expect(timeCodeRange.isValid()).toBe(true)
    expect(values(timeCodeRange)).toEqual(timeCodes(101.0, 103.0, 105.0, 107.0, 109.0))
    expectRoundTrip(timeCodeRange)

    // Make sure we yield the same time codes if the endTimeCode does not
    // align with the last time code in the range based on the stride.
    timeCodeRange = new TimeCodeRange(101.0, 110.0, 2.0)
    validateFrameSpec(timeCodeRange, '101:110x2')
    expect(timeCodeRange.getStartTimeCode().GetValue()).toBe(101.0)
    expect(timeCodeRange.getEndTimeCode().GetValue()).toBe(110.0)
    expect(timeCodeRange.getStride()).toBe(2.0)
    expect(timeCodeRange.isValid()).toBe(true)
    expect(values(timeCodeRange)).toEqual(timeCodes(101.0, 103.0, 105.0, 107.0, 109.0))
    expectRoundTrip(timeCodeRange)
  })

  // testUsdUtilsTimeCodeRange.py:157-181
  it('testFractionalStrideTimeCodeRange', () => {
    const timeCodeRange = new TimeCodeRange(101.0, 104.0, 0.5)
    validateFrameSpec(timeCodeRange, '101:104x0.5')
    expect(timeCodeRange.getStartTimeCode().GetValue()).toBe(101.0)
    expect(timeCodeRange.getEndTimeCode().GetValue()).toBe(104.0)
    expect(timeCodeRange.getStride()).toBe(0.5)
    expect(timeCodeRange.isValid()).toBe(true)
    expect(values(timeCodeRange)).toEqual(timeCodes(101.0, 101.5, 102.0, 102.5, 103.0, 103.5, 104.0))
    expectRoundTrip(timeCodeRange)
  })

  // testUsdUtilsTimeCodeRange.py:183-221
  it('testFloatingPointErrorStrideRange', () => {
    const timeCodeRange = new TimeCodeRange(0.0, 7.0, 0.7)
    validateFrameSpec(timeCodeRange, '0:7x0.7')
    expect(timeCodeRange.getStartTimeCode().GetValue()).toBe(0.0)
    expect(timeCodeRange.getEndTimeCode().GetValue()).toBe(7.0)
    expect(timeCodeRange.getStride()).toBe(0.7)
    expect(timeCodeRange.isValid()).toBe(true)
    expectIsCloseValues(timeCodeRange, [0.0, 0.7, 1.4, 2.1, 2.8, 3.5, 4.2, 4.9, 5.6, 6.3, 7.0])
    expectRoundTrip(timeCodeRange)
  })

  // testUsdUtilsTimeCodeRange.py:223-256
  it('testFloatingPointErrorValuesRange', () => {
    const timeCodeRange = new TimeCodeRange(456.7, 890.1, 108.35)
    validateFrameSpec(timeCodeRange, '456.7:890.1x108.35')
    expect(timeCodeRange.getStartTimeCode().GetValue()).toBe(456.7)
    expect(timeCodeRange.getEndTimeCode().GetValue()).toBe(890.1)
    expect(timeCodeRange.getStride()).toBe(108.35)
    expect(timeCodeRange.isValid()).toBe(true)
    expectIsCloseValues(timeCodeRange, [456.7, 565.05, 673.4, 781.75, 890.1])
    expectRoundTrip(timeCodeRange)
  })

  // testUsdUtilsTimeCodeRange.py:258-282
  it('testFloatingPointErrorStrideLongRange', () => {
    const timeCodeRange = new TimeCodeRange(0.0, 9999.9, 0.1)
    validateFrameSpec(timeCodeRange, '0:9999.9x0.1')
    expect(timeCodeRange.getStartTimeCode().GetValue()).toBe(0.0)
    expect(timeCodeRange.getEndTimeCode().GetValue()).toBe(9999.9)
    expect(timeCodeRange.getStride()).toBe(0.1)
    expect(timeCodeRange.isValid()).toBe(true)

    let numTimeCodes = 0
    for (const timeCode of timeCodeRange) {
      expect(timeCode.GetValue()).toBe(numTimeCodes * 0.1)
      numTimeCodes += 1
    }
    expect(numTimeCodes).toBe(100000)
    expectRoundTrip(timeCodeRange)
  })

  // testUsdUtilsTimeCodeRange.py:284-317
  it('testBadConstructions', () => {
    // EarliestTime and Default cannot be used as the start or end.
    expectCodingError(() => new TimeCodeRange(UsdTimeCode.EarliestTime(), 104.0))
    expectCodingError(() => new TimeCodeRange(UsdTimeCode.Default(), 104.0))
    expectCodingError(() => new TimeCodeRange(101.0, UsdTimeCode.EarliestTime()))
    expectCodingError(() => new TimeCodeRange(101.0, UsdTimeCode.Default()))

    // The end must be greater than the start with a positive stride
    expectCodingError(() => new TimeCodeRange(104.0, 101.0, 1.0))

    // The end must be less than the start with a negative stride
    expectCodingError(() => new TimeCodeRange(101.0, 104.0, -1.0))

    // The stride cannot be zero.
    expectCodingError(() => new TimeCodeRange(101.0, 104.0, 0.0))
  })

  // testUsdUtilsTimeCodeRange.py:319-369
  it('testBadFrameSpecs', () => {
    for (const frameSpec of [
      'foobar', '101:102:103', '101foobar:104', 'foobar101:104', '101:104foobar', '101:foobar104',
      '101x2.0', '101:109x2.0x3.0', '101:109x2.0foobar', '101:109xfoobar2.0',
    ]) {
      expectCodingError(() => TimeCodeRange.CreateFromFrameSpec(frameSpec))
    }
  })
})

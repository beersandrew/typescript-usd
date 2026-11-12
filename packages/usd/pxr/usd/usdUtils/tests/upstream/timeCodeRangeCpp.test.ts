// Ported from OpenUSD 26.11.1: pxr/base/gf/math.h,
//  pxr/usd/usdUtils/testenv/testUsdUtilsTimeCodeRange.cpp
// Copyright 2016, 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usdUtils/testenv/testUsdUtilsTimeCodeRange.cpp
// (registered as testUsdUtilsTimeCodeRangeCpp; no testenv directory).
//
// API mapping:
//   - Range-based for over a UsdUtilsTimeCodeRange is for...of.
//   - `ostream << timeCodeRange` is UsdUtilsTimeCodeRangeToStreamString and
//     `stream >> timeCodeRange` is UsdUtilsTimeCodeRangeFromStreamString.
//   - GfIsClose(double, double, eps) is |a - b| < eps (gf/math.h:28-30).
//   - TF_AXIOM is expect(...).toBe(true). The bad constructions post coding
//     errors, which upstream's main() leaves to the diagnostic manager; here
//     they are collected by a TfErrorMark and cleared.
import { expect, it } from 'vitest'
import { Mark as TfErrorMark } from 'typescript-usd/tf'
import { TimeCode as UsdTimeCode } from 'typescript-usd/usd'
import {
  TimeCodeRange, UsdUtilsTimeCodeRangeFromStreamString, UsdUtilsTimeCodeRangeToStreamString,
} from 'typescript-usd/usdUtils'

// testUsdUtilsTimeCodeRange.cpp:22-56
function validateIteration(
  timeCodeRange: TimeCodeRange, timeCodes: UsdTimeCode[], useIsClose = false,
): boolean {
  const iterTimeCodes: UsdTimeCode[] = []
  for (const timeCode of timeCodeRange) iterTimeCodes.push(timeCode)

  if (!useIsClose) {
    return iterTimeCodes.length === timeCodes.length &&
      iterTimeCodes.every((t, i) => t.GetValue() === timeCodes[i]!.GetValue() &&
        t.isPreTime() === timeCodes[i]!.isPreTime())
  }
  if (iterTimeCodes.length !== timeCodes.length) return false
  const epsilon = 1e-9
  for (let i = 0; i < iterTimeCodes.length; ++i) {
    if (!(Math.abs(iterTimeCodes[i]!.GetValue() - timeCodes[i]!.GetValue()) < epsilon)) return false
  }
  return true
}

const tc = (...values: number[]): UsdTimeCode[] => values.map(v => new UsdTimeCode(v))

// testUsdUtilsTimeCodeRange.cpp:58-65
const getStringByStreamInsertion = (timeCodeRange: TimeCodeRange): string =>
  UsdUtilsTimeCodeRangeToStreamString(timeCodeRange)

// testUsdUtilsTimeCodeRange.cpp:67-78
const getTimeCodeRangeByStreamExtraction = (rangeString: string): TimeCodeRange =>
  UsdUtilsTimeCodeRangeFromStreamString(rangeString)

// testUsdUtilsTimeCodeRange.cpp:81-303
it('testUsdUtilsTimeCodeRangeCpp', () => {
  const defaultRange = new TimeCodeRange()
  expect(validateIteration(defaultRange, [])).toBe(true)
  const emptyRangeString = getStringByStreamInsertion(defaultRange)
  expect(emptyRangeString).toBe('NONE')

  const singleRange = new TimeCodeRange(new UsdTimeCode(123.0))
  expect(validateIteration(singleRange, tc(123.0))).toBe(true)
  let frameSpec = getStringByStreamInsertion(singleRange)
  expect(frameSpec).toBe('123')
  let frameSpecRange = getTimeCodeRangeByStreamExtraction(frameSpec)
  expect(frameSpecRange.equals(singleRange)).toBe(true)

  const ascendingRange = new TimeCodeRange(new UsdTimeCode(101.0), new UsdTimeCode(105.0))
  expect(validateIteration(ascendingRange, tc(101.0, 102.0, 103.0, 104.0, 105.0))).toBe(true)
  frameSpec = getStringByStreamInsertion(ascendingRange)
  expect(frameSpec).toBe('101:105')
  frameSpecRange = getTimeCodeRangeByStreamExtraction(frameSpec)
  expect(frameSpecRange.equals(ascendingRange)).toBe(true)

  const descendingRange = new TimeCodeRange(new UsdTimeCode(105.0), new UsdTimeCode(101.0))
  expect(validateIteration(descendingRange, tc(105.0, 104.0, 103.0, 102.0, 101.0))).toBe(true)
  frameSpec = getStringByStreamInsertion(descendingRange)
  expect(frameSpec).toBe('105:101')
  frameSpecRange = getTimeCodeRangeByStreamExtraction(frameSpec)
  expect(frameSpecRange.equals(descendingRange)).toBe(true)

  const twosRange = new TimeCodeRange(new UsdTimeCode(101.0), new UsdTimeCode(109.0), 2.0)
  expect(validateIteration(twosRange, tc(101.0, 103.0, 105.0, 107.0, 109.0))).toBe(true)
  frameSpec = getStringByStreamInsertion(twosRange)
  expect(frameSpec).toBe('101:109x2')
  frameSpecRange = getTimeCodeRangeByStreamExtraction(frameSpec)
  expect(frameSpecRange.equals(twosRange)).toBe(true)

  // Make sure we yield the same time codes if the endTimeCode does not align
  // with the last time code in the range based on the stride.
  const twosPlusRange = new TimeCodeRange(new UsdTimeCode(101.0), new UsdTimeCode(110.0), 2.0)
  expect(validateIteration(twosPlusRange, tc(101.0, 103.0, 105.0, 107.0, 109.0))).toBe(true)
  frameSpec = getStringByStreamInsertion(twosPlusRange)
  expect(frameSpec).toBe('101:110x2')
  frameSpecRange = getTimeCodeRangeByStreamExtraction(frameSpec)
  expect(frameSpecRange.equals(twosPlusRange)).toBe(true)

  const fractionalStrideRange = new TimeCodeRange(new UsdTimeCode(101.0), new UsdTimeCode(104.0), 0.5)
  expect(validateIteration(fractionalStrideRange,
    tc(101.0, 101.5, 102.0, 102.5, 103.0, 103.5, 104.0))).toBe(true)
  frameSpec = getStringByStreamInsertion(fractionalStrideRange)
  expect(frameSpec).toBe('101:104x0.5')
  frameSpecRange = getTimeCodeRangeByStreamExtraction(frameSpec)
  expect(frameSpecRange.equals(fractionalStrideRange)).toBe(true)

  const floatErrorStrideRange = new TimeCodeRange(new UsdTimeCode(0.0), new UsdTimeCode(7.0), 0.7)
  expect(validateIteration(floatErrorStrideRange,
    tc(0.0, 0.7, 1.4, 2.1, 2.8, 3.5, 4.2, 4.9, 5.6, 6.3, 7.0),
    /* useIsClose = */ true)).toBe(true)
  frameSpec = getStringByStreamInsertion(floatErrorStrideRange)
  expect(frameSpec).toBe('0:7x0.7')
  frameSpecRange = getTimeCodeRangeByStreamExtraction(frameSpec)
  expect(frameSpecRange.equals(floatErrorStrideRange)).toBe(true)

  const floatErrorValuesRange = new TimeCodeRange(new UsdTimeCode(456.7), new UsdTimeCode(890.1), 108.35)
  expect(validateIteration(floatErrorValuesRange,
    tc(456.7, 565.05, 673.4, 781.75, 890.1),
    /* useIsClose = */ true)).toBe(true)
  frameSpec = getStringByStreamInsertion(floatErrorValuesRange)
  expect(frameSpec).toBe('456.7:890.1x108.35')
  frameSpecRange = getTimeCodeRangeByStreamExtraction(frameSpec)
  expect(frameSpecRange.equals(floatErrorValuesRange)).toBe(true)

  const floatErrorStrideLongRange = new TimeCodeRange(new UsdTimeCode(0.0), new UsdTimeCode(9999.9), 0.1)
  let numTimeCodes = 0
  for (const timeCode of floatErrorStrideLongRange) {
    expect(timeCode.GetValue() === numTimeCodes * 0.1).toBe(true)
    ++numTimeCodes
  }
  expect(numTimeCodes).toBe(100000)
  frameSpec = getStringByStreamInsertion(floatErrorStrideLongRange)
  expect(frameSpec).toBe('0:9999.9x0.1')
  frameSpecRange = getTimeCodeRangeByStreamExtraction(frameSpec)
  expect(frameSpecRange.equals(floatErrorStrideLongRange)).toBe(true)

  const mark = new TfErrorMark()
  try {
    // Now test bad constructions and make sure we get an empty invalid range.
    let badRange: TimeCodeRange

    // EarliestTime and Default cannot be used as the start or end.
    badRange = new TimeCodeRange(UsdTimeCode.EarliestTime(), 104.0)
    expect(!badRange.isValid()).toBe(true)

    badRange = new TimeCodeRange(UsdTimeCode.Default(), 104.0)
    expect(!badRange.isValid()).toBe(true)

    badRange = new TimeCodeRange(101.0, UsdTimeCode.EarliestTime())
    expect(!badRange.isValid()).toBe(true)

    badRange = new TimeCodeRange(101.0, UsdTimeCode.Default())
    expect(!badRange.isValid()).toBe(true)

    // The end must be greater than the start with a positive stride
    badRange = new TimeCodeRange(104.0, 101.0, 1.0)
    expect(!badRange.isValid()).toBe(true)

    // The end must be less than the start with a negative stride
    badRange = new TimeCodeRange(101.0, 104.0, -1.0)
    expect(!badRange.isValid()).toBe(true)

    // The stride cannot be zero.
    badRange = new TimeCodeRange(101.0, 104.0, 0.0)
    expect(!badRange.isValid()).toBe(true)

    // Finally, test some bad FrameSpecs and make sure we get an invalid empty
    // range (equivalent to defaultRange from above).
    for (const spec of [
      'foobar', '101:102:103', '101foobar:104', 'foobar101:104', '101:104foobar', '101:foobar104',
      '101x2.0', '101:109x2.0x3.0', '101:109x2.0foobar', '101:109xfoobar2.0',
    ]) {
      badRange = TimeCodeRange.CreateFromFrameSpec(spec)
      expect(!badRange.isValid()).toBe(true)
    }
  } finally {
    mark.clear()
    mark.dispose()
  }
})

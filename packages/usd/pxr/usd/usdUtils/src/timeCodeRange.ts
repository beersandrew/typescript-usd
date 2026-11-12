// Ported from OpenUSD 26.11.1: pxr/usd/usdUtils/timeCodeRange.cpp,
//  pxr/usd/usdUtils/timeCodeRange.h
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usd/usdUtils/timeCodeRange.{h,cpp} (OpenUSD 26.11.1).
//
// UsdUtilsTimeCodeRange: a range of UsdTimeCodes from a start to an end with
// a stride, iterable in either direction, with the FrameSpec string syntax
// "start[:end[xstride]]" used by stream insertion and extraction.

import { stringSplit as TfStringSplit, TF_CODING_ERROR } from 'typescript-usd/tf'
import { TimeCode as UsdTimeCode, usdTimeCodeToStreamString } from 'typescript-usd/usd'

/** UsdUtilsTimeCodeRangeTokens (timeCodeRange.h:26-36). */
export const UsdUtilsTimeCodeRangeTokens = {
  EmptyTimeCodeRange: 'NONE',
  RangeSeparator: ':',
  StrideSeparator: 'x',
} as const

type TimeCodeLike = UsdTimeCode | number

const toTimeCode = (t: TimeCodeLike): UsdTimeCode => typeof t === 'number' ? new UsdTimeCode(t) : t

// UsdTimeCode::operator== (timeCode.h:165-171).
const timeCodesEqual = (a: UsdTimeCode, b: UsdTimeCode): boolean =>
  (a.isDefault() && b.isDefault()) || (a.GetValue() === b.GetValue() && a.isPreTime() === b.isPreTime())

// static_cast<size_t>(GfFloor(...)) (timeCodeRange.h:154-155). A NaN or
// negative double converts to 0 and +inf saturates, as the native arm64
// conversion (fcvtzu) does; the C++ conversion is undefined for those.
const toSizeT = (value: number): number =>
  Number.isNaN(value) || value <= 0 ? 0 : Math.floor(value)

/**
 * UsdUtilsTimeCodeRange::const_iterator (timeCodeRange.h:86-188): a forward
 * iterator over the time codes of a range. A default (end) iterator has no
 * range; an exhausted iterator becomes equal to it.
 */
export class UsdUtilsTimeCodeRangeIterator {
  #timeCodeRange: UsdUtilsTimeCodeRange | undefined
  #currStep = 0
  #maxSteps = 0
  #currTimeCode = new UsdTimeCode()

  // timeCodeRange.h:142-160
  constructor(timeCodeRange?: UsdUtilsTimeCodeRange) {
    this.#timeCodeRange = timeCodeRange
    if (timeCodeRange) {
      const startVal = timeCodeRange.getStartTimeCode().GetValue()
      const endVal = timeCodeRange.getEndTimeCode().GetValue()
      const stride = timeCodeRange.getStride()
      this.#maxSteps = toSizeT(Math.floor((endVal - startVal + stride) / stride))
      this.#currTimeCode = timeCodeRange.getStartTimeCode()
    }
    this.#invalidateIfExhausted()
  }

  /** operator* (timeCodeRange.h:96-98). */
  deref(): UsdTimeCode { return this.#currTimeCode }

  /** operator++ (timeCodeRange.h:106-117). */
  increment(): this {
    if (this.#timeCodeRange) {
      ++this.#currStep
      this.#currTimeCode = new UsdTimeCode(
        this.#timeCodeRange.getStartTimeCode().GetValue() +
        this.#timeCodeRange.getStride() * this.#currStep)
    }
    this.#invalidateIfExhausted()
    return this
  }

  /** operator== (timeCodeRange.h:128-131): same range object and step. */
  equals(other: UsdUtilsTimeCodeRangeIterator): boolean {
    return this.#timeCodeRange === other.#timeCodeRange && this.#currStep === other.#currStep
  }

  // timeCodeRange.h:162-180
  #invalidateIfExhausted(): void {
    let finished = false
    if (!this.#timeCodeRange) {
      finished = true
    } else if (this.#currStep >= this.#maxSteps) {
      finished = true
    }
    if (finished) {
      this.#timeCodeRange = undefined
      this.#currStep = 0
      this.#maxSteps = 0
      this.#currTimeCode = new UsdTimeCode()
    }
  }
}

/**
 * UsdUtilsTimeCodeRange (timeCodeRange.h:69-377).
 *
 * Constructed as upstream's four constructors: no arguments (an empty,
 * invalid range), one time code, a start and end (stride +1 or -1 by
 * direction), or a start, end and stride. Iterate it with `for...of` (the
 * C++ range-based for over begin()/end()).
 */
export class UsdUtilsTimeCodeRange implements Iterable<UsdTimeCode> {
  #startTimeCode: UsdTimeCode = new UsdTimeCode(0)
  #endTimeCode: UsdTimeCode = new UsdTimeCode(-1)
  #stride = 1

  constructor()
  constructor(timeCode: TimeCodeLike)
  constructor(startTimeCode: TimeCodeLike, endTimeCode: TimeCodeLike, stride?: number)
  constructor(startTimeCode?: TimeCodeLike, endTimeCode?: TimeCodeLike, stride?: number) {
    // timeCodeRange.h:213-216
    if (startTimeCode === undefined) {
      this.#invalidate()
      return
    }
    const start = toTimeCode(startTimeCode)
    // timeCodeRange.h:222-226: a single time code is the range [t, t].
    const end = endTimeCode === undefined ? start : toTimeCode(endTimeCode)
    // timeCodeRange.h:235-243: the default stride follows the direction.
    const s = stride ?? (end.valueOf() >= start.valueOf() ? 1.0 : -1.0)

    // timeCodeRange.h:257-308
    this.#startTimeCode = start
    this.#endTimeCode = end
    this.#stride = s

    if (this.#startTimeCode.isEarliestTime()) {
      TF_CODING_ERROR('startTimeCode cannot be UsdTimeCode::EarliestTime()')
      this.#invalidate()
      return
    }
    if (this.#startTimeCode.isDefault()) {
      TF_CODING_ERROR('startTimeCode cannot be UsdTimeCode::Default()')
      this.#invalidate()
      return
    }
    if (this.#endTimeCode.isEarliestTime()) {
      TF_CODING_ERROR('endTimeCode cannot be UsdTimeCode::EarliestTime()')
      this.#invalidate()
      return
    }
    if (this.#endTimeCode.isDefault()) {
      TF_CODING_ERROR('endTimeCode cannot be UsdTimeCode::Default()')
      this.#invalidate()
      return
    }

    if (this.#stride > 0.0) {
      if (this.#endTimeCode.valueOf() < this.#startTimeCode.valueOf()) {
        TF_CODING_ERROR('endTimeCode cannot be less than startTimeCode with positive stride')
        this.#invalidate()
        return
      }
    } else if (this.#stride < 0.0) {
      if (this.#endTimeCode.valueOf() > this.#startTimeCode.valueOf()) {
        TF_CODING_ERROR('endTimeCode cannot be greater than startTimeCode with negative stride')
        this.#invalidate()
        return
      }
    } else {
      TF_CODING_ERROR('stride cannot be zero')
      this.#invalidate()
      return
    }
  }

  /**
   * UsdUtilsTimeCodeRange::CreateFromFrameSpec (timeCodeRange.cpp:55-120):
   * parses "start[:end[xstride]]". An invalid FrameSpec posts a coding error
   * and returns an empty, invalid range.
   */
  static CreateFromFrameSpec(frameSpec: string): UsdUtilsTimeCodeRange {
    if (frameSpec.length === 0) return new UsdUtilsTimeCodeRange()

    // FrameSpecs must contain at least one time code value, but check whether
    // it also contains the range separator. Issue an error and return an
    // invalid empty range if there is more than one separator.
    let frameSpecParts = TfStringSplit(frameSpec, UsdUtilsTimeCodeRangeTokens.RangeSeparator)
    if (frameSpecParts.length > 2) {
      TF_CODING_ERROR(`Invalid FrameSpec: "${frameSpec}"`)
      return new UsdUtilsTimeCodeRange()
    }

    const startTimeCode = stringToDouble(frameSpecParts[0] ?? '')
    if (startTimeCode === undefined) {
      TF_CODING_ERROR(`Invalid FrameSpec: "${frameSpec}"`)
      return new UsdUtilsTimeCodeRange()
    }

    // If the FrameSpec did not contain the range separator, we're done.
    if (frameSpecParts.length === 1) return new UsdUtilsTimeCodeRange(startTimeCode)

    // Check whether the FrameSpec contains the stride separator. Issue an
    // error and return an invalid empty range if there is more than one
    // separator.
    frameSpecParts = TfStringSplit(frameSpecParts[1]!, UsdUtilsTimeCodeRangeTokens.StrideSeparator)
    if (frameSpecParts.length > 2) {
      TF_CODING_ERROR(`Invalid FrameSpec: "${frameSpec}"`)
      return new UsdUtilsTimeCodeRange()
    }

    // OpenUSD bug (timeCodeRange.cpp:97): for a FrameSpec ending in the range
    // separator ("101:"), TfStringSplit of the empty end part returns no
    // parts and frameSpecParts[0] reads past the end of the vector (the
    // native build crashes). Here the missing part is the empty string,
    // which does not convert, so the FrameSpec is reported invalid.
    const endTimeCode = stringToDouble(frameSpecParts[0] ?? '')
    if (endTimeCode === undefined) {
      TF_CODING_ERROR(`Invalid FrameSpec: "${frameSpec}"`)
      return new UsdUtilsTimeCodeRange()
    }

    let stride = 1.0
    if (frameSpecParts.length > 1) {
      const parsed = stringToDouble(frameSpecParts[1]!)
      if (parsed === undefined) {
        TF_CODING_ERROR(`Invalid FrameSpec: "${frameSpec}"`)
        return new UsdUtilsTimeCodeRange()
      }
      stride = parsed
    } else if (endTimeCode < startTimeCode) {
      stride = -1.0
    }

    return new UsdUtilsTimeCodeRange(startTimeCode, endTimeCode, stride)
  }

  /** timeCodeRange.h:312-314 */
  getStartTimeCode(): UsdTimeCode { return this.#startTimeCode }
  /** timeCodeRange.h:318-320 */
  getEndTimeCode(): UsdTimeCode { return this.#endTimeCode }
  /** timeCodeRange.h:324-326 */
  getStride(): number { return this.#stride }

  /** timeCodeRange.h:329-331 */
  begin(): UsdUtilsTimeCodeRangeIterator { return new UsdUtilsTimeCodeRangeIterator(this) }
  /** timeCodeRange.h:334-336 */
  cbegin(): UsdUtilsTimeCodeRangeIterator { return new UsdUtilsTimeCodeRangeIterator(this) }
  /** timeCodeRange.h:339-341 */
  end(): UsdUtilsTimeCodeRangeIterator { return new UsdUtilsTimeCodeRangeIterator() }
  /** timeCodeRange.h:344-346 */
  cend(): UsdUtilsTimeCodeRangeIterator { return new UsdUtilsTimeCodeRangeIterator() }

  /** The range-based for over begin()/end(). */
  *[Symbol.iterator](): Iterator<UsdTimeCode> {
    const end = this.end()
    for (const it = this.begin(); !it.equals(end); it.increment()) yield it.deref()
  }

  /** timeCodeRange.h:349-351 */
  empty(): boolean { return this.begin().equals(this.end()) }

  /** timeCodeRange.h:355-357 (also explicit operator bool, :361-363). */
  isValid(): boolean { return !this.empty() }

  /** operator== (timeCodeRange.h:366-370). */
  equals(other: UsdUtilsTimeCodeRange): boolean {
    return timeCodesEqual(this.#startTimeCode, other.#startTimeCode) &&
      timeCodesEqual(this.#endTimeCode, other.#endTimeCode) &&
      this.#stride === other.#stride
  }

  /** The FrameSpec of the range: stream insertion (operator<<). */
  toString(): string { return UsdUtilsTimeCodeRangeToStreamString(this) }

  // timeCodeRange.h:379-384
  #invalidate(): void {
    this.#startTimeCode = new UsdTimeCode(0.0)
    this.#endTimeCode = new UsdTimeCode(-1.0)
    this.#stride = 1.0
  }
}

/**
 * operator<<(std::ostream&, const UsdUtilsTimeCodeRange&)
 * (timeCodeRange.cpp:122-143): the range's FrameSpec, or "NONE" for an empty
 * range. Doubles are written as std::ostream writes them (precision 6).
 */
export function UsdUtilsTimeCodeRangeToStreamString(timeCodeRange: UsdUtilsTimeCodeRange): string {
  if (timeCodeRange.empty()) return UsdUtilsTimeCodeRangeTokens.EmptyTimeCodeRange

  const startTimeCode = timeCodeRange.getStartTimeCode()
  const endTimeCode = timeCodeRange.getEndTimeCode()
  const stride = timeCodeRange.getStride()

  let os = usdTimeCodeToStreamString(startTimeCode)
  if (!timeCodesEqual(endTimeCode, startTimeCode)) {
    os += UsdUtilsTimeCodeRangeTokens.RangeSeparator + usdTimeCodeToStreamString(endTimeCode)
  }
  if (stride !== 1.0 && stride !== -1.0) {
    // `os << stride` formats a double exactly as `os << UsdTimeCode(stride)`
    // formats its value (timeCode.cpp:33-49) for a finite, numeric stride.
    os += UsdUtilsTimeCodeRangeTokens.StrideSeparator + usdTimeCodeToStreamString(new UsdTimeCode(stride))
  }
  return os
}

/**
 * operator>>(std::istream&, UsdUtilsTimeCodeRange&) (timeCodeRange.cpp:145-152):
 * reads one whitespace-delimited token and parses it as a FrameSpec.
 */
export function UsdUtilsTimeCodeRangeFromStreamString(text: string): UsdUtilsTimeCodeRange {
  // `is >> rangeString` skips leading whitespace and stops at the next.
  const rangeString = /^\s*(\S*)/.exec(text)![1]!
  return UsdUtilsTimeCodeRange.CreateFromFrameSpec(rangeString)
}

// _StringToDouble (timeCodeRange.cpp:25-52): std::stod, which must consume
// the whole string. std::stod skips leading whitespace and accepts strtod's
// syntax (decimal and hexadecimal floating literals, inf/infinity, nan and
// nan(chars)); it throws when nothing converts or the result is out of range
// (ERANGE: overflow, or underflow to zero or a subnormal). Returns undefined
// where upstream returns false.
const STOD_SYNTAX = new RegExp(
  '^[ \\t\\n\\v\\f\\r]*([+-]?)(?:' +
  '(0[xX](?:[0-9a-fA-F]+\\.?[0-9a-fA-F]*|\\.[0-9a-fA-F]+)(?:[pP][+-]?[0-9]+)?)' +
  '|((?:[0-9]+\\.?[0-9]*|\\.[0-9]+)(?:[eE][+-]?[0-9]+)?)' +
  '|(inf(?:inity)?)' +
  '|(nan(?:\\([0-9A-Za-z_]*\\))?)' +
  ')$', 'i')

function parseHexFloat(text: string): number {
  const m = /^0x([0-9a-f]*)\.?([0-9a-f]*)(?:p([+-]?[0-9]+))?$/i.exec(text)!
  const intDigits = m[1]!, fracDigits = m[2]!
  let mantissa = 0
  for (const d of intDigits + fracDigits) mantissa = mantissa * 16 + parseInt(d, 16)
  const exponent = Number(m[3] ?? '0') - 4 * fracDigits.length
  // Scale in two steps so an exponent past the double range does not
  // overflow or underflow an intermediate power of two.
  const half = Math.trunc(exponent / 2)
  return mantissa * 2 ** half * 2 ** (exponent - half)
}

function stringToDouble(valueString: string): number | undefined {
  const m = STOD_SYNTAX.exec(valueString)
  if (!m) return undefined
  const sign = m[1] === '-' ? -1 : 1
  if (m[4] !== undefined) return sign * Infinity
  if (m[5] !== undefined) return Number.NaN
  const literal = m[2] ?? m[3]!
  const magnitude = m[2] !== undefined ? parseHexFloat(literal) : Number(literal)
  // The significand digits (hex prefix and exponent removed): a literal of
  // zero digits converts to zero without error.
  const digits = m[2] !== undefined ? literal.slice(2).replace(/p.*$/i, '') : literal.replace(/e.*$/i, '')
  if (!/[1-9a-f]/i.test(digits)) return sign * 0
  // ERANGE: overflow to infinity, or underflow to zero or a subnormal.
  if (!Number.isFinite(magnitude) || magnitude < 2.2250738585072014e-308) return undefined
  return sign * magnitude
}

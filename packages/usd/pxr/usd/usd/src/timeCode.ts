// Ported from OpenUSD 26.11.1: pxr/usd/usd/timeCode.cpp,
//  pxr/usd/usd/timeCode.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Public counterpart of pxr/usd/usd/timeCode.{h,cpp}.

type NumericTimeLike = number | { GetValue(): number }

function numericValue(value: NumericTimeLike): number {
  return typeof value === 'number' ? value : value.GetValue()
}

// JavaScript relational operators use valueOf(). Give a pre-time the
// immediately preceding representable value for ordering only; GetValue()
// retains the exact ordinate used by value resolution.
function previousRepresentable(value: number): number {
  if (Number.isNaN(value) || value === -Infinity) return value
  if (value === Infinity) return Number.MAX_VALUE
  if (value === 0) return -Number.MIN_VALUE
  const view = new DataView(new ArrayBuffer(8))
  view.setFloat64(0, value)
  let bits = view.getBigUint64(0)
  bits += value > 0 ? -1n : 1n
  view.setBigUint64(0, bits)
  return view.getFloat64(0)
}

export class UsdTimeCode {
  readonly #value: number
  readonly #isPreTime: boolean

  constructor(value: NumericTimeLike = 0, isPreTime = false) {
    this.#value = numericValue(value)
    this.#isPreTime = isPreTime
  }

  static PreTime(value: NumericTimeLike): UsdTimeCode {
    return new UsdTimeCode(value, true)
  }

  static EarliestTime(): UsdTimeCode { return new UsdTimeCode(-Number.MAX_VALUE) }
  static Default(): UsdTimeCode { return new UsdTimeCode(Number.NaN) }

  static safeStep(maxValue = 1e6, maxCompression = 10): number {
    return Number.EPSILON * maxValue * maxCompression * 2
  }

  // Upstream exposes this only to exercise Python sequence conversion.
  static test_TimeCodeSequenceRoundTrip(times: readonly UsdTimeCode[]): UsdTimeCode[] {
    return [...times]
  }

  isPreTime(): boolean { return this.#isPreTime }
  isEarliestTime(): boolean { return this.isNumeric() && this.#value === -Number.MAX_VALUE }
  isDefault(): boolean { return Number.isNaN(this.#value) }
  isNumeric(): boolean { return !this.isDefault() }
  GetValue(): number { return this.#value }

  valueOf(): number {
    if (this.isDefault()) return -Infinity
    return this.#isPreTime ? previousRepresentable(this.#value) : this.#value
  }

  toString(): string {
    if (this.isDefault()) return 'Usd.TimeCode.Default()'
    if (this.#isPreTime) {
      return this.isEarliestTime()
        ? 'Usd.TimeCode.PreTime(Usd.TimeCode.EarliestTime().GetValue())'
        : `Usd.TimeCode.PreTime(${this.#value.toFixed(1)})`
    }
    if (this.isEarliestTime()) return 'Usd.TimeCode.EarliestTime()'
    return this.#value === 0 ? 'Usd.TimeCode()' : `Usd.TimeCode(${this.#value.toFixed(1)})`
  }
}

// UsdTimeCodeTokens (timeCode.h:26-31).
export const UsdTimeCodeTokens = {
  DEFAULT: 'DEFAULT',
  EARLIEST: 'EARLIEST',
  PRE_TIME: 'PRE_TIME',
} as const

// std::ostream's default double insertion: printf %g at precision 6.
function ostreamDouble(value: number): string {
  if (!Number.isFinite(value)) return Number.isNaN(value) ? 'nan' : value > 0 ? 'inf' : '-inf'
  if (value === 0) return Object.is(value, -0) ? '-0' : '0'
  const [mantissa, exponentText] = value.toExponential(5).split('e')
  const exponent = Number(exponentText)
  if (exponent < -4 || exponent >= 6) {
    const m = mantissa!.includes('.') ? mantissa!.replace(/\.?0+$/, '') : mantissa!
    const sign = exponent < 0 ? '-' : '+'
    return `${m}e${sign}${String(Math.abs(exponent)).padStart(2, '0')}`
  }
  const fixed = value.toFixed(Math.max(0, 5 - exponent))
  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed
}

// operator<<(std::ostream&, const UsdTimeCode&) (timeCode.cpp:33-49).
export function usdTimeCodeToStreamString(time: UsdTimeCode): string {
  if (time.isDefault()) return UsdTimeCodeTokens.DEFAULT
  let out = time.isPreTime() ? `${UsdTimeCodeTokens.PRE_TIME} ` : ''
  out += time.isEarliestTime() ? UsdTimeCodeTokens.EARLIEST : ostreamDouble(time.GetValue())
  return out
}

// operator>>(std::istream&, UsdTimeCode&) (timeCode.cpp:51-94): reads one
// whitespace-delimited token (two after PRE_TIME). Returns the extracted time
// code, or undefined where the stream's failbit is set and the input time
// code is left unchanged.
export function usdTimeCodeFromStreamString(text: string): UsdTimeCode | undefined {
  const tokens = text.trim().split(/\s+/)
  let next = 0
  let valueString = tokens[next++] ?? ''
  let isPreTime = false
  if (valueString === UsdTimeCodeTokens.PRE_TIME) {
    isPreTime = true
    valueString = tokens[next++] ?? ''
  }
  if (valueString === UsdTimeCodeTokens.DEFAULT) {
    return isPreTime ? undefined : UsdTimeCode.Default()
  }
  if (valueString === UsdTimeCodeTokens.EARLIEST) {
    return isPreTime
      ? UsdTimeCode.PreTime(UsdTimeCode.EarliestTime().GetValue())
      : UsdTimeCode.EarliestTime()
  }
  // std::stod must consume the whole token. Divergence: hexadecimal
  // floating literals, which std::stod also accepts, are rejected here.
  let value = 0
  if (valueString !== '') {
    const m = /^[+-]?(?:inf(?:inity)?|nan|(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)$/i.exec(valueString)
    if (!m) return undefined
    const t = valueString.toLowerCase()
    value = t.includes('inf') ? (t.startsWith('-') ? -Infinity : Infinity)
      : t.includes('nan') ? Number.NaN : Number(t)
  }
  return isPreTime ? UsdTimeCode.PreTime(value) : new UsdTimeCode(value)
}

/** @internal Converts the public value type to the stage's query ordinate. */
export function _usdTimeCodeQuery(time: number | UsdTimeCode):
  { time: 'default' | number; isPreTime: boolean } {
  if (typeof time === 'number') return { time, isPreTime: false }
  return time.isDefault()
    ? { time: 'default', isPreTime: false }
    : { time: time.GetValue(), isPreTime: time.isPreTime() }
}

// Ported from OpenUSD 26.11.1: pxr/base/tf/unicodeUtils.cpp,
//  pxr/base/tf/unicodeUtils.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.08 pxr/base/tf/unicodeUtils.h:25-241.

export class TfUtf8CodePoint {
  static readonly ReplacementValue = 0xfffd
  static readonly MaximumValue = 0x10ffff
  static readonly SurrogateRange = [0xd800, 0xdfff] as const
  readonly #value: number

  constructor(value = TfUtf8CodePoint.ReplacementValue) {
    this.#value = Number.isInteger(value) && value >= 0 &&
      value <= TfUtf8CodePoint.MaximumValue &&
      (value < 0xd800 || value > 0xdfff)
      ? value
      : TfUtf8CodePoint.ReplacementValue
  }

  asUInt32(): number { return this.#value }
  equals(other: TfUtf8CodePoint): boolean { return this.#value === other.#value }
  toString(): string { return String.fromCodePoint(this.#value) }
}

export const TfUtf8InvalidCodePoint = new TfUtf8CodePoint()

export function TfUtf8CodePointFromAscii(value: string | number): TfUtf8CodePoint {
  const code = typeof value === 'number' ? value : value.charCodeAt(0)
  return code >= 0 && code < 128
    ? new TfUtf8CodePoint(code)
    : TfUtf8InvalidCodePoint
}

/**
 * A code-point iterable. TextDecoder's replacement behavior is the web
 * adaptation of upstream's byte iterator for malformed UTF-8.
 */
export class TfUtf8CodePointView implements Iterable<TfUtf8CodePoint> {
  readonly #text: string
  constructor(text = '') { this.#text = text }
  empty(): boolean { return this.#text.length === 0 }
  *[Symbol.iterator](): Iterator<TfUtf8CodePoint> {
    for (const char of this.#text) yield new TfUtf8CodePoint(char.codePointAt(0)!)
  }
}

export function TfIsUtf8CodePointXidStart(
  value: number | TfUtf8CodePoint,
): boolean {
  const code = typeof value === 'number' ? value : value.asUInt32()
  return code === 0x5f || /^\p{ID_Start}$/u.test(String.fromCodePoint(code))
}

export function TfIsUtf8CodePointXidContinue(
  value: number | TfUtf8CodePoint,
): boolean {
  const code = typeof value === 'number' ? value : value.asUInt32()
  return code === 0x5f || /^\p{ID_Continue}$/u.test(String.fromCodePoint(code))
}

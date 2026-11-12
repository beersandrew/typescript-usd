// Ported from OpenUSD 26.11.1: pxr/base/gf/half.cpp, pxr/base/gf/half.h,
//  pxr/base/gf/ilmbase_half.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// IlmBase half: Copyright (c) 2002, Industrial Light & Magic, a division of
//  Lucas Digital Ltd. LLC. BSD 3-Clause License.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.08 pxr/base/gf/half.h:23-37 and
// pxr/base/gf/ilmbase_half.h. JavaScript numbers carry the decoded value;
// construction rounds once to IEEE 754 binary16.

const f32 = new Float32Array(1)
const u32 = new Uint32Array(f32.buffer)

// IEEE 754 binary16 bits for a value, rounding to nearest even (the
// float-to-half conversion in ilmbase_half.h).
export function floatToHalfBits(value: number): number {
  f32[0] = value
  const bits = u32[0]!
  const sign = bits >>> 16 & 0x8000
  const exponent = bits >>> 23 & 0xff
  const mantissa = bits & 0x7fffff
  let half: number
  if (exponent === 0xff) {
    half = sign | 0x7c00 | (mantissa === 0 ? 0 : 0x200)
  } else {
    const unbiased = exponent - 127
    if (unbiased > 15) {
      half = sign | 0x7c00
    } else if (unbiased < -14) {
      if (unbiased < -25) {
        half = sign
      } else {
        const significand = mantissa | 0x800000
        const shift = -unbiased - 1
        let rounded = significand >>> shift
        const remainder = significand & ((1 << shift) - 1)
        const halfway = 1 << (shift - 1)
        if (remainder > halfway || (remainder === halfway && (rounded & 1))) rounded++
        half = sign | rounded
      }
    } else {
      let rounded = mantissa >>> 13
      const remainder = mantissa & 0x1fff
      if (remainder > 0x1000 || (remainder === 0x1000 && (rounded & 1))) rounded++
      half = sign | ((unbiased + 15) << 10) | rounded
    }
  }
  return half
}

export function roundToHalf(value: number): number {
  return halfBitsToFloat(floatToHalfBits(value))
}

// The value of IEEE 754 binary16 bits (ilmbase half's float conversion).
export function halfBitsToFloat(half: number): number {
  const sign = half & 0x8000
  const hExp = half >>> 10 & 0x1f
  const hMantissa = half & 0x3ff
  const magnitude = hExp === 0x1f
    ? (hMantissa ? NaN : Infinity)
    : hExp === 0
      ? hMantissa * 2 ** -24
      : (1 + hMantissa / 1024) * 2 ** (hExp - 15)
  return sign ? -magnitude : magnitude
}

export class GfHalf {
  readonly #value: number

  constructor(value: number | GfHalf = 0) {
    this.#value = roundToHalf(Number(value))
  }

  valueOf(): number { return this.#value }
  GetValue(): number { return this.#value }
  // The binary16 bit pattern (ilmbase half::bits()).
  bits(): number { return floatToHalfBits(this.#value) }
  toString(): string { return String(this.#value) }
  equals(other: number | GfHalf): boolean {
    return this.#value === Number(other)
  }
}

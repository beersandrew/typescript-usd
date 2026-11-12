// Ported from OpenUSD 26.11.1: pxr/base/gf/numericCast.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// GfNumericCast — port of pxr/base/gf/numericCast.h:26-156.
//
// C++ supplies the destination as a template parameter. TypeScript supplies
// the same information as a runtime descriptor; conversion and failure
// classification remain identical.

export const GfNumericCastFailure = {
  None: 'none',
  NegativeOverflow: 'negative-overflow',
  PositiveOverflow: 'positive-overflow',
  NaN: 'nan',
} as const

export const GfNumericCastNegOverflow = GfNumericCastFailure.NegativeOverflow
export const GfNumericCastPosOverflow = GfNumericCastFailure.PositiveOverflow

export function GfIntegerCompareLess(t: number, u: number): boolean {
  return t < u
}

export type GfNumericCastFailureType =
  typeof GfNumericCastFailure[keyof typeof GfNumericCastFailure]

export type GfNumericType =
  | 'bool' | 'int16' | 'uint16' | 'int32' | 'uint32' | 'float32' | 'float64'

export interface GfNumericCastResult {
  value?: number | boolean
  failure: GfNumericCastFailureType
}

const ranges: Partial<Record<GfNumericType, readonly [number, number]>> = {
  int16: [-32768, 32767],
  uint16: [0, 65535],
  int32: [-2147483648, 2147483647],
  uint32: [0, 4294967295],
}

export function GfNumericCast(
  value: number | boolean,
  target: GfNumericType,
): GfNumericCastResult {
  if (target === 'bool') {
    return { value: Boolean(value), failure: GfNumericCastFailure.None }
  }
  const numeric = typeof value === 'boolean' ? Number(value) : value
  if (target === 'float64') {
    return { value: numeric, failure: GfNumericCastFailure.None }
  }
  if (target === 'float32') {
    return { value: Math.fround(numeric), failure: GfNumericCastFailure.None }
  }
  if (Number.isNaN(numeric)) {
    return { failure: GfNumericCastFailure.NaN }
  }
  if (numeric === -Infinity) {
    return { failure: GfNumericCastFailure.NegativeOverflow }
  }
  if (numeric === Infinity) {
    return { failure: GfNumericCastFailure.PositiveOverflow }
  }
  const truncated = Math.trunc(numeric)
  const [min, max] = ranges[target]!
  if (truncated < min) {
    return { failure: GfNumericCastFailure.NegativeOverflow }
  }
  if (truncated > max) {
    return { failure: GfNumericCastFailure.PositiveOverflow }
  }
  return { value: truncated, failure: GfNumericCastFailure.None }
}

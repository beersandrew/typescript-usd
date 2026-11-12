// Ported from OpenUSD 26.11.1: pxr/base/ts/tangentConversions.cpp,
//  pxr/base/ts/tangentConversions.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.08 pxr/base/ts/tangentConversions.cpp:18-171.
export function TsConvertToStandardTangent(
  widthIn: number,
  slopeOrHeightIn: number,
  convertHeightToSlope = false,
  divideValuesByThree = false,
  negateHeight = false,
): readonly [number, number] | undefined {
  if (![widthIn, slopeOrHeightIn].every(Number.isFinite)) return undefined
  let width = widthIn
  let slope = slopeOrHeightIn
  if (convertHeightToSlope) {
    if (width === 0) return undefined
    slope /= width
    if (divideValuesByThree) width /= 3
  } else if (divideValuesByThree) {
    slope /= 3
    width /= 3
  }
  if (negateHeight) slope = -slope
  return [width, slope]
}

export function TsConvertFromStandardTangent(
  widthIn: number,
  slopeIn: number,
  convertSlopeToHeight = false,
  multiplyValuesByThree = false,
  negateHeight = false,
): readonly [number, number] | undefined {
  if (![widthIn, slopeIn].every(Number.isFinite)) return undefined
  let width = widthIn
  let value = slopeIn
  if (convertSlopeToHeight) {
    if (multiplyValuesByThree) width *= 3
    value *= width
  } else if (multiplyValuesByThree) {
    value *= 3
    width *= 3
  }
  if (negateHeight) value = -value
  return [width, value]
}

export const Ts_ConvertToStandardHelper = TsConvertToStandardTangent
export const Ts_ConvertFromStandardHelper = TsConvertFromStandardTangent

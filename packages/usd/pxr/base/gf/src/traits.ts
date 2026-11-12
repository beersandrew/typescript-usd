// Ported from OpenUSD 26.11.1: pxr/base/gf/traits.cpp, pxr/base/gf/traits.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.08 pxr/base/gf/traits.cpp:20-47.
import { Type as TfType } from 'typescript-usd/tf'

const FLOATING_POINT_TYPE_NAMES = new Set([
  'double',
  'float',
  'pxr_half::half',
  'GfHalf',
])

export function GfIsFloatingPointType(type: TfType | string): boolean {
  const name = typeof type === 'string' ? type : type.getTypeName()
  return FLOATING_POINT_TYPE_NAMES.has(name)
}

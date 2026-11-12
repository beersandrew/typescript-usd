// Ported from OpenUSD 26.11.1: pxr/base/gf/testenv/testGfIsFloatingPoint.cpp
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.08
// pxr/base/gf/testenv/testGfIsFloatingPoint.cpp.
// Registered upstream program: testGfIsFloatingPoint.
import { Type as TfType } from 'typescript-usd/tf'
import { describe, expect, it } from 'vitest'
import { GfIsFloatingPointType } from '../../src/traits.ts'

describe('testGfIsFloatingPoint', () => {
  it('matches TfType and runtime-name overload behavior', () => {
    for (const name of ['double', 'float', 'pxr_half::half']) {
      expect(GfIsFloatingPointType(TfType.declare(name))).toBe(true)
      expect(GfIsFloatingPointType(name)).toBe(true)
    }
    for (const name of ['int', 'string', 'bool']) {
      expect(GfIsFloatingPointType(TfType.declare(name))).toBe(false)
      expect(GfIsFloatingPointType(name)).toBe(false)
    }
  })
})

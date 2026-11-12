// Ported from OpenUSD 26.11.1: pxr/base/gf/testenv/testGfTraits.py
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.08 pxr/base/gf/testenv/testGfTraits.py.
// Registered upstream program: testGfTraits.
import { Type as TfType } from 'typescript-usd/tf'
import { describe, expect, it } from 'vitest'
import { GfIsFloatingPointType } from '../../src/traits.ts'

describe('testGfTraits', () => {
  it('recognizes exactly the registered floating-point TfTypes', () => {
    for (const name of ['double', 'float', 'pxr_half::half']) {
      expect(GfIsFloatingPointType(TfType.declare(name))).toBe(true)
    }
    for (const name of ['int', 'string', 'bool']) {
      expect(GfIsFloatingPointType(TfType.declare(name))).toBe(false)
    }
    expect(GfIsFloatingPointType(TfType.getUnknownType())).toBe(false)
  })
})

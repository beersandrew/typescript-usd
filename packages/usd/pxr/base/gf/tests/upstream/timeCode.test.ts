// Ported from OpenUSD 26.11.1: pxr/base/gf/testenv/testGfTimeCode.py
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD 26.11.1 pxr/base/gf/testenv/testGfTimeCode.py.
// Registered upstream program: testGfTimeCode.
import { describe, expect, it } from 'vitest'
import { GfDuration } from '../../src/duration.ts'
import { GfTimeCode } from '../../src/timeCode.ts'

describe('testGfTimeCode', () => {
  it('ports representation, conversion, comparison, and arithmetic', () => {
    const zero = new GfTimeCode()
    const three = new GfTimeCode(3)
    const negative = new GfTimeCode(-2.5)
    expect(zero.equals(new GfTimeCode(0))).toBe(true)
    expect(zero.repr()).toBe('Gf.TimeCode(0)')
    expect(three.repr()).toBe('Gf.TimeCode(3)')
    expect(negative.repr()).toBe('Gf.TimeCode(-2.5)')
    expect(String(zero)).toBe('0')
    expect(Number(three)).toBe(3)
    expect(negative.GetValue()).toBe(-2.5)

    expect(zero.compare(zero)).toBe(0)
    expect(zero.compare(three)).toBe(-1)
    expect(zero.compare(negative)).toBe(1)
  })

  // testGfTimeCode.py:113-150: the difference of two time codes is a
  // GfDuration, a duration offsets a time code, and the ratio of two time
  // codes is a double (timeCode.h:86-100).
  it('test_Arithmetic', () => {
    const three = new GfTimeCode(3)
    const negative = new GfTimeCode(-2.5)
    const duration1 = new GfDuration(1)
    expect(three.add(negative).equals(0.5)).toBe(true)
    expect(three.add(duration1).equals(4)).toBe(true)
    expect(three.add(5).equals(8)).toBe(true)

    const offset = three.subtract(negative)
    expect(offset).toBeInstanceOf(GfDuration)
    expect(offset.equals(new GfDuration(5.5))).toBe(true)
    expect(negative.subtract(three).equals(new GfDuration(-5.5))).toBe(true)
    const earlier = three.subtract(duration1)
    expect(earlier).toBeInstanceOf(GfTimeCode)
    expect(earlier.equals(2)).toBe(true)
    expect(three.subtract(5).equals(-2)).toBe(true)

    expect(three.multiply(5).equals(15)).toBe(true)
    expect(three.divide(new GfTimeCode(2))).toBe(1.5)
    const scaled = three.divide(5)
    expect(scaled).toBeInstanceOf(GfTimeCode)
    expect(scaled.equals(0.6)).toBe(true)
    expect(new GfTimeCode(new GfDuration(2)).equals(2)).toBe(true)
  })
})

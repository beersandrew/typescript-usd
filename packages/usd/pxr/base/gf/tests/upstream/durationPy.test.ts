// Ported from OpenUSD 26.11.1: pxr/base/gf/duration.h,
//  pxr/base/gf/testenv/testGfDuration.py, pxr/base/gf/wrapDuration.cpp
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD 26.11.1 pxr/base/gf/testenv/testGfDuration.py
// (registration testGfDuration, pxr/base/gf/CMakeLists.txt). Python operators
// map to GfDuration's methods (duration.h:44-85: comparison, +, -, *, /).
// Out of scope: Python-binding-only checks — eval(repr()), __bool__
// (wrapDuration.cpp:39,62) and the TypeError raised by the Python wrapper
// for duration*duration and float/duration (C++ has no such overloads, so the
// TypeScript signatures reject them at compile time instead).
import { describe, expect, it } from 'vitest'
import { GfDuration } from '../../src/duration.ts'

const D = (v?: number) => new GfDuration(v)

describe('testGfDuration', () => {
  // testGfDuration.py:12-44
  it('test_ReprAndConversion', () => {
    expect(D().equals(D(0))).toBe(true)
    const duration1 = D(0), duration2 = D(3.0), duration3 = D(-2.5)
    expect(duration1.repr()).toBe('Gf.Duration(0)')
    expect(duration2.repr()).toBe('Gf.Duration(3)')
    expect(duration3.repr()).toBe('Gf.Duration(-2.5)')
    expect(String(duration1)).toBe('0')
    expect(String(duration2)).toBe('3')
    expect(String(duration3)).toBe('-2.5')
    expect(Number(duration1)).toBe(0)
    expect(Number(duration2)).toBe(3)
    expect(Number(duration3)).toBe(-2.5)
    expect(duration1.GetValue()).toBe(0)
    expect(duration2.GetValue()).toBe(3)
    expect(duration3.GetValue()).toBe(-2.5)
  })

  // testGfDuration.py:46-113
  it('test_Comparison', () => {
    const duration1 = D(0), duration2 = D(3.0), duration3 = D(-2.5)
    const lt = (a: number | GfDuration, b: number | GfDuration) =>
      a instanceof GfDuration ? a.compare(b) < 0 : (b as GfDuration).compare(a) > 0
    const le = (a: number | GfDuration, b: number | GfDuration) => !lt(b, a)
    const gt = (a: number | GfDuration, b: number | GfDuration) => lt(b, a)
    const ge = (a: number | GfDuration, b: number | GfDuration) => !lt(a, b)
    expect(duration2.equals(D(3))).toBe(true)
    expect(duration2.equals(3)).toBe(true)
    expect(duration3.equals(D(3))).toBe(false)
    expect(duration3.equals(3)).toBe(false)

    expect(lt(duration1, duration1)).toBe(false)
    expect(lt(duration1, duration2)).toBe(true)
    expect(lt(duration1, duration3)).toBe(false)
    expect(lt(duration1, 0)).toBe(false)
    expect(lt(duration1, 3)).toBe(true)
    expect(lt(duration1, -2.5)).toBe(false)
    expect(lt(0, duration1)).toBe(false)
    expect(lt(3, duration1)).toBe(false)
    expect(lt(-2.5, duration1)).toBe(true)

    expect(le(duration1, duration1)).toBe(true)
    expect(le(duration1, duration2)).toBe(true)
    expect(le(duration1, duration3)).toBe(false)
    expect(le(duration1, 0)).toBe(true)
    expect(le(duration1, 3)).toBe(true)
    expect(le(duration1, -2.5)).toBe(false)
    expect(le(0, duration1)).toBe(true)
    expect(le(3, duration1)).toBe(false)
    expect(le(-2.5, duration1)).toBe(true)

    expect(gt(duration1, duration1)).toBe(false)
    expect(gt(duration1, duration2)).toBe(false)
    expect(gt(duration1, duration3)).toBe(true)
    expect(gt(duration1, 0)).toBe(false)
    expect(gt(duration1, 3)).toBe(false)
    expect(gt(duration1, -2.5)).toBe(true)
    expect(gt(0, duration1)).toBe(false)
    expect(gt(3, duration1)).toBe(true)
    expect(gt(-2.5, duration1)).toBe(false)

    expect(ge(duration1, duration1)).toBe(true)
    expect(ge(duration1, duration2)).toBe(false)
    expect(ge(duration1, duration3)).toBe(true)
    expect(ge(duration1, 0)).toBe(true)
    expect(ge(duration1, 3)).toBe(false)
    expect(ge(duration1, -2.5)).toBe(true)
    expect(ge(0, duration1)).toBe(true)
    expect(ge(3, duration1)).toBe(true)
    expect(ge(-2.5, duration1)).toBe(false)
  })

  // testGfDuration.py:115-145
  it('test_Arithmetic', () => {
    const duration2 = D(3.0), duration3 = D(-2.5)
    expect(duration2.add(duration3).equals(D(0.5))).toBe(true)
    expect(duration3.add(duration2).equals(D(0.5))).toBe(true)
    expect(duration2.add(5.0).equals(D(8.0))).toBe(true)
    expect(D(5.0).add(duration2).equals(D(8.0))).toBe(true)

    expect(duration2.subtract(duration3).equals(D(5.5))).toBe(true)
    expect(duration3.subtract(duration2).equals(D(-5.5))).toBe(true)
    expect(duration2.subtract(5.0).equals(D(-2.0))).toBe(true)
    expect(D(5.0).subtract(duration2).equals(D(2.0))).toBe(true)

    expect(duration2.multiply(5.0).equals(D(15.0))).toBe(true)
    expect(duration2.divide(D(2))).toBe(1.5)
    expect(D(6.0).divide(duration2)).toBe(2.0)
    expect(duration2.divide(5.0).equals(D(0.6))).toBe(true)
  })
})

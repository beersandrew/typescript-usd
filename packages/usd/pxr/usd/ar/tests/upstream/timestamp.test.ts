// Ported from OpenUSD 26.11.1: pxr/usd/ar/testenv/testArTimestamp.py,
//  pxr/usd/ar/timestamp.cpp, pxr/usd/ar/timestamp.h
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD 26.11.1 pxr/usd/ar/testenv/testArTimestamp.py
// (registration testArTimestamp). Python comparison operators map to
// ArTimestamp's operators (timestamp.h:65-100); Tf.ErrorException maps to
// the coding error GetTime posts on an invalid timestamp (timestamp.cpp:14-18).
import { describe, expect, it } from 'vitest'
import { TfErrorMark } from 'typescript-usd/tf'
import { Timestamp as ArTimestamp } from '../../src/index.ts'

describe('testArTimestamp', () => {
  // testArTimestamp.py:13-35.
  it('testBasic', () => {
    const timestamp = new ArTimestamp(94608)
    expect(timestamp.isValid()).toBe(true)
    expect(timestamp.repr()).toBe('Ar.Timestamp(94608.0)')
    expect(timestamp.getTime()).toBe(94608)

    expect(timestamp.equals(new ArTimestamp(94608))).toBe(true)
    expect(timestamp.lessThan(new ArTimestamp(94608))).toBe(false)
    expect(timestamp.lessThanOrEqual(new ArTimestamp(94608))).toBe(true)
    expect(timestamp.greaterThan(new ArTimestamp(94608))).toBe(false)
    expect(timestamp.greaterThanOrEqual(new ArTimestamp(94608))).toBe(true)

    expect(timestamp.notEquals(new ArTimestamp())).toBe(true)
    expect(timestamp.greaterThan(new ArTimestamp())).toBe(true)
    expect(timestamp.greaterThanOrEqual(new ArTimestamp())).toBe(true)
    expect(timestamp.lessThan(new ArTimestamp())).toBe(false)
    expect(timestamp.lessThanOrEqual(new ArTimestamp())).toBe(false)

    expect(timestamp.notEquals(new ArTimestamp(0.0))).toBe(true)
    expect(timestamp.greaterThan(new ArTimestamp(0.0))).toBe(true)
    expect(timestamp.greaterThanOrEqual(new ArTimestamp(0.0))).toBe(true)
    expect(timestamp.lessThan(new ArTimestamp(0.0))).toBe(false)
    expect(timestamp.lessThanOrEqual(new ArTimestamp(0.0))).toBe(false)

    expect(timestamp.hash()).not.toBeUndefined()
  })

  // testArTimestamp.py:37-55.
  it('testInvalid', () => {
    const invalidTimestamp = new ArTimestamp()
    expect(invalidTimestamp.isValid()).toBe(false)
    expect(invalidTimestamp.repr()).toBe('Ar.Timestamp()')

    const mark = new TfErrorMark()
    expect(Number.isNaN(invalidTimestamp.getTime())).toBe(true)
    expect(mark.isClean()).toBe(false)
    mark.clear()

    expect(invalidTimestamp.equals(new ArTimestamp())).toBe(true)
    expect(invalidTimestamp.greaterThanOrEqual(new ArTimestamp())).toBe(true)
    expect(invalidTimestamp.lessThanOrEqual(new ArTimestamp())).toBe(true)

    expect(invalidTimestamp.notEquals(new ArTimestamp(0.0))).toBe(true)
    expect(invalidTimestamp.lessThan(new ArTimestamp(0.0))).toBe(true)
    expect(invalidTimestamp.lessThanOrEqual(new ArTimestamp(0.0))).toBe(true)
    expect(invalidTimestamp.greaterThan(new ArTimestamp(0.0))).toBe(false)
    expect(invalidTimestamp.greaterThanOrEqual(new ArTimestamp(0.0))).toBe(false)

    expect(invalidTimestamp.hash()).not.toBeUndefined()
  })
})

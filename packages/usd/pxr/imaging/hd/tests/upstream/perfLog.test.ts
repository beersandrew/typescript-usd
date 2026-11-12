// Ported from OpenUSD 26.11.1: pxr/imaging/hd/testenv/testHdPerfLog.cpp
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// 1:1 port of pxr/imaging/hd/testenv/testHdPerfLog.cpp — CounterTest and
// CacheTest. The C++ test drives the HdPerfLog singleton; here we use
// GetInstance() and Disable()/ResetCounters() to isolate each section, matching
// the test's Disable() calls at the start of each block.

import { describe, it, expect } from 'vitest'
import { HdPerfLog } from '../../src/perfLog.ts'

describe('HdPerfLog', () => {
  it('CounterTest', () => {
    const perfLog = HdPerfLog.GetInstance()
    const foo = 'foo'
    const bar = 'bar'

    // Make sure the log is disabled (and start from a clean counter set).
    perfLog.disable()
    perfLog.resetCounters()

    // Performance logging is disabled, expect no tracking.
    perfLog.incrementCounter(foo)
    expect(perfLog.getCounter(foo)).toBe(0)
    perfLog.decrementCounter(foo)
    expect(perfLog.getCounter(foo)).toBe(0)
    perfLog.addCounter(foo, 5)
    expect(perfLog.getCounter(foo)).toBe(0)
    perfLog.subtractCounter(foo, 6)
    expect(perfLog.getCounter(foo)).toBe(0)
    // Macros (which just call the matching methods).
    perfLog.decrementCounter(foo)
    expect(perfLog.getCounter(foo)).toBe(0)
    perfLog.incrementCounter(foo)
    expect(perfLog.getCounter(foo)).toBe(0)
    perfLog.setCounter(foo, 42)
    expect(perfLog.getCounter(foo)).toBe(0)
    perfLog.addCounter(foo, 5)
    expect(perfLog.getCounter(foo)).toBe(0)
    perfLog.subtractCounter(foo, 6)
    expect(perfLog.getCounter(foo)).toBe(0)

    // Enable logging.
    perfLog.enable()
    // Still expect zero.
    expect(perfLog.getCounter(foo)).toBe(0)

    // Incr, Decr, Set.
    perfLog.incrementCounter(foo)
    expect(perfLog.getCounter(foo)).toBe(1)
    perfLog.decrementCounter(foo)
    expect(perfLog.getCounter(foo)).toBe(0)
    perfLog.setCounter(foo, 42)
    expect(perfLog.getCounter(foo)).toBe(42)
    perfLog.addCounter(foo, 5)
    expect(perfLog.getCounter(foo)).toBe(47)
    perfLog.subtractCounter(foo, 6)
    expect(perfLog.getCounter(foo)).toBe(41)

    perfLog.setCounter(bar, 0.1)
    expect(perfLog.getCounter(bar)).toBeCloseTo(0.1)
    perfLog.incrementCounter(bar)
    expect(perfLog.getCounter(bar)).toBeCloseTo(1.1)
    perfLog.decrementCounter(bar)
    expect(perfLog.getCounter(bar)).toBeCloseTo(0.1)

    perfLog.setCounter(foo, 0)
    perfLog.setCounter(bar, 0)

    // Macros.
    perfLog.decrementCounter(foo)
    expect(perfLog.getCounter(foo)).toBe(-1)
    perfLog.incrementCounter(foo)
    expect(perfLog.getCounter(foo)).toBe(0)
    perfLog.setCounter(foo, 42)
    expect(perfLog.getCounter(foo)).toBe(42)
    perfLog.decrementCounter(foo)
    expect(perfLog.getCounter(foo)).toBe(41)
    perfLog.incrementCounter(foo)
    expect(perfLog.getCounter(foo)).toBe(42)
    perfLog.addCounter(foo, 5)
    expect(perfLog.getCounter(foo)).toBe(47)
    perfLog.subtractCounter(foo, 6)
    expect(perfLog.getCounter(foo)).toBe(41)

    perfLog.setCounter(bar, 0.1)
    expect(perfLog.getCounter(bar)).toBeCloseTo(0.1)
    perfLog.decrementCounter(bar)
    expect(perfLog.getCounter(bar)).toBeCloseTo(-0.9)
    perfLog.incrementCounter(bar)
    expect(perfLog.getCounter(bar)).toBeCloseTo(0.1)

    // When the log is disabled, we expect to still be able to read the existing
    // values.
    perfLog.disable()
    expect(perfLog.getCounter(foo)).toBe(41)
    perfLog.incrementCounter(foo)
    expect(perfLog.getCounter(foo)).toBe(41)
    perfLog.decrementCounter(foo)
    expect(perfLog.getCounter(foo)).toBe(41)
    perfLog.setCounter(foo, 0)
    expect(perfLog.getCounter(foo)).toBe(41)
    perfLog.addCounter(foo, 5)
    expect(perfLog.getCounter(foo)).toBe(41)
    perfLog.subtractCounter(foo, 6)
    expect(perfLog.getCounter(foo)).toBe(41)
  })

  it('CacheTest', () => {
    const perfLog = HdPerfLog.GetInstance()
    const foo = 'foo'
    const bar = 'bar'
    const id = '/Some/Path'
    const emptyNames: string[] = []
    const populatedNames: string[] = [bar, foo]

    // Make sure the log is disabled (and start from a clean cache set).
    perfLog.disable()
    perfLog.resetCache(foo)
    perfLog.resetCache(bar)

    // Performance logging is disabled, expect no tracking.
    expect(perfLog.getCacheHits(foo)).toBe(0)
    expect(perfLog.getCacheMisses(foo)).toBe(0)
    expect(perfLog.getCacheHitRatio(foo)).toBe(0)
    expect(perfLog.getCacheHits(bar)).toBe(0)
    expect(perfLog.getCacheMisses(bar)).toBe(0)
    expect(perfLog.getCacheHitRatio(bar)).toBe(0)
    expect(perfLog.getCacheNames()).toEqual(emptyNames)

    // Enable perf logging.
    perfLog.enable()
    // Nothing should have changed yet.
    expect(perfLog.getCacheHits(foo)).toBe(0)
    expect(perfLog.getCacheMisses(foo)).toBe(0)
    expect(perfLog.getCacheHitRatio(foo)).toBe(0)
    expect(perfLog.getCacheHits(bar)).toBe(0)
    expect(perfLog.getCacheMisses(bar)).toBe(0)
    expect(perfLog.getCacheHitRatio(bar)).toBe(0)
    expect(perfLog.getCacheNames()).toEqual(emptyNames)

    perfLog.addCacheHit(foo, id)
    perfLog.addCacheHit(foo, id)
    perfLog.addCacheMiss(foo, id)
    perfLog.addCacheMiss(foo, id)
    expect(perfLog.getCacheHits(foo)).toBe(2)
    expect(perfLog.getCacheMisses(foo)).toBe(2)
    expect(perfLog.getCacheHitRatio(foo)).toBeCloseTo(0.5)

    expect(perfLog.getCacheHits(bar)).toBe(0)
    expect(perfLog.getCacheMisses(bar)).toBe(0)
    expect(perfLog.getCacheHitRatio(bar)).toBeCloseTo(0)
    perfLog.addCacheHit(bar, id)
    perfLog.addCacheHit(bar, id)
    perfLog.addCacheHit(bar, id)
    perfLog.addCacheMiss(bar, id)
    expect(perfLog.getCacheHits(bar)).toBe(3)
    expect(perfLog.getCacheMisses(bar)).toBe(1)
    expect(perfLog.getCacheHitRatio(bar)).toBeCloseTo(0.75)

    expect(perfLog.getCacheNames()).toEqual(populatedNames)

    // Make sure the log is disabled.
    perfLog.disable()

    // We still expect to read results, even when disabled.
    expect(perfLog.getCacheHits(foo)).toBe(2)
    expect(perfLog.getCacheMisses(foo)).toBe(2)
    expect(perfLog.getCacheHitRatio(foo)).toBeCloseTo(0.5)
    expect(perfLog.getCacheHits(bar)).toBe(3)
    expect(perfLog.getCacheMisses(bar)).toBe(1)
    expect(perfLog.getCacheHitRatio(bar)).toBeCloseTo(0.75)

    expect(perfLog.getCacheNames()).toEqual(populatedNames)
  })
})

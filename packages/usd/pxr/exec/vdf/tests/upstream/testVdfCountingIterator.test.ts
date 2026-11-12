// Ported from OpenUSD 26.11.1:
//  pxr/exec/vdf/testenv/testVdfCountingIterator.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/testenv/testVdfCountingIterator.cpp
//
// The TF_AXIOMs in main() are expect() calls; std::distance(a, b) is
// Vdf_CountingIteratorDistance(a, b).

import { describe, expect, it } from 'vitest'
import { Vdf_CountingIterator, Vdf_CountingIteratorDistance } from '../../src/countingIterator.ts'

describe('testVdfCountingIterator', () => {
  it('main', () => {
    // Create a counting iterator
    const it = new Vdf_CountingIterator()

    // We expect value initialization
    expect(it.deref() === 0).toBe(true)

    // Test monotonically increasing values
    for (let i = 0; i < 10; ++i, it.increment()) {
      expect(i === it.deref()).toBe(true)
    }

    // Post-increment
    expect(it.deref() === 10).toBe(true)
    expect(it.postIncrement().deref() === 10).toBe(true)
    expect(it.deref() === 11).toBe(true)

    // Post-decrement
    expect(it.postDecrement().deref() === 11).toBe(true)
    expect(it.deref() === 10).toBe(true)

    // Test monotonically decreasing values
    for (let i = 10; i >= 0; --i, it.decrement()) {
      expect(i === it.deref()).toBe(true)
    }

    // Rewind to 0
    expect(it.deref() === -1).toBe(true)
    it.increment()
    expect(it.deref() === 0).toBe(true)

    // Test random access
    it.increment()
    expect(it.Get(5) === 6).toBe(true)

    it.addAssign(4)
    expect(it.deref() === 5).toBe(true)

    it.subtractAssign(4)
    expect(it.deref() === 1).toBe(true)

    // Test distance
    const it2 = new Vdf_CountingIterator()
    expect(Vdf_CountingIteratorDistance(it2, it) === 1).toBe(true)
    it.addAssign(3)
    expect(Vdf_CountingIteratorDistance(it2, it) === 4).toBe(true)

    it2.increment()
    expect(Vdf_CountingIteratorDistance(it2, it) === 3).toBe(true)
    expect(Vdf_CountingIteratorDistance(it, it2) === -3).toBe(true)

    // Distance to default constructed iterator
    const it3 = new Vdf_CountingIterator()
    const it4 = new Vdf_CountingIterator()
    expect(Vdf_CountingIteratorDistance(it3, it4) === 0).toBe(true)

    // Equality comparison
    it3.increment()
    expect(it2.Equals(it3)).toBe(true)
    expect(it3.notEquals(it4)).toBe(true)
    expect(it4.notEquals(it)).toBe(true)

    // Ordering
    expect(it.greaterThan(it2)).toBe(true)
    expect(it2.lessThan(it)).toBe(true)
    expect(it2.greaterEqual(it3)).toBe(true)
    expect(it2.lessEqual(it3)).toBe(true)
  })
})

// Ported from OpenUSD 26.11.1: pxr/exec/vdf/testenv/testVdfMask.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/testenv/testVdfMask.cpp
//
// Each upstream test function returns false (failing the program) where it
// prints to std::cerr; those checks are expect() calls here.

import { describe, expect, it } from 'vitest'
import { VdfMask } from '../../src/mask.ts'

describe('testVdfMask', () => {
  it('TestEmptyMask', () => {
    const mask = new VdfMask()
    expect(mask.getSize()).toBe(0)
  })

  it('TestSetAllAndIsAllOnes', () => {
    const mask = new VdfMask(20)
    mask.setAll()
    expect(mask.isAllOnes()).toBe(true)
  })

  it('TestIsAllZerosAndIterator', () => {
    const mask = new VdfMask(10)

    expect(mask.isAllZeros()).toBe(true)

    mask.setIndex(4)

    expect(mask.isAllZeros()).toBe(false)

    const iter = mask.begin()
    expect(iter.deref()).toBe(4)
  })

  it('TestOverlaps', () => {
    const noneSet = new VdfMask(100)
    const allSet = VdfMask.allOnes(100)
    const someSet = new VdfMask(100)
    someSet.setIndex(10)
    someSet.setIndex(20)

    expect(noneSet.overlaps(allSet)).toBe(false)
    expect(noneSet.overlaps(someSet)).toBe(false)
    expect(someSet.overlaps(allSet)).toBe(true)

    const empty = new VdfMask()
    expect(empty.overlaps(empty)).toBe(false)

    const largeNonSet = new VdfMask(1000)
    expect(!largeNonSet.isAnySet()).toBe(true)
    expect(largeNonSet.overlaps(largeNonSet)).toBe(false)
  })

  it('TestBooleanOperations', () => {
    const mask1 = new VdfMask(5) // 01010
    const mask2 = new VdfMask(5) // 10101
    let result = new VdfMask(0)

    mask1.setIndex(1); mask1.setIndex(3)
    mask2.setIndex(0); mask2.setIndex(2); mask2.setIndex(4)

    // AND
    result = mask1.and(mask2)
    expect(result.isAllZeros()).toBe(true)

    // OR
    result = mask1.or(mask2)
    expect(result.isAllOnes()).toBe(true)

    // SET DIFFERENCE
    result = mask1.subtract(mask2)
    expect(result.notEquals(mask1)).toBe(false)
    result = mask2.subtract(mask1)
    expect(result.notEquals(mask2)).toBe(false)

    // For XOR we need to add one more bit to mask1 so that it actually
    // does something.
    mask1.setIndex(2)
    const expected = new VdfMask(5) // 11011
    expected.setIndex(0); expected.setIndex(1)
    expected.setIndex(3); expected.setIndex(4)
    result = mask1.xor(mask2)
    expect(result.notEquals(expected)).toBe(false)
  })

  it('TestEqualityComparison', () => {
    const allOnes = VdfMask.allOnes(4)

    // 1100
    const maskA = new VdfMask(4)
    maskA.setIndex(0)
    maskA.setIndex(1)

    // 0011
    const maskB = new VdfMask(4)
    maskB.setIndex(2)
    maskB.setIndex(3)

    const mask = new VdfMask(4)
    mask.orAssign(maskA)
    mask.orAssign(maskB)

    expect(allOnes.notEquals(mask)).toBe(false)
  })

  it('TestPrintRLE', () => {
    // Tests the PrintRLE() method.
    {
      const mask = new VdfMask(5)
      mask.setIndex(1)
      mask.setIndex(2)
      mask.setIndex(4)
      const expected = '0x1-1x2-0x1-1x1'
      expect(mask.getRLEString()).toBe(expected)
    }

    // Test the degenerate case of printing an empty mask.
    {
      const emptyMask = new VdfMask()
      expect(emptyMask.getRLEString()).toBe('')
    }
  })

  it('TestGetNumSet', () => {
    {
      const mask = new VdfMask(5)
      mask.setIndex(1)
      mask.setIndex(2)
      mask.setIndex(4)
      expect(mask.getNumSet()).toBe(3)
    }

    {
      const mask = new VdfMask()
      expect(mask.getNumSet()).toBe(0)
    }

    {
      const mask = VdfMask.allOnes(10)
      expect(mask.getNumSet()).toBe(10)
    }
  })

  it('TestGetMemoryUsage', () => {
    const mask = new VdfMask(5)
    const mem = mask.getMemoryUsage()
    expect(mem).toBe(48)
  })
})

// Ported from OpenUSD 26.11.1: pxr/base/tf/testenv/iterator.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Partial behavioral slices informed by OpenUSD v26.08
// pxr/base/tf/testenv/iterator.cpp; not a 1:1 program port.
import { describe, expect, it } from 'vitest'
import { TfArraySize, TfMakeIterator, TfMakeReverseIterator } from '../../src/index.ts'

describe('TfIterator', () => {
  it('iterates arrays and maps in both directions', () => {
    expect([...TfMakeIterator([0, -5, 5])]).toEqual([0, -5, 5])
    expect([...TfMakeReverseIterator([3, 2, 1])]).toEqual([1, 2, 3])
    expect([...TfMakeIterator(new Map([['a', 1], ['b', 2]]))]).toEqual([['a', 1], ['b', 2]])
    expect(TfArraySize([3, 2, 1])).toBe(3)
  })
})

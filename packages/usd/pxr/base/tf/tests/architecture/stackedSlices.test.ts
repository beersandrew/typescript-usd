// Ported from OpenUSD 26.11.1: pxr/base/tf/testenv/stacked.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Partial behavioral slices informed by OpenUSD v26.08
// pxr/base/tf/testenv/stacked.cpp; not a 1:1 program port.
import { describe, expect, it } from 'vitest'
import { TfStacked } from '../../src/index.ts'

class SliceStacked extends TfStacked {
  constructor(readonly value: number) { super() }
}

describe('TfStacked', () => {
  it('tracks top, previous and deterministic removal', () => {
    const one = new SliceStacked(1)
    const two = new SliceStacked(2)
    expect(SliceStacked.getStackTop()).toBe(two)
    expect(SliceStacked.getStackPrevious()).toBe(one)
    expect(SliceStacked.isStackTop(two)).toBe(true)
    two.dispose()
    expect(SliceStacked.getStack()).toEqual([one])
    one.dispose()
    expect(SliceStacked.getStack()).toEqual([])
  })
})

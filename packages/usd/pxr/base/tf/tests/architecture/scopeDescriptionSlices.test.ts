// Ported from OpenUSD 26.11.1: pxr/base/tf/testenv/scopeDescription.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Partial behavioral slices informed by OpenUSD v26.08
// pxr/base/tf/testenv/scopeDescription.cpp; not a 1:1 program port.
import { describe, expect, it } from 'vitest'
import { GetCurrentScopeDescriptionStack, TfScopeDescription } from '../../src/index.ts'

describe('TfScopeDescription', () => {
  it('pushes and pops nested descriptions', () => {
    const one = new TfScopeDescription('one')
    const two = new TfScopeDescription('two')
    expect(GetCurrentScopeDescriptionStack()).toEqual(['one', 'two'])
    two.setDescription('three')
    expect(GetCurrentScopeDescriptionStack()).toEqual(['one', 'three'])
    two.dispose(); one.dispose()
    expect(GetCurrentScopeDescriptionStack()).toEqual([])
  })
})

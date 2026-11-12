// Ported from OpenUSD 26.11.1: pxr/base/vt/testenv/testVtArrayEdit.cpp,
//  pxr/base/vt/testenv/testVtArrayEdit.py
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of the complete registered pxr/base/vt/testenv/testVtArrayEdit.py
// (testVtArrayEdit) and matching observable matrix in testVtArrayEdit.cpp
// (testVtArrayEditCpp). Move/rvalue and TfHash mechanics are C++-only.

import { describe, expect, it } from 'vitest'
import { ArrayEdit as VtArrayEdit, ArrayEditBuilder as VtArrayEditBuilder } from '../../src/index.ts'

describe('VtArrayEdit', () => {
  it('identity composes over edits and dense arrays', () => {
    const identity = new VtArrayEdit<number>()
    expect(identity.isIdentity()).toBe(true)
    expect(identity.composeOver([])).toEqual([])
    expect(identity.composeOver([1, 2, 3])).toEqual([1, 2, 3])
    expect(identity.composeOver(identity).isIdentity()).toBe(true)
    expect(identity.equals(new VtArrayEdit<number>())).toBe(true)
  })

  it('builds and composes the registered operation matrix', () => {
    const builder = new VtArrayEditBuilder<number>()
    const zeroNine = builder.prepend(0).append(9).finalizeAndReset()
    expect(zeroNine.composeOver([])).toEqual([0, 9])
    expect(zeroNine.composeOver([5])).toEqual([0, 5, 9])

    const zero09Nine = zeroNine.composeOver(zeroNine)
    expect(zero09Nine.composeOver([])).toEqual([0, 0, 9, 9])
    expect(zero09Nine.composeOver([3, 4, 5])).toEqual([0, 0, 3, 4, 5, 9, 9])

    const mixAndTrim = builder.writeRef(-1, 2).writeRef(0, 4)
      .eraseRef(-1).eraseRef(0).finalizeAndReset()
    expect(mixAndTrim.composeOver([0, 0, 3, 4, 5, 9, 9])).toEqual([0, 9, 4, 0, 9])
    expect(mixAndTrim.composeOver([4, 5, 6, 7])).toEqual([5, 7])

    const zeroNineMixAndTrim = mixAndTrim.composeOver(zeroNine)
    expect(zeroNineMixAndTrim.composeOver([1, 2, 3, 4, 5, 6, 7]))
      .toEqual([1, 9, 3, 0, 5, 6, 7])
    expect(zeroNineMixAndTrim.composeOver([4, 5])).toEqual([4, 9])

    const minSize10 = builder.minSize(10).finalizeAndReset()
    expect(minSize10.composeOver([])).toEqual(new Array(10).fill(0))
    expect(minSize10.composeOver(new Array(15).fill(7))).toEqual(new Array(15).fill(7))
    const minSize10Fill9 = builder.minSize(10, 9).finalizeAndReset()
    expect(minSize10Fill9.composeOver([])).toEqual(new Array(10).fill(9))

    const maxSize15 = builder.maxSize(15).finalizeAndReset()
    expect(maxSize15.composeOver([])).toEqual([])
    expect(maxSize15.composeOver(new Array(20).fill(2))).toEqual(new Array(15).fill(2))
    const size10to15 = maxSize15.composeOver(minSize10)
    expect(size10to15.composeOver(new Array(7).fill(1)))
      .toEqual([1, 1, 1, 1, 1, 1, 1, 0, 0, 0])
    expect(size10to15.composeOver(new Array(20).fill(2))).toEqual(new Array(15).fill(2))
    expect(size10to15.composeOver(new Array(13).fill(3))).toEqual(new Array(13).fill(3))

    const size7 = builder.setSize(7).finalizeAndReset()
    expect(size7.composeOver(new Array(7).fill(1))).toEqual(new Array(7).fill(1))
    expect(size7.composeOver([])).toEqual(new Array(7).fill(0))
    expect(size7.composeOver(new Array(27).fill(9))).toEqual(new Array(7).fill(9))
    const size7Fill3 = builder.setSize(7, 3).finalizeAndReset()
    expect(size7Fill3.composeOver([])).toEqual(new Array(7).fill(3))
    expect(size7Fill3.composeOver(new Array(27).fill(9))).toEqual(new Array(7).fill(9))
  })
})

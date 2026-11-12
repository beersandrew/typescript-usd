// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hd/testenv/testHdBufferSourceEmptyVal.cpp
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/testenv/testHdBufferSourceEmptyVal.cpp
// (OpenUSD 26.11.1): an HdVtBufferSource constructed from an empty VtValue
// reports IsValid() false and raises no errors.

import { describe, expect, it } from 'vitest'
import { TfErrorMark } from 'typescript-usd/tf'
import { Value as VtValue } from 'typescript-usd/vt'
import { HdVtBufferSource } from '../../src/vtBufferSource.ts'
import { HdTokens } from '../../src/tokens.ts'

describe('testHdBufferSourceEmptyVal', () => {
  it('is invalid and clean (testHdBufferSourceEmptyVal.cpp:14-37)', () => {
    const mark = new TfErrorMark()
    mark.setMark()
    const v = VtValue.getEmpty()
    const b = new HdVtBufferSource(HdTokens.points, v)
    // Above could throw errors.
    mark.clear()
    const valid = b.isValid()
    expect(mark.isClean() && !valid).toBe(true)
    // CreateEmpty is the same case.
    expect(HdVtBufferSource.createEmpty(HdTokens.points).isValid()).toBe(false)
  })
})

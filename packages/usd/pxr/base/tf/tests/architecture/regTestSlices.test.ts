// Ported from OpenUSD 26.11.1: pxr/base/tf/regTest.h,
//  pxr/base/tf/testenv/main.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Partial command-contract slices informed by OpenUSD v26.08
// pxr/base/tf/testenv/main.cpp and regTest.h; not 1:1 registered-program ports.
import { describe, expect, it } from 'vitest'
import { TfRegTest } from '../../src/index.ts'

describe('TfRegTest', () => {
  it('returns native command-line contract codes', () => {
    TfRegTest.add('TfScoped', () => true)
    expect(TfRegTest.Main([])).toBe(2)
    expect(TfRegTest.Main(['TfScoped', 'unexpected'])).toBe(2)
    expect(TfRegTest.Main(['TfUndefinedTest'])).toBe(3)
    expect(TfRegTest.Main(['TfScoped'])).toBe(0)
  })
})

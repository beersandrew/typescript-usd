// Ported from OpenUSD 26.11.1: pxr/base/tf/regTest.cpp,
//  pxr/base/tf/scoped.cpp, pxr/base/tf/testenv/scoped.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of the testTf command-line contract registered in OpenUSD v26.11.1
// pxr/base/tf/CMakeLists.txt:725-736 (TfRegTest::_Main, pxr/base/tf/regTest.cpp:101-133):
// - TfRegTest: `testTf` with no test name, EXPECTED_RETURN_CODE 2.
// - TfRegTest_TfScoped: `testTf TfScoped no args expected`, EXPECTED_RETURN_CODE 2
//   (a TF_ADD_REGTEST function takes no arguments).
// - TfRegTest_TfUndefinedTest: `testTf TfUndefinedTest`, EXPECTED_RETURN_CODE 3.
// TfRegTest.Main takes argv without the program name. TfScoped is registered
// as testenv/scoped.cpp does (TF_ADD_REGTEST(TfScoped), scoped.cpp:159).
import { describe, expect, it } from 'vitest'
import { TfRegTest } from '../../src/index.ts'

TfRegTest.add('TfScoped', () => true)

describe('TfRegTest (testTf command line)', () => {
  it('TfRegTest: no test name returns 2', () => {
    expect(TfRegTest.Main([])).toBe(2)
  })
  it('TfRegTest_TfScoped: arguments to a no-argument test return 2', () => {
    expect(TfRegTest.Main(['TfScoped', 'no', 'args', 'expected'])).toBe(2)
  })
  it('TfRegTest_TfUndefinedTest: an unknown test returns 3', () => {
    expect(TfRegTest.Main(['TfUndefinedTest'])).toBe(3)
  })
})

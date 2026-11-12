// Ported from OpenUSD 26.11.1: pxr/base/tf/__init__.py,
//  pxr/usd/usdUtils/testenv/testUsdUtilsCoalescingDiagnosticDelegate.cpp,
//  pxr/usd/usdUtils/testenv/testUsdUtilsCoalescingDiagnosticDelegate.py
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1
// pxr/usd/usdUtils/testenv/testUsdUtilsCoalescingDiagnosticDelegate.py
// (registered as testUsdUtilsCoalescingDiagnosticDelegate). The test has no
// testenv directory.
//
// API mapping: UsdUtils.CoalescingDiagnosticDelegate() is
// new UsdUtilsCoalescingDiagnosticDelegate() (dispose() is its destructor).
// Tf.Warn(msg) passes the caller's code location (tf/__init__.py:175-181,
// GetCodeLocation); TF_WARN here takes that location as its context, so
// _genWarning passes the location of the upstream call: line 13 of the
// script, in function __main__._genWarning (the values the test asserts).
// DumpCoalescedDiagnosticsToStdout() is dumpCoalescedDiagnostics(stdout);
// pprint of the results has no counterpart and is left out.

import { afterAll, expect, it } from 'vitest'
import { TF_WARN } from 'typescript-usd/tf'
import { CoalescingDiagnosticDelegate } from 'typescript-usd/usdUtils'

const SCRIPT = 'testUsdUtilsCoalescingDiagnosticDelegate.py'

// Constructing an sdf path with "" gives a tf warning
function _genWarning(): void {
  TF_WARN('.', { file: SCRIPT, function: '__main__._genWarning', line: 13 })
}

const EXPECTED_LINE_NO = 13
const EXPECTED_FUNC_NAME = '__main__._genWarning'

const delegate = new CoalescingDiagnosticDelegate()
afterAll(() => { delegate.dispose() })

it('testUsdUtilsCoalescingDiagnosticDelegate', () => {
  // Test dumping of diagnostics (this will be compared in baseline/output.txt)
  for (let i = 0; i < 10; i++) _genWarning()

  delegate.dumpCoalescedDiagnostics(process.stdout)

  // Test collection of unfiltered diagnostics
  for (let i = 0; i < 3; i++) _genWarning()

  const unfiltered = delegate.takeUncoalescedDiagnostics()
  expect(unfiltered.length).toBe(3)
  for (let i = 0; i < 3; i++) {
    expect(unfiltered[i]!.getSourceLineNumber()).toBe(EXPECTED_LINE_NO)
    expect(unfiltered[i]!.getSourceFunction()).toBe(EXPECTED_FUNC_NAME)
  }

  // Test collection of filtered diagnostics
  for (let i = 0; i < 8; i++) _genWarning()
  const filtered = delegate.takeCoalescedDiagnostics()
  expect(filtered.length).toBe(1)
  const filteredDiagnostic = filtered[0]!

  expect(filteredDiagnostic.sharedItem.sourceLineNumber).toBe(EXPECTED_LINE_NO)
  expect(filteredDiagnostic.sharedItem.sourceFunction).toBe(EXPECTED_FUNC_NAME)
})

// Ported from OpenUSD 26.11.1: pxr/base/tf/__init__.py,
//  pxr/base/tf/wrapError.cpp,
//  pxr/usd/usdUtils/testenv/testUsdUtilsConditionalAbortDiagnosticDelegate.py
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1
// pxr/usd/usdUtils/testenv/testUsdUtilsConditionalAbortDiagnosticDelegate.py
// (registered as testUsdUtilsConditionalAbortDiagnosticDelegateCase1 ...
// Case16, CMakeLists.txt:188-347, one ctest per argparse subcommand). The
// test has no testenv directory.
//
// Registrations ported (one it() each):
//   testUsdUtilsConditionalAbortDiagnosticDelegateCase1
//   testUsdUtilsConditionalAbortDiagnosticDelegateCase2
//   testUsdUtilsConditionalAbortDiagnosticDelegateCase3
//   testUsdUtilsConditionalAbortDiagnosticDelegateCase4
//   testUsdUtilsConditionalAbortDiagnosticDelegateCase5
//   testUsdUtilsConditionalAbortDiagnosticDelegateCase5a
//   testUsdUtilsConditionalAbortDiagnosticDelegateCase6
//   testUsdUtilsConditionalAbortDiagnosticDelegateCase6a
//   testUsdUtilsConditionalAbortDiagnosticDelegateCase7
//   testUsdUtilsConditionalAbortDiagnosticDelegateCase8
//   testUsdUtilsConditionalAbortDiagnosticDelegateCase9
//   testUsdUtilsConditionalAbortDiagnosticDelegateCase10
//   testUsdUtilsConditionalAbortDiagnosticDelegateCase10a
//   testUsdUtilsConditionalAbortDiagnosticDelegateCase11
//   testUsdUtilsConditionalAbortDiagnosticDelegateCase11a
//   testUsdUtilsConditionalAbortDiagnosticDelegateCase12
//   testUsdUtilsConditionalAbortDiagnosticDelegateCase12a
//   testUsdUtilsConditionalAbortDiagnosticDelegateCase13
//   testUsdUtilsConditionalAbortDiagnosticDelegateCase13a
//   testUsdUtilsConditionalAbortDiagnosticDelegateCase14
//   testUsdUtilsConditionalAbortDiagnosticDelegateCase14a
//   testUsdUtilsConditionalAbortDiagnosticDelegateCase15
//   testUsdUtilsConditionalAbortDiagnosticDelegateCase16
//
// Each registration runs one testCaseN and expects return code 134 (the
// delegate aborted the process) or 0. PLATFORM-DIVERGENCE(usdutils-abort-throws):
// JavaScript cannot abort, so the delegate's abort path throws a FatalError
// TfError out of the post that triggered it; a 134 case here expects the
// case function to throw that error and a 0 case expects it to return.
//
// API mapping: Tf.RaiseCodingError(msg) posts a coding error whose commentary
// is "Python coding error: " + msg and whose context is the caller's code
// location (tf/__init__.py:195-198, tf/wrapError.cpp:40-51); the try/except
// Tf.RepostErrors(e) around it reposts that error with no active error mark,
// which reaches the delegates exactly as postError does here. Tf.Warn,
// Tf.Status and Tf.Fatal post a warning, a status and PostFatal with the
// caller's location (tf/__init__.py:175-208). The caller's file is the
// installed script, ${CMAKE_INSTALL_PREFIX}/tests/testUsdUtilsConditionalAbortDiagnosticDelegate;
// the code-path filters (*test*, *pxr*, ConditionalAbort, *usdImaging*)
// match against it, so SCRIPT stands for an install prefix without "pxr" as
// in the upstream registrations (case13 expects *pxr* not to match). The
// line numbers do not take part in matching.

import { expect, it } from 'vitest'
import {
  Error as TfError, TfDiagnosticMgr, TfDiagnosticType, TF_STATUS, TF_WARN, type TfCallContext,
} from 'typescript-usd/tf'
import {
  ConditionalAbortDiagnosticDelegate, ConditionalAbortDiagnosticDelegateErrorFilters,
} from 'typescript-usd/usdUtils'

const SCRIPT = '/usr/local/USD/tests/testUsdUtilsConditionalAbortDiagnosticDelegate'
const loc = (fn: string): TfCallContext => ({ file: SCRIPT, function: `__main__.${fn}`, line: 0 })

const Tf = {
  RaiseCodingError(msg: string, fn: string): void {
    TfDiagnosticMgr.GetInstance().postError(
      new TfError(`Python coding error: ${msg}`, TfDiagnosticType.CodingError, loc(fn)))
  },
  Warn(msg: string, fn: string): void { TF_WARN(msg, loc(fn)) },
  Status(msg: string, fn: string): void { TF_STATUS(msg, loc(fn)) },
  Fatal(msg: string, fn: string): void { TfDiagnosticMgr.GetInstance().postFatal(loc(fn), msg) },
}

function delegateSetup(
  stringIncFilders: string[] | null, codePathIncFilters: string[] | null,
  stringExcFilters: string[] | null, codePathExcFilters: string[] | null,
): ConditionalAbortDiagnosticDelegate {
  const incFilter = new ConditionalAbortDiagnosticDelegateErrorFilters()
  const excFilter = new ConditionalAbortDiagnosticDelegateErrorFilters()
  if (stringIncFilders?.length) incFilter.setStringFilters(stringIncFilders)
  if (codePathIncFilters?.length) incFilter.setCodePathFilters(codePathIncFilters)
  if (stringExcFilters?.length) excFilter.setStringFilters(stringExcFilters)
  if (codePathExcFilters?.length) excFilter.setCodePathFilters(codePathExcFilters)
  return new ConditionalAbortDiagnosticDelegate(incFilter, excFilter)
}

// The Python delegate lives until the case function returns (or the
// process aborts); dispose() ends it here.
function run(setup: () => ConditionalAbortDiagnosticDelegate, body: () => void): void {
  const delegate = setup()
  try { body() } finally { delegate.dispose() }
}

const cases: Record<string, () => void> = {
  case1: () => run(() => delegateSetup(['*'], null, [''], null), () => {
    Tf.RaiseCodingError('', 'testCase1')
  }),
  case2: () => run(() => delegateSetup(['*'], null, ['*'], null), () => {
    Tf.RaiseCodingError('', 'testCase2')
  }),
  case3: () => run(() => delegateSetup(null, null, null, null), () => {
    Tf.RaiseCodingError('', 'testCase3')
  }),
  case4: () => run(() => delegateSetup(null, null, ['blah'], null), () => {
    Tf.RaiseCodingError('', 'testCase4')
  }),
  case5: () => run(() => delegateSetup(['blah'], null, null, null), () => {
    Tf.RaiseCodingError('error string not included', 'testCase5')
  }),
  case5a: () => run(() => delegateSetup(['*included*'], null, null, null), () => {
    Tf.RaiseCodingError('error string included', 'testCase5a')
  }),
  case6: () => run(() => delegateSetup(['*abort*'], null, ['*not*'], null), () => {
    Tf.RaiseCodingError('does not abort', 'testCase6')
    Tf.RaiseCodingError('not abort', 'testCase6')
    Tf.RaiseCodingError('aborting on this!!', 'testCase6')
  }),
  case6a: () => run(() => delegateSetup(['*'], null, ['*not*'], null), () => {
    Tf.RaiseCodingError('does not abort', 'testCase6a')
    Tf.RaiseCodingError('lets not abort', 'testCase6a')
    Tf.RaiseCodingError('abort not please', 'testCase6a')
  }),
  case7: () => run(() => delegateSetup(null, ['*'], null, ['']), () => {
    Tf.RaiseCodingError('', 'testCase7')
  }),
  case8: () => run(() => delegateSetup(null, ['*'], null, ['*']), () => {
    Tf.RaiseCodingError('', 'testCase8')
  }),
  case9: () => run(() => delegateSetup(null, null, ['blah'], null), () => {
    Tf.RaiseCodingError('', 'testCase9')
  }),
  case10: () => run(() => delegateSetup(null, ['blah'], null, null), () => {
    Tf.RaiseCodingError('codePath not included', 'testCase10')
  }),
  case10a: () => run(() => delegateSetup(null, ['*test*'], null, null), () => {
    Tf.RaiseCodingError('codePath included', 'testCase10a')
  }),
  case11: () => run(() => delegateSetup(null, ['*test*'], ['*not*'], null), () => {
    // Note this is done using string exclude filters
    Tf.RaiseCodingError('does not abort', 'testCase11')
    Tf.RaiseCodingError('not abort', 'testCase11')
    Tf.RaiseCodingError('aborting on this!!', 'testCase11')
  }),
  case11a: () => run(() => delegateSetup(null, ['ConditionalAbort'], null, ['*test*']), () => {
    Tf.RaiseCodingError('does not abort', 'testCase11a')
    Tf.RaiseCodingError('lets not abort', 'testCase11a')
    Tf.RaiseCodingError('abort not please', 'testCase11a')
  }),
  case12: () => run(() => delegateSetup(['*'], null, null, ['*test*']), () => {
    Tf.RaiseCodingError('does not abort - nothing in pxr is aborted', 'testCase12')
    Tf.RaiseCodingError('lets not abort - nothing in pxr is aborted', 'testCase12')
    Tf.RaiseCodingError('abort not please - nothing in pxr is aborted', 'testCase12')
  }),
  case12a: () => run(() => delegateSetup(['please'], null, null, ['*usdImaging*']), () => {
    Tf.RaiseCodingError('does not abort - not in usdImaging', 'testCase12a')
    Tf.RaiseCodingError('lets not abort - not in usdImaging', 'testCase12a')
    Tf.RaiseCodingError('abort please - not in usdImaging', 'testCase12a')
  }),
  case13: () => run(() => delegateSetup(null, ['*pxr*'], ['*not*'], null), () => {
    Tf.RaiseCodingError('does not abort - word not excluded', 'testCase13')
    Tf.RaiseCodingError('lets not abort - word not excluded', 'testCase13')
    Tf.RaiseCodingError('abort not please - word not excluded', 'testCase13')
  }),
  case13a: () => run(() => delegateSetup(null, ['*test*'], ['*not*'], null), () => {
    Tf.RaiseCodingError('does not abort - word not excluded', 'testCase13a')
    Tf.RaiseCodingError('lets not abort - word not excluded', 'testCase13a')
    Tf.RaiseCodingError('abort please - word excluded', 'testCase13a')
  }),
  case14: () => run(() => delegateSetup(null, ['*test*'], ['*not*'], null), () => {
    Tf.Warn('does not abort - word not excluded', 'testCase14')
    Tf.Warn('lets not abort - word not excluded', 'testCase14')
    Tf.Warn('abort please - word excluded', 'testCase14')
  }),
  case14a: () => run(() => delegateSetup(null, ['*test*'], ['*not*'], null), () => {
    Tf.Warn('does not abort - word not excluded', 'testCase14a')
    Tf.Warn('lets not abort - word not excluded', 'testCase14a')
    Tf.Warn('abort not please - word not excluded', 'testCase14a')
  }),
  case15: () => run(() => delegateSetup(null, ['*test*'], ['*not*'], null), () => {
    Tf.Fatal('Aborts, even though word excluded', 'testCase15')
  }),
  case16: () => run(() => delegateSetup(null, ['*test*'], ['*not*'], null), () => {
    Tf.Status('Does not abort, even though word not excluded', 'testCase16')
  }),
}

// EXPECTED_RETURN_CODE of each registration (CMakeLists.txt:188-347).
const EXPECTED_RETURN_CODE: Record<string, 0 | 134> = {
  case1: 134, case2: 0, case3: 0, case4: 0, case5: 0, case5a: 134, case6: 134,
  case6a: 0, case7: 134, case8: 0, case9: 0, case10: 0, case10a: 134,
  case11: 134, case11a: 0, case12: 0, case12a: 134, case13: 0, case13a: 134,
  case14: 134, case14a: 0, case15: 134, case16: 0,
}

// Python's `if stringIncFilders:` treats None and [] alike; [''] is a
// non-empty list and is set (case1, case7).
it.each(Object.keys(EXPECTED_RETURN_CODE))(
  'testUsdUtilsConditionalAbortDiagnosticDelegate %s', name => {
    const body = cases[name]!
    if (EXPECTED_RETURN_CODE[name] === 134) {
      let thrown: unknown
      try { body() } catch (e) { thrown = e }
      expect(thrown).toBeInstanceOf(TfError)
      expect((thrown as TfError).diagnosticType).toBe(TfDiagnosticType.FatalError)
    } else {
      expect(body).not.toThrow()
    }
  })

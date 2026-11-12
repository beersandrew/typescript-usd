// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdUtils/testenv/testUsdUtilsCoalescingDiagnosticDelegate.cpp
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1
// pxr/usd/usdUtils/testenv/testUsdUtilsCoalescingDiagnosticDelegate.cpp
// (registered as testUsdUtilsCoalescingDiagnosticDelegateCpp). The test has
// no testenv directory.
//
// API mapping: the stack UsdUtilsCoalescingDiagnosticDelegate is constructed
// and dispose()d at the end of main. TF_WARN/TF_STATUS capture
// TF_CALL_CONTEXT (__FILE__, __ARCH_FUNCTION__, __LINE__); JavaScript has no
// such macros, so each call passes the context of its upstream call: the
// function and source line of the .cpp (lines 23-26 and 32-35, two posts
// sharing a line where upstream puts two on one line). TF_AXIOM(cond) is
// expect(cond).toBe(true). std::cout is process.stdout.

import { expect, it } from 'vitest'
import { TF_STATUS, TF_WARN, type TfCallContext } from 'typescript-usd/tf'
import { CoalescingDiagnosticDelegate } from 'typescript-usd/usdUtils'

const FILE = 'pxr/usd/usdUtils/testenv/testUsdUtilsCoalescingDiagnosticDelegate.cpp'
const at = (fn: string, line: number): TfCallContext => ({ file: FILE, function: fn, line })

// Here we emit some warnings on the same line, so they
// will get coalesced, and others on different lines, so they wont
// We expect to get 4 results when coalesced, 6 uncoalesced
function EmitWarnings(): void {
  TF_WARN('aaaaaaaaaaaaaa', at('EmitWarnings', 23)); TF_WARN('bbbbbbbbbbbbbb', at('EmitWarnings', 23))
  TF_WARN('cccccccccccccc', at('EmitWarnings', 24))
  TF_WARN('dddddddddddddd', at('EmitWarnings', 25))
  TF_WARN('eeeeeeeeeeeeee', at('EmitWarnings', 26)); TF_WARN('ffffffffffffff', at('EmitWarnings', 26))
}

// The same helper, but for statuses
function EmitStatuses(): void {
  TF_STATUS('.', at('EmitStatuses', 32)); TF_STATUS('.', at('EmitStatuses', 32))
  TF_STATUS('.', at('EmitStatuses', 33))
  TF_STATUS('.', at('EmitStatuses', 34))
  TF_STATUS('.', at('EmitStatuses', 35)); TF_STATUS('.', at('EmitStatuses', 35))
}

it('testUsdUtilsCoalescingDiagnosticDelegateCpp', () => {
  const delegate = new CoalescingDiagnosticDelegate()
  try {
    EmitWarnings()
    let coalesced = delegate.takeCoalescedDiagnostics()
    expect(coalesced.length === 4).toBe(true)

    EmitWarnings()
    EmitStatuses()
    coalesced = delegate.takeCoalescedDiagnostics()
    expect(coalesced.length === 8).toBe(true)

    // ensure that the line numbers are unique
    const sourceLineNumbers = new Set<number>()
    for (const p of coalesced) sourceLineNumbers.add(p.sharedItem.sourceLineNumber)
    expect(sourceLineNumbers.size === 8).toBe(true)

    EmitWarnings()
    EmitWarnings()
    const unfiltered = delegate.takeUncoalescedDiagnostics()
    expect(unfiltered.length === 12).toBe(true)

    // ensure that the line numbers are not unique
    sourceLineNumbers.clear()
    for (const i of unfiltered) sourceLineNumbers.add(i.getSourceLineNumber())
    expect(sourceLineNumbers.size === 4).toBe(true)

    process.stdout.write('-------------------------------------------\n')
    EmitWarnings()
    EmitWarnings()
    EmitStatuses()
    EmitStatuses()
    EmitWarnings()
    delegate.dumpCoalescedDiagnostics(process.stdout)

    process.stdout.write('-------------------------------------------\n')

    EmitWarnings()
    EmitWarnings()
    EmitStatuses()
    EmitStatuses()
    EmitWarnings()
    delegate.dumpUncoalescedDiagnostics(process.stdout)

    process.stdout.write('-------------------------------------------\n')
  } finally {
    delegate.dispose()
  }
})

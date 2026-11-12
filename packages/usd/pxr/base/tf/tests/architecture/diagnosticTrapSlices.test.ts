// Ported from OpenUSD 26.11.1: pxr/base/tf/testenv/testTfDiagnosticTrap.py
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Partial Python-binding behavioral slices informed by OpenUSD v26.08
// pxr/base/tf/testenv/testTfDiagnosticTrap.py; not the registered C++ program.
import { describe, expect, it } from 'vitest'
import { TfDiagnosticMgr, TfDiagnosticTrap, Warning, StatusObject } from '../../src/index.ts'

describe('TfDiagnosticTrap', () => {
  it('captures, orders, filters, clears, nests and reposts diagnostics', () => {
    const outer = new TfDiagnosticTrap()
    const inner = new TfDiagnosticTrap()
    TfDiagnosticMgr.GetInstance().postWarning('first')
    TfDiagnosticMgr.GetInstance().postStatus('second')
    TfDiagnosticMgr.GetInstance().postWarning('third')
    expect(inner.getWarnings().map(value => value.commentary)).toEqual(['first', 'third'])
    expect(inner.countMatching(value => value.commentary.includes('i'))).toBe(2)
    expect(inner.hasAnyMatching(value => value.commentary === 'second')).toBe(true)
    expect(inner.hasAllMatching(value => value.commentary.length > 0)).toBe(true)
    expect(inner.eraseMatching(value => value.commentary === 'first')).toBe(1)
    const order: Array<[Function, string]> = []
    inner.forEach(value => order.push([value.constructor, value.commentary]))
    expect(order).toEqual([[StatusObject, 'second'], [Warning, 'third']])
    inner.dismiss()
    expect(outer.getStatuses()).toHaveLength(1)
    expect(outer.getWarnings()).toHaveLength(1)
    outer.clear()
    outer.dismiss()
  })
})

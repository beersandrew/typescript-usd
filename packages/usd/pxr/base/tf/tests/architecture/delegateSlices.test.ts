// Ported from OpenUSD 26.11.1: pxr/base/tf/testenv/delegate.cpp
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Partial behavioral slices informed by OpenUSD v26.08
// pxr/base/tf/testenv/delegate.cpp; not a 1:1 program port.
import { describe, expect, it } from 'vitest'
import { TfDiagnosticMgr } from '../../src/index.ts'

describe('TfDiagnosticMgr delegates', () => {
  it('adds duplicates and removes every equal delegate', () => {
    const seen: string[] = []
    const delegate = {
      issueError: () => seen.push('error'), issueWarning: () => seen.push('warning'),
      issueStatus: () => seen.push('status'),
    }
    const manager = TfDiagnosticMgr.GetInstance()
    manager.addDelegate(delegate); manager.addDelegate(delegate)
    manager.postStatus('.')
    manager.postWarning('.')
    expect(seen).toEqual(['status', 'status', 'warning', 'warning'])
    manager.removeDelegate(delegate)
    manager.postStatus('.')
    expect(seen).toHaveLength(4)
  })
})

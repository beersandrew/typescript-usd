// Ported from OpenUSD 26.11.1: pxr/base/tf/testenv/error.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported/adapted from OpenUSD v26.08 pxr/base/tf/testenv/error.cpp
// (TfError, TfErrorThreadTransport, and the TfErrorMark interaction cases of
// TfDiagnosticTrap). TfErrorMark's destructor is Dispose(). A thrown TfError
// does not post itself, so Capture is the explicit boundary that posts it.
import { afterEach, describe, expect, it } from 'vitest'
import {
  Error as TfError, Mark, RaiseError, TF_HAS_ERRORS, TfDiagnosticMgr, TfDiagnosticTrap,
  TfDiagnosticType, TfErrorTransport,
} from '../../src/index.ts'

const mgr = TfDiagnosticMgr.GetInstance()
const runtimeError = (message: string) => mgr.postError(new TfError(message))
const codingError = (message: string) =>
  mgr.postError(new TfError(message, TfDiagnosticType.CodingError))

afterEach(() => {
  expect(mgr.hasActiveErrorMark()).toBe(false)
})

describe('TfError (testenv/error.cpp)', () => {
  it('tracks errors posted since the mark', () => {
    const m = new Mark()
    try {
      m.setMark()
      expect(m.isClean()).toBe(true)

      m.setMark()
      runtimeError('small error')
      expect(m.isClean()).toBe(false)
      let i = m.getBegin()
      expect(i).toBe(mgr.getErrorBegin())
      const e = mgr.getError(i)!
      expect(e.getCommentary()).toBe('small error')
      e.augmentCommentary('augment')
      expect(e.getCommentary()).toBe('small error\naugment')
      i = mgr.eraseError(i)
      expect(i).toBe(mgr.getErrorEnd())

      m.setMark()
      runtimeError('medium error')
      runtimeError('large error')
      i = m.getBegin()
      expect(i).toBe(mgr.getErrorBegin())
      expect(mgr.getError(i)!.getCommentary()).toBe('medium error')
      ++i
      expect(i).not.toBe(mgr.getErrorEnd())
      expect(mgr.getError(i)!.getCommentary()).toBe('large error')
      expect(m.getNumErrors()).toBe(2)

      expect(m.clear()).toBe(true)
      expect(m.isClean()).toBe(true)
      expect(m.clear()).toBe(false)

      codingError('test error')
      expect(m.isClean()).toBe(false)
      m.clear()

      m.setMark()
      codingError('Coding error')
      runtimeError('Runtime error')
      expect(m.isClean()).toBe(false)
      expect(m.getErrors().map(error => error.getCommentary())).toEqual(['Coding error', 'Runtime error'])
      m.clear()
    } finally {
      m.dispose()
    }
  })

  it('only sees errors with serials at or after its own mark', () => {
    const outer = new Mark()
    runtimeError('before inner')
    const inner = new Mark()
    expect(inner.isClean()).toBe(true)
    expect(outer.isClean()).toBe(false)
    runtimeError('after inner')
    expect(inner.getErrors().map(error => error.getCommentary())).toEqual(['after inner'])
    expect(outer.getErrors()).toHaveLength(2)
    inner.clear()
    expect(outer.getErrors().map(error => error.getCommentary())).toEqual(['before inner'])
    inner.dispose()
    // The outer mark is still active, so nothing was reported.
    expect(outer.isClean()).toBe(false)
    outer.clear()
    outer.dispose()
  })

  it('reports pending errors when the last mark is disposed', () => {
    const trap = new TfDiagnosticTrap()
    const m = new Mark()
    runtimeError('pending')
    expect(trap.hasErrors()).toBe(false)
    m.dispose()
    expect(mgr.getErrorEnd()).toBe(mgr.getErrorBegin())
    expect(trap.getErrors().map(error => error.getCommentary())).toEqual(['pending'])
    trap.clear()
    trap.dispose()
  })

  it('TF_HAS_ERRORS resets the mark and evaluates the expression', () => {
    const m = new Mark()
    runtimeError('earlier')
    expect(TF_HAS_ERRORS(m, () => {})).toBe(false)
    expect(TF_HAS_ERRORS(m, () => runtimeError('now'))).toBe(true)
    // SetMark moves the mark without erasing earlier errors.
    m.setMark()
    expect(m.isClean()).toBe(true)
    expect(mgr.getErrorEnd()).toBe(2)
    mgr.eraseRange(mgr.getErrorBegin(), mgr.getErrorEnd())
    m.dispose()
  })

  it('captures a thrown diagnostic at the explicit Capture boundary', () => {
    const mark = new Mark()
    mark.capture(() => RaiseError('bad value'))
    expect(mark.isClean()).toBe(false)
    expect(mark.getErrors()).toHaveLength(1)
    expect(mark.getErrors()[0]).toBeInstanceOf(TfError)
    expect(mark.getErrors()[0]!.message).toBe('bad value')
    mark.clear()
    expect(mark.isClean()).toBe(true)
    mark.dispose()
  })
})

describe('TfErrorThreadTransport (testenv/error.cpp)', () => {
  it('transports errors out of a mark and posts them later', () => {
    const transport = new TfErrorTransport()
    const m = new Mark()
    {
      // _ThreadTask, run in this lane.
      const task = new Mark()
      runtimeError('Cross-thread transfer test error')
      expect(task.isClean()).toBe(false)
      task.transportTo(transport)
      expect(task.isClean()).toBe(true)
      task.dispose()
    }
    expect(m.isClean()).toBe(true)
    expect(transport.IsEmpty()).toBe(false)
    transport.post()
    expect(transport.IsEmpty()).toBe(true)
    expect(m.isClean()).toBe(false)
    m.clear()
    m.dispose()
  })
})

describe('TfDiagnosticTrap and TfErrorMark (testenv/error.cpp)', () => {
  it('does not trap errors posted under an active mark', () => {
    const trap = new TfDiagnosticTrap()
    const mark = new Mark()
    runtimeError('error under mark')
    expect(mark.isClean()).toBe(false)
    expect(trap.hasErrors()).toBe(false)
    mark.clear()
    mark.dispose()
    trap.dispose()
  })

  it('catches trapped errors reposted under an active mark', () => {
    const trap = new TfDiagnosticTrap()
    runtimeError('trapped error')
    const mark = new Mark()
    expect(mark.isClean()).toBe(true)
    expect(trap.hasErrors()).toBe(true)
    trap.dismiss()
    expect(mark.isClean()).toBe(false)
    expect(trap.hasErrors()).toBe(false)
    mark.clear()
    mark.dispose()
  })

  it('reports HasActiveErrorMark for the mark lifetime', () => {
    expect(mgr.hasActiveErrorMark()).toBe(false)
    const mark = new Mark()
    expect(mgr.hasActiveErrorMark()).toBe(true)
    mark.dispose()
    mark.dispose()
    expect(mgr.hasActiveErrorMark()).toBe(false)
  })
})

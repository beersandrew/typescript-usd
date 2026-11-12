// Ported from OpenUSD 26.11.1: pxr/base/tf/diagnosticMgr.cpp,
//  pxr/base/tf/error.cpp, pxr/base/tf/testenv/error.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/base/tf/testenv/error.cpp, registrations
// TfDiagnosticTransport (Test_TfDiagnosticTransport, error.cpp:618-772) and
// TfErrorAndDiagnosticTransportLogText (Test_TfErrorAndDiagnosticTransportLogText,
// error.cpp:787-1114), both run by testTf.
//
// Adaptation: a JavaScript realm is one synchronous lane, so each std::thread
// body runs inline where upstream joins it. That is equivalent here because
// every child thread in these tests finishes (join()) before the parent
// installs the trap that receives its transports, and the outer
// `std::thread t` wrapper only exists to start from a lane with no marks or
// traps (vitest's lane has none). Transport destructors are drops.
//
// TfErrorAndDiagnosticTransportLogText: upstream's hasErrLog / hasTrapLog /
// hasTransportLog read the Arch crash-report "extra log info" text through
// test hooks private to diagnosticMgr.cpp (Tf_Get*LogTextForTesting,
// error.cpp:776-787). The TypeScript tf has no Arch crash-log facility, so
// those log-text assertions are not ported; every other TF_AXIOM of that
// test (mark/trap cleanliness and trapped contents around Transport()) is.
import { describe, expect, it } from 'vitest'
import {
  Error as TfError, StatusObject as TfStatus, Warning as TfWarning,
  TfDiagnosticMgr, TfDiagnosticTransport, TfDiagnosticTrap, TfErrorMark, TfErrorTransport,
} from '../../src/index.ts'

const mgr = TfDiagnosticMgr.GetInstance()
const TF_WARN = (message: string) => mgr.postWarning(new TfWarning(message))
const TF_STATUS = (message: string) => mgr.postStatus(new TfStatus(message))
const TF_RUNTIME_ERROR = (message: string) => mgr.postError(new TfError(message))

describe('TfDiagnosticTransport (testenv/error.cpp:618-772)', () => {
  it('basic transport leaves the trap clean and active (error.cpp:624-651)', () => {
    const outer = new TfDiagnosticTrap()
    {
      const inner = new TfDiagnosticTrap()
      TF_WARN('warning')
      TF_STATUS('status')

      const transport = inner.transport()
      expect(transport).toBeInstanceOf(TfDiagnosticTransport)
      expect(inner.isClean()).toBe(true)
      expect(transport.IsEmpty()).toBe(false)

      // Trap still active - further diagnostics are captured.
      TF_WARN('after transport')
      expect(inner.hasWarnings()).toBe(true)
      inner.clear()

      // Post lands in outer.
      transport.post()
      expect(transport.IsEmpty()).toBe(true)
      inner.dispose()
    }
    expect(outer.hasWarnings()).toBe(true)
    expect(outer.hasStatuses()).toBe(true)
    expect(outer.getWarnings().length).toBe(1)
    expect(outer.getWarnings()[0]!.getCommentary()).toBe('warning')
    expect(outer.getStatuses()[0]!.getCommentary()).toBe('status')
    outer.clear()
    outer.dispose()
  })

  it('an empty transport posts nothing (error.cpp:653-662)', () => {
    const outer = new TfDiagnosticTrap()
    const transport = new TfDiagnosticTransport()
    expect(transport.IsEmpty()).toBe(true)
    transport.post()
    expect(outer.hasWarnings()).toBe(false)
    expect(outer.hasStatuses()).toBe(false)
    outer.clear()
    outer.dispose()
  })

  it('preserves interleaved order across the transport (error.cpp:664-702)', () => {
    const transports: TfDiagnosticTransport[] = []
    {
      const trap = new TfDiagnosticTrap()
      TF_WARN('first')
      TF_STATUS('second')
      TF_WARN('third')
      if (!trap.isClean()) transports.push(trap.transport())
      trap.dispose()
    }

    const outer = new TfDiagnosticTrap()
    for (const transport of transports) transport.post()

    const order: string[] = []
    outer.forEach(d => {
      if (d instanceof TfWarning) order.push('W:' + d.getCommentary())
      else if (d instanceof TfStatus) order.push('S:' + d.getCommentary())
      else if (d instanceof TfError) order.push('E:' + d.getCommentary())
    })
    expect(order.length).toBe(3)
    expect(order[0]).toBe('W:first')
    expect(order[1]).toBe('S:second')
    expect(order[2]).toBe('W:third')
    outer.clear()
    outer.dispose()
  })

  it('collects one transport per child (error.cpp:704-732)', () => {
    const transports: TfDiagnosticTransport[] = []
    const childTask = (name: string) => {
      const trap = new TfDiagnosticTrap()
      TF_WARN(name)
      if (!trap.isClean()) transports.push(trap.transport())
      trap.dispose()
    }
    childTask('child1')
    childTask('child2')
    childTask('child3')

    const outer = new TfDiagnosticTrap()
    for (const transport of transports) transport.post()
    expect(outer.hasWarnings()).toBe(true)
    expect(outer.getWarnings().length).toBe(3)
    outer.clear()
    outer.dispose()
  })

  it('nested child traps: inner clears, outer transports the rest (error.cpp:734-766)', () => {
    const transports: TfDiagnosticTransport[] = []
    {
      const childOuter = new TfDiagnosticTrap()
      {
        const inner = new TfDiagnosticTrap()
        TF_WARN('should be cleared')
        inner.clearWarnings()
        TF_WARN('should survive')
        inner.dispose()
      }
      // inner re-posted "should survive" to outer
      if (!childOuter.isClean()) transports.push(childOuter.transport())
      childOuter.dispose()
    }

    const outer = new TfDiagnosticTrap()
    for (const transport of transports) transport.post()
    expect(outer.hasWarnings()).toBe(true)
    expect(outer.getWarnings().length).toBe(1)
    expect(outer.getWarnings()[0]!.getCommentary()).toBe('should survive')
    outer.clear()
    outer.dispose()
  })
})

describe('TfErrorAndDiagnosticTransportLogText (testenv/error.cpp:787-1114, non-log axioms)', () => {
  it('TfErrorMark::Transport() leaves the mark clean (error.cpp:829-852)', () => {
    const m = new TfErrorMark()
    TF_RUNTIME_ERROR('flight error')
    const transport = m.transport()
    expect(m.isClean()).toBe(true)
    transport.post()
    m.clear()
    m.dispose()
  })

  it('a dropped error transport leaves the mark clean (error.cpp:856-869)', () => {
    const m = new TfErrorMark()
    TF_RUNTIME_ERROR('dropped error')
    {
      m.transport()
      expect(m.isClean()).toBe(true)
    }
    m.clear()
    m.dispose()
  })

  it('concurrent error transports are independent (error.cpp:873-902)', () => {
    const m = new TfErrorMark()
    TF_RUNTIME_ERROR('multi error')
    const t1: TfErrorTransport = m.transport()
    TF_RUNTIME_ERROR('second error')
    const t2: TfErrorTransport = m.transport()
    expect(m.isClean()).toBe(true)
    // hasTransportLog(t1, "multi error") and hasTransportLog(t2, "second error")
    // (error.cpp:880, 886): each transport holds its own error. Dropping them
    // (error.cpp:892-901) only affects log text.
    expect(t1.IsEmpty()).toBe(false)
    expect(t2.IsEmpty()).toBe(false)
    m.clear()
    m.dispose()
  })

  it('TfDiagnosticTrap::Transport() leaves the trap clean (error.cpp:931-947)', () => {
    const trap = new TfDiagnosticTrap()
    TF_WARN('trap flight warning')
    trap.transport()
    expect(trap.isClean()).toBe(true)
    trap.clear()
    trap.dispose()
  })

  it('a trap stays clean after Transport() while the transport is in flight (error.cpp:952-1025)', () => {
    let transport = new TfDiagnosticTransport()
    {
      const trap = new TfDiagnosticTrap()
      TF_WARN('d1')
      transport = trap.transport()
      expect(trap.isClean()).toBe(true)
      TF_WARN('d2')
      trap.dispose()
    }
    transport = new TfDiagnosticTransport()
    {
      const trap = new TfDiagnosticTrap()
      TF_WARN('ct1')
      transport = trap.transport()
      expect(trap.isClean()).toBe(true)
      TF_WARN('ct2')
      trap.clear()
      expect(trap.isClean()).toBe(true)
      trap.dispose()
    }
    // hasTransportLog(transport, "ct1") (error.cpp:1018): the transport still
    // holds ct1 after the trap is gone.
    expect(transport.IsEmpty()).toBe(false)
  })

  it('appends correctly after a transport is dropped elsewhere (error.cpp:1030-1058)', () => {
    const trap = new TfDiagnosticTrap()
    TF_WARN('cross w1')
    let transport = trap.transport()
    expect(trap.isClean()).toBe(true)
    transport = new TfDiagnosticTransport()
    expect(transport.IsEmpty()).toBe(true)

    TF_WARN('cross w2')
    expect(trap.hasWarnings()).toBe(true)
    expect(trap.getWarnings().length).toBe(1)
    expect(trap.getWarnings()[0]!.getCommentary()).toBe('cross w2')
    trap.clear()
    trap.dispose()
  })

  it('nested traps keep outer entries across an inner Transport() (error.cpp:1063-1108)', () => {
    const outer = new TfDiagnosticTrap()
    TF_WARN('outer w1')
    {
      const inner = new TfDiagnosticTrap()
      TF_WARN('inner w1')
      let transport = inner.transport()
      expect(inner.isClean()).toBe(true)
      transport = new TfDiagnosticTransport()
      expect(transport.IsEmpty()).toBe(true)

      TF_WARN('inner w2')
      expect(inner.hasWarnings()).toBe(true)
      expect(inner.getWarnings().length).toBe(1)
      expect(inner.getWarnings()[0]!.getCommentary()).toBe('inner w2')
      inner.clear()
      inner.dispose()
    }
    // inner re-posts nothing (was cleared).
    expect(outer.hasWarnings()).toBe(true)
    expect(outer.getWarnings().length).toBe(1)
    expect(outer.getWarnings()[0]!.getCommentary()).toBe('outer w1')
    outer.clear()
    outer.dispose()
  })
})

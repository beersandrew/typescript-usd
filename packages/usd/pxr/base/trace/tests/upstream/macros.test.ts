// Ported from OpenUSD 26.11.1: pxr/base/trace/testenv/testTraceMacros.cpp,
//  pxr/base/trace/trace.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11 pxr/base/trace/testenv/testTraceMacros.cpp. The
// TRACE_* macros (trace.h) map onto the objects they expand to:
// TRACE_FUNCTION / TRACE_SCOPE / TRACE_FUNCTION_SCOPE open a TraceScopeAuto,
// TRACE_COUNTER_DELTA / TRACE_COUNTER_VALUE record through a
// TraceCounterHolder, and TRACE_MARKER / TRACE_MARKER_DYNAMIC record a
// collector marker event.

import { describe, expect, it } from 'vitest'
import {
  Collector, Reporter, TraceCounterHolder, TraceScopeAuto, TraceStaticKeyData,
} from '../../src/index.ts'

// testTraceMacros.cpp:18-31
function TestMacros(): void {
  const collector = Collector.GetInstance()
  const func = new TraceScopeAuto(new TraceStaticKeyData('TestMacros', 'void TestMacros()'))
  {
    const scope = new TraceScopeAuto('Test Scope')
    {
      const inner = new TraceScopeAuto(
        new TraceStaticKeyData('TestMacros', 'void TestMacros()', 'Inner Scope'))
      new TraceCounterHolder('Counter A').record(1, true)
      collector.markerEvent('Marker A')
      inner.close()
    }
    new TraceCounterHolder('Counter B').record(2, false)
    collector.markerEvent(`Dynamic Marker ${1}`)
    scope.close()
  }
  func.close()
}

describe('testTraceMacros', () => {
  it('records nested scopes, counters and markers', () => {
    // testTraceMacros.cpp:33-78
    const collector = Collector.GetInstance()
    const reporter = Reporter.getGlobalReporter()
    collector.clear()
    reporter.clearTree()
    collector.setEnabled(true)
    TestMacros()
    collector.setEnabled(false)
    expect(() => JSON.parse(reporter.reportChromeTracing())).not.toThrow()

    const threadNode = reporter.getAggregateTreeRoot().getChild('Main Thread')
    expect(threadNode).toBeDefined()
    const funcNode = threadNode!.getChild('TestMacros')
    expect(funcNode).toBeDefined()
    const scopeNode = funcNode!.getChild('Test Scope')
    expect(scopeNode).toBeDefined()
    const innerScopeNode = scopeNode!.getChild('TestMacros (Inner Scope)')
    expect(innerScopeNode).toBeDefined()

    const counters = reporter.getCounters()
    expect(counters.has('Counter A')).toBe(true)
    expect(counters.get('Counter A')).toBe(1.0)
    expect(counters.has('Counter B')).toBe(true)
    expect(counters.get('Counter B')).toBe(2.0)

    // Test Markers
    const timeline = reporter.getEventTree()
    expect(timeline).toBeDefined()
    const markers = timeline.getMarkers()
    expect(markers.has('Marker A')).toBe(true)
    expect(markers.has('Dynamic Marker 1')).toBe(true)
  })
})

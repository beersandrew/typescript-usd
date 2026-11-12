// Ported from OpenUSD 26.11.1: pxr/base/trace/testenv/testTraceCounters.cpp,
//  pxr/base/trace/testenv/testTraceMarkers.cpp
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ports pxr/base/trace/testenv/testTraceCounters.cpp:87 and
// pxr/base/trace/testenv/testTraceMarkers.cpp:46.

import { beforeEach, describe, expect, it } from 'vitest'
import { Collector, Reporter } from '../../src/index.ts'

describe('Trace counters and markers', () => {
  const collector = Collector.GetInstance()

  beforeEach(() => {
    collector.enabled = false
    collector.clear()
  })

  it('applies counter delta/value semantics and merges reports', () => {
    const reporter = new Reporter('counters')
    collector.enabled = true
    collector.recordCounterDelta('A', 1)
    collector.recordCounterDelta('A', 2)
    collector.recordCounterDelta('A', 3)
    collector.recordCounterValue('B', 1)
    collector.recordCounterValue('B', 2)
    collector.recordCounterValue('B', 3)
    collector.recordCounterValue('C', 5)
    collector.recordCounterDelta('C', -1)
    collector.recordCounterDelta('C', -2)
    reporter.updateTraceTrees()

    expect(reporter.getEventTree().counters.get('A')?.map(([, value]) => value)).toEqual([1, 3, 6])
    expect(reporter.getEventTree().counters.get('B')?.map(([, value]) => value)).toEqual([1, 2, 3])
    expect(reporter.getEventTree().counters.get('C')?.map(([, value]) => value)).toEqual([5, 4, 2])
    expect(reporter.getCounters()).toEqual(new Map([['A', 6], ['B', 3], ['C', 2]]))

    collector.recordCounterDelta('A', 1)
    reporter.updateTraceTrees()
    expect(reporter.getEventTree().counters.get('A')?.map(([, value]) => value)).toEqual([1, 3, 6, 7])
  })

  it('records markers in order, merges them, and clears the report tree', () => {
    const reporter = new Reporter('markers')
    collector.enabled = true
    collector.markerEventAtTime('A', 1)
    collector.markerEventAtTime('B', 2)
    collector.markerEventAtTime('C', 3)
    reporter.updateTraceTrees()
    expect([...reporter.getEventTree().markers].map(([key]) => key)).toEqual(['A', 'B', 'C'])

    collector.markerEventAtTime('A', 4)
    reporter.updateTraceTrees()
    expect(reporter.getEventTree().markers.get('A')).toHaveLength(2)

    reporter.clearTree()
    expect(reporter.getEventTree().markers.size).toBe(0)
    expect(reporter.aggregateTreeRoot.children).toHaveLength(0)
  })

  it('emits valid Chrome Trace JSON', () => {
    const reporter = new Reporter('chrome')
    collector.enabled = true
    collector.beginEventAtTime('scope', 1)
    collector.markerEventAtTime('mark', 1.5)
    collector.recordCounterValue('count', 2)
    collector.endEventAtTime('scope', 3)
    const parsed = JSON.parse(reporter.reportChromeTracing()) as { traceEvents: Array<Record<string, unknown>> }
    expect(parsed.traceEvents.map((event) => event.ph)).toEqual(['B', 'E', 'C', 'I'])
    expect(parsed.traceEvents[0]).toMatchObject({ cat: 'Default', name: 'scope', pid: 0, tid: 'Main Thread', ts: 1000 })
    expect(parsed.traceEvents[1]).toMatchObject({ name: 'scope', ts: 3000 })
  })

  it('builds nested complete scopes and emits Chrome X events', () => {
    const reporter = new Reporter('timespans')
    collector.enabled = true
    // Destruction order of nested TraceScopeAuto instances: child, then parent.
    collector.Scope('child', 2, 3)
    collector.Scope('parent', 1, 4)
    reporter.updateTraceTrees()

    const root = reporter.getEventRoot().children[0]!
    expect(root.children.map((node) => node.key)).toEqual(['parent'])
    expect(root.children[0]?.children.map((node) => node.key)).toEqual(['child'])
    const trace = JSON.parse(reporter.reportChromeTracing()) as { traceEvents: Array<Record<string, unknown>> }
    expect(trace.traceEvents).toEqual([
      { cat: 'Default', libTraceCatId: 0, pid: 0, tid: 'Main Thread', name: 'parent', ph: 'X', ts: 1000, dur: 3000 },
      { cat: 'Default', libTraceCatId: 0, pid: 0, tid: 'Main Thread', name: 'child', ph: 'X', ts: 2000, dur: 1000 },
    ])
  })
})

// Ported from OpenUSD 26.11.1: pxr/base/trace/aggregateNode.cpp,
//  pxr/base/trace/reporter.cpp
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// TraceAggregateNode::AdjustForOverheadAndNoise (aggregateNode.cpp:147-200)
// and its use by TraceReporter::Report (reporter.cpp:186-201).
//
// The Python bindings expose neither the overhead/quantum parameters nor the
// collector's measured overhead, so the direct cases below follow
// aggregateNode.cpp:147-200 line by line with injected values. The reporter
// case replays a v26.08 run (explicit-time events, shouldAdjustForOverheadAndNoise
// on), whose measured overhead was ~0.000167 ms per scope: Main Thread lost 3
// scopes' overhead, A lost 2, B and C were untouched, and A's exclusive time
// became its adjusted inclusive time minus B and C.

import { beforeEach, describe, expect, it } from 'vitest'
import { AggregateNode, Collector, Reporter } from '../src/index.ts'

describe('TraceAggregateNode AdjustForOverheadAndNoise', () => {
  it('subtracts overhead per descendant node and zeroes noisy children', () => {
    const p = new AggregateNode('P', 100, 1, 1)
    const b = p.append('B', 60, 3, 3)
    const c = p.append('C', 0.4, 2, 2)
    const d = b.append('D', 20, 4, 4)
    const published = { value: 7 }

    p.adjustForOverheadAndNoise(0.5, 0.01, published)

    // D has no descendants: unchanged.
    expect(d.getInclusiveTime()).toBe(20)
    expect(d.getExclusiveTime()).toBe(20)
    // B has one descendant node (D).
    expect(b.getInclusiveTime()).toBe(59.5)
    expect(b.getExclusiveTime()).toBe(39.5)
    // C: 2 * 0.01 * 20 >= 0.4, so it is noisy and zeroed.
    expect(c.getInclusiveTime()).toBe(0)
    expect(c.getExclusiveTime()).toBe(0)
    // P has three descendant nodes (B, C, D); C is not deducted.
    expect(p.getInclusiveTime()).toBe(98.5)
    expect(p.getExclusiveTime()).toBe(39)
    // aggregateNode.cpp:196-199: the descendant count is published.
    expect(published.value).toBe(10)
  })

  it('clamps the overhead at the inclusive time', () => {
    const q = new AggregateNode('Q', 1, 1, 1)
    const x = q.append('x', 0)
    q.append('y', 0)
    q.append('z', 0)

    q.adjustForOverheadAndNoise(0.5, 0)

    expect(q.getInclusiveTime()).toBe(0)
    expect(q.getExclusiveTime()).toBe(0)
    // count * 0 * 20 >= 0: zero-time children are noisy.
    expect(x.getInclusiveTime()).toBe(0)
  })
})

describe('TraceReporter overhead adjustment', () => {
  const collector = Collector.GetInstance()

  beforeEach(() => {
    collector.enabled = false
    collector.clear()
  })

  function record(): void {
    collector.enabled = true
    collector.beginEventAtTime('A', 0)
    let t = 1
    for (let i = 0; i < 3; ++i) {
      collector.beginEventAtTime('B', t)
      collector.endEventAtTime('B', t + 30)
      t += 30
    }
    for (let i = 0; i < 2; ++i) {
      collector.beginEventAtTime('C', t)
      collector.endEventAtTime('C', t + 1)
      t += 2
    }
    collector.endEventAtTime('A', 100)
    collector.enabled = false
  }

  function nodes(reporter: Reporter) {
    const thread = reporter.aggregateTreeRoot.getChildren()[0]!
    const a = thread.getChild('A')!
    return { thread, a, b: a.getChild('B')!, c: a.getChild('C')! }
  }

  it('leaves times unadjusted when the flag is off', () => {
    const reporter = new Reporter('overhead off')
    reporter.shouldAdjustForOverheadAndNoise = false
    record()
    reporter.report()
    const { thread, a, b, c } = nodes(reporter)
    expect(thread.getKey()).toBe('Main Thread')
    expect(thread.getInclusiveTime()).toBe(100)
    expect(thread.getExclusiveTime()).toBe(0)
    expect(a.getInclusiveTime()).toBe(100)
    expect(a.getExclusiveTime()).toBe(8)
    expect(b.getInclusiveTime()).toBe(90)
    expect(c.getInclusiveTime()).toBe(2)
  })

  it('removes the measured scope overhead per descendant node', () => {
    const reporter = new Reporter('overhead on')
    reporter.shouldAdjustForOverheadAndNoise = true
    record()
    reporter.report()
    const overhead = collector.getScopeOverhead()
    expect(overhead).toBeGreaterThan(0)
    const { thread, a, b, c } = nodes(reporter)
    expect(thread.getInclusiveTime()).toBeCloseTo(100 - 3 * overhead, 9)
    expect(thread.getExclusiveTime()).toBe(0)
    expect(a.getInclusiveTime()).toBeCloseTo(100 - 2 * overhead, 9)
    expect(a.getExclusiveTime()).toBeCloseTo(a.getInclusiveTime() - 92, 9)
    expect(b.getInclusiveTime()).toBe(90)
    expect(b.getExclusiveTime()).toBe(90)
    expect(c.getInclusiveTime()).toBe(2)
    expect(c.getExclusiveTime()).toBe(2)
  })
})

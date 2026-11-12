// Ported from OpenUSD 26.11.1: pxr/base/trace/testenv/testTraceReporter.py
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/base/trace/testenv/testTraceReporter.py:26.

import { beforeEach, describe, expect, it } from 'vitest'
import { Collector, Reporter } from '../../src/index.ts'

function nodesByKey(reporter: Reporter, key: string) {
  const result = []
  const pending = [reporter.aggregateTreeRoot]
  while (pending.length > 0) {
    const node = pending.pop()!
    if (node.key === key) result.push(node)
    pending.push(...node.children)
  }
  return result
}

describe('Trace Reporter', () => {
  const collector = Collector.GetInstance()

  beforeEach(() => {
    collector.enabled = false
    collector.clear()
  })

  it('aggregates explicit-time nested events', () => {
    const reporter = new Reporter('reporter')
    const C = (ts: number) => {
      collector.beginEventAtTime('C', ts)
      ts += 1
      collector.endEventAtTime('C', ts)
      return ts
    }
    const B = (start: number) => {
      collector.beginEventAtTime('B', start)
      let ts = start
      for (let i = 0; i < 4; i++) ts = C(ts)
      ts += 1
      collector.endEventAtTime('B', ts)
      return ts
    }
    collector.enabled = true
    collector.beginEventAtTime('A', 0)
    let ts = 0
    for (let i = 0; i < 3; i++) ts = B(ts)
    ts += 1
    collector.endEventAtTime('A', ts)
    collector.enabled = false
    reporter.updateTraceTrees()

    expect(nodesByKey(reporter, 'A')[0]).toMatchObject({ count: 1, inclusiveTime: 16, exclusiveTime: 1 })
    expect(nodesByKey(reporter, 'B')[0]).toMatchObject({ count: 3, inclusiveTime: 15, exclusiveTime: 3 })
    expect(nodesByKey(reporter, 'C')[0]).toMatchObject({ count: 12, inclusiveTime: 12, exclusiveTime: 12 })
  })
})

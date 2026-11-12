// Portions ported from OpenUSD 26.11.1, including:
//  pxr/base/trace/testenv/testTraceThreading.cpp
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { beforeEach, describe, expect, it } from 'vitest'
import { Collector, Reporter } from '../../src/index.ts'
import {
  _createLogicalTraceContext,
  _traceScopeData,
  _withTraceScope,
  _withTraceScopeSync,
} from 'typescript-usd/trace/_internal'

// TypeScript/web adaptation of OpenUSD v26.08
// pxr/base/trace/testenv/testTraceThreading.cpp:28-88: logical asynchronous
// lanes preserve the upstream per-thread separation without pretending that
// JavaScript promises are native C++ threads.

function deferred(): { promise: Promise<void>; resolve(): void } {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

describe('logical asynchronous trace context', () => {
  const collector = Collector.GetInstance()

  beforeEach(() => {
    collector.enabled = false
    collector.clear()
  })

  it('keeps two deliberately interleaved async trees in separate lanes', async () => {
    const reporter = new Reporter('async')
    const aEntered = deferred()
    const bEntered = deferred()
    const releaseA = deferred()
    const releaseB = deferred()
    collector.enabled = true

    const a = _withTraceScope(_createLogicalTraceContext('lane-a'), 'A', async (context) => {
      aEntered.resolve()
      await releaseA.promise
      await _withTraceScope(context, 'A.child', async () => { await Promise.resolve() })
    })
    await aEntered.promise

    const b = _withTraceScope(_createLogicalTraceContext('lane-b'), 'B', async (context) => {
      bEntered.resolve()
      await releaseB.promise
      await _withTraceScope(context, 'B.child', async () => { await Promise.resolve() })
    })
    await bEntered.promise

    releaseB.resolve()
    await b
    releaseA.resolve()
    await a
    reporter.updateTraceTrees()

    const lanes = reporter.getEventRoot().children
    const laneA = lanes.find((lane) => lane.key === 'lane-a')!
    const laneB = lanes.find((lane) => lane.key === 'lane-b')!
    expect(laneA.children.map((node) => node.key)).toEqual(['A'])
    expect(laneA.children[0]?.children.map((node) => node.key)).toEqual(['A.child'])
    expect(laneB.children.map((node) => node.key)).toEqual(['B'])
    expect(laneB.children[0]?.children.map((node) => node.key)).toEqual(['B.child'])
  })

  it('closes scopes after thrown exceptions and rejected promises', async () => {
    const reporter = new Reporter('errors')
    const context = _createLogicalTraceContext('errors')
    collector.enabled = true

    await expect(_withTraceScope(context, 'throw', () => { throw new Error('boom') })).rejects.toThrow('boom')
    await expect(_withTraceScope(context, 'reject', async () => { throw new Error('nope') })).rejects.toThrow('nope')
    reporter.updateTraceTrees()

    const nodes = reporter.getEventRoot().children[0]?.children ?? []
    expect(nodes.map((node) => node.key)).toEqual(['throw', 'reject'])
    expect(nodes.every((node) => node.endTime >= node.beginTime)).toBe(true)
    expect(JSON.parse(reporter.reportChromeTracing()).traceEvents.map((event: { ph: string }) => event.ph)).toEqual([
      'X', 'X',
    ])
  })

  it('keeps overlapping same-lane sibling data on the owning span', async () => {
    const reporter = new Reporter('same-lane')
    const aEntered = deferred()
    const bEntered = deferred()
    const releaseA = deferred()
    const releaseB = deferred()
    collector.enabled = true

    await _withTraceScope(_createLogicalTraceContext('shared'), 'parent', async (parentContext) => {
      const a = _withTraceScope(parentContext, 'A', async (context) => {
        _traceScopeData(context, 'owner', 'A')
        aEntered.resolve()
        await releaseA.promise
      })
      await aEntered.promise
      const b = _withTraceScope(parentContext, 'B', async (context) => {
        _traceScopeData(context, 'owner', 'B')
        bEntered.resolve()
        await releaseB.promise
      })
      await bEntered.promise
      releaseB.resolve()
      await b
      releaseA.resolve()
      await a
    })
    reporter.updateTraceTrees()

    const parent = reporter.getEventRoot().children[0]?.children[0]!
    expect(parent.key).toBe('parent')
    expect(parent.children.map((node) => node.key)).toEqual(['A', 'B'])
    expect(parent.children[0]?.attributes.get('owner')).toEqual(['A'])
    expect(parent.children[1]?.attributes.get('owner')).toEqual(['B'])
  })

  it('takes the disabled fast path without allocating events', async () => {
    let called = false
    await _withTraceScope(_createLogicalTraceContext('disabled'), 'unused', async () => {
      called = true
      await Promise.resolve()
    })
    expect(called).toBe(true)
    expect(collector.createCollection().empty).toBe(true)
  })

  it('closes synchronous scopes after exceptions', () => {
    const reporter = new Reporter('sync-errors')
    collector.enabled = true

    expect(() => _withTraceScopeSync(
      _createLogicalTraceContext('sync-errors'),
      'sync.throw',
      () => { throw new Error('boom') },
    )).toThrow('boom')
    reporter.updateTraceTrees()

    const node = reporter.getEventRoot().children[0]?.children[0]
    expect(node?.key).toBe('sync.throw')
    expect(node?.endTime).toBeGreaterThanOrEqual(node?.beginTime ?? 0)
  })
})

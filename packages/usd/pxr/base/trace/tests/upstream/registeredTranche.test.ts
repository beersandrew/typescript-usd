// Ported from OpenUSD 26.11.1: pxr/base/trace/testenv/testTraceCategory.cpp,
//  pxr/base/trace/testenv/testTraceData.cpp,
//  pxr/base/trace/testenv/testTraceEventContainer.cpp,
//  pxr/base/trace/testenv/testTraceHash.cpp,
//  pxr/base/trace/testenv/testTraceMacros.cpp,
//  pxr/base/trace/testenv/testTraceReportPerf.cpp, and 4 more cited below
// Copyright 2018, 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Surface checks kept from an earlier loose tranche of the OpenUSD
// pxr/base/trace/CMakeLists.txt registrations. testTraceCategory,
// testTraceData, testTraceEventContainer, testTraceHash, testTraceMacros,
// testTraceReporterLoadTrace, testTraceReports and testTraceSerialization now
// have faithful per-file ports beside this one. What remains has no faithful
// port: testTraceReportPerf (a performance benchmark) and testTraceThreading
// (native threads) are out of scope, and the last case exercises public
// helper classes no upstream test covers directly. These checks do not
// derive from upstream assertions.

import { beforeEach, describe, expect, it } from 'vitest'
import {
  Collector,
  Event,
  EventDataType,
  EventType,
  Reporter,
  TraceAggregateTree,
  Trace_AggregateTreeBuilder,
  Trace_EventTreeBuilder,
  TraceCategory,
  TraceCollectionAvailable,
  TraceConcurrentList,
  TraceCounterAccumulator,
  TraceCounterHolder,
  TraceDataBuffer,
  TraceDynamicKey,
  TraceEventContainer,
  TraceEventData,
  TraceEventList,
  TraceKey,
  TraceReporterDataSourceCollection,
  TraceReporterDataSourceCollector,
  TraceReporterBase,
  TraceScopeAuto,
  TraceSerialization,
  TraceStaticKeyData,
  TraceStringHash,
} from '../../src/index.ts'

describe('OpenUSD v26.08 Trace registered surface', () => {
  const collector = Collector.GetInstance()

  beforeEach(() => {
    collector.enabled = false
    collector.clear()
  })

  it('testTraceReportPerf scales deterministic reports by iteration count', () => {
    const reporter = new Reporter('perf')
    collector.enabled = true
    collector.beginEventAtTime('work', 0)
    collector.endEventAtTime('work', 10)
    const report = reporter.report(5)
    expect(report).toContain('Number of iterations: 5')
    expect(report).toContain('2.000 ms')
  })

  it('testTraceThreading keeps independently named logical lanes separated', async () => {
    const internal = await import('../../src/internal/index.ts')
    const reporter = new Reporter('threading')
    collector.enabled = true
    await Promise.all([
      internal._withTraceScope(internal._createLogicalTraceContext('lane-a'), 'A', async () => {}),
      internal._withTraceScope(internal._createLogicalTraceContext('lane-b'), 'B', async () => {}),
    ])
    reporter.updateTraceTrees()
    expect(reporter.getEventRoot().children.map(lane => lane.key).sort())
      .toEqual(['lane-a', 'lane-b'])
  })

  it('covers the remaining applicable public helper contracts', () => {
    const list = new TraceConcurrentList<number>()
    list.pushBack(1)
    list.pushBack(2)
    expect([...list]).toEqual([1, 2])

    const buffer = new TraceDataBuffer<string>()
    expect(buffer.append('stored')).toBe('stored')
    expect(buffer.values()).toEqual(['stored'])

    const accumulator = new TraceCounterAccumulator()
    expect(accumulator.process('counter', 3, false)).toBe(3)
    expect(accumulator.process('counter', -1, true)).toBe(2)

    const staticKey = new TraceStaticKeyData('Function', 'void Function()', 'scope')
    const dynamicKey = new TraceDynamicKey('dynamic')
    expect(staticKey.GetString()).toBe('Function (scope)')
    expect(dynamicKey.Hash()).toBe(TraceStringHash.Hash('dynamic'))
    expect(new TraceKey('key').GetString()).toBe('key')

    collector.enabled = true
    const scope = new TraceScopeAuto(staticKey)
    scope.close(scope.start + 2)
    const collection = collector.createCollection()
    expect(new TraceCollectionAvailable(collection).getCollection()).toBe(collection)

    const eventTree = new Trace_EventTreeBuilder().build(collection)
    expect(eventTree.getRoot().children[0]?.children[0]?.key).toBe('Function (scope)')
    const aggregateTree = new Trace_AggregateTreeBuilder().build(collection)
    expect(aggregateTree).toBeInstanceOf(TraceAggregateTree)

    const collectionSource = new TraceReporterDataSourceCollection(collection)
    class CountingReporter extends TraceReporterBase {
      count = 0
      update(): void { this._update() }
      protected override _processCollection(): void { this.count++ }
    }
    const baseReporter = new CountingReporter(collectionSource)
    baseReporter.update()
    expect(baseReporter.count).toBe(1)
    expect(JSON.parse(baseReporter.serializeProcessedCollections())).toHaveLength(1)
    expect(collectionSource.consumeData()).toEqual([])

    collector.recordCounterValue('held', 4)
    const collectorSource = new TraceReporterDataSourceCollector(collector)
    expect(collectorSource.consumeData()).toHaveLength(1)

    const counter = new TraceCounterHolder('public counter')
    counter.recordValue(8)
    expect(collector.createCollection().getEvents('Main Thread')[0]?.getCounterValue()).toBe(8)
  })
})

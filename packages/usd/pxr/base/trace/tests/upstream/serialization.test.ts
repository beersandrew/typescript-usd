// Ported from OpenUSD 26.11.1:
//  pxr/base/trace/testenv/testTraceSerialization.cpp
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11 pxr/base/trace/testenv/testTraceSerialization.cpp.
// Collections are written, read back and written again; the two documents
// must be identical (testTraceSerialization.cpp:170-219). The single
// collection is also compared with the upstream baseline
// testenv/testTraceSerialization.testenv/baseline/trace.json (copied to
// fixtures/testTraceSerialization/), the document upstream writes for it.
// Times are this package's milliseconds: upstream's `ms = .001` seconds is 1.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  EventType, TraceCategory, TraceCollection, TraceEvent, TraceEventList,
  TraceSerialization, type Data as TraceData,
} from '../../src/index.ts'

// testTraceSerialization.cpp:18-20
const TestCategory = TraceCategory.createTraceCategoryId('TestCategory')

// testTraceSerialization.cpp:22-153
function CreateTestEvents(timeOffset: number): TraceEventList {
  const ms = 1
  timeOffset += ms
  const events = new TraceEventList()
  const add = (
    type: EventType, key: string, time: number,
    extra: { value?: number; data?: TraceData; startTime?: number; category?: number } = {},
  ) => events.emplaceBack(new TraceEvent({
    key: events.cacheKey(key), type, time, laneId: '',
    category: extra.category ?? TraceCategory.Default, ...extra,
  }))

  add(EventType.CounterDelta, 'Test Counter', 2.0 * ms + timeOffset, { value: 1 })
  add(EventType.Begin, 'Inner Scope 2', 3.0 * ms + timeOffset, { category: TestCategory })
  add(EventType.End, 'Inner Scope 2', 4.0 * ms + timeOffset, { category: TestCategory })
  add(EventType.ScopeData, 'Test Data 0', 5.0 * ms + timeOffset, { data: true })
  add(EventType.ScopeData, 'Test Data 1', 6.0 * ms + timeOffset, { data: -2 })
  // uint64_t data = ~0
  add(EventType.ScopeData, 'Test Data 2', 7.0 * ms + timeOffset, { data: 2n ** 64n - 1n })
  add(EventType.ScopeData, 'Test Data 3', 8.0 * ms + timeOffset, { data: 1.5 })
  add(EventType.ScopeData, 'Test Data 4', 9.0 * ms + timeOffset, { data: 'String Data' })
  add(EventType.Timespan, 'InnerScope', 10.0 * ms + timeOffset, { startTime: ms + timeOffset })
  add(EventType.CounterDelta, 'Test Counter', 11.0 * ms + timeOffset, { value: 1 })
  add(EventType.CounterValue, 'Test Counter', 12.0 * ms + timeOffset, { value: -1 })
  add(EventType.Timespan, 'OuterScope', 13.0 * ms + timeOffset, { startTime: 0 + timeOffset })
  add(EventType.Marker, 'Test Marker 1', 4.0 * ms + timeOffset)
  add(EventType.Marker, 'Test Marker 2', 5.0 * ms + timeOffset)
  return events
}

// testTraceSerialization.cpp:155-165
function CreateTestCollection(startTimeMs = 0): TraceCollection {
  const collection = new TraceCollection()
  collection.addToCollection('Thread 1', [...CreateTestEvents(startTimeMs)])
  collection.addToCollection('Thread 2', [...CreateTestEvents(startTimeMs + 1)])
  return collection
}

// testTraceSerialization.cpp:167-219
function _TestSerialization(testCols: TraceCollection[]): string {
  const test = testCols.length === 1
    ? TraceSerialization.write(testCols[0]!)
    : TraceSerialization.write(testCols)
  expect(test).toBeDefined()

  const collection = TraceSerialization.Read(test!)
  expect(collection).toBeDefined()

  const test2 = TraceSerialization.write(collection!)
  expect(test2).toBeDefined()
  expect(test2).toBe(test)
  return test!
}

interface ChromeEvent { name: string; ph: string; tid: string | number; ts: number }
interface TraceDocument { traceEvents: ChromeEvent[]; libTraceData: unknown }

// The baseline's numbers, with uint64 values kept exact.
function parseExact(text: string): TraceDocument {
  return JSON.parse(text, (_key, value: unknown, context?: { source?: string }) =>
    typeof value === 'number' && !Number.isSafeInteger(value) && context?.source &&
      /^\d+$/.test(context.source) ? BigInt(context.source) : value) as TraceDocument
}

// Counters and markers are written from TfToken-keyed unordered maps
// (eventTree.h), so their order between keys is a hash order; the order of
// one key's values is defined.
function byKey(events: ChromeEvent[]): Map<string, ChromeEvent[]> {
  const result = new Map<string, ChromeEvent[]>()
  for (const event of events) {
    const key = `${event.ph}:${event.name}`
    result.set(key, [...(result.get(key) ?? []), event])
  }
  return new Map([...result].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))
}

describe('testTraceSerialization', () => {
  TraceCategory.GetInstance().registerCategory(TestCategory, 'Test Category')
  const collections: TraceCollection[] = []

  it('round-trips a single collection', () => {
    // testTraceSerialization.cpp:226-229
    collections.push(CreateTestCollection())
    const written = _TestSerialization(collections)

    const baseline = parseExact(readFileSync(
      new URL('./fixtures/testTraceSerialization/trace.json', import.meta.url), 'utf8'))
    const actual = parseExact(written)
    const isScope = (e: ChromeEvent) => e.ph === 'X' || e.ph === 'B' || e.ph === 'E'
    expect(baseline.traceEvents.filter(isScope)).toHaveLength(8)
    expect(actual.traceEvents.filter(isScope)).toEqual(baseline.traceEvents.filter(isScope))
    expect(byKey(actual.traceEvents.filter(e => !isScope(e))))
      .toEqual(byKey(baseline.traceEvents.filter(e => !isScope(e))))
    expect(actual.libTraceData).toEqual(baseline.libTraceData)
  })

  it('round-trips multiple collections', () => {
    // testTraceSerialization.cpp:231-234
    collections.push(CreateTestCollection(20.0))
    _TestSerialization(collections)
  })
})

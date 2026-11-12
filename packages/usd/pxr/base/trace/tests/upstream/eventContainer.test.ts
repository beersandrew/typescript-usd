// Ported from OpenUSD 26.11.1:
//  pxr/base/trace/testenv/testTraceEventContainer.cpp
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11 pxr/base/trace/testenv/testTraceEventContainer.cpp.
// The expected output is the upstream baseline
// testenv/testTraceEventContainer.testenv/baseline/testTraceEventContainer-Run1-stdout.txt,
// copied to fixtures/testTraceEventContainer/. Tick timestamps are this
// package's plain numbers (ms = 1, as upstream's TimeStamp ms = 1).

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  EventType, TraceCategory, TraceEvent, TraceEventList,
} from '../../src/index.ts'

const baseline = readFileSync(new URL(
  './fixtures/testTraceEventContainer/testTraceEventContainer-Run1-stdout.txt', import.meta.url), 'utf8')

function timespan(events: TraceEventList, key: string, start: number, end: number): TraceEvent {
  return new TraceEvent({
    key: events.cacheKey(key), type: EventType.Timespan, startTime: start, time: end,
    laneId: '', category: TraceCategory.Default,
  })
}

// testTraceEventContainer.cpp:16-45
function CreateInnerOnlyTestEvents(): TraceEventList {
  const ms = 1
  const events = new TraceEventList()
  events.emplaceBack(timespan(events, 'Test Timespan 1', 2 * ms, 6 * ms))
  events.emplaceBack(new TraceEvent({
    key: events.cacheKey('Test Marker'), type: EventType.Marker, time: 3 * ms,
    laneId: '', category: TraceCategory.Default,
  }))
  events.emplaceBack(timespan(events, 'Test Timespan 2', 7 * ms, 9 * ms))
  return events
}

// testTraceEventContainer.cpp:47-63
function CreateUseOuterTestEvents(): TraceEventList {
  const ms = 1
  const events = new TraceEventList()
  const numEvents = 20
  for (let i = 0; i < numEvents; i++) {
    events.emplaceBack(timespan(events, `Timespan ${i}`, i * ms, (i + 1) * ms))
  }
  return events
}

// testTraceEventContainer.cpp:65-103
function CreateAppendedList(): TraceEventList {
  const ms = 1
  const events = new TraceEventList()
  const numEvents = 200
  for (let i = 0; i < numEvents; i++) {
    events.emplaceBack(timespan(events, `Timespan ${i}`, i * ms, (i + 1) * ms))
  }
  const numAppends = 7
  for (let j = 0; j < numAppends; ++j) {
    const otherEvents = new TraceEventList()
    for (let i = 0; i < numEvents; i++) {
      otherEvents.emplaceBack(timespan(otherEvents, `Timespan ${j}, ${i}`, i * ms, (i + 1) * ms))
    }
    events.append(otherEvents)
  }
  return events
}

// testTraceEventContainer.cpp:105-134
function writeEvent(out: string[], e: TraceEvent): void {
  out.push('        Found event')
  out.push(`            Begin: ${e.getStartTimeStamp()}`)
  out.push(`            End: ${e.getEndTimeStamp()}`)
}
function _TestForwardIteration(out: string[], eventList: TraceEventList): void {
  out.push('    Forward')
  for (const e of eventList) writeEvent(out, e)
}
function _TestReverseIteration(out: string[], eventList: TraceEventList): void {
  out.push('    Reverse')
  for (const e of eventList.reverse()) writeEvent(out, e)
}

describe('testTraceEventContainer', () => {
  it('iterates empty, small and appended event lists like the baseline', () => {
    // testTraceEventContainer.cpp:136-166
    const out: string[] = []
    out.push('Empty list:')
    const emptyEvents = new TraceEventList()
    expect([...emptyEvents]).toEqual([])
    expect([...emptyEvents.reverse()]).toEqual([])
    _TestForwardIteration(out, emptyEvents)
    _TestReverseIteration(out, emptyEvents)

    out.push('Inner Only list:')
    const innerOnlyEventList = CreateInnerOnlyTestEvents()
    _TestForwardIteration(out, innerOnlyEventList)
    _TestReverseIteration(out, innerOnlyEventList)

    out.push('Use Outer list:')
    const useOuterEventList = CreateUseOuterTestEvents()
    _TestForwardIteration(out, useOuterEventList)
    _TestReverseIteration(out, useOuterEventList)

    out.push('Appended list:')
    const appendedEventList = CreateAppendedList()
    _TestForwardIteration(out, appendedEventList)
    _TestReverseIteration(out, appendedEventList)

    out.push(' PASSED')
    expect(`${out.join('\n')}\n`).toBe(baseline)
  })
})

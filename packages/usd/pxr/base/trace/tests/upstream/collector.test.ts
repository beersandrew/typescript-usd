// Ported from OpenUSD 26.11.1: pxr/base/trace/testenv/testTrace.py
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/base/trace/testenv/testTrace.py:37 collector fundamentals.

import { beforeEach, describe, expect, it } from 'vitest'
import { Collector, EventType, GetElapsedSeconds } from '../../src/index.ts'

describe('Trace Collector', () => {
  const collector = Collector.GetInstance()

  beforeEach(() => {
    collector.enabled = false
    collector.clear()
  })

  it('is a singleton', () => {
    expect(Collector.GetInstance()).toBe(Collector.GetInstance())
    expect(Collector.GetInstance()).toBeInstanceOf(Collector)
  })

  it('honors enable and disable state', () => {
    expect(collector.enabled).toBe(false)
    expect(collector.endEvent('Begin')).toBe(0)

    collector.enabled = true
    collector.beginEvent('Begin')
    collector.endEvent('Begin')
    collector.enabled = false
    collector.beginEvent('disabled')
    collector.endEvent('disabled')

    const events = collector.createCollection().getEvents('Main Thread')
    expect(events.map((event) => event.type)).toEqual([EventType.Begin, EventType.End])
    expect(events.map((event) => event.key)).toEqual(['Begin', 'Begin'])
  })

  it('records nested begin/end events with stable identities', () => {
    collector.enabled = true
    collector.beginEventAtTime('A', 0)
    collector.beginEventAtTime('B', 1)
    collector.endEventAtTime('B', 2)
    collector.endEventAtTime('A', 3)

    const events = collector.createCollection().getEvents('Main Thread')
    expect(events.map((event) => [event.key, event.parentEventId])).toEqual([
      ['A', undefined],
      ['B', events[0]?.eventId],
      ['B', events[0]?.eventId],
      ['A', undefined],
    ])
    expect(events[0]?.eventId).toBe(events[3]?.eventId)
    expect(events[1]?.eventId).toBe(events[2]?.eventId)
  })

  it('reports elapsed timestamp seconds', () => {
    expect(GetElapsedSeconds(100, 1350)).toBe(1.25)
    expect(GetElapsedSeconds(2, 1)).toBe(0)
  })

  it('records a two-timestamp Timespan through Scope', () => {
    collector.enabled = true
    collector.Scope('complete', 1.25, 4.5)
    const event = collector.createCollection().getEvents('Main Thread')[0]!
    expect(event.type).toBe(EventType.Timespan)
    expect(event.getTimeSpanStamps()).toEqual([1.25, 4.5])
    expect(event.getStartTimeStamp()).toBe(1.25)
    expect(event.getEndTimeStamp()).toBe(4.5)
  })

  it('clears pending collection data', () => {
    collector.enabled = true
    collector.beginEvent('discarded')
    collector.endEvent('discarded')
    collector.clear()
    expect(collector.createCollection().empty).toBe(true)
  })
})

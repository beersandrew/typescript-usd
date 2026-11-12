// Ported from OpenUSD 26.11.1: pxr/base/trace/collector.cpp,
//  pxr/base/trace/collector.h, pxr/base/trace/wrapCollector.cpp
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Collector ports pxr/base/trace/collector.h:48 and the binding surface at
// pxr/base/trace/wrapCollector.cpp:113. The disabled branch returns before
// allocating an Event.

import { Collection } from './collection.ts'
import { TraceCollectionAvailable } from './collectionNotice.ts'
import { Event, EventType, type TraceData } from './event.ts'

export interface SpanIdentity {
  readonly eventId: number
  readonly parentEventId: number | undefined
  readonly laneId: string
  readonly key: string
  readonly category: number
}

interface OpenSpan extends SpanIdentity {}

const DEFAULT_LANE = 'Main Thread'

function monotonicMilliseconds(): number {
  const runtime = globalThis as typeof globalThis & { performance?: { now(): number } }
  return runtime.performance?.now() ?? Date.now()
}

// arch/timing.cpp:71-93 (Arch_ComputeTickQuantum): the smallest nonzero
// difference between consecutive clock reads, in milliseconds.
let tickQuantum: number | undefined
function computeTickQuantum(): number {
  let currMin = Number.POSITIVE_INFINITY
  for (let trial = 0; trial !== 64; ++trial) {
    const times = [monotonicMilliseconds(), monotonicMilliseconds(), monotonicMilliseconds(),
      monotonicMilliseconds(), monotonicMilliseconds()]
    for (let i = 0; i !== times.length - 1; ++i) {
      const delta = times[i + 1]! - times[i]!
      // A clock read is far faster than a coarse timer's resolution, so
      // zero deltas mean "same tick"; upstream's tick counter never repeats.
      if (delta > 0) currMin = Math.min(currMin, delta)
    }
  }
  if (!Number.isFinite(currMin)) {
    const start = monotonicMilliseconds()
    let now = start
    while (now === start) now = monotonicMilliseconds()
    currMin = now - start
  }
  return currMin
}

// arch/timing.h:279-303 and timing.cpp:174-262 (ArchMeasureExecutionTime):
// the fastest consensus time of `fn`, in milliseconds. maxTicks is upstream's
// 1e7-tick budget expressed as 10 ms; each sample is also held to a share of
// that budget, since a browser's coarse clock would otherwise ask for
// hundreds of milliseconds per sample.
function measureExecutionTime(fn: () => void, maxMilliseconds = 10): number {
  const measureN = (nTimes: number): number => {
    const start = monotonicMilliseconds()
    for (let i = nTimes; i--;) fn()
    return monotonicMilliseconds() - start
  }
  let estTicksPer = Number.POSITIVE_INFINITY
  for (let i = 10; i--;) estTicksPer = Math.min(estTicksPer, measureN(1))
  const numSamples = 64
  const quantum = Collector.getTickQuantum()
  const minTicksPerSample = Math.min(2000 * quantum, maxMilliseconds / numSamples * 4)
  const sampleIters = estTicksPer < minTicksPerSample
    ? Math.max(1, Math.round(minTicksPerSample / Math.max(estTicksPer, quantum / 1000)))
    : 1
  const measureSample = () => measureN(sampleIters) / sampleIters
  const sampleTimes = Array.from({ length: numSamples }, measureSample)
  const limitStart = monotonicMilliseconds()
  let bestMedian = Number.POSITIVE_INFINITY
  for (;;) {
    sampleTimes.sort((a, b) => a - b)
    if (sampleTimes[0] === sampleTimes[numSamples / 2]) return sampleTimes[0]!
    if (monotonicMilliseconds() - limitStart >= maxMilliseconds) break
    bestMedian = Math.min(bestMedian, sampleTimes[numSamples / 2]!)
    for (let i = numSamples - Math.floor(numSamples / 3); i !== numSamples; ++i) sampleTimes[i] = measureSample()
    for (let i = 0; i !== Math.floor(numSamples / 10); ++i) sampleTimes[i] = measureSample()
  }
  return bestMedian
}

const OVERHEAD_LANE = 'Trace scope overhead'

export class Collector {
  static #instance: Collector | undefined
  #measuredScopeOverhead: number | undefined

  #enabled = false
  #nextEventId = 1
  #eventsByLane = new Map<string, Event[]>()
  #openSpansByLane = new Map<string, OpenSpan[]>()

  private constructor() {}

  static GetInstance(): Collector { return (Collector.#instance ??= new Collector()) }

  get enabled(): boolean { return this.#enabled }
  set enabled(value: boolean) { this.setEnabled(value) }
  static isEnabled(): boolean { return Collector.GetInstance().#enabled }
  setEnabled(value: boolean): void { this.#enabled = value }
  getLabel(): string { return 'TraceRegistry global collector' }

  /** ArchGetTickQuantum (arch/timing.cpp:95-99), in milliseconds. */
  static getTickQuantum(): number { return (tickQuantum ??= computeTickQuantum()) }

  // collector.cpp:194-197 and :220-229: the cost of one recorded scope. The
  // measurement runs on first use, on a private lane it then discards, so it
  // neither costs construction time nor disturbs recorded events.
  getScopeOverhead(): number {
    if (this.#measuredScopeOverhead === undefined) {
      const enabled = this.#enabled
      this.#enabled = true
      try {
        this.#measuredScopeOverhead = measureExecutionTime(() => {
          const span = this._beginEvent('TraceCollector::_MeasureScopeOverhead', OVERHEAD_LANE, undefined)
          this._endEvent(span.key, OVERHEAD_LANE, span.eventId)
        })
      } finally {
        this.#enabled = enabled
        this.#eventsByLane.delete(OVERHEAD_LANE)
        this.#openSpansByLane.delete(OVERHEAD_LANE)
      }
    }
    return this.#measuredScopeOverhead
  }

  beginEvent(key: string, category = 0): number {
    if (!this.#enabled) return 0
    return this._beginEvent(key, DEFAULT_LANE, undefined, monotonicMilliseconds(), true, category).time
  }

  endEvent(key: string): number {
    if (!this.#enabled) return 0
    return this._endEvent(key, DEFAULT_LANE, undefined, monotonicMilliseconds())
  }

  beginEventAtTime(key: string, milliseconds: number, category = 0): void {
    if (!this.#enabled) return
    this._beginEvent(key, DEFAULT_LANE, undefined, milliseconds, true, category)
  }

  endEventAtTime(key: string, milliseconds: number): void {
    if (!this.#enabled) return
    this._endEvent(key, DEFAULT_LANE, undefined, milliseconds)
  }

  /** Records an OpenUSD-style complete scope event (collector.h:253). */
  Scope(key: string, startMilliseconds: number, stopMilliseconds: number, category = 0): void {
    if (!this.#enabled) return
    const eventId = this.#nextEventId++
    this.#append(DEFAULT_LANE, new Event({
      key,
      type: EventType.Timespan,
      time: stopMilliseconds,
      startTime: startMilliseconds,
      laneId: DEFAULT_LANE,
      eventId,
      parentIsExplicit: false,
      category,
    }))
  }

  markerEvent(key: string, category = 0): number {
    if (!this.#enabled) return 0
    const time = monotonicMilliseconds()
    this.#append(DEFAULT_LANE, new Event({ key, type: EventType.Marker, time, laneId: DEFAULT_LANE, category }))
    return time
  }

  markerEventAtTime(key: string, milliseconds: number, category = 0): void {
    if (!this.#enabled) return
    this.#append(DEFAULT_LANE, new Event({ key, type: EventType.Marker, time: milliseconds, laneId: DEFAULT_LANE, category }))
  }

  recordCounterDelta(key: string, delta: number, category = 0): void {
    if (!this.#enabled) return
    this.#append(DEFAULT_LANE, new Event({
      key, type: EventType.CounterDelta, time: monotonicMilliseconds(), laneId: DEFAULT_LANE, value: delta, category,
    }))
  }

  recordCounterValue(key: string, value: number, category = 0): void {
    if (!this.#enabled) return
    this.#append(DEFAULT_LANE, new Event({
      key, type: EventType.CounterValue, time: monotonicMilliseconds(), laneId: DEFAULT_LANE, value, category,
    }))
  }

  storeData(key: string, data: TraceData): void {
    if (!this.#enabled) return
    const eventId = this.#openSpansByLane.get(DEFAULT_LANE)?.at(-1)?.eventId
    this.#append(DEFAULT_LANE, new Event({
      key, type: EventType.ScopeData, time: monotonicMilliseconds(), laneId: DEFAULT_LANE, eventId, data,
    }))
  }

  clear(): void {
    this.#eventsByLane.clear()
    this.#openSpansByLane.clear()
  }

  createCollection(): Collection {
    const collection = new Collection()
    for (const [laneId, events] of this.#eventsByLane) collection.addToCollection(laneId, events)
    this.#eventsByLane = new Map()
    // collector.cpp:242-243: every created collection is announced.
    new TraceCollectionAvailable(collection).send()
    return collection
  }

  /** Internal logical-lane entry point; not exported from the package barrel. */
  _beginEvent(
    key: string,
    laneId: string,
    parentEventId: number | undefined,
    time = monotonicMilliseconds(),
    inferParent = true,
    category = 0,
  ): SpanIdentity & { time: number } {
    const stack = this.#openSpansByLane.get(laneId) ?? []
    const parent = inferParent ? (parentEventId ?? stack.at(-1)?.eventId) : parentEventId
    const span: OpenSpan = {
      eventId: this.#nextEventId++, parentEventId: parent, laneId, key, category,
    }
    stack.push(span)
    this.#openSpansByLane.set(laneId, stack)
    this.#append(laneId, new Event({
      key, type: EventType.Begin, time, laneId, eventId: span.eventId,
      parentEventId: span.parentEventId, parentIsExplicit: true,
      category,
    }))
    return { ...span, time }
  }

  /** Internal identity-based close; it does not infer a parent function. */
  _endEvent(key: string, laneId: string, eventId: number | undefined, time = monotonicMilliseconds()): number {
    const stack = this.#openSpansByLane.get(laneId) ?? []
    const spanIndex = eventId === undefined
      ? stack.length - 1
      : stack.findIndex((span) => span.eventId === eventId)
    if (spanIndex < 0) {
      // OpenUSD v26.08 collector.cpp:155-165 records an End even when no
      // matching Begin exists; eventTreeBuilder.cpp:161-177 repairs it.
      this.#append(laneId, new Event({
        key, type: EventType.End, time, laneId, category: 0,
      }))
      return time
    }
    const span = stack[spanIndex]
    if (!span) return time
    stack.splice(spanIndex, 1)
    this.#append(laneId, new Event({
      key, type: EventType.End, time, laneId, eventId: span.eventId,
      parentEventId: span.parentEventId, parentIsExplicit: true,
      category: span.category,
    }))
    return time
  }

  _markerEvent(key: string, laneId: string, time = monotonicMilliseconds()): number {
    if (!this.#enabled) return 0
    this.#append(laneId, new Event({ key, type: EventType.Marker, time, laneId }))
    return time
  }

  _recordCounter(key: string, value: number, isDelta: boolean, laneId: string, time = monotonicMilliseconds()): void {
    if (!this.#enabled) return
    this.#append(laneId, new Event({
      key, type: isDelta ? EventType.CounterDelta : EventType.CounterValue, time, laneId, value,
    }))
  }

  _beginTimespan(
    key: string,
    laneId: string,
    parentEventId: number | undefined,
    time = monotonicMilliseconds(),
    category = 0,
  ): SpanIdentity & { time: number } {
    const stack = this.#openSpansByLane.get(laneId) ?? []
    const span: OpenSpan = {
      eventId: this.#nextEventId++, parentEventId, laneId, key, category,
    }
    stack.push(span)
    this.#openSpansByLane.set(laneId, stack)
    return { ...span, time }
  }

  /** The innermost open span on `laneId`, if any. */
  _currentSpanId(laneId: string): number | undefined {
    return this.#openSpansByLane.get(laneId)?.at(-1)?.eventId
  }

  _endTimespan(span: SpanIdentity & { time: number }, stopTime = monotonicMilliseconds()): void {
    const stack = this.#openSpansByLane.get(span.laneId) ?? []
    const index = stack.findIndex((candidate) => candidate.eventId === span.eventId)
    if (index >= 0) stack.splice(index, 1)
    this.#append(span.laneId, new Event({
      key: span.key,
      type: EventType.Timespan,
      time: stopTime,
      startTime: span.time,
      laneId: span.laneId,
      eventId: span.eventId,
      parentEventId: span.parentEventId,
      parentIsExplicit: true,
      category: span.category,
    }))
  }

  _storeData(context: Pick<SpanIdentity, 'eventId' | 'laneId'>, key: string, data: TraceData): void {
    if (!this.#enabled) return
    this.#append(context.laneId, new Event({
      key, type: EventType.ScopeData, time: monotonicMilliseconds(), laneId: context.laneId,
      eventId: context.eventId, data,
    }))
  }

  #append(laneId: string, event: Event): void {
    const events = this.#eventsByLane.get(laneId)
    if (events) events.push(event)
    else this.#eventsByLane.set(laneId, [event])
  }
}

export function GetElapsedSeconds(begin: number, end: number): number {
  return begin <= end ? (end - begin) / 1000 : 0
}

export { Collector as TraceCollector }

// JavaScript has one execution thread per realm; logical asynchronous lanes
// are provided by typescript-usd/trace/_internal.
export type TraceThreadId = string
export function TraceGetThreadId(): TraceThreadId { return DEFAULT_LANE }

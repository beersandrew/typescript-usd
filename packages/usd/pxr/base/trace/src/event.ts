// Ported from OpenUSD 26.11.1: pxr/base/trace/event.cpp,
//  pxr/base/trace/event.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// TraceEvent mirrors OpenUSD v26.08 pxr/base/trace/event.h:32. Timestamps are milliseconds from
// the runtime's monotonic clock; Chrome serialization converts them to us.

export enum EventType {
  Unknown = 'Unknown',
  Begin = 'Begin',
  End = 'End',
  Timespan = 'Timespan',
  Marker = 'Marker',
  CounterDelta = 'CounterDelta',
  CounterValue = 'CounterValue',
  ScopeData = 'ScopeData',
}

export type TraceData = string | boolean | number | bigint

export enum EventDataType {
  Invalid = 'Invalid',
  String = 'String',
  Boolean = 'Boolean',
  Int = 'Int',
  UInt = 'UInt',
  Float = 'Float',
}

export interface EventInit {
  readonly key: string
  readonly type: EventType
  readonly time: number
  readonly startTime?: number | undefined
  readonly laneId: string
  readonly eventId?: number | undefined
  readonly parentEventId?: number | undefined
  readonly parentIsExplicit?: boolean | undefined
  readonly value?: number | undefined
  readonly data?: TraceData | undefined
  readonly category?: number | undefined
}

export class Event {
  readonly key: string
  readonly type: EventType
  readonly time: number
  readonly startTime: number | undefined
  readonly laneId: string
  readonly eventId: number | undefined
  readonly parentEventId: number | undefined
  readonly parentIsExplicit: boolean
  readonly value: number | undefined
  readonly data: TraceData | undefined
  readonly category: number

  constructor(init: EventInit) {
    this.key = init.key
    this.type = init.type
    this.time = init.time
    this.startTime = init.startTime
    this.laneId = init.laneId
    this.eventId = init.eventId
    this.parentEventId = init.parentEventId
    this.parentIsExplicit = init.parentIsExplicit ?? false
    this.value = init.value
    this.data = init.data
    this.category = init.category ?? 0
  }

  getKey(): string { return this.key }
  getTimeStamp(): number { return this.time }
  // event.cpp:66-86: only a Timespan has start/end stamps; every other
  // event type reports 0 for both.
  getStartTimeStamp(): number {
    return this.type !== EventType.Timespan ? 0 : this.startTime ?? this.time
  }
  getEndTimeStamp(): number { return this.type !== EventType.Timespan ? 0 : this.time }
  getTimeSpanStamps(): readonly [number, number] { return [this.getStartTimeStamp(), this.getEndTimeStamp()] }
  getCounterValue(): number { return this.value ?? 0 }
  getCategory(): number { return this.category }
  getType(): EventType { return this.type }
}

export { Event as TraceEvent }
export type TraceEventData = TraceData

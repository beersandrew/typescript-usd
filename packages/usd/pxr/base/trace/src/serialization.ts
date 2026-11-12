// Ported from OpenUSD 26.11.1: pxr/base/trace/serialization.cpp,
//  pxr/base/trace/serialization.h, pxr/base/trace/eventTree.cpp,
//  pxr/base/trace/jsonSerialization.cpp
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// TraceSerialization, ported from OpenUSD v26.11 pxr/base/trace/serialization.cpp:17-62
// and the JSON format of jsonSerialization.cpp:66-628: a Chrome trace
// object (eventTree.cpp:251-285) whose "libTraceData" field carries the
// counter and data events Chrome's format cannot represent. Strings
// replace C++ streams at the web package boundary; timestamps are this
// package's milliseconds, written as Chrome microseconds.
import { Collection } from './collection.ts'
import { Event, EventType, type TraceData } from './event.ts'
import { EventTree } from './eventTree.ts'

type JsonValue = TraceData | null | JsonValue[] | { [key: string]: JsonValue | undefined }
type JsonObject = { [key: string]: JsonValue | undefined }

// JsWriter output for the values this format holds; bigint carries the
// uint64/int64 values JSON numbers cannot.
function writeJson(value: JsonValue | undefined): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'bigint') return value.toString()
  if (typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(writeJson).join(',')}]`
  const fields: string[] = []
  for (const [key, field] of Object.entries(value)) {
    if (field !== undefined) fields.push(`${JSON.stringify(key)}:${writeJson(field)}`)
  }
  return `{${fields.join(',')}}`
}

// JsParseStream: integers beyond double precision keep their exact value
// (js/json.cpp reads them as int64/uint64).
function parseJson(text: string): JsonValue | undefined {
  try {
    return JSON.parse(text, (_key, value: unknown, context?: { source?: string }) => {
      if (typeof value === 'number' && !Number.isSafeInteger(value) && context?.source &&
        /^-?\d+$/.test(context.source)) {
        return BigInt(context.source)
      }
      return value
    }) as JsonValue
  } catch {
    return undefined
  }
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
const getString = (js: JsonObject, key: string) => typeof js[key] === 'string' ? js[key] as string : undefined
function getNumber(js: JsonObject, key: string): number | undefined {
  const value = js[key]
  if (typeof value === 'number') return value
  if (typeof value === 'bigint') return Number(value)
  return undefined
}
// _JsGetValue<uint64_t>: a non-negative integer.
function getUInt(js: JsonObject, key: string): number | undefined {
  const value = getNumber(js, key)
  return value !== undefined && Number.isInteger(value) && value >= 0 ? value : undefined
}

// jsonSerialization.cpp:66-77: Chrome microseconds <-> trace time.
const toMicroseconds = (milliseconds: number) => milliseconds * 1000
const fromMicroseconds = (microseconds: number) => microseconds / 1000

// jsonSerialization.cpp:80-113. Note that upstream reads markers back from
// the type string "Mark", which its writer never produces.
function eventTypeToString(type: EventType): string {
  return type === EventType.ScopeData ? 'Data' : type
}
function eventTypeFromString(type: string): EventType {
  switch (type) {
    case 'Begin': return EventType.Begin
    case 'End': return EventType.End
    case 'CounterDelta': return EventType.CounterDelta
    case 'CounterValue': return EventType.CounterValue
    case 'Timespan': return EventType.Timespan
    case 'Data': return EventType.ScopeData
    case 'Mark': return EventType.Marker
    default: return EventType.Unknown
  }
}

// jsonSerialization.cpp:129-180
function traceEventToJson(event: Event): JsonObject | undefined {
  const common = { key: event.key, category: event.category, type: eventTypeToString(event.type) }
  switch (event.type) {
    case EventType.Begin:
    case EventType.End:
    case EventType.Marker:
      return { ...common, ts: toMicroseconds(event.getTimeStamp()) }
    case EventType.CounterDelta:
    case EventType.CounterValue:
      return { ...common, ts: toMicroseconds(event.getTimeStamp()), value: event.getCounterValue() }
    case EventType.ScopeData:
      return { ...common, ts: toMicroseconds(event.getTimeStamp()), data: event.data ?? null }
    case EventType.Timespan:
      return {
        ...common,
        start: toMicroseconds(event.getStartTimeStamp()),
        end: toMicroseconds(event.getEndTimeStamp()),
      }
    default:
      return undefined
  }
}

// jsonSerialization.cpp:183-329
function traceEventFromJson(value: JsonValue, threadId: string, unordered: Event[]): void {
  if (!isObject(value)) return
  const key = getString(value, 'key')
  const category = getUInt(value, 'category')
  const typeStr = getString(value, 'type')
  const tsMicroseconds = getNumber(value, 'ts')
  const ts = tsMicroseconds === undefined ? undefined : fromMicroseconds(tsMicroseconds)
  if (key === undefined || category === undefined || typeStr === undefined) return
  const type = eventTypeFromString(typeStr)
  const base = { key, laneId: threadId, category }
  switch (type) {
    case EventType.Begin:
    case EventType.End:
    case EventType.Marker:
      if (ts !== undefined) unordered.push(new Event({ ...base, type, time: ts }))
      break
    case EventType.Timespan: {
      // Upstream reads "start"/"end" as raw ticks (jsonSerialization.cpp:237-240).
      const start = getUInt(value, 'start')
      const end = getUInt(value, 'end')
      if (start !== undefined && end !== undefined) {
        unordered.push(new Event({ ...base, type, time: end, startTime: start }))
      }
      break
    }
    case EventType.CounterDelta:
    case EventType.CounterValue: {
      const counter = getNumber(value, 'value')
      if (ts !== undefined && counter !== undefined) {
        unordered.push(new Event({ ...base, type, time: ts, value: counter }))
      }
      break
    }
    case EventType.ScopeData: {
      const data = value.data
      if (ts !== undefined && data !== undefined && data !== null && typeof data !== 'object') {
        unordered.push(new Event({ ...base, type, time: ts, data }))
      }
      break
    }
    default:
      break
  }
}

// jsonSerialization.cpp:439-539
function importChromeEvents(traceEvents: readonly JsonValue[], output: Map<string, Event[]>): void {
  for (const value of traceEvents) {
    if (!isObject(value)) continue
    let tid = getString(value, 'tid')
    if (tid === undefined) {
      const utid = getUInt(value, 'tid')
      if (utid !== undefined) tid = String(utid)
    }
    const ts = getNumber(value, 'ts')
    const name = getString(value, 'name')
    const ph = getString(value, 'ph')
    const category = getUInt(value, 'libTraceCatId') ?? 0
    if (tid === undefined || ts === undefined || name === undefined || ph === undefined) continue
    const events = (): Event[] => {
      let list = output.get(tid)
      if (!list) output.set(tid, list = [])
      return list
    }
    const base = { key: name, laneId: tid, category, time: fromMicroseconds(ts) }
    if (ph === 'B') {
      events().push(new Event({ ...base, type: EventType.Begin }))
    } else if (ph === 'E') {
      events().push(new Event({ ...base, type: EventType.End }))
    } else if (ph === 'R' || ph === 'I' || ph === 'i') {
      events().push(new Event({ ...base, type: EventType.Marker }))
    } else if (ph === 'X') {
      const dur = getNumber(value, 'dur') ?? getNumber(value, 'tdur')
      if (dur !== undefined) {
        events().push(new Event({
          ...base, type: EventType.Timespan, startTime: base.time, time: fromMicroseconds(ts + dur),
        }))
      }
    }
  }
}

export class TraceSerialization {
  /**
   * serialization.cpp:17-44: writes one or more collections as one JSON
   * document, or returns undefined when there is nothing to write.
   */
  static write(collections: Collection | readonly Collection[]): string | undefined {
    const list = collections instanceof Collection ? [collections] : collections
    if (list.length === 0) return undefined
    // jsonSerialization.cpp:414-435: the Chrome object from one event tree
    // over every collection, plus the libTraceData extra field.
    const tree = EventTree.new()
    for (const collection of list) tree.add(collection)
    // jsonSerialization.cpp:336-412: counter and data events per thread,
    // threads in std::map<std::string> order.
    const eventsPerThread = new Map<string, JsonObject[]>()
    for (const collection of list) {
      collection.iterate({
        onBeginCollection() {},
        onEndCollection() {},
        onBeginThread() {},
        onEndThread() {},
        acceptsCategory: () => true,
        onEvent(threadId, _key, event) {
          if (event.type !== EventType.ScopeData && event.type !== EventType.CounterDelta &&
            event.type !== EventType.CounterValue) return
          const json = traceEventToJson(event)
          if (!json) return
          const events = eventsPerThread.get(threadId)
          if (events) events.push(json)
          else eventsPerThread.set(threadId, [json])
        },
      })
    }
    const threadEvents = [...eventsPerThread]
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([thread, events]) => ({ thread, events }))
    const chrome = tree.writeChromeTraceObject({ libTraceData: { threadEvents } })
    return writeJson(chrome as unknown as JsonObject)
  }

  /**
   * serialization.cpp:46-62 and jsonSerialization.cpp:565-628: rebuilds a
   * collection from a Chrome trace array or object; undefined when the
   * text is not JSON or holds no events.
   */
  static Read(serialized: string): Collection | undefined {
    const value = parseJson(serialized)
    if (value === undefined || value === null) return undefined
    let chromeEvents: readonly JsonValue[] | undefined
    let traceData: JsonObject | undefined
    if (isObject(value)) {
      if (Array.isArray(value.traceEvents)) chromeEvents = value.traceEvents
      if (isObject(value.libTraceData)) traceData = value.libTraceData
    } else if (Array.isArray(value)) {
      chromeEvents = value
    }
    const constructionMap = new Map<string, Event[]>()
    if (chromeEvents) importChromeEvents(chromeEvents, constructionMap)
    const threadEvents = traceData?.threadEvents
    if (Array.isArray(threadEvents)) {
      for (const thread of threadEvents) {
        if (!isObject(thread)) continue
        const threadId = getString(thread, 'thread')
        const events = thread.events
        if (threadId === undefined || !Array.isArray(events)) continue
        let unordered = constructionMap.get(threadId)
        if (!unordered) constructionMap.set(threadId, unordered = [])
        for (const event of events) traceEventFromJson(event, threadId, unordered)
      }
    }
    if (constructionMap.size === 0) return undefined
    // jsonSerialization.cpp:542-563: each thread's events sorted by time.
    const collection = new Collection()
    for (const [threadId, events] of constructionMap) {
      collection.addToCollection(threadId, [...events].sort((a, b) => a.getTimeStamp() - b.getTimeStamp()))
    }
    return collection
  }
}

// Ported from OpenUSD 26.11.1: pxr/base/trace/eventTree.cpp,
//  pxr/base/trace/eventTree.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Timeline construction and Chrome Trace serialization port
// pxr/base/trace/eventTree.cpp:252.

import { Collection } from './collection.ts'
import { TraceCategory } from './category.ts'
import { EventType, type TraceData } from './event.ts'

export class EventNode {
  readonly key: string
  readonly category: number
  beginTime: number
  endTime: number
  separateEvents: boolean
  readonly children: EventNode[] = []
  readonly attributes = new Map<string, TraceData[]>()

  constructor(key = 'root', category = 0, beginTime = 0, endTime = 0, separateEvents = true) {
    this.key = key
    this.category = category
    this.beginTime = beginTime
    this.endTime = endTime
    this.separateEvents = separateEvents
  }

  append(node: EventNode): void { this.children.push(node) }
  getKey(): string { return this.key }
  getCategory(): number { return this.category }
  getBeginTime(): number { return this.beginTime }
  getEndTime(): number { return this.endTime }
  getTimeDuration(): number { return this.endTime - this.beginTime }
  getChildren(): readonly EventNode[] { return this.children }
  isFromSeparateEvents(): boolean { return this.separateEvents }

  setBeginAndEndTimesFromChildren(): void {
    if (this.children.length === 0) {
      this.beginTime = 0
      this.endTime = 0
      return
    }
    this.beginTime = Math.min(...this.children.map(child => child.beginTime))
    this.endTime = Math.max(...this.children.map(child => child.endTime))
  }

  addAttribute(key: string, value: TraceData): void {
    const values = this.attributes.get(key)
    if (values) values.unshift(value)
    else this.attributes.set(key, [value])
  }
}

export type CounterValue = readonly [timestamp: number, value: number]
export type MarkerValue = readonly [timestamp: number, laneId: string]

interface ChromeEvent {
  cat: string
  libTraceCatId?: number
  pid: number
  tid: string | number
  name: string
  ph: 'B' | 'E' | 'X' | 'C' | 'I'
  ts: number
  dur?: number
  s?: 't'
  args?: Record<string, TraceData | TraceData[] | number>
}

function chromeTime(milliseconds: number): number { return milliseconds * 1000 }

export class EventTree {
  readonly root: EventNode
  readonly counters = new Map<string, CounterValue[]>()
  readonly markers = new Map<string, MarkerValue[]>()

  constructor(root = new EventNode()) { this.root = root }

  static new(collection?: Collection, initialCounterValues?: ReadonlyMap<string, number>): EventTree {
    const tree = new EventTree()
    if (collection) tree.#addCollection(collection, initialCounterValues)
    return tree
  }

  getRoot(): EventNode { return this.root }
  getCounters(): ReadonlyMap<string, readonly CounterValue[]> { return this.counters }
  getMarkers(): ReadonlyMap<string, readonly MarkerValue[]> { return this.markers }

  getFinalCounterValues(): Map<string, number> {
    return new Map([...this.counters].map(([key, values]) => [key, values.at(-1)?.[1] ?? 0]))
  }

  add(collection: Collection): EventTree {
    const added = EventTree.new(collection, this.getFinalCounterValues())
    this.merge(added)
    return added
  }

  merge(tree: EventTree): void {
    for (const newLane of tree.root.children) {
      const lane = this.root.children.find((node) => node.key === newLane.key)
      if (lane) lane.children.push(...newLane.children)
      else this.root.append(newLane)
    }
    for (const [key, values] of tree.counters) {
      const existing = this.counters.get(key)
      if (existing) existing.push(...values)
      else this.counters.set(key, [...values])
    }
    for (const [key, values] of tree.markers) {
      const existing = this.markers.get(key)
      if (existing) existing.push(...values)
      else this.markers.set(key, [...values])
    }
  }

  writeChromeTraceObject(extraFields: Record<string, unknown> = {}): { traceEvents: ChromeEvent[] } & Record<string, unknown> {
    const traceEvents: ChromeEvent[] = []
    for (const lane of this.root.children) {
      for (const child of lane.children) this.#writeNode(child, lane.key, traceEvents)
    }
    for (const [name, values] of this.counters) {
      for (const [timestamp, value] of values) {
        traceEvents.push({ cat: '', tid: 0, pid: 0, name, ph: 'C', ts: chromeTime(timestamp), args: { value } })
      }
    }
    for (const [name, values] of this.markers) {
      for (const [timestamp, laneId] of values) {
        traceEvents.push({ cat: '', tid: laneId, pid: 0, name, ph: 'I', s: 't', ts: chromeTime(timestamp) })
      }
    }
    return { traceEvents, ...extraFields }
  }

  #addCollection(collection: Collection, initialCounterValues: ReadonlyMap<string, number> = new Map()): void {
    const counterValues = new Map(initialCounterValues)
    const counterDeltas = new Map<string, Array<{ time: number; value: number; isDelta: boolean }>>()
    for (const laneId of collection.getThreadIds()) {
      const events = collection.getEvents(laneId)
      const beginIds = new Set(events
        .filter(event => event.type === EventType.Begin && event.eventId !== undefined)
        .map(event => event.eventId!))
      const endIds = new Set(events
        .filter(event => event.type === EventType.End && event.eventId !== undefined)
        .map(event => event.eventId!))
      // Events without collector identities (built directly into a
      // TraceEventList, or read back by TraceSerialization) take the
      // upstream time-based reconstruction below.
      const hasIncompleteScope = events.some(event =>
        (event.type === EventType.Begin && (event.eventId === undefined || !endIds.has(event.eventId))) ||
        (event.type === EventType.End && (event.eventId === undefined || !beginIds.has(event.eventId))) ||
        (event.type === EventType.Timespan && event.eventId === undefined))

      if (!hasIncompleteScope) {
        // Identity-aware construction is the web runtime analogue for
        // overlapping async siblings. Complete native Begin/End pairs produce
        // the same tree while retaining their logical parent identities.
        const lane = new EventNode(laneId)
        this.root.append(lane)
        const nodes = new Map<number, EventNode>()
        const parentById = new Map<number, { parentEventId: number | undefined; explicit: boolean }>()
        const scopeData: Array<{ eventId: number | undefined; key: string; data: TraceData }> = []
        for (const event of events) {
          if (event.type === EventType.Begin && event.eventId !== undefined) {
            nodes.set(event.eventId, new EventNode(event.key, event.category, event.time, event.time, true))
            parentById.set(event.eventId, {
              parentEventId: event.parentEventId, explicit: event.parentIsExplicit,
            })
          } else if (event.type === EventType.End && event.eventId !== undefined) {
            const node = nodes.get(event.eventId)
            if (node) node.endTime = event.time
          } else if (event.type === EventType.Timespan && event.eventId !== undefined) {
            nodes.set(event.eventId, new EventNode(
              event.key, event.category, event.getStartTimeStamp(), event.getEndTimeStamp(), false,
            ))
            parentById.set(event.eventId, {
              parentEventId: event.parentEventId, explicit: event.parentIsExplicit,
            })
          } else if (event.type === EventType.ScopeData && event.data !== undefined) {
            scopeData.push({ eventId: event.eventId, key: event.key, data: event.data })
          }
        }
        const byStart = [...nodes].sort(([, a], [, b]) =>
          a.beginTime - b.beginTime || b.endTime - a.endTime)
        for (const [eventId, node] of byStart) {
          const parentInfo = parentById.get(eventId)
          let parent = parentInfo?.parentEventId === undefined
            ? undefined
            : nodes.get(parentInfo.parentEventId)
          if (!parent && parentInfo?.explicit === false) {
            parent = byStart
              .filter(([candidateId, candidate]) =>
                candidateId !== eventId &&
                candidate.beginTime <= node.beginTime &&
                candidate.endTime >= node.endTime)
              .sort(([, a], [, b]) => a.getTimeDuration() - b.getTimeDuration())[0]?.[1]
          }
          ;(parent ?? lane).append(node)
        }
        for (const item of scopeData) {
          if (item.eventId !== undefined) nodes.get(item.eventId)?.addAttribute(item.key, item.data)
        }
        const sortNodes = (node: EventNode): void => {
          node.children.sort((a, b) => a.beginTime - b.beginTime || b.endTime - a.endTime)
          for (const child of node.children) sortNodes(child)
        }
        sortNodes(lane)
        // eventTreeBuilder.cpp:81-82: the thread root spans its children.
        lane.setBeginAndEndTimesFromChildren()
      } else {
      interface PendingNode { node: EventNode; isComplete: boolean }
      const stack: PendingNode[] = [{
        node: new EventNode(laneId, TraceCategory.Default, 0, 0, false),
        isComplete: true,
      }]
      const close = (pending: PendingNode): EventNode => {
        pending.node.children.reverse()
        return pending.node
      }
      const popAndClose = (): void => {
        const closed = close(stack.pop()!)
        stack.at(-1)!.node.append(closed)
      }

      // Ported from OpenUSD v26.08
      // pxr/base/trace/eventTreeBuilder.cpp:46-177,234-268. Event trees are
      // deliberately reconstructed in reverse so incomplete scopes acquire
      // the same synthetic bounds and nesting as native Trace.
      for (const event of [...events].reverse()) {
        if (event.type === EventType.Begin) {
          let index = stack.length - 1
          let previous = stack[index]!
          while ((previous.isComplete || previous.node.key !== event.key) && stack.length > 1) {
            index--
            if (previous.isComplete) {
              popAndClose()
              previous = stack.at(-1)!
            } else {
              previous = stack[index]!
            }
          }
          if (previous.node.key === event.key) {
            previous.node.beginTime = event.time
            previous.node.separateEvents = true
            previous.isComplete = true
          } else {
            const pending: PendingNode = {
              node: new EventNode(event.key, event.category, 0, 0, true),
              isComplete: false,
            }
            pending.node.children.push(...stack.at(-1)!.node.children.splice(0))
            for (const [key, values] of stack.at(-1)!.node.attributes) {
              pending.node.attributes.set(key, values)
            }
            stack.at(-1)!.node.attributes.clear()
            const node = close(pending)
            node.setBeginAndEndTimesFromChildren()
            // Native v26.08 serializes the leaf of a begin-only trace as an
            // empty complete event; live testTraceReports.py oracle coverage
            // protects this otherwise surprising event shape.
            if (node.children.length === 0) node.separateEvents = false
            stack.at(-1)!.node.append(node)
          }
        } else if (event.type === EventType.End) {
          let previous = stack.at(-1)!
          while (
            previous.isComplete &&
            !(event.time > previous.node.beginTime) &&
            stack.length > 1
          ) {
            popAndClose()
            previous = stack.at(-1)!
          }
          stack.push({
            node: new EventNode(event.key, event.category, 0, event.time, true),
            isComplete: false,
          })
        } else if (event.type === EventType.Timespan) {
          const start = event.getStartTimeStamp()
          const end = event.getEndTimeStamp()
          let previous = stack.at(-1)!
          while (
            (start < previous.node.beginTime || end > previous.node.endTime) &&
            stack.length > 1
          ) {
            popAndClose()
            previous = stack.at(-1)!
          }
          stack.push({
            node: new EventNode(event.key, event.category, start, end, false),
            isComplete: true,
          })
        } else if (event.type === EventType.ScopeData && event.data !== undefined) {
          let previous = stack.at(-1)!
          while (
            (event.time < previous.node.beginTime || event.time > previous.node.endTime) &&
            stack.length > 1
          ) {
            popAndClose()
            previous = stack.at(-1)!
          }
          previous.node.addAttribute(event.key, event.data)
        }
      }

      let lane: EventNode | undefined
      while (stack.length > 0) {
        const pending = stack.at(-1)!
        lane = close(pending)
        if (!pending.isComplete) lane.setBeginAndEndTimesFromChildren()
        stack.pop()
        stack.at(-1)?.node.append(lane)
      }
      lane!.setBeginAndEndTimesFromChildren()
      this.root.append(lane!)
      }

      for (const event of events) {
        if (event.type === EventType.Marker) {
          const values = this.markers.get(event.key)
          const value: MarkerValue = [event.time, laneId]
          if (values) values.push(value)
          else this.markers.set(event.key, [value])
        } else if (
          (event.type === EventType.CounterDelta || event.type === EventType.CounterValue) &&
          event.value !== undefined
        ) {
          const deltas = counterDeltas.get(event.key)
          const delta = { time: event.time, value: event.value, isDelta: event.type === EventType.CounterDelta }
          if (deltas) deltas.push(delta)
          else counterDeltas.set(event.key, [delta])
        }
      }
    }
    // counterAccumulator.cpp:21-37 and :52-71: every thread's counter events
    // for a key are ordered by timestamp (a multimap, so ties keep visit
    // order) and only then converted to absolute values.
    for (const [key, deltas] of counterDeltas) {
      deltas.sort((a, b) => a.time - b.time)
      let curValue = counterValues.get(key) ?? 0
      const values = this.counters.get(key) ?? []
      for (const delta of deltas) {
        curValue = delta.isDelta ? curValue + delta.value : delta.value
        values.push([delta.time, curValue])
      }
      this.counters.set(key, values)
      counterValues.set(key, curValue)
    }
    for (const values of this.markers.values()) values.sort((a, b) => a[0] - b[0])
  }

  #writeNode(node: EventNode, laneId: string, output: ChromeEvent[]): void {
    // eventTree.cpp:125-135: "cat" lists every name registered for the
    // node's category id.
    const cat = TraceCategory.GetInstance().getCategories(node.category).join(',')
    const common = { cat, libTraceCatId: node.category, pid: 0, tid: laneId, name: node.key }
    const args: Record<string, TraceData | TraceData[]> | undefined = node.attributes.size === 0 ? undefined : {}
    if (args) {
      for (const [key, values] of node.attributes) {
        const first = values[0]
        if (first !== undefined) args[key] = values.length === 1 ? first : values
      }
    }
    if (node.separateEvents) {
      output.push({ ...common, ph: 'B', ts: chromeTime(node.beginTime), ...(args ? { args } : {}) })
      output.push({ ...common, ph: 'E', ts: chromeTime(node.endTime) })
    } else {
      output.push({
        ...common, ph: 'X', ts: chromeTime(node.beginTime), dur: chromeTime(node.getTimeDuration()),
        ...(args ? { args } : {}),
      })
    }
    for (const child of node.children) this.#writeNode(child, laneId, output)
  }
}

export { EventNode as TraceEventNode, EventTree as TraceEventTree }

// Ported from OpenUSD v26.08 pxr/base/trace/eventTreeBuilder.h:23-61.
export class Trace_EventTreeBuilder {
  build(collection: Collection): EventTree { return EventTree.new(collection) }
}

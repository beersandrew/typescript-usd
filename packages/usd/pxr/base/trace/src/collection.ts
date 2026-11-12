// Ported from OpenUSD 26.11.1: pxr/base/trace/collection.cpp,
//  pxr/base/trace/collection.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// TraceCollection mirrors pxr/base/trace/collection.h:27: ordered event
// lists are owned per upstream thread (a logical lane in this runtime).

import type { Event } from './event.ts'

export interface CollectionVisitor {
  onBeginCollection(): void
  onEndCollection(): void
  onBeginThread(threadId: string): void
  onEndThread(threadId: string): void
  acceptsCategory(categoryId: number): boolean
  onEvent(threadId: string, key: string, event: Event): void
}

function compareThreadIds(a: string, b: string): number {
  if (a.length !== b.length) return a.length - b.length
  return a < b ? -1 : a > b ? 1 : 0
}

export class Collection {
  readonly #eventsPerLane = new Map<string, Event[]>()

  addToCollection(laneId: string, events: readonly Event[]): void {
    if (events.length === 0) return
    const existing = this.#eventsPerLane.get(laneId)
    if (existing) existing.push(...events)
    else this.#eventsPerLane.set(laneId, [...events])
  }

  iterate(visitor: CollectionVisitor): void { this.#iterate(visitor, false) }
  reverseIterate(visitor: CollectionVisitor): void { this.#iterate(visitor, true) }

  // collection.h:119 keeps threads in a std::map ordered by
  // TraceThreadId::operator< (threads.cpp:39-47): shorter ids first, then
  // lexicographically.
  getThreadIds(): string[] { return [...this.#eventsPerLane.keys()].sort(compareThreadIds) }
  getEvents(threadId: string): readonly Event[] { return this.#eventsPerLane.get(threadId) ?? [] }
  get empty(): boolean { return this.#eventsPerLane.size === 0 }

  #iterate(visitor: CollectionVisitor, reverse: boolean): void {
    // collection.cpp:49-69: threads are always visited in map order; only
    // the events within each thread are reversed.
    visitor.onBeginCollection()
    for (const laneId of this.getThreadIds()) {
      const source = this.#eventsPerLane.get(laneId)!
      visitor.onBeginThread(laneId)
      const events = reverse ? [...source].reverse() : source
      for (const event of events) {
        if (visitor.acceptsCategory(event.category)) visitor.onEvent(laneId, event.key, event)
      }
      visitor.onEndThread(laneId)
    }
    visitor.onEndCollection()
  }
}

export { Collection as TraceCollection }
export type TraceThreadId = string
export type TraceKey = string

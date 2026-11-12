// Ported from OpenUSD 26.11.1: pxr/base/trace/eventContainer.cpp,
//  pxr/base/trace/eventContainer.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.08 pxr/base/trace/eventContainer.h:28.
import { Event, type EventInit } from './event.ts'

export class TraceEventContainer implements Iterable<Event> {
  readonly #events: Event[] = []
  get empty(): boolean { return this.#events.length === 0 }
  get size(): number { return this.#events.length }
  emplaceBack(event: Event | EventInit): Event {
    const value = event instanceof Event ? event : new Event(event)
    this.#events.push(value)
    return value
  }
  append(other: TraceEventContainer): void {
    this.#events.push(...other.#events)
    other.#events.length = 0
  }
  [Symbol.iterator](): Iterator<Event> { return this.#events[Symbol.iterator]() }
  reverse(): Iterable<Event> { return [...this.#events].reverse() }
}

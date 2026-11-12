// Ported from OpenUSD 26.11.1: pxr/base/trace/testenv/testTraceCategory.cpp
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11 pxr/base/trace/testenv/testTraceCategory.cpp. A
// custom category's counter events are collected by a reporter that listens
// for TraceCollectionAvailable and only accepts that category.

import { describe, expect, it } from 'vitest'
import { Notice as TfNotice } from 'typescript-usd/tf'
import {
  Collector, EventType, TraceCategory, TraceCollectionAvailable,
  type CollectionVisitor, type TraceCategoryId, type TraceEvent,
} from '../../src/index.ts'

// testTraceCategory.cpp:14-20
const PerfCategory = {
  getId(): TraceCategoryId { return TraceCategory.createTraceCategoryId('CustomPerfCounter') },
}

// testTraceCategory.cpp:22-31
function TestCounters(): void {
  const collector = Collector.GetInstance()
  collector.beginEvent('TestScope', PerfCategory.getId())
  collector.recordCounterDelta('Test Counter 1', 1, PerfCategory.getId())
  collector.endEvent('TestScope')
  // TRACE_COUNTER_DELTA records in the default category.
  collector.recordCounterDelta('Default Category counter', 1)
}

// testTraceCategory.cpp:33-84
class PerfReporter implements CollectionVisitor {
  readonly counters = new Map<string, number>()
  readonly key = TfNotice.Register(TraceCollectionAvailable, notice => this._onCollection(notice))

  acceptsCategory(id: TraceCategoryId): boolean { return id === PerfCategory.getId() }
  onEvent(_threadId: string, key: string, e: TraceEvent): void {
    if (e.getType() !== EventType.CounterDelta) return
    this.counters.set(key, (this.counters.get(key) ?? 0) + e.getCounterValue())
  }
  onBeginCollection(): void {}
  onEndCollection(): void {}
  onBeginThread(): void {}
  onEndThread(): void {}

  hasCounter(key: string): boolean { return this.counters.has(key) }
  getCounterValue(key: string): number { return this.counters.get(key) ?? 0 }

  private _onCollection(notice: TraceCollectionAvailable): void {
    notice.getCollection().iterate(this)
  }
}

describe('testTraceCategory', () => {
  it('filters collection events by a custom category', () => {
    // testTraceCategory.cpp:86-109
    const perfReporter = new PerfReporter()
    try {
      TraceCategory.GetInstance().registerCategory(PerfCategory.getId(), 'CustomPerfCounter')

      const collector = Collector.GetInstance()
      collector.clear()
      collector.setEnabled(true)
      for (let i = 0; i < 3; i++) TestCounters()
      collector.setEnabled(false)
      // This will trigger processing by the custom reporter
      collector.createCollection()

      // Make sure we found events for the custom counter
      expect(perfReporter.hasCounter('Test Counter 1')).toBe(true)
      expect(perfReporter.getCounterValue('Test Counter 1')).toBe(3.0)

      // Make sure default category events were filtered out
      expect(perfReporter.hasCounter('Default Category counter')).toBe(false)
    } finally {
      perfReporter.key.revoke()
    }
  })
})

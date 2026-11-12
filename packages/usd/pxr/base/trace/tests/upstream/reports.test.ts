// Ported from OpenUSD 26.11.1: pxr/base/trace/testenv/testTraceReports.py
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11 pxr/base/trace/testenv/testTraceReports.py. The
// upstream script records complete, begin-only, end-only and partial traces
// with live timestamps and prints their text and Chrome reports without
// assertions; the first case below runs exactly that. The second records
// the same sequences at fixed times and compares both reports with the
// native build's output (fixtures/testTraceReports; FIXTURES.md).

import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { Collector, Reporter } from '../../src/index.ts'

type Operation = readonly ['B' | 'E', string, number]
interface Expected { operations: Operation[]; report: string; chrome: unknown }
const fixture = JSON.parse(readFileSync(
  new URL('./fixtures/testTraceReports/expected.json', import.meta.url), 'utf8')) as {
  payload: Record<string, Expected>
}

const gc = Collector.GetInstance()
const gr = Reporter.globalReporter

// testTraceReports.py:16-38
function FullTrace(): void {
  gc.beginEvent('A'); gc.beginEvent('B'); gc.beginEvent('C')
  gc.endEvent('C'); gc.endEvent('B'); gc.endEvent('A')
}
function BeginOnlyTrace(): void { gc.beginEvent('A'); gc.beginEvent('B'); gc.beginEvent('C') }
function EndOnlyTrace(): void { gc.endEvent('C'); gc.endEvent('B'); gc.endEvent('A') }
function PartialTrace(): void {
  gc.beginEvent('C'); gc.endEvent('C'); gc.endEvent('B'); gc.endEvent('A')
}
const traces = { FullTrace, BeginOnlyTrace, EndOnlyTrace, PartialTrace }

describe('testTraceReports', () => {
  afterEach(() => {
    gc.setEnabled(false)
    gc.clear()
    gr.clearTree()
    gr.shouldAdjustForOverheadAndNoise = true
  })

  it('reports complete, begin-only, end-only and partial traces', () => {
    // testTraceReports.py:40-66
    for (const trace of Object.values(traces)) {
      gc.enabled = true
      trace()
      gc.enabled = false
      const report = gr.report()
      gr.clearTree()
      for (const key of ['A', 'B', 'C']) expect(report).toContain(` ${key}\n`)
    }
    // testTraceReports.py:69-95
    for (const trace of Object.values(traces)) {
      gc.enabled = true
      trace()
      gc.enabled = false
      const chrome = JSON.parse(gr.reportChromeTracing()) as { traceEvents: Array<{ name: string }> }
      gr.clearTree()
      expect(new Set(chrome.traceEvents.map(e => e.name))).toEqual(new Set(['A', 'B', 'C']))
    }
  })

  it.each(Object.keys(traces))('%s matches the native text and Chrome reports at fixed times', name => {
    const expected = fixture.payload[name]!
    const record = () => {
      gc.clear()
      gc.enabled = true
      for (const [kind, key, t] of expected.operations) {
        if (kind === 'B') gc.beginEventAtTime(key, t)
        else gc.endEventAtTime(key, t)
      }
      gc.enabled = false
    }
    gr.shouldAdjustForOverheadAndNoise = false
    record()
    expect(gr.report()).toBe(expected.report)
    gr.clearTree()
    record()
    expect(JSON.parse(gr.reportChromeTracing())).toEqual(expected.chrome)
    gr.clearTree()
  })
})

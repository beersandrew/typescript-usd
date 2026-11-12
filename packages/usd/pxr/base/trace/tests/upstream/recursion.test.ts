// Ported from OpenUSD 26.11.1: pxr/base/trace/testenv/testTraceRecursion.py
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11 pxr/base/trace/testenv/testTraceRecursion.py,
// registered (pxr/base/trace/CMakeLists.txt) as seven tests that share the
// script and each DIFF_COMPARE one report against
// testenv/testTraceRecursion.testenv/baseline/:
//   testTraceRecursion1  recursion_5begins.out
//   testTraceRecursion2  recursion_typical.out
//   testTraceRecursion3  recursion_newnode.out
//   testTraceRecursion4  recursion_inner.out
//   testTraceRecursion5  recursion_1817.out
//   testTraceRecursion6  recursion_branch.out
//   testTraceRecursion7  recursion_marker_merge.out
// The script's event sequences are extracted into
// fixtures/testTraceRecursion/operations.json; those seven .out fixtures are
// byte-identical to the upstream baselines. recursion_timing.out, which no
// registration compares, is the file the script writes when run against the
// v26.11.1 reference build (its checked-in baseline is stale).

import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { Collector, Reporter } from '../../src/index.ts'

type Operation = readonly ['begin' | 'end', string, number]
const fixtures = new URL('./fixtures/testTraceRecursion/', import.meta.url)
const cases = JSON.parse(readFileSync(new URL('operations.json', fixtures), 'utf8')) as
  Array<{ name: string, operations: Operation[] }>

describe('testTraceRecursion.py', () => {
  const collector = Collector.GetInstance()
  beforeEach(() => { collector.enabled = false; collector.clear() })

  it.each(cases)('$name folds recursive calls like the v26.08 report', ({ name, operations }) => {
    const reporter = new Reporter('recursion')
    reporter.shouldAdjustForOverheadAndNoise = false
    reporter.foldRecursiveCalls = true
    collector.enabled = true
    for (const [kind, key, time] of operations) {
      if (kind === 'begin') collector.beginEventAtTime(key, time)
      else collector.endEventAtTime(key, time)
    }
    collector.enabled = false
    const expected = readFileSync(new URL(`${name}.out`, fixtures), 'utf8')
    // WriteReport reports twice: folding again must not change the output.
    expect(reporter.report()).toBe(expected)
    expect(reporter.report()).toBe(expected)
    reporter.clearTree()
    collector.clear()
  })

  it('keeps the collected counts intact while folding', () => {
    const reporter = new Reporter('recursion')
    reporter.shouldAdjustForOverheadAndNoise = false
    reporter.foldRecursiveCalls = true
    collector.enabled = true
    for (const [kind, key, time] of cases.find(c => c.name === 'recursion_typical')!.operations) {
      if (kind === 'begin') collector.beginEventAtTime(key, time)
      else collector.endEventAtTime(key, time)
    }
    collector.enabled = false
    reporter.report()
    const a = reporter.aggregateTreeRoot.getChild('Main Thread')!.getChild('R')!.getChild('A')!
    expect(a.isRecursionHead()).toBe(true)
    expect(a.getCount()).toBe(1)
    expect(a.getCount(true)).toBe(2)
    const marker = a.getChild('B')!.getChild('C')!.getChild('A')!
    expect(marker.isRecursionMarker()).toBe(true)
    expect(marker.getCount()).toBe(1)
  })
})

// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdSt/testenv/testHdStSubdivision.cpp
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// testHdStSubdivision (pxr/imaging/hdSt/testenv/testHdStSubdivision.cpp,
// OpenUSD 26.11.1) through the port in testHdStSubdivision.ts, compared with
// the registered test's stdout baseline
// (testenv/testHdStSubdivisionOsd3/baseline/testHdStSubdivisionOsd3-Run1-stdout.txt,
// copied to tests/fixtures/testHdStSubdivision/).
//
// Mock-registry test: the registry runs over the recording test Hgi
// (tests/bufferTestHgi.ts), which keeps buffer bytes on the CPU but has no
// compute pipelines, so the "(GPU)" calls (GPU subdivision through the
// evalStencils compute shader) are skipped here
// (PLATFORM-DIVERGENCE(hdst-node-no-gpu-compute), tests/bufferTestHgi.ts).
// They run in Safari with HgiWebGPU and are compared with the same baseline
// there: tests/browser/storm-image/hdst-gpu/run.mjs.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CreateTestRegistry, GpuComputeUnavailable, ReadData } from './meshTopologyTestUtils.ts'
import { RunTestHdStSubdivision, type SubdivisionRun } from './testHdStSubdivision.ts'

const baseline = readFileSync(new URL(
  '../fixtures/testHdStSubdivision/testHdStSubdivisionOsd3-Run1-stdout.txt', import.meta.url), 'utf8')
const baselineLines = baseline.split('\n')

let run: Promise<SubdivisionRun> | null = null
const getRun = (): Promise<SubdivisionRun> =>
  (run ??= RunTestHdStSubdivision(CreateTestRegistry, (range, name) => ReadData(range, name)))

// The calls in upstream order, each a fixed number of output lines.
const callLabels = [
  'SubdivisionTest triangle rightHanded (CPU)', 'SubdivisionTest triangle rightHanded (GPU)',
  'SubdivisionTest triangle leftHanded (CPU)', 'SubdivisionTest triangle leftHanded (GPU)',
  'SubdivisionTest quad (CPU)', 'SubdivisionTest quad (GPU)',
  'SubdivisionTest polygons (CPU)', 'SubdivisionTest polygons (GPU)',
  'LoopSubdivisionTest triangle (CPU)', 'LoopSubdivisionTest triangle (GPU)',
  'PrimitiveIDMappingTest usePtexIndex=true', 'PrimitiveIDMappingTest usePtexIndex=false',
  'SubdivTagTest (CPU)', 'SubdivTagTest (GPU)',
  'SubdivTagTest2 (CPU)', 'SubdivTagTest2 (GPU)',
  'InvalidTopologyTest (CPU)', 'InvalidTopologyTest (GPU)',
  'EmptyTopologyTest (CPU)', 'EmptyTopologyTest (GPU)',
  'TorusTopologyTest (CPU)', 'TorusTopologyTest (GPU)',
]

// Where each call's output starts in the baseline: a _DumpRefinedPoints
// call writes 8 lines from its "Test <name>" line, a PrimitiveIDMappingTest
// call 4 lines after its "PrimitiveIDMap Test" header.
const expectedSegments: string[][] = []
baselineLines.forEach((line, i) => {
  if (line.startsWith('Test ')) expectedSegments.push(baselineLines.slice(i, i + 8))
  if (line === 'PrimitiveIDMap Test') expectedSegments.push(baselineLines.slice(i + 1, i + 5))
})

describe('testHdStSubdivision (registry over the recording test Hgi)', () => {
  for (const label of callLabels) {
    // EmptyTopologyTest (GPU) refines nothing, so it dispatches no
    // computation and runs in Node too.
    it.skipIf(GpuComputeUnavailable && label.endsWith('(GPU)') &&
      label !== 'EmptyTopologyTest (GPU)')(label, async () => {
      const { calls } = await getRun()
      const c = calls.find((x) => x.label === label)!
      expect(c.exception).toBeNull()
      expect(c.lines).toEqual(expectedSegments[callLabels.indexOf(label)])
      expect(c.counterFailures).toEqual([])
    })
  }
  it('ends OK with a clean error mark', async () => {
    const r = await getRun()
    expect(r.errorMarkClean).toBe(true)
    expect(expectedSegments.length).toBe(callLabels.length)
  })
})

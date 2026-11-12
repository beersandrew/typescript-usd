// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdSt/testenv/testHdStQuadrangulation.cpp
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/imaging/hdSt/testenv/testHdStQuadrangulation.cpp (OpenUSD 26.11.1).
//
// Each upstream comparison runs twice:
// - "(registry)": the upstream flow, committed through an HdStResourceRegistry
//   and read back with HdBufferArrayRange::ReadData. Upstream uses the render
//   index's registry over the platform Hgi (testHdStQuadrangulation.cpp:686-715); here the
//   registry runs over the recording test Hgi (tests/bufferTestHgi.ts), which
//   keeps buffer bytes on the CPU but has no compute pipelines, so the cases
//   that run a GPU computation ("GPU quadrangulation") are skipped in Node
//   (PLATFORM-DIVERGENCE(hdst-node-no-gpu-compute)); they run in Safari over
//   HgiWebGPU with tests/browser/storm-image/hdst-gpu/run.mjs (read-back through
//   ReadDataAsync).
// - "(cpu)": the CPU computations resolved directly, checking the resolved
//   sources and the quadrangulation perf counters the computations count.

import { describe, expect, it } from 'vitest'
import { TfErrorMark } from 'typescript-usd/tf'
import { SdfPath } from 'typescript-usd/sdf/path'
import type { Array as VtArray } from 'typescript-usd/vt'
import {
  MeshTopology as HdMeshTopology,
  VtBufferSource as HdVtBufferSource,
  Tokens as HdTokens,
  PerfTokens as HdPerfTokens,
  PerfLog as HdPerfLog,
  Type as HdType,
  BufferArrayUsageHintBits as HdBufferArrayUsageHintBits,
  type BufferSource as HdBufferSource,
} from 'typescript-usd/hd'
import { HdSt_MeshTopology } from '../../src/meshTopology.ts'
import {
  CreateTestRegistry, ReadDataAsync, Vec3fArray, SourceComponents, ArrayComponents,
  ExpectClose3, VtValue, GpuComputeUnavailable, type TestRegistry,
} from './meshTopologyTestUtils.ts'

// testHdStQuadrangulation.cpp:34-39
const _tokens = { bilinear: 'bilinear', leftHanded: 'leftHanded', rightHanded: 'rightHanded' }

// HdStComputeQueueZero (hdSt/resourceRegistry.h)
const HdStComputeQueueZero = 0

type Vec3 = readonly number[]

interface QuadCase {
  label: string, name: string, orientation: string, numVerts: number[], verts: number[],
  points: Vec3[], holes: number[], expectedIndices: number[], expectedPoints: Vec3[]
  // perf counters after the CPU / GPU runs: [quadrangulateCPU,
  // quadrangulateGPU, quadrangulatedVerts, bufferSourcesResolved,
  // computationsCommitted]
  cpuCounters: number[], gpuCounters: number[]
}

const _sixPoints: Vec3[] = [
  [1, 1, 0], [0, 0, 0], [1, 0, 0], [2, 0, 0], [2, 1, 0], [3, 0, 0], [3, 0.5, 0], [3, 1, 0],
]
const _polygonsExpectedPoints: Vec3[] = [
  ..._sixPoints,
  [0.5, 0.5, 0], [0.5, 0, 0], [1, 0.5, 0], [0.666667, 0.333333, 0],
  [2, 0.5, 0], [2.5, 0, 0], [3, 0.25, 0], [3, 0.75, 0], [2.5, 1, 0], [2.6, 0.5, 0],
]

// QuadrangulationTest (testHdStQuadrangulation.cpp:238-584)
const quadrangulationCases: QuadCase[] = [
  // testHdStQuadrangulation.cpp:252-311
  { label: 'triangle rightHanded', name: 'triangle', orientation: _tokens.rightHanded,
    numVerts: [3], verts: [0, 1, 2], holes: [],
    points: [[0, 1, 0], [-1, 0, 0], [1, 0, 0]],
    expectedPoints: [[0, 1, 0], [-1, 0, 0], [1, 0, 0], [-0.5, 0.5, 0], [0, 0, 0], [0.5, 0.5, 0], [0, 1 / 3, 0]],
    expectedIndices: [0, 3, 6, 5, 1, 4, 6, 3, 2, 5, 6, 4],
    cpuCounters: [1, 0, 4, 3, 0], gpuCounters: [0, 1, 4, 3, 1] },
  // testHdStQuadrangulation.cpp:312-371
  { label: 'triangle leftHanded', name: 'triangle', orientation: _tokens.leftHanded,
    numVerts: [3], verts: [0, 1, 2], holes: [],
    points: [[0, 1, 0], [-1, 0, 0], [1, 0, 0]],
    expectedPoints: [[0, 1, 0], [-1, 0, 0], [1, 0, 0], [-0.5, 0.5, 0], [0, 0, 0], [0.5, 0.5, 0], [0, 1 / 3, 0]],
    expectedIndices: [0, 5, 6, 3, 1, 3, 6, 4, 2, 4, 6, 5],
    cpuCounters: [1, 0, 4, 3, 0], gpuCounters: [0, 1, 4, 3, 1] },
  // testHdStQuadrangulation.cpp:372-416
  { label: 'quad', name: 'quad', orientation: _tokens.rightHanded,
    numVerts: [4], verts: [0, 1, 2, 3], holes: [],
    points: [[1, 1, 0], [-1, 1, 0], [-1, -1, 0], [1, -1, 0]],
    expectedPoints: [[1, 1, 0], [-1, 1, 0], [-1, -1, 0], [1, -1, 0]],
    expectedIndices: [0, 1, 2, 3],
    cpuCounters: [0, 0, 0, 2, 0], gpuCounters: [0, 0, 0, 3, 0] },
  // testHdStQuadrangulation.cpp:417-498
  { label: 'polygons', name: 'quad', orientation: _tokens.rightHanded,
    numVerts: [3, 4, 5], verts: [0, 1, 2, 0, 2, 3, 4, 4, 3, 5, 6, 7], holes: [],
    points: _sixPoints, expectedPoints: _polygonsExpectedPoints,
    expectedIndices: [0, 8, 11, 10, 1, 9, 11, 8, 2, 10, 11, 9, 0, 2, 3, 4,
      4, 12, 17, 16, 3, 13, 17, 12, 5, 14, 17, 13, 6, 15, 17, 14, 7, 16, 17, 15],
    cpuCounters: [1, 0, 10, 3, 0], gpuCounters: [0, 1, 10, 3, 1] },
  // testHdStQuadrangulation.cpp:499-582
  { label: 'polygons with hole', name: 'quad', orientation: _tokens.rightHanded,
    numVerts: [3, 4, 5], verts: [0, 1, 2, 0, 2, 3, 4, 4, 3, 5, 6, 7], holes: [1],
    points: _sixPoints, expectedPoints: _polygonsExpectedPoints,
    expectedIndices: [0, 8, 11, 10, 1, 9, 11, 8, 2, 10, 11, 9,
      4, 12, 17, 16, 3, 13, 17, 12, 5, 14, 17, 13, 6, 15, 17, 14, 7, 16, 17, 15],
    cpuCounters: [1, 0, 10, 3, 0], gpuCounters: [0, 1, 10, 3, 1] },
]

// QuadrangulationInvalidTopologyTest (testHdStQuadrangulation.cpp:586-683)
const invalidTopologyCase: QuadCase = {
  label: 'invalid topology', name: 'quad', orientation: _tokens.rightHanded,
  numVerts: [3, 4, 5], verts: [0, 1, 2, 0, 2, 3, 4], holes: [],
  points: _sixPoints,
  expectedPoints: [
    [1, 1, 0], [0, 0, 0], [1, 0, 0], [2, 0, 0], [2, 1, 0],
    [0.5, 0.5, 0], [0.5, 0, 0], [1, 0.5, 0], [0.666667, 0.333333, 0],
    [1, 1, 0], [1, 1, 0], [1, 1, 0], [1, 1, 0], [1, 1, 0], [1, 1, 0],
  ],
  expectedIndices: [0, 5, 8, 7, 1, 6, 8, 5, 2, 7, 8, 6, 0, 2, 3, 4,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  cpuCounters: [1, 0, 10, 3, 0], gpuCounters: [0, 1, 10, 3, 1],
}

const _counterTokens = [
  HdPerfTokens.quadrangulateCPU, HdPerfTokens.quadrangulateGPU,
  HdPerfTokens.quadrangulatedVerts, HdPerfTokens.bufferSourcesResolved,
  HdPerfTokens.computationsCommitted,
]

/** _CompareQuadPoints (testHdStQuadrangulation.cpp:68-196) */
async function _CompareQuadPoints(registry: TestRegistry, c: QuadCase, gpu: boolean): Promise<void> {
  const m = new HdMeshTopology(_tokens.bilinear, c.orientation, c.numVerts, c.verts)

  m.setHoleIndices(c.holes)

  // Convert topology to render delegate version
  const rdTopology = HdSt_MeshTopology.new(m, 0)
  const id = SdfPath.fromString(c.name)

  // build quadinfo
  const quadInfoBuilder = rdTopology.getQuadInfoBuilderComputation(gpu, id, registry)
  registry.addSource(quadInfoBuilder)

  // allocate index buffer
  const quadIndex = rdTopology.getQuadIndexBuilderComputation(id)
  const indexRange = registry.allocateNonUniformBufferArrayRange(
    HdTokens.topology, quadIndex.getBufferSpecs(),
    HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsIndex)

  registry.addSource(indexRange, quadIndex)

  // execute
  registry.commit()

  // index compare
  const resultValue = await ReadDataAsync(indexRange, HdTokens.indices)
  const result = resultValue.Get<VtArray<number>>()
  expect(result.getElementType().getTypeName()).toBe('int')
  expect(ArrayComponents(result)).toEqual(c.expectedIndices)

  // quadrangulate points
  const pointsSource = new HdVtBufferSource(HdTokens.points, VtValue.createArray(Vec3fArray(c.points)))

  const usageHint = HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsVertex |
    HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsStorage
  const pointsRange = registry.allocateNonUniformBufferArrayRange(HdTokens.points,
    pointsSource.getBufferSpecs(), usageHint)

  if (gpu) {
    if (c.points.length === c.expectedPoints.length) {
      // all quads. GPU table has to be deallocated.
      expect(rdTopology.getQuadrangulateTableRange()).toBeNull()
    } else {
      expect(rdTopology.getQuadrangulateTableRange()).not.toBeNull()
    }

    const comp = rdTopology.getQuadrangulateComputationGPU(
      pointsSource.getName(),
      pointsSource.getTupleType().type,
      id)
    if (comp) {
      registry.addComputation(pointsRange, comp, HdStComputeQueueZero)
    }
    registry.addSource(pointsRange, pointsSource)
  } else {
    const comp = rdTopology.getQuadrangulateComputation(pointsSource, id)
    if (comp) {
      registry.addSource(pointsRange, comp)
    } else {
      // all-quads
      registry.addSource(pointsRange, pointsSource)
    }
  }

  registry.commit()

  // retrieve result
  const ptResult = (await ReadDataAsync(pointsRange, HdTokens.points)).Get<VtArray<unknown>>()
  expect(ptResult.getElementType().getTypeName()).toBe('GfVec3f')
  ExpectClose3(ArrayComponents(ptResult), c.expectedPoints)
}

/** _CompareQuadPoints with gpu = false, resolving the computations
 *  directly instead of committing them. */
function _CompareQuadPointsCPU(c: QuadCase): void {
  const m = new HdMeshTopology(_tokens.bilinear, c.orientation, c.numVerts, c.verts)
  m.setHoleIndices(c.holes)
  const rdTopology = HdSt_MeshTopology.new(m, 0)
  const id = SdfPath.fromString(c.name)

  const quadInfoBuilder = rdTopology.getQuadInfoBuilderComputation(false, id)
  const quadIndex = rdTopology.getQuadIndexBuilderComputation(id)
  // The index builder waits for the quad info builder.
  expect(quadIndex.resolve()).toBe(false)
  expect(quadInfoBuilder.resolve()).toBe(true)
  expect(quadIndex.resolve()).toBe(true)

  // quad indices are VtIntArray with arraySize 4 (quadrangulate.cpp:186-189)
  expect(quadIndex.getTupleType()).toEqual({ type: HdType.HdTypeInt32, count: 4 })
  expect(SourceComponents(quadIndex, Int32Array)).toEqual(c.expectedIndices)

  const pointsSource = new HdVtBufferSource(HdTokens.points, VtValue.createArray(Vec3fArray(c.points)))
  const comp = rdTopology.getQuadrangulateComputation(pointsSource, id)
  let result: HdBufferSource = pointsSource
  if (comp) {
    expect(comp.resolve()).toBe(true)
    result = comp
  }
  expect(result.getTupleType()).toEqual({ type: HdType.HdTypeFloatVec3, count: 1 })
  ExpectClose3(SourceComponents(result, Float32Array), c.expectedPoints)
}

function _ExpectCounters(expected: number[], tokens = _counterTokens): void {
  const perfLog = HdPerfLog.GetInstance()
  expect(tokens.map(t => perfLog.getCounter(t))).toEqual(expected.slice(0, tokens.length))
}

/** Run under a TfErrorMark that must stay clean
 *  (testHdStQuadrangulation.cpp:691, 706). */
async function _Clean(fn: () => unknown): Promise<void> {
  const mark = new TfErrorMark()
  await fn()
  expect(mark.isClean()).toBe(true)
}

function _ResetCounters(): void {
  const perfLog = HdPerfLog.GetInstance()
  perfLog.enable()
  perfLog.resetCounters()
}

describe('testHdStQuadrangulation (cpu)', () => {
  for (const c of [...quadrangulationCases, invalidTopologyCase]) {
    it(`${c.label}`, () => _Clean(() => {
      _ResetCounters()
      _CompareQuadPointsCPU(c)
      // quadrangulateCPU, quadrangulateGPU, quadrangulatedVerts
      _ExpectCounters(c.cpuCounters, _counterTokens.slice(0, 3))
    }))
  }
})

describe('testHdStQuadrangulation (registry)', () => {
  // QuadrangulationTest (testHdStQuadrangulation.cpp:238-584) and
  // QuadrangulationInvalidTopologyTest (testHdStQuadrangulation.cpp:586-683):
  // each case runs CPU quadrangulation, then GPU quadrangulation, checking
  // the perf counters after each.
  for (const c of [...quadrangulationCases, invalidTopologyCase]) {
    it(`${c.label} (CPU quadrangulation)`, () => _Clean(async () => {
      const registry = CreateTestRegistry()
      _ResetCounters()
      _ExpectCounters([0, 0, 0, 0, 0])
      await _CompareQuadPoints(registry, c, false)
      _ExpectCounters(c.cpuCounters)
    }))
    // Skipped in Node, run in Safari
    // (PLATFORM-DIVERGENCE(hdst-node-no-gpu-compute), tests/bufferTestHgi.ts);
    // the all-quad mesh dispatches no computation and runs in Node too.
    it.skipIf(GpuComputeUnavailable && c.label !== 'quad')(`${c.label} (GPU quadrangulation)`, () => _Clean(async () => {
      const registry = CreateTestRegistry()
      _ResetCounters()
      await _CompareQuadPoints(registry, c, true)
      _ExpectCounters(c.gpuCounters)
    }))
  }
})

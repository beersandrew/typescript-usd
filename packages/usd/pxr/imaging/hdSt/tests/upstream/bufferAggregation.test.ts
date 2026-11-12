// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdSt/testenv/testHdStBufferAggregation.cpp
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/testenv/testHdStBufferAggregation.cpp
// (OpenUSD 26.11.1). Upstream runs over a platform Hgi with a GL context;
// here the registry runs over the recording test Hgi (tests/bufferTestHgi.ts),
// which keeps buffer contents on the CPU, so ReadData reads back what the
// recorded blits wrote. The assertions are upstream's TF_VERIFYs, in order,
// and its clean error mark; `range.reset()` / dropping a prim is the range
// expiring: the test's shared_ptr is the range's only holder, counted from
// the allocation (hd/src/bufferArrayRange.ts, FAITHFULNESS-DEBT(
// hd-bar-shared-ptr): a range no holder retained never expires, so
// retaining it as it is dropped counts the same holder).
//
// Environment as registered upstream (CMakeLists.txt:2190-2196):
// TF_DEBUG=HD_SAFE_MODE, HD_MAX_VBO_SIZE=2^28. OverAggregationTest alone runs
// with HD_MAX_VBO_SIZE=2^20 so its 50 ranges of 1/8 of the maximum size fit
// in a Node test's memory; its expected counts are upstream's formulas of
// that size (testHdStBufferAggregation.cpp:836-848).

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Matrix4d as GfMatrix4d, Vec3f as GfVec3f } from 'typescript-usd/gf'
import { Debug as TfDebug, TfErrorMark, TfGetEnvSetting } from 'typescript-usd/tf'
import { Array as VtArray, Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import {
  BufferArrayUsageHintBits as HdBufferArrayUsageHintBits,
  DebugCodes as HdDebugCodes,
  PerfLog as HdPerfLog,
  PerfTokens as HdPerfTokens,
  Tokens as HdTokens,
  Type as HdType,
  VtBufferSource as HdVtBufferSource,
  type BufferArrayRange as HdBufferArrayRange,
  type BufferSource as HdBufferSource,
  type BufferSpec as HdBufferSpec,
  type ResourceRegistry as HdResourceRegistry,
} from 'typescript-usd/hd'
import type { HdStBufferArrayRange } from '../../src/bufferArrayRange.ts'
import { HdStComputation } from '../../src/computation.ts'
import { HdStComputeQueue, HdStResourceRegistry } from '../../src/resourceRegistry.ts'
import { HdStPerfTokens } from '../../src/tokens.ts'
import { HD_MAX_VBO_SIZE } from '../../src/vboMemoryManager.ts'
import { HdStVBOSimpleMemoryManager } from '../../src/vboSimpleMemoryManager.ts'
import { HgiDeviceCapabilitiesBits } from 'typescript-usd/hgi'
import { BufferTestHgi } from '../bufferTestHgi.ts'

const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env
const {
  HdBufferArrayUsageHintBitsVertex: Vertex,
  HdBufferArrayUsageHintBitsStorage: Storage,
  HdBufferArrayUsageHintBitsUniform: Uniform,
  HdBufferArrayUsageHintBitsIndex: Index,
  HdBufferArrayUsageHintBitsSizeVarying: SizeVarying,
  HdBufferArrayUsageHintBitsImmutable: Immutable,
} = HdBufferArrayUsageHintBits

const perfLog = HdPerfLog.GetInstance()
const counter = (token: string) => perfLog.getCounter(token)

/** testHdStBufferAggregation.cpp:37-49 */
class _ResizeComputation extends HdStComputation {
  constructor(private readonly _numElements: number) { super() }
  Execute(_range: HdBufferArrayRange | null, _resourceRegistry: HdResourceRegistry): void {}
  getBufferSpecs(): HdBufferSpec[] { return [] }
  getNumOutputElements(): number { return this._numElements }
}

function vec3fArray(n: number, f: (i: number) => GfVec3f): VtArray<GfVec3f> {
  return new VtArray<GfVec3f>(Array.from({ length: n }, (_, i) => f(i)), VtValueTypes.GfVec3f)
}
function src(name: string, value: VtArray<unknown> | GfMatrix4d, arraySize?: number): HdBufferSource {
  if (value instanceof GfMatrix4d) {
    return new HdVtBufferSource(name, VtValue.create(value, VtValueTypes.GfMatrix4d))
  }
  return new HdVtBufferSource(name, VtValue.createArray(value), arraySize)
}
function read(range: HdBufferArrayRange, name: string): VtArray<unknown> {
  const v = range.ReadData(name) as VtValue | null
  return v!.Get<VtArray<unknown>>()
}
function readEquals(range: HdBufferArrayRange, name: string, expected: VtArray<unknown>): boolean {
  return read(range, name).equals(expected)
}
function release(range: HdBufferArrayRange | null): void {
  range?._retain().release()
}

/** testHdStBufferAggregation.cpp:51-61 */
function GetGPUMemoryUsed(registry: HdStResourceRegistry): number {
  const allocation = registry.getResourceAllocation()
  const memUsed = allocation.get(HdPerfTokens.gpuMemoryUsed)
  expect(memUsed).toBeDefined()
  expect(memUsed!.IsHolding(VtValueTypes.uint64)).toBe(true)
  return memUsed!.Get<number>()
}

/** testHdStBufferAggregation.cpp:63-151 */
function BasicTest(registry: HdStResourceRegistry): void {
  perfLog.resetCounters()
  expect(counter(HdPerfTokens.vboRelocated)).toBe(0)
  expect(counter(HdStPerfTokens.copyBufferCpuToGpu)).toBe(0)
  expect(counter(HdStPerfTokens.copyBufferGpuToGpu)).toBe(0)

  const bufferSpecs: HdBufferSpec[] = [
    { name: HdTokens.points, tupleType: { type: HdType.HdTypeFloatVec3, count: 1 } },
    { name: HdTokens.displayColor, tupleType: { type: HdType.HdTypeFloatVec3, count: 1 } },
  ]
  {
    const range = registry.allocateNonUniformBufferArrayRange(
      HdTokens.primvar, bufferSpecs, Vertex)!

    const points = vec3fArray(3, i => new GfVec3f(i))
    const colors = new VtArray<GfVec3f>(
      [new GfVec3f(1, 1, 1), new GfVec3f(1, 0, 1), new GfVec3f(1, 1, 0)], VtValueTypes.GfVec3f)

    registry.addSources(range, [src(HdTokens.displayColor, colors), src(HdTokens.points, points)])
    registry.commit()
    expect(range).toBeTruthy()

    expect(readEquals(range, HdTokens.points, points)).toBe(true)
    expect(readEquals(range, HdTokens.displayColor, colors)).toBe(true)

    expect(counter(HdPerfTokens.vboRelocated)).toBe(1)
    expect(counter(HdStPerfTokens.copyBufferCpuToGpu)).toBe(2)
    expect(counter(HdStPerfTokens.copyBufferGpuToGpu)).toBe(0)

    const points2 = new VtArray<GfVec3f>(
      [new GfVec3f(10), new GfVec3f(20), new GfVec3f(30)], VtValueTypes.GfVec3f)
    registry.addSources(range, [src(HdTokens.points, points2)])
    registry.commit()

    expect(readEquals(range, HdTokens.points, points2)).toBe(true)
    expect(readEquals(range, HdTokens.displayColor, colors)).toBe(true)

    expect(counter(HdPerfTokens.vboRelocated)).toBe(1)
    expect(counter(HdStPerfTokens.copyBufferCpuToGpu)).toBe(3)
    expect(counter(HdStPerfTokens.copyBufferGpuToGpu)).toBe(0)

    expect(GetGPUMemoryUsed(registry)).toBeGreaterThan(0)

    // range shared pointer out of scope
    release(range)
  }
  registry.garbageCollect()
  expect(GetGPUMemoryUsed(registry)).toBe(0)
}

/** testHdStBufferAggregation.cpp:153-215 */
function UniformBasicTest(ssbo: boolean, registry: HdStResourceRegistry): void {
  perfLog.resetCounters()
  expect(counter(HdPerfTokens.vboRelocated)).toBe(0)
  expect(counter(HdStPerfTokens.copyBufferCpuToGpu)).toBe(0)
  expect(counter(HdStPerfTokens.copyBufferGpuToGpu)).toBe(0)

  const bufferSpecs: HdBufferSpec[] = [
    { name: HdTokens.transform, tupleType: { type: HdType.HdTypeDoubleMat4, count: 1 } },
    { name: HdTokens.displayColor, tupleType: { type: HdType.HdTypeFloatVec3, count: 1 } },
  ]
  const range = ssbo
    ? registry.allocateShaderStorageBufferArrayRange(HdTokens.primvar, bufferSpecs, Storage)!
    : registry.allocateUniformBufferArrayRange(HdTokens.primvar, bufferSpecs, Uniform)!

  {
    const matrix = new GfMatrix4d(1)
    registry.addSources(range, [src(HdTokens.transform, matrix)])
    registry.commit()

    expect((read(range, HdTokens.transform).get(0) as GfMatrix4d).equals(matrix)).toBe(true)
    expect(counter(HdPerfTokens.vboRelocated)).toBe(1)
    expect(counter(HdStPerfTokens.copyBufferCpuToGpu)).toBe(1)
    expect(counter(HdStPerfTokens.copyBufferGpuToGpu)).toBe(0)
  }
  {
    const matrix = new GfMatrix4d(2)
    registry.addSources(range, [src(HdTokens.transform, matrix)])
    registry.commit()
    expect((read(range, HdTokens.transform).get(0) as GfMatrix4d).equals(matrix)).toBe(true)
    expect(counter(HdPerfTokens.vboRelocated)).toBe(1)
    expect(counter(HdStPerfTokens.copyBufferCpuToGpu)).toBe(2)
    expect(counter(HdStPerfTokens.copyBufferGpuToGpu)).toBe(0)
  }
  expect(GetGPUMemoryUsed(registry)).toBeGreaterThan(0)
  release(range)
  registry.garbageCollect()
  expect(GetGPUMemoryUsed(registry)).toBe(0)
}

/** testHdStBufferAggregation.cpp:217-222 */
interface Prim {
  range: HdBufferArrayRange | null
  sources: HdBufferSource[]
  bufferSpecs: HdBufferSpec[]
  primvars: Map<string, VtArray<unknown>>
}

/** testHdStBufferAggregation.cpp:224-256 */
function _CreatePrim(numElements: number, colors = true): Prim {
  const prim: Prim = { range: null, sources: [], bufferSpecs: [], primvars: new Map() }
  const points = vec3fArray(numElements, i => new GfVec3f(i))
  prim.sources.push(src(HdTokens.points, points))
  prim.primvars.set(HdTokens.points, points)
  prim.bufferSpecs.push({ name: HdTokens.points, tupleType: { type: HdType.HdTypeFloatVec3, count: 1 } })
  if (colors) {
    const c = vec3fArray(numElements, i => new GfVec3f(i, i, i))
    prim.sources.push(src(HdTokens.displayColor, c))
    prim.primvars.set(HdTokens.displayColor, c)
    prim.bufferSpecs.push({ name: HdTokens.displayColor, tupleType: { type: HdType.HdTypeFloatVec3, count: 1 } })
  }
  return prim
}

function writePrims(registry: HdStResourceRegistry, prims: Prim[], commitEach = false): void {
  for (const it of prims) {
    if (it.sources.length > 0) {
      if (!it.range) {
        it.range = registry.allocateNonUniformBufferArrayRange(
          HdTokens.primvar, it.bufferSpecs, Vertex)
      }
      registry.addSources(it.range, it.sources)
    }
    it.sources = []
    if (commitEach) registry.commit()
  }
}

function readPrims(prims: Prim[]): void {
  for (const it of prims) {
    expect(readEquals(it.range!, HdTokens.points, it.primvars.get(HdTokens.points)!)).toBe(true)
    expect(readEquals(it.range!, HdTokens.displayColor, it.primvars.get(HdTokens.displayColor)!)).toBe(true)
  }
}

/** testHdStBufferAggregation.cpp:258-385 */
function AggregationTest(aggregation: boolean, registry: HdStResourceRegistry): void {
  perfLog.resetCounters()
  let primCount = 10
  let prims: Prim[] = []
  for (let i = 0; i < primCount; ++i) prims.push(_CreatePrim((i + 1) * 10))

  // write
  for (const it of prims) {
    if (it.sources.length > 0) {
      it.range = registry.allocateNonUniformBufferArrayRange(
        HdTokens.primvar, it.bufferSpecs, Vertex)
      registry.addSources(it.range, it.sources)
    }
    it.sources = []
  }
  registry.commit()

  readPrims(prims)

  expect(counter(HdPerfTokens.vboRelocated)).toBe(aggregation ? 1 : primCount)
  expect(counter(HdStPerfTokens.copyBufferCpuToGpu)).toBe(2 * primCount)
  expect(counter(HdStPerfTokens.copyBufferGpuToGpu)).toBe(0)
  perfLog.resetCounters()

  // release partially
  for (let i = primCount - 1; i >= 0; --i) {
    if (i % 3 !== 0) {
      release(prims[i]!.range)
      prims.splice(i, 1)
    }
  }
  registry.commit()

  readPrims(prims)

  // allocate new prims
  prims.push(_CreatePrim(80))
  prims.push(_CreatePrim(90))
  primCount = prims.length

  // write inefficiently: intentionally commit within a loop
  writePrims(registry, prims, /*commitEach=*/true)

  readPrims(prims)

  expect(counter(HdPerfTokens.vboRelocated)).toBe(2)
  expect(counter(HdStPerfTokens.copyBufferCpuToGpu)).toBe(2 * 2)
  expect(counter(HdStPerfTokens.copyBufferGpuToGpu)).toBe(aggregation ? 10 : 0)
  perfLog.resetCounters()

  // allocate new prims with different layout
  prims.push(_CreatePrim(11, /*colors=*/true))
  const prim1 = prims[prims.length - 1]!
  prims.push(_CreatePrim(12, /*colors=*/false))
  const prim2 = prims[prims.length - 1]!
  prims.push(_CreatePrim(13, /*colors=*/false))
  const prim3 = prims[prims.length - 1]!

  writePrims(registry, prims)
  for (const it of prims) expect(it.range).toBeTruthy()
  registry.commit()

  expect(readEquals(prim1.range!, HdTokens.points, prim1.primvars.get(HdTokens.points)!)).toBe(true)
  expect(readEquals(prim1.range!, HdTokens.displayColor, prim1.primvars.get(HdTokens.displayColor)!)).toBe(true)
  expect(readEquals(prim2.range!, HdTokens.points, prim2.primvars.get(HdTokens.points)!)).toBe(true)
  expect(readEquals(prim3.range!, HdTokens.points, prim3.primvars.get(HdTokens.points)!)).toBe(true)

  // test IsAggregatedWith
  expect(prim1.range!.isAggregatedWith(prim1.range)).toBe(true)
  expect(prim2.range!.isAggregatedWith(prim2.range)).toBe(true)
  expect(prim3.range!.isAggregatedWith(prim3.range)).toBe(true)
  expect(prim1.range!.isAggregatedWith(prim2.range)).toBe(false)
  expect(prim1.range!.isAggregatedWith(prim3.range)).toBe(false)
  expect(prim2.range!.isAggregatedWith(prim1.range)).toBe(false)
  if (aggregation) {
    expect(prim2.range!.isAggregatedWith(prim3.range)).toBe(true)
    expect(prim3.range!.isAggregatedWith(prim2.range)).toBe(true)
  }

  expect(GetGPUMemoryUsed(registry)).toBeGreaterThan(0)

  for (const p of prims) release(p.range)
  prims = []
  registry.garbageCollect()
  expect(GetGPUMemoryUsed(registry)).toBe(0)
}

/** testHdStBufferAggregation.cpp:387-495 */
function UniformAggregationTest(aggregation: boolean, ssbo: boolean, registry: HdStResourceRegistry): void {
  perfLog.resetCounters()
  expect(counter(HdPerfTokens.vboRelocated)).toBe(0)
  expect(counter(HdStPerfTokens.copyBufferCpuToGpu)).toBe(0)
  expect(counter(HdStPerfTokens.copyBufferGpuToGpu)).toBe(0)

  const bufferSpecs: HdBufferSpec[] = [
    { name: HdTokens.transform, tupleType: { type: HdType.HdTypeDoubleMat4, count: 1 } },
    { name: HdTokens.displayColor, tupleType: { type: HdType.HdTypeFloatVec3, count: 1 } },
  ]
  const alloc = () => ssbo
    ? registry.allocateShaderStorageBufferArrayRange(HdTokens.primvar, bufferSpecs, Storage)!
    : registry.allocateUniformBufferArrayRange(HdTokens.primvar, bufferSpecs, Uniform)!
  const range1 = alloc()
  const range2 = alloc()

  const matrix1 = new GfMatrix4d(10), matrix2 = new GfMatrix4d(20)
  registry.addSources(range1, [src(HdTokens.transform, matrix1)])
  registry.addSources(range2, [src(HdTokens.transform, matrix2)])
  registry.commit()

  expect((read(range1, HdTokens.transform).get(0) as GfMatrix4d).equals(matrix1)).toBe(true)
  expect((read(range2, HdTokens.transform).get(0) as GfMatrix4d).equals(matrix2)).toBe(true)

  if (aggregation) {
    expect(counter(HdPerfTokens.vboRelocated)).toBe(1)
  } else {
    expect(counter(HdPerfTokens.vboRelocated)).toBe(2)
  }
  expect(counter(HdStPerfTokens.copyBufferCpuToGpu)).toBe(2)
  expect(counter(HdStPerfTokens.copyBufferGpuToGpu)).toBe(0)

  // shader storage layout check (testHdStBufferAggregation.cpp:445-485)
  {
    const range1GL = range1 as HdStBufferArrayRange
    if (aggregation) {
      const alignedStride = 160
      if (ssbo) {
        expect(range1GL.getResource(HdTokens.transform)!.getOffset()).toBe(0)
        expect(range1GL.getResource(HdTokens.displayColor)!.getOffset()).toBe(128)
        expect(range1GL.getResource(HdTokens.transform)!.getStride()).toBe(alignedStride)
        expect(range1GL.getResource(HdTokens.displayColor)!.getStride()).toBe(alignedStride)
      } else {
        const uniformBufferOffsetAlignment =
          registry.getHgi().getCapabilities()!.getUniformBufferOffsetAlignment()
        const uniformAlignedStride = uniformBufferOffsetAlignment *
          Math.floor((alignedStride + uniformBufferOffsetAlignment - 1) /
            uniformBufferOffsetAlignment)
        expect(range1GL.getResource(HdTokens.transform)!.getOffset()).toBe(0)
        expect(range1GL.getResource(HdTokens.displayColor)!.getOffset()).toBe(128)
        expect(range1GL.getResource(HdTokens.transform)!.getStride()).toBe(uniformAlignedStride)
        expect(range1GL.getResource(HdTokens.displayColor)!.getStride()).toBe(uniformAlignedStride)
      }
    } else {
      expect(range1GL.getResource(HdTokens.transform)!.getOffset()).toBe(0)
      expect(range1GL.getResource(HdTokens.displayColor)!.getOffset()).toBe(0)
      expect(range1GL.getResource(HdTokens.transform)!.getStride()).toBe(128)
      expect(range1GL.getResource(HdTokens.displayColor)!.getStride()).toBe(12)
    }
  }

  expect(GetGPUMemoryUsed(registry)).toBeGreaterThan(0)
  release(range1)
  release(range2)
  registry.garbageCollect()
  expect(GetGPUMemoryUsed(registry)).toBe(0)
}

/** testHdStBufferAggregation.cpp:497-649 */
function ResizeTest(registry: HdStResourceRegistry): void {
  perfLog.resetCounters()
  const bufferSpecs: HdBufferSpec[] = [
    { name: HdTokens.points, tupleType: { type: HdType.HdTypeFloatVec3, count: 1 } },
  ]

  // allocate 100 points
  let points = vec3fArray(100, i => new GfVec3f(i))
  const range1 = registry.allocateNonUniformBufferArrayRange(
    HdTokens.primvar, bufferSpecs, Vertex)!
  registry.addSources(range1, [src(HdTokens.points, points)])
  registry.commit()
  expect(readEquals(range1, HdTokens.points, points)).toBe(true)
  // vbo should be relocated once at this point
  expect(counter(HdPerfTokens.vboRelocated)).toBe(1)

  // resize to 50
  points = vec3fArray(50, i => new GfVec3f(i))
  registry.addSources(range1, [src(HdTokens.points, points)])
  registry.commit()
  expect(readEquals(range1, HdTokens.points, points)).toBe(true)
  // XXX: because of bug 114080, we relocate vbo when any BARs have been
  //      shrunk (testHdStBufferAggregation.cpp:539-544).
  expect(counter(HdPerfTokens.vboRelocated)).toBe(2)

  // let's resize back to 100
  points = vec3fArray(100, i => new GfVec3f(i))
  registry.addSources(range1, [src(HdTokens.points, points)])
  registry.commit()
  expect(readEquals(range1, HdTokens.points, points)).toBe(true)
  expect(counter(HdPerfTokens.vboRelocated)).toBe(3)

  // let's resize to 150, which is larger than initial
  points = vec3fArray(150, i => new GfVec3f(i))
  registry.addSources(range1, [src(HdTokens.points, points)])
  registry.commit()
  expect(readEquals(range1, HdTokens.points, points)).toBe(true)
  // vbo has been relocated.
  expect(counter(HdPerfTokens.vboRelocated)).toBe(4)

  expect(GetGPUMemoryUsed(registry)).toBeGreaterThan(0)

  // expand (should preserve data) (testHdStBufferAggregation.cpp:579-623)
  const computation = new _ResizeComputation(200)
  registry.addComputation(range1, computation, HdStComputeQueue.HdStComputeQueueZero)
  registry.commit()

  const result = range1.ReadData(HdTokens.points) as VtValue
  expect(result.isArrayValued() && result.getElementType() === VtValueTypes.GfVec3f).toBe(true)
  const resultArray = result.Get<VtArray<GfVec3f>>()
  expect(resultArray.size).toBe(200)
  expect(points.size).toBe(150)
  for (let i = 0; i < points.size; ++i) {
    expect(resultArray.get(i).equals(points.get(i))).toBe(true)
  }

  // shrink
  const fewerPoints = vec3fArray(10, i => new GfVec3f(i))
  registry.addSources(range1, [src(HdTokens.points, fewerPoints)])
  registry.commit()
  expect(readEquals(range1, HdTokens.points, fewerPoints)).toBe(true)

  registry.garbageCollect()
  expect(readEquals(range1, HdTokens.points, fewerPoints)).toBe(true)

  // clear
  release(range1)
  registry.garbageCollect()
  expect(GetGPUMemoryUsed(registry)).toBe(0)
}

/** testHdStBufferAggregation.cpp:651-694 */
function TopologyTest(registry: HdStResourceRegistry): void {
  perfLog.resetCounters()

  const bufferSpecs: HdBufferSpec[] = [
    { name: HdTokens.indices, tupleType: { type: HdType.HdTypeInt32, count: 1 } },
  ]
  const usageHint = Index | Storage
  const range = registry.allocateNonUniformBufferArrayRange(HdTokens.topology,
    bufferSpecs, usageHint)
  expect(range).toBeTruthy()

  const indices = new VtArray<number>([0, 1, 2, 3, 4, 5], VtValueTypes.int)
  registry.addSources(range, [src(HdTokens.indices, indices)])
  registry.commit()

  expect(readEquals(range!, HdTokens.indices, indices)).toBe(true)
  {
    // make sure not to raise a coding error,
    // we have only one resource on topology.
    ;(range as HdStBufferArrayRange).getResource()
  }

  expect(GetGPUMemoryUsed(registry)).toBeGreaterThan(0)
  release(range)
  registry.garbageCollect()
  expect(GetGPUMemoryUsed(registry)).toBe(0)
}

/** testHdStBufferAggregation.cpp:696-755 */
function InstancingUniformTest(ssbo: boolean, registry: HdStResourceRegistry): void {
  perfLog.resetCounters()
  expect(counter(HdPerfTokens.vboRelocated)).toBe(0)
  expect(counter(HdStPerfTokens.copyBufferCpuToGpu)).toBe(0)
  expect(counter(HdStPerfTokens.copyBufferGpuToGpu)).toBe(0)

  const arraySize = 2
  const bufferSpecs: HdBufferSpec[] = [
    { name: HdTokens.transform, tupleType: { type: HdType.HdTypeDoubleMat4, count: arraySize } },
    { name: HdTokens.displayColor, tupleType: { type: HdType.HdTypeFloatVec3, count: arraySize } },
  ]
  const range = ssbo
    ? registry.allocateShaderStorageBufferArrayRange(HdTokens.primvar, bufferSpecs, Storage)!
    : registry.allocateUniformBufferArrayRange(HdTokens.primvar, bufferSpecs, Uniform)!

  const matrices = new VtArray<GfMatrix4d>([new GfMatrix4d(1), new GfMatrix4d(2)],
    VtValueTypes.GfMatrix4d)
  const colors = new VtArray<GfVec3f>([new GfVec3f(1, 0, 0), new GfVec3f(0, 1, 0)],
    VtValueTypes.GfVec3f)

  registry.addSources(range, [
    src(HdTokens.transform, matrices, arraySize),
    src(HdTokens.displayColor, colors, arraySize),
  ])
  registry.commit()

  expect(counter(HdPerfTokens.vboRelocated)).toBe(1)
  // (transform*2, color*2) = 2
  expect(counter(HdStPerfTokens.copyBufferCpuToGpu)).toBe(2)
  expect(counter(HdStPerfTokens.copyBufferGpuToGpu)).toBe(0)

  expect(readEquals(range, HdTokens.transform, matrices)).toBe(true)
  expect(readEquals(range, HdTokens.displayColor, colors)).toBe(true)

  // range shared pointer out of scope
  release(range)
}

/** testHdStBufferAggregation.cpp:757-858 */
function OverAggregationTest(registry: HdStResourceRegistry): void {
  perfLog.resetCounters()
  expect(counter(HdPerfTokens.vboRelocated)).toBe(0)
  expect(counter(HdStPerfTokens.copyBufferCpuToGpu)).toBe(0)
  expect(counter(HdStPerfTokens.copyBufferGpuToGpu)).toBe(0)

  const bufferSpecs: HdBufferSpec[] = [
    { name: HdTokens.points, tupleType: { type: HdType.HdTypeFloatVec3, count: 1 } },
  ]

  // one buffer that uses ~1/8 of the HD_MAX_VBO_SIZE
  const vboMaxSize = TfGetEnvSetting(HD_MAX_VBO_SIZE)
  const points = vec3fArray(Math.floor(vboMaxSize / (8 * 12)), i => new GfVec3f(i))

  // that buffer copied 50 times: 8 entries, split into 7 buffers.
  const count = 50
  const countPerCommit = count / 2
  const ranges: HdBufferArrayRange[] = []
  for (let i = 0; i < countPerCommit; ++i) {
    const range = registry.allocateNonUniformBufferArrayRange(
      HdTokens.primvar, bufferSpecs, Vertex)
    expect(range).toBeTruthy()
    ranges.push(range!)
    registry.addSources(range, [src(HdTokens.points, points)])
  }
  registry.commit()

  // Schedule some more resources which will aggregate with the
  // previously committed resources.
  for (let i = countPerCommit; i < count; ++i) {
    const range = registry.allocateNonUniformBufferArrayRange(
      HdTokens.primvar, bufferSpecs, Vertex)
    expect(range).toBeTruthy()
    ranges.push(range!)
    registry.addSources(range, [src(HdTokens.points, points)])
  }
  registry.commit()

  for (let i = 0; i < count; ++i) {
    expect(readEquals(ranges[i]!, HdTokens.points, points)).toBe(true)
  }

  const storageMaxSize = registry.getHgi().getCapabilities()!.getMaxShaderStorageBlockSize()
  const rangesPerBuffer = Math.floor(Math.min(storageMaxSize, vboMaxSize) / (points.size * 12))
  const relocationsFirstCommit = Math.floor((countPerCommit - 1) / rangesPerBuffer) + 1
  const relocationsSecondCommit =
    Math.floor((countPerCommit - 1 + rangesPerBuffer) / rangesPerBuffer) + 1
  const totalRelocations = relocationsFirstCommit + relocationsSecondCommit

  expect(counter(HdPerfTokens.vboRelocated)).toBe(totalRelocations)
  expect(counter(HdStPerfTokens.copyBufferCpuToGpu)).toBe(50)
  expect(counter(HdStPerfTokens.copyBufferGpuToGpu)).toBe(1)

  for (const r of ranges) release(r)
  registry.garbageCollect()
}

/** testHdStBufferAggregation.cpp:860-901 */
function HintAggregationTest(registry: HdStResourceRegistry): void {
  perfLog.resetCounters()
  const primCount = 10
  let prims: Prim[] = []
  for (let i = 0; i < primCount; ++i) prims.push(_CreatePrim((i + 1) * 10))

  for (let i = 0; i < prims.length; ++i) {
    const prim = prims[i]!
    if (prim.sources.length > 0) {
      // Prims 3, 6 and 9 are size varying
      // Prim 5 is immutable
      // Prim 0 is size varying and immutable
      // Prims 1, 2, 4, 7 and 8 have no hint.
      let usageHint = Vertex
      if ((i % 3) === 0) usageHint |= SizeVarying
      if ((i % 5) === 0) usageHint |= Immutable
      prim.range = registry.allocateNonUniformBufferArrayRange(
        HdTokens.primvar, prim.bufferSpecs, usageHint)
      registry.addSources(prim.range, prim.sources)
    }
    prim.sources = []
  }
  registry.commit()

  // There should be 4 buffers as there are 4 hint classes
  expect(counter(HdPerfTokens.vboRelocated)).toBe(4)
  perfLog.resetCounters()

  for (const p of prims) release(p.range)
  prims = []
  registry.garbageCollect()
  expect(GetGPUMemoryUsed(registry)).toBe(0)
}

// Upstream runs this test on every backend; it runs here over an OpenGL-like
// device and over a Metal-like one (unified memory, C++ shader padding), with
// the same assertions.
for (const metalLike of [false, true]) describe(`testHdStBufferAggregation${metalLike ? ' (unified memory, C++ shader padding)' : ''}`, () => {
  let mark: TfErrorMark
  let registry: HdStResourceRegistry
  const savedMaxVboSize = env.HD_MAX_VBO_SIZE

  beforeAll(() => {
    TfDebug.enable(HdDebugCodes.HD_SAFE_MODE)
    env.HD_MAX_VBO_SIZE = String(268435456) // 2^28
    perfLog.enable()
    mark = new TfErrorMark()
    mark.setMark()
    const hgi = new BufferTestHgi()
    if (metalLike) {
      hgi.capabilities.setFlag(HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsUnifiedMemory, true)
      hgi.capabilities.setFlag(HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsCppShaderPadding, true)
    }
    registry = new HdStResourceRegistry(hgi)
  })
  afterAll(() => {
    TfDebug.disable(HdDebugCodes.HD_SAFE_MODE)
    if (savedMaxVboSize === undefined) delete env.HD_MAX_VBO_SIZE
    else env.HD_MAX_VBO_SIZE = savedMaxVboSize
    mark.clear()
  })

  const clean = () => expect(mark.getErrors().map(e => e.getCommentary())).toEqual([])

  // testHdStBufferAggregation.cpp:903-1083, in upstream order.
  it('Basic Test', () => { BasicTest(registry); clean() })
  it('Aggregation Test', () => { AggregationTest(true, registry); clean() })
  it('Resize Test', () => { ResizeTest(registry); clean() })
  it('Shader Storage Basic Test', () => { UniformBasicTest(true, registry); clean() })
  it('Shader Storage Aggregation Test', () => { UniformAggregationTest(true, true, registry); clean() })
  it('Uniform Basic Test', () => { UniformBasicTest(false, registry); clean() })
  it('Uniform Aggregation Test', () => { UniformAggregationTest(true, false, registry); clean() })
  it('Topology Test', () => { TopologyTest(registry); clean() })
  it('Instancing Uniform Test (ssbo)', () => { InstancingUniformTest(true, registry); clean() })
  it('Instancing Uniform Test (ubo)', () => { InstancingUniformTest(false, registry); clean() })
  it('Over aggregation test', () => {
    env.HD_MAX_VBO_SIZE = String(1 << 20)
    try { OverAggregationTest(registry) } finally { env.HD_MAX_VBO_SIZE = String(268435456) }
    clean()
  })
  it('Hint aggregation test', () => { HintAggregationTest(registry); clean() })

  it('switches to the simple memory manager', () => {
    registry.setNonUniformAggregationStrategy(new HdStVBOSimpleMemoryManager(registry))
    registry.setNonUniformImmutableAggregationStrategy(new HdStVBOSimpleMemoryManager(registry))
    registry.setUniformAggregationStrategy(new HdStVBOSimpleMemoryManager(registry))
    registry.setShaderStorageAggregationStrategy(new HdStVBOSimpleMemoryManager(registry))
  })
  it('Basic Test (simple)', () => { BasicTest(registry); clean() })
  it('Aggregation Test (simple)', () => { AggregationTest(false, registry); clean() })
  it('Resize Test (simple)', () => { ResizeTest(registry); clean() })
  it('Shader Storage Basic Test (simple)', () => { UniformBasicTest(true, registry); clean() })
  it('Shader Storage Aggregation Test (simple)', () => { UniformAggregationTest(false, true, registry); clean() })
  it('Uniform Basic Test (simple)', () => { UniformBasicTest(false, registry); clean() })
  it('Uniform Aggregation Test (simple)', () => { UniformAggregationTest(false, false, registry); clean() })
  it('Topology Test (simple)', () => { TopologyTest(registry); clean() })
})

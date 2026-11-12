// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdSt/testenv/testHdStMeshTopology.cpp,
//  pxr/imaging/hdSt/testenv/testHdStPrimitiveParam.cpp,
//  pxr/imaging/hdSt/testenv/testHdStQuadrangulation.cpp
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Shared helpers for the ports of pxr/imaging/hdSt/testenv/testHdStMeshTopology.cpp,
// testHdStQuadrangulation.cpp and testHdStPrimitiveParam.cpp (OpenUSD 26.11.1).

import { expect } from 'vitest'
import { Array as VtArray, Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { Vec3f as GfVec3f, Vec3d as GfVec3d } from 'typescript-usd/gf'
import {
  type BufferArrayRange as HdBufferArrayRange,
  type BufferSource as HdBufferSource,
} from 'typescript-usd/hd'
import { HdStResourceRegistry } from '../../src/resourceRegistry.ts'
import { BufferTestHgi } from '../bufferTestHgi.ts'

export type TestRegistry = HdStResourceRegistry

/** The registry of the upstream tests' `main()` (e.g.
 *  testHdStMeshTopology.cpp:1000-1014), which is the render index's
 *  HdStResourceRegistry over the platform Hgi. Here it is an
 *  HdStResourceRegistry over the recording test Hgi (tests/bufferTestHgi.ts):
 *  buffers keep their bytes on the CPU, so committed sources can be read
 *  back with ReadData, but compute pipelines (the GPU computations) are not
 *  available. */
export function CreateTestRegistry(): HdStResourceRegistry {
  return _hooks.createRegistry()
}

/** `range->ReadData(name)` as a VtValue. */
export function ReadData(range: HdBufferArrayRange | null, name: string): VtValue {
  return range!.ReadData(name) as VtValue
}

/** `range->ReadData(name)`, awaited: the comparisons that read GPU results
 *  call this so that a browser run over HgiWebGPU can wait for the GPU copy
 *  (HdStReadBuffer cannot: PLATFORM-DIVERGENCE(hdst-readbuffer-sync) in
 *  hdSt/src/bufferUtils.ts). Under vitest it is ReadData. */
export async function ReadDataAsync(range: HdBufferArrayRange | null, name: string): Promise<VtValue> {
  return _hooks.readData(range, name)
}

/** Whether the cases that run a Storm GPU computation are skipped: in Node,
 *  which has no WebGPU device and whose test Hgi has no compute pipelines
 *  (PLATFORM-DIVERGENCE(hdst-node-no-gpu-compute), tests/bufferTestHgi.ts).
 *  The Safari run (tests/browser/storm-image/hdst-gpu/) has navigator.gpu and runs
 *  them over HgiWebGPU. */
export const GpuComputeUnavailable =
  (globalThis as { navigator?: { gpu?: unknown } }).navigator?.gpu === undefined

/** The registry and read-back the comparisons use. The vitest runs keep the
 *  defaults (the recording test Hgi, synchronous ReadData); the Safari run
 *  (tests/browser/storm-image/hdst-gpu/) installs an HgiWebGPU registry and an
 *  awaited read-back. */
export interface TestHooks {
  createRegistry: () => HdStResourceRegistry
  readData: (range: HdBufferArrayRange | null, name: string) => VtValue | Promise<VtValue>
}
const _hooks: TestHooks = {
  createRegistry: () => new HdStResourceRegistry(new BufferTestHgi()),
  readData: ReadData,
}
export function SetTestHooks(hooks: Partial<TestHooks>): void {
  Object.assign(_hooks, hooks)
}

/** VtArray<GfVec3f> / VtArray<GfVec3d> from component triples. */
export function Vec3fArray(values: readonly (readonly number[])[]): VtArray<GfVec3f> {
  return new VtArray(values.map(v => new GfVec3f(v[0]!, v[1]!, v[2]!)), VtValueTypes.GfVec3f)
}
export function Vec3dArray(values: readonly (readonly number[])[]): VtArray<GfVec3d> {
  return new VtArray(values.map(v => new GfVec3d(v[0]!, v[1]!, v[2]!)), VtValueTypes.GfVec3d)
}
export function FloatArray(values: readonly number[]): VtArray<number> {
  return new VtArray(values, VtValueTypes.float)
}

/** The components of a resolved buffer source, read as `T const*`. */
export function SourceComponents(source: HdBufferSource,
  ctor: Int32ArrayConstructor | Float32ArrayConstructor | Float64ArrayConstructor): number[] {
  const data = source.getData()
  return [...new ctor(data.buffer as ArrayBuffer, data.byteOffset,
    Math.floor(data.byteLength / ctor.BYTES_PER_ELEMENT))]
}

/** The components of a VtArray of numbers or Gf vectors. */
export function ArrayComponents(array: VtArray<unknown>): number[] {
  const data = array.cdata()
  if (ArrayBuffer.isView(data)) return Array.from(data as unknown as ArrayLike<number>).slice(0, array.size * _Width(array))
  return (data as readonly unknown[]).flatMap(v => typeof v === 'number' ? [v] : [...(v as { data: number[] }).data])
}
function _Width(array: VtArray<unknown>): number {
  const name = array.getElementType().getTypeName()
  const m = /Vec([234])/.exec(name)
  return m ? Number(m[1]) : 1
}

/** _CompareArrays (testHdStMeshTopology.cpp:168-184): GfIsClose per
 *  component with 1e-6 (gf/math.h: |a - b| < epsilon). */
export function ExpectClose3(result: readonly number[], expected: readonly (readonly number[])[]): void {
  expect(result.length).toBe(expected.length * 3)
  for (let i = 0; i < expected.length; ++i) {
    for (let c = 0; c < 3; ++c) {
      const a = result[i * 3 + c]!, b = expected[i]![c]!
      expect(Math.abs(a - b) < 1e-6, `[${i}][${c}] ${a} vs ${b}`).toBe(true)
    }
  }
}

export { VtValue }

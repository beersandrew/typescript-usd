// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdSt/testenv/testHdStBufferArray.cpp
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/testenv/testHdStBufferArray.cpp
// (OpenUSD 26.11.1), expected values from
// testenv/testHdStBufferArray/baseline/testHdStBufferArray-Run1-stdout.txt.
//
// Upstream runs all four tests on one HdSt_TestDriver's registry. BasicTest
// runs here on HdSt_TestDriver (src/unitTestHelper.ts) over the GPU-less Hgi
// that reports hgiMetal's capabilities (tests/pipelineDrawBatchTestHgi.ts):
// HdUnitTestDelegate prims are drawn, removed and garbage collected through
// the render index, HdStMesh / HdStBasisCurves and HdStResourceRegistry. Its
// baseline's texture lines (the two texture objects and their textureMemory,
// which this driver does not create) are not compared. Upstream registers
// the test for HgiGL only (`if (NOT APPLE)`) with HD_ENABLE_DOUBLE_MATRIX=1
// and HD_ENABLE_PACKED_NORMALS=0 (hdSt/CMakeLists.txt:2197-2208), so
// BasicTest sets that environment and the two capabilities of hgiGL's that
// lay out the primvar buffers (hgiGL/capabilities.cpp:195-196: shader double
// precision, no C++ shader padding). ResizeTest and MergeTest use only the
// resource registry; they run here on a fresh registry over the recording
// test Hgi (tests/bufferTestHgi.ts), so the dumped keys that come from the
// driver's earlier draws (drawIndirect / drawIndirectCull dispatch buffers,
// the two texture objects and their textureMemory) are not compared; every
// other line of the baseline is.

import { describe, expect, it } from 'vitest'
import { Matrix4f as GfMatrix4f, Vec3f as GfVec3f } from 'typescript-usd/gf'
import { Token as TfToken, TfErrorMark } from 'typescript-usd/tf'
import { HgiDeviceCapabilitiesBits, HgiHandle, HgiTexture, type HgiTextureDesc, type HgiTextureHandle } from 'typescript-usd/hgi'
import { Array as VtArray, Value as VtValue, ValueTypes as VtValueTypes, type Dictionary as VtDictionary } from 'typescript-usd/vt'
import {
  BufferArrayRangeContainer as HdBufferArrayRangeContainer,
  BufferArrayUsageHintBits as HdBufferArrayUsageHintBits,
  BufferSpec as HdBufferSpec,
  DrawingCoord as HdDrawingCoord,
  PerfLog as HdPerfLog,
  PerfTokens as HdPerfTokens,
  Tokens as HdTokens,
  Type as HdType,
  VtBufferSource as HdVtBufferSource,
  type BufferArrayRange as HdBufferArrayRange,
} from 'typescript-usd/hd'
import { HdStResourceRegistry } from '../../src/resourceRegistry.ts'
import { HdSt_RegisterShaderResources } from '../../src/shaderResources.ts'
import { HdSt_TestDriver } from '../../src/unitTestHelper.ts'
import { Hdx_RegisterShaderResources } from '../../../hdx/src/shaderResources.ts'
import { BufferTestHgi } from '../bufferTestHgi.ts'
import { PipelineDrawBatchTestHgi } from '../pipelineDrawBatchTestHgi.ts'

const Vertex = HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsVertex
const perfLog = HdPerfLog.GetInstance()

// Keys not compared (see the header); upstream itself skips drawingShader,
// computeShader, gpuMemoryUsed, uboSize and ssboSize
// (testHdStBufferArray.cpp:41-48).
const skippedKeys = new Set<string>([
  HdTokens.drawingShader, HdTokens.computeShader, HdPerfTokens.gpuMemoryUsed,
  HdPerfTokens.uboSize, HdPerfTokens.ssboSize,
  'drawIndirect', 'drawIndirectCull', 'numberOfTextureObjects', 'textureMemory',
])

/** testHdStBufferArray.cpp:31-73 Dump */
function Dump(message: string, dict: VtDictionary, skipped: ReadonlySet<string> = skippedKeys): string {
  const keys = [...dict].map(([k]) => k).filter(k => !skipped.has(k)).sort()
  let out = message
  for (const key of keys) {
    out += `${key}, ${dict.get(key)!.Get<number>()}\n`
  }
  for (const token of [HdPerfTokens.garbageCollected, HdPerfTokens.instMeshTopology,
    HdPerfTokens.instBasisCurvesTopology, HdPerfTokens.instVertexAdjacency,
    HdPerfTokens.instMeshTopologyRange, HdPerfTokens.instBasisCurvesTopologyRange]) {
    out += `${token} = ${perfLog.getCounter(token)}\n`
  }
  return out
}

function baselineBlock(message: string, lines: string[]): string {
  return message + lines.map(l => l + '\n').join('')
}

const zeroInst = [
  'instMeshTopology = 0', 'instBasisCurvesTopology = 0', 'instVertexAdjacency = 0',
  'instMeshTopologyRange = 0', 'instBasisCurvesTopologyRange = 0',
]

function points(n: number): VtValue {
  return VtValue.createArray(new VtArray<GfVec3f>(
    Array.from({ length: n }, (_, i) => new GfVec3f(i)), VtValueTypes.GfVec3f))
}

/** Render buffer textures for the driver: the descriptor only (as in
 *  depthBiasDriver.test.ts). */
class _Texture extends HgiTexture {
  constructor(desc: HgiTextureDesc) { super(desc) }
  getByteSizeOfResource(): number { return 0 }
  getRawResource(): unknown { return null }
  submitLayoutChange(newLayout: number): number { return newLayout }
}

class _DriverHgi extends PipelineDrawBatchTestHgi {
  protected override _CreateTexture(desc: HgiTextureDesc): HgiTextureHandle {
    return new HgiHandle<HgiTexture>(new _Texture(desc), this.getUniqueId())
  }
}

describe('testHdStBufferArray', () => {
  // testHdStBufferArray-Run1-stdout.txt:1-91, less the texture lines (see
  // the header).
  const basicBaseline = (primvarLines: boolean) => {
    const block = (message: string, lines: string[], gc: number, inst: number[]) =>
      baselineBlock(message, [...lines.filter(l => primvarLines || !/^(nonUniformSize|primvar),/.test(l)),
        `garbageCollected = ${gc}`, `instMeshTopology = ${inst[0]}`, `instBasisCurvesTopology = ${inst[1]}`,
        `instVertexAdjacency = ${inst[2]}`, `instMeshTopologyRange = ${inst[3]}`,
        `instBasisCurvesTopologyRange = ${inst[4]}`])
    const drawn = (n: number, nonUniform: number, primvar: number, topology: number) => [`drawIndirect, ${n}`,
      `drawIndirectCull, ${n}`, `nonUniformSize, ${nonUniform}`, 'numberOfTextureHandles, 0', `primvar, ${primvar}`,
      'singleBufferSize, 0', `topology, ${topology}`]
    return block('----- begin -----\n', ['nonUniformSize, 0', 'numberOfTextureHandles, 0', 'singleBufferSize, 0'],
      0, [0, 0, 0, 0, 0]) +
      block('----- allocated -----\n', drawn(480, 55136, 16592, 41168), 0, [4, 1, 4, 4, 1]) +
      block('----- delete a prim -----\n', drawn(480, 55136, 16592, 41168), 0, [4, 1, 4, 4, 1]) +
      block('----- garbage collected -----\n', drawn(900, 55136, 16272, 41168), 1, [4, 1, 4, 4, 1]) +
      block('----- delete more prims -----\n', drawn(660, 54352, 14992, 40672), 2, [3, 1, 3, 3, 1]) +
      block('----- clear all -----\n', ['drawIndirect, 240', 'drawIndirectCull, 240', 'nonUniformSize, 0',
        'numberOfTextureHandles, 0', 'singleBufferSize, 0'], 3, [0, 0, 0, 0, 0])
  }
  // Upstream's own skipped keys (testHdStBufferArray.cpp:41-48) and the
  // texture lines (see the header).
  const basicSkipped = new Set<string>([
    HdTokens.drawingShader, HdTokens.computeShader, HdPerfTokens.gpuMemoryUsed,
    HdPerfTokens.uboSize, HdPerfTokens.ssboSize, 'numberOfTextureObjects', 'textureMemory',
  ])

  /** testHdStBufferArray.cpp:76-140 */
  function BasicTest(primvarLines: boolean): { out: string, errors: string[] } {
    HdSt_RegisterShaderResources()
    Hdx_RegisterShaderResources()
    const mark = new TfErrorMark()
    mark.setMark()
    // hdSt/CMakeLists.txt:2204-2207 ENV; hgiGL/capabilities.cpp:195-196.
    const env = { HD_ENABLE_DOUBLE_MATRIX: '1', HD_ENABLE_PACKED_NORMALS: '0' }
    const savedEnv = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]]))
    Object.assign(process.env, env)
    try {
      const hgi = new _DriverHgi()
      hgi.capabilities.setFlag(HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsShaderDoublePrecision, true)
      hgi.capabilities.setFlag(HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsCppShaderPadding, false)
      const driver = new HdSt_TestDriver(hgi)
      perfLog.enable()
      perfLog.resetCounters()

      const delegate = driver.getDelegate()
      const resourceRegistry = delegate.getRenderIndex().getResourceRegistry() as HdStResourceRegistry
      const dump = (message: string) => {
        const text = Dump(message, resourceRegistry.getResourceAllocation(), basicSkipped)
        return primvarLines ? text : text.split('\n').filter(l => !/^(nonUniformSize|primvar),/.test(l)).join('\n')
      }

      // begin with 0
      let out = dump('----- begin -----\n')

      const identity = new GfMatrix4f().setIdentity()
      delegate.addCube('/cube0', identity)
      delegate.addCube('/cube1', identity)
      delegate.addGrid('/plane0', 1, 1, identity)
      delegate.addGrid('/plane1', 10, 10, identity)
      delegate.addGrid('/plane2', 10, 10, identity)
      delegate.addGrid('/plane3', 20, 20, identity)
      delegate.addCurves('/curves1', HdTokens.linear, TfToken(), identity)
      delegate.addCurves('/curves2', HdTokens.linear, TfToken(), identity)
      driver.draw()

      // all allocated
      out += dump('----- allocated -----\n')

      // delete a geom
      delegate.remove('/cube0')

      // should be same, because we didn't call garbage collection explicitly.
      out += dump('----- delete a prim -----\n')

      // draw triggers garbage collection
      driver.draw()
      out += dump('----- garbage collected -----\n')

      // delete more
      delegate.remove('/cube1')
      delegate.remove('/plane1')
      delegate.remove('/curves1')
      driver.draw()
      out += dump('----- delete more prims -----\n')

      // clear all
      delegate.clear()

      // explicit compaction
      resourceRegistry.garbageCollect()
      out += dump('----- clear all -----\n')

      const errors = mark.getErrors().map(e => e.getCommentary())
      mark.clear()
      return { out, errors }
    } finally {
      for (const [k, v] of Object.entries(savedEnv)) {
        if (v === undefined) delete process.env[k]
        else process.env[k] = v
      }
    }
  }

  it('BasicTest (testHdStBufferArray.cpp:76-140): removed prims are garbage collected', () => {
    const { out, errors } = BasicTest(false)
    expect(out).toBe(basicBaseline(false))
    expect(errors).toEqual([])
  })

  it('BasicTest (testHdStBufferArray.cpp:76-140): primvar and nonUniformSize bytes', () => {
    expect(BasicTest(true).out).toBe(basicBaseline(true))
  })

  it('ResizeTest (testHdStBufferArray.cpp:142-215)', () => {
    const mark = new TfErrorMark()
    mark.setMark()
    perfLog.enable()
    perfLog.resetCounters()
    const registry = new HdStResourceRegistry(new BufferTestHgi())

    const bufferSpecs: HdBufferSpec[] = [
      { name: HdTokens.points, tupleType: { type: HdType.HdTypeFloatVec3, count: 1 } },
    ]
    const range = registry.allocateNonUniformBufferArrayRange(
      HdTokens.primvar, bufferSpecs, Vertex)

    let out = ''
    registry.addSources(range, [new HdVtBufferSource(HdTokens.points, points(3))])
    registry.commit()
    out += Dump('----- 3 points -----\n', registry.getResourceAllocation())

    registry.addSources(range, [new HdVtBufferSource(HdTokens.points, points(5))])
    registry.commit()
    out += Dump('----- 5 points -----\n', registry.getResourceAllocation())

    registry.addSources(range, [new HdVtBufferSource(HdTokens.points, points(4))])
    registry.commit()
    out += Dump('----- 4 points before GC -----\n', registry.getResourceAllocation())

    registry.garbageCollect()
    out += Dump('----- 4 points after GC -----\n', registry.getResourceAllocation())

    registry.addSources(range, [new HdVtBufferSource(HdTokens.points, points(0))])
    registry.commit()
    out += Dump('----- 0 points after GC -----\n', registry.getResourceAllocation())

    const head = ['numberOfTextureHandles, 0']
    expect(out).toBe(
      baselineBlock('----- 3 points -----\n', ['nonUniformSize, 36', ...head, 'primvar, 36',
        'singleBufferSize, 0', 'garbageCollected = 0', ...zeroInst]) +
      baselineBlock('----- 5 points -----\n', ['nonUniformSize, 60', ...head, 'primvar, 60',
        'singleBufferSize, 0', 'garbageCollected = 0', ...zeroInst]) +
      baselineBlock('----- 4 points before GC -----\n', ['nonUniformSize, 48', ...head, 'primvar, 48',
        'singleBufferSize, 0', 'garbageCollected = 0', ...zeroInst]) +
      baselineBlock('----- 4 points after GC -----\n', ['nonUniformSize, 48', ...head, 'primvar, 48',
        'singleBufferSize, 0', 'garbageCollected = 1', ...zeroInst]) +
      baselineBlock('----- 0 points after GC -----\n', ['nonUniformSize, 0', ...head, 'primvar, 0',
        'singleBufferSize, 0', 'garbageCollected = 1', ...zeroInst]))

    expect(mark.getErrors().map(e => e.getCommentary())).toEqual([])
    mark.clear()
  })

  it('MergeTest (testHdStBufferArray.cpp:217-302)', () => {
    const mark = new TfErrorMark()
    mark.setMark()
    perfLog.enable()
    perfLog.resetCounters()
    const registry = new HdStResourceRegistry(new BufferTestHgi())

    const pts = new VtArray<GfVec3f>([0, 1, 2].map(i => new GfVec3f(i)), VtValueTypes.GfVec3f)
    const nrm = new VtArray<GfVec3f>([0, 1, 2].map(i => new GfVec3f(-i)), VtValueTypes.GfVec3f)
    const readEq = (range: HdBufferArrayRange, name: string, a: VtArray<GfVec3f>) =>
      (range.ReadData(name) as VtValue).Get<VtArray<GfVec3f>>().equals(a)

    expect(perfLog.getCounter(HdPerfTokens.bufferArrayRangeMigrated)).toBe(0)

    // send points
    let sources = [new HdVtBufferSource(HdTokens.points, VtValue.createArray(pts))]
    let bufferSpecs = HdBufferSpec.getBufferSpecs(sources)
    let range = registry.allocateNonUniformBufferArrayRange(HdTokens.primvar, bufferSpecs, Vertex)!
    registry.addSources(range, sources)
    registry.commit()

    expect(perfLog.getCounter(HdPerfTokens.bufferArrayRangeMigrated)).toBe(0)
    expect(readEq(range, HdTokens.points, pts)).toBe(true)

    // send points + normals
    sources = [new HdVtBufferSource(HdTokens.points, VtValue.createArray(pts)),
               new HdVtBufferSource(HdTokens.normals, VtValue.createArray(nrm))]
    bufferSpecs = HdBufferSpec.getBufferSpecs(sources)
    range = registry.updateNonUniformBufferArrayRange(
      HdTokens.primvar, range, bufferSpecs, /*removedSpecs*/[], Vertex)!
    registry.addSources(range, sources)
    registry.commit()

    expect(perfLog.getCounter(HdPerfTokens.bufferArrayRangeMigrated)).toBe(1)
    expect(readEq(range, HdTokens.points, pts)).toBe(true)
    expect(readEq(range, HdTokens.normals, nrm)).toBe(true)

    // send normals
    sources = [new HdVtBufferSource(HdTokens.normals, VtValue.createArray(nrm))]
    bufferSpecs = HdBufferSpec.getBufferSpecs(sources)
    range = registry.updateNonUniformBufferArrayRange(
      HdTokens.primvar, range, bufferSpecs, /*removedSpecs*/[], Vertex)!
    registry.addSources(range, sources)
    registry.commit()

    expect(perfLog.getCounter(HdPerfTokens.bufferArrayRangeMigrated)).toBe(1)
    expect(readEq(range, HdTokens.points, pts)).toBe(true)
    expect(readEq(range, HdTokens.normals, nrm)).toBe(true)

    expect(mark.getErrors().map(e => e.getCommentary())).toEqual([])
    mark.clear()
  })

  it('BarShareTest (testHdStBufferArray.cpp:304-336)', () => {
    perfLog.enable()
    perfLog.resetCounters()

    const barContainer = new HdBufferArrayRangeContainer(HdDrawingCoord.DefaultNumSlots)
    const drawingCoord = new HdDrawingCoord()
    drawingCoord.setInstancePrimvarBaseIndex(HdDrawingCoord.CustomSlotsBegin)

    const resized = () => perfLog.getCounter(HdPerfTokens.bufferArrayRangeContainerResized)
    expect(resized()).toBe(0)

    barContainer.Set(drawingCoord.getConstantPrimvarIndex(), null)
    barContainer.Set(drawingCoord.getVertexPrimvarIndex(), null)
    barContainer.Set(drawingCoord.getTopologyIndex(), null)

    // Constant, VertexPrimvar, Topology is allocated by default.
    expect(resized()).toBe(0)

    // when ElementPrimvar is requested, the container should be resized.
    barContainer.Set(drawingCoord.getElementPrimvarIndex(), null)
    expect(resized()).toBe(1)

    // same for instance index
    barContainer.Set(drawingCoord.getInstanceIndexIndex(), null)
    expect(resized()).toBe(2)

    // IntancePrimvar always comes at the very end. The container will be
    // resized.
    barContainer.Set(drawingCoord.getInstancePrimvarIndex(/*depth=*/0), null)
    expect(resized()).toBe(3)
  })
})

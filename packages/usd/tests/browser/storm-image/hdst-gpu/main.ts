// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/bufferUtils.cpp,
//  pxr/imaging/hdSt/testenv/testHdStMeshTopology.cpp,
//  pxr/imaging/hdSt/testenv/testHdStQuadrangulation.cpp,
//  pxr/imaging/hdSt/testenv/testHdStSubdivision.cpp
// Copyright 2016, 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Browser half of tests/browser/storm-image/hdst-gpu/run.mjs: runs the ported hdSt
// upstream tests whose computations run on the GPU over HgiWebGPU (with the
// GLSL-to-WGSL translator) instead of the recording test Hgi of the vitest
// runs:
// - testHdStMeshTopology and testHdStQuadrangulation
//   (pxr/imaging/hdSt/tests/upstream/{meshTopology,quadrangulation}.test.ts,
//   registered through vitestShim.ts), every registered case;
// - testHdStSubdivision (tests/upstream/testHdStSubdivision.ts), whose
//   output run.mjs compares with the upstream stdout baseline.
// Buffer read-back waits for the GPU copy (HdStReadBuffer cannot under
// WebGPU: PLATFORM-DIVERGENCE(hdst-readbuffer-sync), hdSt/src/bufferUtils.ts);
// the copy is HdStReadBuffer's (bufferUtils.cpp:127-187), submitted and
// awaited.
import { TfDiagnosticMgr } from '../../../../pxr/base/tf/src/diagnostic.ts'
import { HgiWebGPU } from '../../../../pxr/imaging/hgiWebGPU/src/index.ts'
import { HgiWebGPUGlslShaderBodyTranslator } from '../../../../pxr/imaging/hgiWebGPU/src/glsl/glslShaderBodyTranslator.ts'
import '../../../../pxr/imaging/hdSt/src/index.ts'
import { HdStResourceRegistry } from '../../../../pxr/imaging/hdSt/src/resourceRegistry.ts'
import type { HdStBufferArrayRange } from '../../../../pxr/imaging/hdSt/src/bufferArrayRange.ts'
import { HgiBufferGpuToCpuOp, HgiSubmitWaitType, HgiMemoryBarrierBits } from 'typescript-usd/hgi'
import { DataSizeOfTupleType as HdDataSizeOfTupleType, Type as HdType, type BufferArrayRange as HdBufferArrayRange } from 'typescript-usd/hd'
import { Value as VtValue, Array as VtArray, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { registeredTests } from './vitestShim.ts'
import { SetTestHooks } from '../../../../pxr/imaging/hdSt/tests/upstream/meshTopologyTestUtils.ts'
import '../../../../pxr/imaging/hdSt/tests/upstream/meshTopology.test.ts'
import '../../../../pxr/imaging/hdSt/tests/upstream/quadrangulation.test.ts'
import { RunTestHdStSubdivision } from '../../../../pxr/imaging/hdSt/tests/upstream/testHdStSubdivision.ts'

const log = document.getElementById('log')!
let diagnostics: string[] = []
let gpuErrors: string[] = []
TfDiagnosticMgr.GetInstance().addDelegate({
  issueError(e) { if (diagnostics.length < 200) diagnostics.push(`error: ${(e as { getCommentary?: () => string }).getCommentary?.() ?? String(e)}`) },
  issueWarning(w) { if (diagnostics.length < 200) diagnostics.push(`warning: ${(w as { getCommentary?: () => string }).getCommentary?.() ?? String(w)}`) },
  issueStatus() {},
})

const hgi = await HgiWebGPU.create()
if (!hgi) throw new Error('no WebGPU device')
hgi.setShaderBodyTranslator(HgiWebGPUGlslShaderBodyTranslator)
hgi.getPrimaryDevice().addEventListener('uncapturederror', ev => {
  if (gpuErrors.length < 50) gpuErrors.push((ev as GPUUncapturedErrorEvent).error.message)
})

// bufferUtils.cpp:62-125: the VtArray element type of each HdType read here.
const elementInfo: Partial<Record<HdType, [string, Int32ArrayConstructor | Float32ArrayConstructor | Float64ArrayConstructor, number]>> = {
  [HdType.HdTypeInt32]: ['int', Int32Array, 1],
  [HdType.HdTypeInt32Vec2]: ['GfVec2i', Int32Array, 2],
  [HdType.HdTypeInt32Vec3]: ['GfVec3i', Int32Array, 3],
  [HdType.HdTypeInt32Vec4]: ['GfVec4i', Int32Array, 4],
  [HdType.HdTypeFloat]: ['float', Float32Array, 1],
  [HdType.HdTypeFloatVec2]: ['GfVec2f', Float32Array, 2],
  [HdType.HdTypeFloatVec3]: ['GfVec3f', Float32Array, 3],
  [HdType.HdTypeFloatVec4]: ['GfVec4f', Float32Array, 4],
  [HdType.HdTypeDouble]: ['double', Float64Array, 1],
  [HdType.HdTypeDoubleVec3]: ['GfVec3d', Float64Array, 3],
}

/** vboMemoryManager.cpp:703-731 ReadData + bufferUtils.cpp:127-187
 *  HdStReadBuffer, awaiting the submissions. */
async function readData(range_: HdBufferArrayRange | null, name: string): Promise<VtValue> {
  const range = range_ as HdStBufferArrayRange & { getByteOffset(name: string): number, getResourceRegistry(): HdStResourceRegistry }
  const registry = range.getResourceRegistry()
  const vbo = range.getResource(name)
  if (!vbo) return VtValue.getEmpty()
  const tupleType = vbo.getTupleType()
  const numElements = range.getNumElements()
  const info = elementInfo[tupleType.type]
  if (!info) throw new Error(`readData: unhandled type ${HdType[tupleType.type]}`)
  const bytesPerElement = HdDataSizeOfTupleType(tupleType)
  const dataSize = numElements > 0 ? bytesPerElement * numElements : 0
  const tmp = new Uint8Array(dataSize)

  await registry.submitBlitWork(HgiSubmitWaitType.HgiSubmitWaitTypeWaitUntilCompleted)
  await registry.submitComputeWork(HgiSubmitWaitType.HgiSubmitWaitTypeWaitUntilCompleted)
  if (dataSize > 0 && vbo.getHandle().isSet()) {
    const copyOp = new HgiBufferGpuToCpuOp()
    copyOp.byteSize = dataSize
    copyOp.cpuDestinationBuffer = tmp
    copyOp.destinationByteOffset = 0
    copyOp.gpuSourceBuffer = vbo.getHandle()
    copyOp.sourceByteOffset = range.getByteOffset(name)
    const blitCmds = registry.getGlobalBlitCmds()
    blitCmds.insertMemoryBarrier(HgiMemoryBarrierBits.HgiMemoryBarrierAll)
    blitCmds.copyBufferGpuToCpu(copyOp)
    await registry.submitBlitWork(HgiSubmitWaitType.HgiSubmitWaitTypeWaitUntilCompleted)
  }
  const [typeName, Ctor, comps] = info
  const count = numElements * tupleType.count
  const components = new Ctor(count * comps)
  new Uint8Array(components.buffer).set(tmp.subarray(0, components.byteLength))
  const elementType = (VtValueTypes as Record<string, never>)[typeName]!
  return VtValue.createArray(VtArray.fromBuffer(elementType, components as never, count))
}

SetTestHooks({ createRegistry: () => new HdStResourceRegistry(hgi), readData })

async function post(url: string, body: unknown): Promise<void> {
  await fetch(url, { method: 'POST', body: JSON.stringify(body) })
}

// testHdStMeshTopology / testHdStQuadrangulation
const filter = new URLSearchParams(location.search).get('filter') ?? ''
for (const t of registeredTests.filter(t => t.name.includes(filter))) {
  log.textContent = t.name
  diagnostics = []; gpuErrors = []
  const result: Record<string, unknown> = { name: t.name }
  try {
    await t.fn()
    result.pass = true
  } catch (e) {
    result.pass = false
    result.error = e instanceof Error ? e.message : String(e)
  }
  result.diagnostics = diagnostics
  result.gpuErrors = gpuErrors
  await post('/__test', result)
}

// testHdStSubdivision
diagnostics = []; gpuErrors = []
log.textContent = 'testHdStSubdivision'
try {
  const r = await RunTestHdStSubdivision(() => new HdStResourceRegistry(hgi), readData)
  await post('/__subdivision', { ...r, diagnostics, gpuErrors, userAgent: navigator.userAgent })
} catch (e) {
  await post('/__subdivision', { exception: e instanceof Error ? `${e.message}\n${e.stack}` : String(e) })
}
await post('/__done', {})
log.textContent = 'done'

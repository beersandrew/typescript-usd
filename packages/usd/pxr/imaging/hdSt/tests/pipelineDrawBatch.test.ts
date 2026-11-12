// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/pipelineDrawBatch.cpp,
//  pxr/imaging/hdSt/pipelineDrawBatch.h,
//  pxr/imaging/hdSt/testenv/testHdStDepthBias.cpp
// Copyright 2021, 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HdSt_PipelineDrawBatch (pxr/imaging/hdSt/pipelineDrawBatch.{h,cpp}) over
// the draw items of upstream's testHdStDepthBias
// (pxr/imaging/hdSt/testenv/testHdStDepthBias.cpp): two render passes, /white
// then /black, one cube each, so one batch of one draw item per pass.
//
// The draw command buffers are compared with the reference build's
// HDST_DRAW output (tests/fixtures/pipelineDrawBatch, captured
// on hgiMetal, Apple M4 Pro). The Hgi calls are recorded by
// tests/pipelineDrawBatchTestHgi.ts, which reports that device's
// capabilities; their expected order and arguments are upstream's code, cited
// at each expectation.
//
// This is a controller (Node) test: no GPU, no browser.

import { readFileSync } from 'node:fs'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { Matrix4d as GfMatrix4d, Matrix4f as GfMatrix4f, Vec3f as GfVec3f, Vec3i as GfVec3i, Vec4f as GfVec4f } from 'typescript-usd/gf'
import { Token as TfToken } from 'typescript-usd/tf'
import { Array as VtArray, Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import {
  BufferArrayUsageHintBits as HdBufferArrayUsageHintBits,
  CompareFunction as HdCompareFunction,
  CullStyle as HdCullStyle,
  Interpolation as HdInterpolation,
  MeshGeomStyle as HdMeshGeomStyle,
  MeshReprDescTokens as HdMeshReprDescTokens,
  PerfLog as HdPerfLog,
  RprimSharedData as HdRprimSharedData,
  Tokens as HdTokens,
  VtBufferSource as HdVtBufferSource,
  type BufferSource as HdBufferSource,
} from 'typescript-usd/hd'
import {
  HgiCompareFunction,
  HgiComputeDispatch,
  HgiCullMode,
  HgiDeviceCapabilitiesBits,
  HgiShaderStageBits,
  HgiVertexBufferStepFunction,
  type HgiComputePipelineDesc,
  type HgiGraphicsPipelineDesc,
  type HgiResourceBindingsDesc,
  type HgiVertexBufferBinding,
} from 'typescript-usd/hgi'
import { HioGlslfx } from 'typescript-usd/hio'
import { HdSt_DrawBatchValidationResult } from '../src/drawBatch.ts'
import { HdStDrawItem } from '../src/drawItem.ts'
import { HdStDrawItemInstance } from '../src/drawItemInstance.ts'
import {
  HdSt_GeometricShader,
  HdSt_GeometricShaderFvarPatchType,
  HdSt_GeometricShaderPrimitiveType,
} from '../src/geometricShader.ts'
import { HdStGLSLFXShader } from '../src/glslfxShader.ts'
import { HdSt_MeshShaderKey, HdSt_MeshShaderKeyNormalSource } from '../src/meshShaderKey.ts'
import { HdStPackageFallbackMaterialNetworkShader } from '../src/package.ts'
import { HdSt_PipelineDrawBatch, _GetDrawCommandTraits } from '../src/pipelineDrawBatch.ts'
import { HdStRenderPassState } from '../src/renderPassState.ts'
import { HdStResourceRegistry } from '../src/resourceRegistry.ts'
import { HdSt_RegisterShaderResources } from '../src/shaderResources.ts'
import { HdStMaterialTagTokens } from '../src/tokens.ts'
import { Hdx_RegisterShaderResources } from '../../hdx/src/shaderResources.ts'
import { DepthBiasCodegenInputs } from './depthBiasCodegenPrograms.ts'
import { PipelineDrawBatchTestHgi, type PipelineDrawBatchTestCall } from './pipelineDrawBatchTestHgi.ts'

interface CapturedBatch {
  commands: number[][]
  numUInt32: number
  useDrawIndexed: number
  useInstanceCulling: number
  numDrawItems: number
  numVisible: number
  totalElements: number
  totalVerts: number
}
const captured = (JSON.parse(readFileSync(
  new URL('./fixtures/pipelineDrawBatch/batches.json', import.meta.url), 'utf8')) as {
  payload: { batches: CapturedBatch[] }
}).payload.batches
/** testHdStDepthBias.cpp:41-51: render pass 0 draws /white, pass 1 /black. */
const [capturedWhite, capturedBlack] = captured as [CapturedBatch, CapturedBatch]

const { HdBufferArrayUsageHintBitsStorage: Storage, HdBufferArrayUsageHintBitsVertex: Vertex,
  HdBufferArrayUsageHintBitsIndex: Index } = HdBufferArrayUsageHintBits

/** hd/unitTestDelegate.cpp AddCube: 8 points, 6 quads; triangulated
 *  (triangulate.cpp) to 12 triangles. Only the element counts matter to the
 *  batch; contents are not read. */
const CUBE_POINTS = 8
const CUBE_TRIANGLES = 12

function arraySource(name: TfToken, items: unknown[], type: (typeof VtValueTypes)[keyof typeof VtValueTypes]): HdBufferSource {
  return new HdVtBufferSource(name, VtValue.createArray(new VtArray(items, type)))
}

interface Scene {
  hgi: PipelineDrawBatchTestHgi
  registry: HdStResourceRegistry
  white: HdStDrawItem
  black: HdStDrawItem
}

/** The draw items HdStMesh builds for testHdStDepthBias's two cubes (inputs
 *  as tests/depthBiasCodegenPrograms.ts, which cites their sources). */
function BuildScene(configure?: (hgi: PipelineDrawBatchTestHgi) => void): Scene {
  const hgi = new PipelineDrawBatchTestHgi()
  configure?.(hgi)
  const registry = new HdStResourceRegistry(hgi)
  const caps = hgi.getCapabilities()
  const doublesSupported = caps.isSet(
    HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsShaderDoublePrecision)

  // The two cubes have the same topology and points, so they share the
  // topology range (mesh.cpp:808-830, RegisterMeshIndexRange) and the vertex
  // primvar range (mesh.cpp:2522-2545, RegisterPrimvarRange).
  const topologyBar = registry.allocateNonUniformBufferArrayRange(HdTokens.topology,
    DepthBiasCodegenInputs.topologySpecs(), Index | Storage)!
  registry.addSources(topologyBar, [
    arraySource(HdTokens.indices, Array.from({ length: CUBE_TRIANGLES }, () => new GfVec3i(0, 0, 0)), VtValueTypes.GfVec3i),
    arraySource(HdTokens.primitiveParam, new Array(CUBE_TRIANGLES).fill(0), VtValueTypes.int),
    arraySource(HdTokens.edgeIndices, new Array(CUBE_TRIANGLES).fill(0), VtValueTypes.int),
  ])
  const vertexBar = registry.allocateNonUniformImmutableBufferArrayRange(HdTokens.primvar,
    DepthBiasCodegenInputs.vertexPrimvarSpecs(), Vertex | Storage)!
  registry.addSources(vertexBar, [
    arraySource(HdTokens.points, Array.from({ length: CUBE_POINTS }, () => new GfVec3f(0, 0, 0)), VtValueTypes.GfVec3f),
  ])

  // The fallback material sprim's shader (renderDelegate.cpp:561-573),
  // shared by both cubes; the geometric shader is deduplicated by key
  // (geometricShader.cpp:342-374).
  const materialNetworkShader = new HdStGLSLFXShader(
    new HioGlslfx(HdStPackageFallbackMaterialNetworkShader()))
  const meshKey = new HdSt_MeshShaderKey(
    HdSt_GeometricShaderPrimitiveType.PRIM_MESH_COARSE_TRIANGLES,
    TfToken(HdMeshReprDescTokens.surfaceShader),
    HdSt_MeshShaderKeyNormalSource.NormalSourceFlatGeometric,
    HdInterpolation.HdInterpolationVertex,
    HdCullStyle.HdCullStyleDontCare,
    HdMeshGeomStyle.HdMeshGeomStyleHull,
    HdSt_GeometricShaderFvarPatchType.PATCH_COARSE_TRIANGLES,
    /*lineWidth=*/0,
    /*doubleSided=*/false,
    caps.isSet(HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsBuiltinBarycentrics),
    caps.isSet(HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsMetalTessellation),
    false, false, false, false, false, false,
    /*enableScalarOverride=*/true,
    /*pointsShadingEnabled=*/false,
    /*forceOpaqueEdges=*/true,
    /*surfaceEdgeIds=*/false,
    caps.isSet(HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsRoundPoints))

  // HdRenderIndex syncs rprims in sorted path order (renderIndex.h:606,
  // Hd_SortedIds), so /black/cube's constant primvars are allocated before
  // /white/cube's (primUtils.cpp:1072-1075).
  const makeItem = (id: string, color: number): HdStDrawItem => {
    const sharedData = new HdRprimSharedData(8)
    sharedData.rprimID = id
    const drawItem = new HdStDrawItem(sharedData)
    const dc = drawItem.getDrawingCoord()
    const constantBar = registry.allocateShaderStorageBufferArrayRange(HdTokens.primvar,
      DepthBiasCodegenInputs.constantPrimvarSpecs(doublesSupported), Storage)!
    registry.addSources(constantBar, [
      new HdVtBufferSource(HdTokens.transform, new GfMatrix4d(1), doublesSupported),
      new HdVtBufferSource(HdTokens.transformInverse, new GfMatrix4d(1), doublesSupported),
      new HdVtBufferSource(HdTokens.bboxLocalMin, VtValue.create(new GfVec4f(-1, -1, -1, 1), VtValueTypes.GfVec4f)),
      new HdVtBufferSource(HdTokens.bboxLocalMax, VtValue.create(new GfVec4f(1, 1, 1, 1), VtValueTypes.GfVec4f)),
      new HdVtBufferSource(HdTokens.primID, VtValue.create(0, VtValueTypes.int)),
      new HdVtBufferSource(HdTokens.displayColor, VtValue.create(new GfVec3f(color, color, color), VtValueTypes.GfVec3f)),
      new HdVtBufferSource(HdTokens.displayOpacity, VtValue.create(1, VtValueTypes.float)),
    ])
    sharedData.barContainer.Set(dc.getConstantPrimvarIndex(), constantBar)
    sharedData.barContainer.Set(dc.getVertexPrimvarIndex(), vertexBar)
    sharedData.barContainer.Set(dc.getTopologyIndex(), topologyBar)
    drawItem.setMaterialTag(HdStMaterialTagTokens.masked)
    drawItem.setMaterialNetworkShader(materialNetworkShader)
    drawItem.setGeometricShader(HdSt_GeometricShader.create(meshKey, registry))
    return drawItem
  }
  const black = makeItem('/black/cube', 0)
  const white = makeItem('/white/cube', 1)
  registry.commit()
  return { hgi, registry, white, black }
}

/** testHdStDepthBias.cpp:29-37, 63: the second render pass state, drawn
 *  with depth bias enabled. */
function MakeRenderPassState(registry: HdStResourceRegistry, enableDepthBias: boolean): HdStRenderPassState {
  const state = new HdStRenderPassState()
  state.setDepthFunc(HdCompareFunction.HdCmpFuncLess)
  state.setCullStyle(HdCullStyle.HdCullStyleNothing)
  state.setDepthBiasUseDefault(false)
  state.setDepthBias(-1, 0)
  state.setDepthBiasEnabled(enableDepthBias)
  state.Prepare(registry)
  registry.commit()
  return state
}

/** The batch calls of HdStCommandBuffer::PrepareDraw / ExecuteDraw
 *  (commandBuffer.cpp:325-348, 369-373) for a single batch. */
async function RunBatch(scene: Scene, batch: HdSt_PipelineDrawBatch,
  state: HdStRenderPassState): Promise<PipelineDrawBatchTestCall[]> {
  const { hgi, registry } = scene
  const start = hgi.calls.length
  batch.prepareDraw(null, state, registry)
  batch.encodeDraw(state, registry, /*firstDrawBatch=*/true)
  await registry.submitComputeWork()
  const gfxCmds = hgi.createGraphicsCmds()
  batch.executeDraw(gfxCmds, state, registry, /*firstDrawBatch=*/true)
  return hgi.calls.slice(start)
}

const names = (calls: PipelineDrawBatchTestCall[]) => calls.map((c) => c.call)
const find = (calls: PipelineDrawBatchTestCall[], call: string) => calls.filter((c) => c.call === call)

beforeAll(() => {
  // mesh.glslfx imports $TOOLS/hdx/shaders/selection.glslfx.
  HdSt_RegisterShaderResources()
  Hdx_RegisterShaderResources()
})

describe('HdSt_PipelineDrawBatch over testHdStDepthBias (hgiMetal, Apple M4 Pro)', () => {
  it('is enabled with GPU frustum culling on the reference device', () => {
    const hgi = new PipelineDrawBatchTestHgi()
    // pipelineDrawBatch.cpp:155-173: Hgi resource generation; both env
    // settings default to true.
    expect(HdSt_PipelineDrawBatch.isEnabled(hgi)).toBe(true)
    expect(HdSt_PipelineDrawBatch.isEnabledGPUFrustumCulling()).toBe(true)
    expect(HdSt_PipelineDrawBatch.isEnabledGPUCountVisibleInstances()).toBe(false)
  })

  for (const [name, expected, pick] of [
    ['/white/cube (render pass 0)', capturedWhite, (s: Scene) => s.white],
    ['/black/cube (render pass 1)', capturedBlack, (s: Scene) => s.black],
  ] as const) {
    it(`builds the native draw command buffer for ${name}`, () => {
      const scene = BuildScene()
      const state = MakeRenderPassState(scene.registry, true)
      const batch = new HdSt_PipelineDrawBatch(new HdStDrawItemInstance(pick(scene)))
      batch.prepareDraw(null, state, scene.registry)

      expect([batch._getDrawCommandBuffer()]).toEqual(expected.commands)
      const dispatch = batch._getDispatchBuffer()!
      expect(dispatch.getCount()).toBe(expected.numDrawItems)
      expect(dispatch.getCommandNumUints()).toBe(expected.numUInt32)
      // pipelineDrawBatch.cpp:864-877: the culling input is a copy.
      const cullInput = batch._getDispatchBufferCullInput()!
      expect(cullInput.getCount()).toBe(expected.numDrawItems)
      expect(cullInput.getCommandNumUints()).toBe(expected.numUInt32)
    })
  }

  it('uploads the command buffer to both dispatch buffers', async () => {
    const scene = BuildScene()
    const state = MakeRenderPassState(scene.registry, true)
    const batch = new HdSt_PipelineDrawBatch(new HdStDrawItemInstance(scene.white))
    batch.prepareDraw(null, state, scene.registry)
    await scene.registry.submitBlitWork()
    for (const db of [batch._getDispatchBuffer()!, batch._getDispatchBufferCullInput()!]) {
      const buf = db.getEntireResource().getHandle().Get() as unknown as { bytes: Uint8Array }
      expect(Array.from(new Uint32Array(buf.bytes.slice().buffer))).toEqual(capturedWhite.commands[0])
    }
  })

  it('adds the drawing coordinate views of _AddDrawResourceViews', () => {
    const scene = BuildScene()
    const state = MakeRenderPassState(scene.registry, true)
    const batch = new HdSt_PipelineDrawBatch(new HdStDrawItemInstance(scene.white))
    batch.prepareDraw(null, state, scene.registry)
    // pipelineDrawBatch.cpp:459-485 with _DrawIndexedCommand's traits
    // (:422-457), 32-byte aligned for Metal tessellation (:617-619).
    const traits = _GetDrawCommandTraits(0, true, false, 8)
    const views = batch._getDispatchBuffer()!.getResources().map(([n, r]) =>
      [n, r.getOffset(), r.getStride(), r.getTupleType().count])
    const stride = capturedWhite.numUInt32 * 4
    expect(views).toEqual([
      [HdTokens.drawDispatch, traits.count_offset, stride, 1],
      [HdTokens.drawingCoord0, traits.drawingCoord0_offset, stride, 1],
      [HdTokens.drawingCoord1, traits.drawingCoord1_offset, stride, 1],
      [HdTokens.drawingCoord2, traits.drawingCoord2_offset, stride, 1],
    ])
  })

  it('records PrepareDraw / EncodeDraw / ExecuteDraw Hgi calls in upstream order (ICB path)', async () => {
    const scene = BuildScene()
    const state = MakeRenderPassState(scene.registry, true)
    const batch = new HdSt_PipelineDrawBatch(new HdStDrawItemInstance(scene.white))
    const calls = names(await RunBatch(scene, batch, state))
      .filter((c) => c !== 'hgi.CreateShaderFunction' && c !== 'hgi.CreateShaderProgram')
    expect(calls).toEqual([
      // PrepareDraw -> _CompileBatch (pipelineDrawBatch.cpp:842-877): the
      // dispatch buffer and its culling copy, each created
      // (dispatchBuffer.cpp:158-192) and filled by a blit
      // (dispatchBuffer.cpp:201-221).
      'hgi.CreateBuffer', 'hgi.CreateBlitCmds', 'hgi.SubmitCmds',
      'hgi.CreateBuffer', 'hgi.CreateBlitCmds', 'hgi.SubmitCmds',
      // _ExecuteFrustumCull (pipelineDrawBatch.cpp:1680-1785): culling
      // program, pipeline, global compute cmds, bindings, dispatch.
      'hgi.CreateComputePipeline',
      'hgi.CreateComputeCmds',
      'compute.PushDebugGroup',
      'hgi.CreateResourceBindings',
      'compute.BindResources',
      'compute.BindPipeline',
      'compute.SetConstantValues',
      'compute.Dispatch',
      'compute.PopDebugGroup',
      'hgi.DestroyResourceBindings',
      // EncodeDraw (pipelineDrawBatch.cpp:995-1018): IndirectCommandBuffers
      // is set and multisampling is on, so _PrepareIndirectCommandBuffer
      // (:1587-1658) builds the draw pipeline and encodes the draws.
      'hgi.CreateGraphicsPipeline',
      'hgi.CreateResourceBindings',
      'encoder.EncodeDrawIndexed',
      // commandBuffer.cpp:348
      'hgi.SubmitCmds',
      'hgi.CreateGraphicsCmds',
      // ExecuteDraw (pipelineDrawBatch.cpp:1391-1397)
      'encoder.ExecuteDraw',
      'hgi.DestroyResourceBindings',
    ])
  })

  it('compiles the culling program before the drawing program', async () => {
    const scene = BuildScene()
    const state = MakeRenderPassState(scene.registry, true)
    const batch = new HdSt_PipelineDrawBatch(new HdStDrawItemInstance(scene.white))
    await RunBatch(scene, batch, state)
    // As the native HDST_DUMP_SHADER_SOURCE capture (program0 compute,
    // program1 VS/PTVS/FS, tests/fixtures/depthBiasCodegen).
    expect(scene.hgi.shaderFunctionDescs.map((d) => d.shaderStage)).toEqual([
      HgiShaderStageBits.HgiShaderStageCompute,
      HgiShaderStageBits.HgiShaderStageVertex,
      HgiShaderStageBits.HgiShaderStagePostTessellationVertex,
      HgiShaderStageBits.HgiShaderStageFragment,
    ])
    expect(batch._getCullingProgram().isValid()).toBe(true)
    // _CreateCullingProgram (pipelineDrawBatch.cpp:1971-2000) produces the
    // native program0 text (glslProgram.cpp:149-170 dump order).
    const cull = scene.hgi.shaderFunctionDescs[0]!
    expect((cull.shaderCodeDeclarations ?? '') + (cull.shaderCode ?? '')).toBe(readFileSync(
      new URL('./fixtures/depthBiasCodegen/program0_COMPUTE_SHADER.glsl', import.meta.url), 'utf8'))
  })

  it('dispatches the frustum cull with upstream uniforms and compute bindings', async () => {
    const scene = BuildScene()
    const state = MakeRenderPassState(scene.registry, true)
    const batch = new HdSt_PipelineDrawBatch(new HdStDrawItemInstance(scene.white))
    const calls = await RunBatch(scene, batch, state)

    // pipelineDrawBatch.cpp:1553-1585
    const pipeDesc = find(calls, 'hgi.CreateComputePipeline')[0]!.args[0] as HgiComputePipelineDesc
    expect(pipeDesc.debugName).toBe('FrustumCulling Pipeline')
    expect(pipeDesc.shaderConstantsDesc.byteSize).toBe(80) // sizeof(Uniforms)
    // :1711 HgiComputeDispatchConcurrent (the device supports it)
    expect(find(calls, 'hgi.CreateComputeCmds')[0]!.args[0]).toBe(HgiComputeDispatch.HgiComputeDispatchConcurrent)
    expect(find(calls, 'compute.PushDebugGroup')[0]!.args[0]).toBe('FrustumCulling Cmds')

    // :1745-1748: every buffer binding is compute stage and writable.
    const bindings = find(calls, 'hgi.CreateResourceBindings')[0]!.args[0] as HgiResourceBindingsDesc
    expect(bindings.debugName).toBe('PipelineDrawBatch.ViewTransformation')
    expect(bindings.buffers.length).toBeGreaterThan(0)
    for (const b of bindings.buffers) {
      expect(b.stageUsage).toBe(HgiShaderStageBits.HgiShaderStageCompute)
      expect(b.writable).toBe(true)
    }
    // :1727-1740: the dispatch buffer and its culling copy are bound.
    const bound = bindings.buffers.map((b) => b.buffers[0]!.getId())
    expect(bound).toContain(batch._getDispatchBuffer()!.getEntireResource().getHandle().getId())
    expect(bound).toContain(batch._getDispatchBufferCullInput()!.getEntireResource().getHandle().getId())

    // :1756-1775
    const [, bindIndex, byteSize, bytes] = find(calls, 'compute.SetConstantValues')[0]!.args as
      [unknown, number, number, Uint8Array]
    expect(bindIndex).toBe(0)
    expect(byteSize).toBe(80)
    const f32 = new Float32Array(bytes.buffer, bytes.byteOffset, 20)
    const u32 = new Uint32Array(bytes.buffer, bytes.byteOffset, 20)
    expect(Array.from(f32.slice(0, 16))).toEqual(
      Array.from(new Float32Array(new GfMatrix4f(state.getCullMatrix()).GetArray())))
    const ndc = state.getDrawingRangeNDC()
    expect(Array.from(f32.slice(16, 18))).toEqual(Array.from(new Float32Array([ndc.get(0), ndc.get(1)])))
    expect(u32[18]).toBe(capturedWhite.numUInt32) // drawCommandNumUints
    expect(u32[19]).toBe(capturedWhite.numDrawItems) // indexEnd
    expect(find(calls, 'compute.Dispatch')[0]!.args).toEqual([capturedWhite.numDrawItems, 1])
  })

  it('creates the draw pipeline with the render pass depth bias state', async () => {
    const scene = BuildScene()
    const state = MakeRenderPassState(scene.registry, /*enableDepthBias=*/true)
    const batch = new HdSt_PipelineDrawBatch(new HdStDrawItemInstance(scene.black))
    const calls = await RunBatch(scene, batch, state)
    const pipes = find(calls, 'hgi.CreateGraphicsPipeline')
    expect(pipes.length).toBe(1)
    const desc = pipes[0]!.args[0] as HgiGraphicsPipelineDesc
    // pipelineDrawBatch.cpp:1294-1303
    expect(desc.debugName).toBe('Draw Pipeline')
    // renderPassState.cpp:1174-1208 with testHdStDepthBias.cpp:34-36, 63
    expect(desc.depthState.depthTestEnabled).toBe(true)
    expect(desc.depthState.depthCompareFn).toBe(HgiCompareFunction.HgiCompareFunctionLess)
    expect(desc.depthState.depthBiasEnabled).toBe(true)
    expect(desc.depthState.depthBiasConstantFactor).toBe(-1)
    expect(desc.depthState.depthBiasSlopeFactor).toBe(0)
    // renderPassState.cpp:1236 with HdCullStyleNothing
    expect(desc.rasterizationState.cullMode).toBe(HgiCullMode.HgiCullModeNone)

    // pipelineDrawBatch.cpp:1135-1221: the dispatch buffer as per-draw
    // command vertex input, then points per patch control point (Metal
    // tessellation).
    const stride = capturedBlack.numUInt32 * 4
    expect(desc.vertexBuffers.map((b) => [b.bindingIndex, b.vertexStepFunction, b.vertexStride])).toEqual([
      [0, HgiVertexBufferStepFunction.HgiVertexBufferStepFunctionPerDrawCommand, stride],
      [1, HgiVertexBufferStepFunction.HgiVertexBufferStepFunctionPerPatchControlPoint, 12],
    ])
  })

  it('does not enable depth bias when the render pass disables it', async () => {
    const scene = BuildScene()
    const state = MakeRenderPassState(scene.registry, /*enableDepthBias=*/false)
    const batch = new HdSt_PipelineDrawBatch(new HdStDrawItemInstance(scene.black))
    const calls = await RunBatch(scene, batch, state)
    const desc = find(calls, 'hgi.CreateGraphicsPipeline')[0]!.args[0] as HgiGraphicsPipelineDesc
    // renderPassState.cpp:1185-1189
    expect(desc.depthState.depthBiasEnabled).toBe(false)
  })

  it('encodes one indexed indirect draw per batch with the command stride', async () => {
    const scene = BuildScene()
    const state = MakeRenderPassState(scene.registry, true)
    const batch = new HdSt_PipelineDrawBatch(new HdStDrawItemInstance(scene.white))
    const calls = await RunBatch(scene, batch, state)
    const enc = find(calls, 'encoder.EncodeDrawIndexed')
    expect(enc.length).toBe(1)
    const [, , vertexBindings, indexBuffer, paramBuffer, offset, drawCount, stride, patchBaseVertex] =
      enc[0]!.args as [unknown, unknown, HgiVertexBufferBinding[], { getId(): number },
        { getId(): number }, number, number, number, number]
    const dispatch = batch._getDispatchBuffer()!
    const traits = _GetDrawCommandTraits(0, true, false, 8)
    // pipelineDrawBatch.cpp:1625-1656
    expect(paramBuffer.getId()).toBe(dispatch.getEntireResource().getHandle().getId())
    expect(indexBuffer.getId()).toBe(
      (scene.white.getTopologyRange() as unknown as { getResource(n: string): { getHandle(): { getId(): number } } })
        .getResource(HdTokens.indices).getHandle().getId())
    expect(offset).toBe(traits.count_offset)
    expect(drawCount).toBe(capturedWhite.numDrawItems)
    expect(stride).toBe(capturedWhite.numUInt32 * 4)
    expect(patchBaseVertex).toBe(traits.patchBaseVertex_offset)
    // :1223-1263: the dispatch buffer at binding 0, then points.
    expect(vertexBindings.map((b) => b.index)).toEqual([0, 1])
  })

  it('draws with DrawIndexedIndirect when indirect command encoding is not used', async () => {
    // pipelineDrawBatch.cpp:1008-1011: no ICB without multisampling.
    const scene = BuildScene()
    const state = MakeRenderPassState(scene.registry, true)
    state.setMultiSampleEnabled(false)
    const batch = new HdSt_PipelineDrawBatch(new HdStDrawItemInstance(scene.white))
    const calls = await RunBatch(scene, batch, state)
    expect(find(calls, 'encoder.EncodeDrawIndexed').length).toBe(0)
    const executeCalls = names(calls.slice(names(calls).indexOf('hgi.CreateGraphicsCmds') + 1))
    // pipelineDrawBatch.cpp:1399-1445; the drawing program is first
    // compiled here (drawBatch.cpp:337-416): VS, PTVS, FS and the program.
    expect(executeCalls).toEqual([
      'hgi.CreateShaderFunction',
      'hgi.CreateShaderFunction',
      'hgi.CreateShaderFunction',
      'hgi.CreateShaderProgram',
      'hgi.CreateGraphicsPipeline',
      'gfx.BindPipeline',
      'hgi.CreateResourceBindings',
      'gfx.BindResources',
      'gfx.BindVertexBuffers',
      'gfx.DrawIndexedIndirect',
      'hgi.DestroyResourceBindings',
    ])
    const traits = _GetDrawCommandTraits(0, true, false, 8)
    const [, , offset, drawCount, stride, commands, patchBaseVertex] =
      find(calls, 'gfx.DrawIndexedIndirect')[0]!.args as [unknown, unknown, number, number, number, number[], number]
    // :1474-1481
    expect(offset).toBe(traits.count_offset)
    expect(drawCount).toBe(capturedWhite.numDrawItems)
    expect(stride).toBe(capturedWhite.numUInt32 * 4)
    expect([commands]).toEqual(capturedWhite.commands)
    expect(patchBaseVertex).toBe(traits.patchBaseVertex_offset)
  })

  it('draws immediately when the device has no multi-draw-indirect', async () => {
    const scene = BuildScene((hgi) => {
      hgi.capabilities.setFlag(HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsMultiDrawIndirect, false)
      hgi.capabilities.setFlag(HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsIndirectCommandBuffers, false)
      hgi.indirectCommandEncoder = null
    })
    const state = MakeRenderPassState(scene.registry, true)
    const batch = new HdSt_PipelineDrawBatch(new HdStDrawItemInstance(scene.white))
    const calls = await RunBatch(scene, batch, state)
    // pipelineDrawBatch.cpp:1514-1534: Metal tessellation reads the
    // metalPatch encoding (patchCount, instanceCount, patchStart,
    // baseInstance, baseVertex) of each command.
    const [cmd] = capturedWhite.commands as [number[]]
    const draws = find(calls, 'gfx.DrawIndexed')
    expect(draws.map((d) => d.args.slice(1))).toEqual([
      [cmd[0], cmd[2]! * 4, cmd[4], cmd[1], cmd[3]],
    ])
  })

  it('validates an unchanged batch and stops drawing an invisible instance', async () => {
    const scene = BuildScene()
    const state = MakeRenderPassState(scene.registry, true)
    const instance = new HdStDrawItemInstance(scene.white)
    const batch = new HdSt_PipelineDrawBatch(instance)
    await RunBatch(scene, batch, state)
    // pipelineDrawBatch.cpp:880-947
    expect(batch.validate(true)).toBe(HdSt_DrawBatchValidationResult.ValidBatch)

    // drawItemInstance.cpp:27-36 -> pipelineDrawBatch.cpp:1856-1899
    instance.setVisible(false)
    const traits = _GetDrawCommandTraits(0, true, false, 8)
    expect(batch._getDrawCommandBuffer()[traits.instanceCount_offset / 4]).toBe(0)
    // :972, :1374: nothing to draw.
    const calls = await RunBatch(scene, batch, state)
    expect(names(calls).filter((c) => c.startsWith('compute.') || c.startsWith('gfx.') ||
      c.startsWith('encoder.'))).toEqual([])
  })

  describe('with HD_ENABLE_GPU_COUNT_VISIBLE_INSTANCES', () => {
    const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env
    afterEach(() => { delete env.HD_ENABLE_GPU_COUNT_VISIBLE_INSTANCES })

    // pipelineDrawBatch.cpp:1932-1956 blocks until the result buffer is read
    // back, so the ExecuteDraw of the same frame adds the read-back count.
    // GPU read-back is asynchronous here
    // (PLATFORM-DIVERGENCE(hdst-gpu-count-visible-readback)): the count
    // lands when the submission completes, and the check awaits it before
    // ExecuteDraw.
    it('reports the read-back visible count when ExecuteDraw runs', async () => {
      env.HD_ENABLE_GPU_COUNT_VISIBLE_INSTANCES = '1'
      const perfLog = HdPerfLog.GetInstance()
      perfLog.enable()
      const scene = BuildScene()
      const state = MakeRenderPassState(scene.registry, true)
      const batch = new HdSt_PipelineDrawBatch(new HdStDrawItemInstance(scene.white))
      perfLog.setCounter(HdTokens.itemsDrawn, 0)
      const { registry } = scene
      batch.prepareDraw(null, state, registry)
      batch.encodeDraw(state, registry, true)
      // The read-back submission completes.
      await new Promise(resolve => setTimeout(resolve, 0))
      batch.executeDraw(scene.hgi.createGraphicsCmds(), state, registry, true)
      // No compute ran on this Hgi, so the result buffer holds the 0 written
      // by _BeginGPUCountVisibleInstances (:1916-1925), and ExecuteDraw adds
      // that count (:1449).
      const itemsDrawn = perfLog.getCounter(HdTokens.itemsDrawn)
      perfLog.disable()
      expect(itemsDrawn).toBe(0)
    })
  })
})

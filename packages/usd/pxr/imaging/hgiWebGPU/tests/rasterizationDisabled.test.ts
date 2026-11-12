// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/pipelineDrawBatch.cpp,
//  pxr/imaging/hgiMetal/graphicsPipeline.mm,
//  pxr/imaging/hgiVulkan/graphicsPipeline.cpp
// Copyright 2020, 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HgiWebGPUGraphicsPipeline with rasterizationState.rasterizerEnabled false
// outside the post-tessellation control stage, and alpha to coverage
// without a fragment function. hgiMetal/graphicsPipeline.mm:239-246 builds
// such a pipeline with rasterizationEnabled NO and no fragment function, and
// sets alphaToCoverageEnabled from the multisample state alone (:304-309);
// hgiVulkan/graphicsPipeline.cpp:191 sets rasterizerDiscardEnable, under
// which Vulkan ignores the multisample state. Either way the draws produce
// no fragments. WebGPU rejects alpha to coverage without a fragment state
// ("Using alphaToCoverage requires a fragment state"), and a WebGPU vertex
// stage writes no memory, so HgiWebGPU creates no GPURenderPipeline for it
// and records its draws as nothing. Storm draws one when a pipeline draw
// batch keeps its tessFactors buffer after its items stop being patches
// (hdSt/pipelineDrawBatch.cpp:849-856, :1379-1385): the viewer's complexity
// round trip with refined curves, which the asset acceptance harness checks
// in Safari against the reference build (apps/usdview/scripts/
// asset-acceptance/assets.json curves_complexity_round_trip). Controller
// (Node) test with a fake GPUDevice that records the pipelines it is asked
// for and the render pass commands.
import { describe, expect, it } from 'vitest'
import {
  HgiAttachmentDesc,
  HgiFormat,
  HgiGraphicsCmdsDesc,
  HgiGraphicsPipelineDesc,
  HgiHandle,
  HgiPrimitiveType,
  HgiSampleCount,
  HgiShaderStageBits,
  HgiTextureDesc,
  HgiTextureUsageBits,
  type HgiShaderProgram,
} from 'typescript-usd/hgi'
import { Vec3i as GfVec3i } from 'typescript-usd/gf'
import { HgiWebGPU } from '../src/index.ts'
import { HgiWebGPUGraphicsPipeline } from '../src/graphicsPipeline.ts'

function fakeFunction(stage: number) {
  return {
    getDescriptor: () => ({ shaderStage: stage, stageOutputs: [] }),
    getShaderId: () => ({ label: `module ${stage}` }),
    getEntryPoint: () => 'main',
    getBindGroupLayoutInfo: () => [],
    getPostTessVertexInfo: () => null,
    getColorOutputLocations: () => [0],
    getPolygonModeLineVariant: () => null,
    isValid: () => true,
  }
}

function fakeProgram(withFragment: boolean): HgiHandle<HgiShaderProgram> {
  const vertex = fakeFunction(HgiShaderStageBits.HgiShaderStageVertex)
  const fragment = withFragment ? fakeFunction(HgiShaderStageBits.HgiShaderStageFragment) : null
  const program = {
    getVertexFunction: () => vertex,
    getFragmentFunction: () => fragment,
    getPostTessControlFunction: () => null,
    getPostTessVertexFunction: () => null,
    getShaderFunctions: () => [vertex, fragment].filter(f => f).map(f => new HgiHandle(f)),
  }
  return new HgiHandle(program as unknown as HgiShaderProgram, 1)
}

function fakeDevice() {
  const pipelines: GPURenderPipelineDescriptor[] = []
  const pass: string[] = []
  const encoder = new Proxy({}, {
    get: (_t, name: string) => (...args: unknown[]) => {
      pass.push(name)
      if (name === 'end') return undefined
      void args
      return undefined
    },
  })
  const device = {
    features: new Set<string>(),
    limits: {
      maxUniformBufferBindingSize: 65536, maxStorageBufferBindingSize: 134217728,
      minUniformBufferOffsetAlignment: 256, minStorageBufferOffsetAlignment: 256,
      maxComputeWorkgroupsPerDimension: 65535, maxSamplersPerShaderStage: 16,
    },
    queue: { submit() {}, writeBuffer() {}, writeTexture() {}, onSubmittedWorkDone: () => Promise.resolve() },
    createBuffer: (d: GPUBufferDescriptor) => ({ label: d.label, destroy() {}, getMappedRange: () => new ArrayBuffer(d.size), unmap() {} }),
    createTexture: (d: GPUTextureDescriptor) => ({ ...d, createView: () => ({}), destroy() {} }),
    createSampler: () => ({}),
    createBindGroupLayout: () => ({}),
    createBindGroup: () => ({}),
    createPipelineLayout: () => ({}),
    createRenderPipeline: (d: GPURenderPipelineDescriptor) => { pipelines.push(d); return { label: d.label } },
    createComputePipeline: () => ({}),
    createCommandEncoder: () => ({ beginRenderPass: () => encoder, finish: () => ({}) }),
    destroy() {},
  }
  return { device: device as unknown as GPUDevice, pipelines, pass }
}

function pipelineDesc(rasterizerEnabled: boolean, withFragment: boolean): HgiGraphicsPipelineDesc {
  // As HdStRenderPassState::InitGraphicsPipelineDesc leaves it with the
  // viewer's MSAA and alpha to coverage (hdSt/renderPassState.cpp,
  // _InitMultiSampleState), and _GetPTCSPipeline's rasterizerEnabled.
  const desc = new HgiGraphicsPipelineDesc()
  desc.debugName = 'PTCS Pipeline'
  desc.primitiveType = HgiPrimitiveType.HgiPrimitiveTypeLineList
  desc.shaderProgram = fakeProgram(withFragment)
  desc.multiSampleState.sampleCount = HgiSampleCount.HgiSampleCount4
  desc.multiSampleState.multiSampleEnable = true
  desc.multiSampleState.alphaToCoverageEnable = true
  desc.rasterizationState.rasterizerEnabled = rasterizerEnabled
  const color = new HgiAttachmentDesc()
  color.format = HgiFormat.HgiFormatFloat16Vec4
  color.usage = HgiTextureUsageBits.HgiTextureUsageBitsColorTarget
  desc.colorAttachmentDescs = [color]
  const depth = new HgiAttachmentDesc()
  depth.format = HgiFormat.HgiFormatFloat32
  depth.usage = HgiTextureUsageBits.HgiTextureUsageBitsDepthTarget
  desc.depthAttachmentDesc = depth
  return desc
}

describe('HgiWebGPUGraphicsPipeline without rasterization', () => {
  it('creates no render pipeline (no fragments; alpha to coverage would need a fragment state)', () => {
    const { device, pipelines } = fakeDevice()
    const pipeline = new HgiWebGPUGraphicsPipeline(device, pipelineDesc(false, true), { unclippedDepth: false })
    expect(pipelines).toHaveLength(0)
    expect(pipeline.isRasterizationDisabled()).toBe(true)
    expect(pipeline.getRenderPipelineState()).toBeNull()
  })

  it('keeps alpha to coverage for a rasterized draw with a fragment function', () => {
    const { device, pipelines } = fakeDevice()
    const pipeline = new HgiWebGPUGraphicsPipeline(device, pipelineDesc(true, true), { unclippedDepth: false })
    expect(pipeline.isRasterizationDisabled()).toBe(false)
    expect(pipelines).toHaveLength(1)
    expect(pipelines[0]!.fragment).toBeDefined()
    expect(pipelines[0]!.multisample?.alphaToCoverageEnabled).toBe(true)
  })

  it('drops alpha to coverage when the program has no fragment function', () => {
    const { device, pipelines } = fakeDevice()
    new HgiWebGPUGraphicsPipeline(device, pipelineDesc(true, false), { unclippedDepth: false })
    expect(pipelines).toHaveLength(1)
    expect(pipelines[0]!.fragment).toBeUndefined()
    expect(pipelines[0]!.multisample?.alphaToCoverageEnabled).toBe(false)
  })

  it('records the draws of a rasterizer-disabled pipeline as nothing, and the next pipeline draws', () => {
    const { device, pass } = fakeDevice()
    const hgi = new HgiWebGPU(device)
    const depthDesc = new HgiTextureDesc()
    depthDesc.debugName = 'depth'
    depthDesc.format = HgiFormat.HgiFormatFloat32
    depthDesc.usage = HgiTextureUsageBits.HgiTextureUsageBitsDepthTarget
    depthDesc.dimensions = new GfVec3i(4, 4, 1)
    const cmdsDesc = new HgiGraphicsCmdsDesc()
    cmdsDesc.depthTexture = hgi.createTexture(depthDesc)
    cmdsDesc.depthAttachmentDesc.format = HgiFormat.HgiFormatFloat32
    const cmds = hgi.createGraphicsCmds(cmdsDesc)

    const noRaster = hgi.CreateGraphicsPipeline(pipelineDesc(false, true))
    cmds.bindPipeline(noRaster)
    cmds.draw(6, 0, 1, 0)
    expect(pass).toEqual([])

    const draw = hgi.CreateGraphicsPipeline(pipelineDesc(true, true))
    cmds.bindPipeline(draw)
    cmds.draw(6, 0, 1, 0)
    expect(pass).toContain('setPipeline')
    expect(pass.at(-1)).toBe('draw')
  })
})

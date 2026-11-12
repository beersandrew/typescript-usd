// Ported from OpenUSD 26.11.1: pxr/imaging/hgiMetal/graphicsPipeline.mm
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// PLATFORM-DIVERGENCE(hgiwebgpu-pipeline-ahead) (src/graphicsPipeline.ts):
// a graphics pipeline created ahead of its first draw is compiled with
// createRenderPipelineAsync and used once compiled; a first use before then
// creates it synchronously, as CreateGraphicsPipeline always does
// (hgiMetal/graphicsPipeline.mm:23-35). Controller (Node) test with a fake
// GPUDevice that records the pipelines it is asked for.
import { describe, expect, it } from 'vitest'
import {
  HgiAttachmentDesc,
  HgiFormat,
  HgiGraphicsPipelineDesc,
  HgiHandle,
  HgiPrimitiveType,
  HgiSampleCount,
  HgiShaderStageBits,
  HgiTextureUsageBits,
  type HgiShaderProgram,
} from 'typescript-usd/hgi'
import { HgiWebGPU } from '../src/index.ts'
import type { HgiWebGPUGraphicsPipeline } from '../src/graphicsPipeline.ts'

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
  const asyncPipelines: GPURenderPipelineDescriptor[] = []
  const resolveAsync: (() => void)[] = []
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
    createRenderPipelineAsync: (d: GPURenderPipelineDescriptor) => { asyncPipelines.push(d); return new Promise(resolve => { resolveAsync.push(() => resolve({ label: `async ${d.label}` })) }) },
    createComputePipeline: () => ({}),
    createCommandEncoder: () => ({ beginRenderPass: () => encoder, finish: () => ({}) }),
    destroy() {},
  }
  return { device: device as unknown as GPUDevice, pipelines, asyncPipelines, resolveAsync, pass }
}

function pipelineDesc(): HgiGraphicsPipelineDesc {
  const desc = new HgiGraphicsPipelineDesc()
  desc.debugName = 'Draw Pipeline'
  desc.primitiveType = HgiPrimitiveType.HgiPrimitiveTypeTriangleList
  desc.shaderProgram = fakeProgram(true)
  desc.multiSampleState.sampleCount = HgiSampleCount.HgiSampleCount4
  const color = new HgiAttachmentDesc()
  color.format = HgiFormat.HgiFormatFloat16Vec4
  color.usage = HgiTextureUsageBits.HgiTextureUsageBitsColorTarget
  desc.colorAttachmentDescs = [color]
  return desc
}

describe('HgiWebGPU graphics pipelines created ahead (hgiwebgpu-pipeline-ahead)', () => {
  it('CreateGraphicsPipeline creates the render pipeline at once', () => {
    const { device, pipelines, asyncPipelines } = fakeDevice()
    const handle = new HgiWebGPU(device).CreateGraphicsPipeline(pipelineDesc())
    expect(pipelines).toHaveLength(1)
    expect(asyncPipelines).toHaveLength(0)
    expect((handle.Get() as HgiWebGPUGraphicsPipeline).getRenderPipelineState()).toEqual({ label: 'Draw Pipeline' })
  })

  it('a pipeline created ahead compiles in the background and is used once compiled', async () => {
    const { device, pipelines, asyncPipelines, resolveAsync } = fakeDevice()
    const pipeline = new HgiWebGPU(device)._createGraphicsPipelineAhead(pipelineDesc()).Get() as HgiWebGPUGraphicsPipeline
    expect(asyncPipelines).toHaveLength(1)
    expect(pipeline._isCompilingAhead()).toBe(true)
    resolveAsync[0]!()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(pipeline._isCompilingAhead()).toBe(false)
    expect(pipeline.getRenderPipelineState()).toEqual({ label: 'async Draw Pipeline' })
    expect(pipelines).toHaveLength(0)
  })

  it('a pipeline created ahead and used before it compiled is created at once, with the same descriptor', async () => {
    const { device, pipelines, asyncPipelines, resolveAsync } = fakeDevice()
    const pipeline = new HgiWebGPU(device)._createGraphicsPipelineAhead(pipelineDesc()).Get() as HgiWebGPUGraphicsPipeline
    expect(pipeline.getRenderPipelineState()).toEqual({ label: 'Draw Pipeline' })
    expect(pipelines).toEqual(asyncPipelines)
    // The background compile finishing later changes nothing.
    resolveAsync[0]!()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(pipeline.getRenderPipelineState()).toEqual({ label: 'Draw Pipeline' })
  })
})

// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/renderPassState.cpp,
//  pxr/imaging/hdSt/testenv/testHdStDisplayStyle.cpp,
//  pxr/imaging/hgiMetal/graphicsPipeline.mm
// Copyright 2016, 2020, 2023 Pixar. Tomorrow Open Source Technology License
//  1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HgiMultiSampleState alphaToOneEnable on WebGPU (src/alphaToOne.ts).
// HdStRenderPassState::_InitMultiSampleState (hdSt/renderPassState.cpp:
// 1210-1220) asks for alpha to coverage and alpha to one together, which
// hgiMetal/graphicsPipeline.mm:304-315 hands to Metal; covered samples then
// store an alpha of 1. WebGPU has no alpha to one, so the pipeline draws
// with a fragment function variant that takes the coverage from the alpha
// itself, writes it as sample_mask and sets the alpha to 1, with WebGPU's
// alpha to coverage off. hdSt testHdStDisplayStyle (cube10, constant
// displayOpacity 0.5, 4x MSAA) is the Safari case: native stores alpha 1
// where the alpha-to-coverage draw without alpha to one stored 0.75.
//
// Controller (Node) tests: no GPU, no browser (fake GPUDevice).
import { describe, expect, it } from 'vitest'
import {
  HgiAttachmentDesc,
  HgiFormat,
  HgiGraphicsPipelineDesc,
  HgiHandle,
  HgiPrimitiveType,
  HgiSampleCount,
  HgiShaderFunctionDesc,
  HgiShaderFunctionParamDesc,
  HgiShaderKeywordTokens,
  HgiShaderProgramDesc,
  HgiShaderStageBits,
  HgiTextureUsageBits,
  type HgiShaderFunction,
  type HgiShaderProgram,
} from 'typescript-usd/hgi'
import { HgiWebGPUShaderFunction, HgiWebGPUShaderProgram } from '../src/index.ts'
import { HgiWebGPUGraphicsPipeline } from '../src/graphicsPipeline.ts'
import type { HgiWebGPUShaderBodyTranslator } from '../src/shaderBodyTranslator.ts'

const translator: HgiWebGPUShaderBodyTranslator = {
  Translate() { return { declarations: '', code: 'fn main() {}\n', errors: '' } },
}
const hgi = { getShaderBodyTranslator: () => translator, isFloat32Filterable: () => true }

function fakeDevice() {
  const pipelines: GPURenderPipelineDescriptor[] = []
  const device = {
    features: new Set<string>(),
    createShaderModule: ({ code }: { code: string }) => ({ code, getCompilationInfo: () => Promise.resolve({ messages: [] }) }),
    createBindGroupLayout: () => ({}),
    createPipelineLayout: () => ({}),
    createRenderPipeline: (d: GPURenderPipelineDescriptor) => { pipelines.push(d); return { label: d.label } },
  }
  return { device: device as unknown as GPUDevice, pipelines }
}

function output(name: string, type: string, role = '') {
  const p = new HgiShaderFunctionParamDesc()
  p.nameInShader = name
  p.type = type
  p.role = role
  return p
}

function fn(device: GPUDevice, stage: HgiShaderStageBits, configure: (d: HgiShaderFunctionDesc) => void) {
  const d = new HgiShaderFunctionDesc()
  d.shaderStage = stage
  d.debugName = `stage${stage}`
  configure(d)
  d.shaderCode = 'void main(void) {}\n'
  return new HgiWebGPUShaderFunction(device, hgi, d)
}

/** Storm's mesh fragment outputs: colorOut (RenderPass.RenderColor) and
 *  primIdOut (RenderPass.RenderId), optionally gl_SampleMask. */
function pipeline(alphaToOne: boolean, sampleMask = false) {
  const { device, pipelines } = fakeDevice()
  const vs = fn(device, HgiShaderStageBits.HgiShaderStageVertex, d => {
    d.stageOutputs.push(output('gl_Position', 'vec4', 'position'))
  })
  const fs = fn(device, HgiShaderStageBits.HgiShaderStageFragment, d => {
    d.stageOutputs.push(output('colorOut', 'vec4', 'color'), output('primIdOut', 'int', 'color'))
    if (sampleMask) d.stageOutputs.push(output('gl_SampleMask', 'uint', HgiShaderKeywordTokens.hdSampleMask))
  })
  const programDesc = new HgiShaderProgramDesc()
  programDesc.shaderFunctions = [vs, fs].map((f, i) => new HgiHandle<HgiShaderFunction>(f, i + 1))
  const desc = new HgiGraphicsPipelineDesc()
  desc.debugName = 'mesh'
  desc.primitiveType = HgiPrimitiveType.HgiPrimitiveTypeTriangleList
  desc.shaderProgram = new HgiHandle<HgiShaderProgram>(new HgiWebGPUShaderProgram(programDesc), 1)
  desc.multiSampleState.sampleCount = HgiSampleCount.HgiSampleCount4
  desc.multiSampleState.multiSampleEnable = true
  // hdSt/renderPassState.cpp:1214-1219
  desc.multiSampleState.alphaToCoverageEnable = true
  desc.multiSampleState.alphaToOneEnable = alphaToOne
  for (const format of [HgiFormat.HgiFormatFloat16Vec4, HgiFormat.HgiFormatInt32]) {
    const color = new HgiAttachmentDesc()
    color.format = format
    color.usage = HgiTextureUsageBits.HgiTextureUsageBitsColorTarget
    desc.colorAttachmentDescs.push(color)
  }
  new HgiWebGPUGraphicsPipeline(device, desc, { unclippedDepth: false })
  expect(pipelines).toHaveLength(1)
  const p = pipelines[0]!
  return { pipeline: p, code: (p.fragment!.module as unknown as { code: string }).code, fs }
}

describe('HgiWebGPUGraphicsPipeline: alpha to coverage with alpha to one', () => {
  it('draws with a fragment variant that writes the coverage and an alpha of 1', () => {
    const { pipeline: p, code, fs } = pipeline(true)
    expect(p.multisample?.alphaToCoverageEnabled).toBe(false)
    expect(code).not.toBe(fs.getGeneratedCode())
    expect(code).toContain('  @builtin(position) hgi_alphaToCoverageFragCoord: vec4<f32>,\n')
    expect(code).toContain('  @builtin(sample_mask) hgi_alphaToCoverageMask: u32,\n')
    expect(code).toMatch(/\.hgi_alphaToCoverageMask = hgi_AlphaToCoverageMask\((\w+)\.colorOut\.a, \w+\.hgi_alphaToCoverageFragCoord\.xy\);\n {2}\1\.colorOut\.a = 1\.0;\n/)
    // The integer id output has no alpha.
    expect(code).not.toContain('primIdOut.a')
    // The mask is computed after the outputs are copied out.
    expect(code.indexOf('.colorOut = ')).toBeLessThan(code.indexOf('hgi_AlphaToCoverageMask(', code.indexOf('fn main')))
  })

  it('combines the coverage with a sample mask the shader writes', () => {
    const { pipeline: p, code } = pipeline(true, true)
    expect(p.multisample?.alphaToCoverageEnabled).toBe(false)
    expect(code).not.toContain('hgi_alphaToCoverageMask: u32')
    expect(code).toMatch(/(\w+)\.gl_SampleMask = \1\.gl_SampleMask & hgi_AlphaToCoverageMask\(\1\.colorOut\.a, /)
  })

  it('keeps WebGPU alpha to coverage and the function itself without alpha to one', () => {
    const { pipeline: p, code, fs } = pipeline(false)
    expect(p.multisample?.alphaToCoverageEnabled).toBe(true)
    expect(code).toBe(fs.getGeneratedCode())
    expect(code).not.toContain('hgi_AlphaToCoverageMask')
  })
})

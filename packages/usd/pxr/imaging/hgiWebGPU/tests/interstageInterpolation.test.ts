// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/shaders/basisCurves.glslfx
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HgiWebGPU's interstage interpolation matching: Storm qualifies a varying's
// sampling on the fragment input only (hdSt/shaders/basisCurves.glslfx:
// 1267-1268, `in float u` centroid, while the post-tessellation vertex
// stage's `out float u` has none), which GLSL and MSL accept and WebGPU
// rejects unless the vertex output declares the same interpolation. The
// program gives each vertex-side output the fragment input's interpolation.
//
// Controller (Node) tests: no GPU, no browser (the shader module is a stub).
import { describe, expect, it } from 'vitest'
import {
  HgiHandle,
  HgiInterpolationType,
  HgiSamplingType,
  HgiShaderFunctionDesc,
  HgiShaderFunctionParamDesc,
  HgiShaderProgramDesc,
  HgiShaderStageBits,
  type HgiShaderFunction,
} from 'typescript-usd/hgi'
import { HgiWebGPUShaderFunction, HgiWebGPUShaderProgram } from '../src/index.ts'
import type { HgiWebGPUShaderBodyTranslator } from '../src/shaderBodyTranslator.ts'

const translator: HgiWebGPUShaderBodyTranslator = {
  Translate() { return { declarations: '', code: 'fn main() {}\n', errors: '' } },
}
const hgi = { getShaderBodyTranslator: () => translator, isFloat32Filterable: () => true }
const modules: string[] = []
const device = {
  createShaderModule({ code }: { code: string }) {
    modules.push(code)
    return { getCompilationInfo: () => Promise.resolve({ messages: [] }) }
  },
} as unknown as GPUDevice

function param(name: string, slot: number, sampling = HgiSamplingType.HgiSamplingDefault) {
  const p = new HgiShaderFunctionParamDesc()
  p.nameInShader = name
  p.type = 'float'
  p.interstageSlot = slot
  p.sampling = sampling
  return p
}

function fn(stage: HgiShaderStageBits, configure: (d: HgiShaderFunctionDesc) => void) {
  const d = new HgiShaderFunctionDesc()
  d.shaderStage = stage
  d.debugName = `stage${stage}`
  configure(d)
  d.shaderCode = 'void main(void) {}\n'
  return new HgiWebGPUShaderFunction(device, hgi, d)
}

function program(...fns: HgiWebGPUShaderFunction[]) {
  const desc = new HgiShaderProgramDesc()
  desc.shaderFunctions = fns.map((f, i) => new HgiHandle<HgiShaderFunction>(f, i + 1))
  return new HgiWebGPUShaderProgram(desc)
}

describe('HgiWebGPUShaderProgram: interstage interpolation', () => {
  it('gives the vertex output the centroid sampling of the fragment input', () => {
    const vs = fn(HgiShaderStageBits.HgiShaderStageVertex, d => {
      d.stageOutputs.push(param('u', 5), param('w', 6))
    })
    const fs = fn(HgiShaderStageBits.HgiShaderStageFragment, d => {
      d.stageInputs.push(param('u', 5, HgiSamplingType.HgiSamplingCentroid), param('w', 6))
    })
    expect(vs.getGeneratedCode()).toContain('  @location(5) u: f32,\n')
    expect(fs.getGeneratedCode()).toContain('  @location(5) @interpolate(perspective, centroid) u: f32,\n')
    const before = modules.length
    program(vs, fs)
    expect(vs.getGeneratedCode()).toContain('  @location(5) @interpolate(perspective, centroid) u: f32,\n')
    expect(vs.getGeneratedCode()).toContain('  @location(6) w: f32,\n')
    expect(modules.length).toBe(before + 1)
    expect(modules.at(-1)).toBe(vs.getGeneratedCode())
    expect(vs.getShaderId()).not.toBeNull()
  })

  it('matches sample and no-perspective qualifiers and leaves matching programs alone', () => {
    const vs = fn(HgiShaderStageBits.HgiShaderStagePostTessellationVertex, d => {
      d.tessellationDescriptor.numVertsPerPatchIn = '3'
      d.stageOutputs.push(param('v', 2))
    })
    const fs = fn(HgiShaderStageBits.HgiShaderStageFragment, d => {
      const p = param('v', 2, HgiSamplingType.HgiSamplingSample)
      p.interpolation = HgiInterpolationType.HgiInterpolationNoPerspective
      d.stageInputs.push(p)
    })
    program(vs, fs)
    expect(vs.getGeneratedCode()).toContain('  @location(2) @interpolate(linear, sample) v: f32,\n')

    const vs2 = fn(HgiShaderStageBits.HgiShaderStageVertex, d => { d.stageOutputs.push(param('x', 0)) })
    const fs2 = fn(HgiShaderStageBits.HgiShaderStageFragment, d => { d.stageInputs.push(param('x', 0)) })
    const before = modules.length
    const code = vs2.getGeneratedCode()
    program(vs2, fs2)
    expect(modules.length).toBe(before)
    expect(vs2.getGeneratedCode()).toBe(code)
  })
})

// Ported from OpenUSD 26.11.1: pxr/imaging/hgi/unitTestHelper.cpp
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// The GLSL translator behind HgiWebGPUShaderGenerator's body-translator seam,
// on the descriptors of pxr/imaging/hgi/unitTestHelper.cpp:88-113 (mock Hgi,
// no device). Safari compiles the same output in the wgsl-check harness.
import { describe, expect, it } from 'vitest'
import { TfErrorMark } from 'typescript-usd/tf'
import {
  HgiFormat,
  HgiShaderFunctionAddTexture,
  HgiShaderTextureType,
  HgiShaderFunctionAddStageInput,
  HgiShaderFunctionAddStageOutput,
  HgiShaderFunctionAddWritableBuffer,
  HgiShaderFunctionDesc,
  HgiShaderStageBits,
  glslfx_fragShaderStr,
  glslfx_vertShaderStr,
} from 'typescript-usd/hgi'
import { HgiWebGPUMergeBindGroupLayoutInfos, HgiWebGPUShaderGenerator } from '../../src/index.ts'
import { HgiWebGPUGlslShaderBodyTranslator } from '../../src/glsl/glslShaderBodyTranslator.ts'

const hgi = { getShaderBodyTranslator: () => HgiWebGPUGlslShaderBodyTranslator, isFloat32Filterable: () => true }

describe('HgiWebGPUGlslShaderBodyTranslator through HgiWebGPUShaderGenerator', () => {
  it('translates the unit-test vertex shader body (unitTestHelper.cpp:24-30)', () => {
    const desc = new HgiShaderFunctionDesc()
    desc.shaderStage = HgiShaderStageBits.HgiShaderStageVertex
    HgiShaderFunctionAddStageInput(desc, 'position', 'vec4', 'position')
    HgiShaderFunctionAddStageInput(desc, 'uvIn', 'vec2')
    HgiShaderFunctionAddStageOutput(desc, 'gl_Position', 'vec4', 'position')
    HgiShaderFunctionAddStageOutput(desc, 'uvOut', 'vec2')
    desc.shaderCode = glslfx_vertShaderStr
    const gen = new HgiWebGPUShaderGenerator(hgi, desc)
    gen.Execute()
    const code = gen.getGeneratedShaderCode()
    expect(gen.getGeneratorErrors()).toBe('')
    expect(code).toContain('fn main() {\n  gl_Position = position;\n  uvOut = uvIn;\n}')
  })
  it('translates the unit-test fragment shader body (unitTestHelper.cpp:32-37)', () => {
    const desc = new HgiShaderFunctionDesc()
    desc.shaderStage = HgiShaderStageBits.HgiShaderStageFragment
    HgiShaderFunctionAddStageInput(desc, 'uvOut', 'vec2')
    HgiShaderFunctionAddStageOutput(desc, 'hd_FragColor', 'vec4', 'color')
    desc.shaderCode = glslfx_fragShaderStr
    const gen = new HgiWebGPUShaderGenerator(hgi, desc)
    gen.Execute()
    expect(gen.getGeneratedShaderCode()).toContain('fn main() {\n  var color: vec4<f32> = vec4<f32>(1.0f, 0.0f, 1.0f, 1.0f);\n  hd_FragColor = color;\n}')
  })
  it('HgiGetSampler_<name>() is the texture and its sampler (hgiVulkan/shaderSection.cpp:343-354)', () => {
    // The dome light prefilter query of hdSt/shaders/simpleLighting.glslfx:360-361.
    const desc = new HgiShaderFunctionDesc()
    desc.shaderStage = HgiShaderStageBits.HgiShaderStageFragment
    HgiShaderFunctionAddTexture(desc, 'domeLightPrefilter', 0, 2, HgiFormat.HgiFormatFloat16Vec4,
      HgiShaderTextureType.HgiShaderTextureTypeCubemapTexture)
    HgiShaderFunctionAddStageOutput(desc, 'hd_FragColor', 'vec4', 'color')
    desc.shaderCode = '#define HdGetSampler_domeLightPrefilter() HgiGetSampler_domeLightPrefilter()\n' +
      'void main() {\n' +
      '  int levels = textureQueryLevels(HdGetSampler_domeLightPrefilter());\n' +
      '  hd_FragColor = textureLod(HdGetSampler_domeLightPrefilter(), vec3(0, 0, 1), float(levels - 1));\n' +
      '}\n'
    const gen = new HgiWebGPUShaderGenerator(hgi, desc)
    gen.Execute()
    expect(gen.getGeneratorErrors()).toBe('')
    const code = gen.getGeneratedShaderCode()
    expect(code).toContain('textureNumLevels(textureBind_domeLightPrefilter)')
    expect(code).toContain('textureSampleLevel(textureBind_domeLightPrefilter, samplerBind_domeLightPrefilter, ')
  })
  // Storm's topology visibility block is writable in the common resources of
  // every stage (hdSt/codeGen.cpp:7200-7201 passes arraySize 1 in
  // _EmitDeclaration's isWritable position) and only read. Before, the vertex
  // function declared it read, the fragment function read_write, and the
  // merged layout entry matched one of them only: WebGPU rejected the
  // pipeline ("variableAccessMode != entryAccessMode") and with it every
  // opaque draw of the render pass (belt tour unit 43, geom subsets).
  it('declares a writable buffer that no stage writes read-only in every stage, as its layout entry', () => {
    const generate = (stage: number, code: string) => {
      const desc = new HgiShaderFunctionDesc()
      desc.shaderStage = stage
      HgiShaderFunctionAddWritableBuffer(desc, 'topologyVisibility', 'int', 5)
      if (stage === HgiShaderStageBits.HgiShaderStageFragment) HgiShaderFunctionAddStageOutput(desc, 'hd_FragColor', 'vec4', 'color')
      else HgiShaderFunctionAddStageOutput(desc, 'gl_Position', 'vec4', 'position')
      desc.shaderCode = code
      const gen = new HgiWebGPUShaderGenerator(hgi, desc)
      gen.Execute()
      expect(gen.getGeneratorErrors()).toBe('')
      return { code: gen.getGeneratedShaderCode(), layout: gen.getBindGroupLayoutInfo() }
    }
    const vertex = generate(HgiShaderStageBits.HgiShaderStageVertex,
      'void main() { gl_Position = vec4(float(topologyVisibility[0])); }\n')
    const fragment = generate(HgiShaderStageBits.HgiShaderStageFragment,
      'void main() { hd_FragColor = vec4(float(topologyVisibility[1])); }\n')
    for (const { code } of [vertex, fragment]) {
      expect(code).toContain('@group(0) @binding(5) var<storage, read> topologyVisibility: array<i32>;')
    }
    const mark = new TfErrorMark()
    mark.setMark()
    const merged = HgiWebGPUMergeBindGroupLayoutInfos([vertex.layout, fragment.layout], 'Draw Pipeline')
    const messages = mark.getErrors().map(e => e.getCommentary())
    mark.clear()
    expect(messages).toEqual([])
    expect(merged[0]!.find(e => e.binding === 5)!.buffer?.type).toBe('read-only-storage')
  })
  it('keeps read_write for a writable buffer the stage writes, and reports a merge with a stage that reads it', () => {
    const desc = new HgiShaderFunctionDesc()
    desc.shaderStage = HgiShaderStageBits.HgiShaderStageFragment
    HgiShaderFunctionAddWritableBuffer(desc, 'oitData', 'int', 2)
    HgiShaderFunctionAddStageOutput(desc, 'hd_FragColor', 'vec4', 'color')
    desc.shaderCode = 'void main() { oitData[0] = 1; hd_FragColor = vec4(0.0); }\n'
    const gen = new HgiWebGPUShaderGenerator(hgi, desc)
    gen.Execute()
    expect(gen.getGeneratorErrors()).toBe('')
    expect(gen.getGeneratedShaderCode()).toContain('@group(0) @binding(2) var<storage, read_write> oitData: array<i32>;')
    const mark = new TfErrorMark()
    mark.setMark()
    HgiWebGPUMergeBindGroupLayoutInfos([
      [{ group: 0, entries: [{ binding: 2, visibility: 1, buffer: { type: 'read-only-storage' } }] }],
      gen.getBindGroupLayoutInfo(),
    ], 'Draw Pipeline')
    const messages = mark.getErrors().map(e => e.getCommentary())
    mark.clear()
    expect(messages).toEqual([
      "HgiWebGPU: Draw Pipeline: binding 2 of bind group 0 is 'read-only-storage' in one shader function and 'storage' in another"])
  })
})

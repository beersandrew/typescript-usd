// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/glslProgram.cpp,
//  pxr/imaging/hdSt/testenv/testHdStDepthBias.cpp
// Copyright 2016, 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// testHdStDepthBias (pxr/imaging/hdSt/testenv/testHdStDepthBias.cpp) run
// through the ported Storm path end to end on a GPU-less Hgi that reports
// the reference device's capabilities (hgiMetal, Apple M4 Pro;
// tests/pipelineDrawBatchTestHgi.ts): HdUnitTestDelegate -> HdRenderIndex
// -> HdStMesh sync -> HdStResourceRegistry -> HdSt_RenderPass ->
// HdSt_PipelineDrawBatch -> HdSt_CodeGen. Every HgiShaderFunctionDesc the
// run creates is printed as HDST_DUMP_SHADER_SOURCE prints it
// (pxr/imaging/hdSt/glslProgram.cpp:149-170), less its header and footer
// lines, and compared byte for byte with
// the reference build's capture (tests/fixtures/depthBiasCodegen).
//
// This is a controller (Node) test: no GPU, no browser. It differs from
// depthBiasCodegen.test.ts, which builds the draw items by hand: here the
// code generator's inputs come from the real mesh sync.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { HgiShaderStageBits, HgiTexture, HgiHandle, type HgiTextureDesc, type HgiTextureHandle } from 'typescript-usd/hgi'
import { Hdx_RegisterShaderResources } from '../../../hdx/src/shaderResources.ts'
import { HdSt_RegisterShaderResources } from '../../src/shaderResources.ts'
import { PipelineDrawBatchTestHgi } from '../pipelineDrawBatchTestHgi.ts'
import { My_TestGLDrawing } from './testHdStDepthBias.ts'

const fixtures = new URL('../fixtures/depthBiasCodegen/', import.meta.url)
const fixture = (name: string) => readFileSync(new URL(name, fixtures), 'utf8')

/** Render buffer textures: the descriptor only (no texel storage needed). */
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

const STAGE_NAMES: Record<number, string> = {
  [HgiShaderStageBits.HgiShaderStageCompute]: 'COMPUTE_SHADER',
  [HgiShaderStageBits.HgiShaderStageVertex]: 'VERTEX_SHADER',
  [HgiShaderStageBits.HgiShaderStagePostTessellationVertex]: 'POST_TESS_VERTEX_SHADER',
  [HgiShaderStageBits.HgiShaderStageFragment]: 'FRAGMENT_SHADER',
}

function firstDifference(actual: string, expected: string): string {
  const a = actual.split('\n')
  const e = expected.split('\n')
  for (let i = 0; i < Math.max(a.length, e.length); i++) {
    if (a[i] !== e[i]) {
      return `line ${i + 1}:\n  expected: ${JSON.stringify(e[i])}\n  actual:   ${JSON.stringify(a[i])}`
    }
  }
  return 'identical'
}

describe('testHdStDepthBias through the ported Storm path (hgiMetal capabilities)', () => {
  HdSt_RegisterShaderResources()
  Hdx_RegisterShaderResources()
  const hgi = new _DriverHgi()
  const test = new My_TestGLDrawing(hgi)
  let error: unknown = null
  try {
    test.initTest()
    ;(test as unknown as { _draw(enable: boolean): void })._draw(false)
  } catch (e) {
    error = e
  }

  it('runs InitTest and one draw without throwing', () => {
    expect(error).toBe(null)
  })

  // Programs in creation order; a program starts at its compute or vertex
  // stage, as in the fixtures/depthBiasCodegen capture.
  const stages: { name: string, text: string }[] = []
  let program = -1
  for (const desc of hgi.shaderFunctionDescs) {
    const stage = STAGE_NAMES[desc.shaderStage] ?? `STAGE_${desc.shaderStage}`
    if (stage === 'COMPUTE_SHADER' || stage === 'VERTEX_SHADER') program++
    // The fixtures hold the text between the dump's header and footer lines,
    // i.e. shaderCodeDeclarations + shaderCode (glslProgram.cpp:149-170).
    stages.push({ name: `program${program}_${stage}.glsl`, text: (desc.shaderCodeDeclarations ?? '') + (desc.shaderCode ?? '') })
  }

  it('creates the native programs and stages, in order', () => {
    expect(stages.map((s) => s.name)).toEqual([
      'program0_COMPUTE_SHADER.glsl', 'program1_VERTEX_SHADER.glsl',
      'program1_POST_TESS_VERTEX_SHADER.glsl', 'program1_FRAGMENT_SHADER.glsl'])
  })

  for (const name of ['program0_COMPUTE_SHADER.glsl', 'program1_VERTEX_SHADER.glsl',
    'program1_POST_TESS_VERTEX_SHADER.glsl', 'program1_FRAGMENT_SHADER.glsl']) {
    it(`${name} is byte-identical to the native capture`, () => {
      const expected = fixture(name)
      const actual = stages.find((s) => s.name === name)?.text ?? ''
      expect(actual === expected, firstDifference(actual, expected)).toBe(true)
    })
  }
})

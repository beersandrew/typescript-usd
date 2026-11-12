// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/glslProgram.cpp,
//  pxr/imaging/hdSt/testenv/testHdStShaders.cpp,
//  pxr/imaging/hdSt/unitTestHelper.cpp
// Copyright 2016, 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// testHdStShaders without its scene materials (testHdStShadersLighting.ts;
// native capture tests/fixtures/shadersLighting) run through the ported
// Storm path on a GPU-less Hgi that reports the reference device's
// capabilities (hgiMetal, Apple M4 Pro; tests/pipelineDrawBatchTestHgi.ts).
// The first frustum-cull compute program and the first mesh program, lit by
// an HdSt_TestLightingShader through its "lighting" uniform block custom
// binding (unitTestHelper.cpp:271-305), are printed as
// HDST_DUMP_SHADER_SOURCE prints them (pxr/imaging/hdSt/glslProgram.cpp:
// 149-170), less the header and footer lines, and compared byte for byte
// with the reference build's capture.
//
// This is a controller (Node) test: no GPU, no browser. The images are
// compared in Safari (tests/browser/storm-image/lighting/run.mjs).

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { HgiShaderStageBits, HgiTexture, HgiHandle, type HgiTextureDesc, type HgiTextureHandle } from 'typescript-usd/hgi'
import { Hdx_RegisterShaderResources } from '../../../hdx/src/shaderResources.ts'
import { HdSt_RegisterShaderResources } from '../../src/shaderResources.ts'
import { PipelineDrawBatchTestHgi } from '../pipelineDrawBatchTestHgi.ts'
import { My_TestGLDrawing } from './testHdStShadersLighting.ts'

const fixtures = new URL('../fixtures/shadersLighting/', import.meta.url)
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

describe('testHdStShaders lighting through the ported Storm path (hgiMetal capabilities)', () => {
  HdSt_RegisterShaderResources()
  Hdx_RegisterShaderResources()
  const hgi = new _DriverHgi()
  const test = new My_TestGLDrawing(hgi)
  let error: unknown = null
  try {
    test.initTest()
    test.drawTest()
  } catch (e) {
    error = e
  }

  it('runs InitTest and one draw without throwing', () => {
    expect(error).toBe(null)
  })

  const blocks = hgi.shaderFunctionDescs.map(desc => ({
    stage: STAGE_NAMES[desc.shaderStage] ?? `STAGE_${desc.shaderStage}`,
    // The fixtures hold the text between the dump's header and footer
    // lines, i.e. shaderCodeDeclarations + shaderCode (glslProgram.cpp:149-170).
    text: (desc.shaderCodeDeclarations ?? '') + (desc.shaderCode ?? ''),
  }))
  const firstVs = blocks.findIndex(b => b.stage === 'VERTEX_SHADER')
  // HDST_DUMP_SHADER_SOURCE prints the programs HdSt_CodeGen generates
  // (glslProgram.cpp:149-170 via HdStGLSLProgram::CompileShader(desc)), not
  // the glslfx compute programs of GPU computations (flat normals here,
  // HdStGLSLProgram::GetComputeProgram), which this Hgi records too.
  const firstCull = blocks.findIndex(b => b.stage === 'COMPUTE_SHADER' &&
    b.text.startsWith('\n// //////// Codegen Defines'))

  it('creates a frustum-cull program, then VS + FS mesh programs', () => {
    expect(firstCull).toBeGreaterThanOrEqual(0)
    expect(firstVs).toBeGreaterThan(firstCull)
    expect(blocks[firstVs + 1]?.stage).toBe('FRAGMENT_SHADER')
  })

  const cases: [string, () => string][] = [
    ['cull_COMPUTE_SHADER.glsl', () => blocks[firstCull]?.text ?? ''],
    ['mesh_VERTEX_SHADER.glsl', () => blocks[firstVs]?.text ?? ''],
    ['mesh_FRAGMENT_SHADER.glsl', () => blocks[firstVs + 1]?.text ?? ''],
  ]
  for (const [name, actualOf] of cases) {
    it(`${name} is byte-identical to the native capture`, () => {
      const expected = fixture(name)
      const actual = actualOf()
      expect(actual === expected, firstDifference(actual, expected)).toBe(true)
    })
  }
})

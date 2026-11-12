// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/glslProgram.cpp,
//  pxr/imaging/hdSt/testenv/testHdStCurveDrawing.cpp
// Copyright 2016, 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// testHdStCurveDrawing (pxr/imaging/hdSt/testenv/testHdStCurveDrawing.cpp)
// run through the ported Storm path on a GPU-less Hgi that reports the
// reference device's capabilities (hgiMetal, tests/pipelineDrawBatchTestHgi.ts):
// HdUnitTestDelegate::AddCurves -> HdStBasisCurves sync -> HdSt_PipelineDrawBatch
// -> HdSt_CodeGen. Every HgiShaderFunctionDesc text the run creates
// (shaderCodeDeclarations + shaderCode, as HDST_DUMP_SHADER_SOURCE prints it,
// pxr/imaging/hdSt/glslProgram.cpp:149-170) is compared by SHA-256 with the
// reference build's (tests/fixtures/curvesCodegen/programs.json), as a
// multiset: the reference build's program order varies from run to run.
//
// --refineLevel 0 draws the curves as lines (VS + FS); --refineLevel 1 builds
// Metal's post-tessellation control + vertex programs for the refined
// curves (HgiWebGPU's emulation: imaging-i2.md section 2.2.1).
//
// This is a controller (Node) test: no GPU, no browser.

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { HgiShaderStageBits, HgiTexture, HgiHandle, type HgiTextureDesc, type HgiTextureHandle } from 'typescript-usd/hgi'
import { Hdx_RegisterShaderResources } from '../../../hdx/src/shaderResources.ts'
import { HdSt_RegisterShaderResources } from '../../src/shaderResources.ts'
import { PipelineDrawBatchTestHgi } from '../pipelineDrawBatchTestHgi.ts'
import { My_TestGLDrawing } from './testHdStCurveDrawing.ts'

const fixture = JSON.parse(readFileSync(
  new URL('../fixtures/curvesCodegen/programs.json', import.meta.url), 'utf8')).payload as
  Record<string, { stage: string, sha256: string, bytes: number }[]>

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
  [HgiShaderStageBits.HgiShaderStagePostTessellationControl]: 'POST_TESS_CONTROL_SHADER',
  [HgiShaderStageBits.HgiShaderStagePostTessellationVertex]: 'POST_TESS_VERTEX_SHADER',
  [HgiShaderStageBits.HgiShaderStageFragment]: 'FRAGMENT_SHADER',
}

for (const level of ['0', '1']) {
  describe(`testHdStCurveDrawing --repr refined --refineLevel ${level} through the ported Storm path (hgiMetal capabilities)`, () => {
    HdSt_RegisterShaderResources()
    Hdx_RegisterShaderResources()
    const hgi = new _DriverHgi()
    const test = new My_TestGLDrawing(hgi)
    let error: unknown = null
    try {
      test.parseArgs(['--repr', 'refined', '--refineLevel', level])
      test.initTest()
      test.drawTest()
    } catch (e) {
      error = e
    }

    it('runs InitTest and one draw without throwing', () => {
      expect(error).toBe(null)
    })

    it('creates the native stage texts, byte for byte (as a multiset)', () => {
      const actual = hgi.shaderFunctionDescs.map((desc) => {
        const text = Buffer.from((desc.shaderCodeDeclarations ?? '') + (desc.shaderCode ?? ''))
        return {
          stage: STAGE_NAMES[desc.shaderStage] ?? `STAGE_${desc.shaderStage}`,
          sha256: createHash('sha256').update(text).digest('hex'),
          bytes: text.length,
        }
      }).sort((a, b) => a.stage < b.stage ? -1 : a.stage > b.stage ? 1
        : a.sha256 < b.sha256 ? -1 : a.sha256 > b.sha256 ? 1 : 0)
      expect(actual).toEqual(fixture[`lv${level}`])
    })
  })
}

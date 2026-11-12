// Portions ported from OpenUSD 26.11.1, including:
//  pxr/imaging/hdSt/smoothNormals.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// The GLSL Storm's code generator hands to Hgi for a textured material
// program (the scene of the fixtures/texturedCodegen capture, built by
// texturedCodegenScene.ts), compared byte for byte with the reference
// build's HDST_DUMP_SHADER_SOURCE output (fixtures/texturedCodegen, captured
// on hgiMetal, Apple M4 Pro). The draw goes through HdUnitTestDelegate ->
// HdStMaterial / HdStMaterialNetwork (Sdr nodes from usdShaders and a glslfx
// source node) -> the Storm texture system -> HdSt_CodeGen on a GPU-less
// Hgi reporting the reference device's capabilities
// (pipelineDrawBatchTestHgi.ts), as depthBiasDriver.test.ts does for
// testHdStDepthBias.
//
// This is a controller (Node) test: no GPU, no browser.

import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { type HgiBlitCmds, HgiSampler, HgiShaderStageBits, HgiTexture, HgiHandle, type HgiSamplerDesc, type HgiTextureDesc, type HgiTextureHandle } from 'typescript-usd/hgi'
import { DefaultResolver as ArDefaultResolver, InMemoryAsset as ArInMemoryAsset, ResolvedPath as ArResolvedPath } from 'typescript-usd/ar'
import { _resetResolverForTest, _setResolverForTest } from 'typescript-usd/ar/_internal'
import { UsdShaders_RegisterShaderNodesAsync } from 'typescript-usd/usdShaders'
import { Hdx_RegisterShaderResources } from '../../hdx/src/shaderResources.ts'
import { HdSt_RegisterShaderResources } from '../src/shaderResources.ts'
import { BufferTestBlitCmds } from './bufferTestHgi.ts'
import { PipelineDrawBatchTestHgi } from './pipelineDrawBatchTestHgi.ts'
import { TexturedDrawing } from './texturedCodegenScene.ts'

const fixtures = new URL('./fixtures/texturedCodegen/', import.meta.url)
const fixture = (name: string) => readFileSync(new URL(name, fixtures), 'utf8')

/** Textures: the descriptor only (no texel storage needed). */
class _Texture extends HgiTexture {
  constructor(desc: HgiTextureDesc) { super(desc) }
  getByteSizeOfResource(): number { return HgiTexture._getByteSizeOfResource(this._descriptor) }
  getRawResource(): unknown { return null }
  submitLayoutChange(newLayout: number): number { return newLayout }
}

/** Samplers: the descriptor only. */
class _Sampler extends HgiSampler {
  constructor(desc: HgiSamplerDesc) { super(desc) }
  getRawResource(): unknown { return null }
}

/** Mipmap generation of the loaded texture: no texel storage to fill. */
class _BlitCmds extends BufferTestBlitCmds {
  override generateMipMaps(): void {}
}

class _DriverHgi extends PipelineDrawBatchTestHgi {
  override createBlitCmds(): HgiBlitCmds {
    return new _BlitCmds()
  }
  protected override _CreateTexture(desc: HgiTextureDesc): HgiTextureHandle {
    return new HgiHandle<HgiTexture>(new _Texture(desc), this.getUniqueId())
  }
  override createSampler(...args: unknown[]): never {
    return new HgiHandle<HgiSampler>(new _Sampler(args[0] as HgiSamplerDesc),
      this.getUniqueId()) as never
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

const expectedPrograms = (JSON.parse(fixture('programs.json')) as { payload: string[] }).payload

describe('textured material program through the ported Storm path (hgiMetal capabilities)', () => {
  const stages: { name: string, text: string }[] = []
  const otherPrograms: string[] = []
  let error: unknown = null

  beforeAll(async () => {
    HdSt_RegisterShaderResources()
    Hdx_RegisterShaderResources()
    await UsdShaders_RegisterShaderNodesAsync()
    // The capture's texture.png (relative to its working directory) from
    // memory; every other path, Storm's glslfx plugin resource files among
    // them, through the default resolver as natively.
    const texture = new Uint8Array(readFileSync(new URL('texture.png', fixtures)))
    _setResolverForTest(new class extends ArDefaultResolver {
      override async resolve(assetPath: string) {
        return assetPath === 'texture.png' ? new ArResolvedPath(assetPath) : super.resolve(assetPath)
      }
      override async openAsset(resolvedPath: ArResolvedPath) {
        return resolvedPath.toString() === 'texture.png' ? new ArInMemoryAsset(texture) : super.openAsset(resolvedPath)
      }
    }())
    const hgi = new _DriverHgi()
    const test = new TexturedDrawing(hgi)
    try {
      test.initTest()
      // Storm draws once the texture is loaded and committed
      // (hdSt/src/renderPass.ts, textureObjectRegistry.ts): the first draw
      // starts the load, the second compiles and draws, as the native run's
      // single draw does after its synchronous load.
      test.drawTest()
      await test.getTexturedDriver()!.loadTexturesAsync()
      test.drawTest()
    } catch (e) {
      error = e
    } finally {
      _resetResolverForTest()
    }
    // Programs in creation order; a program starts at its compute or vertex
    // stage, as in the fixtures/texturedCodegen capture.
    let program = -1
    for (const desc of hgi.shaderFunctionDescs) {
      // Only the code generator's programs (their declarations start with
      // the codegen defines); see the note on the smooth normals compute
      // program below.
      if (!(desc.shaderCodeDeclarations ?? '').includes('//////// Codegen Defines ////////')) {
        otherPrograms.push(desc.shaderCode?.slice(0, 40) ?? '')
        continue
      }
      const stage = STAGE_NAMES[desc.shaderStage] ?? `STAGE_${desc.shaderStage}`
      if (stage === 'COMPUTE_SHADER' || stage === 'VERTEX_SHADER') program++
      stages.push({ name: `program${program}_${stage}.glsl`,
        text: (desc.shaderCodeDeclarations ?? '') + (desc.shaderCode ?? '') })
    }
  })

  it('runs InitTest and one draw without throwing', () => {
    expect(error).toBe(null)
  })

  // The reference build's run dispatches no smooth normals compute program
  // for this grid (its dump has none, and HDST_LOG_COMPUTE_SHADER_PROGRAM_
  // MISSES reports none), while the port runs
  // HdSt_SmoothNormalsComputationGPU (smoothNormals.cpp:240-330) for it.
  it('dispatches no compute program besides the code generator\'s (as native)', () => {
    expect(otherPrograms).toEqual([])
  })

  it('creates the native programs and stages, in order', () => {
    console.log(stages.map((s) => s.name + ' ' + s.text.slice(0, 60).replace(/\n/g, ' ')))
    expect(stages.map((s) => s.name)).toEqual(expectedPrograms)
  })

  for (const name of expectedPrograms) {
    it(`${name} is byte-identical to the native capture`, () => {
      const expected = fixture(name)
      const actual = stages.find((s) => s.name === name)?.text ?? ''
      expect(actual === expected, firstDifference(actual, expected)).toBe(true)
    })
  }
})

// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/testenv/testHdStDepthBias.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// testHdStDepthBias's programs as Storm's code generator builds them under
// HgiWebGPU's own capabilities (MetalTessellation emulated,
// PrimitiveIdEmulation; pxr/imaging/hgiWebGPU/src/capabilities.ts), through
// HgiWebGPUShaderGenerator with the GLSL translator in its body-translator
// seam. Unlike modules.ts's depthBias entries (the reference build's Metal
// text and MSL-derived descriptors), the HgiShaderFunctionDescs here are the
// ones the TypeScript code generator hands to Hgi
// (pxr/imaging/hdSt/tests/depthBiasCodegenWebGPU.ts).
import type { HgiShaderFunctionDesc } from 'typescript-usd/hgi'
import { HgiShaderStageBits } from 'typescript-usd/hgi'
import { HdStResourceRegistry } from '../../../pxr/imaging/hdSt/src/resourceRegistry.ts'
import { HgiCodegenTestWebGPU } from '../../../pxr/imaging/hdSt/tests/depthBiasCodegenWebGPU.ts'
import { DepthBiasCodegenPrograms } from '../../../pxr/imaging/hdSt/tests/depthBiasCodegenPrograms.ts'
import { HgiWebGPUShaderGenerator } from '../../../pxr/imaging/hgiWebGPU/src/index.ts'
import { HgiWebGPUGlslShaderBodyTranslator } from '../../../pxr/imaging/hgiWebGPU/src/glsl/glslShaderBodyTranslator.ts'
import type { CheckModule, CheckPipeline } from './modules.ts'

const STAGE_NAMES: Record<number, string> = {
  [HgiShaderStageBits.HgiShaderStageCompute]: 'COMPUTE',
  [HgiShaderStageBits.HgiShaderStageVertex]: 'VERTEX',
  [HgiShaderStageBits.HgiShaderStagePostTessellationVertex]: 'POST_TESS_VERTEX',
  [HgiShaderStageBits.HgiShaderStageFragment]: 'FRAGMENT',
}

const id = (stage: string) => `depthBiasCodegen/${stage} (HgiWebGPU capabilities)`

/** The HgiShaderFunctionDescs Storm's code generator creates for
 *  testHdStDepthBias on an Hgi reporting HgiWebGPU's capabilities. */
export function depthBiasCodegenDescs(): HgiShaderFunctionDesc[] {
  const hgi = HgiCodegenTestWebGPU()
  const descs: HgiShaderFunctionDesc[] = []
  const create = hgi.CreateShaderFunction.bind(hgi)
  hgi.CreateShaderFunction = (desc) => {
    descs.push(desc.clone())
    return create(desc)
  }
  DepthBiasCodegenPrograms(hgi, (h) => new HdStResourceRegistry(h))
  return descs
}

export function buildCodegenModules(): CheckModule[] {
  const hgi = { getShaderBodyTranslator: () => HgiWebGPUGlslShaderBodyTranslator, isFloat32Filterable: () => true }
  return depthBiasCodegenDescs().map((desc) => {
    const gen = new HgiWebGPUShaderGenerator(hgi, desc)
    gen.Execute()
    const errors = gen.getGeneratorErrors()
    const stage = STAGE_NAMES[desc.shaderStage] ?? String(desc.shaderStage)
    return {
      id: id(stage),
      kind: 'generator' as const,
      stage,
      translated: !errors,
      translateErrors: errors ? errors.split('\n') : [],
      warnings: [],
      wgsl: gen.getGeneratedShaderCode(),
    }
  })
}

/** The cull program alone, and the drawing program as HgiWebGPU's
 *  graphics pipeline builds it for a patch draw: the post-tessellation
 *  vertex function is the vertex stage (hgiMetal/graphicsPipeline.mm:
 *  178-206) and has no vertex buffers (it pulls its attributes). */
export const DEPTH_BIAS_CODEGEN_PIPELINES: CheckPipeline[] = [
  { name: 'depthBiasCodegen frustum cull (compute)', kind: 'compute', compute: id('COMPUTE') },
  {
    name: 'depthBiasCodegen post-tessellation vertex + fragment', kind: 'render',
    vertex: id('POST_TESS_VERTEX'), fragment: id('FRAGMENT'), colorFormat: 'rgba16float',
  },
]

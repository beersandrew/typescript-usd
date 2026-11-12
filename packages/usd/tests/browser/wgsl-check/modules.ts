// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/testenv/testHdStDepthBias.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Builds the list of WGSL modules the Safari page compiles (loaded by run.mjs
// through Vite's SSR loader, because the Hgi enums need a TypeScript
// transform): glslfx sections and captured programs (corpus.ts), and
// testHdStDepthBias's four stages through HgiWebGPUShaderGenerator with the
// GLSL translator installed in its body-translator seam.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { HgiWebGPUShaderGenerator } from '../../../pxr/imaging/hgiWebGPU/src/index.ts'
import { HgiWebGPUGlslShaderBodyTranslator } from '../../../pxr/imaging/hgiWebGPU/src/glsl/glslShaderBodyTranslator.ts'
import { DEPTH_BIAS_STAGES, depthBiasDescriptor, type StageJson } from '../../../pxr/imaging/hgiWebGPU/tests/glsl/depthBiasProgram.ts'
import { formatDiagnostic, loadCorpus, translatePrograms, translateSections } from './corpus.ts'

export interface CheckModule {
  id: string
  kind: 'section' | 'program' | 'generator'
  stage: string
  defineSet?: string
  translated: boolean
  translateErrors: string[]
  warnings: string[]
  unsupportedStage?: boolean
  wgsl: string
}

/** Pipelines Safari also creates from the generator's modules (entry point and interstage validation). */
export interface CheckPipeline {
  name: string
  kind: 'compute' | 'render'
  compute?: string
  vertex?: string
  fragment?: string
  vertexBuffers?: { format: string; location: number }[]
  colorFormat?: string
}

/**
 * testHdStDepthBias draws with VS -> PTVS -> FS on Metal; under HgiWebGPU's
 * emulation the PTVS runs as the vertex stage, so it pairs with the fragment
 * stage. The plain vertex stage is checked as a vertex-only pipeline with its
 * attributes (points, drawingCoord0-2; descriptors.json).
 */
export const DEPTH_BIAS_PIPELINES: CheckPipeline[] = [
  { name: 'depthBias frustum cull (compute)', kind: 'compute', compute: 'depthBias/COMPUTE (HgiWebGPUShaderGenerator)' },
  {
    name: 'depthBias vertex (vertex only)', kind: 'render', vertex: 'depthBias/VERTEX (HgiWebGPUShaderGenerator)',
    vertexBuffers: [{ format: 'float32x3', location: 0 }, { format: 'sint32x4', location: 1 }, { format: 'sint32x4', location: 2 }, { format: 'sint32x2', location: 3 }],
  },
  {
    name: 'depthBias post-tessellation vertex + fragment', kind: 'render', vertex: 'depthBias/POST_TESS_VERTEX (HgiWebGPUShaderGenerator)',
    fragment: 'depthBias/FRAGMENT (HgiWebGPUShaderGenerator)', colorFormat: 'rgba16float',
  },
]

export function buildModules(openusd: string, native: Record<string, string>): CheckModule[] {
  const out: CheckModule[] = []
  const corpus = loadCorpus(openusd, native)
  for (const c of translateSections(corpus)) {
    out.push({
      id: `${c.section.file}:${c.section.name}`,
      kind: 'section',
      stage: c.section.stage,
      defineSet: c.defineSet.name,
      translated: c.result.ok,
      translateErrors: c.result.diagnostics.filter(d => d.severity === 'error').map(formatDiagnostic),
      warnings: c.result.diagnostics.filter(d => d.severity === 'warning').map(formatDiagnostic),
      unsupportedStage: c.unsupportedStage,
      wgsl: c.result.wgsl,
    })
  }
  for (const p of translatePrograms(corpus)) {
    out.push({
      id: p.program.id,
      kind: 'program',
      stage: p.program.stage,
      translated: p.result.ok,
      translateErrors: p.result.diagnostics.filter(d => d.severity === 'error').map(formatDiagnostic),
      warnings: p.result.diagnostics.filter(d => d.severity === 'warning').map(formatDiagnostic),
      // the generator writes enables for builtins; MSL-derived interfaces use none
      wgsl: p.result.wgsl,
    })
  }
  const fixtures = path.join(import.meta.dirname, '../../../pxr/imaging/hgiWebGPU/tests/glsl/fixtures/depthBias')
  const json = JSON.parse(readFileSync(path.join(fixtures, 'descriptors.json'), 'utf8')) as { stages: Record<string, StageJson> }
  const hgi = { getShaderBodyTranslator: () => HgiWebGPUGlslShaderBodyTranslator, isFloat32Filterable: () => true }
  for (const name of DEPTH_BIAS_STAGES) {
    const stage = json.stages[name] as StageJson
    const desc = depthBiasDescriptor(stage, readFileSync(path.join(fixtures, `${name}_SHADER.glsl`), 'utf8'))
    const gen = new HgiWebGPUShaderGenerator(hgi, desc)
    gen.Execute()
    const errors = gen.getGeneratorErrors()
    out.push({
      id: `depthBias/${name} (HgiWebGPUShaderGenerator)`,
      kind: 'generator',
      stage: stage.stage,
      translated: !errors,
      translateErrors: errors ? errors.split('\n') : [],
      warnings: [],
      wgsl: gen.getGeneratedShaderCode(),
    })
  }
  return out
}

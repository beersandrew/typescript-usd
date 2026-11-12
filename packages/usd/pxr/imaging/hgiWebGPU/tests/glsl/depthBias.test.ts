// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/testenv/testHdStDepthBias.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Program mode: testHdStDepthBias's four stage functions (the code
// generator's GLSL from the OpenUSD 26.11.1 reference build) through
// HgiWebGPUShaderGenerator with the GLSL translator. Node checks that every
// stage translates without errors; Safari compiles the generated WGSL
// (packages/usd/tests/browser/wgsl-check), which these tests do not replace.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { HgiWebGPUShaderGenerator } from '../../src/index.ts'
import { HgiWebGPUGlslShaderBodyTranslator } from '../../src/glsl/glslShaderBodyTranslator.ts'
import { DEPTH_BIAS_STAGES, depthBiasDescriptor, type StageJson } from './depthBiasProgram.ts'

const dir = new URL('./fixtures/depthBias/', import.meta.url)
const json = JSON.parse(readFileSync(new URL('descriptors.json', dir), 'utf8')) as { stages: Record<string, StageJson> }
const hgi = { getShaderBodyTranslator: () => HgiWebGPUGlslShaderBodyTranslator, isFloat32Filterable: () => true }

describe('testHdStDepthBias programs through HgiWebGPUShaderGenerator', () => {
  for (const name of DEPTH_BIAS_STAGES) {
    it(`${name} translates without errors`, () => {
      const glsl = readFileSync(new URL(`${name}_SHADER.glsl`, dir), 'utf8')
      const desc = depthBiasDescriptor(json.stages[name] as StageJson, glsl)
      const gen = new HgiWebGPUShaderGenerator(hgi, desc)
      gen.Execute()
      const out = process.env.WGSL_DUMP_DIR
      if (out) {
        mkdirSync(out, { recursive: true })
        writeFileSync(`${out}/${name}.wgsl`, gen.getGeneratedShaderCode())
      }
      expect(gen.getGeneratorErrors()).toBe('')
      expect(gen.getGeneratedShaderCode()).toContain('fn main()')
    })
  }
})

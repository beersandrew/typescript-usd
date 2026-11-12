// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/testenv/testHdStDepthBias.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// The GLSL text Storm's code generator hands to Hgi for the two programs of
// upstream's testHdStDepthBias (pxr/imaging/hdSt/testenv/testHdStDepthBias.cpp,
// registered at pxr/imaging/hdSt/CMakeLists.txt:2441), compared byte for byte
// with the reference build's HDST_DUMP_SHADER_SOURCE output
// (tests/fixtures/depthBiasCodegen, captured on hgiMetal,
// Apple M4 Pro). The Hgi here reports that device's API name and capability
// bits (tests/codegenTestHgi.ts). No normalisation is applied.
//
// This is a controller (Node) test: no GPU, no browser.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { HdStResourceRegistry } from '../../src/resourceRegistry.ts'
import { HgiCodegenTest } from '../codegenTestHgi.ts'
import { DepthBiasCodegenPrograms } from '../depthBiasCodegenPrograms.ts'

const fixtures = new URL('../fixtures/depthBiasCodegen/', import.meta.url)
const fixture = (name: string) => readFileSync(new URL(name, fixtures), 'utf8')

/** The first line where `actual` and `expected` differ, for the message. */
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

describe('testHdStDepthBias code generator text (hgiMetal, Apple M4 Pro)', () => {
  const programs = DepthBiasCodegenPrograms(HgiCodegenTest.metalM4Pro(),
    (hgi) => new HdStResourceRegistry(hgi))

  it('compiles the frustum-cull program as one compute stage', () => {
    expect(programs.cull.map((s) => s.stage)).toEqual(['COMPUTE_SHADER'])
  })

  it('compiles the mesh program as VS, POST_TESS_VERTEX, FS', () => {
    expect(programs.draw.map((s) => s.stage)).toEqual(
      ['VERTEX_SHADER', 'POST_TESS_VERTEX_SHADER', 'FRAGMENT_SHADER'])
  })

  const cases: Array<[string, () => string | undefined]> = [
    ['program0_COMPUTE_SHADER.glsl', () => programs.cull.find((s) => s.stage === 'COMPUTE_SHADER')?.text],
    ['program1_VERTEX_SHADER.glsl', () => programs.draw.find((s) => s.stage === 'VERTEX_SHADER')?.text],
    ['program1_POST_TESS_VERTEX_SHADER.glsl',
      () => programs.draw.find((s) => s.stage === 'POST_TESS_VERTEX_SHADER')?.text],
    ['program1_FRAGMENT_SHADER.glsl', () => programs.draw.find((s) => s.stage === 'FRAGMENT_SHADER')?.text],
  ]
  for (const [name, get] of cases) {
    it(`${name} is byte-identical to the native capture`, () => {
      const expected = fixture(name)
      const actual = get() ?? ''
      expect(actual === expected, firstDifference(actual, expected)).toBe(true)
    })
  }
})

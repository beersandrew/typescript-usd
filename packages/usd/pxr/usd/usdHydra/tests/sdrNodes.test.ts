// Ported from OpenUSD 26.11.1: pxr/usd/usdHydra/shaders/shaderDefs.usda
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// What SdrRegistry reports for the usdHydra shader nodes
// (pxr/usd/usdHydra/shaders/shaderDefs.usda, through UsdHydraDiscoveryPlugin
// and UsdShadeShaderDefParserPlugin), compared with the pinned build
// (fixtures/sdrNodes, captured with Sdr's Python API; FIXTURES.md),
// with the usdShaders nodes registered as well (as both plugins are loaded
// natively). Controller (Node) test.

import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { Registry as SdrRegistry, ShaderPropertyGetDefaultValue } from 'typescript-usd/sdr'
import { UsdShaders_RegisterShaderNodesAsync } from 'typescript-usd/usdShaders'
import { UsdHydra_RegisterShaderNodesAsync } from '../src/index.ts'

const fixture = JSON.parse(readFileSync(new URL('fixtures/sdrNodes/expected.json', import.meta.url), 'utf8')).payload as {
  identifiers: string[]
  nodes: Record<string, {
    identifier: string, name: string, function: string, sourceType: string, role: string,
    inputNames: string[], outputNames: string[], implementationFile: string,
    properties: Record<string, { isOutput: boolean, type: string, arraySize: number, default: unknown }>
  }>
}

function plain(v: unknown): unknown {
  if (v === undefined || v === null) return null
  if (typeof v === 'number' || typeof v === 'string') return v
  if (typeof v === 'boolean') return Number(v)
  const o = v as { data?: ArrayLike<number>, getAssetPath?: () => string }
  if (o.getAssetPath) return o.getAssetPath()
  if (o.data) return Array.from(o.data)
  return v
}

describe('usdHydra shader nodes (UsdHydraDiscoveryPlugin)', () => {
  beforeAll(async () => {
    await UsdShaders_RegisterShaderNodesAsync()
    await UsdHydra_RegisterShaderNodesAsync()
  })

  it('discovers the native Hw* identifiers', () => {
    const ids = SdrRegistry.getInstance().getShaderNodeIdentifiers().filter(id => id.startsWith('Hw'))
    expect(ids).toEqual(fixture.identifiers)
  })

  it('keeps the usdShaders nodes parseable', () => {
    expect(SdrRegistry.getInstance().getShaderNodeByIdentifierAndType('UsdUVTexture', 'glslfx')?.getRole()).toBe('texture')
  })

  for (const id of fixture.identifiers) {
    it(`parses ${id} as native Sdr does`, () => {
      const expected = fixture.nodes[id]!
      const n = SdrRegistry.getInstance().getShaderNodeByIdentifierAndType(id, 'glslfx')
      expect(n).toBeDefined()
      expect(n!.getIdentifier()).toBe(expected.identifier)
      expect(n!.getName()).toBe(expected.name)
      expect(n!.getFunction()).toBe(expected.function)
      expect(n!.getSourceType()).toBe(expected.sourceType)
      expect(n!.getRole()).toBe(expected.role)
      expect(n!.getShaderInputNames()).toEqual(expected.inputNames)
      expect(n!.getShaderOutputNames()).toEqual(expected.outputNames)
      const impl = n!.getResolvedImplementationURI()
      expect(impl ? impl.slice(impl.lastIndexOf('/') + 1) : '').toBe(expected.implementationFile)
      for (const [name, p] of Object.entries(expected.properties)) {
        const prop = p.isOutput ? n!.getShaderOutput(name) : n!.getShaderInput(name)
        expect(prop, name).toBeDefined()
        expect(prop!.getType(), name).toBe(p.type)
        expect(prop!.getArraySize(), name).toBe(p.arraySize)
        const value = ShaderPropertyGetDefaultValue(prop!)
        if (p.default === null) {
          expect(value.IsEmpty(), name).toBe(true)
        } else if (Array.isArray(p.default)) {
          expect((plain(value.Get<unknown>()) as number[]).map(Math.fround), name).toEqual(p.default.map(x => Math.fround(x as number)))
        } else if (typeof p.default === 'number') {
          expect(Math.fround(plain(value.Get<unknown>()) as number), name).toBe(Math.fround(p.default))
        } else {
          expect(plain(value.Get<unknown>()), name).toBe(p.default)
        }
      }
    })
  }
})

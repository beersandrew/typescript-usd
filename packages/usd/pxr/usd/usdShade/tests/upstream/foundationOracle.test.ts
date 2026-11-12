// Native OpenUSD 26.11.1 capture; implementation source target v26.11.1.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { Material, Shader } from '../../src/index.ts'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'
const base = new URL('./fixtures/foundation/', import.meta.url)
const expected = readOracleFixture(new URL('expected.json', base))

describe('UsdShade native foundation capture', () => {
  it('resolves context-qualified terminals with universal fallback', async () => {
    const stage = (await Stage.open(fileURLToPath(new URL('stage.usda', base))))!
    for (const row of expected.surfaceSources) {
      expect(Material.computeSurfaceSource(stage, '/Mat', row.context)).toEqual({
        ...row.source, sourceType: row.source.sourceType.toLowerCase(),
      })
    }
  })
  it('authors a valid source even when CanConnect rejects encapsulation', () => {
    const stage = Stage.createNew()
    const a = Shader.define(stage, '/Loose/A'), b = Shader.define(stage, '/Loose/B')
    const input = a.createInput('in', 'float'), output = b.createOutput('out', 'float')
    expect(input.canConnect(output).canConnect).toBe(expected.unencapsulatedConnection.canConnect)
    expect(input.connectToSource(output)).toBe(expected.unencapsulatedConnection.connected)
    expect(input.attr.getConnections()).toEqual(expected.unencapsulatedConnection.paths)
  })
  it('uses unqualified universal source attributes and falls back to them', () => {
    const stage = Stage.createNew()
    const asset = Shader.define(stage, '/UniversalAsset')
    asset.setSourceAsset('shader.glslfx')
    const code = Shader.define(stage, '/UniversalCode')
    code.setSourceCode('shader source')
    expect(asset.prim.attrNames).toEqual(expected.universalSources.assetNames)
    expect(asset.getSourceAsset('glslfx')).toBe(expected.universalSources.assetFallback)
    expect(code.prim.attrNames).toEqual(expected.universalSources.codeNames)
    expect(code.getSourceCode('glslfx')).toBe(expected.universalSources.codeFallback)
  })

})

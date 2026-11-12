// Expected definition interfaces captured from OpenUSD 26.11.1 Sdr.Registry;
// the fixture records the native command and identifiers (FIXTURES.md).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Registry } from 'typescript-usd/sdr'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'
import '../../src/index.ts'
const expected = readOracleFixture(new URL('./fixtures/sdr-nodes.json', import.meta.url)) as Record<string, {inputs: Record<string,{type:string,arraySize:number}>,outputs:string[]}>
describe('UsdMtlx plugin Sdr discovery', () => {
  for (const [identifier, node] of Object.entries(expected)) {
    it(`discovers and parses ${identifier} on demand`, () => {
      const result = Registry.getInstance().getShaderNodeByIdentifier(identifier, ['mtlx'])!
      expect(result).toBeDefined()
      expect(result.getShaderInputNames().sort()).toEqual(Object.keys(node.inputs).sort())
      expect(result.getShaderOutputNames().sort()).toEqual(node.outputs)
      for (const [name, property] of Object.entries(node.inputs)) {
        expect(result.getShaderInput(name)?.getType(), name).toBe(property.type)
        expect(result.getShaderInput(name)?.getArraySize(), name).toBe(property.arraySize)
      }
    })
  }
})

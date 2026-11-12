// Native USD 26.11.1 capture shared with UsdImaging integration tests.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { MaterialBindingAPI } from '../../src/index.ts'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'
const base = new URL('./fixtures/bindings/', import.meta.url)
const expected = readOracleFixture(new URL('expected.json', base))
it('matches native collection, purpose fallback and stronger ancestor bindings', async () => {
  const stage = (await Stage.open(fileURLToPath(new URL('stage.usda', base))))!
  for (const row of expected.bindings) {
    expect(MaterialBindingAPI.computeBoundMaterial(stage, row.primPath, row.purpose)).toEqual(row.binding)
  }
})
it('rebinding with explicit weak or fallback resets stronger direct and collection metadata', async () => {
  const stage = (await Stage.open(fileURLToPath(new URL('stage.usda', base))))!
  const api = MaterialBindingAPI.apply(stage.getPrim('/World')!)
  for (const row of expected.rebindings) {
    api.bind('/Looks/Base', 'strongerThanDescendants')
    api.bind('/Looks/Base', row.requested)
    expect(MaterialBindingAPI.getBindingStrength(stage, '/World.material:binding')).toBe(row.direct)
    api.bindCollection('selected', '/World.collection:selected', '/Looks/Collection', 'strongerThanDescendants', 'full')
    api.bindCollection('selected', '/World.collection:selected', '/Looks/Collection', row.requested, 'full')
    expect(MaterialBindingAPI.getBindingStrength(stage, '/World.material:binding:collection:full:selected')).toBe(row.collection)
  }
})

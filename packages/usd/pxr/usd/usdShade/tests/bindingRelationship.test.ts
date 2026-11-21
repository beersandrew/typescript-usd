// UsdShadeMaterialBindingAPI::Bind authors its binding relationship as a
// non-custom property (OpenUSD 26.11.1 materialBindingAPI.cpp:398-413
// _CreateDirectBindingRel / _CreateCollectionBindingRel, :416-427 Bind),
// so a bound prim exports `rel material:binding`, as usdcat writes it.
import { expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { Material, MaterialBindingAPI } from '../src/index.ts'

it('binds through non-custom direct and collection binding relationships', () => {
  const stage = Stage.createNew()
  const material = Material.define(stage, '/Looks/Red')
  const prim = stage.definePrim('/Geom', 'Cube')
  const api = MaterialBindingAPI.apply(prim)
  api.bind(material)
  api.bindCollection('all', '/Geom.collection:all', material)
  const text = stage.getRootLayer().exportToString()
  expect(text).toContain('rel material:binding = </Looks/Red>')
  expect(text).toContain('rel material:binding:collection:all = [')
  expect(text).not.toContain('custom rel')
})

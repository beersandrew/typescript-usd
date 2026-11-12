// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdShade/testenv/testUsdShadeMaterialBinding.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/usd/usdShade/testenv/testUsdShadeMaterialBinding.py
import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { Material, MaterialBindingAPI } from '../../src/index.ts'

// Type-only declaration for the host-provided global; the compiled lib
// (ES2022, no DOM/Node types) does not include it. No runtime emit.
function makeScene() {
  const stage = Stage.createNew()
  Material.define(stage, '/Looks/Red')
  Material.define(stage, '/Looks/Blue')
  stage.definePrim('/Root', 'Xform')
  stage.definePrim('/Root/Mesh', 'Mesh')
  return stage
}

describe('UsdShade material binding', () => {
  it('direct binding on the prim wins', () => {
    const stage = makeScene()
    new MaterialBindingAPI(stage.definePrim('/Root/Mesh'), stage).bind('/Looks/Red')

    const bound = MaterialBindingAPI.computeBoundMaterial(stage, '/Root/Mesh')
    expect(bound?.materialPath).toBe('/Looks/Red')
    expect(bound?.bindingRelPath).toBe('/Root/Mesh.material:binding')
  })

  it('ancestor binding inherits down namespace', () => {
    const stage = makeScene()
    new MaterialBindingAPI(stage.definePrim('/Root'), stage).bind('/Looks/Red')

    const bound = MaterialBindingAPI.computeBoundMaterial(stage, '/Root/Mesh')
    expect(bound?.materialPath).toBe('/Looks/Red')
    expect(bound?.bindingRelPath).toBe('/Root.material:binding')
  })

  it('descendant binding overrides a weaker ancestor binding', () => {
    const stage = makeScene()
    new MaterialBindingAPI(stage.definePrim('/Root'), stage).bind('/Looks/Red')
    new MaterialBindingAPI(stage.definePrim('/Root/Mesh'), stage).bind('/Looks/Blue')

    expect(MaterialBindingAPI.computeBoundMaterial(stage, '/Root/Mesh')?.materialPath)
      .toBe('/Looks/Blue')
  })

  it('strongerThanDescendants ancestor binding beats descendant bindings', () => {
    const stage = makeScene()
    new MaterialBindingAPI(stage.definePrim('/Root'), stage).bind('/Looks/Red', 'strongerThanDescendants')
    new MaterialBindingAPI(stage.definePrim('/Root/Mesh'), stage).bind('/Looks/Blue')

    expect(MaterialBindingAPI.computeBoundMaterial(stage, '/Root/Mesh')?.materialPath)
      .toBe('/Looks/Red')
  })

  it('no binding anywhere resolves to null', () => {
    const stage = makeScene()
    expect(MaterialBindingAPI.computeBoundMaterial(stage, '/Root/Mesh')).toBeNull()
  })

  it('binding to a non-existent material is ignored', () => {
    const stage = makeScene()
    new MaterialBindingAPI(stage.definePrim('/Root/Mesh'), stage).bind('/Looks/Nope')
    expect(MaterialBindingAPI.computeBoundMaterial(stage, '/Root/Mesh')).toBeNull()
  })

  it('unbind removes the binding', () => {
    const stage = makeScene()
    const api = new MaterialBindingAPI(stage.definePrim('/Root/Mesh'), stage)
    api.bind('/Looks/Red')
    expect(MaterialBindingAPI.computeBoundMaterial(stage, '/Root/Mesh')).not.toBeNull()
    api.unbind()
    expect(MaterialBindingAPI.computeBoundMaterial(stage, '/Root/Mesh')).toBeNull()
  })

  it('binding survives a USDA round-trip', async () => {
    const stage = makeScene()
    new MaterialBindingAPI(stage.definePrim('/Root/Mesh'), stage).bind('/Looks/Red')

    const { Stage: StageCls } = await import('typescript-usd/usd')
    const { ArInMemoryResolver } = await import('typescript-usd/usd/_internal')
    const { _resolverContextForResolver } = await import('typescript-usd/usd/_internal')
    const resolver = new ArInMemoryResolver({ 'rt.usda': new TextEncoder().encode(stage.exportToUsda()) })
    const reopened = (await StageCls.open('rt.usda', {
      resolverContext: _resolverContextForResolver(resolver),
    }))!

    expect(MaterialBindingAPI.computeBoundMaterial(reopened, '/Root/Mesh')?.materialPath)
      .toBe('/Looks/Red')
  })
})

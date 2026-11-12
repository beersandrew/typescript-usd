// Mirrors pxr/usd/usdShade/testenv/testUsdShadeBinding (collection + purpose
// cases). Every expected value below was cross-checked against the Pixar
// reference build at the v26.05 reference build (python: from pxr import UsdShade; build
// the same scene; UsdShadeMaterialBindingAPI.ComputeBoundMaterial(purpose)).
import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { Material, MaterialBindingAPI } from '../../src/index.ts'

function looks(stage: Stage) {
  Material.define(stage, '/Looks/Red')
  Material.define(stage, '/Looks/Blue')
  Material.define(stage, '/Looks/Green')
}

// Authors a collection on `primPath` named `name` (UsdCollectionAPI shape:
// collection:<name>:includes/excludes/expansionRule/includeRoot).
function authorCollection(
  stage: Stage,
  primPath: string,
  name: string,
  opts: { includes?: string[]; excludes?: string[]; expansionRule?: string; includeRoot?: boolean },
) {
  const prim = stage.definePrim(primPath)
  if (opts.includes) prim.rel(`collection:${name}:includes`).setTargets(opts.includes)
  if (opts.excludes) prim.rel(`collection:${name}:excludes`).setTargets(opts.excludes)
  if (opts.expansionRule) prim.attr(`collection:${name}:expansionRule`).set(opts.expansionRule)
  if (opts.includeRoot) prim.attr(`collection:${name}:includeRoot`).set(true)
}

describe('UsdShade purpose-qualified binding', () => {
  // Pixar: full -> Blue (material:binding:full); preview -> Red (falls back to
  // all-purpose material:binding); all -> Red.
  function purposeScene() {
    const stage = Stage.createNew()
    looks(stage)
    stage.definePrim('/Root', 'Xform')
    const mesh = stage.definePrim('/Root/Mesh', 'Mesh')
    const api = MaterialBindingAPI.apply(mesh)
    api.bind('/Looks/Red')                                  // all-purpose
    api.bind('/Looks/Blue', 'weakerThanDescendants', 'full') // full
    return stage
  }

  it('a purpose-specific binding resolves for that purpose', () => {
    const bound = MaterialBindingAPI.computeBoundMaterial(purposeScene(), '/Root/Mesh', 'full')
    expect(bound?.materialPath).toBe('/Looks/Blue')
    expect(bound?.bindingRelPath).toBe('/Root/Mesh.material:binding:full')
  })

  it('an absent purpose falls back to the all-purpose binding', () => {
    const bound = MaterialBindingAPI.computeBoundMaterial(purposeScene(), '/Root/Mesh', 'preview')
    expect(bound?.materialPath).toBe('/Looks/Red')
    expect(bound?.bindingRelPath).toBe('/Root/Mesh.material:binding')
  })

  it('all-purpose query resolves the all-purpose binding', () => {
    const bound = MaterialBindingAPI.computeBoundMaterial(purposeScene(), '/Root/Mesh')
    expect(bound?.materialPath).toBe('/Looks/Red')
    expect(bound?.bindingRelPath).toBe('/Root/Mesh.material:binding')
  })

  it('a general (non-builtin) purpose resolves and falls back', () => {
    const stage = Stage.createNew()
    looks(stage)
    const mesh = stage.definePrim('/Root/Mesh', 'Mesh')
    const api = MaterialBindingAPI.apply(mesh)
    api.bind('/Looks/Red')
    api.bind('/Looks/Green', 'weakerThanDescendants', 'shadow') // general purpose
    expect(MaterialBindingAPI.computeBoundMaterial(stage, '/Root/Mesh', 'shadow')?.materialPath)
      .toBe('/Looks/Green')
    // a different general purpose falls back to all-purpose Red
    expect(MaterialBindingAPI.computeBoundMaterial(stage, '/Root/Mesh', 'other')?.materialPath)
      .toBe('/Looks/Red')
  })
})

describe('UsdShade collection-based binding', () => {
  it('binds members of the collection and not others', () => {
    // Pixar: /Root/A -> Red (in collection 'mats'); /Root/B -> None.
    const stage = Stage.createNew()
    looks(stage)
    stage.definePrim('/Root', 'Xform')
    stage.definePrim('/Root/A', 'Mesh')
    stage.definePrim('/Root/B', 'Mesh')
    authorCollection(stage, '/Root', 'mats', { includes: ['/Root/A'] })
    MaterialBindingAPI.apply(stage.definePrim('/Root'))
      .bindCollection('mats', '/Root.collection:mats', '/Looks/Red')

    expect(MaterialBindingAPI.computeBoundMaterial(stage, '/Root/A')?.materialPath).toBe('/Looks/Red')
    expect(MaterialBindingAPI.computeBoundMaterial(stage, '/Root/A')?.bindingRelPath)
      .toBe('/Root.material:binding:collection:mats')
    expect(MaterialBindingAPI.computeBoundMaterial(stage, '/Root/B')).toBeNull()
  })

  it('a collection binding beats a direct binding on the same prim', () => {
    // Pixar: /Root has both a direct binding (Blue) and a collection binding
    // (Red) including /Root/A; A resolves to Red — collection wins on the
    // same prim.
    const stage = Stage.createNew()
    looks(stage)
    stage.definePrim('/Root', 'Xform')
    stage.definePrim('/Root/A', 'Mesh')
    authorCollection(stage, '/Root', 'mats', { includes: ['/Root/A'] })
    const api = MaterialBindingAPI.apply(stage.definePrim('/Root'))
    api.bind('/Looks/Blue')                                                   // direct on /Root
    api.bindCollection('mats', '/Root.collection:mats', '/Looks/Red')        // collection on /Root

    expect(MaterialBindingAPI.computeBoundMaterial(stage, '/Root/A')?.materialPath).toBe('/Looks/Red')
  })

  it('a nearer direct binding beats an ancestor collection binding', () => {
    // Pixar: collection binding on /Root (Red, includes A) vs direct binding
    // on /Root/A (Blue); A resolves to Blue — the nearer prim wins.
    const stage = Stage.createNew()
    looks(stage)
    stage.definePrim('/Root', 'Xform')
    stage.definePrim('/Root/A', 'Mesh')
    authorCollection(stage, '/Root', 'mats', { includes: ['/Root/A'] })
    MaterialBindingAPI.apply(stage.definePrim('/Root'))
      .bindCollection('mats', '/Root.collection:mats', '/Looks/Red')
    MaterialBindingAPI.apply(stage.definePrim('/Root/A')).bind('/Looks/Blue')

    expect(MaterialBindingAPI.computeBoundMaterial(stage, '/Root/A')?.materialPath).toBe('/Looks/Blue')
  })

  it('a strongerThanDescendants ancestor collection binding beats a nearer direct binding', () => {
    // Pixar: collection binding on /Root marked strongerThanDescendants (Red)
    // vs direct on /Root/A (Blue); A resolves to Red.
    const stage = Stage.createNew()
    looks(stage)
    stage.definePrim('/Root', 'Xform')
    stage.definePrim('/Root/A', 'Mesh')
    authorCollection(stage, '/Root', 'mats', { includes: ['/Root/A'] })
    MaterialBindingAPI.apply(stage.definePrim('/Root'))
      .bindCollection('mats', '/Root.collection:mats', '/Looks/Red', 'strongerThanDescendants')
    MaterialBindingAPI.apply(stage.definePrim('/Root/A')).bind('/Looks/Blue')

    expect(MaterialBindingAPI.computeBoundMaterial(stage, '/Root/A')?.materialPath).toBe('/Looks/Red')
  })

  it('expandPrims (default) includes descendants of an included path', () => {
    // Pixar: includes /Root/A (default expandPrims); /Root/A/Sub -> Red.
    const stage = Stage.createNew()
    looks(stage)
    stage.definePrim('/Root', 'Xform')
    stage.definePrim('/Root/A', 'Mesh')
    stage.definePrim('/Root/A/Sub', 'Mesh')
    authorCollection(stage, '/Root', 'mats', { includes: ['/Root/A'] })
    MaterialBindingAPI.apply(stage.definePrim('/Root'))
      .bindCollection('mats', '/Root.collection:mats', '/Looks/Red')

    expect(MaterialBindingAPI.computeBoundMaterial(stage, '/Root/A/Sub')?.materialPath).toBe('/Looks/Red')
  })

  it('excludes remove a subtree from the collection', () => {
    // Pixar: includes /Root/A, excludes /Root/A/Sub; A -> Red, A/Sub -> None.
    const stage = Stage.createNew()
    looks(stage)
    stage.definePrim('/Root', 'Xform')
    stage.definePrim('/Root/A', 'Mesh')
    stage.definePrim('/Root/A/Sub', 'Mesh')
    authorCollection(stage, '/Root', 'mats', { includes: ['/Root/A'], excludes: ['/Root/A/Sub'] })
    MaterialBindingAPI.apply(stage.definePrim('/Root'))
      .bindCollection('mats', '/Root.collection:mats', '/Looks/Red')

    expect(MaterialBindingAPI.computeBoundMaterial(stage, '/Root/A')?.materialPath).toBe('/Looks/Red')
    expect(MaterialBindingAPI.computeBoundMaterial(stage, '/Root/A/Sub')).toBeNull()
  })

  it('explicitOnly only matches the exact authored path', () => {
    // Pixar: expansionRule=explicitOnly, includes /Root/A; A -> Red,
    // A/Sub -> None.
    const stage = Stage.createNew()
    looks(stage)
    stage.definePrim('/Root', 'Xform')
    stage.definePrim('/Root/A', 'Mesh')
    stage.definePrim('/Root/A/Sub', 'Mesh')
    authorCollection(stage, '/Root', 'mats', { includes: ['/Root/A'], expansionRule: 'explicitOnly' })
    MaterialBindingAPI.apply(stage.definePrim('/Root'))
      .bindCollection('mats', '/Root.collection:mats', '/Looks/Red')

    expect(MaterialBindingAPI.computeBoundMaterial(stage, '/Root/A')?.materialPath).toBe('/Looks/Red')
    expect(MaterialBindingAPI.computeBoundMaterial(stage, '/Root/A/Sub')).toBeNull()
  })

  it('includeRoot includes every prim under the root', () => {
    // Pixar: includeRoot=true (no includes); /Root/A -> Red.
    const stage = Stage.createNew()
    looks(stage)
    stage.definePrim('/Root', 'Xform')
    stage.definePrim('/Root/A', 'Mesh')
    authorCollection(stage, '/Root', 'mats', { includeRoot: true })
    MaterialBindingAPI.apply(stage.definePrim('/Root'))
      .bindCollection('mats', '/Root.collection:mats', '/Looks/Red')

    expect(MaterialBindingAPI.computeBoundMaterial(stage, '/Root/A')?.materialPath).toBe('/Looks/Red')
  })

  it('a purpose-qualified collection binding resolves and falls back', () => {
    // material:binding:collection:full:mats binds full; preview falls back to
    // the all-purpose collection binding.
    const stage = Stage.createNew()
    looks(stage)
    stage.definePrim('/Root', 'Xform')
    stage.definePrim('/Root/A', 'Mesh')
    authorCollection(stage, '/Root', 'mats', { includes: ['/Root/A'] })
    const api = MaterialBindingAPI.apply(stage.definePrim('/Root'))
    api.bindCollection('mats', '/Root.collection:mats', '/Looks/Red')                                  // all-purpose
    api.bindCollection('mats', '/Root.collection:mats', '/Looks/Blue', 'weakerThanDescendants', 'full') // full

    expect(MaterialBindingAPI.computeBoundMaterial(stage, '/Root/A', 'full')?.materialPath).toBe('/Looks/Blue')
    expect(MaterialBindingAPI.computeBoundMaterial(stage, '/Root/A', 'preview')?.materialPath).toBe('/Looks/Red')
  })
})

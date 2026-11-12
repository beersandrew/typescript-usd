// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdShade/testenv/testUsdShadeMaterialSpecializesBaseComposition.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/usd/usdShade/testenv/testUsdShadeMaterialSpecializesBaseComposition.py
// GetBaseMaterial resolution across composition: directly, when the specializes
// parent is absent, and across single/nested reference arcs, and when concealed
// among non-material specializes.

import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { Stage, Prim } from 'typescript-usd/usd'
import { Material } from '../../src/index.ts'

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'materialSpecializesBaseComposition')

function getMaterial(stage: Stage, path: string): Material {
  const prim = stage.getPrim(path)
  expect(prim, `material at ${path}`).toBeTruthy()
  expect(Material.is(prim!)).toBe(true)
  return new Material(stage._primHandle(path), stage)
}

describe('UsdShade MaterialSpecializesBaseComposition', () => {
  it('resolves a direct base material', async () => {
    const stage = (await Stage.open(join(DIR, "library.usda")))!
    const child = getMaterial(stage, '/ChildMaterial')
    const base = getMaterial(stage, '/BaseMaterial')
    expect(base.getBaseMaterial()).toBeNull()
    expect(child.getBaseMaterial()?.path).toBe(base.path)
  })

  it('ignores a specializes parent not present on the stage', async () => {
    const stage = (await Stage.open(join(DIR, "asset.usda")))!
    const mat = getMaterial(stage, '/Asset/Looks/NotAChildMaterial')
    expect(mat.getBaseMaterial()).toBeNull()
    expect(mat.hasBaseMaterial()).toBe(false)
  })

  it('resolves a base material across a reference arc', async () => {
    const stage = (await Stage.open(join(DIR, "set_with_specialized_materials.usda")))!
    const looks = '/Shot/Set/SetChild/ReferencedAsset/Looks/'
    const child = getMaterial(stage, `${looks}ChildMaterial`)
    const base = getMaterial(stage, `${looks}BaseMaterial`)
    expect(base.getBaseMaterial()).toBeNull()
    expect(child.getBaseMaterial()?.path).toBe(base.path)
  })

  it('resolves a base material with multiple referenced parents', async () => {
    const stage = (await Stage.open(join(DIR, "multiple_referenced_parents.usda")))!
    const base = '/Shot/Set/SetChild/ReferencedAsset/Looks/'
    const child = getMaterial(stage, `${base}ChildMaterial`)
    const baseMat = getMaterial(stage, `${base}BaseMaterial`)
    expect(baseMat.getBaseMaterial()).toBeNull()
    expect(child.getBaseMaterial()?.path).toBe(baseMat.path)
  })

  it('finds the right specializes arc when some targets are not materials', async () => {
    const stage = (await Stage.open(join(DIR, "concealed_parent_material.usda")))!
    const child = getMaterial(stage, '/Shot/Looks/InterestingChild')
    const base = getMaterial(stage, '/Shot/Looks/Base')
    expect(base.getBaseMaterial()).toBeNull()
    expect(child.getBaseMaterial()?.path).toBe(base.path)
  })
})

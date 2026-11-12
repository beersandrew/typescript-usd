// Ported from OpenUSD 26.11.1: pxr/usd/usd/testenv/testUsdColorSpaceAPI.cpp,
//  pxr/usd/usd/testenv/testUsdColorSpaceAPIPy.py
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD pxr/usd/usd/testenv/testUsdColorSpaceAPI.cpp and
// testUsdColorSpaceAPIPy.py at v26.05.

import { describe, expect, it } from 'vitest'
import { ColorSpaceNames as GfColorSpaceNames } from 'typescript-usd/gf'
import {
  Stage, ColorSpaceAPI, ColorSpaceDefinitionAPI, ColorSpaceHashCache,
} from 'typescript-usd/usd'

describe('testUsdColorSpaceAPI', () => {
  it('applies the schema and resolves inherited built-in color spaces', () => {
    const stage = Stage.createNew()
    const root = stage.definePrim('/rec2020')
    const child = stage.definePrim('/rec2020/rec709')
    const grandchild = stage.definePrim('/rec2020/rec709/child')
    const cache = new ColorSpaceHashCache()

    const rootAPI = ColorSpaceAPI.apply(root)
    rootAPI.createColorSpaceNameAttr(GfColorSpaceNames.LinearRec2020)
    expect(root.hasAPI('ColorSpaceAPI')).toBe(true)
    expect(ColorSpaceAPI.computeColorSpaceName(root, cache)).toBe(GfColorSpaceNames.LinearRec2020)

    const childAPI = ColorSpaceAPI.apply(child)
    childAPI.createColorSpaceNameAttr(GfColorSpaceNames.LinearRec709)
    expect(ColorSpaceAPI.computeColorSpaceName(child)).toBe(GfColorSpaceNames.LinearRec709)
    expect(ColorSpaceAPI.computeColorSpaceName(grandchild)).toBe(GfColorSpaceNames.LinearRec709)
    const color = grandchild.createAttr('displayColor', [1, 1, 1])
    expect(ColorSpaceAPI.computeColorSpaceName(color)).toBe(GfColorSpaceNames.LinearRec709)
    color.setColorSpace(GfColorSpaceNames.SRGBRec709)
    expect(ColorSpaceAPI.computeColorSpaceName(color)).toBe(GfColorSpaceNames.SRGBRec709)
    expect(ColorSpaceAPI.canApply(grandchild)).toBe(true)
    expect(ColorSpaceAPI.get(stage, '/rec2020').prim.path).toBe(root.path)
  })

  it('applies named definitions and resolves a custom color space', () => {
    const stage = Stage.createNew()
    const definitions = stage.definePrim('/colorSpaceDef')
    const target = stage.definePrim('/colorSpaceDef/noCS/target')
    const name = 'test_rec2020'

    const definition = ColorSpaceDefinitionAPI.apply(definitions, name)
    definition.createNameAttr(name)
    definition.createColorSpaceAttrsWithChroma(
      [0.708, 0.292], [0.17, 0.797], [0.131, 0.046], [0.3127, 0.329], 1, 0)

    const targetAPI = ColorSpaceAPI.apply(target)
    targetAPI.createColorSpaceNameAttr(name)

    expect(ColorSpaceDefinitionAPI.getAll(definitions).map((d) => d.getName())).toEqual([name])
    expect(ColorSpaceDefinitionAPI.getSchemaAttributeNames(true, name)).toContain(
      `colorSpaceDefinition:${name}:redChroma`)
    expect(ColorSpaceAPI.computeColorSpaceName(target)).toBe(name)
    expect(ColorSpaceAPI.computeColorSpace(target).getName()).toBe(name)
  })

  it('rejects unknown color spaces and recognizes schema property paths', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/p')
    const api = ColorSpaceAPI.apply(prim)
    api.createColorSpaceNameAttr('not_defined')

    expect(ColorSpaceAPI.computeColorSpaceName(prim)).toBe('')
    expect(ColorSpaceDefinitionAPI.isSchemaPropertyBaseName('gamma')).toBe(true)
    expect(ColorSpaceDefinitionAPI.isSchemaPropertyBaseName('unknown')).toBe(false)
    // UsdColorSpaceDefinitionAPI::IsColorSpaceDefinitionAPIPath
    // (colorSpaceDefinitionAPI.cpp:92-119): the instance's own property path
    // names it; a path ending in a schema property base name does not.
    expect(ColorSpaceDefinitionAPI.isColorSpaceDefinitionAPIPath(
      '/p.colorSpaceDefinition:custom')).toBe('custom')
    expect(ColorSpaceDefinitionAPI.isColorSpaceDefinitionAPIPath(
      '/p.colorSpaceDefinition:custom:name')).toBeUndefined()
  })
})

// Ported from OpenUSD 26.11.1: pxr/usd/usdRi/testenv/testUsdRiSchemata.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.11.1 pxr/usd/usdRi/testenv/testUsdRiSchemata.py
// (registered as testUsdRiSchemata). Python bool(schema) is isValid(); a
// Python `assert prim` is prim.isValid(); SdfPath values are path strings.
// The Python _TestOutput helper is not called by the upstream test.
import { describe, expect, it } from 'vitest'
import { Layer, ValueTypeNames } from 'typescript-usd/sdf'
import { Stage } from 'typescript-usd/usd'
import { TfGetEnvSetting } from 'typescript-usd/tf'
import { Material, MaterialBindingAPI } from 'typescript-usd/usdShade'
import { MaterialAPI, StatementsAPI } from 'typescript-usd/usdRi'
import { USDRI_STATEMENTS_READ_OLD_ATTR_ENCODING } from '../../src/statementsAPI.ts'

describe('TestUsdRiSchemata', () => {
  it('test_Basic', async () => {
    const l = Layer.createAnonymous()
    const stage = await Stage.open(l)

    const world = stage.definePrim('/World', 'Xform')
    expect(world.isValid()).toBe(true)
    world.setMetadata('kind', 'group')
    expect(world.isModel()).toBe(true)
    expect(world.isGroup()).toBe(true)

    const group = stage.definePrim('/World/Group', 'Xform')
    expect(group.isValid()).toBe(true)
    group.setMetadata('kind', 'group')
    expect(group.isModel()).toBe(true)
    expect(group.isGroup()).toBe(true)

    const model = stage.definePrim('/World/Group/Model', 'Xform')
    expect(model.isValid()).toBe(true)
    model.setMetadata('kind', 'component')
    expect(model.isModel()).toBe(true)

    const p = stage.definePrim('/World/Group/Model/Mesh', 'Scope')
    expect(p.isValid()).toBe(true)

    // Test Material
    const material = Material.define(stage, '/World/Group/Model/Material')
    expect(material.isValid()).toBe(true)
    expect(material.prim.isValid()).toBe(true)
    MaterialBindingAPI.apply(p).bind(material)

    // Test RiMaterialAPI
    const riMaterial = MaterialAPI.apply(material.prim)
    expect(riMaterial.isValid()).toBe(true)
    expect(riMaterial.prim.isValid()).toBe(true)

    // Test RIS Material
    const risMaterial = new MaterialAPI(material.prim)
    expect(risMaterial.isValid()).toBe(true)
    expect(risMaterial.prim.isValid()).toBe(true)

    // Test riStatements
    const riStatements = StatementsAPI.apply(model)
    expect(riStatements.isValid()).toBe(true)
    expect(riStatements.prim.isValid()).toBe(true)
    // Python: CreateRiAttribute(...).Set(...) returns None; `assert attr`
    // there tests the Set result, which the next assertions cover.
    riStatements.createRiAttribute('ModelName', 'string').set('someModelName')
    const props = riStatements.getRiAttributes()
    expect(props.length).toBeGreaterThan(0)
    // this is so convoluted
    const attr = riStatements.prim.getAttr(props[0]!.name)!
    expect(attr.isValid()).toBe(true)
    const prefix = 'primvars:'
    expect(attr.name).toBe(prefix + 'ri:attributes:user:ModelName')
    expect(attr.get()).toBe('someModelName')
    expect(StatementsAPI.getRiAttributeName(attr)).toBe('ModelName')
    expect(StatementsAPI.getRiAttributeNameSpace(attr)).toBe('user')
    expect(StatementsAPI.isRiAttribute(attr)).toBe(true)

    expect(StatementsAPI.makeRiAttributePropertyName('myattr'))
      .toBe(prefix + 'ri:attributes:user:myattr')
    expect(StatementsAPI.makeRiAttributePropertyName('dice:myattr'))
      .toBe(prefix + 'ri:attributes:dice:myattr')
    expect(StatementsAPI.makeRiAttributePropertyName('dice.myattr'))
      .toBe(prefix + 'ri:attributes:dice:myattr')
    expect(StatementsAPI.makeRiAttributePropertyName('dice_myattr'))
      .toBe(prefix + 'ri:attributes:dice:myattr')
    // period is stronger separator than underscore, when both are present
    expect(StatementsAPI.makeRiAttributePropertyName('dice_my.attr'))
      .toBe(prefix + 'ri:attributes:dice_my:attr')
    // multiple tokens concatted with underscores
    expect(StatementsAPI.makeRiAttributePropertyName('dice:my1:long:attr'))
      .toBe(prefix + 'ri:attributes:dice:my1_long_attr')
    expect(StatementsAPI.makeRiAttributePropertyName('dice.my2.long.attr'))
      .toBe(prefix + 'ri:attributes:dice:my2_long_attr')
    expect(StatementsAPI.makeRiAttributePropertyName('dice_my3_long_attr'))
      .toBe(prefix + 'ri:attributes:dice:my3_long_attr')

    expect(riStatements.getCoordinateSystem()).toBe('')
    expect(new StatementsAPI(model).getModelCoordinateSystems()).toEqual([])
    expect(new StatementsAPI(model).getModelScopedCoordinateSystems()).toEqual([])
    riStatements.setCoordinateSystem('LEyeSpace')
    expect(riStatements.getCoordinateSystem()).toBe('LEyeSpace')
    expect(new StatementsAPI(model).getModelCoordinateSystems())
      .toEqual(['/World/Group/Model'])
    riStatements.setScopedCoordinateSystem('ScopedLEyeSpace')
    expect(riStatements.getScopedCoordinateSystem()).toBe('ScopedLEyeSpace')
    expect(new StatementsAPI(model).getModelScopedCoordinateSystems())
      .toEqual(['/World/Group/Model'])
    expect(new StatementsAPI(group).getModelCoordinateSystems()).toEqual([])
    expect(new StatementsAPI(group).getModelScopedCoordinateSystems()).toEqual([])
    expect(new StatementsAPI(world).getModelCoordinateSystems()).toEqual([])
    expect(new StatementsAPI(world).getModelScopedCoordinateSystems()).toEqual([])

    // Test mixed old & new style encodings
    if (TfGetEnvSetting(USDRI_STATEMENTS_READ_OLD_ATTR_ENCODING)) {
      const prim = stage.definePrim('/prim')
      const riStatements = StatementsAPI.apply(prim)
      expect(riStatements.getRiAttributes().length).toBe(0)
      // Add new-style
      const newStyleAttr = riStatements.createRiAttribute('newStyle', 'string')
      newStyleAttr.set('new')
      expect(riStatements.getRiAttributes().length).toBe(1)
      // Add old-style (note that we can't use UsdRi API for this,
      // since it doesn't let the caller choose the encoding)
      const oldStyleAttr = prim.createAttribute('ri:attributes:user:oldStyle',
        ValueTypeNames.String.name)
      oldStyleAttr.set('old')
      expect(riStatements.getRiAttributes().length).toBe(2)
      // Exercise the case of an Ri attribute encoded in both
      // old and new styles.
      const ignoredAttr = prim.createAttribute('ri:attributes:user:newStyle',
        ValueTypeNames.String.name)
      expect(riStatements.getRiAttributes().length).toBe(2)
      expect(riStatements.getRiAttributes().map(a => a.getPath()))
        .not.toContain(ignoredAttr.getPath())
    }
  })
})

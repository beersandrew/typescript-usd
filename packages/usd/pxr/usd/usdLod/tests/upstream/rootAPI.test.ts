// Ported from OpenUSD 26.11.1: pxr/usd/usdLod/testenv/testUsdLodRootAPI.py
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.11.1 pxr/usd/usdLod/testenv/testUsdLodRootAPI.py
import { beforeEach, describe, expect, it } from 'vitest'
import { Stage, type Prim } from 'typescript-usd/usd'
import { Cube, Cylinder, Sphere, Xform } from 'typescript-usd/usdGeom'
import { RootAPI } from 'typescript-usd/usdLod'

const TRANSLATE_X = 3.0

describe('TestUsdLodRootAPI', () => {
  let stage: Stage
  let lodRootPrim: Prim

  // Run before each test.
  beforeEach(() => {
    stage = Stage.createNew()
    Xform.define(stage, '/World')

    const lodRoot = Xform.define(stage, '/World/lodRoot')
    lodRootPrim = lodRoot.prim
    lodRoot.addTranslateXOp().set(TRANSLATE_X)

    const lodItems = [
      Sphere.define(stage, '/World/lodRoot/lodItem_0'),
      Cylinder.define(stage, '/World/lodRoot/lodItem_1'),
      Cube.define(stage, '/World/lodRoot/lodItem_2'),
    ]

    // UsdGeomImageable::CreateVisibilityAttr (uniform token visibility).
    const visValues = ['invisible', 'inherited', 'invisible']
    lodItems.forEach((lodItem, i) => {
      lodItem.prim.createAttribute('visibility', 'token', false, 'uniform').set(visValues[i])
    })
  })

  it('test_RootAPI', () => {
    // Test applying the rootAPI to a prim
    expect(lodRootPrim.hasAPI(RootAPI.typeName)).toBe(false)
    const rootAPI = RootAPI.apply(lodRootPrim)
    expect(rootAPI.isValid()).toBe(true)
    expect(lodRootPrim.hasAPI(RootAPI.typeName)).toBe(true)

    // Test create attributes and relationships
    const lodHeuristicsRel = rootAPI.createLodHeuristicsRel()
    expect(lodHeuristicsRel).toBeTruthy()

    // Test get attributes and relationships
    const lodHeuristicsRel2 = rootAPI.getLodHeuristicsRel()
    expect(lodHeuristicsRel2.getPath()).toBe(lodHeuristicsRel.getPath())

    const lodDefaultIndexAttr = rootAPI.createLodDefaultIndexAttr()
    expect(lodDefaultIndexAttr.isValid()).toBe(true)

    const lodDefaultIndexAttr2 = rootAPI.getLodDefaultIndexAttr()
    expect(lodDefaultIndexAttr2.getPath()).toBe(lodDefaultIndexAttr.getPath())
  })
})

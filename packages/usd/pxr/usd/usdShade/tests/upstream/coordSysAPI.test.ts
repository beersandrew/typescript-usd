// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdShade/testenv/testUsdShadeCoordSysAPI.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/usd/usdShade/testenv/testUsdShadeCoordSysAPI.py
// (the multi-apply UsdShadeCoordSysAPI). Expected values are taken verbatim
// from the .py asserts; the (name, bindingRelPath, coordSysPrimPath) tuples
// map to our Binding object fields.
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Stage, Prim } from 'typescript-usd/usd'
// Use the source under test directly (the barrel may be edited concurrently).
// The vendored usdShade plugin must still register: hasAPI/getAppliedSchemas
// resolve CoordSysAPI through the schema registry (upstream links the
// usdShade plugin; F1-C wiring).
import '../../src/plugin/registerPlugin.ts'
import { CoordSysAPI, type Binding } from '../../src/coordSysAPI.ts'

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'coordSysAPI')

// Build a Binding from the .py tuple (name, bindingRelPath, coordSysPrimPath).
function b(name: string, bindingRelPath: string, coordSysPrimPath: string): Binding {
  return { name, bindingRelPath, coordSysPrimPath }
}
const EMPTY = b('', '', '')

describe('UsdShadeCoordSysAPI (multi-apply)', () => {
  it('test_CoordSysMultiApply', async () => {
    const stage = (await Stage.open(join(FIXTURES, 'test.usda')))!

    // CanContainPropertyName
    expect(CoordSysAPI.canContainPropertyName('coordSys:worldSpace:binding')).toBe(true)
    expect(CoordSysAPI.canContainPropertyName('xformOp:translate')).toBe(false)

    const world = stage._primHandle('/World')
    const model = stage._primHandle('/World/Model')
    const geom = stage._primHandle('/World/Model/Geom')
    const box = stage._primHandle('/World/Model/Geom/Box')

    const worldSpace = CoordSysAPI.get(world, 'worldSpace')
    const modelInstanceSpace = CoordSysAPI.get(model, 'instanceSpace')
    const modelModelSpace = CoordSysAPI.get(model, 'modelSpace')
    const modelPaintSpace = CoordSysAPI.get(model, 'paintSpace')
    const modelWorldSpace = CoordSysAPI.get(model, 'worldSpace')

    // Local Bindings
    expect(worldSpace.getLocalBinding()).toEqual(
      b('worldSpace:binding', '/World.coordSys:worldSpace:binding', '/World/Space'))
    expect(modelInstanceSpace.getLocalBinding()).toEqual(
      b('instanceSpace:binding', '/World/Model.coordSys:instanceSpace:binding', '/World/Model'))
    expect(modelModelSpace.getLocalBinding()).toEqual(
      b('modelSpace:binding', '/World/Model.coordSys:modelSpace:binding', '/World/Model/Geom'))
    expect(modelPaintSpace.getLocalBinding()).toEqual(
      b('paintSpace:binding', '/World/Model.coordSys:paintSpace:binding', '/World/Model/Place3dTexture'))
    expect(modelWorldSpace.getLocalBinding()).toEqual(EMPTY)

    expect(CoordSysAPI.getLocalBindingsForPrim(model)).toEqual([
      b('instanceSpace:binding', '/World/Model.coordSys:instanceSpace:binding', '/World/Model'),
      b('modelSpace:binding', '/World/Model.coordSys:modelSpace:binding', '/World/Model/Geom'),
      b('paintSpace:binding', '/World/Model.coordSys:paintSpace:binding', '/World/Model/Place3dTexture'),
    ])
    expect(CoordSysAPI.getLocalBindingsForPrim(geom)).toEqual([])
    expect(CoordSysAPI.getLocalBindingsForPrim(box)).toEqual([])

    // Full (including inherited) Bindings
    expect(CoordSysAPI.findBindingsWithInheritanceForPrim(world)).toEqual([
      b('worldSpace:binding', '/World.coordSys:worldSpace:binding', '/World/Space'),
    ])
    const modelInherited = [
      b('instanceSpace:binding', '/World/Model.coordSys:instanceSpace:binding', '/World/Model'),
      b('modelSpace:binding', '/World/Model.coordSys:modelSpace:binding', '/World/Model/Geom'),
      b('paintSpace:binding', '/World/Model.coordSys:paintSpace:binding', '/World/Model/Place3dTexture'),
      b('worldSpace:binding', '/World.coordSys:worldSpace:binding', '/World/Space'),
    ]
    expect(CoordSysAPI.findBindingsWithInheritanceForPrim(model)).toEqual(modelInherited)
    expect(CoordSysAPI.findBindingsWithInheritanceForPrim(geom)).toEqual(modelInherited)
    expect(CoordSysAPI.findBindingsWithInheritanceForPrim(box)).toEqual(modelInherited)

    // Find binding in self or parent.
    expect(worldSpace.findBindingWithInheritance()).toEqual(worldSpace.getLocalBinding())
    // /World/Model.coordSys:worldSpace:binding has no targets -> searches the
    // ancestor for the same-named binding.
    expect(modelWorldSpace.findBindingWithInheritance()).toEqual(worldSpace.getLocalBinding())

    // create binding
    CoordSysAPI.apply(world, 'modelSpace')
    await stage.flushChanges()
    const worldModelSpace = CoordSysAPI.get(world, 'modelSpace')
    expect(worldModelSpace.createBindingRel()).toBeTruthy()
    // Bind and Clear using non-static APIs
    expect(worldModelSpace.bind(geom.path)).toBe(true)
    await stage.flushChanges()
    expect(worldModelSpace.getLocalBinding()).toEqual(
      b('modelSpace:binding', '/World.coordSys:modelSpace:binding', '/World/Model/Geom'))
    worldModelSpace.clearBinding(true)
    await stage.flushChanges()
    expect(worldModelSpace.getLocalBinding()).toEqual(EMPTY)

    // Bind and Clear Binding using static method APIs
    expect(CoordSysAPI.apply(world, 'modelSpace').bind(geom.path)).toBe(true)
    await stage.flushChanges()
    expect(worldModelSpace.getLocalBinding()).toEqual(
      b('modelSpace:binding', '/World.coordSys:modelSpace:binding', '/World/Model/Geom'))
    expect(CoordSysAPI.apply(world, 'modelSpace').clearBinding(true)).toBe(true)
    await stage.flushChanges()
    expect(worldModelSpace.getLocalBinding()).toEqual(EMPTY)

    // BlockBinding using non-static API
    expect(worldSpace.getLocalBinding()).toEqual(
      b('worldSpace:binding', '/World.coordSys:worldSpace:binding', '/World/Space'))
    expect(worldSpace.blockBinding()).toBe(true)
    await stage.flushChanges()
    expect(worldSpace.getLocalBinding()).toEqual(EMPTY)

    // BlockBinding using static API
    expect(CoordSysAPI.getLocalBindingsForPrim(model)).toEqual([
      b('instanceSpace:binding', '/World/Model.coordSys:instanceSpace:binding', '/World/Model'),
      b('modelSpace:binding', '/World/Model.coordSys:modelSpace:binding', '/World/Model/Geom'),
      b('paintSpace:binding', '/World/Model.coordSys:paintSpace:binding', '/World/Model/Place3dTexture'),
    ])
    expect(CoordSysAPI.apply(model, 'instanceSpace').blockBinding()).toBe(true)
    await stage.flushChanges()
    expect(CoordSysAPI.getLocalBindingsForPrim(model)).toEqual([
      b('modelSpace:binding', '/World/Model.coordSys:modelSpace:binding', '/World/Model/Geom'),
      b('paintSpace:binding', '/World/Model.coordSys:paintSpace:binding', '/World/Model/Place3dTexture'),
    ])
  })
})

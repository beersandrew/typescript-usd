// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdShade/testenv/testUsdShadeCoordSysAPIDeprecated.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/usd/usdShade/testenv/testUsdShadeCoordSysAPIDeprecated.py
// (the legacy non-applied UsdShadeCoordSysAPI, bindings authored directly as
// `coordSys:<name>` relationships). Expected values are taken verbatim from
// the .py asserts; the (name, bindingRelPath, coordSysPrimPath) tuples map to
// our Binding object fields.
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Stage, Prim } from 'typescript-usd/usd'
// Use the source under test directly (the barrel may be edited concurrently).
import { CoordSysAPI, type Binding } from '../../src/coordSysAPI.ts'

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'coordSysAPIDeprecated')

function b(name: string, bindingRelPath: string, coordSysPrimPath: string): Binding {
  return { name, bindingRelPath, coordSysPrimPath }
}

// UsdPrim::HasRelationship — a composed property that is a relationship.
function hasRel(stage: Stage, primPath: string, relName: string): boolean {
  return stage.getPrim(primPath)?.getAttr(relName)?.isRelationship === true
}
// UsdRelationship::HasAuthoredTargets — the targetPaths field is authored
// (present, even when empty).
function hasAuthoredTargets(stage: Stage, primPath: string, relName: string): boolean {
  return stage.getPrim(primPath)?.getAttr(relName)?.getField('targetPaths') !== undefined
}
// UsdRelationship::GetTargets.
function getTargets(stage: Stage, primPath: string, relName: string): string[] {
  return stage.getPrim(primPath)?.getAttr(relName)?.getTargets() ?? []
}

describe('UsdShadeCoordSysAPI (deprecated, non-applied)', () => {
  it('test_CoordSysNonAppliedDeprecated', async () => {
    const stage = (await Stage.open(join(FIXTURES, 'test.usda')))!

    // CanContainPropertyName
    expect(CoordSysAPI.canContainPropertyName('coordSys:worldSpace')).toBe(true)
    expect(CoordSysAPI.canContainPropertyName('xformOp:translate')).toBe(false)

    const world = stage._primHandle('/World_old')
    const model = stage._primHandle('/World_old/Model')
    const geom = stage._primHandle('/World_old/Model/Geom')
    const box = stage._primHandle('/World_old/Model/Geom/Box')

    // Constructed with a noop instance name (the deprecated methods ignore it).
    const worldCoords = CoordSysAPI.get(world, 'noop')
    const modelCoords = CoordSysAPI.get(model, 'noop')
    const geomCoords = CoordSysAPI.get(geom, 'noop')
    const boxCoords = CoordSysAPI.get(box, 'noop')

    // Local Bindings
    expect(worldCoords.getLocalBindings()).toEqual([
      b('worldSpace', '/World_old.coordSys:worldSpace', '/World_old/Space'),
    ])
    expect(modelCoords.getLocalBindings()).toEqual([
      b('instanceSpace', '/World_old/Model.coordSys:instanceSpace', '/World_old/Model'),
      b('modelSpace', '/World_old/Model.coordSys:modelSpace', '/World_old/Model/Geom'),
      b('paintSpace', '/World_old/Model.coordSys:paintSpace', '/World_old/Model/Place3dTexture'),
    ])
    expect(geomCoords.getLocalBindings()).toEqual([])
    expect(boxCoords.getLocalBindings()).toEqual([])

    // Full (including inherited) Bindings
    expect(worldCoords.findBindingsWithInheritance()).toEqual([
      b('worldSpace', '/World_old.coordSys:worldSpace', '/World_old/Space'),
    ])
    const modelInherited = [
      b('instanceSpace', '/World_old/Model.coordSys:instanceSpace', '/World_old/Model'),
      b('modelSpace', '/World_old/Model.coordSys:modelSpace', '/World_old/Model/Geom'),
      b('paintSpace', '/World_old/Model.coordSys:paintSpace', '/World_old/Model/Place3dTexture'),
      b('worldSpace', '/World_old.coordSys:worldSpace', '/World_old/Space'),
    ]
    expect(modelCoords.findBindingsWithInheritance()).toEqual(modelInherited)
    expect(geomCoords.findBindingsWithInheritance()).toEqual(modelInherited)
    expect(boxCoords.findBindingsWithInheritance()).toEqual(modelInherited)

    // Bind
    const relName = CoordSysAPI.getCoordSysRelationshipName('boxSpace')   // coordSys:boxSpace
    expect(hasRel(stage, geom.path, relName)).toBe(false)
    geomCoords.bind('boxSpace', box.path)
    await stage.flushChanges()
    expect(hasRel(stage, geom.path, relName)).toBe(true)
    expect(geomCoords.getLocalBindings()).toEqual([
      b('boxSpace', '/World_old/Model/Geom.coordSys:boxSpace', box.path),
    ])

    // BlockBinding
    expect(hasRel(stage, geom.path, relName)).toBe(true)
    expect(hasAuthoredTargets(stage, geom.path, relName)).toBe(true)
    expect(getTargets(stage, geom.path, relName)).not.toEqual([])
    geomCoords.blockBinding('boxSpace')
    await stage.flushChanges()
    expect(geomCoords.getLocalBindings()).toEqual([])
    expect(getTargets(stage, geom.path, relName)).toEqual([])
    expect(hasAuthoredTargets(stage, geom.path, relName)).toBe(true)

    // ClearBinding
    geomCoords.clearBinding('boxSpace', false)
    await stage.flushChanges()
    expect(hasRel(stage, geom.path, relName)).toBe(true)
    expect(hasAuthoredTargets(stage, geom.path, relName)).toBe(false)
    geomCoords.clearBinding('boxSpace', true)
    await stage.flushChanges()
    expect(hasRel(stage, geom.path, relName)).toBe(false)
  })
})

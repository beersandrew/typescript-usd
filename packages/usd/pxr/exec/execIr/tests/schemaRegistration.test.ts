// Ported from OpenUSD 26.11.1: pxr/exec/execIr/generatedSchema.usda,
//  pxr/exec/execIr/plugInfo.json
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// typescript-usd check: the execIr schema plugin registers
// (pxr/exec/execIr/src/plugin/registerPlugin.ts), so that a stage opened in
// TS types IrFkController/IrSwitchController/IrJointScope prims, UsdPrim::IsA
// sees the ExecIr schema hierarchy, and unauthored attributes resolve to the
// schema fallbacks. Expected values are those of upstream OpenUSD 26.11.1
// pxr/exec/execIr/generatedSchema.usda and plugInfo.json (line numbers cited).
import { describe, expect, it } from 'vitest'
import { Matrix4d as GfMatrix4d } from 'typescript-usd/gf'
import { Registry as PlugRegistry } from 'typescript-usd/plug'
import { Layer } from 'typescript-usd/sdf'
import { Type as TfType } from 'typescript-usd/tf'
import { SchemaRegistry, Stage } from 'typescript-usd/usd'
import '../src/plugin/registerPlugin.ts'

const identity = new GfMatrix4d(1)

async function openStage(): Promise<Stage> {
  const layer = Layer.createAnonymous('.usda')
  expect(layer.importFromString(`#usda 1.0
def IrFkController "Fk" {
}
def IrSwitchController "Switch" {
}
def IrJointScope "Joint" {
}
`)).toBe(true)
  return Stage.open(layer)
}

describe('execIr schema registration', () => {
  it('types prims and answers IsA through the ExecIr schema hierarchy', async () => {
    const stage = await openStage()
    const fk = stage.getPrim('/Fk')!
    const sw = stage.getPrim('/Switch')!
    const joint = stage.getPrim('/Joint')!

    // plugInfo.json Types: ExecIrFkController (schemaIdentifier
    // IrFkController) bases ExecIrController (IrController), which bases
    // UsdTyped; ExecIrJointScope bases ExecIrXformable. UsdPrim::IsA takes a
    // TfType (IsA<T>) or a schema identifier (prim.cpp:90-107).
    const type = (name: string) => TfType.findByName(name)
    expect(fk.getPrimTypeInfo().getSchemaType().getTypeName()).toBe('ExecIrFkController')
    expect(fk.isA(type('ExecIrFkController'))).toBe(true)
    expect(fk.isA(type('ExecIrController'))).toBe(true)
    expect(fk.isA(type('UsdTyped'))).toBe(true)
    expect(fk.isA('IrFkController')).toBe(true)
    expect(fk.isA('IrController')).toBe(true)
    expect(fk.isA('Typed')).toBe(true)
    expect(fk.isA(type('ExecIrSwitchController'))).toBe(false)
    expect(sw.isA(type('ExecIrSwitchController'))).toBe(true)
    expect(sw.isA('IrSwitchController')).toBe(true)
    expect(sw.isA(type('ExecIrController'))).toBe(true)
    expect(joint.isA(type('ExecIrJointScope'))).toBe(true)
    expect(joint.isA(type('ExecIrXformable'))).toBe(true)
    expect(joint.isA('IrXformable')).toBe(true)
    expect(joint.isA(type('ExecIrController'))).toBe(false)

    // schemaKind: IrController and IrXformable are abstractTyped.
    expect(SchemaRegistry.isConcrete(type('ExecIrFkController'))).toBe(true)
    expect(SchemaRegistry.isAbstract(type('ExecIrController'))).toBe(true)
    expect(SchemaRegistry.isAbstract(type('ExecIrXformable'))).toBe(true)
  })

  it('resolves schema fallback values', async () => {
    const stage = await openStage()
    const fk = stage.getPrim('/Fk')!
    // generatedSchema.usda:51-62 (in:tx, in:ty, in:tz = 0), 39-50 (in:rx,
    // in:ry, in:rz = 0), 31 (in:rspin = 0), 27 (in:rotationOrder = "XYZ"),
    // 20 (in:defaultSpace = identity), 69 (out:space = identity).
    for (const name of ['in:tx', 'in:ty', 'in:tz', 'in:rx', 'in:ry', 'in:rz', 'in:rspin']) {
      const attr = fk.getAttr(name)!
      expect(attr.isValid()).toBe(true)
      expect(attr.typeName).toBe('double')
      expect(attr.hasAuthoredValue()).toBe(false)
      expect(attr.get()).toBe(0)
    }
    expect(fk.getAttr('in:rotationOrder')!.get()).toBe('XYZ')
    expect(fk.getAttr('in:defaultSpace')!.get()).toEqual(identity)
    expect(fk.getAttr('out:space')!.get()).toEqual(identity)

    // generatedSchema.usda:124 (switch = "rig1"), 110 (rig1:space = identity).
    const sw = stage.getPrim('/Switch')!
    expect(sw.getAttr('switch')!.get()).toBe('rig1')
    expect(sw.getAttr('rig1:space')!.get()).toEqual(identity)

    // generatedSchema.usda:160 (avars:unitScaleFactor = 0), 142
    // (avars:rotationOrder = "XYZ"), inherited from IrXformable.
    const joint = stage.getPrim('/Joint')!
    expect(joint.getAttr('avars:unitScaleFactor')!.get()).toBe(0)
    expect(joint.getAttr('avars:rotationOrder')!.get()).toBe('XYZ')
  })

  it('registers the plugInfo SdfMetadata fields and keeps the Exec block', async () => {
    const stage = await openStage()
    const fk = stage.getPrim('/Fk')!
    // generatedSchema.usda:39-42: in:rx has irIsInvertible = true and
    // irRole = "InputAttribute"; :20-26 in:defaultSpace irRole =
    // "PassthroughAttribute".
    expect(fk.getAttr('in:rx')!.getMetadata('irRole')).toBe('InputAttribute')
    expect(fk.getAttr('in:rx')!.getMetadata('irIsInvertible')).toBe(true)
    expect(fk.getAttr('in:defaultSpace')!.getMetadata('irRole')).toBe('PassthroughAttribute')

    // plugInfo.json Info.Exec.Schemas, read by exec/pluginData.cpp.
    const plugin = PlugRegistry.GetInstance().GetPluginWithName('execIr')!
    expect(plugin).not.toBeNull()
    expect(plugin.getMetadata()['Exec']).toEqual({
      Schemas: {
        ExecIrFkController: { allowsPluginComputations: true },
        ExecIrSwitchController: { allowsPluginComputations: true },
        ExecIrXformable: { allowsPluginComputations: true },
      },
    })
  })
})

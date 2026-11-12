// Ported from OpenUSD 26.11.1:
//  pxr/exec/esfUsd/testenv/testEsfUsdSceneObjects.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/esfUsd/testenv/testEsfUsdSceneObjects.cpp
//
// Each upstream test function runs with a fresh Fixture
// (testEsfUsdSceneObjects.cpp:385-399); here each it() builds one. Mapping:
// `obj->Method(...)` is `obj.Get().Method(...)`, TF_AXIOM and ASSERT_EQ are
// expect; UsdStage/UsdPrim/UsdAttribute calls are the typescript-usd/usd
// counterparts (paths are strings there), and stage edits are awaited.
// UsdAttributeQuery::Get(VtValue*) is typescript-usd's get(time), whose
// result is undefined when no value resolves.
import { describe, expect, it } from 'vitest'
import { Type as TfType } from 'typescript-usd/tf'
import { Layer, ValueTypeNames as SdfValueTypeNames } from 'typescript-usd/sdf'
import { SdfPath } from 'typescript-usd/sdf/path'
import { AttributeQuery as UsdAttributeQuery, Stage, TimeCode as UsdTimeCode } from 'typescript-usd/usd'
import 'typescript-usd/usdGeom'
import type { EsfJournal } from 'typescript-usd/esf'
import { EsfSchemaConfigKey } from 'typescript-usd/esf'
import type { EsfObjectInterface } from 'typescript-usd/esf'
import { EsfUsdSceneAdapter } from '../../src/sceneAdapter.ts'
import { EsfUsdStageData } from '../../src/stageData.ts'

// SdfFieldKeys->Documentation.
const Documentation = 'documentation'

interface Fixture {
  payloadLayer: Layer
  stage: Stage
  stageData: EsfUsdStageData
  journal: EsfJournal | null
}

// testEsfUsdSceneObjects.cpp:49-106
async function makeFixture(): Promise<Fixture> {
  const payloadLayer = Layer.createAnonymous('.usda')
  const payloadLayerImported = payloadLayer.importFromString(`
            #usda 1.0
            def Scope "Prim" {
            }`)
  expect(payloadLayerImported).toBe(true)

  const rootLayer = Layer.createAnonymous('.usda')
  const rootLayerImported = rootLayer.importFromString(`
            #usda 1.0
            def Scope "Prim1" (
                prepend apiSchemas = ["CollectionAPI:collection1"]
                doc = "prim doc"
            ) {
                int attr1 (doc = "attr doc")
                int attr1 = 1
                int attr1.connect = [</Prim1.ns1:ns2:attr2>, </Prim1.attr3>]
                int ns1:ns2:attr2 (doc = "prop doc")
                int ns1:ns2:attr2 = 2
                double attr3.spline = {
                    1: 0,
                    2: 1,
                }
                rel rel1 (doc = "rel doc")
                rel rel1 = [</Prim1.attr1>, </Prim1.rel2>]
                rel rel2 = [</Prim2>, </Prim3>]
            }
            def Scope "Prim2" (
                prepend apiSchemas = ["CollectionAPI:collection1"]
            ) {
            }
            def Scope "Prim3" (
                prepend apiSchemas = ["CollectionAPI:collection2"]
            ) {
            }
            over "LoadablePrim" (
                payload = @${payloadLayer.identifier}@</Prim>
            ) {
            }
            over "UndefinedPrim" {
            }
            class "AbstractPrim" {
            }
            `)
  expect(rootLayerImported).toBe(true)

  const stage = await Stage.open(rootLayer)
  expect(stage).toBeTruthy()

  const stageData = EsfUsdStageData.registerStage(stage, /* listener */ null)
  expect(stageData).toBeTruthy()

  return { payloadLayer, stage, stageData, journal: null }
}

// testEsfUsdSceneObjects.cpp:108-124
function _TestMetadata(
  _fixture: Fixture,
  object: EsfObjectInterface,
  expectedValue: string,
): void {
  expect(object.isValidMetadataKey(Documentation)).toBe(true)
  expect(!object.isValidMetadataKey('bogusMetadataKey')).toBe(true)
  expect(object.getMetadataValueType(Documentation)).toBe(TfType.findByName('string'))
  expect(object.getMetadata(Documentation).Get<string>()).toBe(expectedValue)
}

describe('testEsfUsdSceneObjects', () => {
  // Tests that EsfUsd_Stage behaves as UsdStage.
  it('TestStage', async () => {
    const fixture = await makeFixture()
    const stage = EsfUsdSceneAdapter.adaptStage(fixture.stage)

    const prim = stage.Get().getPrimAtPath(
      SdfPath.fromString('/Prim1'), fixture.journal)
    expect(prim.Get().isValid(fixture.journal)).toBe(true)

    const attr = stage.Get().getAttributeAtPath(
      SdfPath.fromString('/Prim1.attr1'), fixture.journal)
    expect(attr.Get().isValid(fixture.journal)).toBe(true)

    const prop = stage.Get().getPropertyAtPath(
      SdfPath.fromString('/Prim1.ns1:ns2:attr2'), fixture.journal)
    expect(prop.Get().isValid(fixture.journal)).toBe(true)
  })

  // Tests that EsfUsd_Objects behave as UsdObjects.
  it('TestObject', async () => {
    const fixture = await makeFixture()
    const primObject = EsfUsdSceneAdapter.adaptObject(
      fixture.stage.getObjectAtPath('/Prim1'))
    expect(primObject.Get().isValid(fixture.journal)).toBe(true)
    _TestMetadata(fixture, primObject.Get(), 'prim doc')

    const attrObject = EsfUsdSceneAdapter.adaptObject(
      fixture.stage.getObjectAtPath('/Prim1.attr1'))
    expect(attrObject.Get().isValid(fixture.journal)).toBe(true)
    _TestMetadata(fixture, attrObject.Get(), 'attr doc')

    const relObject = EsfUsdSceneAdapter.adaptObject(
      fixture.stage.getObjectAtPath('/Prim1.rel1'))
    expect(relObject.Get().isValid(fixture.journal)).toBe(true)
    _TestMetadata(fixture, relObject.Get(), 'rel doc')

    const invalidObject = EsfUsdSceneAdapter.adaptObject(
      fixture.stage.getObjectAtPath('/Does/Not/Exist'))
    expect(!invalidObject.Get().isValid(fixture.journal)).toBe(true)

    // Deactivate the prim and ensure it and its properties become invalid.
    await fixture.stage.getPrim('/Prim1')!.setActive(false)
    expect(!primObject.Get().isValid(fixture.journal)).toBe(true)
    expect(!attrObject.Get().isValid(fixture.journal)).toBe(true)
    expect(!relObject.Get().isValid(fixture.journal)).toBe(true)

    // Ensure unloaded objects are invalid.
    const loadablePrimObject = EsfUsdSceneAdapter.adaptObject(
      fixture.stage.getObjectAtPath('/LoadablePrim'))
    expect(loadablePrimObject.Get().isValid(fixture.journal)).toBe(true)
    await fixture.stage.unload('/LoadablePrim')
    expect(!loadablePrimObject.Get().isValid(fixture.journal)).toBe(true)

    // Ensure undefined objects are invalid.
    const undefinedPrimObject = EsfUsdSceneAdapter.adaptObject(
      fixture.stage.getObjectAtPath('/UndefinedPrim'))
    expect(!undefinedPrimObject.Get().isValid(fixture.journal)).toBe(true)

    // Ensure abstract objects are invalid.
    const abstractPrimObject = EsfUsdSceneAdapter.adaptObject(
      fixture.stage.getObjectAtPath('/AbstractPrim'))
    expect(!abstractPrimObject.Get().isValid(fixture.journal)).toBe(true)
  })

  // Tests that EsfUsd_Prims behave as UsdPrims.
  it('TestPrim', async () => {
    const fixture = await makeFixture()
    const prim = EsfUsdSceneAdapter.adaptPrim(fixture.stage.getPrim('/Prim1'))
    expect(prim.Get().isValid(fixture.journal)).toBe(true)
    _TestMetadata(fixture, prim.Get(), 'prim doc')

    const pseudoRootPrim = prim.Get().getParent(fixture.journal)
    expect(pseudoRootPrim.Get().isValid(fixture.journal)).toBe(true)
    expect(pseudoRootPrim.Get().getPath(fixture.journal).equals(SdfPath.fromString('/'))).toBe(true)

    const expectedType = TfType.findByName('UsdGeomScope')
    expect(prim.Get().getType(fixture.journal)).toBe(expectedType)

    const expectedSchemas = ['CollectionAPI:collection1']
    expect(prim.Get().getAppliedSchemas(fixture.journal)).toEqual(expectedSchemas)

    const attr = prim.Get().getAttribute('attr1', fixture.journal)
    expect(attr.Get().isValid(fixture.journal)).toBe(true)
    expect(attr.Get().getPath(fixture.journal).equals(SdfPath.fromString('/Prim1.attr1'))).toBe(true)
  })

  // Tests that EsfUsd_Properties behave as UsdProperties.
  it('TestProperty', async () => {
    const fixture = await makeFixture()
    const prop = EsfUsdSceneAdapter.adaptProperty(
      fixture.stage.getPropertyAtPath('/Prim1.ns1:ns2:attr2'))
    expect(prop.Get().isValid(fixture.journal)).toBe(true)
    _TestMetadata(fixture, prop.Get(), 'prop doc')

    expect(prop.Get().getBaseName(fixture.journal)).toBe('attr2')
    expect(prop.Get().getNamespace(fixture.journal)).toBe('ns1:ns2')
  })

  // Tests that EsfUsd_Relationships behave as UsdRelationships.
  it('TestRelationship', async () => {
    const fixture = await makeFixture()
    const object = EsfUsdSceneAdapter.adaptObject(
      fixture.stage.getObjectAtPath('/Prim1.rel1'))
    expect(object.Get().isRelationship()).toBe(true)
    const rel = object.Get().asRelationship()
    expect(rel.Get().isValid(fixture.journal)).toBe(true)
    _TestMetadata(fixture, rel.Get(), 'rel doc')

    const targets = rel.Get().getTargets(fixture.journal)
    expect(targets.length).toBe(2)
    expect(targets.map(p => p.pathString)).toEqual(['/Prim1.attr1', '/Prim1.rel2'])

    const forwardedTargets = rel.Get().getForwardedTargets(fixture.journal)
    expect(forwardedTargets.length).toBe(3)
    expect(forwardedTargets.map(p => p.pathString))
      .toEqual(['/Prim1.attr1', '/Prim2', '/Prim3'])
  })

  // Tests that EsfUsd_Attributes behave as UsdAttributes.
  it('TestAttribute', async () => {
    const fixture = await makeFixture()
    const attr = EsfUsdSceneAdapter.adaptAttribute(
      fixture.stage.getAttributeAtPath('/Prim1.attr1'))
    expect(attr.Get().isValid(fixture.journal)).toBe(true)
    _TestMetadata(fixture, attr.Get(), 'attr doc')

    expect(attr.Get().GetValueTypeName(fixture.journal)).toBe(SdfValueTypeNames.Int)

    const targets = attr.Get().getConnections(fixture.journal)
    expect(targets.length).toBe(2)
    expect(targets.map(p => p.pathString)).toEqual(['/Prim1.ns1:ns2:attr2', '/Prim1.attr3'])
  })

  // Tests that EsfUsd_AttributeQuery behaves as UsdAttributeQuery.
  it('TestAttributeQuery', async () => {
    const fixture = await makeFixture()
    const usdAttr = fixture.stage.getAttributeAtPath('/Prim1.attr1')!
    const usdQuery = new UsdAttributeQuery(usdAttr)

    const esfAttr = EsfUsdSceneAdapter.adaptAttribute(usdAttr)
    const esfQuery = esfAttr.Get().getQuery()

    expect(esfQuery.Get().isValid()).toBe(usdQuery.isValid())
    const [esfFound, esfValue] = esfQuery.Get().Get(UsdTimeCode.Default())
    const usdValue = usdQuery.get(UsdTimeCode.Default())
    expect(esfFound).toBe(usdValue !== undefined)
    expect(esfValue.IsHolding(TfType.findByName('int'))).toBe(Number.isInteger(usdValue))
    expect(esfValue.UncheckedGet<number>() === usdValue).toBe(true)

    expect(esfQuery.Get().getPath().equals(SdfPath.fromString('/Prim1.attr1'))).toBe(true)
    expect(esfQuery.Get().getSpline() !== null).toBe(usdQuery.hasSpline())
    expect(esfQuery.Get().valueSourceMightBeTimeVarying())
      .toBe(usdQuery.valueSourceMightBeTimeVarying())
    expect(!esfQuery.Get().isTimeVarying(
      UsdTimeCode.Default(), new UsdTimeCode(0.0))).toBe(true)
  })

  // Tests EsfUsd_AttributeQuery with a time-varying spline attribute.
  it('TestSplineAttributeQuery', async () => {
    const fixture = await makeFixture()
    const usdAttr = fixture.stage.getAttributeAtPath('/Prim1.attr3')!
    const usdQuery = new UsdAttributeQuery(usdAttr)

    const esfAttr = EsfUsdSceneAdapter.adaptAttribute(usdAttr)
    const esfQuery = esfAttr.Get().getQuery()

    expect(esfQuery.Get().isValid()).toBe(usdQuery.isValid())
    const [esfFound, esfValue] = esfQuery.Get().Get(new UsdTimeCode(2.0))
    const usdValue = usdQuery.get(new UsdTimeCode(2.0))
    expect(esfFound).toBe(usdValue !== undefined)
    expect(esfValue.IsHolding(TfType.findByName('double'))).toBe(typeof usdValue === 'number')
    expect(esfValue.UncheckedGet<number>() === usdValue).toBe(true)

    expect(esfQuery.Get().getPath().equals(SdfPath.fromString('/Prim1.attr3'))).toBe(true)
    expect(esfQuery.Get().getSpline() !== null).toBe(usdQuery.hasSpline())
    expect(esfQuery.Get().valueSourceMightBeTimeVarying())
      .toBe(usdQuery.valueSourceMightBeTimeVarying())
    expect(esfQuery.Get().isTimeVarying(new UsdTimeCode(1.0), new UsdTimeCode(2.0))).toBe(true)
    expect(!esfQuery.Get().isTimeVarying(new UsdTimeCode(2.0), new UsdTimeCode(3.0))).toBe(true)
  })

  it('TestGetSchemaConfigKey', async () => {
    const fixture = await makeFixture()
    const pseudoRootObject = EsfUsdSceneAdapter.adaptObject(
      fixture.stage.getObjectAtPath('/'))
    expect(pseudoRootObject.Get().isValid(fixture.journal)).toBe(true)

    const prim1Object = EsfUsdSceneAdapter.adaptObject(
      fixture.stage.getObjectAtPath('/Prim1'))
    expect(prim1Object.Get().isValid(fixture.journal)).toBe(true)

    const attrObject = EsfUsdSceneAdapter.adaptObject(
      fixture.stage.getObjectAtPath('/Prim1.attr1'))
    expect(attrObject.Get().isValid(fixture.journal)).toBe(true)

    const relObject = EsfUsdSceneAdapter.adaptObject(
      fixture.stage.getObjectAtPath('/Prim1.rel1'))
    expect(relObject.Get().isValid(fixture.journal)).toBe(true)

    const prim2Object = EsfUsdSceneAdapter.adaptObject(
      fixture.stage.getObjectAtPath('/Prim2'))
    expect(prim2Object.Get().isValid(fixture.journal)).toBe(true)

    const prim3Object = EsfUsdSceneAdapter.adaptObject(
      fixture.stage.getObjectAtPath('/Prim3'))
    expect(prim3Object.Get().isValid(fixture.journal)).toBe(true)

    const key = (object: typeof prim1Object) => object.Get().getSchemaConfigKey(fixture.journal)
    expect(key(pseudoRootObject).Equals(new EsfSchemaConfigKey())).toBe(true)
    expect(key(prim1Object).notEquals(new EsfSchemaConfigKey())).toBe(true)
    expect(key(attrObject).Equals(key(prim1Object))).toBe(true)
    expect(key(relObject).Equals(key(prim1Object))).toBe(true)
    expect(key(prim1Object).Equals(key(prim2Object))).toBe(true)
    expect(key(prim1Object).notEquals(key(prim3Object))).toBe(true)
  })
})

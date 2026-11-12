// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdShade/testenv/testUsdShadeConnectableAPIBehavior.py
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usd/usdShade/testenv/testUsdShadeConnectableAPIBehavior.py
// (OpenUSD 26.11.1). Line numbers below cite that file. Fixtures:
// fixtures/testUsdShadeConnectableAPIBehavior is a verbatim copy of the
// upstream testenv directory (Pixar, TOST 1.0 license);
// its schema plugins are registered with PlugRegistry.RegisterPluginsAsync
// (Plug.Registry().RegisterPlugins with a path upstream). Python truthiness
// of a UsdShade.ConnectableAPI is isValid().
import { readFile } from 'node:fs/promises'
import { beforeAll, describe, expect, it } from 'vitest'
import { Registry as PlugRegistry } from 'typescript-usd/plug'
import { Type as TfType } from 'typescript-usd/tf'
import { CollectionAPI, Stage } from 'typescript-usd/usd'
import 'typescript-usd/usdGeom'
import { ConnectableAPI, Material, Shader } from '../../src/index.ts'

const resources = new URL('./fixtures/testUsdShadeConnectableAPIBehavior/resources/', import.meta.url)
const fileFetch = (async (input: string | URL | Request) => {
  const url = new URL(String(input instanceof Request ? input.url : input))
  try { return new Response(await readFile(url)) } catch { return new Response(null, { status: 404 }) }
}) as typeof fetch

// testUsdShadeConnectableAPIBehavior.py:11-14 (_SchemaTypeFindByName).
function schemaTypeFindByName(name: string): TfType {
  const result = TfType.findByName('UsdSchemaBase').findDerivedByName(name)
  expect(result.isUnknown()).toBe(false)
  return result
}

describe('TestUsdShadeConnectabaleAPIBehavior', () => {
  // :17-27 (setUpClass): register applied schemas and auto applied schemas.
  beforeAll(async () => {
    const testPlugins = await PlugRegistry.GetInstance().registerPluginsAsync(
      new URL('plugins1/', resources).href, { fetch: fileFetch })
    expect(testPlugins.length).toBe(1)
    expect(testPlugins[0]!.getName()).toBe('testUsdShadeConnectableAPIBehavior')
    schemaTypeFindByName('AutoApplyDefaultConnectableBehaviorAPI')
    schemaTypeFindByName('DefaultConnectableBehaviorAPI')
  })

  // :29-38 (test_UnconnectableType).
  it('test_UnconnectableType', () => {
    // Test for a bug-fix where unconnectable prim types returned "True" for
    // HasConnectableAPI.
    const stage = Stage.createNew()
    const scope = stage.definePrim('/Scope', 'Scope')
    expect(ConnectableAPI.hasConnectableAPI(TfType.findByName('UsdGeomScope'))).toBe(false)
    new ConnectableAPI(scope)
    expect(ConnectableAPI.hasConnectableAPI(TfType.findByName('UsdGeomScope'))).toBe(false)
  })

  // :41-67 (test_InvalidAppliedSchemaWithDefaultBehavior).
  it('test_InvalidAppliedSchemaWithDefaultBehavior', () => {
    const stage = Stage.createNew()

    // Create a typeless prim, add a multi-apply schema.
    const multiAPIPrim = stage.definePrim('/PrimA')
    expect(multiAPIPrim.typeName).toBe('')
    CollectionAPI.apply(multiAPIPrim, 'fanciness')
    const connectableMultiAPIPrim = new ConnectableAPI(multiAPIPrim)
    expect(connectableMultiAPIPrim.isValid()).toBe(false)
    expect(connectableMultiAPIPrim.isContainer()).toBe(false)

    // Create a typeless prim, add a non-existent API Schema.
    const invalidAPIPrim = stage.definePrim('/PrimB')
    expect(invalidAPIPrim.typeName).toBe('')
    invalidAPIPrim.addAppliedSchema('NoSuchLuckInvalidAPISchemaAPI')
    const connectableInvalidAPIPrim = new ConnectableAPI(invalidAPIPrim)
    expect(connectableInvalidAPIPrim.isValid()).toBe(false)
    expect(connectableInvalidAPIPrim.isContainer()).toBe(false)

    // Create a typeless prim, add a typed schema as an API Schema!
    const typedAPIPrim = stage.definePrim('/PrimC')
    expect(typedAPIPrim.typeName).toBe('')
    typedAPIPrim.addAppliedSchema('Material')
    const connectableTypedAPIPrim = new ConnectableAPI(typedAPIPrim)
    expect(connectableTypedAPIPrim.isValid()).toBe(false)
    expect(connectableTypedAPIPrim.isContainer()).toBe(false)
  })

  // :70-115 (test_AppliedSchemaWithDefaultBehavior).
  it('test_AppliedSchemaWithDefaultBehavior', () => {
    const stage = Stage.createNew()

    // Create a typeless prim.
    const typelessPrim = stage.definePrim('/Prim')
    expect(typelessPrim.typeName).toBe('')
    const connectableTypelessPrim = new ConnectableAPI(typelessPrim)
    expect(connectableTypelessPrim.isValid()).toBe(false)
    expect(connectableTypelessPrim.isContainer()).toBe(false)
    // Apply an API Schema which imparts connectability to this typeless prim.
    typelessPrim.addAppliedSchema('ModifiedDefaultConnectableBehaviorAPI')
    expect(connectableTypelessPrim.isValid()).toBe(true)
    expect(connectableTypelessPrim.isContainer()).toBe(true)

    // Imparts connectability traits to UsdShadeTestTyped prim while still
    // having no connectability traits on the type itself.
    expect(ConnectableAPI.hasConnectableAPI(schemaTypeFindByName('UsdShadeTestTyped'))).toBe(false)
    const usdShadeTestTyped = stage.definePrim('/UsdShadeTestTyped', 'UsdShadeTestTyped')
    const usdShadeTestTypedConn = new ConnectableAPI(usdShadeTestTyped)
    expect(usdShadeTestTypedConn.isValid()).toBe(false)
    expect(usdShadeTestTypedConn.requiresEncapsulation()).toBe(false)

    usdShadeTestTyped.addAppliedSchema('DefaultConnectableBehaviorAPI')
    expect(usdShadeTestTypedConn.isValid()).toBe(true)
    expect(usdShadeTestTypedConn.requiresEncapsulation()).toBe(true)
    expect(ConnectableAPI.hasConnectableAPI(schemaTypeFindByName('UsdShadeTestTyped'))).toBe(false)

    // Modify/override connectability behavior for an already connectable type.
    const material = Material.define(stage, '/Mat')
    const materialPrim = material.prim
    const materialPrimConn = new ConnectableAPI(materialPrim)
    expect(materialPrimConn.isValid()).toBe(true)
    expect(materialPrimConn.isContainer()).toBe(true)
    // Apply overriding connectability behavior (default has Container as false).
    materialPrim.addAppliedSchema('DefaultConnectableBehaviorAPI')
    expect(materialPrimConn.isValid()).toBe(true)
    expect(materialPrimConn.isContainer()).toBe(false)
  })

  // :117-139 (test_AutoAppliedSchemaWithDefaultBehavior).
  it('test_AutoAppliedSchemaWithDefaultBehavior', () => {
    const stage = Stage.createNew()

    const autoAppliedPrim = stage.definePrim('/AutoAppliedPrim', 'UsdShadeTestTypedHasAutoApplyDefault')
    const autoAppliedPrimConn = new ConnectableAPI(autoAppliedPrim)
    // Auto applied schema should have provided connectability behavior to
    // this prim type.
    expect(autoAppliedPrimConn.isValid()).toBe(true)
    expect(autoAppliedPrimConn.requiresEncapsulation()).toBe(true)
    expect(autoAppliedPrimConn.isContainer()).toBe(false)

    // We also auto apply a DefaultConnectableBehaviorAPI to UsdMaterial, but
    // it should not override its behavior.
    const material = Material.define(stage, '/Mat')
    const materialPrimConn = new ConnectableAPI(material.prim)
    expect(materialPrimConn.isValid()).toBe(true)
    expect(materialPrimConn.isContainer()).toBe(true)
    expect(materialPrimConn.requiresEncapsulation()).toBe(true)
  })

  // :141-185 (test_AutoAppliedSchemaWithOverridingPlugMetadata).
  it('test_AutoAppliedSchemaWithOverridingPlugMetadata', () => {
    const stage = Stage.createNew()

    const autoAppliedPrim = stage.definePrim('/Prim', 'UsdShadeTestTypedHasAutoApplyContainer')
    const connectable = new ConnectableAPI(autoAppliedPrim)
    expect(connectable.isValid()).toBe(true)
    expect(connectable.requiresEncapsulation()).toBe(true)
    // By default a behavior is not a container, but plug metadata on the
    // auto applied api schema sets isContainer to true.
    expect(connectable.isContainer()).toBe(true)

    const shader = Shader.define(stage, '/Shader')
    const shaderPrimConn = new ConnectableAPI(shader.prim)
    expect(shaderPrimConn.isValid()).toBe(true)
    // A type's behavior is stronger than any built-in apiSchemas behavior.
    expect(shaderPrimConn.isContainer()).toBe(false)
    expect(shaderPrimConn.requiresEncapsulation()).toBe(true)

    const autoAppliedPrim2 = stage.definePrim('/Prim2', 'UsdShadeTestTypedHasAutoApplyRequiresEncapsulation')
    const connectable2 = new ConnectableAPI(autoAppliedPrim2)
    expect(connectable2.isValid()).toBe(true)
    // Plug metadata on the auto applied api schema sets
    // requiresEncapsulation to false.
    expect(connectable2.requiresEncapsulation()).toBe(false)
    expect(connectable2.isContainer()).toBe(false)

    const material = Material.define(stage, '/Mat')
    const materialPrimConn = new ConnectableAPI(material.prim)
    expect(materialPrimConn.isValid()).toBe(true)
    // A type's behavior is stronger than any built-in apiSchemas behavior.
    expect(materialPrimConn.requiresEncapsulation()).toBe(true)
    expect(materialPrimConn.isContainer()).toBe(true)
  })

  // :188-245 (test_AppliedSchemaWithOverridingPlugMetadata).
  it('test_AppliedSchemaWithOverridingPlugMetadata', () => {
    const stage = Stage.createNew()

    expect(ConnectableAPI.hasConnectableAPI(schemaTypeFindByName('UsdShadeTestTyped'))).toBe(false)
    const usdShadeTestTyped = stage.definePrim('/UsdShadeTestTyped', 'UsdShadeTestTyped')
    const connectable = new ConnectableAPI(usdShadeTestTyped)
    expect(connectable.isValid()).toBe(false)
    expect(connectable.requiresEncapsulation()).toBe(false)

    // Add ModifiedDefaultConnectableBehaviorAPI apiSchema and see if
    // appropriate connectable behavior gets set for this prim.
    usdShadeTestTyped.addAppliedSchema('ModifiedDefaultConnectableBehaviorAPI')
    expect(connectable.isValid()).toBe(true)
    expect(connectable.isContainer()).toBe(true)
    expect(connectable.requiresEncapsulation()).toBe(false)
    expect(ConnectableAPI.hasConnectableAPI(schemaTypeFindByName('UsdShadeTestTyped'))).toBe(false)

    // If multiple applied schemas provide connectableBehavior then the order
    // in which these get applied determines the prim's behavior.
    usdShadeTestTyped.addAppliedSchema('DefaultConnectableBehaviorAPI')
    expect(connectable.isValid()).toBe(true)
    expect(connectable.isContainer()).toBe(true)
    expect(connectable.requiresEncapsulation()).toBe(false)

    // ModifiedDefaultConnectableBehaviorAPI explicitly applied modifies the
    // behavior of UsdShadeMaterial and UsdShadeShader prims.
    const material = Material.define(stage, '/Mat')
    const materialPrim = material.prim
    const materialPrimConn = new ConnectableAPI(materialPrim)
    expect(materialPrimConn.isValid()).toBe(true)
    expect(materialPrimConn.isContainer()).toBe(true)
    expect(materialPrimConn.requiresEncapsulation()).toBe(true)
    materialPrim.addAppliedSchema('ModifiedDefaultConnectableBehaviorAPI')
    expect(materialPrimConn.isContainer()).toBe(true)
    expect(materialPrimConn.requiresEncapsulation()).toBe(false)

    const shader = Shader.define(stage, '/Shader')
    const shaderPrim = shader.prim
    const shaderPrimConn = new ConnectableAPI(shaderPrim)
    expect(shaderPrimConn.isValid()).toBe(true)
    expect(shaderPrimConn.isContainer()).toBe(false)
    expect(shaderPrimConn.requiresEncapsulation()).toBe(true)
    shaderPrim.addAppliedSchema('ModifiedDefaultConnectableBehaviorAPI')
    expect(shaderPrimConn.isContainer()).toBe(true)
    expect(shaderPrimConn.requiresEncapsulation()).toBe(false)
  })

  // :247-270 (test_AncestorAndPlugConfiguredTypedSchema).
  it('test_AncestorAndPlugConfiguredTypedSchema', () => {
    const stage = Stage.createNew()

    // A type which imparts connectableAPIBehavior through its plug metadata
    // and not having an explicit behavior registered.
    expect(ConnectableAPI.hasConnectableAPI(schemaTypeFindByName('UsdShadeTestPlugConfiguredType'))).toBe(true)
    const plugConfigured = stage.definePrim('/UsdShadeTestPlugConfiguredType', 'UsdShadeTestPlugConfiguredType')
    const connectable = new ConnectableAPI(plugConfigured)
    expect(connectable.isValid()).toBe(true)
    expect(connectable.isContainer()).toBe(false)
    expect(connectable.requiresEncapsulation()).toBe(false)

    // A type which imparts connectableAPIBehavior through its ancestor.
    expect(ConnectableAPI.hasConnectableAPI(schemaTypeFindByName('UsdShadeTestAncestorConfiguredType'))).toBe(true)
    const ancestorConfigured = stage.definePrim('/UsdShadeTestAncestorConfiguredType', 'UsdShadeTestAncestorConfiguredType')
    const connectable2 = new ConnectableAPI(ancestorConfigured)
    expect(connectable2.isValid()).toBe(true)
    expect(connectable2.isContainer()).toBe(true)
    expect(connectable2.requiresEncapsulation()).toBe(true)
  })

  // :272-294 (test_NewPluginRegistrationNotice).
  it('test_NewPluginRegistrationNotice', async () => {
    // Add some behavior entries.
    expect(ConnectableAPI.hasConnectableAPI(TfType.findByName('UsdShadeMaterial'))).toBe(true)
    expect(ConnectableAPI.hasConnectableAPI(schemaTypeFindByName('UsdShadeTestTyped'))).toBe(false)

    // Check a material's behavior before registering new plugins.
    const stage = Stage.createNew()
    const material = Material.define(stage, '/Mat')
    const matConnectable = new ConnectableAPI(material.prim)
    expect(matConnectable.isValid()).toBe(true)
    expect(matConnectable.isContainer()).toBe(true)

    // Register new plugins, to trigger _DidRegisterPlugins, which should
    // prune the behavior cache of any entry which has a null behavior.
    const testPlugins = await PlugRegistry.GetInstance().registerPluginsAsync(
      new URL('plugins2/', resources).href, { fetch: fileFetch })
    expect(testPlugins.length).toBe(1)

    // Check material connectableAPI again if it has the correct behavior still.
    expect(matConnectable.isValid()).toBe(true)
    expect(matConnectable.isContainer()).toBe(true)
  })
})

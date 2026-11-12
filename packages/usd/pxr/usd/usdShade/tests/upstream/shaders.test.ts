// Ported from OpenUSD 26.11.1: pxr/usd/usdShade/testenv/testUsdShadeShaders.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usd/usdShade/testenv/testUsdShadeShaders.py (OpenUSD 26.11.1).
// Line numbers below cite that file. Python's
// UsdShade.ConnectionSourceInfo(api, name, Output) is
// new ConnectionSourceInfo(api, name, 'output'); Python's
// Input.GetConnectedSources() tuple is the [sources, invalidPaths] pair;
// "is None" results are undefined here; Python truthiness of a source info
// list compared with assertTrue is kept as a truthiness check.
import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { Scope } from 'typescript-usd/usdGeom'
import { ConnectionSourceInfo, Material, Shader } from '../../src/index.ts'

const palePath = '/Model/Materials/MaterialSharp/Pale'
const whiterPalePath = '/Model/Materials/MaterialSharp/WhiterPale'
const classPalePath = '/classPale'

// testUsdShadeShaders.py:24-43 (_SetupStage).
async function setupStage(): Promise<Stage> {
  const stage = Stage.createNew()

  Scope.define(stage, '/Model')
  Scope.define(stage, '/Model/Materials')
  Material.define(stage, '/Model/Materials/MaterialSharp')

  const pale = Shader.define(stage, palePath)
  expect(pale.isValid()).toBe(true)
  const whiterPale = Shader.define(stage, whiterPalePath)
  expect(whiterPale.isValid()).toBe(true)

  // Make a class for pale so we can test that disconnecting/blocking works.
  const classPale = stage.createClassPrim(classPalePath)
  expect(classPale.isValid()).toBe(true)
  await pale.prim.getInherits().addInherit(classPalePath)
  const shaderClass = new Shader(classPale)
  // It's not valid because it's not defined, but we can still author using it.
  expect(shaderClass.isValid()).toBe(false)

  return stage
}

function expectSources(actual: ConnectionSourceInfo[], expected: ConnectionSourceInfo[]) {
  expect(actual.length).toBe(expected.length)
  actual.forEach((info, i) => expect(info.equals(expected[i]!)).toBe(true))
}

describe('TestUsdShadeShaders', () => {
  // testUsdShadeShaders.py:45-202 (test_InputOutputConnections).
  it('test_InputOutputConnections', async () => {
    const stage = await setupStage()

    const pale = Shader.get(stage, palePath)
    expect(pale.isValid()).toBe(true)
    const whiterPale = Shader.get(stage, whiterPalePath)
    expect(whiterPale.isValid()).toBe(true)
    const shaderClass = Shader.get(stage, classPalePath)

    // :62-69 Test RenderType.
    const chords = pale.createInput('chords', 'string')
    expect(chords.getAttr().isValid()).toBe(true)
    expect(chords.hasRenderType()).toBe(false)
    expect(chords.getRenderType()).toBe('')
    chords.setRenderType('notes')
    expect(chords.hasRenderType()).toBe(true)
    expect(chords.getRenderType()).toBe('notes')

    // :71-88 Test scalar connections.
    const usdShadeInput = pale.createInput('myFloatInput', 'float')

    const doc = 'My shade input'
    usdShadeInput.setDocumentation(doc)
    expect(usdShadeInput.getDocumentation()).toBe(doc)

    const displayGroup = 'floats'
    usdShadeInput.setDisplayGroup(displayGroup)
    expect(usdShadeInput.getDisplayGroup()).toBe(displayGroup)

    expect(usdShadeInput.getBaseName()).toBe('myFloatInput')
    expect(usdShadeInput.getTypeName()).toBe('float')
    usdShadeInput.set(1.0)
    expect(usdShadeInput.hasConnectedSource()).toBe(false)

    // :90-104
    const fout = () => new ConnectionSourceInfo(whiterPale.connectableAPI(), 'Fout', 'output')
    usdShadeInput.connectToSource(fout())
    expect(usdShadeInput.hasConnectedSource()).toBe(true)
    expect(usdShadeInput.getAttr().getConnections()).toEqual([`${whiterPale.path}.outputs:Fout`])
    expectSources(usdShadeInput.getConnectedSources()[0], [fout()])
    usdShadeInput.clearSources()
    expect(usdShadeInput.hasConnectedSource()).toBe(false)
    expect(usdShadeInput.getConnectedSources()[0]).toEqual([])

    // :106-125 Now make the connection in the class.
    const inheritedInput = shaderClass.createInput('myFloatInput', 'float')
    inheritedInput.connectToSource(fout())
    // Note we're now testing the inheritING prim's parameter.
    expect(usdShadeInput.hasConnectedSource()).toBe(true)
    expect(usdShadeInput.getConnectedSources()[0].length > 0).toBe(true)
    // Clearing no longer changes anything.
    usdShadeInput.clearSources()
    expect(usdShadeInput.hasConnectedSource()).toBe(true)
    expect(usdShadeInput.getConnectedSources()[0].length > 0).toBe(true)
    // But disconnecting should.
    usdShadeInput.disconnectSource()
    expect(usdShadeInput.hasConnectedSource()).toBe(false)
    expect(usdShadeInput.getConnectedSources()[0]).toEqual([])

    // :128-141 Test asset id.
    expect(pale.getImplementationSource()).toBe('id')
    expect(whiterPale.getImplementationSource()).toBe('id')

    expect(pale.setShaderId('SharedFloat_1')).toBe(true)
    expect(pale.getShaderId()).toBe('SharedFloat_1')

    expect(whiterPale.createIdAttr('SharedColor_1').isValid()).toBe(true)
    expect(whiterPale.getIdAttr().get()).toBe('SharedColor_1')

    expect(pale.getSourceAsset()).toBeUndefined()
    expect(whiterPale.getSourceCode()).toBeUndefined()

    // :143-174 Test boundaries of parameter type-testing when connecting.
    const colInput = pale.createInput('col1', 'color3f')
    expect(colInput.getAttr().isValid()).toBe(true)
    expect(colInput.connectToSource(
      new ConnectionSourceInfo(whiterPale.connectableAPI(), 'colorOut', 'output'))).toBe(true)
    let outputAttr = whiterPale.prim.getAttr('outputs:colorOut')!
    expect(outputAttr.isValid()).toBe(true)
    expect(outputAttr.typeName).toBe('color3f')

    const v3fInput = pale.createInput('v3f1', 'float3')
    expect(v3fInput.getAttr().isValid()).toBe(true)
    expect(v3fInput.connectToSource(
      new ConnectionSourceInfo(whiterPale.connectableAPI(), 'colorOut', 'output'))).toBe(true)

    const pointInput = pale.createInput('point1', 'point3f')
    expect(pointInput.getAttr().isValid()).toBe(true)
    expect(pointInput.connectToSource(
      new ConnectionSourceInfo(whiterPale.connectableAPI(), 'colorOut', 'output'))).toBe(true)

    const floatInput = pale.createInput('float1', 'float')
    expect(floatInput.getAttr().isValid()).toBe(true)
    // (:160-166 strict type-checking is disabled upstream; bug/113600.)
    expect(floatInput.connectToSource(
      new ConnectionSourceInfo(whiterPale.connectableAPI(), 'floatInput', 'input'))).toBe(true)
    outputAttr = whiterPale.prim.getAttr('outputs:floatInput')!
    expect(outputAttr.isValid()).toBe(false)
    outputAttr = whiterPale.prim.getAttr('inputs:floatInput')!
    expect(outputAttr.isValid()).toBe(true)

    // :176-202 Test Input Fetching.
    const vecInput = pale.createInput('vec', 'color3f')
    expect(vecInput.getAttr().isValid()).toBe(true)
    expect(pale.getInput('vec').getAttr().isValid()).toBe(true)
    expect(pale.getInput('vec').getBaseName()).toBe('vec')
    expect(pale.getInput('vec').getTypeName()).toBe('color3f')
    expect(pale.getInput('vec').setRenderType('foo')).toBe(true)
    expect(pale.getInput('vec').getRenderType()).toBe('foo')

    // Test against multiple input parameters.
    const inputs = pale.getInputs()
    // Assure new item in collection.
    expect(inputs.filter(pr => pr.getRenderType() === 'foo').length).toBe(1)

    // Ensure the input count increments properly.
    const oldlen = pale.getInputs().length
    pale.createInput('struct', 'color3f')
    expect(pale.getInputs().length).toBe(oldlen + 1)

    // Ensure by-value capture in 'inputs'.
    expect(pale.getInputs().length).not.toBe(inputs.length)
  })

  // testUsdShadeShaders.py:204-246 (test_SdrMetadata).
  it('test_SdrMetadata', async () => {
    const stage = await setupStage()

    const pale = Shader.get(stage, palePath)
    expect(pale.isValid()).toBe(true)
    expect(pale.getSdrMetadata()).toEqual({})

    // Pale inherits from ClassPale.
    const classPale = Shader.get(stage, classPalePath)

    // Sdr.NodeMetadata.Primvars is "primvars".
    const baseSdrMetadata = { primvars: 'primvarA|primvarB|primvarC' }
    classPale.setSdrMetadata(baseSdrMetadata)
    expect(pale.getSdrMetadata()).toEqual(baseSdrMetadata)

    const paleSdrMetadata = { departments: 'anim|layout', category: 'preview' }
    for (const [i, j] of Object.entries(paleSdrMetadata)) pale.setSdrMetadataByKey(i, j)

    expect(pale.getSdrMetadata()).toEqual({
      category: 'preview',
      primvars: 'primvarA|primvarB|primvarC',
      departments: 'anim|layout',
    })

    pale.clearSdrMetadataByKey('primvars')
    expect(pale.getSdrMetadata()).toEqual({
      category: 'preview',
      primvars: 'primvarA|primvarB|primvarC',
      departments: 'anim|layout',
    })

    classPale.clearSdrMetadataByKey('primvars')
    expect(pale.getSdrMetadata()).toEqual(paleSdrMetadata)

    pale.clearSdrMetadata()
    expect(pale.getSdrMetadata()).toEqual({})
  })

  // testUsdShadeShaders.py:248-367 (test_ImplementationSource).
  it('test_ImplementationSource', async () => {
    const stage = await setupStage()

    const pale = Shader.get(stage, palePath)
    expect(pale.isValid()).toBe(true)
    const whiterPale = Shader.get(stage, whiterPalePath)
    expect(whiterPale.isValid()).toBe(true)

    expect(pale.getImplementationSource()).toBe('id')
    expect(whiterPale.getImplementationSource()).toBe('id')

    expect(pale.setShaderId('SharedFloat_1')).toBe(true)
    expect(pale.getShaderId()).toBe('SharedFloat_1')

    expect(whiterPale.setShaderId('SharedColor_1')).toBe(true)
    expect(whiterPale.getShaderId()).toBe('SharedColor_1')

    pale.getImplementationSourceAttr().set('sourceAsset')
    expect(pale.getShaderId()).toBeUndefined()

    whiterPale.getImplementationSourceAttr().set('sourceCode')
    expect(whiterPale.getShaderId()).toBeUndefined()

    // :277-293
    const glslfxSource = 'This is the shader source'
    expect(pale.setSourceCode(glslfxSource, 'glslfx')).toBe(true)

    // Calling SetSourceCode() updates the implementationSource to 'code'.
    expect(pale.getImplementationSource()).toBe('sourceCode')
    expect(pale.getShaderId()).toBeUndefined()

    expect(pale.getSourceAsset()).toBeUndefined()
    expect(pale.getSourceAsset('glslfx')).toBeUndefined()

    expect(pale.getSourceCode('osl')).toBeUndefined()
    expect(pale.getSourceCode()).toBeUndefined()

    expect(pale.getSourceCode('glslfx')).toBe(glslfxSource)

    // :295-316 universalSourceType is the empty token.
    const oslAssetPath = '/source/asset.osl'
    expect(whiterPale.setSourceAsset(oslAssetPath, '')).toBe(true)

    // Calling SetSourceAsset() updates the implementationSource to 'asset'.
    expect(whiterPale.getImplementationSource()).toBe('sourceAsset')
    expect(whiterPale.getShaderId()).toBeUndefined()

    // Since the sourceAsset was set with universal sourceType, we can fetch
    // it successfully irrespective of the sourceType that's passed in.
    expect(whiterPale.getSourceAsset('osl')).toBe(oslAssetPath)
    expect(whiterPale.getSourceAsset('glslfx')).toBeTruthy()
    expect(whiterPale.getSourceAsset()).toBe(oslAssetPath)

    expect(whiterPale.getSourceCode()).toBeUndefined()
    expect(whiterPale.getSourceCode('osl')).toBeUndefined()

    // :318-327 Set another sourceAsset corresponding to a specific sourceType.
    const glslfxAssetPath = '/source/asset.glslfx'
    expect(whiterPale.setSourceAsset(glslfxAssetPath, 'glslfx')).toBe(true)
    expect(whiterPale.getSourceAsset('osl')).toBe(oslAssetPath)
    expect(whiterPale.getSourceAsset('glslfx')).toBeTruthy()
    expect(whiterPale.getSourceAsset()).toBe(oslAssetPath)

    // :329-332 Test getting a sub identifier before it has been set.
    expect(whiterPale.getSourceAssetSubIdentifier()).toBeUndefined()
    expect(whiterPale.getSourceAssetSubIdentifier('glslfx')).toBeUndefined()

    // :334-337 Reset implementation source to not be 'sourceAsset'.
    whiterPale.getImplementationSourceAttr().set('id')
    expect(whiterPale.getImplementationSource()).toBe('id')

    // :339-347 Check that calling SetSourceAssetSubIdentifier updates
    // implementationSource to 'asset'.
    let subId = 'mySubIdentifier'
    expect(whiterPale.setSourceAssetSubIdentifier(subId, '')).toBe(true)
    expect(whiterPale.getSourceAssetSubIdentifier('')).toBe(subId)
    expect(whiterPale.getImplementationSource()).toBe('sourceAsset')

    // :349-367 Test that setting a source asset and sub identifier will
    // update the correct attributes for a variety source types.
    const sourceAsset = 'someSourceAsset'
    const sourceTypes = ['', 'osl']
    const subIds = ['myUniversalSubIdentifier', 'myOSLSubIdentifier']
    sourceTypes.forEach((sourceType, i) => {
      subId = subIds[i]!
      expect(whiterPale.setSourceAsset(sourceAsset, sourceType)).toBe(true)
      expect(whiterPale.setSourceAssetSubIdentifier(subId, sourceType)).toBe(true)
      expect(whiterPale.getSourceAssetSubIdentifier(sourceType)).toBe(subId)
    })
  })

  // testUsdShadeShaders.py:369-406 (testGetSourceTypes).
  it('testGetSourceTypes', async () => {
    const stage = await setupStage()

    const pale = Shader.get(stage, palePath)
    expect(pale.isValid()).toBe(true)

    expect(pale.getImplementationSource()).toBe('id')

    expect(pale.setShaderId('SharedFloat_1')).toBe(true)
    expect(pale.getShaderId()).toBe('SharedFloat_1')

    pale.getImplementationSourceAttr().set('sourceCode')
    expect(pale.getShaderId()).toBeUndefined()

    expect(pale.getSourceTypes()).toEqual([])

    // Set sourceType for a sourceCode implementation.
    const oslSource = 'This is the shader source'
    expect(pale.setSourceCode(oslSource, 'osl')).toBe(true)
    expect(pale.getSourceTypes()).toEqual(['osl'])

    // Check if we can detect multiple sourceTypes per implementation.
    const glslfxSource = 'This is the shader source'
    expect(pale.setSourceCode(glslfxSource, 'glslfx')).toBe(true)
    expect([...pale.getSourceTypes()].sort()).toEqual(['glslfx', 'osl'])

    // Set sourceType for sourceAsset implmentation.
    pale.getImplementationSourceAttr().set('sourceAsset')
    const glslfxAssetPath = '/source/asset.glslfx'
    expect(pale.setSourceAsset(glslfxAssetPath, 'glslfx')).toBe(true)

    expect(pale.getSourceTypes()).toEqual(['glslfx'])
  })
})

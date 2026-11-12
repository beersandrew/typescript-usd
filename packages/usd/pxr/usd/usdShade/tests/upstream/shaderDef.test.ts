// Ported from OpenUSD 26.11.1: pxr/usd/sdr/registry.cpp,
//  pxr/usd/sdr/shaderParserTestUtils.py,
//  pxr/usd/usdShade/testenv/testUsdShadeShaderDef.py
// Copyright 2017, 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usd/usdShade/testenv/testUsdShadeShaderDef.py (OpenUSD
// 26.11.1), with the pxr/usd/sdr/shaderParserTestUtils.py
// TestShaderPropertiesNode helper it calls. Line numbers cite those files.
// Fixtures: fixtures/testUsdShadeShaderDef is a verbatim copy of the upstream
// testenv directory (Pixar, TOST 1.0 license). The test
// runs in that directory upstream; here relative names are absolute against
// it, and files the test creates in its cwd go to a temporary directory.
//
// Adaptations:
//  * UsdStage::Open is asynchronous here, so the stage a definition lives in
//    is opened by the test and handed to ShaderDefParserPlugin, which parses
//    discovery results against the stage of their resolvedUri
//    (UsdShade.ShaderDefParserPlugin() opens it itself upstream).
//  * Python's GetType(property) (shaderParserTestUtils.py:29-38) is the
//    TfType of the property's SdfValueTypeName; here it is that value type's
//    C++ type name, std::string spelled "string" as TfType names it.
//  * Sdr._ValidateProperty (wrapRegistry.cpp:43-52, sdr/registry.cpp:55-97)
//    is Sdr._validateProperty; its assertions are the separate test below.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AssetPath, findValueTypeName } from 'typescript-usd/sdf'
import * as Sdr from 'typescript-usd/sdr'
import { Stage } from 'typescript-usd/usd'
import { NodeDefAPI, Shader, ShaderDefParserPlugin, ShaderDefUtils } from '../../src/index.ts'

const testenv = path.join(import.meta.dirname, 'fixtures/testUsdShadeShaderDef')
const tempDirs: string[] = []
afterEach(() => { for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })

// shaderParserTestUtils.py:29-38 (GetType).
function getType(property: Sdr.ShaderProperty): string {
  const cppTypeName = findValueTypeName(property.getTypeAsSdfType())?.cppTypeName ?? ''
  return cppTypeName.replaceAll('std::string', 'string')
}

// testUsdShadeShaderDef.py:19-132 (test_ShaderDefParser).
async function testShaderDefParser(useForwardedAPI: boolean) {
  const cwd = mkdtempSync(path.join(tmpdir(), 'testUsdShadeShaderDef-'))
  tempDirs.push(cwd)
  // Usd.Stage.CreateNew: a new, empty layer at the path.
  const stagePath = path.join(cwd, useForwardedAPI ? 'shaderDef.usda' : 'shaderDef2.usda')
  writeFileSync(stagePath, '#usda 1.0\n')
  const stage = (await Stage.open(stagePath))!
  const shaderPrim = Shader.define(stage, '/Primvar_float_2')
  // UsdShadeShader has API that covers UsdShadeNodeDefAPI methods; the
  // NodeDefAPI variant uses the methods as implemented on NodeDefAPI.
  const nodeDefAPI = useForwardedAPI ? shaderPrim : new NodeDefAPI(shaderPrim.prim)

  // Sdr.NodeMetadata.Role, Sdr.NodeRole.Primvar.
  shaderPrim.setSdrMetadataByKey('role', 'primvar')
  nodeDefAPI.getImplementationSourceAttr().set('sourceAsset')

  // Create the files referenced by the sourceAsset attributes. These files
  // need to exist for node discovery to succeed.
  const osoPath = path.join(cwd, 'primvar_2.oso')
  const glslfxPath = path.join(cwd, 'primvar_2.glslfx')
  writeFileSync(osoPath, '')
  writeFileSync(glslfxPath, '')

  nodeDefAPI.setSourceAsset(new AssetPath(osoPath), 'OSL')
  nodeDefAPI.setSourceAsset(new AssetPath(glslfxPath), 'glslfx')

  const primvarNameInput = shaderPrim.createInput('primvarName', 'token')
  primvarNameInput.setConnectability('interfaceOnly')
  primvarNameInput.setSdrMetadataByKey('primvarProperty', '1')

  const primvarFileInput = shaderPrim.createInput('primvarFile', 'asset')
  primvarFileInput.setConnectability('interfaceOnly')

  const fallbackInput = shaderPrim.createInput('fallback', 'float')
  fallbackInput.setSdrMetadataByKey('defaultInput', '1')

  // Create dummy inputs of other types for testing.
  shaderPrim.createInput('int2Val', 'int2')
  shaderPrim.createInput('int3Val', 'int3')
  shaderPrim.createInput('int4Val', 'int4')
  shaderPrim.createInput('float2Val', 'float2')
  shaderPrim.createInput('float3Val', 'float3')
  shaderPrim.createInput('float4Val', 'float4')
  shaderPrim.createInput('someColor', 'color3f')
  shaderPrim.createInput('someVector', 'vector3f')
  shaderPrim.createInput('normalVector', 'normal3f')
  shaderPrim.createInput('someVector', 'matrix4d')

  shaderPrim.createOutput('result', 'float')
  shaderPrim.createOutput('result2', 'float2')

  const discoveryResults = ShaderDefUtils.getDiscoveryResults(shaderPrim, stage.getRootLayer().realPath)
  expect(discoveryResults.length).toBe(2)

  const parserPlugin = new ShaderDefParserPlugin(stage)
  const nodes = discoveryResults.map(discResult => parserPlugin.parseShaderNode(discResult))
  expect(nodes.length).toBe(2)

  for (const n of nodes) {
    expect(n.getShaderVersion().equals(new Sdr.Version(2, 0))).toBe(true)
    expect(n.isValid()).toBe(true)
    expect(n.getFunction()).toBe('Primvar')
    expect(n.getIdentifier()).toBe('Primvar_float_2')
    expect(n.getImplementationName()).toBe('Primvar_float')
    expect(n.getRole()).toBe('primvar')

    const assetIdentifierInputNames = n.getAssetIdentifierInputNames()
    expect(assetIdentifierInputNames.length).toBe(1)

    expect(n.getDefaultInput()?.getName()).toBe('fallback')

    expect(assetIdentifierInputNames[0]).toBe('primvarFile')
    expect(n.getMetadata()).toEqual({
      context: 'usda',
      domain: 'rendering',
      primvars: '$primvarName',
      role: 'primvar',
      sdrUsdEncodingVersion: '-1',
    })
    expect(n.getShaderInputNames()).toEqual([
      'fallback', 'float2Val', 'float3Val',
      'float4Val', 'int2Val', 'int3Val', 'int4Val', 'normalVector',
      'primvarFile', 'primvarName', 'someColor', 'someVector'])
    expect(n.getShaderOutputNames()).toEqual(['result', 'result2'])
    if (n.getShadingSystem() === 'OSL') {
      expect(n.getResolvedImplementationURI()).toBe(osoPath)
    } else if (n.getShadingSystem() === 'glslfx') {
      expect(n.getResolvedImplementationURI()).toBe(glslfxPath)
    }
  }
  // :129-132 clean-up files (afterEach removes the temporary directory).
}

// shaderParserTestUtils.py:425-640 (TestShaderPropertiesNode), without the
// Sdr._ValidateProperty assertions (the separate test below).
function testShaderPropertiesNode(node: Sdr.ShaderNode) {
  // This test should only be run on the following allowed node names.
  const allowedNodeNames = ['TestShaderPropertiesNodeOSL', 'TestShaderPropertiesNodeARGS', 'TestShaderPropertiesNodeUSD']
  expect(allowedNodeNames).toContain(node.getName())
  if (node.getName() === 'TestShaderPropertiesNodeOSL') expect(node.getSourceType()).toBe('OSL')
  else if (node.getName() === 'TestShaderPropertiesNodeARGS') expect(node.getSourceType()).toBe('RmanCpp')
  else if (node.getName() === 'TestShaderPropertiesNodeUSD') expect(node.getSourceType()).toBe('glslfx')

  const nodeInputs = Object.fromEntries(node.getShaderInputNames().map(name => [name, node.getShaderInput(name)!]))
  const nodeOutputs = Object.fromEntries(node.getShaderOutputNames().map(name => [name, node.getShaderOutput(name)!]))

  const check = (property: Sdr.ShaderProperty | undefined, sdrType: string, tfType: string) => {
    expect(property).toBeDefined()
    expect(property!.getType()).toBe(sdrType)
    expect(getType(property!)).toBe(tfType)
  }

  check(nodeInputs['inputInt'], 'int', 'int')
  check(nodeInputs['inputString'], 'string', 'string')
  check(nodeInputs['inputFloat'], 'float', 'float')
  check(nodeInputs['inputColor'], 'color', 'GfVec3f')
  check(nodeInputs['inputPoint'], 'point', 'GfVec3f')
  check(nodeInputs['inputNormal'], 'normal', 'GfVec3f')
  check(nodeInputs['inputVector'], 'vector', 'GfVec3f')
  check(nodeInputs['inputMatrix'], 'matrix', 'GfMatrix4d')

  if (node.getName() !== 'TestShaderPropertiesNodeUSD') {
    // 'struct' and 'vstruct' types are unsupported by the
    // UsdShadeShaderDefParserPlugin.
    check(nodeInputs['inputStruct'], 'struct', 'TfToken')
    check(nodeInputs['inputVstruct'], 'vstruct', 'TfToken')
  }

  check(nodeInputs['inputIntArray'], 'int', 'VtArray<int>')
  check(nodeInputs['inputStringArray'], 'string', 'VtArray<string>')
  check(nodeInputs['inputFloatArray'], 'float', 'VtArray<float>')
  check(nodeInputs['inputColorArray'], 'color', 'VtArray<GfVec3f>')
  check(nodeInputs['inputPointArray'], 'point', 'VtArray<GfVec3f>')
  check(nodeInputs['inputNormalArray'], 'normal', 'VtArray<GfVec3f>')
  check(nodeInputs['inputVectorArray'], 'vector', 'VtArray<GfVec3f>')
  check(nodeInputs['inputMatrixArray'], 'matrix', 'VtArray<GfMatrix4d>')
  check(nodeInputs['inputFloat2'], 'float', 'GfVec2f')
  check(nodeInputs['inputFloat3'], 'float', 'GfVec3f')
  check(nodeInputs['inputFloat4'], 'float', 'GfVec4f')
  check(nodeInputs['inputAsset'], 'string', 'SdfAssetPath')
  check(nodeInputs['inputAssetArray'], 'string', 'VtArray<SdfAssetPath>')
  check(nodeInputs['inputColorRoleNone'], 'float', 'GfVec3f')
  check(nodeInputs['inputPointRoleNone'], 'float', 'GfVec3f')
  check(nodeInputs['inputNormalRoleNone'], 'float', 'GfVec3f')
  check(nodeInputs['inputVectorRoleNone'], 'float', 'GfVec3f')
  check(nodeOutputs['outputSurface'], 'terminal', 'TfToken')

  // Specific test of implementationName feature, we can skip type-tests.
  expect(nodeInputs['normal']!.getImplementationName()).toBe('aliasedNormalInput')

  if (node.getName() !== 'TestShaderPropertiesNodeOSL' && node.getName() !== 'TestShaderPropertiesNodeARGS') {
    check(nodeInputs['inputColor4'], 'color4', 'GfVec4f')
    check(nodeInputs['inputColor4Array'], 'color4', 'VtArray<GfVec4f>')
    check(nodeInputs['inputColor4RoleNone'], 'float', 'GfVec4f')
  }
}

// testUsdShadeShaderDef.py:134-137 / 185: the stage, shader and parsed node
// of test_ShaderProperties.
async function parseTestShaderPropertiesNode() {
  const stage = (await Stage.open(path.join(testenv, 'shaderDefs.usda')))!
  const shaderDef = Shader.get(stage, '/TestShaderPropertiesNodeUSD')
  const discoveryResults = ShaderDefUtils.getDiscoveryResults(shaderDef, stage.getRootLayer().realPath)
  expect(discoveryResults.length).toBe(1)
  const node = new ShaderDefParserPlugin(stage).parseShaderNode(discoveryResults[0]!)
  return { stage, shaderDef, node }
}

describe('TestUsdShadeShaderDef', () => {
  // testUsdShadeShaderDef.py:15-17 (test_ShaderDefParser_NodeDefAPI).
  it('test_ShaderDefParser_NodeDefAPI', async () => {
    await testShaderDefParser(false)
  })

  // testUsdShadeShaderDef.py:19-132.
  it('test_ShaderDefParser', async () => {
    await testShaderDefParser(true)
  })

  // testUsdShadeShaderDef.py:134-195 (test_ShaderProperties).
  it('test_ShaderProperties', async () => {
    const { shaderDef, node } = await parseTestShaderPropertiesNode()
    expect(node).toBeDefined()

    expect(path.basename(node.getResolvedImplementationURI())).toBe('TestShaderPropertiesNode.glslfx')
    expect(path.basename(node.getResolvedDefinitionURI())).toBe('shaderDefs.usda')

    // Test GetOptions on an attribute via allowedTokens and
    // sdrMetadata["options"].
    let expectedOptionsList: [string, string][] = [['token1', ''], ['token2', '']]
    expect(node.getShaderInput('testAllowedTokens')!.getOptions()).toEqual(expectedOptionsList)
    expect(node.getShaderInput('testMetadataOptions')!.getOptions()).toEqual(expectedOptionsList)

    // sdrMetadata options will win over explicitly specified allowedTokens
    // on the attr.
    const attr = shaderDef.prim.getAttr('inputs:testAllowedTokenAndMetdataOptions')!
    const expectedMetdataOptions = 'token3|token4'
    const expectedAttrAllowedTokens = ['token1', 'token2']
    expectedOptionsList = [['token3', ''], ['token4', '']]
    expect(node.getShaderInput('testAllowedTokenAndMetdataOptions')!.getMetadata()['options'])
      .toBe(expectedMetdataOptions)
    expect([...(attr.getMetadata('allowedTokens') as string[])]).toEqual(expectedAttrAllowedTokens)
    expect(node.getShaderInput('testAllowedTokenAndMetdataOptions')!.getOptions()).toEqual(expectedOptionsList)

    // A bool type gets mapped to int in UsdShadeShaderDef appropriately.
    const actualBoolInput = node.getShaderInput('actualBool')!
    const boolAttr = shaderDef.prim.getAttr('inputs:actualBool')!
    expect(boolAttr.typeName).toBe('bool')
    expect(actualBoolInput.getTypeAsSdfType()).toBe('bool')
    expect(actualBoolInput.getType()).toBe('int')

    testShaderPropertiesNode(node)
  })

  // shaderParserTestUtils.py:425-640: every `assert Sdr._ValidateProperty(
  // node, property)` of TestShaderPropertiesNode.
  it('test_ShaderProperties: Sdr._ValidateProperty', async () => {
    const { node } = await parseTestShaderPropertiesNode()
    const validateProperty = Sdr._validateProperty
    expect(validateProperty).toBeTypeOf('function')
    // The properties TestShaderPropertiesNode validates for the USD node.
    for (const name of [
      'inputInt', 'inputString', 'inputFloat', 'inputColor', 'inputPoint', 'inputNormal',
      'inputVector', 'inputMatrix', 'inputIntArray', 'inputStringArray', 'inputFloatArray',
      'inputColorArray', 'inputPointArray', 'inputNormalArray', 'inputVectorArray',
      'inputMatrixArray', 'inputFloat2', 'inputFloat3', 'inputFloat4', 'inputAsset',
      'inputAssetArray', 'inputColorRoleNone', 'inputPointRoleNone', 'inputNormalRoleNone',
      'inputVectorRoleNone', 'normal', 'inputColor4', 'inputColor4Array', 'inputColor4RoleNone',
    ]) {
      expect(validateProperty!(node, node.getShaderInput(name)!)).toBe(true)
    }
    expect(validateProperty!(node, node.getShaderOutput('outputSurface')!)).toBe(true)
  })

  // testUsdShadeShaderDef.py:197-216 (test_GetShaderNodeFromAsset).
  it('test_GetShaderNodeFromAsset', async () => {
    const shaderAsset = path.join(testenv, 'shaderDefs.usda')
    const stage = (await Stage.open(shaderAsset))!
    const reg = Sdr.Registry.getInstance()
    reg.setExtraParserPlugins({ usda: new ShaderDefParserPlugin(stage) })

    const node = reg.getShaderNodeFromAsset(
      new AssetPath(shaderAsset), // shaderAsset
      {}, // metadata
      'TestShaderPropertiesNodeUSD', // subIdentifier
      'glslfx', // sourceType
    )

    expect(node).toBeDefined()
    expect(node!.getIdentifier().endsWith('<TestShaderPropertiesNodeUSD><glslfx>')).toBe(true)
  })
})

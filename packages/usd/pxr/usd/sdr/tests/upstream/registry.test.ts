// Ported from OpenUSD 26.11.1:
//  pxr/usd/sdr/testenv/TestSdrRegistry_argsParserPlugin.cpp,
//  pxr/usd/sdr/testenv/TestSdrRegistry_discoveryPlugin.cpp,
//  pxr/usd/sdr/testenv/TestSdrRegistry_oslParserPlugin.cpp,
//  pxr/usd/sdr/testenv/testSdrRegistry.py
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD 26.11.1 pxr/usd/sdr/testenv/testSdrRegistry.py
// (registration testSdrRegistry) with its test plugins
// TestSdrRegistry_discoveryPlugin.cpp, TestSdrRegistry_argsParserPlugin.cpp
// and TestSdrRegistry_oslParserPlugin.cpp, written here as plugin classes
// registered with SdrRegisterDiscoveryPlugin / SdrRegisterParserPlugin
// (SDR_REGISTER_*_PLUGIN) for the types TestSdrRegistry_plugInfo.json
// declares. The test plugin library is this module: its plugInfo is
// registered as part of this build (no plugInfo URL, so nothing to load).
import { beforeAll, describe, expect, it } from 'vitest'
import { Registry as PlugRegistry } from 'typescript-usd/plug'
import { AssetPath as SdfAssetPath } from 'typescript-usd/sdf'
import { Type as TfType } from 'typescript-usd/tf'
import {
  Registry as SdrRegistry, ShaderNode as SdrShaderNode, ShaderProperty as SdrShaderProperty,
  Version as SdrVersion, parseSdfValue,
  RegisterDiscoveryPlugin as SdrRegisterDiscoveryPlugin, RegisterParserPlugin as SdrRegisterParserPlugin,
  type DiscoveryPlugin as SdrDiscoveryPlugin, type NodeDiscoveryResult as SdrShaderNodeDiscoveryResult,
  type ParserPlugin as SdrParserPlugin, type PropertyType as SdrPropertyType,
} from '../../src/index.ts'

// The test's ENV (sdr/CMakeLists.txt:139-141): built-in plugins are not
// found; the test lists the plugins it wants explicitly.
process.env.PXR_SDR_SKIP_DISCOVERY_PLUGIN_DISCOVERY = '1'
process.env.PXR_SDR_SKIP_PARSER_PLUGIN_DISCOVERY = '1'

// TestSdrRegistry_plugInfo.json.
const testPlugInfo = {
  Plugins: [{
    Type: 'library',
    Name: 'TestSdrRegistry',
    Root: '@TEST_PLUG_INFO_ROOT@',
    LibraryPath: '@TEST_PLUG_INFO_LIBRARY_PATH@',
    ResourcePath: '@TEST_PLUG_INFO_RESOURCE_PATH@',
    Info: {
      Types: {
        _SdrTestDiscoveryPlugin: { bases: ['SdrDiscoveryPlugin'] },
        _SdrTestDiscoveryPlugin2: { bases: ['SdrDiscoveryPlugin'] },
        _SdrArgsTestParserPlugin: { bases: ['SdrParserPlugin'] },
        _SdrOslTestParserPlugin: { bases: ['SdrParserPlugin'] },
      },
    },
  }],
}

const dr = (
  identifier: string, discoveryType: string, sourceType: string, uri: string,
  metadata?: Record<string, string>,
): SdrShaderNodeDiscoveryResult => ({
  identifier, version: new SdrVersion().getAsDefault(), name: identifier, function: '',
  discoveryType, sourceType, uri, resolvedUri: uri, ...(metadata ? { metadata } : {}),
})

// _SdrTestDiscoveryPlugin (TestSdrRegistry_discoveryPlugin.cpp:14-90).
const tdp: SdrDiscoveryPlugin = {
  getSearchURIs: () => ['/TestSearchPath'],
  discoverShaderNodes: () => [
    dr('TestNodeARGS', 'args', 'RmanCpp', 'TestNodeARGS.args'),
    // Test specifying an invalid encoding.
    dr('TestNodeOSL', 'oso', 'OSL', 'TestNodeOSL.oso', { sdrUsdEncodingVersion: 'foobar' }),
    dr('TestNodeSameName', 'args', 'RmanCpp', 'TestNodeSameName.args'),
    // Mark this shader as having a legacy USD encoding.
    dr('TestNodeSameName', 'oso', 'OSL', 'TestNodeSameName.oso', { sdrUsdEncodingVersion: '0' }),
  ],
}
// _SdrTestDiscoveryPlugin2 (TestSdrRegistry_discoveryPlugin.cpp:94-145).
const tdp2: SdrDiscoveryPlugin = {
  getSearchURIs: () => ['/TestSearchPath2'],
  discoverShaderNodes: () => [
    dr('TestNodeARGS2', 'args', 'RmanCpp', 'TestNodeARGS2.args'),
    dr('TestNodeGLSLFX', 'glslfx', 'glslfx', 'TestNodeGLSLFX.glslfx'),
  ],
}

const nodeFrom = (d: SdrShaderNodeDiscoveryResult, properties: SdrShaderProperty[], metadata?: Record<string, string>) =>
  new SdrShaderNode(d.identifier, d.version, d.name, d.function, d.sourceType, d.sourceType,
    d.resolvedUri, d.resolvedUri, properties, metadata)

// _SdrArgsTestParserPlugin (TestSdrRegistry_argsParserPlugin.cpp:20-52).
const tpp: SdrParserPlugin = {
  getSourceType: () => 'RmanCpp',
  parseShaderNode: d => nodeFrom(d, []),
}
// _SdrOslTestParserPlugin (TestSdrRegistry_oslParserPlugin.cpp:24-107).
const tpp2: SdrParserPlugin = {
  getSourceType: () => 'OSL',
  parseShaderNode: d => {
    const properties: SdrShaderProperty[] = []
    const add = (type: SdrPropertyType, suffix: string, arrayLen: number, value: unknown, metadata: Record<string, string>) =>
      properties.push(new SdrShaderProperty(`${type}${suffix}Property`, type, value, false, arrayLen, metadata))
    const arrayMetadatum = { isDynamicArray: 'true' }
    add('Int', '', 0, 0, {})
    add('String', '', 0, '', {})
    add('Float', '', 0, 0.0, {})
    add('Color', '', 0, [0, 0, 0], {})
    add('Point', '', 0, [0, 0, 0], {})
    add('Normal', '', 0, [0, 0, 0], {})
    add('Vector', '', 0, [0, 0, 0], {})
    add('Matrix', '', 0, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], {})
    add('Struct', '', 0, undefined, {})
    add('Terminal', '', 0, undefined, {})
    add('Vstruct', '', 0, undefined, {})
    add('Vstruct', '_Array', 0, undefined, arrayMetadatum)
    add('Float', '_Vstruct', 0, undefined, { isDynamicArray: 'true', tag: 'vstruct' })
    add('Float', '_Vec2', 2, [0, 0], {})
    add('Float', '_Vec3', 3, [0, 0, 0], {})
    add('Float', '_Vec4', 4, [0, 0, 0, 0], {})
    add('String', '_Asset', 0, '', { __SDR__isAssetIdentifier: '' })
    return nodeFrom(d, properties, d.metadata)
  },
}

// The plugin classes and their SDR_REGISTER_DISCOVERY_PLUGIN /
// SDR_REGISTER_PARSER_PLUGIN (TestSdrRegistry_discoveryPlugin.cpp:99,162;
// TestSdrRegistry_argsParserPlugin.cpp:57; TestSdrRegistry_oslParserPlugin.cpp:117).
// GetDiscoveryTypes: 'args' and 'oso'.
class _SdrTestDiscoveryPlugin implements SdrDiscoveryPlugin {
  getSearchURIs(): string[] { return tdp.getSearchURIs!() }
  discoverShaderNodes(): SdrShaderNodeDiscoveryResult[] { return tdp.discoverShaderNodes() }
}
class _SdrTestDiscoveryPlugin2 implements SdrDiscoveryPlugin {
  getSearchURIs(): string[] { return tdp2.getSearchURIs!() }
  discoverShaderNodes(): SdrShaderNodeDiscoveryResult[] { return tdp2.discoverShaderNodes() }
}
class _SdrArgsTestParserPlugin implements SdrParserPlugin {
  getDiscoveryTypes(): string[] { return ['args'] }
  getSourceType(): string { return tpp.getSourceType!() }
  parseShaderNode(d: SdrShaderNodeDiscoveryResult): SdrShaderNode | undefined { return tpp.parseShaderNode(d) }
}
class _SdrOslTestParserPlugin implements SdrParserPlugin {
  getDiscoveryTypes(): string[] { return ['oso'] }
  getSourceType(): string { return tpp2.getSourceType!() }
  parseShaderNode(d: SdrShaderNodeDiscoveryResult): SdrShaderNode | undefined { return tpp2.parseShaderNode(d) }
}
SdrRegisterDiscoveryPlugin('_SdrTestDiscoveryPlugin', _SdrTestDiscoveryPlugin)
SdrRegisterDiscoveryPlugin('_SdrTestDiscoveryPlugin2', _SdrTestDiscoveryPlugin2)
SdrRegisterParserPlugin('_SdrArgsTestParserPlugin', _SdrArgsTestParserPlugin)
SdrRegisterParserPlugin('_SdrOslTestParserPlugin', _SdrOslTestParserPlugin)

const argsType = 'RmanCpp', oslType = 'OSL', glslfxType = 'glslfx'
let reg: SdrRegistry

// testSdrRegistry.py:29-76 (setUpClass).
beforeAll(() => {
  // Register test plugins and verify they have been found.
  const plugins = PlugRegistry.GetInstance().RegisterPlugins(testPlugInfo)
  expect(plugins.length).toBe(1)
  const tdpType = TfType.findByName('_SdrTestDiscoveryPlugin')
  const tdp2Type = TfType.findByName('_SdrTestDiscoveryPlugin2')
  const tppType = TfType.findByName('_SdrArgsTestParserPlugin')
  const tpp2Type = TfType.findByName('_SdrOslTestParserPlugin')
  const derived = (name: string) => new Set(PlugRegistry.getAllDerivedTypes(TfType.findByName(name)))
  for (const type of [tdpType, tdp2Type]) expect(derived('SdrDiscoveryPlugin').has(type)).toBe(true)
  for (const type of [tppType, tpp2Type]) expect(derived('SdrParserPlugin').has(type)).toBe(true)

  // Instantiating the registry will kick off the discovery process.
  reg = SdrRegistry.getInstance()

  // Set up the test parser plugins.
  reg.setExtraParserPlugins([tppType, tpp2Type])

  // The _SdrTestDiscoveryPlugin should find discovery results that have
  // source types of RmanCpp and OSL.
  reg.setExtraDiscoveryPlugins([tdpType])
  expect([...reg.getAllShaderNodeSourceTypes()].sort()).toEqual([oslType, argsType])

  // The _SdrTestDiscoveryPlugin2 should find discovery results that have
  // source types of RmanCpp and glslfx.
  reg.setExtraDiscoveryPlugins([tdp2Type])
})

describe('testSdrRegistry', () => {
  // testSdrRegistry.py:78-176.
  it('test_Registry', () => {
    expect([...reg.getAllShaderNodeSourceTypes()].sort()).toEqual([oslType, argsType, glslfxType])

    const nodes = reg.getShaderNodesByFamily()
    const shaderNodeNames = nodes.map(node => node.getName())
    expect(shaderNodeNames.length).toBe(5)
    expect(new Set(shaderNodeNames)).toEqual(new Set([
      'TestNodeARGS', 'TestNodeARGS2', 'TestNodeOSL', 'TestNodeSameName']))
    expect(shaderNodeNames.filter(n => n === 'TestNodeSameName').length).toBe(2)

    expect(reg.getSearchURIs()).toEqual(['/TestSearchPath', '/TestSearchPath2'])

    expect(new Set(reg.getShaderNodeNames())).toEqual(new Set([
      'TestNodeARGS', 'TestNodeARGS2', 'TestNodeOSL', 'TestNodeSameName', 'TestNodeGLSLFX']))
    expect(new Set(reg.getShaderNodeIdentifiers())).toEqual(new Set([
      'TestNodeARGS', 'TestNodeARGS2', 'TestNodeOSL', 'TestNodeSameName', 'TestNodeGLSLFX']))

    expect(reg.getShaderNodeByName(nodes[0]!.getName())).toBe(nodes[0])

    const nodeName = 'TestNodeSameName', nodeIdentifier = 'TestNodeSameName'
    expect(reg.getShaderNodesByName(nodeName).length).toBe(2)
    expect(reg.getShaderNodeByNameAndType(nodeName, oslType)).toBeDefined()
    expect(reg.getShaderNodeByNameAndType(nodeName, argsType)).toBeDefined()
    expect(reg.getShaderNodeByName(nodeName, [oslType, argsType])!.getSourceType()).toBe(oslType)
    expect(reg.getShaderNodeByName(nodeName, [argsType, oslType])!.getSourceType()).toBe(argsType)

    expect(reg.getShaderNodesByIdentifier(nodeIdentifier).length).toBe(2)
    expect(reg.getShaderNodeByIdentifierAndType(nodeIdentifier, oslType)).toBeDefined()
    expect(reg.getShaderNodeByIdentifierAndType(nodeIdentifier, argsType)).toBeDefined()
    expect(reg.getShaderNodeByIdentifier(nodeIdentifier, [oslType, argsType])!.getSourceType()).toBe(oslType)
    expect(reg.getShaderNodeByIdentifier(nodeIdentifier, [argsType, oslType])!.getSourceType()).toBe(argsType)

    let node = reg.getShaderNodeFromAsset(new SdfAssetPath('TestNodeSourceAsset.oso'), {}, 'mySubIdentifier')
    expect(node!.getIdentifier().endsWith('<mySubIdentifier><>')).toBe(true)
    expect(node!.getName()).toBe('TestNodeSourceAsset.oso')

    node = reg.getShaderNodeFromAsset(new SdfAssetPath('TestNodeSourceAsset.oso'), {}, 'mySubIdentifier', 'OSL')
    expect(node!.getIdentifier().endsWith('<mySubIdentifier><OSL>')).toBe(true)
  })

  // testSdrRegistry.py:178-240.
  it('test_UsdEncoding', () => {
    const nodeNew = reg.getShaderNodeByNameAndType('TestNodeOSL', oslType)!
    expect(nodeNew).toBeDefined()
    const nodeOld = reg.getShaderNodeByNameAndType('TestNodeSameName', oslType)!
    expect(nodeOld).toBeDefined()
    expect(nodeOld.getMetadata()['sdrUsdEncodingVersion']).toBe('0')

    const checkTypes = (node: SdrShaderNode, expectedTypes: Record<string, [string, string]>) => {
      for (const inputName of node.getShaderInputNames()) {
        const prop = node.getShaderInput(inputName)!
        expect([prop.getType(), prop.getTypeAsSdfType()], prop.getName())
          .toEqual(expectedTypes[prop.getName()])
      }
    }
    // Sdr.PropertyTypes tokens and Sdf.ValueTypeNames names.
    const expectedTypes: Record<string, [string, string]> = {
      IntProperty: ['int', 'int'],
      StringProperty: ['string', 'string'],
      FloatProperty: ['float', 'float'],
      ColorProperty: ['color', 'color3f'],
      PointProperty: ['point', 'point3f'],
      NormalProperty: ['normal', 'normal3f'],
      VectorProperty: ['vector', 'vector3f'],
      MatrixProperty: ['matrix', 'matrix4d'],
      StructProperty: ['struct', 'token'],
      TerminalProperty: ['terminal', 'token'],
      VstructProperty: ['vstruct', 'token'],
      Vstruct_ArrayProperty: ['vstruct', 'token[]'],
      Float_VstructProperty: ['vstruct', 'token[]'],
      Float_Vec2Property: ['float', 'float2'],
      Float_Vec3Property: ['float', 'float3'],
      Float_Vec4Property: ['float', 'float4'],
      String_AssetProperty: ['string', 'asset'],
    }
    checkTypes(nodeNew, expectedTypes)
    Object.assign(expectedTypes, {
      StructProperty: ['struct', 'string'],
      VstructProperty: ['vstruct', 'float'],
      Vstruct_ArrayProperty: ['vstruct', 'float[]'],
      Float_Vec2Property: ['float', 'float[]'],
      Float_Vec3Property: ['float', 'float[]'],
      Float_Vec4Property: ['float', 'float[]'],
      String_AssetProperty: ['string', 'string'],
      Float_VstructProperty: ['vstruct', 'float[]'],
    })
    checkTypes(nodeOld, expectedTypes)
  })

  // testSdrRegistry.py:242-249.
  it('test_ParseValue', () => {
    const nodeNew = reg.getShaderNodeByNameAndType('TestNodeOSL', oslType)!
    const intProp = nodeNew.getShaderInput('IntProperty')!
    const { value, error } = parseSdfValue('3', intProp)
    expect(value).toBe(3)
    expect(error).toBe('')
  })
})

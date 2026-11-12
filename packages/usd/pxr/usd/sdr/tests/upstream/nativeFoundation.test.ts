// Ported from OpenUSD 26.11.1: pxr/usd/sdr/declare.cpp,
//  pxr/usd/sdr/registry.cpp, pxr/usd/sdr/shaderNode.cpp
// Copyright 2018, 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Native OpenUSD 26.11.1 capture; matching algorithms checked against v26.11.1
// sdr/declare.cpp:59-110, shaderNode.cpp:65-84 and registry.cpp:472-506.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Version, ShaderNode, ShaderProperty, Registry, type PropertyType, type NodeDiscoveryResult } from '../../src/index.ts'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'
const oracle = readOracleFixture(new URL('./fixtures/native/expected.json', import.meta.url))
const capturedNode = oracle.node
function node(properties = capturedNode.properties): ShaderNode {
  return new ShaderNode(capturedNode.identifier, new Version(), capturedNode.name, capturedNode.function,
    capturedNode.context, capturedNode.sourceType, capturedNode.definitionURI, capturedNode.implementationURI,
    properties.map((p: any) => new ShaderProperty(p.name, p.type as PropertyType, p.default, p.output, p.size, p.metadata)), capturedNode.metadata)
}
function discovery(system = capturedNode.sourceType): NodeDiscoveryResult {
  return {identifier:capturedNode.identifier, name:capturedNode.name, version:new Version().getAsDefault(),
    function:capturedNode.function, discoveryType:'usda', sourceType:system,
    uri:capturedNode.definitionURI, resolvedUri:capturedNode.definitionURI}
}
describe('native Sdr foundation capture', () => {
  it('matches version value semantics', () => {
    for (const expected of oracle.versions) {
      const actual = expected.args.length ? new Version(expected.args[0], expected.args[1]) : new Version()
      expect({major:actual.major,minor:actual.minor,valid:actual.isValid(),string:actual.toString(),suffix:actual.getStringSuffix(),defaultSuffix:actual.getAsDefault().getStringSuffix()}).toEqual(
        {major:expected.major,minor:expected.minor,valid:expected.valid,string:expected.string,suffix:expected.suffix,defaultSuffix:expected.defaultSuffix})
    }
  })
  it('retains parsed node property order, values and valid state', () => {
    const actual=node()
    expect(actual.isValid()).toBe(capturedNode.valid)
    expect(actual.getShaderInputNames()).toEqual(capturedNode.inputs)
    expect(actual.getShaderOutputNames()).toEqual(capturedNode.outputs)
    for (const p of capturedNode.properties) {
      const property=p.output ? actual.getShaderOutput(p.name) : actual.getShaderInput(p.name)
      expect(property?.getType()).toEqual(p.type)
      expect(property?.getDefaultValue()).toEqual(p.default)
      expect(property?.getMetadata()).toEqual(p.metadata)
    }
    // Upstream shaderNode.cpp:65-67 explicitly ties validity to parsed properties.
    expect(node([]).isValid()).toBe(false)
  })
  it('matches native shading-system priority selection without fallback outside the list', () => {
    const registry=new Registry()
    registry.addDiscoveryResult(discovery())
    registry.setExtraParserPlugins({usda:{parseShaderNode:()=>node()}})
    for(const expected of oracle.selections) {
      expect(registry.getShaderNodeByIdentifier(capturedNode.identifier,expected.priority)?.getIdentifier() ?? null).toEqual(expected.result)
      expect(registry.getShaderNodeByName(capturedNode.name,expected.priority)?.getIdentifier() ?? null).toEqual(expected.result)
    }
    expect(registry.getShaderNodeByIdentifierAndSystem(capturedNode.identifier,capturedNode.sourceType)).toBe(registry.getShaderNodeByIdentifier(capturedNode.identifier))
  })
  it('deduplicates identifiers across shading systems before parsing', () => {
    const registry=new Registry()
    registry.addDiscoveryResult(discovery())
    registry.addDiscoveryResult(discovery('other'))
    expect(registry.getShaderNodeIdentifiers()).toEqual([capturedNode.identifier])
  })
})

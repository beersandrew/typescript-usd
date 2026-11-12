// Ported from OpenUSD 26.11.1: pxr/usd/sdr/testenv/testSdrRegistry.py,
//  pxr/usd/sdr/testenv/testSdrShaderNodeQuery.py
// Copyright 2018, 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ports registered testSdrRegistry and testSdrShaderNodeQuery observables.
import { beforeEach, describe, expect, it } from 'vitest'
import { Registry as SdrRegistry, ShaderNode as SdrShaderNode, Version as SdrVersion, ShaderProperty, groupQueryResults, NodeDiscoveryResult as SdrShaderNodeDiscoveryResult } from '../../src/index.ts'

const result = (identifier: string, sourceType: string, metadata: Record<string, string>): SdrShaderNodeDiscoveryResult => ({ identifier, name: identifier, function: identifier.split(/Node/)[0]!, version: new SdrVersion().getAsDefault(), discoveryType: sourceType, sourceType, uri: identifier, resolvedUri: identifier, metadata })

describe('testSdrRegistry and testSdrShaderNodeQuery', () => {
  let registry: SdrRegistry
  beforeEach(() => {
    registry = new SdrRegistry()
    registry.setExtraParserPlugins({ glslfx: { parseShaderNode: discovery => new SdrShaderNode(discovery.identifier, discovery.version, discovery.name, discovery.function, discovery.discoveryType, discovery.sourceType, discovery.uri, discovery.resolvedUri, [new ShaderProperty('out', 'Float', 0, true)], discovery.metadata) } })
    registry.addDiscoveryResult(result('SimpleNodeA', 'glslfx', { testMetadata: 'bar', testMetadataDifferent: 'barA' }))
    registry.addDiscoveryResult(result('SimpleNodeB', 'glslfx', { testMetadata: 'bar', testMetadataDifferent: 'barB' }))
    registry.addDiscoveryResult(result('OtherNodeC', 'glslfx', { testMetadataDifferent: 'barC' }))
  })
  it('discovers without parsing and retains parsed node identity', () => {
    expect(registry.getShaderNodeIdentifiers()).toEqual(['OtherNodeC', 'SimpleNodeA', 'SimpleNodeB'])
    expect(registry.getAllShaderNodeSourceTypes()).toEqual(['glslfx'])
    expect(registry.getShaderNodeByIdentifier('SimpleNodeA')).toBe(registry.getShaderNodeByIdentifier('SimpleNodeA'))
  })
  it('selects distinct metadata and groups nodes by values', () => {
    const query = registry.createQuery().selectDistinct(['testMetadata', 'testMetadataDifferent'])
    const queryResult = query.run()
    expect(queryResult.getValues()).toContainEqual(['bar', 'barA'])
    const grouped = groupQueryResults(queryResult) as any
    expect(grouped.bar.barA[0].getIdentifier()).toBe('SimpleNodeA')
    expect(grouped[''].barC[0].getIdentifier()).toBe('OtherNodeC')
  })
  it('applies inclusion, exclusion and custom filters', () => {
    const nodes = registry.createQuery().nodeValueIsNotIn('testMetadataDifferent', ['barB', 'barC']).nodeValueIsIn('testMetadataDifferent', ['barA', 'barB']).customFilter(node => node.getIdentifier().startsWith('Simple')).run().getAllShaderNodes()
    expect(nodes.map(node => node.getIdentifier())).toEqual(['SimpleNodeA'])
  })
  it('treats absent data as None and rejects malformed custom filters', () => {
    expect(registry.createQuery().selectDistinct('testMetadata').nodeValueIsNot('testMetadata', null).run().getValues()).toEqual([['bar']])
    expect(() => registry.createQuery().customFilter((() => undefined) as any).run()).toThrow(TypeError)
    expect(() => registry.createQuery().customFilter(((node: SdrShaderNode) => node) as any).run()).toThrow(TypeError)
  })
})

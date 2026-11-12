// Ported from OpenUSD 26.11.1: pxr/usd/sdr/testenv/testSdrShaderNodeQuery.py
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD 26.11.1 pxr/usd/sdr/testenv/testSdrShaderNodeQuery.py
// (registration testSdrShaderNodeQuery) with its testenv
// (fixtures/testSdrShaderNodeQuery.testenv, copied unmodified). Python's
// None is undefined. Sdr.Registry() is SdrRegistry.getInstance(); the
// UsdShadeShaderDefParserPlugin is registered for the discovery type its
// GetDiscoveryTypes reports for these results ('usda').
//
// setUpClass also registers Sdr._FilesystemDiscoveryPlugin with its default
// (empty) search paths, which discovers nothing; typescript-usd has no
// filesystem discovery plugin object, so that registration is omitted.
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { ShaderDefParserPlugin, ShaderDefUtils } from 'typescript-usd/usdShade'
import {
  NodeFieldKey as SdrNodeFieldKey, Registry as SdrRegistry, ShaderNodeQuery as SdrShaderNodeQuery,
  groupQueryResults, type ShaderNode as SdrShaderNode,
} from '../../src/index.ts'

const TESTENV = path.join(import.meta.dirname, 'fixtures/testSdrShaderNodeQuery.testenv')
type Grouped = Record<string, any>

// testSdrShaderNodeQuery.py:13-33.
beforeAll(async () => {
  const file = path.join(TESTENV, 'SimpleNodes.usda')
  const stage = (await Stage.open(file))!
  const shaderNames = ['SimpleNodeA', 'SimpleNodeB', 'OtherNodeC']
  const discoveryResults = shaderNames.map(n => ShaderDefUtils.getDiscoveryResults(stage, `/${n}`, file)[0]!)
  const registry = SdrRegistry.getInstance()
  for (const result of discoveryResults) registry.addDiscoveryResult(result)
  registry.setExtraParserPlugins({ usda: new ShaderDefParserPlugin(stage) })
  expect(new Set(registry.getShaderNodeIdentifiers())).toEqual(new Set(['SimpleNodeA', 'SimpleNodeB', 'OtherNodeC']))
})

describe('testSdrShaderNodeQuery', () => {
  it('test_QuerySimple', () => {
    const registry = SdrRegistry.getInstance()
    let query = new SdrShaderNodeQuery()
      .selectDistinct([SdrNodeFieldKey.Identifier, SdrNodeFieldKey.SourceType])
      .nodeValueIs('testMetadata', 'bar')
      .nodeValueIs(SdrNodeFieldKey.Identifier, 'SimpleNodeA')
    let queryResult = registry.runQuery(query)
    expect(queryResult.getKeys()).toEqual([SdrNodeFieldKey.Identifier, SdrNodeFieldKey.SourceType])
    let values = queryResult.getValues()
    expect(values.length).toBe(1)
    expect(queryResult.getStringifiedValues()).toEqual(values)
    const [identifier, sourceType] = values[0] as [string, string]
    const node = registry.getShaderNodeByIdentifierAndType(identifier, sourceType)
    expect(node).toBeDefined()
    expect(node!.getIdentifier()).toBe('SimpleNodeA')
    expect(node!.getSourceType()).toBe('glslfx')

    query = new SdrShaderNodeQuery()
      .selectDistinct(SdrNodeFieldKey.Identifier)
      .selectDistinct(SdrNodeFieldKey.SourceType)
      .nodeValueIsNot('testMetadata', 'bar')
      .nodeValueIs(SdrNodeFieldKey.Identifier, 'SimpleNodeA')
    queryResult = query.run()
    expect(queryResult.getKeys()).toEqual([SdrNodeFieldKey.Identifier, SdrNodeFieldKey.SourceType])
    values = queryResult.getValues()
    expect(values.length).toBe(0)
    expect(queryResult.getStringifiedValues()).toEqual(values)
  })

  it('test_QueryMultipleResults', () => {
    const registry = SdrRegistry.getInstance()
    let query = new SdrShaderNodeQuery().selectDistinct('testMetadata').nodeValueIsNot('testMetadata', undefined)
    let queryResult = registry.runQuery(query)
    let values = queryResult.getValues()
    expect(values).toEqual([['bar']])
    expect(queryResult.getStringifiedValues()).toEqual(values)
    expect(queryResult.getAllShaderNodes().length).toBe(2)
    let nodesByValues = queryResult.getShaderNodesByValues()
    expect(nodesByValues.length).toBe(1)
    expect(nodesByValues[0]!.length).toBe(2)

    query = new SdrShaderNodeQuery().selectDistinct('testMetadata').nodeHasValueFor('testMetadata')
    queryResult = query.run()
    values = queryResult.getValues()
    expect(values).toEqual([['bar']])
    expect(queryResult.getStringifiedValues()).toEqual(values)
    expect(queryResult.getAllShaderNodes().length).toBe(2)
    nodesByValues = queryResult.getShaderNodesByValues()
    expect(nodesByValues.length).toBe(1)
    expect(nodesByValues[0]!.length).toBe(2)

    query = new SdrShaderNodeQuery()
      .selectDistinct('testMetadataDifferent').selectDistinct('testMetadata')
      .nodeHasValueFor('testMetadataDifferent')
    queryResult = query.run()
    const keys = queryResult.getKeys()
    values = queryResult.getValues()
    expect(values.length).toBe(3)
    expect(values).toContainEqual(['barA', 'bar'])
    expect(values).toContainEqual(['barB', 'bar'])
    expect(values).toContainEqual(['barC', undefined])
    const valueStrs = queryResult.getStringifiedValues()
    expect(valueStrs).not.toEqual(values)
    expect(valueStrs).toContainEqual(['barC', ''])
    nodesByValues = queryResult.getShaderNodesByValues()
    values.forEach((valuesRow, i) => valuesRow.forEach((value, j) => {
      for (const node of nodesByValues[i]!) expect(node.getDataForKey(keys[j]!)).toBe(value)
    }))
  })

  it('test_QueryOnlyNodes', () => {
    const query = new SdrShaderNodeQuery()
      .nodeValueIsNotIn('testMetadataDifferent', ['barB', 'barC'])
      .nodeValueIsIn('testMetadataDifferent', ['barB', 'barA'])
    const queryResult = query.run()
    expect(queryResult.getKeys().length).toBe(0)
    const values = queryResult.getValues()
    expect(values.length).toBe(0)
    expect(queryResult.getStringifiedValues()).toEqual(values)
    expect(queryResult.getShaderNodesByValues().length).toBe(0)
    const nodes = queryResult.getAllShaderNodes()
    expect(nodes.length).toBe(1)
    expect(nodes[0]!.getIdentifier()).toBe('SimpleNodeA')
  })

  it('test_QueryCustomFilter', () => {
    const filterFn = (node: SdrShaderNode) => node.getIdentifier().includes('SimpleNode')
    let query = new SdrShaderNodeQuery().selectDistinct('testMetadataDifferent').customFilter(filterFn)
    let values = query.run().getValues()
    expect(values.length).toBe(2)
    expect(values).toContainEqual(['barA'])
    expect(values).toContainEqual(['barB'])

    const anotherFilterFn = (node: SdrShaderNode) => node.getShaderInputNames().includes('inputA')
    query = new SdrShaderNodeQuery().selectDistinct(SdrNodeFieldKey.Identifier)
      .customFilter(filterFn).customFilter(anotherFilterFn)
    const queryResult = query.run()
    values = queryResult.getValues()
    expect(values.length).toBe(1)
    expect(values[0]![0]).toBe(queryResult.getAllShaderNodes()[0]!.getIdentifier())

    // A filter that takes no node and returns nothing.
    const malformedFn = (() => undefined) as unknown as (node: SdrShaderNode) => boolean
    query = new SdrShaderNodeQuery().customFilter(malformedFn)
    expect(() => query.run()).toThrow(TypeError)

    let deleteFn: ((node: SdrShaderNode) => boolean) | undefined = () => false
    query = new SdrShaderNodeQuery().customFilter(deleteFn)
    deleteFn = undefined
    expect(query.run().getAllShaderNodes().length).toBe(0)

    const weirdReturnFn = ((node: SdrShaderNode) => node) as unknown as (node: SdrShaderNode) => boolean
    query = new SdrShaderNodeQuery().customFilter(weirdReturnFn)
    expect(() => query.run()).toThrow(TypeError)
  })

  it('test_QueryUtils', () => {
    let result = new SdrShaderNodeQuery().run()
    expect(groupQueryResults(result)).toEqual({})

    result = new SdrShaderNodeQuery().selectDistinct('testMetadata').run()
    let grouped = groupQueryResults(result) as Grouped
    expect(Object.keys(grouped).length).toBe(2)
    expect(grouped).toHaveProperty('bar')
    expect(grouped).toHaveProperty([''])
    expect((grouped['bar'] as SdrShaderNode[]).map(n => n.getIdentifier())).toEqual(['SimpleNodeA', 'SimpleNodeB'])
    expect(grouped[''].length).toBe(1)
    expect(grouped[''][0].getIdentifier()).toBe('OtherNodeC')

    result = new SdrShaderNodeQuery().selectDistinct('testMetadata').selectDistinct('testMetadataDifferent').run()
    grouped = groupQueryResults(result) as Grouped
    expect(Object.keys(grouped).length).toBe(2)
    expect(Object.keys(grouped['bar']).length).toBe(2)
    expect(grouped['bar']['barA'].length).toBe(1)
    expect(grouped['bar']['barA'][0].getIdentifier()).toBe('SimpleNodeA')
    expect(grouped['bar']['barB'].length).toBe(1)
    expect(grouped['bar']['barB'][0].getIdentifier()).toBe('SimpleNodeB')
    expect(Object.keys(grouped['']).length).toBe(1)
    expect(grouped['']['barC'].length).toBe(1)
    expect(grouped['']['barC'][0].getIdentifier()).toBe('OtherNodeC')

    const block = () => false
    result = new SdrShaderNodeQuery().selectDistinct(SdrNodeFieldKey.Identifier).customFilter(block).run()
    expect(result.getKeys().length).toBe(1)
    expect(result.getValues().length).toBe(0)
    expect(result.getAllShaderNodes().length).toBe(0)
    expect(groupQueryResults(result)).toEqual({})
  })
})

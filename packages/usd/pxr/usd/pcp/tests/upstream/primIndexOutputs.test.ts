// Ported from OpenUSD 26.11.1: pxr/usd/pcp/primIndex.cpp,
//  pxr/usd/pcp/primIndex.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// PcpPrimIndexOutputs ownership and PayloadState taxonomy from
// primIndex.h:301-338 and primIndex.cpp:424-479,2645-2661.

import { describe, expect, it } from 'vitest'
import {
  Cache as PcpCache,
  ExpressionVariablesDependencyData as PcpExpressionVariablesDependencyData,
  PrimIndexOutputs as PcpPrimIndexOutputs, Layer as PcpLayer, LayerOpener as PcpLayerOpener,
  pcpComputePrimIndex,
} from '../../src/index.ts'
import { SdfPath } from 'typescript-usd/sdf/path'

// Run PcpComputePrimIndex directly. The cache computes the index once first
// so every layer the computation needs is already loaded.
async function computeOutputs(
  root: PcpLayer, opener: PcpLayerOpener, path: string,
  options: { predicate?: (path: string) => boolean; include?: string[] } = {},
): Promise<PcpPrimIndexOutputs> {
  const cache = await PcpCache.create(root, opener, undefined, options.predicate)
  if (options.include) cache.requestPayloads(options.include, [])
  await cache.computePrimIndex(path)
  const inputs = cache.getPrimIndexInputs().clone()
  const result = new PcpPrimIndexOutputs()
  pcpComputePrimIndex(SdfPath.fromString(path), cache.getLayerStack(), inputs, result)
  return result
}

type Scene = Record<string, Record<string, unknown>>
function fakeLayer(filePath: string, scene: Scene): PcpLayer {
  return {
    filePath,
    // An Sdf layer always has its pseudo-root spec.
    hasSpec: path => path === '/' || scene[path] !== undefined,
    getSpecType: path => path === '/' ? 'pseudoRoot' : 'prim',
    getSpecPaths: () => Object.keys(scene),
    getFieldNames: path => Object.keys(scene[path] ?? {}),
    getField: (path, field) => scene[path]?.[field],
    resolveAsset: path => path,
  }
}

const payload = {
  assetPath: '/model', primPath: '/Model',
  layerOffset: { offset: 0, scale: 1 },
}

async function outputs(
  included: boolean, source: 'includeSet' | 'predicate', withPayload = true,
): Promise<PcpPrimIndexOutputs> {
  const root = fakeLayer('/root', {
    '/Root': withPayload ? { payload } : { typeName: 'Scope' },
  })
  const model = fakeLayer('/model', { '/Model': { typeName: 'Scope' } })
  const byPath = new Map([root, model].map(layer => [layer.filePath, layer]))
  const opener: PcpLayerOpener = async path => byPath.get(path) ?? null
  return source === 'predicate'
    ? computeOutputs(root, opener, '/Root', { predicate: () => included })
    : computeOutputs(root, opener, '/Root', { include: included ? ['/Root'] : [] })
}

describe('PcpPrimIndexOutputs', () => {
  it('default-constructs with an invalid prim index', () => {
    // PcpPrimIndex::PcpPrimIndex and IsValid (primIndex.cpp:71-73;
    // primIndex.h:88-93). The v26.05 runtime oracle also reports an empty
    // path and invalid root node for this object.
    const result = new PcpPrimIndexOutputs()
    expect((result.primIndex as unknown as { isValid(): boolean }).isValid()).toBe(false)
    expect(result.primIndex.path).toBe('')
  })

  it('owns the resulting prim index and no-payload state', async () => {
    const result = await outputs(false, 'includeSet', false)
    expect(result.primIndex.path).toBe('/Root')
    expect(result.primIndex).not.toHaveProperty('payloadState')
    expect(result.primIndex).not.toHaveProperty('dynamicFileFormatDependencies')
    expect(result.payloadState).toBe(PcpPrimIndexOutputs.PayloadState.NoPayload)
  })

  it('owns expression-variable dependency names by layer stack', async () => {
    const root = fakeLayer('/root', {
      '/': { expressionVariables: { ASSET: '/model' } },
      '/Root': { references: {
        prependedItems: [{ ...payload, assetPath: '`"${ASSET}"`' }],
      } },
    })
    const model = fakeLayer('/model', { '/Model': { typeName: 'Scope' } })
    const byPath = new Map([root, model].map(layer => [layer.filePath, layer]))
    const result = await computeOutputs(root, async path => byPath.get(path) ?? null, '/Root')
    const dependencies = result.expressionVariablesDependency
      .getDependenciesForLayerStack(result.primIndex.rootNode.layerStack)
    expect(dependencies).toEqual(new Set(['ASSET']))
  })

  it('appends expression-variable dependency data without losing names', () => {
    const layer = fakeLayer('/root', { '/': {} })
    const stack = { identifier: { rootLayer: layer } } as never
    const left = new PcpExpressionVariablesDependencyData()
    const right = new PcpExpressionVariablesDependencyData()
    left.addDependencies(stack, ['A'])
    right.addDependencies(stack, ['B', 'A'])
    left.appendDependencyData(right)
    expect(left.getDependenciesForLayerStack(stack)).toEqual(new Set(['A', 'B']))
  })

  it.each([
    [true, 'includeSet', PcpPrimIndexOutputs.PayloadState.IncludedByIncludeSet],
    [false, 'includeSet', PcpPrimIndexOutputs.PayloadState.ExcludedByIncludeSet],
    [true, 'predicate', PcpPrimIndexOutputs.PayloadState.IncludedByPredicate],
    [false, 'predicate', PcpPrimIndexOutputs.PayloadState.ExcludedByPredicate],
  ] as const)('%s by %s', async (included, source, expected) => {
    const result = await outputs(included, source)
    expect(result.payloadState).toBe(expected)
    expect(result.primIndex.path).toBe('/Root')
  })
})

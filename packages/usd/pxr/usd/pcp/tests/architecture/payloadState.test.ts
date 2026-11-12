// Portions ported from OpenUSD 26.11.1, including: pxr/usd/pcp/primIndex.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { describe, expect, it } from 'vitest'
import {
  Cache as PcpCache, Changes as PcpChanges, Layer as PcpLayer, LayerOpener as PcpLayerOpener,
} from '../../src/index.ts'

type Scene = Record<string, Record<string, unknown>>

function fakeLayer(filePath: string, scene: Scene): PcpLayer {
  return {
    filePath,
    // An Sdf layer always has its pseudo-root spec.
    hasSpec: path => path === '/' || scene[path] !== undefined,
    getSpecType: path => path === '/' ? 'pseudoRoot' : path.includes('.') ? 'attribute' : 'prim',
    getSpecPaths: () => Object.keys(scene),
    getFieldNames: path => Object.keys(scene[path] ?? {}),
    getField: (specPath, fieldName) => scene[specPath]?.[fieldName],
    resolveAsset: assetPath => assetPath,
  }
}

function openerOver(layers: PcpLayer[]): PcpLayerOpener {
  const byPath = new Map(layers.map(layer => [layer.filePath, layer]))
  return async filePath => byPath.get(filePath) ?? null
}

const payload = (assetPath: string, primPath: string) =>
  [{ assetPath, primPath, layerOffset: { offset: 0, scale: 1 } }]

describe('PcpCache retained payload state', () => {
  it('records predicate-included payloads only when indexing discovers them', async () => {
    const model = fakeLayer('/model', { '/Model': { typeName: 'Scope' } })
    const root = fakeLayer('/root', {
      '/': { primChildren: ['A'] },
      '/A': { payload: payload('/model', '/Model') },
    })
    const cache = await PcpCache.create(root, openerOver([root, model]), undefined, () => true)
    await cache.computePrimIndex('/')
    expect(cache.getIncludedPayloadPaths()).toEqual([])
    await cache.computePrimIndex('/A')
    expect(cache.getIncludedPayloadPaths()).toEqual(['/A'])
    expect(cache.isPayloadIncluded('/A')).toBe(true)
  })

  it('separates request mutation from PcpChanges invalidation', async () => {
    const model = fakeLayer('/model', { '/Model': { typeName: 'Scope' } })
    const root = fakeLayer('/root', {
      '/A': { payload: payload('/model', '/Model') },
    })
    // No client predicate: the requested set alone decides inclusion
    // (PcpCache::RequestPayloads; a supplied predicate would be
    // authoritative instead — primIndex.cpp:2645-2661).
    const cache = await PcpCache.create(root, openerOver([root, model]))
    const excluded = await cache.computePrimIndex('/A')
    expect(excluded.hasAnyPayloads()).toBe(true)
    expect(cache.getIncludedPayloadPaths()).toEqual([])

    const includeChanges = new PcpChanges()
    cache.requestPayloads(['/A'], [], includeChanges)
    expect(cache.getIncludedPayloadPaths()).toEqual(['/A'])
    expect(cache.findPrimIndex('/A')).toBe(excluded)
    expect([...includeChanges.getCacheChanges().get(cache)!.didChangeSignificantly].map(String))
      .toEqual(['/A'])
    await includeChanges.apply()
    expect(cache.findPrimIndex('/A')).toBeUndefined()
    expect((await cache.computePrimIndex('/A')).composePrimStack().map(
      entry => entry.layer.filePath)).toContain('/model')

    const excludeChanges = new PcpChanges()
    cache.requestPayloads([], ['/A'], excludeChanges)
    expect(cache.getIncludedPayloadPaths()).toEqual([])
    await excludeChanges.apply()
    expect((await cache.computePrimIndex('/A')).composePrimStack().map(
      entry => entry.layer.filePath)).not.toContain('/model')
  })

  it('gives inclusion precedence when a path appears in both request sets', async () => {
    const root = fakeLayer('/root', {})
    const cache = await PcpCache.create(root, openerOver([root]), undefined, () => false)
    cache.requestPayloads(['/A'], ['/A'])
    expect(cache.getIncludedPayloadPaths()).toEqual(['/A'])
  })
})

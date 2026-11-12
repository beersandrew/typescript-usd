// Portions ported from OpenUSD 26.11.1, including: pxr/usd/pcp/cache.cpp,
//  pxr/usd/pcp/testenv/testPcpCache.py
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { describe, expect, it } from 'vitest'
import { SdfPath } from 'typescript-usd/sdf/path'
import {
  Cache as PcpCache, Changes as PcpChanges, DependencyType, Layer as PcpLayer, LayerOpener as PcpLayerOpener,
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
    resolveAsset: (assetPath) => assetPath,
  }
}

function openerOver(layers: PcpLayer[]): PcpLayerOpener {
  const byPath = new Map(layers.map(layer => [layer.filePath, layer]))
  return async filePath => byPath.get(filePath) ?? null
}

const ref = (assetPath: string, primPath: string) =>
  [{ assetPath, primPath, layerOffset: { offset: 0, scale: 1 } }]

describe('testPcpCache — retained prim-index ownership', () => {
  it('finds and enumerates only indexes retained by this cache', async () => {
    const root = fakeLayer('/root', {
      '/': { primChildren: ['A', 'B'] },
      '/A': { typeName: 'Scope' },
      '/B': { typeName: 'Scope' },
    })
    const cache = await PcpCache.create(root, openerOver([root]))

    expect(cache.findPrimIndex('/A')).toBeUndefined()
    const a = await cache.computePrimIndex('/A')
    const b = await cache.computePrimIndex('/B')
    expect(cache.findPrimIndex('/A')).toBe(a)

    // Computing /A computes and retains its namespace parent, the
    // pseudo-root (cache.cpp:1741-1790, verified against OpenUSD v26.08).
    const retained = new Set<unknown>()
    cache.forEachPrimIndex(index => retained.add(index))
    expect(retained).toEqual(new Set([cache.findPrimIndex('/'), a, b]))
  })

  it('concurrent requests converge on one retained index', async () => {
    const root = fakeLayer('/root', { '/A': { typeName: 'Scope' } })
    const cache = await PcpCache.create(root, openerOver([root]))
    const [first, second] = await Promise.all([
      cache.computePrimIndex('/A'),
      cache.computePrimIndex('/A'),
    ])
    expect(second).toBe(first)
    expect(cache.findPrimIndex('/A')).toBe(first)
  })

  it('a significant change at the absolute root replaces every retained index', async () => {
    // PcpCache::Apply clears all indexes and dependencies (cache.cpp:1010-1016).
    const root = fakeLayer('/root', { '/A': { typeName: 'Scope' } })
    const cache = await PcpCache.create(root, openerOver([root]))
    const before = await cache.computePrimIndex('/A')

    const changes = new PcpChanges()
    changes.didChangeSignificantly(cache, SdfPath.absoluteRootPath)
    await changes.apply()
    expect(cache.findPrimIndex('/A')).toBeUndefined()
    const after = await cache.computePrimIndex('/A')
    expect(after).not.toBe(before)
    expect(cache.findPrimIndex('/A')).toBe(after)
  })

  it('variant fallback changes are significant at the absolute root', async () => {
    // PcpCache::SetVariantFallbacks (cache.cpp:205-219).
    const root = fakeLayer('/root', { '/A': { typeName: 'Scope' } })
    const cache = await PcpCache.create(root, openerOver([root]))
    const before = await cache.computePrimIndex('/A')

    const changes = new PcpChanges()
    cache.setVariantFallbacks({ lod: ['high'] }, changes)
    expect([...changes.getCacheChanges().get(cache)!.didChangeSignificantly].map(String))
      .toEqual(['/'])
    await changes.apply()
    expect(cache.findPrimIndex('/A')).toBeUndefined()
    expect(await cache.computePrimIndex('/A')).not.toBe(before)
  })

  it('retains layer-site dependencies for cached prim indexes', async () => {
    const model = fakeLayer('/model', {
      '/Model': { primChildren: ['Geom'] },
      '/Model/Geom': { typeName: 'Mesh' },
    })
    const root = fakeLayer('/root', {
      '/Char': { references: ref('/model', '/Model') },
    })
    const cache = await PcpCache.create(root, openerOver([root, model]))
    await cache.computePrimIndex('/Char')
    await cache.computePrimIndex('/Char/Geom')

    const deps = (sitePath: string, recurseOnSite = false, recurseOnIndex = false) =>
      cache.findSiteDependencies(model, sitePath, DependencyType.AnyNonVirtual,
        recurseOnSite, recurseOnIndex, true)
        .map(dep => [dep.indexPath.pathString, dep.sitePath.pathString])

    expect(cache.getUsedLayers()).toEqual(new Set([root, model]))
    expect(deps('/Model/Geom')).toEqual([['/Char/Geom', '/Model/Geom']])
    expect(deps('/Model', true)).toEqual([['/Char', '/Model']])
    expect(deps('/Unrelated')).toEqual([])
    // recurseOnIndex adds cached descendants that introduced no new arcs.
    expect(deps('/Model', false, true)).toEqual([
      ['/Char', '/Model'], ['/Char/Geom', '/Model/Geom'],
    ])
  })

  it('drops dependency records when every index is discarded', async () => {
    const model = fakeLayer('/model', { '/Model': { typeName: 'Scope' } })
    const root = fakeLayer('/root', { '/A': { references: ref('/model', '/Model') } })
    const cache = await PcpCache.create(root, openerOver([root, model]))
    await cache.computePrimIndex('/A')
    expect(cache.findSiteDependencies(model, '/Model', DependencyType.AnyNonVirtual,
      false, false, true)).toHaveLength(1)
    const changes = new PcpChanges()
    changes.didChangeSignificantly(cache, SdfPath.absoluteRootPath)
    await changes.apply()
    expect(cache.findSiteDependencies(model, '/Model', DependencyType.AnyNonVirtual,
      false, false, false)).toEqual([])
    // Only the cache's own layer stack remains in use.
    expect(cache.getUsedLayers()).toEqual(new Set([root]))
  })
})

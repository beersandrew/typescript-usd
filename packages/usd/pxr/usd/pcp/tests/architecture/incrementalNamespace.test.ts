// Portions ported from OpenUSD 26.11.1, including: pxr/usd/pcp/changes.cpp,
//  pxr/usd/pcp/cache.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { describe, expect, it } from 'vitest'
import { sdfChangeListFromLayerChanges } from 'typescript-usd/sdf/changeList'
import { Cache as PcpCache, Changes as PcpChanges, Layer as PcpLayer } from '../../src/index.ts'

function layer(scene: Record<string, Record<string, unknown>>): PcpLayer {
  return {
    filePath: '/root.usda',
    // An Sdf layer always has its pseudo-root spec.
    hasSpec: path => path === '/' || scene[path] !== undefined,
    getSpecType: path => path === '/' ? 'pseudoRoot' : path.includes('.') ? 'attribute' : 'prim',
    getSpecPaths: () => Object.keys(scene),
    getFieldNames: path => Object.keys(scene[path] ?? {}),
    getField: (path, field) => scene[path]?.[field],
    resolveAsset: path => path,
  }
}

describe('incremental Pcp namespace invalidation', () => {
  it('resyncs a first child spec significantly and retains the parent', async () => {
    const root = layer({
      '/': { primChildren: ['A', 'B'] },
      '/A': { typeName: 'Scope' },
      '/B': { typeName: 'Scope' },
    })
    const cache = await PcpCache.create(root, async () => null)
    const parent = await cache.computePrimIndex('/A')
    const sibling = await cache.computePrimIndex('/B')

    const changes = new PcpChanges()
    await changes.didChange(cache, [[root, sdfChangeListFromLayerChanges(root, [
      { kind: 'specAdded', path: '/A/New', inert: true },
    ])]])

    // The first spec for a composed prim is a significant change at that
    // path (PcpChanges::DidChangeSpecs, changes.cpp:1777-1873); the parent
    // and sibling indexes are untouched — child names compose live.
    const cacheChanges = changes.getCacheChanges().get(cache)!
    expect([...cacheChanges.didChangeSignificantly].map(String)).toEqual(['/A/New'])
    expect([...cacheChanges.didChangeSpecs]).toEqual([])
    await changes.apply()
    expect(cache.findPrimIndex('/A')).toBe(parent)
    expect(cache.findPrimIndex('/B')).toBe(sibling)
  })

  it('retains empty and unrelated concurrently-computed indexes', async () => {
    const model = layer({ '/Model': { typeName: 'Scope' } })
    const root = layer({
      '/': { primChildren: ['B'] },
      '/B': {
        references: [{
          assetPath: '/slow.usda', primPath: '/Model',
          layerOffset: { offset: 0, scale: 1 },
        }],
      },
    })
    let signalOpened!: () => void
    let releaseOpen!: () => void
    const opened = new Promise<void>(resolve => { signalOpened = resolve })
    const held = new Promise<void>(resolve => { releaseOpen = resolve })
    const cache = await PcpCache.create(root, async path => {
      if (path !== '/slow.usda') return null
      signalOpened()
      await held
      return model
    })

    const pendingB = cache.computePrimIndex('/B')
    await opened
    const empty = await cache.computePrimIndex('/Missing')
    releaseOpen()
    const b = await pendingB

    // OpenUSD 26.05 cache.cpp retains a valid index even when it has no specs.
    expect(empty.hasSpecs()).toBe(false)
    expect(cache.findPrimIndex('/Missing')).toBe(empty)
    expect(cache.findPrimIndex('/B')).toBe(b)
  })
})

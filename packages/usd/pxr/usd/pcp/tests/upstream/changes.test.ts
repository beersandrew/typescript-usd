// Portions ported from OpenUSD 26.11.1, including: pxr/usd/pcp/changes.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { describe, expect, it } from 'vitest'
import { SdfPath } from 'typescript-usd/sdf/path'
import { sdfChangeListFromLayerChanges, type SdfChangeRecord } from 'typescript-usd/sdf/changeList'
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

const ref = (assetPath: string, primPath: string) =>
  [{ assetPath, primPath, layerOffset: { offset: 0, scale: 1 } }]

async function referencedCache(): Promise<{
  cache: PcpCache; root: PcpLayer; model: PcpLayer
}> {
  const model = fakeLayer('/model', {
    '/Model': { primChildren: ['Geom'] },
    '/Model/Geom': { typeName: 'Mesh', properties: ['size', 'source'] },
    '/Model/Geom.size': { default: 1 },
    '/Model/Geom.source': { connectionPaths: ['/Model/Geom.size'] },
  })
  const root = fakeLayer('/root', { '/Char': { references: ref('/model', '/Model') } })
  const cache = await PcpCache.create(root, openerOver([root, model]))
  await cache.computePrimIndex('/Char')
  await cache.computePrimIndex('/Char/Geom')
  return { cache, root, model }
}

// PcpChanges::DidChange for one layer's records, as one LayersDidChange
// notice delivers them.
async function didChange(
  changes: PcpChanges, cache: PcpCache, layer: PcpLayer, records: SdfChangeRecord[],
): Promise<void> {
  await changes.didChange(cache, [[layer, sdfChangeListFromLayerChanges(layer, records)]])
}

const significant = (changes: PcpChanges, cache: PcpCache): string[] =>
  [...changes.getCacheChanges().get(cache)?.didChangeSignificantly ?? []].map(String)
const specChanges = (changes: PcpChanges, cache: PcpCache): string[] =>
  [...changes.getCacheChanges().get(cache)?.didChangeSpecs ?? []].map(String)

describe('PcpChanges (changes.cpp)', () => {
  it('ignores property value and target edits in a USD-mode cache', async () => {
    // USD-mode caches hold no property indexes; DidChange skips change lists
    // without prim entries (changes.cpp:805-822).
    const { cache, model } = await referencedCache()
    const changes = new PcpChanges()
    await didChange(changes, cache, model, [
      { kind: 'field', path: '/Model/Geom.size', fieldName: 'default', oldValue: 1, newValue: 2 },
      {
        kind: 'field', path: '/Model/Geom.source', fieldName: 'connectionPaths',
        oldValue: [], newValue: ['/Model/Geom.size'],
      },
    ])
    expect(changes.isEmpty()).toBe(true)
  })

  it('maps a significant prim change through a reference and subsumes descendants', async () => {
    const { cache, model } = await referencedCache()
    const changes = new PcpChanges()
    await didChange(changes, cache, model, [{
      kind: 'field', path: '/Model', fieldName: 'references', oldValue: undefined, newValue: [],
    }])
    // /Char/Geom is a namespace descendant of /Char (Pcp_SubsumeDescendants).
    expect(significant(changes, cache)).toEqual(['/Char'])
  })

  it('resyncs the absolute root for a first defaultPrim and the old default otherwise', async () => {
    // OpenUSD v26.08 oracle: Pcp._TestChangeProcessor reports </>.
    const root = fakeLayer('/root', {
      '/': { primChildren: ['A'] }, '/A': { typeName: 'Scope' },
    })
    const cache = await PcpCache.create(root, openerOver([root]))
    await cache.computePrimIndex('/A')
    const first = new PcpChanges()
    await didChange(first, cache, root, [{
      kind: 'field', path: '/', fieldName: 'defaultPrim', oldValue: undefined, newValue: 'A',
    }])
    expect(significant(first, cache)).toEqual(['/'])
    expect(first.getCacheChanges().get(cache)?.didMaybeChangeLayers).toBe(false)

    const replaced = new PcpChanges()
    await didChange(replaced, cache, root, [{
      kind: 'field', path: '/', fieldName: 'defaultPrim', oldValue: 'A', newValue: 'B',
    }])
    expect(significant(replaced, cache)).toEqual(['/A'])
  })

  it('treats adding an unresolvable sublayer as a layer stack change only', async () => {
    // OpenUSD v26.08 oracle: no significant or spec changes; the layer stack
    // is recomputed.
    const root = fakeLayer('/root', {
      '/': { primChildren: ['A'] }, '/A': { typeName: 'Scope' },
    })
    const cache = await PcpCache.create(root, openerOver([root]))
    await cache.computePrimIndex('/A')
    const changes = new PcpChanges()
    await didChange(changes, cache, root, [{
      kind: 'field', path: '/', fieldName: 'subLayers', oldValue: undefined, newValue: ['/missing'],
    }])
    expect(significant(changes, cache)).toEqual([])
    expect(specChanges(changes, cache)).toEqual([])
    expect(changes.getCacheChanges().get(cache)?.didMaybeChangeLayers).toBe(true)
    expect(changes.getLayerStackChanges().get(cache.getLayerStack())?.didChangeLayers).toBe(true)
  })

  it('resyncs everything when framesPerSecond changes the computed TCPS', async () => {
    // OpenUSD v26.08 oracle: with timeCodesPerSecond unauthored, an fps edit
    // is a computed TCPS change for the root layer stack.
    const scene: Record<string, Record<string, unknown>> = {
      '/': { primChildren: ['A'] }, '/A': { typeName: 'Scope' },
    }
    const root = fakeLayer('/root', scene)
    const cache = await PcpCache.create(root, openerOver([root]))
    await cache.computePrimIndex('/A')
    scene['/']!['framesPerSecond'] = 30
    const changes = new PcpChanges()
    await didChange(changes, cache, root, [{
      kind: 'field', path: '/', fieldName: 'framesPerSecond', oldValue: undefined, newValue: 30,
    }])
    expect(significant(changes, cache)).toEqual(['/'])
  })

  it('maps a newly added inert spec through its ancestral dependency', async () => {
    // The added spec's site has no dependencies of its own; /Model's direct
    // dependency is ancestral for it. With no index at /Char/NewChild the
    // first spec is significant (DidChangeSpecs, changes.cpp:1777-1873).
    const { cache, model } = await referencedCache()
    const changes = new PcpChanges()
    await didChange(changes, cache, model, [
      { kind: 'specAdded', path: '/Model/NewChild', inert: true },
    ])
    expect(significant(changes, cache)).toEqual(['/Char/NewChild'])
    expect(specChanges(changes, cache)).toEqual([])
  })

  it('ignores changes in layers the cache does not use', async () => {
    const { cache } = await referencedCache()
    const unused = fakeLayer('/unused', { '/Other': { typeName: 'Scope' } })
    const changes = new PcpChanges()
    await didChange(changes, cache, unused, [
      { kind: 'specAdded', path: '/Other', inert: false },
    ])
    expect(changes.isEmpty()).toBe(true)
  })

  it('applies significant changes selectively and preserves unaffected identity', async () => {
    const root = fakeLayer('/root', {
      '/': { primChildren: ['A', 'B'] },
      '/A': { primChildren: ['Child'] }, '/A/Child': { typeName: 'Scope' },
      '/B': { typeName: 'Scope' },
    })
    const cache = await PcpCache.create(root, openerOver([root]))
    const layerStack = cache.getLayerStack()
    const a = await cache.computePrimIndex('/A')
    const child = await cache.computePrimIndex('/A/Child')
    const b = await cache.computePrimIndex('/B')
    const changes = new PcpChanges()
    changes.didChangeSignificantly(cache, SdfPath.fromString('/A'))

    await changes.apply()
    expect(cache.findPrimIndex('/A')).toBeUndefined()
    expect(cache.findPrimIndex('/A/Child')).toBeUndefined()
    expect(cache.findPrimIndex('/B')).toBe(b)
    expect(cache.getLayerStack()).toBe(layerStack)
    expect(await cache.computePrimIndex('/A')).not.toBe(a)
    expect(await cache.computePrimIndex('/A/Child')).not.toBe(child)
  })

  it('retains prim indexes for value-only changes', async () => {
    const { cache, model } = await referencedCache()
    const retained = cache.findPrimIndex('/Char/Geom')
    const changes = new PcpChanges()
    await didChange(changes, cache, model, [
      { kind: 'field', path: '/Model/Geom.size', fieldName: 'default', oldValue: 1, newValue: 2 },
    ])
    await changes.apply()
    expect(cache.findPrimIndex('/Char/Geom')).toBe(retained)
  })
})

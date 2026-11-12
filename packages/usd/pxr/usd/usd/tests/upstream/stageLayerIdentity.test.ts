import { _resolverContextForResolver } from 'typescript-usd/usd/_internal'
import { describe, expect, it } from 'vitest'
import { ArInMemoryResolver } from 'typescript-usd/ar/_internal'
import { Stage } from 'typescript-usd/usd'
import type { Cache as PcpCache } from 'typescript-usd/pcp'

function cacheOf(stage: Stage): PcpCache {
  return (stage as unknown as { _pcpCache: PcpCache })._pcpCache
}

describe('UsdStage uses Sdf layer identity', () => {
  it('shares an applicable root layer across stages', async () => {
    const path = 'shared-stage-root.usda'
    const resolver = new ArInMemoryResolver({
      [path]: new TextEncoder().encode('#usda 1.0\n\ndef "Root" {}\n'),
    })
    const first = (await Stage.open(path, { resolverContext: _resolverContextForResolver(resolver) }))!
    const second = (await Stage.open(path, { resolverContext: _resolverContextForResolver(resolver) }))!
    expect(second.getRootLayer()).toBe(first.getRootLayer())
  })

  it('retains indexes and the root layer stack while the stage is unchanged', async () => {
    const path = 'retained-cache-root.usda'
    const resolver = new ArInMemoryResolver({
      [path]: new TextEncoder().encode('#usda 1.0\n\ndef "Root" {}\n'),
    })
    const stage = (await Stage.open(path, { resolverContext: _resolverContextForResolver(resolver) }))!
    const cache = cacheOf(stage)
    const layerStack = cache.getLayerStack()
    const firstIndex = await cache.computePrimIndex('/Root')
    expect(await cache.computePrimIndex('/Root')).toBe(firstIndex)
    expect(cache.findPrimIndex('/Root')).toBe(firstIndex)
    expect(stage.getPrimIndex('/Root')).toBe(firstIndex)
    expect('_pcpIndexes' in stage).toBe(false)
    expect(cache.getLayerStack()).toBe(layerStack)
  })

  it('keeps cache ownership and indexes when muting a layer the stage does not use', async () => {
    const path = 'invalidated-cache-root.usda'
    const resolver = new ArInMemoryResolver({
      [path]: new TextEncoder().encode('#usda 1.0\n\ndef "Root" {}\n'),
    })
    const stage = (await Stage.open(path, { resolverContext: _resolverContextForResolver(resolver) }))!
    const cache = cacheOf(stage)
    const before = await cache.computePrimIndex('/Root')
    await stage.muteLayer('not-used.usda')
    expect(cacheOf(stage)).toBe(cache)
    // PcpChanges::_DidMuteLayer records no changes for a layer no layer
    // stack uses, so the index is retained.
    expect(await cache.computePrimIndex('/Root')).toBe(before)
  })

  it('gives separate stages separate Pcp caches while sharing Sdf layers', async () => {
    const path = 'per-stage-cache-root.usda'
    const resolver = new ArInMemoryResolver({
      [path]: new TextEncoder().encode('#usda 1.0\n\ndef "Root" {}\n'),
    })
    const first = (await Stage.open(path, { resolverContext: _resolverContextForResolver(resolver) }))!
    const second = (await Stage.open(path, { resolverContext: _resolverContextForResolver(resolver) }))!
    expect(second.getRootLayer()).toBe(first.getRootLayer())
    expect(cacheOf(second)).not.toBe(cacheOf(first))
  })
})

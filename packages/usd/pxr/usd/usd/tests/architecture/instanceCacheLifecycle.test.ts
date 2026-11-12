// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usd/instanceCache.cpp, pxr/usd/usd/testenv/testUsdInstanceProxy.py
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _resolverContextForResolver } from 'typescript-usd/usd/_internal'
import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { ArInMemoryResolver } from 'typescript-usd/usd/_internal'
import { UsdInstanceCache } from '../../src/instanceCache.ts'

const enc = (text: string): Uint8Array => new TextEncoder().encode(text)

describe('UsdInstanceCache lifecycle hardening', () => {
  it('removes the last instance and adds the same key in one change batch', () => {
    const cache = new UsdInstanceCache()
    cache.registerInstancePrimIndex('/World/I1', 'shared')
    cache.processChanges()

    cache.unregisterInstancePrimIndexesUnder('/World/I1')
    cache.registerInstancePrimIndex('/World/I2', 'shared')
    const changes = cache.processChanges()

    expect(changes.newPrototypePrims).toEqual([])
    expect(changes.changedPrototypePrims).toEqual(['/__Prototype_1'])
    expect(changes.changedPrototypePrimIndexes).toEqual(['/World/I2'])
    expect(changes.deadPrototypePrims).toEqual([])
    expect(cache.getInstancingInfo().instanceToProto.get('/World/I2'))
      .toBe('/__Prototype_1')
  })

  it('selects a replacement source while retaining the prototype identifier', () => {
    const cache = new UsdInstanceCache()
    cache.registerInstancePrimIndex('/World/I1', 'shared')
    cache.registerInstancePrimIndex('/World/I2', 'shared')
    cache.processChanges()

    cache.unregisterInstancePrimIndexesUnder('/World/I1')
    const changes = cache.processChanges()

    expect(changes.changedPrototypePrims).toEqual(['/__Prototype_1'])
    expect(changes.changedPrototypePrimIndexes).toEqual(['/World/I2'])
    expect(cache.getInstancingInfo().protoToSource.get('/__Prototype_1'))
      .toBe('/World/I2')
  })

  it('assigns several new keys deterministically by first prim-index path', () => {
    const cache = new UsdInstanceCache()
    cache.registerInstancePrimIndex('/World/Z', 'z-key')
    cache.registerInstancePrimIndex('/World/A', 'a-key')
    cache.registerInstancePrimIndex('/World/M', 'm-key')
    cache.processChanges()
    const instances = cache.getInstancingInfo().instanceToProto

    expect(instances.get('/World/A')).toBe('/__Prototype_1')
    expect(instances.get('/World/M')).toBe('/__Prototype_2')
    expect(instances.get('/World/Z')).toBe('/__Prototype_3')
  })

  it('maps a nested instance source into every prototype that uses its index', () => {
    // Usd_InstanceCache::_PrototypeUsesPrimIndexPath's nested example
    // (instanceCache.cpp:563-635): the nested instance index itself appears
    // both below the outer prototype and as the inner prototype source.
    const cache = new UsdInstanceCache()
    cache.registerInstancePrimIndex('/World/M1', 'outer')
    cache.registerInstancePrimIndex('/World/M2', 'outer')
    cache.processChanges()
    cache.registerInstancePrimIndex('/World/M1/A', 'inner')
    cache.registerInstancePrimIndex('/World/M1/B', 'inner')
    cache.processChanges()

    expect(cache.isPathDescendantToAnInstance('/World/M1/A')).toBe(true)
    expect(cache.getPrimsInPrototypesUsingPrimIndexPath('/World/M1/A').sort())
      .toEqual(['/__Prototype_1/A', '/__Prototype_2'])
    expect(cache.getPrimsInPrototypesUsingPrimIndexPath('/World/M1/A/geo'))
      .toEqual(['/__Prototype_2/geo'])
    expect(cache.getPrimsInPrototypesUsingPrimIndexPath('/World/M1/B/geo'))
      .toEqual([])
  })

  it('maps an uncomputed nested instance-proxy path to the inner prototype', () => {
    // testUsdInstanceProxy.py:test_GetPrimInPrototype and
    // instanceCache.cpp:716-783: /World/M2/A has no registered prim index,
    // so the query first rebases through M2's source and then reaches the
    // nested A prototype.
    const cache = new UsdInstanceCache()
    cache.registerInstancePrimIndex('/World/M1', 'outer')
    cache.registerInstancePrimIndex('/World/M2', 'outer')
    cache.processChanges()
    cache.registerInstancePrimIndex('/World/M1/A', 'inner')
    cache.registerInstancePrimIndex('/World/M1/B', 'inner')
    cache.processChanges()

    expect(cache.getPathInPrototypeForInstancePath('/World/M2/A/geo'))
      .toBe('/__Prototype_2/geo')
  })

  it('retains outer and inner prototype identities through a nested structural edit', async () => {
    const stage = (await Stage.open('root.usda', {
      resolverContext: _resolverContextForResolver(new ArInMemoryResolver({
        'root.usda': enc(`#usda 1.0
def Xform "World" {
  def "M1" (instanceable = true ; references = @mid.usda@</Mid>) {}
  def "M2" (instanceable = true ; references = @mid.usda@</Mid>) {}
  def Scope "Unrelated" {}
}`),
        'mid.usda': enc(`#usda 1.0
def Xform "Mid" {
  def "A" (instanceable = true ; references = @inner.usda@</Leaf>) {}
  def "B" (instanceable = true ; references = @inner.usda@</Leaf>) {}
}`),
        'inner.usda': enc(`#usda 1.0
def Xform "Leaf" { def Cube "geo" {}
}
`),
      })),
    }))!
    const outer = stage.getPrim('/World/M1')!.getPrototype()!.path
    const innerInstance = stage.getChildPrimPaths(outer)[0]!
    const inner = stage.getPrim(innerInstance)!.getPrototype()!.path
    const branch = (stage as unknown as { _primMap: Map<string, object> })
      ._primMap.get('/World/Unrelated')
    const innerLayer = stage.getUsedLayers().find(layer => layer.filePath === 'inner.usda')!

    innerLayer.definePrimSpec('/Leaf/newGeo', 'Cube')
    await stage.flushChanges()

    expect(stage.getPrim('/World/M1')!.getPrototype()!.path).toBe(outer)
    expect(stage.getPrim(stage.getChildPrimPaths(outer)[0]!)!.getPrototype()!.path).toBe(inner)
    expect(stage.getPrim(`${inner}/newGeo`)).toBeDefined()
    expect((stage as unknown as { _primMap: Map<string, object> })
      ._primMap.get('/World/Unrelated')).toBe(branch)
  })
})

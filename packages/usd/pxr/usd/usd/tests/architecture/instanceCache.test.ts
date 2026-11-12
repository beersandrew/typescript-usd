import { describe, expect, it } from 'vitest'
import { UsdInstanceCache } from '../../src/instanceCache.ts'

describe('UsdInstanceCache', () => {
  it('processes queued registrations, source changes, and dead prototypes', () => {
    const cache = new UsdInstanceCache()
    expect(cache.registerInstancePrimIndex('/World/I1', 'shared')).toBe(true)
    expect(cache.registerInstancePrimIndex('/World/I2', 'shared')).toBe(false)
    const first = cache.processChanges()
    expect(first.newPrototypePrims).toEqual(['/__Prototype_1'])
    expect(cache.getInstancingInfo().instanceToProto.get('/World/I2'))
      .toBe('/__Prototype_1')

    cache.unregisterInstancePrimIndexesUnder('/World/I1')
    const second = cache.processChanges()
    expect(second.changedPrototypePrims).toEqual(['/__Prototype_1'])
    expect(second.changedPrototypePrimIndexes).toEqual(['/World/I2'])

    cache.unregisterInstancePrimIndexesUnder('/World/I2')
    const third = cache.processChanges()
    expect(third.deadPrototypePrims).toEqual(['/__Prototype_1'])

    cache.registerInstancePrimIndex('/World/I3', 'new')
    expect(cache.processChanges().newPrototypePrims).toEqual(['/__Prototype_2'])
  })
})

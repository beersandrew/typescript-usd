import { _resolverContextForResolver } from 'typescript-usd/usd/_internal'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ArInMemoryResolver } from 'typescript-usd/ar/_internal'
import { Collector, Reporter } from 'typescript-usd/trace'
import { Stage, SchemaRegistry as UsdSchemaRegistry } from '../../src/index.ts'

const enc = (text: string): Uint8Array => new TextEncoder().encode(text)

describe('Stage trace instrumentation', () => {
  const collector = Collector.GetInstance()

  beforeEach(() => {
    // Population composes prim type info, which initializes the schema
    // registry on first use; keep that one-time work out of the traces.
    UsdSchemaRegistry.getInstance()
    collector.enabled = false
    collector.clear()
  })

  afterEach(() => { collector.enabled = false })

  it('uses one logical lane with nested parentage for one Stage operation', async () => {
    const reporter = new Reporter('Stage operation')
    collector.enabled = true

    await Stage.open('trace.usda', {
      resolverContext: _resolverContextForResolver(new ArInMemoryResolver({
        'trace.usda': enc('#usda 1.0\ndef Scope "World" {}'),
      })),
    })
    collector.enabled = false
    reporter.updateTraceTrees()

    const lanes = reporter.getEventRoot().children
    expect(lanes).toHaveLength(1)
    expect(lanes[0]?.children.map(node => node.key)).toEqual(['typescript-usd:Stage.open'])
    const stageOpen = lanes[0]?.children[0]
    expect(stageOpen?.attributes.get('filePath')).toEqual(['trace.usda'])
    expect(stageOpen?.children.map(node => node.key)).toEqual([
      'typescript-usd:Layer.findOrOpen',
      'typescript-usd:SdfFileFormat.findByExtension',
      'typescript-usd:composeScene',
    ])
    const rootLayerOpen = stageOpen?.children[0]
    expect(rootLayerOpen?.children.map(node => node.key)).toEqual([
      'typescript-usd:Layer.computeInfoToFindOrOpenLayer',
      'typescript-usd:LayerRegistry.findOrOpen',
    ])
    const composition = stageOpen?.children[2]
    const layerStack = composition?.children.find(
      node => node.key === 'typescript-usd:computePcpLayerStack',
    )
    expect(layerStack?.attributes.get('rootLayer')).toEqual(['trace.usda'])
    expect(layerStack?.children.map(node => node.key)).toContain('typescript-usd:computeRelocations')

  })

  it('traces flattening as its own logical Stage operation', async () => {
    const stage = (await Stage.open('flatten.usda', {
      resolverContext: _resolverContextForResolver(new ArInMemoryResolver({
        'flatten.usda': enc('#usda 1.0\ndef Scope "World" {}'),
      })),
    }))!
    collector.clear()
    const reporter = new Reporter('Stage flatten')
    collector.enabled = true

    stage.flatten()
    collector.enabled = false
    reporter.updateTraceTrees()

    const lanes = reporter.getEventRoot().children
    expect(lanes).toHaveLength(1)
    expect(lanes[0]?.children.map(node => node.key)).toEqual(['typescript-usd:Stage.flatten'])
    expect(lanes[0]?.children[0]?.attributes.get('stageNodeCount')).toEqual([2])
  })

  it('traces query-time resolver sources and property provenance', async () => {
    const stage = (await Stage.open('queries.usda', {
      resolverContext: _resolverContextForResolver(new ArInMemoryResolver({
        'queries.usda': enc(`#usda 1.0
def "P" (prepend apiSchemas = ["CollectionAPI:test"]
clips = { dictionary default = {
  double2[] active = [(0, 0)]
  asset[] assetPaths = [@clip.usda@]
  string primPath = "/P"
} }) {
  double defaultValue = 1
  double sampled.timeSamples = { 0: 0, 2: 2 }
  double blocked = None
  double clipped
}`),
        'clip.usda': enc(`#usda 1.0
over "P" { double clipped.timeSamples = { 0: 10, 2: 12 } ; }`),
      })),
    }))!
    collector.clear()
    const reporter = new Reporter('Usd query sources')
    collector.enabled = true

    expect(stage.get('/P.defaultValue')?.getValue()).toBe(1)
    expect(stage.get('/P.sampled')?.getValueAtTime(1)).toBe(1)
    expect(stage.get('/P.blocked')?.getValue()).toBeUndefined()
    expect(stage.get('/P.clipped')?.getValueAtTime(1)).toBe(11)
    expect(stage.get('/P.collection:test:expansionRule')?.getValue()).toBe('expandPrims')
    stage.get('/P.defaultValue')?.getResolveInfo()
    stage.get('/P.defaultValue')?.getPropertyStack()
    stage.flatten()

    collector.enabled = false
    reporter.updateTraceTrees()
    const visit = (node: { key: string; attributes: Map<string, unknown[]>; children: unknown[] }):
      Array<{ key: string; attributes: Map<string, unknown[]>; children: unknown[] }> =>
      [node, ...node.children.flatMap(child => visit(child as typeof node))]
    const nodes = reporter.getEventRoot().children.flatMap(lane => visit(lane))
    const resolutions = nodes.filter(node => node.key === 'typescript-usd:Stage.resolveAttributeValue')
    const sourceFor = (propertyPath: string, time: string | number): unknown =>
      resolutions.find(node =>
        node.attributes.get('propertyPath')?.includes(propertyPath) &&
        node.attributes.get('time')?.includes(time))?.attributes.get('source')?.[0]

    expect(sourceFor('/P.defaultValue', 'default')).toBe('default')
    expect(sourceFor('/P.sampled', 1)).toBe('timeSamples')
    expect(sourceFor('/P.blocked', 'default')).toBe('none')
    expect(sourceFor('/P.clipped', 1)).toBe('valueClips')
    expect(sourceFor('/P.collection:test:expansionRule', 'default')).toBe('fallback')
    expect(sourceFor('/P.defaultValue', 'resolveInfo')).toBe('default')
    expect(resolutions.find(node =>
      node.attributes.get('propertyPath')?.includes('/P.blocked'))
      ?.attributes.get('valueIsBlocked')).toEqual([true])

    const propertyStack = nodes.find(node => node.key === 'typescript-usd:Stage.getPropertyStack')
    expect(propertyStack?.attributes.get('propertyPath')).toEqual(['/P.defaultValue'])
    expect(propertyStack?.attributes.get('specCount')).toEqual([1])
    expect(nodes.some(node => node.key === 'typescript-usd:Stage.flatten')).toBe(true)
    expect(resolutions.filter(node =>
      node.attributes.get('propertyPath')?.includes('/P.defaultValue')).length)
      .toBeGreaterThan(1)
  })

  it('coalesces concurrent flush waiters without resurrecting a closed context', async () => {
    collector.enabled = true
    const stage = (await Stage.open('retained-context.usda', {
      resolverContext: _resolverContextForResolver(new ArInMemoryResolver({
        'retained-context.usda': enc('#usda 1.0\ndef Scope "World" {}'),
      })),
    }))!
    collector.enabled = false
    const opening = collector.createCollection()
    expect(opening.getThreadIds()).toHaveLength(1)
    const openingLane = opening.getThreadIds()[0]!

    collector.enabled = true
    stage.getRootLayer().definePrimSpec('/Second', 'Scope')
    await Promise.all([stage.flushChanges(), stage.flushChanges()])
    collector.enabled = false
    const concurrent = collector.createCollection()

    expect(concurrent.getThreadIds()).toHaveLength(1)
    const concurrentLane = concurrent.getThreadIds()[0]!
    expect(concurrentLane).not.toBe(openingLane)
    expect(concurrent.getEvents(concurrentLane).some(
      event => event.key === 'typescript-usd:Stage.processChanges')).toBe(true)

    collector.enabled = true
    stage.getRootLayer().definePrimSpec('/Third', 'Scope')
    await stage.flushChanges()
    collector.enabled = false
    const later = collector.createCollection()

    expect(later.getThreadIds()).toHaveLength(1)
    const laterLane = later.getThreadIds()[0]!
    expect(laterLane).not.toBe(openingLane)
    expect(laterLane).not.toBe(concurrentLane)
    const laterEvents = later.getEvents(laterLane)
    expect(laterEvents.some(event => event.key === 'typescript-usd:Stage.processChanges')).toBe(true)
    const laterSpanIds = new Set(laterEvents.map(event => event.eventId)
      .filter((eventId): eventId is number => eventId !== undefined))
    expect(laterEvents.every(event =>
      event.parentEventId === undefined || laterSpanIds.has(event.parentEventId))).toBe(true)
  })

  it('does not allocate Stage events while tracing is disabled', async () => {
    await Stage.open('disabled.usda', {
      resolverContext: _resolverContextForResolver(new ArInMemoryResolver({
        'disabled.usda': enc('#usda 1.0\ndef Scope "World" {}'),
      })),
    })
    expect(collector.createCollection().empty).toBe(true)
  })
})

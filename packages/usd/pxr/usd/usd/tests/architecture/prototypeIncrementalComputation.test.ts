// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/pcp/instanceKey.cpp, pxr/usd/usd/stage.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _resolverContextForResolver } from 'typescript-usd/usd/_internal'
import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { ArInMemoryResolver } from 'typescript-usd/usd/_internal'
import type { Cache as PcpCache, ComputationEventKind as PcpComputationEventKind } from 'typescript-usd/pcp'

const enc = (text: string): Uint8Array => new TextEncoder().encode(text)
type Event = { kind: PcpComputationEventKind; path: string }

const referenceList = (assetPath: string) => ({
  isExplicit: false,
  explicitItems: [],
  prependedItems: [{
    assetPath, primPath: '/Model', layerOffset: { offset: 0, scale: 1 },
  }],
  appendedItems: [],
  deletedItems: [],
})

async function instanceStage(): Promise<Stage> {
  return (await Stage.open('root.usda', {
    resolverContext: _resolverContextForResolver(new ArInMemoryResolver({
      'root.usda': enc(`#usda 1.0
def Scope "World" {
  def Scope "I1" (instanceable = true ; references = @a.usda@</Model>) {}
  def Scope "I2" (instanceable = true ; references = @a.usda@</Model>) {}
  def Scope "Branch" { double value = 1 ; }
}
`),
      'a.usda': enc("#usda 1.0\ndef Scope \"Model\" { def Scope \"Child\" {} \n}"),
      'b.usda': enc("#usda 1.0\ndef Scope \"Model\" { def Scope \"Other\" {} \n}"),
    })),
  }))!
}

function internals(stage: Stage): {
  cache: PcpCache
  instanceToProto: Map<string, string>
  protoToSource: Map<string, string>
  nodes: Map<string, object>
} {
  const value = stage as unknown as {
    _pcpCache: PcpCache
    _instanceCache: {
      getInstancingInfo(): {
        instanceToProto: Map<string, string>
        protoToSource: Map<string, string>
      }
    }
    _primMap: Map<string, object>
  }
  const instancing = value._instanceCache.getInstancingInfo()
  return {
    cache: value._pcpCache,
    instanceToProto: instancing.instanceToProto,
    protoToSource: instancing.protoToSource,
    nodes: value._primMap,
  }
}

function observe(stage: Stage): Event[] {
  const events: Event[] = []
  internals(stage).cache.setComputationObserver(
    (kind, path) => events.push({ kind, path }))
  return events
}

const pathsFor = (events: readonly Event[], kind: PcpComputationEventKind): string[] =>
  events.filter(event => event.kind === kind).map(event => event.path)

async function addInstance(stage: Stage, path: string, asset: string): Promise<void> {
  const root = stage.getRootLayer()
  root.definePrimSpec(path, 'Scope')
  root.setField(path, 'instanceable', true)
  root.setField(path, 'references', referenceList(asset))
  await stage.flushChanges()
}

describe('incremental prototype computation safety rails', () => {
  it('does not visit an unrelated instance or ordinary branch when editing one instance', async () => {
    const stage = await instanceStage()
    const events = observe(stage)

    stage.getRootLayer().setField('/World/I1', 'instanceable', false)
    await stage.flushChanges()

    expect(pathsFor(events, 'primIndexRequest')).toContain('/World/I1')
    expect(pathsFor(events, 'materialization')).toContain('/World/I1')
    // /World/I2 becomes the prototype's new source, whose prim indexes
    // _ComposePrimIndexesInParallel composes (stage.cpp:5373-5389).
    expect(pathsFor(events, 'namespaceDiscovery')).not.toContain('/World/Branch')
  })

  it('reuses a prototype without recomputing its existing source when adding the same key', async () => {
    const stage = await instanceStage()
    const before = internals(stage)
    const retainedPrototype = before.instanceToProto.get('/World/I1')!
    const retainedNode = before.nodes.get(retainedPrototype)
    const events = observe(stage)

    await addInstance(stage, '/World/I3', 'a.usda')
    const after = internals(stage)

    expect(after.instanceToProto.get('/World/I3')).toBe(retainedPrototype)
    expect(after.nodes.get(retainedPrototype)).toBe(retainedNode)
    expect(pathsFor(events, 'materialization')).toContain('/World/I3')
    expect(pathsFor(events, 'primIndexRequest')).not.toContain('/World/I1')
  })

  it('allocates exactly one monotonic prototype for one new instance key', async () => {
    const stage = await instanceStage()
    const oldPrototypes = new Set(internals(stage).protoToSource.keys())
    const events = observe(stage)

    await addInstance(stage, '/World/J1', 'b.usda')
    const after = internals(stage)
    const added = [...after.protoToSource.keys()].filter(path => !oldPrototypes.has(path))

    expect(added).toHaveLength(1)
    expect(Number(added[0]!.slice('/__Prototype_'.length))).toBeGreaterThan(
      Math.max(...[...oldPrototypes].map(path => Number(path.slice('/__Prototype_'.length)))))
    expect(pathsFor(events, 'materialization')).toContain('/World/J1')
    expect(pathsFor(events, 'materialization').some(
      path => path.startsWith(`${added[0]}/`))).toBe(true)
    expect(pathsFor(events, 'materialization')).not.toContain('/World/Branch')
  })

  it('preserves the surviving prototype without visiting unrelated population', async () => {
    const stage = await instanceStage()
    const before = internals(stage)
    const prototype = before.instanceToProto.get('/World/I2')!
    const prototypeNode = before.nodes.get(prototype)
    const events = observe(stage)

    stage.getRootLayer().getPrimAtPath('/World')!.getNameChildren().erase('I1')
    await stage.flushChanges()
    const after = internals(stage)

    expect(after.instanceToProto.get('/World/I2')).toBe(prototype)
    expect(after.nodes.get(prototype)).toBe(prototypeNode)
    expect(pathsFor(events, 'primIndexRequest')).toContain('/World/I1')
    expect(pathsFor(events, 'usdDependencyResolution')).not.toContain('/World/Branch')
  })

  it('populates a replacement prototype source during broad recomposition', async () => {
    const stage = await instanceStage()
    const prototype = internals(stage).instanceToProto.get('/World/I1')!
    const root = stage.getRootLayer()

    root.getPrimAtPath('/World')!.getNameChildren().erase('I1')
    // Exercise broad layer-stack recomposition without changing the instance
    // key. TimeCodesPerSecond is not suitable here: it changes reference arc
    // offsets, which participate in PcpInstanceKey (pcp/instanceKey.cpp:31-61).
    root.setField('/', 'expressionVariables', { UNUSED: 'value' })
    await stage.flushChanges()

    const after = internals(stage)
    expect(after.instanceToProto.get('/World/I2')).toBe(prototype)
    expect(after.protoToSource.get(prototype)).toBe('/World/I2')
    expect(stage.getPrim(`${prototype}/Child`)).toBeDefined()
    expect(stage.getPrim('/World/I2/Child')).toBeDefined()
  })

  it('removes only the obsolete prototype when its last instance disappears', async () => {
    const stage = await instanceStage()
    await addInstance(stage, '/World/J1', 'b.usda')
    const before = internals(stage)
    const survivingPrototype = before.instanceToProto.get('/World/I1')!
    const removedPrototype = before.instanceToProto.get('/World/J1')!
    const survivingNode = before.nodes.get(survivingPrototype)
    const events = observe(stage)

    stage.getRootLayer().getPrimAtPath('/World')!.getNameChildren().erase('J1')
    await stage.flushChanges()
    const after = internals(stage)

    expect(after.nodes.has(removedPrototype)).toBe(false)
    expect(after.nodes.get(survivingPrototype)).toBe(survivingNode)
    expect(pathsFor(events, 'primIndexRequest')).toContain('/World/J1')
    expect(pathsFor(events, 'primIndexRequest')).not.toContain('/World/I1')
  })

  it('materializes only the affected prototype subtree for a referenced structural edit', async () => {
    const stage = await instanceStage()
    const prototype = internals(stage).instanceToProto.get('/World/I1')!
    const source = stage.getUsedLayers().find(layer => layer.filePath === 'a.usda')!
    const events = observe(stage)

    source.definePrimSpec('/Model/New', 'Scope')
    await stage.flushChanges()

    expect(stage.getPrim(`${prototype}/New`)).toBeDefined()
    // Only the new prim's index recomposes (_RecomposePrims of the changed
    // site beneath the prototype's source instance).
    expect(pathsFor(events, 'primIndexRequest')).toContain('/World/I1/New')
    expect(pathsFor(events, 'primIndexRequest')).not.toContain('/World/I1')
    expect(pathsFor(events, 'materialization')).toContain(`${prototype}/New`)
    expect(pathsFor(events, 'materialization')).not.toContain('/World/Branch')
    expect(pathsFor(events, 'usdDependencyResolution')).not.toContain('/World/Branch')
  })

  it('does not rebuild unrelated dependency state when an instance changes key', async () => {
    const stage = await instanceStage()
    const events = observe(stage)

    stage.getRootLayer().setField('/World/I1', 'references', referenceList('b.usda'))
    await stage.flushChanges()

    const prototype = internals(stage).instanceToProto.get('/World/I1')!
    expect(pathsFor(events, 'materialization')).toContain('/World/I1')
    expect(pathsFor(events, 'materialization').some(
      path => path.startsWith(`${prototype}/`))).toBe(true)
    expect(pathsFor(events, 'usdDependencyResolution')).not.toContain('/World/I2')
    expect(pathsFor(events, 'usdDependencyResolution')).not.toContain('/World/Branch')
  })
})

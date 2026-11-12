// Portions ported from OpenUSD 26.11.1, including: pxr/usd/pcp/changes.cpp,
//  pxr/usd/pcp/cache.cpp, pxr/usd/usd/instanceCache.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _resolverContextForResolver } from 'typescript-usd/usd/_internal'
import { describe, expect, it } from 'vitest'
import { ArInMemoryResolver } from 'typescript-usd/ar/_internal'
import { _sdfCloneValue } from 'typescript-usd/sdf/_internal'
import type { Cache as PcpCache, PrimIndex as PcpPrimIndex } from 'typescript-usd/pcp'
import type { Layer } from 'typescript-usd/sdf'
import { Stage } from '../../src/index.ts'
import { onObjectsChanged, type ObjectsChangedSummary } from '../support/objectsChanged.ts'

const enc = (text: string) => new TextEncoder().encode(text)

const referenceList = (assetPath: string, primPath: string) => ({
  isExplicit: false,
  explicitItems: [],
  prependedItems: [{
    assetPath, primPath, layerOffset: { offset: 0, scale: 1 },
  }],
  appendedItems: [],
  deletedItems: [],
})

const pathList = (path: string) => ({
  isExplicit: false,
  explicitItems: [],
  prependedItems: [path],
  appendedItems: [],
  deletedItems: [],
})

interface Observation {
  cache: PcpCache
  layerStack: object
  affectedIndex: PcpPrimIndex | undefined
  unaffectedIndex: PcpPrimIndex | undefined
  affectedNode: object | undefined
  unaffectedNode: object | undefined
  subscriptions: ReadonlySet<Layer>
  subscriptionIdentifiers: readonly string[]
}

function observe(stage: Stage, affected: string, unaffected: string): Observation {
  const internal = stage as unknown as {
    _pcpCache: PcpCache
    _primMap: ReadonlyMap<string, object>
    _layersAndNoticeKeys: ReadonlyMap<Layer, unknown>
  }
  return {
    cache: internal._pcpCache,
    layerStack: internal._pcpCache.getLayerStack(),
    affectedIndex: internal._pcpCache.findPrimIndex(affected),
    unaffectedIndex: internal._pcpCache.findPrimIndex(unaffected),
    affectedNode: internal._primMap.get(affected),
    unaffectedNode: internal._primMap.get(unaffected),
    subscriptions: new Set(internal._layersAndNoticeKeys.keys()),
    subscriptionIdentifiers: [...internal._layersAndNoticeKeys.keys()]
      .map(layer => layer.filePath).sort(),
  }
}

function collectNotices(stage: Stage): ObjectsChangedSummary[] {
  const notices: ObjectsChangedSummary[] = []
  onObjectsChanged(stage, notice => notices.push(notice))
  return notices
}

async function basicStage(): Promise<Stage> {
  return (await Stage.open('matrix.usda', {
    resolverContext: _resolverContextForResolver(new ArInMemoryResolver({
      'matrix.usda': enc(`#usda 1.0
def Scope "A" { double size = 1 ; rel link = </B> ; }
def Scope "B" { double size = 2 ; }
def Scope "C" {}
`),
    })),
  }))!
}

async function structuralStage(): Promise<Stage> {
  return (await Stage.open('structural.usda', {
    resolverContext: _resolverContextForResolver(new ArInMemoryResolver({
      'structural.usda': enc(`#usda 1.0
def Scope "A" {
  double value = 1
  def Scope "Child" {}
}
def Scope "B" {}
over "Inert" {}
`),
    })),
  }))!
}

async function payloadStage(loadPayloads = true): Promise<Stage> {
  return (await Stage.open('payloadRoot.usda', {
    loadPayloads,
    resolverContext: _resolverContextForResolver(new ArInMemoryResolver({
      'payloadRoot.usda': enc(`#usda 1.0
def Scope "A" (payload = @payloadA.usda@</Model>) {}
def Scope "B" {}
`),
      'payloadA.usda': enc(`#usda 1.0
def Scope "Model" {
  double value = 1
}
`),
      'payloadB.usda': enc(`#usda 1.0
def Scope "Model" {
  double value = 2
}
`),
    })),
  }))!
}

async function classArcStage(kind: 'inherits' | 'specializes'): Promise<Stage> {
  const first = kind === 'inherits' ? 'class' : 'def'
  return (await Stage.open(`${kind}.usda`, {
    resolverContext: _resolverContextForResolver(new ArInMemoryResolver({
      [`${kind}.usda`]: enc(`#usda 1.0
${first} Scope "Base1" { double value = 1
}
${first} Scope "Base2" { double value = 2
}
def Scope "A" (${kind} = </Base1>) {}
def Scope "B" {}
`),
    })),
  }))!
}

async function instancingStage(): Promise<Stage> {
  return (await Stage.open('instances.usda', {
    resolverContext: _resolverContextForResolver(new ArInMemoryResolver({
      'instances.usda': enc(`#usda 1.0
def Scope "World" {
  def Scope "I1" (
    instanceable = true
    references = @instanceA.usda@</Model>
  ) {}
  def Scope "I2" (
    instanceable = true
    references = @instanceA.usda@</Model>
  ) {}
}
`),
      'instanceA.usda': enc(`#usda 1.0
def Scope "Model" {
  double value = 1
  def Scope "Child" {}
}
`),
      'instanceB.usda': enc(`#usda 1.0
def Scope "Model" {
  double value = 2
  def Scope "Other" {}
}
`),
    })),
  }))!
}

async function layerStackStage(subLayers = ['a.usda']): Promise<Stage> {
  const authored = subLayers.map(path => `@${path}@`).join(', ')
  return (await Stage.open('stackRoot.usda', {
    resolverContext: _resolverContextForResolver(new ArInMemoryResolver({
      'stackRoot.usda': enc(`#usda 1.0
(
  subLayers = [${authored}]
)
def Scope "B" {}
`),
      'a.usda': enc(`#usda 1.0
def Scope "A" {
  double value = 1
  double anim.timeSamples = { 0: 0, 1: 1 }
}
`),
      'b.usda': enc(`#usda 1.0
def Scope "A" {
  double value = 2
}
`),
    })),
  }))!
}

async function timingExpressionStage(): Promise<Stage> {
  return (await Stage.open('timingRoot.usda', {
    resolverContext: _resolverContextForResolver(new ArInMemoryResolver({
      'timingRoot.usda': enc(`#usda 1.0
(
  framesPerSecond = 24
  timeCodesPerSecond = 24
  expressionVariables = {
    string WHICH = "A"
  }
  subLayers = [@\`"./\${WHICH}.usda"\`@]
)
def Scope "Other" {}
`),
      'A.usda': enc(`#usda 1.0
def Scope "Model" {
  double value = 1
}
`),
      'B.usda': enc(`#usda 1.0
def Scope "Model" {
  double value = 2
}
`),
    })),
  }))!
}

function composedNode(stage: Stage, path: string): object | undefined {
  return (stage as unknown as {
    _primMap: ReadonlyMap<string, object>
  })._primMap.get(path)
}

describe('Usd live-change identity and notice matrix', () => {
  it('value edit: retains composition identity and emits one info-only path', async () => {
    const stage = await basicStage()
    const notices = collectNotices(stage)
    const before = observe(stage, '/A', '/B')

    stage.getRootLayer().setField('/A.size', 'default', 7)
    await stage.flushChanges()
    const after = observe(stage, '/A', '/B')

    expect(stage.get('/A.size')?.getValue()).toBe(7)
    expect(after.cache).toBe(before.cache)
    expect(after.affectedIndex).toBe(before.affectedIndex)
    expect(after.unaffectedIndex).toBe(before.unaffectedIndex)
    expect(after.layerStack).toBe(before.layerStack)
    expect(after.affectedNode).toBe(before.affectedNode)
    expect(after.unaffectedNode).toBe(before.unaffectedNode)
    expect(after.subscriptions).toEqual(before.subscriptions)
    expect(after.subscriptionIdentifiers).toEqual(before.subscriptionIdentifiers)
    expect(notices).toEqual([{
      resyncedPaths: [], changedInfoOnlyPaths: ['/A.size'],
    }])
  })

  it('relationship target edit: retains indexes and emits one info-only path', async () => {
    const stage = await basicStage()
    const notices = collectNotices(stage)
    const before = observe(stage, '/A', '/B')

    stage.getRootLayer().setField('/A.link', 'targetPaths', ['/C'])
    await stage.flushChanges()
    const after = observe(stage, '/A', '/B')

    expect(stage.get('/A.link')?.getTargets()).toEqual(['/C'])
    expect(after.cache).toBe(before.cache)
    expect(after.affectedIndex).toBe(before.affectedIndex)
    expect(after.unaffectedIndex).toBe(before.unaffectedIndex)
    expect(after.layerStack).toBe(before.layerStack)
    expect(after.unaffectedNode).toBe(before.unaffectedNode)
    expect(notices).toEqual([{
      resyncedPaths: [], changedInfoOnlyPaths: ['/A.link'],
    }])
  })

  it('attribute connection edit: retains indexes and emits one info-only path', async () => {
    const stage = await basicStage()
    const notices = collectNotices(stage)
    const before = observe(stage, '/A', '/B')

    stage.getRootLayer().setField('/A.size', 'connectionPaths', ['/B.size'])
    await stage.flushChanges()
    const after = observe(stage, '/A', '/B')

    expect(stage.get('/A.size')?.getConnections()).toEqual(['/B.size'])
    expect(after.cache).toBe(before.cache)
    expect(after.affectedIndex).toBe(before.affectedIndex)
    expect(after.unaffectedIndex).toBe(before.unaffectedIndex)
    expect(after.layerStack).toBe(before.layerStack)
    expect(after.unaffectedNode).toBe(before.unaffectedNode)
    expect(notices).toEqual([{
      resyncedPaths: [], changedInfoOnlyPaths: ['/A.size'],
    }])
  })

  it('referenced-layer value edit maps to the composed property path', async () => {
    const resolver = new ArInMemoryResolver({
      'root.usda': enc(`#usda 1.0
def Scope "A" (references = @lib.usda@</One>) {}
def Scope "B" {}
`),
      'lib.usda': enc("#usda 1.0\ndef Scope \"One\" { double value = 1 ; }"),
    })
    const stage = (await Stage.open('root.usda', { resolverContext: _resolverContextForResolver(resolver) }))!
    const notices = collectNotices(stage)
    const before = observe(stage, '/A', '/B')
    const lib = stage.getUsedLayers().find(layer => layer.filePath === 'lib.usda')!

    lib.setField('/One.value', 'default', 3)
    await stage.flushChanges()
    const after = observe(stage, '/A', '/B')

    expect(stage.get('/A.value')?.getValue()).toBe(3)
    expect(after.cache).toBe(before.cache)
    expect(after.affectedIndex).toBe(before.affectedIndex)
    expect(after.unaffectedIndex).toBe(before.unaffectedIndex)
    expect(after.layerStack).toBe(before.layerStack)
    expect(after.affectedNode).toBe(before.affectedNode)
    expect(after.unaffectedNode).toBe(before.unaffectedNode)
    expect(after.subscriptions).toEqual(before.subscriptions)
    expect(notices).toEqual([{
      resyncedPaths: [], changedInfoOnlyPaths: ['/A.value'],
    }])
  })

  it('reference replacement population oracle: preserves unrelated StageNode identity', async () => {
    const resolver = new ArInMemoryResolver({
      'root.usda': enc(`#usda 1.0
def Scope "A" (references = @lib.usda@</One>) {}
def Scope "B" {}
`),
      'lib.usda': enc(`#usda 1.0
def Scope "One" { double value = 1 ; }
def Scope "Two" { double value = 2 ; }
`),
    })
    const stage = (await Stage.open('root.usda', { resolverContext: _resolverContextForResolver(resolver) }))!
    const before = observe(stage, '/A', '/B')

    stage.getRootLayer().setField('/A', 'references', referenceList('lib.usda', '/Two'))
    await stage.flushChanges()
    const after = observe(stage, '/A', '/B')

    expect.soft(stage.get('/A.value')?.getValue()).toBe(2)
    expect.soft(after.cache).toBe(before.cache)
    expect.soft(after.affectedIndex).not.toBe(before.affectedIndex)
    expect.soft(after.unaffectedIndex).toBe(before.unaffectedIndex)
    expect.soft(after.layerStack).toBe(before.layerStack)
    expect.soft(after.unaffectedNode).toBe(before.unaffectedNode)
    expect.soft(after.subscriptions).toEqual(before.subscriptions)
  })

  it('reference replacement notice oracle: resyncs the composed prim', async () => {
    const resolver = new ArInMemoryResolver({
      'root.usda': enc(`#usda 1.0
def Scope "A" (references = @lib.usda@</One>) {}
def Scope "B" {}
`),
      'lib.usda': enc(`#usda 1.0
def Scope "One" { double value = 1 ; }
def Scope "Two" { double value = 2 ; }
`),
    })
    const stage = (await Stage.open('root.usda', { resolverContext: _resolverContextForResolver(resolver) }))!
    const notices = collectNotices(stage)

    stage.getRootLayer().setField('/A', 'references', referenceList('lib.usda', '/Two'))
    await stage.flushChanges()

    expect(stage.get('/A.value')?.getValue()).toBe(2)
    expect(notices).toEqual([{
      resyncedPaths: ['/A'], changedInfoOnlyPaths: [],
    }])
  })

  it('cross-layer reference replacement retires the old layer subscription', async () => {
    const resolver = new ArInMemoryResolver({
      'root.usda': enc(`#usda 1.0
def Scope "A" (references = @libA.usda@</Model>) {}
def Scope "B" {}
`),
      'libA.usda': enc("#usda 1.0\ndef Scope \"Model\" { double value = 1 ; }"),
      'libB.usda': enc("#usda 1.0\ndef Scope \"Model\" { double value = 2 ; }"),
    })
    const stage = (await Stage.open('root.usda', { resolverContext: _resolverContextForResolver(resolver) }))!
    const before = observe(stage, '/A', '/B')
    const libA = stage.getUsedLayers().find(layer => layer.filePath === 'libA.usda')!

    stage.getRootLayer().setField(
      '/A', 'references', referenceList('libB.usda', '/Model'))
    await stage.flushChanges()
    const after = observe(stage, '/A', '/B')
    const libB = stage.getUsedLayers().find(layer => layer.filePath === 'libB.usda')!

    expect(stage.get('/A.value')?.getValue()).toBe(2)
    expect(after.cache).toBe(before.cache)
    expect(after.affectedIndex).not.toBe(before.affectedIndex)
    expect(after.unaffectedIndex).toBe(before.unaffectedIndex)
    expect(after.layerStack).toBe(before.layerStack)
    expect(after.subscriptions.has(libA)).toBe(false)
    expect(after.subscriptions.has(libB)).toBe(true)

    const retained = after.affectedIndex
    libA.setField('/Model.value', 'default', 99)
    await stage.flushChanges()
    expect(observe(stage, '/A', '/B').affectedIndex).toBe(retained)
    expect(stage.get('/A.value')?.getValue()).toBe(2)
  })

  it('payload replacement retires the old layer subscription', async () => {
    const stage = await payloadStage()
    const before = observe(stage, '/A', '/B')
    const payloadA = stage.getUsedLayers().find(
      layer => layer.filePath === 'payloadA.usda')!

    stage.getRootLayer().setField(
      '/A', 'payload', referenceList('payloadB.usda', '/Model'))
    await stage.flushChanges()
    const after = observe(stage, '/A', '/B')
    const payloadB = stage.getUsedLayers().find(
      layer => layer.filePath === 'payloadB.usda')!

    expect(stage.get('/A.value')?.getValue()).toBe(2)
    expect(after.cache).toBe(before.cache)
    expect(after.affectedIndex).not.toBe(before.affectedIndex)
    expect(after.unaffectedIndex).toBe(before.unaffectedIndex)
    expect(after.layerStack).toBe(before.layerStack)
    expect(after.subscriptions.has(payloadA)).toBe(false)
    expect(after.subscriptions.has(payloadB)).toBe(true)

    const retained = after.affectedIndex
    payloadA.setField('/Model.value', 'default', 99)
    await stage.flushChanges()
    expect(observe(stage, '/A', '/B').affectedIndex).toBe(retained)
    expect(stage.get('/A.value')?.getValue()).toBe(2)
  })

  it('payload replacement population oracle: preserves unrelated StageNode identity', async () => {
    const stage = await payloadStage()
    const before = observe(stage, '/A', '/B')

    stage.getRootLayer().setField(
      '/A', 'payload', referenceList('payloadB.usda', '/Model'))
    await stage.flushChanges()
    const after = observe(stage, '/A', '/B')

    expect.soft(stage.get('/A.value')?.getValue()).toBe(2)
    expect.soft(after.cache).toBe(before.cache)
    expect.soft(after.affectedIndex).not.toBe(before.affectedIndex)
    expect.soft(after.unaffectedIndex).toBe(before.unaffectedIndex)
    expect.soft(after.layerStack).toBe(before.layerStack)
    expect.soft(after.unaffectedNode).toBe(before.unaffectedNode)
  })

  it('payload replacement notice oracle: resyncs the payload-bearing prim', async () => {
    const stage = await payloadStage()
    const notices = collectNotices(stage)

    stage.getRootLayer().setField(
      '/A', 'payload', referenceList('payloadB.usda', '/Model'))
    await stage.flushChanges()

    expect(stage.get('/A.value')?.getValue()).toBe(2)
    // OpenUSD 26.05 live oracle: replacement resyncs /A and emits no
    // info-only paths.
    expect(notices).toEqual([{
      resyncedPaths: ['/A'], changedInfoOnlyPaths: [],
    }])
  })

  it('payload unload oracle: removes payload data and resyncs its prim', async () => {
    const stage = await payloadStage()
    const notices = collectNotices(stage)
    const api = stage as unknown as { unload?: (path: string) => Promise<void> }

    expect.soft(typeof api.unload).toBe('function')
    await api.unload?.('/A')

    expect.soft(stage.get('/A.value')).toBeUndefined()
    // OpenUSD 26.05 live oracle.
    expect.soft(notices).toEqual([{
      resyncedPaths: ['/A'], changedInfoOnlyPaths: [],
    }])
  })

  it('payload load oracle: LoadNone followed by load resyncs its prim', async () => {
    const stage = await payloadStage(false)
    const notices = collectNotices(stage)
    const api = stage as unknown as { load?: (path: string) => Promise<void> }

    expect.soft(stage.get('/A.value')).toBeUndefined()
    expect.soft(typeof api.load).toBe('function')
    await api.load?.('/A')

    expect.soft(stage.get('/A.value')?.getValue()).toBe(1)
    // OpenUSD 26.05 live oracle.
    expect.soft(notices).toEqual([{
      resyncedPaths: ['/A'], changedInfoOnlyPaths: [],
    }])
  })

  it('inherit replacement population oracle: preserves unrelated StageNode identity', async () => {
    const stage = await classArcStage('inherits')
    const before = observe(stage, '/A', '/B')

    stage.getRootLayer().setField('/A', 'inheritPaths', pathList('/Base2'))
    await stage.flushChanges()
    const after = observe(stage, '/A', '/B')

    expect.soft(stage.get('/A.value')?.getValue()).toBe(2)
    expect.soft(after.cache).toBe(before.cache)
    expect.soft(after.affectedIndex).not.toBe(before.affectedIndex)
    expect.soft(after.unaffectedIndex).toBe(before.unaffectedIndex)
    expect.soft(after.layerStack).toBe(before.layerStack)
    expect.soft(after.unaffectedNode).toBe(before.unaffectedNode)
    expect.soft(after.subscriptions).toEqual(before.subscriptions)
  })

  it('inherit replacement notice oracle: resyncs the inheriting prim', async () => {
    const stage = await classArcStage('inherits')
    const notices = collectNotices(stage)

    stage.getRootLayer().setField('/A', 'inheritPaths', pathList('/Base2'))
    await stage.flushChanges()

    expect(stage.get('/A.value')?.getValue()).toBe(2)
    // OpenUSD 26.05 live oracle.
    expect(notices).toEqual([{
      resyncedPaths: ['/A'], changedInfoOnlyPaths: [],
    }])
  })

  it('specialize replacement population oracle: preserves unrelated StageNode identity', async () => {
    const stage = await classArcStage('specializes')
    const before = observe(stage, '/A', '/B')

    stage.getRootLayer().setField('/A', 'specializes', pathList('/Base2'))
    await stage.flushChanges()
    const after = observe(stage, '/A', '/B')

    expect.soft(stage.get('/A.value')?.getValue()).toBe(2)
    expect.soft(after.cache).toBe(before.cache)
    expect.soft(after.affectedIndex).not.toBe(before.affectedIndex)
    expect.soft(after.unaffectedIndex).toBe(before.unaffectedIndex)
    expect.soft(after.layerStack).toBe(before.layerStack)
    expect.soft(after.unaffectedNode).toBe(before.unaffectedNode)
    expect.soft(after.subscriptions).toEqual(before.subscriptions)
  })

  it('specialize replacement notice oracle: resyncs the specializing prim', async () => {
    const stage = await classArcStage('specializes')
    const notices = collectNotices(stage)

    stage.getRootLayer().setField('/A', 'specializes', pathList('/Base2'))
    await stage.flushChanges()

    expect(stage.get('/A.value')?.getValue()).toBe(2)
    // OpenUSD 26.05 live oracle.
    expect(notices).toEqual([{
      resyncedPaths: ['/A'], changedInfoOnlyPaths: [],
    }])
  })

  it('layer relocates rebuild the layer stack and resync the whole stage', async () => {
    const resolver = new ArInMemoryResolver({
      'relocates.usda': enc(`#usda 1.0
def Scope "A" {
  def Scope "Child" { double value = 1 ; }
}
def Scope "B" {}
`),
    })
    const stage = (await Stage.open('relocates.usda', { resolverContext: _resolverContextForResolver(resolver) }))!
    const notices = collectNotices(stage)
    const before = observe(stage, '/A', '/B')

    stage.getRootLayer().setField('/', 'layerRelocates', {
      '/A/Child': '/A/Moved',
    })
    await stage.flushChanges()
    const after = observe(stage, '/A', '/B')

    expect.soft(stage.getPrim('/A/Child')).toBeUndefined()
    // OpenUSD also leaves the target empty here: local opinions at a relocate
    // source are prohibited, so this fixture tests stack lifecycle rather than
    // transporting the local value to the target.
    expect.soft(stage.getPrim('/A/Moved')).toBeUndefined()
    expect.soft(after.cache).toBe(before.cache)
    // PcpLayerStack::Apply recomputes the layer stack in place.
    expect.soft(after.layerStack).toBe(before.layerStack)
    expect.soft(after.affectedIndex).not.toBe(before.affectedIndex)
    expect.soft(after.unaffectedIndex).not.toBe(before.unaffectedIndex)
    // _ComposeChildren keeps existing prim data whose names remain.
    expect.soft(after.unaffectedNode).toBe(before.unaffectedNode)
    expect.soft(after.subscriptions).toEqual(before.subscriptions)
    // OpenUSD 26.05 live oracle: layer-level relocates are a whole-stage
    // resync, with no info-only paths.
    expect.soft(notices).toEqual([{
      resyncedPaths: ['/'], changedInfoOnlyPaths: [],
    }])
  })

  it('instanceable toggle keeps the shared prototype topology and composition state', async () => {
    const stage = await instancingStage()
    const before = observe(stage, '/World/I1', '/World/I2')
    const prototypePath = stage.getPrim('/World/I2')!.getPrototype()!.path

    stage.getRootLayer().setField('/World/I1', 'instanceable', false)
    await stage.flushChanges()
    const after = observe(stage, '/World/I1', '/World/I2')

    expect(stage.getPrim('/World/I1')!.isInstance()).toBe(false)
    expect(stage.getPrim('/World/I2')!.isInstance()).toBe(true)
    expect(stage.getPrim('/World/I2')!.getPrototype()!.path).toBe(prototypePath)
    expect(stage.getPrototypes().map(prim => prim.path)).toEqual([prototypePath])
    expect(after.cache).toBe(before.cache)
    expect(after.affectedIndex).not.toBe(before.affectedIndex)
    expect(after.unaffectedIndex).toBe(before.unaffectedIndex)
    expect(after.layerStack).toBe(before.layerStack)
    expect(after.subscriptions).toEqual(before.subscriptions)
  })

  it('instanceable toggle population oracle: preserves the other instance node', async () => {
    const stage = await instancingStage()
    const before = observe(stage, '/World/I1', '/World/I2')
    const prototypePath = stage.getPrim('/World/I2')!.getPrototype()!.path
    const prototypeNode = composedNode(stage, prototypePath)

    stage.getRootLayer().setField('/World/I1', 'instanceable', false)
    await stage.flushChanges()
    const after = observe(stage, '/World/I1', '/World/I2')

    expect.soft(after.unaffectedNode).toBe(before.unaffectedNode)
    expect.soft(composedNode(stage, prototypePath)).toBe(prototypeNode)
  })

  it('instanceable toggle notice oracle: resyncs the edited instance and its prototype', async () => {
    const stage = await instancingStage()
    const notices = collectNotices(stage)

    // The prototype's source is the first instance registered: upstream
    // registers instances in parallel, so its choice varies from run to run
    // (instanceCache.cpp:198-208); typescript-usd composes in namespace order.
    expect(stage.getPrim('/World/I1')!.getPrototype()!.path).toBe('/__Prototype_1')
    expect((stage as unknown as { _instanceCache: { getSourcePrimIndexPathForPrototype(p: string): string } })
      ._instanceCache.getSourcePrimIndexPathForPrototype('/__Prototype_1')).toBe('/World/I1')

    stage.getRootLayer().setField('/World/I1', 'instanceable', false)
    await stage.flushChanges()

    // OpenUSD v26.08 when the source is /World/I1: the prototype takes I2
    // as its new source and is resynced too (with source I2, only /World/I1).
    expect(notices).toEqual([{
      resyncedPaths: ['/World/I1', '/__Prototype_1'], changedInfoOnlyPaths: [],
    }])
  })

  it('instance reference replacement composes a second prototype and retains subscriptions', async () => {
    const stage = await instancingStage()
    const before = observe(stage, '/World/I1', '/World/I2')

    stage.getRootLayer().setField(
      '/World/I1', 'references', referenceList('instanceB.usda', '/Model'))
    await stage.flushChanges()
    const after = observe(stage, '/World/I1', '/World/I2')
    const i1Prototype = stage.getPrim('/World/I1')!.getPrototype()!.path
    const i2Prototype = stage.getPrim('/World/I2')!.getPrototype()!.path

    expect(stage.get('/World/I1.value')?.getValue()).toBe(2)
    expect(stage.get('/World/I2.value')?.getValue()).toBe(1)
    expect(i1Prototype).not.toBe(i2Prototype)
    expect(stage.getPrototypes().map(prim => prim.path).sort())
      .toEqual(['/__Prototype_1', '/__Prototype_2'])
    expect(after.cache).toBe(before.cache)
    expect(after.affectedIndex).not.toBe(before.affectedIndex)
    expect(after.unaffectedIndex).toBe(before.unaffectedIndex)
    expect(after.layerStack).toBe(before.layerStack)
    expect(after.subscriptionIdentifiers).toContain('instanceA.usda')
    expect(after.subscriptionIdentifiers).toContain('instanceB.usda')
  })

  it('instance reference replacement assignment oracle: retains the old prototype path', async () => {
    const stage = await instancingStage()
    const firstPrototype = stage.getPrim('/World/I2')!.getPrototype()!.path

    stage.getRootLayer().setField(
      '/World/I1', 'references', referenceList('instanceB.usda', '/Model'))
    await stage.flushChanges()

    // OpenUSD 26.05 leaves /World/I2 assigned to /__Prototype_1 and assigns
    // only the changed /World/I1 to the newly generated /__Prototype_2.
    expect(stage.getPrim('/World/I2')!.getPrototype()!.path).toBe(firstPrototype)
  })

  it('instance reference replacement population oracle: preserves the old prototype and instance', async () => {
    const stage = await instancingStage()
    const before = observe(stage, '/World/I1', '/World/I2')
    const firstPrototype = stage.getPrim('/World/I2')!.getPrototype()!.path
    const firstPrototypeNode = composedNode(stage, firstPrototype)

    stage.getRootLayer().setField(
      '/World/I1', 'references', referenceList('instanceB.usda', '/Model'))
    await stage.flushChanges()
    const after = observe(stage, '/World/I1', '/World/I2')

    expect.soft(after.unaffectedNode).toBe(before.unaffectedNode)
    expect.soft(composedNode(stage, firstPrototype)).toBe(firstPrototypeNode)
  })

  it('instance reference replacement notice oracle: resyncs the instance and new prototype', async () => {
    const stage = await instancingStage()
    const notices = collectNotices(stage)

    stage.getRootLayer().setField(
      '/World/I1', 'references', referenceList('instanceB.usda', '/Model'))
    await stage.flushChanges()

    // OpenUSD v26.08 when /World/I1 is the existing prototype's source (see
    // the instanceable toggle row): the edited instance, the existing
    // prototype (which takes I2 as its source) and the new prototype are
    // resynced.
    expect(notices).toEqual([{
      resyncedPaths: ['/World/I1', '/__Prototype_1', '/__Prototype_2'],
      changedInfoOnlyPaths: [],
    }])
  })

  it('sublayer addition rebuilds the layer stack and subscribes the new layer', async () => {
    const stage = await layerStackStage()
    const before = observe(stage, '/A', '/B')

    await stage.setSubLayerPaths(['b.usda', 'a.usda'])
    const after = observe(stage, '/A', '/B')
    const layerB = stage.getUsedLayers().find(layer => layer.filePath === 'b.usda')!

    expect(stage.get('/A.value')?.getValue()).toBe(2)
    expect(after.cache).toBe(before.cache)
    // PcpLayerStack::Apply recomputes the layer stack in place.
    expect(after.layerStack).toBe(before.layerStack)
    expect(after.affectedIndex).not.toBe(before.affectedIndex)
    // Only namespace from the changed layer resyncs; other indexes are
    // retained with rescanned prim stacks.
    expect(after.unaffectedIndex).toBe(before.unaffectedIndex)
    expect(after.subscriptions.has(layerB)).toBe(true)
  })

  it('sublayer addition notice oracle: reports affected namespace and layer metadata', async () => {
    const stage = await layerStackStage()
    const notices = collectNotices(stage)

    await stage.setSubLayerPaths(['b.usda', 'a.usda'])

    // OpenUSD 26.05 live oracle.
    expect(notices).toEqual([{
      resyncedPaths: ['/A'], changedInfoOnlyPaths: ['/'],
    }])
  })

  it('sublayer removal retires its subscription and rebuilds the layer stack', async () => {
    const stage = await layerStackStage(['b.usda', 'a.usda'])
    const before = observe(stage, '/A', '/B')
    const layerB = stage.getUsedLayers().find(layer => layer.filePath === 'b.usda')!

    await stage.setSubLayerPaths(['a.usda'])
    const after = observe(stage, '/A', '/B')

    expect(stage.get('/A.value')?.getValue()).toBe(1)
    expect(after.cache).toBe(before.cache)
    // PcpLayerStack::Apply recomputes the layer stack in place.
    expect(after.layerStack).toBe(before.layerStack)
    expect(after.affectedIndex).not.toBe(before.affectedIndex)
    // Only namespace from the changed layer resyncs; other indexes are
    // retained with rescanned prim stacks.
    expect(after.unaffectedIndex).toBe(before.unaffectedIndex)
    expect(after.subscriptions.has(layerB)).toBe(false)

    const retainedStack = after.layerStack
    layerB.setField('/A.value', 'default', 99)
    await stage.flushChanges()
    expect(observe(stage, '/A', '/B').layerStack).toBe(retainedStack)
    expect(stage.get('/A.value')?.getValue()).toBe(1)
  })

  it('sublayer removal notice oracle: reports affected namespace and layer metadata', async () => {
    const stage = await layerStackStage(['b.usda', 'a.usda'])
    const notices = collectNotices(stage)

    await stage.setSubLayerPaths(['a.usda'])

    // OpenUSD 26.05 live oracle.
    expect(notices).toEqual([{
      resyncedPaths: ['/A'], changedInfoOnlyPaths: ['/'],
    }])
  })

  it('sublayer offset replacement rebuilds the layer stack and retimes samples', async () => {
    const stage = await layerStackStage()
    const before = observe(stage, '/A', '/B')

    await stage.setSubLayerPaths(
      ['a.usda'], [{ offset: 10, scale: 2 }])
    const after = observe(stage, '/A', '/B')

    expect(stage.get('/A.anim')?.getTimeSampleKeys()).toEqual([10, 12])
    expect(after.cache).toBe(before.cache)
    // PcpLayerStack::Apply recomputes the layer stack in place.
    expect(after.layerStack).toBe(before.layerStack)
    expect(after.affectedIndex).not.toBe(before.affectedIndex)
    expect(after.unaffectedIndex).not.toBe(before.unaffectedIndex)
    expect(after.subscriptions).toEqual(before.subscriptions)
  })

  it('sublayer offset notice oracle: resyncs the whole stage', async () => {
    const stage = await layerStackStage()
    const notices = collectNotices(stage)

    await stage.setSubLayerPaths(
      ['a.usda'], [{ offset: 10, scale: 2 }])

    // OpenUSD 26.05 live oracle. A layer offset can affect every time-valued
    // opinion in the stack, so this is intentionally a root resync.
    expect(notices).toEqual([{
      resyncedPaths: ['/'], changedInfoOnlyPaths: [],
    }])
  })

  it('layer muting retires the muted subscription and rebuilds the layer stack', async () => {
    const stage = await layerStackStage()
    const before = observe(stage, '/A', '/B')
    const layerA = stage.getUsedLayers().find(layer => layer.filePath === 'a.usda')!

    await stage.muteLayer('a.usda')
    const after = observe(stage, '/A', '/B')

    expect(stage.getPrim('/A')).toBeUndefined()
    expect(after.cache).toBe(before.cache)
    // PcpLayerStack::Apply recomputes the layer stack in place.
    expect(after.layerStack).toBe(before.layerStack)
    // OpenUSD recomputes the resynced prim's (now specless) index.
    expect(after.affectedIndex).not.toBe(before.affectedIndex)
    // Only namespace from the changed layer resyncs; other indexes are
    // retained with rescanned prim stacks.
    expect(after.unaffectedIndex).toBe(before.unaffectedIndex)
    expect(after.subscriptions.has(layerA)).toBe(false)

    const retainedStack = after.layerStack
    layerA.setField('/A.value', 'default', 99)
    await stage.flushChanges()
    expect(observe(stage, '/A', '/B').layerStack).toBe(retainedStack)
    expect(stage.getPrim('/A')).toBeUndefined()
  })

  it('layer muting notice oracle: resyncs only namespace from the muted layer', async () => {
    const stage = await layerStackStage()
    const notices = collectNotices(stage)

    await stage.muteLayer('a.usda')

    // OpenUSD 26.05 live oracle. Muting is stage state, not an authored root
    // metadata change, so there is no info-only path for `/`.
    expect(notices).toEqual([{
      resyncedPaths: ['/A'], changedInfoOnlyPaths: [],
    }])
  })

  it('frames-per-second effective metadata oracle: updates the stage value', async () => {
    const stage = await timingExpressionStage()
    const api = stage as unknown as { getFramesPerSecond?: () => number }

    stage.getRootLayer().setField('/', 'framesPerSecond', 30)
    await stage.flushChanges()

    expect.soft(typeof api.getFramesPerSecond).toBe('function')
    expect.soft(api.getFramesPerSecond?.()).toBe(30)
    expect.soft(stage.timeCodesPerSecond).toBe(24)
  })

  it('frames-per-second composition oracle: retains layer stack and indexes', async () => {
    const stage = await timingExpressionStage()
    const before = observe(stage, '/Model', '/Other')

    stage.getRootLayer().setField('/', 'framesPerSecond', 30)
    await stage.flushChanges()
    const after = observe(stage, '/Model', '/Other')

    expect.soft(after.cache).toBe(before.cache)
    expect.soft(after.layerStack).toBe(before.layerStack)
    expect.soft(after.affectedIndex).toBe(before.affectedIndex)
    expect.soft(after.unaffectedIndex).toBe(before.unaffectedIndex)
    expect.soft(after.subscriptions).toEqual(before.subscriptions)
  })

  it('frames-per-second notice oracle: reports root metadata as info-only', async () => {
    const stage = await timingExpressionStage()
    const notices = collectNotices(stage)

    stage.getRootLayer().setField('/', 'framesPerSecond', 30)
    await stage.flushChanges()

    // OpenUSD 26.05 live oracle.
    expect(notices).toEqual([{
      resyncedPaths: [], changedInfoOnlyPaths: ['/'],
    }])
  })

  it('time-codes-per-second effective metadata oracle: updates the stage value', async () => {
    const stage = await timingExpressionStage()

    stage.getRootLayer().setField('/', 'timeCodesPerSecond', 48)
    await stage.flushChanges()

    expect(stage.timeCodesPerSecond).toBe(48)
  })

  it('time-codes-per-second edit rebuilds the layer stack', async () => {
    const stage = await timingExpressionStage()
    const before = observe(stage, '/Model', '/Other')

    stage.getRootLayer().setField('/', 'timeCodesPerSecond', 48)
    await stage.flushChanges()
    const after = observe(stage, '/Model', '/Other')

    expect.soft(after.cache).toBe(before.cache)
    // PcpLayerStack::Apply recomputes the layer stack in place.
    expect.soft(after.layerStack).toBe(before.layerStack)
    expect.soft(after.affectedIndex).not.toBe(before.affectedIndex)
    expect.soft(after.unaffectedIndex).not.toBe(before.unaffectedIndex)
    expect.soft(after.subscriptions).toEqual(before.subscriptions)
  })

  it('time-codes-per-second notice oracle: resyncs the whole stage', async () => {
    const stage = await timingExpressionStage()
    const notices = collectNotices(stage)

    stage.getRootLayer().setField('/', 'timeCodesPerSecond', 48)
    await stage.flushChanges()

    // OpenUSD 26.05 live oracle.
    expect(notices).toEqual([{
      resyncedPaths: ['/'], changedInfoOnlyPaths: [],
    }])
  })

  it('expression-variable edit swaps sublayers and retires the old subscription', async () => {
    const stage = await timingExpressionStage()
    const before = observe(stage, '/Model', '/Other')
    const layerA = stage.getUsedLayers().find(layer => layer.filePath === 'A.usda')!

    stage.getRootLayer().setField('/', 'expressionVariables', { WHICH: 'B' })
    await stage.flushChanges()
    const after = observe(stage, '/Model', '/Other')
    const layerB = stage.getUsedLayers().find(layer => layer.filePath === 'B.usda')!

    expect(stage.get('/Model.value')?.getValue()).toBe(2)
    expect(after.cache).toBe(before.cache)
    // PcpLayerStack::Apply recomputes the layer stack in place.
    expect(after.layerStack).toBe(before.layerStack)
    expect(after.affectedIndex).not.toBe(before.affectedIndex)
    expect(after.unaffectedIndex).not.toBe(before.unaffectedIndex)
    expect(after.subscriptions.has(layerA)).toBe(false)
    expect(after.subscriptions.has(layerB)).toBe(true)

    const retainedStack = after.layerStack
    layerA.setField('/Model.value', 'default', 99)
    await stage.flushChanges()
    expect(observe(stage, '/Model', '/Other').layerStack).toBe(retainedStack)
    expect(stage.get('/Model.value')?.getValue()).toBe(2)
  })

  it('expression-variable notice oracle: resyncs the whole stage', async () => {
    const stage = await timingExpressionStage()
    const notices = collectNotices(stage)

    stage.getRootLayer().setField('/', 'expressionVariables', { WHICH: 'B' })
    await stage.flushChanges()

    // OpenUSD 26.05 live oracle for a variable used by a sublayer expression.
    expect(notices).toEqual([{
      resyncedPaths: ['/'], changedInfoOnlyPaths: [],
    }])
  })

  it('variant selection population oracle: preserves unrelated StageNode identity', async () => {
    const resolver = new ArInMemoryResolver({
      'variants.usda': enc(`#usda 1.0
def Xform "Rig" (
  variants = { string look = "red" }
  prepend variantSets = "look"
) {
  variantSet "look" = {
    "red" { double tint = 1 ; def Sphere "RedGeo" {}
}
    "blue" { double tint = 2 ; def Cube "BlueGeo" {}
}
  }
}
def Scope "Other" {}
`),
    })
    const stage = (await Stage.open('variants.usda', { resolverContext: _resolverContextForResolver(resolver) }))!
    const before = observe(stage, '/Rig', '/Other')

    stage.getRootLayer().setField('/Rig', 'variantSelection', { look: ['blue'] })
    await stage.flushChanges()
    const after = observe(stage, '/Rig', '/Other')

    expect.soft(stage.get('/Rig.tint')?.getValue()).toBe(2)
    expect.soft(stage.getPrim('/Rig/BlueGeo')).not.toBeUndefined()
    expect.soft(stage.getPrim('/Rig/RedGeo')).toBeUndefined()
    expect.soft(after.cache).toBe(before.cache)
    expect.soft(after.affectedIndex).not.toBe(before.affectedIndex)
    expect.soft(after.unaffectedIndex).toBe(before.unaffectedIndex)
    expect.soft(after.layerStack).toBe(before.layerStack)
    expect.soft(after.unaffectedNode).toBe(before.unaffectedNode)
  })

  it('variant selection notice oracle: resyncs the variant-bearing prim', async () => {
    const resolver = new ArInMemoryResolver({
      'variants.usda': enc(`#usda 1.0
def Xform "Rig" (
  variants = { string look = "red" }
  prepend variantSets = "look"
) {
  variantSet "look" = {
    "red" { double tint = 1 ; def Sphere "RedGeo" {}
}
    "blue" { double tint = 2 ; def Cube "BlueGeo" {}
}
  }
}
def Scope "Other" {}
`),
    })
    const stage = (await Stage.open('variants.usda', { resolverContext: _resolverContextForResolver(resolver) }))!
    const notices = collectNotices(stage)

    stage.getRootLayer().setField('/Rig', 'variantSelection', { look: ['blue'] })
    await stage.flushChanges()

    expect(stage.get('/Rig.tint')?.getValue()).toBe(2)
    expect(notices).toEqual([{
      resyncedPaths: ['/Rig'], changedInfoOnlyPaths: [],
    }])
  })

  it('session-layer value edit retains composition and session identity', async () => {
    const resolver = new ArInMemoryResolver({
      'root.usda': enc(`#usda 1.0
def Scope "A" { double size = 1 ; }
def Scope "B" {}
`),
      'session.usda': enc("#usda 1.0\nover \"A\" { double size = 4 ; }"),
    })
    const stage = (await Stage.open('root.usda', {
      resolverContext: _resolverContextForResolver(resolver), sessionLayerPath: 'session.usda',
    }))!
    const notices = collectNotices(stage)
    const before = observe(stage, '/A', '/B')
    const session = stage.getSessionLayer()

    session.setField('/A.size', 'default', 5)
    await stage.flushChanges()
    const after = observe(stage, '/A', '/B')

    expect(stage.get('/A.size')?.getValue()).toBe(5)
    expect(after.cache).toBe(before.cache)
    expect(after.affectedIndex).toBe(before.affectedIndex)
    expect(after.unaffectedIndex).toBe(before.unaffectedIndex)
    expect(after.layerStack).toBe(before.layerStack)
    expect(after.unaffectedNode).toBe(before.unaffectedNode)
    expect(after.subscriptions.has(session)).toBe(true)
    expect(notices).toEqual([{
      resyncedPaths: [], changedInfoOnlyPaths: ['/A.size'],
    }])
  })

  it('prim addition population oracle: retains unrelated population', async () => {
    const stage = await basicStage()
    const before = observe(stage, '/A', '/B')

    stage.getRootLayer().definePrimSpec('/A/New', 'Scope')
    await stage.flushChanges()
    const after = observe(stage, '/A', '/B')

    expect.soft(stage.getPrim('/A/New')).not.toBeUndefined()
    expect.soft(after.cache).toBe(before.cache)
    expect.soft(after.layerStack).toBe(before.layerStack)
    expect.soft(after.unaffectedIndex).toBe(before.unaffectedIndex)
    // Forward population oracle: whole-map materialization currently replaces
    // this node; affected-subtree population must preserve it.
    expect.soft(after.unaffectedNode).toBe(before.unaffectedNode)
  })

  it('prim addition notice oracle: resyncs the new prim path', async () => {
    const stage = await basicStage()
    const notices = collectNotices(stage)

    stage.getRootLayer().definePrimSpec('/A/New', 'Scope')
    await stage.flushChanges()

    // OpenUSD 26.05 live oracle.
    expect(notices).toEqual([{
      resyncedPaths: ['/A/New'], changedInfoOnlyPaths: [],
    }])
  })

  it('prim removal population oracle: retains unrelated population', async () => {
    const stage = await structuralStage()
    const before = observe(stage, '/A', '/B')

    stage.getRootLayer().getRootPrims().erase('A')
    await stage.flushChanges()
    const after = observe(stage, '/A', '/B')

    expect.soft(stage.getPrim('/A')).toBeUndefined()
    expect.soft(after.cache).toBe(before.cache)
    expect.soft(after.layerStack).toBe(before.layerStack)
    // OpenUSD 26.05 PcpCache retains the recomputed valid-but-empty index;
    // UsdStage independently excludes it from populated namespace.
    expect.soft(after.affectedIndex).toBeDefined()
    expect.soft(after.affectedIndex).not.toBe(before.affectedIndex)
    expect.soft(after.affectedIndex?.hasSpecs()).toBe(false)
    expect.soft(after.unaffectedIndex).toBe(before.unaffectedIndex)
    expect.soft(after.unaffectedNode).toBe(before.unaffectedNode)
  })

  it('prim removal notice oracle: resyncs the removed prim path', async () => {
    const stage = await structuralStage()
    const notices = collectNotices(stage)

    stage.getRootLayer().getRootPrims().erase('A')
    await stage.flushChanges()

    // OpenUSD 26.05 live oracle.
    expect(notices).toEqual([{
      resyncedPaths: ['/A'], changedInfoOnlyPaths: [],
    }])
  })

  it('property addition population oracle: retains unrelated composition', async () => {
    const stage = await structuralStage()
    const before = observe(stage, '/A', '/B')

    stage.definePrim('/A').attr('created').set(7)
    await stage.flushChanges()
    const after = observe(stage, '/A', '/B')

    expect.soft(stage.get('/A.created')?.getValue()).toBe(7)
    expect.soft(after.cache).toBe(before.cache)
    expect.soft(after.layerStack).toBe(before.layerStack)
    // A property spec change touches no prim index — upstream removes only
    // property caches (pxr/usd/pcp/cache.cpp:1063-1067), and USD-mode Pcp
    // skips property entries entirely (changes.cpp:824-846).
    expect.soft(after.affectedIndex).toBe(before.affectedIndex)
    expect.soft(after.unaffectedIndex).toBe(before.unaffectedIndex)
    expect.soft(after.unaffectedNode).toBe(before.unaffectedNode)
  })

  it('property addition notice oracle: resyncs the new property path', async () => {
    const stage = await structuralStage()
    const notices = collectNotices(stage)

    stage.definePrim('/A').attr('created').set(7)
    await stage.flushChanges()

    // OpenUSD v26.08 (CreateAttribute + Set): creating the spec resyncs the
    // new property, then setting its value is an info-only change.
    expect(notices).toEqual([
      { resyncedPaths: ['/A.created'], changedInfoOnlyPaths: [] },
      { resyncedPaths: [], changedInfoOnlyPaths: ['/A.created'] },
    ])
  })

  it('property removal population oracle: retains unrelated composition', async () => {
    const stage = await structuralStage()
    const before = observe(stage, '/A', '/B')

    stage.getRootLayer().getPrimAtPath('/A')!.getProperties().erase('value')
    await stage.flushChanges()
    const after = observe(stage, '/A', '/B')

    expect.soft(stage.definePrim('/A').getPropertyNames()).not.toContain('value')
    expect.soft(after.cache).toBe(before.cache)
    expect.soft(after.layerStack).toBe(before.layerStack)
    // See the property-addition row: prim indexes are retained across
    // property spec changes (cache.cpp:1063-1067, changes.cpp:824-846).
    expect.soft(after.affectedIndex).toBe(before.affectedIndex)
    expect.soft(after.unaffectedIndex).toBe(before.unaffectedIndex)
    expect.soft(after.unaffectedNode).toBe(before.unaffectedNode)
  })

  it('property removal notice oracle: resyncs the removed property path', async () => {
    const stage = await structuralStage()
    const notices = collectNotices(stage)

    stage.getRootLayer().getPrimAtPath('/A')!.getProperties().erase('value')
    await stage.flushChanges()

    // OpenUSD 26.05 live oracle.
    expect(notices).toEqual([{
      resyncedPaths: ['/A.value'], changedInfoOnlyPaths: [],
    }])
  })

  it('inert-spec removal population oracle: retains unrelated composition', async () => {
    const stage = await structuralStage()
    const before = observe(stage, '/Inert', '/B')

    stage.getRootLayer().getRootPrims().erase('Inert')
    await stage.flushChanges()
    const after = observe(stage, '/Inert', '/B')

    expect.soft(stage.getPrim('/Inert')).toBeUndefined()
    expect.soft(after.cache).toBe(before.cache)
    expect.soft(after.layerStack).toBe(before.layerStack)
    expect.soft(after.affectedIndex).toBeDefined()
    expect.soft(after.affectedIndex).not.toBe(before.affectedIndex)
    expect.soft(after.affectedIndex?.hasSpecs()).toBe(false)
    expect.soft(after.unaffectedIndex).toBe(before.unaffectedIndex)
    expect.soft(after.unaffectedNode).toBe(before.unaffectedNode)
  })

  it('inert-spec removal notice oracle: resyncs the removed inert prim', async () => {
    const stage = await structuralStage()
    const notices = collectNotices(stage)

    stage.getRootLayer().getRootPrims().erase('Inert')
    await stage.flushChanges()

    // OpenUSD 26.05 live oracle: ScheduleRemoveIfInert and
    // RemoveInertSceneDescription both report the inert prim path.
    expect(notices).toEqual([{
      resyncedPaths: ['/Inert'], changedInfoOnlyPaths: [],
    }])
  })

  it('active edit population oracle: prunes descendants and retains unrelated population', async () => {
    const stage = await structuralStage()
    const before = observe(stage, '/A', '/B')

    stage.getRootLayer().setField('/A', 'active', false)
    await stage.flushChanges()
    const after = observe(stage, '/A', '/B')

    expect.soft(stage.getPrim('/A')?.isActive).toBe(false)
    expect.soft(stage.getPrim('/A/Child')).toBeUndefined()
    expect.soft(after.cache).toBe(before.cache)
    expect.soft(after.layerStack).toBe(before.layerStack)
    expect.soft(after.affectedIndex).not.toBe(before.affectedIndex)
    expect.soft(after.unaffectedIndex).toBe(before.unaffectedIndex)
    expect.soft(after.unaffectedNode).toBe(before.unaffectedNode)
  })

  it('active edit notice oracle: resyncs the edited prim', async () => {
    const stage = await structuralStage()
    const notices = collectNotices(stage)

    stage.getRootLayer().setField('/A', 'active', false)
    await stage.flushChanges()

    // OpenUSD 26.05 live oracle.
    expect(notices).toEqual([{
      resyncedPaths: ['/A'], changedInfoOnlyPaths: [],
    }])
  })

  it('clip asset replacement oracle: retires the obsolete clip subscription', async () => {
    const resolver = new ArInMemoryResolver({
      'clips.usda': enc(`#usda 1.0
def "Model" (clips = { dictionary default = {
  double2[] active = [(0, 0)]
  asset[] assetPaths = [@clipA.usda@]
  string primPath = "/Clip"
} }) { double value ; }
def Scope "Other" {}
`),
      'clipA.usda': enc("#usda 1.0\ndef \"Clip\" { double value.timeSamples = { 0: 1 } ; }"),
      'clipB.usda': enc("#usda 1.0\ndef \"Clip\" { double value.timeSamples = { 0: 2 } ; }"),
    })
    const stage = (await Stage.open('clips.usda', { resolverContext: _resolverContextForResolver(resolver) }))!
    const notices = collectNotices(stage)
    const root = stage.getRootLayer()
    // Edit a copy: the field value may be shared with the layer.
    const raw = _sdfCloneValue(root.getField('/Model', 'clips')) as {
      default: { assetPaths: string[] }
    }
    raw.default.assetPaths = ['clipB.usda']
    const clipA = stage.getUsedLayers().find(layer => layer.filePath === 'clipA.usda')!
    const before = observe(stage, '/Model', '/Other')

    root.setField('/Model', 'clips', raw)
    await stage.flushChanges()
    const after = observe(stage, '/Model', '/Other')

    expect.soft(stage.get('/Model.value')?.getValueAtTime(0)).toBe(2)
    expect.soft(after.cache).toBe(before.cache)
    expect.soft(after.affectedIndex).toBe(before.affectedIndex)
    expect.soft(after.unaffectedIndex).toBe(before.unaffectedIndex)
    expect.soft(after.layerStack).toBe(before.layerStack)
    const clipB = stage.getUsedLayers().find(layer => layer.filePath === 'clipB.usda')!
    expect.soft(after.subscriptions.has(clipB)).toBe(true)
    expect.soft(after.subscriptions.has(clipA)).toBe(false)
    expect.soft(after.subscriptionIdentifiers).toContain('clipB.usda')
    expect.soft(after.subscriptionIdentifiers).not.toContain('clipA.usda')
    // UsdStage::_ComputePendingChanges routes every clip-related field
    // through recomposeChanges (stage.cpp:4593-4607), including edits within
    // an already-authored clips dictionary.
    expect.soft(notices).toEqual([{
      resyncedPaths: ['/Model'], changedInfoOnlyPaths: [],
    }])

    expect.soft(stage.getUsedLayers().find(
      layer => layer.filePath === 'clipA.usda')).toBeUndefined()

    const retainedModelIndex = after.affectedIndex
    clipA.setField('/Clip.value', 'default', 99)
    await stage.flushChanges()
    expect.soft(observe(stage, '/Model', '/Other').affectedIndex).toBe(retainedModelIndex)
    expect.soft(stage.get('/Model.value')?.getValueAtTime(0)).toBe(2)
  })
})

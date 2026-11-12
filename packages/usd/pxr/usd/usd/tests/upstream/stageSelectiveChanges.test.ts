// Portions ported from OpenUSD 26.11.1, including: pxr/usd/pcp/changes.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _resolverContextForResolver } from 'typescript-usd/usd/_internal'
import { describe, expect, it } from 'vitest'
import { ArInMemoryResolver } from 'typescript-usd/ar/_internal'
import type { Cache as PcpCache } from 'typescript-usd/pcp'
import { Stage } from '../../src/stage.ts'
import { onObjectsChanged, type ObjectsChangedSummary } from '../support/objectsChanged.ts'

const ROOT = `#usda 1.0
def Scope "A" {
  double size = 1
}
def Scope "B" {
  double size = 2
}
`

function cacheOf(stage: Stage): PcpCache {
  return (stage as unknown as { _pcpCache: PcpCache })._pcpCache
}

async function openStage(): Promise<Stage> {
  const resolver = new ArInMemoryResolver({
    'root.usda': new TextEncoder().encode(ROOT),
  })
  return (await Stage.open('root.usda', { resolverContext: _resolverContextForResolver(resolver) }))!
}

describe('UsdStage selective Sdf change processing', () => {
  it('re-materializes values without replacing retained prim indexes', async () => {
    const stage = await openStage()
    const cache = cacheOf(stage)
    const a = cache.findPrimIndex('/A')
    const b = cache.findPrimIndex('/B')
    const notices: string[][] = []
    onObjectsChanged(stage, notice => notices.push(notice.changedInfoOnlyPaths))

    stage.getRootLayer().setField('/A.size', 'default', 7)
    await stage.flushChanges()

    expect(stage.getPrim('/A')?.getAttr('size')?.getValue()).toBe(7)
    expect(cache.findPrimIndex('/A')).toBe(a)
    expect(cache.findPrimIndex('/B')).toBe(b)
    expect(notices).toEqual([['/A.size']])
  })

  it('rebuilds an affected subtree while preserving an unaffected index', async () => {
    const stage = await openStage()
    const cache = cacheOf(stage)
    const a = cache.findPrimIndex('/A')
    const b = cache.findPrimIndex('/B')

    stage.getRootLayer().definePrimSpec('/A/New', 'Scope')
    await stage.flushChanges()

    expect(stage.getPrim('/A/New')).not.toBeUndefined()
    // The first spec for /A/New is significant at that path only; the parent
    // index is untouched (PcpChanges::DidChangeSpecs, changes.cpp:2016-2023 —
    // upstream never invalidates the parent for a child spec change).
    expect(cache.findPrimIndex('/A')).toBe(a)
    expect(cache.findPrimIndex('/B')).toBe(b)
  })

  it('serializes an edit that arrives while an earlier pass is waiting', async () => {
    // typescript-usd: a composition pass that must wait (for a layer load) holds the
    // stage's composition lock; changes arriving meanwhile process after it.
    const stage = await openStage()
    type Pass = (changeListVec: unknown) => Generator<Promise<unknown>, void, unknown>
    const internals = stage as unknown as { _processLayersDidChange: Pass }
    const original = internals._processLayersDidChange.bind(stage)
    let releaseFirst!: () => void
    const firstGate = new Promise<void>(resolve => { releaseFirst = resolve })
    const events: string[] = []
    let calls = 0
    internals._processLayersDidChange = function* (changeListVec) {
      const call = ++calls
      events.push(`start ${call}`)
      if (call === 1) yield firstGate
      yield* original(changeListVec)
      events.push(`end ${call}`)
    }

    const root = stage.getRootLayer()
    root.setField('/A.size', 'default', 7)
    root.setField('/B.size', 'default', 8)
    expect(events).toEqual(['start 1'])
    releaseFirst()
    await stage.flushChanges()

    expect(events).toEqual(['start 1', 'end 1', 'start 2', 'end 2'])
    expect(stage.getPrim('/A')?.getAttr('size')?.getValue()).toBe(7)
    expect(stage.getPrim('/B')?.getAttr('size')?.getValue()).toBe(8)
  })

  it('preserves ValueClip data during targeted rematerialization', async () => {
    const resolver = new ArInMemoryResolver({
      'root.usda': new TextEncoder().encode(`#usda 1.0
def "Model" (
  clips = { dictionary default = {
    double2[] active = [(0, 0)]
    asset[] assetPaths = [@clip.usda@]
    string primPath = "/Clip"
  } }
) { double value ; }
`),
      'clip.usda': new TextEncoder().encode(
        "#usda 1.0\ndef \"Clip\" { double value.timeSamples = { 0: 0, 10: 10 } ; }"),
    })
    const stage = (await Stage.open('root.usda', { resolverContext: _resolverContextForResolver(resolver) }))!
    expect(stage.get('/Model.value')?.getValueAtTime(5)).toBe(5)

    // This is an ordinary property-value edit, so Pcp retains the index and
    // Stage takes the one-prim rematerialization path.
    stage.getRootLayer().setField('/Model.value', 'typeName', 'double')
    await stage.flushChanges()

    expect(stage.get('/Model.value')?.getValueAtTime(5)).toBe(5)
  })
})

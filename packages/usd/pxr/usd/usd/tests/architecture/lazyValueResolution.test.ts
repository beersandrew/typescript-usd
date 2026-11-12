import { _resolverContextForResolver } from 'typescript-usd/usd/_internal'
import { describe, expect, it } from 'vitest'
import { Stage, AttributeQuery as UsdAttributeQuery } from 'typescript-usd/usd'
import { ArInMemoryResolver } from 'typescript-usd/usd/_internal'
import { _setUsdQueryObserver, type UsdQueryEvent } from 'typescript-usd/usd/_internal'
import type { Cache as PcpCache, PrimIndex as PcpPrimIndex } from 'typescript-usd/pcp'
import { onObjectsChanged, type ObjectsChangedSummary } from '../support/objectsChanged.ts'

const enc = (text: string): Uint8Array => new TextEncoder().encode(text)

async function openStage(): Promise<Stage> {
  return (await Stage.open('root.usda', {
    resolverContext: _resolverContextForResolver(new ArInMemoryResolver({
      'root.usda': enc(`#usda 1.0
def Scope "A" {
    double x = 1
    double y = 2
}
def Scope "B" { double z = 3 ; }
`),
    })),
  }))!
}

function observe(stage: Stage): UsdQueryEvent[] {
  const events: UsdQueryEvent[] = []
  _setUsdQueryObserver(stage, event => events.push(event))
  return events
}

describe('lazy Usd value resolution', () => {
  it('population retains property identity without resolved value payloads', async () => {
    const stage = await openStage()
    const events = observe(stage)

    expect(stage.getPrim('/A')?.attrNames).toContain('x')
    expect(events.filter(e => e.kind === 'valueResolution')).toEqual([])
  })

  it('querying one property resolves only that property', async () => {
    const stage = await openStage()
    const events = observe(stage)

    expect(stage.get('/A.x')?.getValue()).toBe(1)
    expect(events.filter(e => e.kind === 'valueResolution')).toEqual([
      { kind: 'valueResolution', path: '/A.x' },
    ])
  })

  it('a value edit preserves cache, prim-index, namespace, and unrelated property identity', async () => {
    const stage = await openStage()
    const internal = stage as unknown as {
      _pcpCache: PcpCache
      _primMap: ReadonlyMap<string, object>
    }
    const cache = internal._pcpCache
    const index = stage.getPrimIndex('/A') as PcpPrimIndex
    const primData = internal._primMap.get('/A')

    stage.getRootLayer().setField('/A.x', 'default', 10)
    await stage.flushChanges()

    expect(internal._pcpCache).toBe(cache)
    expect(stage.getPrimIndex('/A')).toBe(index)
    expect(internal._primMap.get('/A')).toBe(primData)
    expect(stage.get('/A.x')?.getValue()).toBe(10)
  })

  it('flattening deliberately resolves every included property', async () => {
    const stage = await openStage()
    const events = observe(stage)

    stage.flatten()

    const resolved = events
      .filter(e => e.kind === 'valueResolution')
      .map(e => e.path)
    expect(resolved).toContain('/A.x')
    expect(resolved).toContain('/A.y')
    expect(resolved).toContain('/B.z')
  })

  it('time-sample and authored-value enumeration stay property-local', async () => {
    const stage = await openStage()
    const events = observe(stage)

    stage.get('/A.x')?.getTimeSampleKeys()
    stage.get('/A.x')?.hasAuthoredValue()

    expect(events.map(event => event.path)).toEqual(['/A.x', '/A.x'])
  })

  it('AttributeQuery caches proximal source facts for unchanged repeated reads', async () => {
    const stage = await openStage()
    const events = observe(stage)
    const query = new UsdAttributeQuery(stage.get('/A.x'))

    expect(query.get(0)).toBe(1)
    expect(query.get(0)).toBe(1)
    expect(events).toEqual([{ kind: 'valueResolution', path: '/A.x' }])
  })

  it('muting maps affected specs without resolving any property values', async () => {
    const stage = (await Stage.open('root.usda', {
      resolverContext: _resolverContextForResolver(new ArInMemoryResolver({
        'root.usda': enc(`#usda 1.0
(subLayers = [@strong.usda@, @weak.usda@])
def Scope "A" { double y = 2 ; }
def Scope "B" { double z = 3 ; }`),
        'strong.usda': enc(`#usda 1.0
over "A" { double x = 10 ; }`),
        'weak.usda': enc(`#usda 1.0
over "A" { double x = 5 ; }`),
      })),
    }))!
    const events = observe(stage)
    const notices: Array<{ resyncedPaths: string[]; changedInfoOnlyPaths: string[] }> = []
    onObjectsChanged(stage, notice => notices.push(notice))

    await stage.muteLayer('strong.usda')

    // OpenUSD v26.08 oracle: the muted property spec resyncs, its inert prim
    // spec is an info-only change.
    expect(events).toEqual([])
    expect(notices.at(-1)?.resyncedPaths).toEqual(['/A.x'])
    expect(notices.at(-1)?.changedInfoOnlyPaths).toEqual(['/A'])
    expect(stage.get('/A.x')?.getValue()).toBe(5)
    expect(events).toEqual([{ kind: 'valueResolution', path: '/A.x' }])

    events.length = 0
    await stage.unmuteLayer('strong.usda')
    expect(events).toEqual([])
    expect(notices.at(-1)?.resyncedPaths).toEqual(['/A.x'])
    expect(notices.at(-1)?.changedInfoOnlyPaths).toEqual(['/A'])
    expect(stage.get('/A.x')?.getValue()).toBe(10)
  })
})

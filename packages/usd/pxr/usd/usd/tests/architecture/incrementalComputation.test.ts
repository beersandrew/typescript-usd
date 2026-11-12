import { _resolverContextForResolver } from 'typescript-usd/usd/_internal'
import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { ArInMemoryResolver } from 'typescript-usd/usd/_internal'
import type { Cache as PcpCache, ComputationEventKind as PcpComputationEventKind } from 'typescript-usd/pcp'

const enc = (text: string): Uint8Array => new TextEncoder().encode(text)
type Event = { kind: PcpComputationEventKind; path: string }

async function twoBranchStage(): Promise<Stage> {
  return (await Stage.open('root.usda', {
    resolverContext: _resolverContextForResolver(new ArInMemoryResolver({
      'root.usda': enc(`#usda 1.0
def Scope "A" { double value = 1 ; }
def Scope "B" { double value = 2 ; }
`),
    })),
  }))!
}

function observeComputation(stage: Stage): Event[] {
  const events: Event[] = []
  const cache = (stage as unknown as { _pcpCache: PcpCache })._pcpCache
  cache.setComputationObserver((kind, path) => events.push({ kind, path }))
  return events
}

async function addUnderA(stage: Stage): Promise<void> {
  stage.getRootLayer().definePrimSpec('/A/New', 'Scope')
  await stage.flushChanges()
  expect(stage.getPrim('/A/New')).toBeDefined()
}

const pathsFor = (events: readonly Event[], kind: PcpComputationEventKind): string[] =>
  events.filter(event => event.kind === kind).map(event => event.path)

describe('incremental computation safety rails', () => {
  it('does not request an unaffected prim index for a structural /A edit', async () => {
    const stage = await twoBranchStage()
    const events = observeComputation(stage)
    await addUnderA(stage)

    expect(pathsFor(events, 'primIndexCompute')).not.toContain('/B')
    // Intentional red until _recomposeSubtrees stops full namespace discovery.
    expect(pathsFor(events, 'primIndexRequest')).not.toContain('/B')
  })

  it('does not walk unaffected namespace during a structural /A edit', async () => {
    const stage = await twoBranchStage()
    const events = observeComputation(stage)
    await addUnderA(stage)

    // Intentional red: current discoverStageNamespace starts again at '/'.
    expect(pathsFor(events, 'namespaceDiscovery')).not.toContain('/B')
  })

  it('does not materialize an unaffected prim during a structural /A edit', async () => {
    const stage = await twoBranchStage()
    const events = observeComputation(stage)
    await addUnderA(stage)

    // Intentional red: current _recomposeSubtrees materializes the whole stage.
    expect(pathsFor(events, 'materialization')).not.toContain('/B')
  })

  it('does not rebuild unaffected Usd dependency state during a structural /A edit', async () => {
    const stage = await twoBranchStage()
    const events = observeComputation(stage)
    await addUnderA(stage)

    // Intentional red: clip/dependency preparation still scans every prim.
    expect(pathsFor(events, 'usdDependencyResolution')).not.toContain('/B')
  })

  it('keeps a deliberate full-stage fallback for global layer-stack changes', async () => {
    const stage = await twoBranchStage()
    const events = observeComputation(stage)
    stage.getRootLayer().setField('/', 'timeCodesPerSecond', 48)
    await stage.flushChanges()

    expect(pathsFor(events, 'namespaceDiscovery')).toContain('/B')
    expect(pathsFor(events, 'materialization')).toContain('/B')
  })

  it('does not visit an unrelated payload branch while loading /Foo', async () => {
    const stage = (await Stage.open('payloadRoot.usda', {
      loadPayloads: false,
      resolverContext: _resolverContextForResolver(new ArInMemoryResolver({
        'payloadRoot.usda': enc(`#usda 1.0
def Scope "Foo" (payload = @foo.usda@</Foo>) {}
def Scope "Sad" (payload = @sad.usda@</Sad>) {}
`),
        'foo.usda': enc("#usda 1.0\ndef Scope \"Foo\" { def Scope \"Child\" {} \n}"),
        'sad.usda': enc("#usda 1.0\ndef Scope \"Sad\" { def Scope \"Panda\" {} \n}"),
      })),
    }))!
    const events = observeComputation(stage)
    await stage.load('/Foo')
    expect(stage.getPrim('/Foo/Child')).toBeDefined()
    expect(stage.getPrim('/Sad/Panda')).toBeUndefined()

    // Intentional red until payload recomposition discovers only /Foo.
    expect(pathsFor(events, 'namespaceDiscovery')).not.toContain('/Sad')
  })
})

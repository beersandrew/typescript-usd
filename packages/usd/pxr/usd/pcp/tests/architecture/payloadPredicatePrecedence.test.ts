// Ported from OpenUSD 26.11.1: pxr/usd/pcp/cache.cpp,
//  pxr/usd/pcp/primIndex.cpp, pxr/usd/usd/stage.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Payload predicate precedence: the client predicate — not the retained
// included-payload set — decides every payload evaluation.
//
// Upstream contract: when PcpPrimIndexInputs carries an
// includePayloadPredicate, that predicate ALONE decides whether the payload
// composes (pxr/usd/pcp/primIndex.cpp:2645-2661), and the cache then syncs
// _includedPayloads bidirectionally to the indexing output — insert on
// IncludedByPredicate, ERASE on ExcludedByPredicate (serial path
// pxr/usd/pcp/cache.cpp:1777-1782; parallel path cache.cpp:1507-1516). That
// erase is what lets UsdStage::SetLoadRules (pxr/usd/usd/stage.cpp:2726-2741)
// merely mark </> significant and recompose — no RequestPayloads call — with
// GetLoadSet ending up correct because recomposition itself evicts newly
// excluded paths from the retained set.
//
// Live 26.05 capture (UsdStage over root.usda with /WithPayload carrying a
// payload to /Model, since python Pcp.Cache.ComputePrimIndex takes no payload
// predicate — the predicate is C++-only, supplied by UsdStage):
//   Open(LoadAll):  GetLoadSet ['/WithPayload'], payload arc present,
//                   /WithPayload/Inner exists
//   Unload('/WithPayload') or SetLoadRules(LoadNone):
//                   GetLoadSet [], payload arc GONE, Inner gone
//   Open(LoadNone) then Load('/WithPayload'): the mirror image.
//
// History: typescript-usd originally inverted this precedence (the retained set won
// and was never erased, with Stage.setLoadRules compensating via an invented
// exclude-everything request) — the pcp-payload-predicate-sync debt, retired
// when src/cache.ts adopted the predicate-decides + bidirectional-sync
// contract. This suite gates that contract at the Pcp surface directly,
// mirroring what upstream SetLoadRules sends the cache: a significant
// change only.

import { describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import { SdfPath } from 'typescript-usd/sdf/path'
import {
  Cache as PcpCache, Changes as PcpChanges, LayerOpener as PcpLayerOpener, PrimIndex as PcpPrimIndex,
} from '../../src/index.ts'

const enc = (text: string) => new TextEncoder().encode(text)

function openerOver(layers: readonly Layer[]): PcpLayerOpener {
  const byPath = new Map(layers.map(layer => [layer.filePath, layer]))
  return async filePath => byPath.get(filePath) ?? null
}

function primStack(index: PcpPrimIndex): Array<[Layer, string]> {
  return index.composePrimStack().map(entry =>
    [entry.layer as Layer, entry.path.pathString])
}

// One payload-bearing prim, predicate backed by a mutable rule set — the
// UsdStage load-rules binding in miniature (upstream stage.cpp binds the
// predicate to _loadRules for every prim-index computation).
async function makeScene(rules: Set<string>): Promise<{
  cache: PcpCache
  rootLayer: Layer
  payloadLayer: Layer
}> {
  const payloadLayer = Layer.fromBytes(enc(`#usda 1.0
def "Model" {
    def "Inner" {}
}
`), 'predicatePrecedence-payload.usda')
  const rootLayer = Layer.fromBytes(enc(`#usda 1.0
def "WithPayload" (
    prepend payload = @predicatePrecedence-payload.usda@</Model>
)
{
}
`), 'predicatePrecedence-root.usda')
  const cache = await PcpCache.create(
    rootLayer, openerOver([rootLayer, payloadLayer]), undefined,
    path => rules.has(path))
  return { cache, rootLayer, payloadLayer }
}

// The upstream SetLoadRules recomposition: mark </> significant, apply, and
// recompute — deliberately NO requestPayloads (stage.cpp:2726-2741 issues
// none; predicate re-evaluation alone must reconcile the retained set).
async function recomposeAll(cache: PcpCache): Promise<void> {
  const changes = new PcpChanges()
  changes.didChangeSignificantly(cache, SdfPath.absoluteRootPath)
  await changes.apply()
}

describe('PcpCache payload predicate precedence', () => {
  it('control: a predicate flipped to true includes on recompute', async () => {
    // Direction B of the capture: Open(LoadNone) then Load('/WithPayload').
    const rules = new Set<string>()
    const { cache, rootLayer, payloadLayer } = await makeScene(rules)

    const before = await cache.computePrimIndex('/WithPayload')
    expect(before.localErrors).toEqual([])
    expect(primStack(before)).toEqual([[rootLayer, '/WithPayload']])
    expect(cache.getIncludedPayloadPaths()).toEqual([])
    expect(before.hasAnyPayloads()).toBe(true)

    rules.add('/WithPayload')
    await recomposeAll(cache)

    // Native: GetLoadSet ['/WithPayload'], payload arc present, Inner exists.
    const after = await cache.computePrimIndex('/WithPayload')
    expect(after.localErrors).toEqual([])
    expect(primStack(after)).toEqual([
      [rootLayer, '/WithPayload'], [payloadLayer, '/Model'],
    ])
    expect(cache.getIncludedPayloadPaths()).toEqual(['/WithPayload'])
    const inner = await cache.computePrimIndex('/WithPayload/Inner')
    expect(primStack(inner)).toEqual([[payloadLayer, '/Model/Inner']])
  })

  it('a predicate flipped to false excludes the payload on recompute', async () => {
    // Direction A of the capture: Open(LoadAll) then Unload('/WithPayload').
    const rules = new Set(['/WithPayload'])
    const { cache, rootLayer, payloadLayer } = await makeScene(rules)

    const before = await cache.computePrimIndex('/WithPayload')
    expect(before.localErrors).toEqual([])
    expect(primStack(before)).toEqual([
      [rootLayer, '/WithPayload'], [payloadLayer, '/Model'],
    ])
    expect(cache.getIncludedPayloadPaths()).toEqual(['/WithPayload'])

    rules.delete('/WithPayload')
    await recomposeAll(cache)

    // Native: the predicate alone decides the re-evaluation
    // (primIndex.cpp:2645-2661) — the payload arc is gone and the payload's
    // content prims no longer compose (capture: inner exists = False).
    const after = await cache.computePrimIndex('/WithPayload')
    expect(after.localErrors).toEqual([])
    expect(primStack(after)).toEqual([[rootLayer, '/WithPayload']])
    const inner = await cache.computePrimIndex('/WithPayload/Inner')
    expect(primStack(inner)).toEqual([])
  })

  it('excluding via the predicate erases the retained inclusion entry', async () => {
    // The cache.cpp:1777-1782 half of the contract: ExcludedByPredicate
    // ERASES the path from _includedPayloads, so GetIncludedPayloads (the
    // stage's GetLoadSet) reports [] after the flip — capture direction A.
    const rules = new Set(['/WithPayload'])
    const { cache } = await makeScene(rules)

    await cache.computePrimIndex('/WithPayload')
    expect(cache.getIncludedPayloadPaths()).toEqual(['/WithPayload'])

    rules.delete('/WithPayload')
    await recomposeAll(cache)
    await cache.computePrimIndex('/WithPayload')

    expect(cache.getIncludedPayloadPaths()).toEqual([])
  })
})

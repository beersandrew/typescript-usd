// Ported from OpenUSD 26.11.1: pxr/usd/pcp/changes.cpp,
//  pxr/usd/pcp/layerStack.cpp, pxr/usd/pcp/testenv/testPcpChanges.py
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usd/pcp/testenv/testPcpChanges.py test_TcpsChanges (:381),
// driven through real typescript-usd/sdf layers so the Sdf change records are the ones
// production composition sees. The fixture mirrors
// testPcpChanges.testenv/TestSublayerOffsetChanges: a root layer whose
// SUBLAYER (offset = 100) holds /A referencing ref.usda, whose SUBLAYER
// (offset = 50) holds /A referencing ref2.usda — so the two reference nodes
// carry mapToRoot time offsets of 100 and 150.
//
// This is a representative contiguous slice of the upstream suite: the first
// two blocks of _RunTcpsChangesForLayer (:322-336) — the authored-tcps table
// and the authored-fps table — run 1:1 against the root layer and the first
// reference layer. The remaining blocks (fps/tcps interaction, simultaneous
// change-block edits, sublayer and session-layer suites, :338-379 and
// :459-574) exercise the same mechanisms and are omitted for size.
//
// Expected values were re-captured on the live 26.05 reference build with
// Pcp.Cache(Pcp.LayerStackIdentifier(root, session), usd=True): the python
// testenv runs a legacy (non-USD) cache. The USD-mode truth table matches the
// legacy-mode table in every row of this suite (significance, computed TCPS,
// and both node offsets), so the testenv's expectations stand as captured.
// Upstream computes each layer's *computed* TCPS (authored TCPS, else
// authored FPS, else the schema fallback 24 — Pcp_EntryRequiresLayerStack-
// OffsetsChange, pxr/usd/pcp/changes.cpp:195-260): a change to the computed
// TCPS is SIGNIFICANT at every dependent prim-index path (changes.cpp:
// 1134-1152 via Pcp_NeedToRecomputeLayerStackTimeCodesPerSecond,
// layerStack.cpp:1036-1061) and rescales the layer-stack and reference
// offsets (layerStack.cpp:1549-1607, 1808), while a change that leaves the
// computed TCPS unchanged (24 -> authored 24, clearing an unauthored field)
// is NOT significant and retains every prim index.
//
import { describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import {
  ArcType as PcpArcType, Cache as PcpCache, LayerOpener as PcpLayerOpener, type SdfLayerOffset,
  _TestChangeProcessor as PcpTestChangeProcessor,
} from '../../src/index.ts'

const enc = (text: string) => new TextEncoder().encode(text)

function openerOver(layers: readonly Layer[]): PcpLayerOpener {
  const byPath = new Map(layers.map(layer => [layer.filePath, layer]))
  return async filePath => byPath.get(filePath) ?? null
}

interface TcpsFixture {
  cache: PcpCache
  layers: readonly Layer[]
  rootLayer: Layer
  rootSublayer: Layer
  refLayer: Layer
  refSublayer: Layer
  ref2Layer: Layer
  sessionLayer: Layer
}

// TestSublayerOffsetChanges: the reference arcs live in the SUBLAYERS of the
// root and ref layers, so the sublayer offsets (100 and 50) become the
// reference nodes' time offsets (100 and 100+50=150 at the root).
async function makeFixture(): Promise<TcpsFixture> {
  const rootLayer = Layer.fromBytes(enc(`#usda 1.0
(
    subLayers = [
        @tcpsChanges-root-sublayer.usda@ (offset = 100)
    ]
)
`), 'tcpsChanges-root.usda')
  const rootSublayer = Layer.fromBytes(enc(`#usda 1.0
def "A" (
    references = @tcpsChanges-ref.usda@</A>
)
{
}
`), 'tcpsChanges-root-sublayer.usda')
  const refLayer = Layer.fromBytes(enc(`#usda 1.0
(
    subLayers = [
        @tcpsChanges-ref-sublayer.usda@ (offset = 50)
    ]
)
`), 'tcpsChanges-ref.usda')
  const refSublayer = Layer.fromBytes(enc(`#usda 1.0
def "A" (
    references = @tcpsChanges-ref2.usda@</A>
)
{
}
`), 'tcpsChanges-ref-sublayer.usda')
  const ref2Layer = Layer.fromBytes(enc(`#usda 1.0
def "A"
{
}
`), 'tcpsChanges-ref2.usda')
  const sessionLayer = Layer.createAnonymous('tcpsChanges-session')
  const layers = [rootLayer, rootSublayer, refLayer, refSublayer, ref2Layer, sessionLayer]
  const cache = await PcpCache.create(rootLayer, openerOver(layers), sessionLayer)
  const index = await cache.computePrimIndex('/A')
  expect(index.localErrors).toEqual([])
  return {
    cache, layers, rootLayer, rootSublayer, refLayer, refSublayer, ref2Layer,
    sessionLayer,
  }
}

// One row of the upstream _ChangeAndVerify truth table, observed through the
// TS pipeline (the Pcp._TestChangeProcessor analog of changesInertSpecs):
// record Sdf change notices, run classify -> didChange -> apply, then report
// what upstream asserts per row — the significant-change paths, whether the
// retained /A prim index survived, and the recomputed reference-node offsets.
interface StepResult {
  significant: string[]
  indexRetained: boolean
  refOffset: SdfLayerOffset
  ref2Offset: SdfLayerOffset
}

async function changeAndVerify(
  fixture: TcpsFixture,
  layer: Layer,
  newValues: { tcps?: number | null; fps?: number | null },
): Promise<StepResult> {
  const { cache } = fixture
  const cp = new PcpTestChangeProcessor(cache).enter()
  if (newValues.tcps !== undefined) {
    if (newValues.tcps === null) layer.eraseField('/', 'timeCodesPerSecond')
    else layer.setField('/', 'timeCodesPerSecond', newValues.tcps)
  }
  if (newValues.fps !== undefined) {
    if (newValues.fps === null) layer.eraseField('/', 'framesPerSecond')
    else layer.setField('/', 'framesPerSecond', newValues.fps)
  }
  await cp.process()
  const significant = cp.getSignificantChanges()
  await cp.exit()
  const indexRetained = cache.findPrimIndex('/A') !== undefined

  const index = await cache.computePrimIndex('/A')
  expect(index.localErrors).toEqual([])
  const refNode = index.rootNode.children[0]!
  const ref2Node = refNode.children[0]!
  return {
    significant, indexRetained,
    refOffset: refNode.mapToRoot.evaluate().getTimeOffset(),
    ref2Offset: ref2Node.mapToRoot.evaluate().getTimeOffset(),
  }
}

const off = (offset: number, scale: number): SdfLayerOffset => ({ offset, scale })

// One authored-value block of _RunTcpsChangesForLayer, asserted row by row
// against the USD-mode capture. expect.soft: a divergent row must not mask
// the rows after it (the block is one stateful sequence, exactly upstream's).
type Row = [
  newValues: { tcps?: number | null; fps?: number | null },
  expected: StepResult,
]

async function runBlock(fixture: TcpsFixture, layer: Layer, rows: readonly Row[]): Promise<void> {
  // Upstream: each block starts with neither field authored
  // (testPcpChanges.py:320-321, :330-331).
  expect(layer.getField('/', 'timeCodesPerSecond')).toBeUndefined()
  expect(layer.getField('/', 'framesPerSecond')).toBeUndefined()
  for (const [newValues, expected] of rows) {
    expect.soft(await changeAndVerify(fixture, layer, newValues))
      .toEqual(expected)
  }
}

describe('testPcpChanges (test_TcpsChanges)', () => {
  it('fixture: a chain of two references with offsets 100 and 150', async () => {
    const fixture = await makeFixture()
    const index = await fixture.cache.computePrimIndex('/A')

    // testPcpChanges.py:407-427 — root stack is [session, root, root-sublayer]
    // with no authored TCPS/FPS anywhere.
    expect(index.rootNode.layerStack.layers.map(entry => entry.layer))
      .toEqual([fixture.sessionLayer, fixture.rootLayer, fixture.rootSublayer])

    const refNode = index.rootNode.children[0]!
    expect(refNode.arcType).toBe(PcpArcType.Reference)
    expect(refNode.layerStack.layers.map(entry => entry.layer))
      .toEqual([fixture.refLayer, fixture.refSublayer])
    expect(refNode.mapToRoot.evaluate().getTimeOffset()).toEqual(off(100, 1))

    const ref2Node = refNode.children[0]!
    expect(ref2Node.arcType).toBe(PcpArcType.Reference)
    expect(ref2Node.layerStack.layers.map(entry => entry.layer))
      .toEqual([fixture.ref2Layer])
    expect(ref2Node.mapToRoot.evaluate().getTimeOffset()).toEqual(off(150, 1))
  })

  // testPcpChanges.py:318-326 with tcpsToOffsets at :430-437. Authoring 24
  // (the fallback) or clearing an unauthored value leaves the computed TCPS
  // at 24: insignificant, index retained. Any other value is significant at
  // '/' and rescales BOTH reference offsets by newTcps/24.
  it('root layer: authored timeCodesPerSecond truth table', async () => {
    const fixture = await makeFixture()
    await runBlock(fixture, fixture.rootLayer, [
      [{ tcps: 24 }, { significant: [], indexRetained: true, refOffset: off(100, 1), ref2Offset: off(150, 1) }],
      [{ tcps: null }, { significant: [], indexRetained: true, refOffset: off(100, 1), ref2Offset: off(150, 1) }],
      [{ tcps: 48 }, { significant: ['/'], indexRetained: false, refOffset: off(100, 2), ref2Offset: off(200, 2) }],
      [{ tcps: 12 }, { significant: ['/'], indexRetained: false, refOffset: off(100, 0.5), ref2Offset: off(125, 0.5) }],
      [{ tcps: null }, { significant: ['/'], indexRetained: false, refOffset: off(100, 1), ref2Offset: off(150, 1) }],
    ])
  })

  // testPcpChanges.py:328-336. With TCPS unauthored, framesPerSecond IS the
  // computed TCPS (changes.cpp:205-208): the same table as authored TCPS.
  it('root layer: authored framesPerSecond truth table', async () => {
    const fixture = await makeFixture()
    await runBlock(fixture, fixture.rootLayer, [
      [{ fps: 24 }, { significant: [], indexRetained: true, refOffset: off(100, 1), ref2Offset: off(150, 1) }],
      [{ fps: null }, { significant: [], indexRetained: true, refOffset: off(100, 1), ref2Offset: off(150, 1) }],
      [{ fps: 48 }, { significant: ['/'], indexRetained: false, refOffset: off(100, 2), ref2Offset: off(200, 2) }],
      [{ fps: 12 }, { significant: ['/'], indexRetained: false, refOffset: off(100, 0.5), ref2Offset: off(125, 0.5) }],
      [{ fps: null }, { significant: ['/'], indexRetained: false, refOffset: off(100, 1), ref2Offset: off(150, 1) }],
    ])
  })

  // testPcpChanges.py:318-326 with tcpsToOffsets at :440-447. A TCPS change
  // on the REFERENCED layer stack is significant at the dependent prim path
  // '/A' and counter-scales only the ref node (the ref2 offset stays 150·id
  // in root time: its own stack is unchanged).
  it('ref layer: authored timeCodesPerSecond truth table', async () => {
    const fixture = await makeFixture()
    await runBlock(fixture, fixture.refLayer, [
      [{ tcps: 24 }, { significant: [], indexRetained: true, refOffset: off(100, 1), ref2Offset: off(150, 1) }],
      [{ tcps: null }, { significant: [], indexRetained: true, refOffset: off(100, 1), ref2Offset: off(150, 1) }],
      [{ tcps: 48 }, { significant: ['/A'], indexRetained: false, refOffset: off(100, 0.5), ref2Offset: off(125, 1) }],
      [{ tcps: 12 }, { significant: ['/A'], indexRetained: false, refOffset: off(100, 2), ref2Offset: off(200, 1) }],
      [{ tcps: null }, { significant: ['/A'], indexRetained: false, refOffset: off(100, 1), ref2Offset: off(150, 1) }],
    ])
  })

  // testPcpChanges.py:328-336 against the reference layer.
  it('ref layer: authored framesPerSecond truth table', async () => {
    const fixture = await makeFixture()
    await runBlock(fixture, fixture.refLayer, [
      [{ fps: 24 }, { significant: [], indexRetained: true, refOffset: off(100, 1), ref2Offset: off(150, 1) }],
      [{ fps: null }, { significant: [], indexRetained: true, refOffset: off(100, 1), ref2Offset: off(150, 1) }],
      [{ fps: 48 }, { significant: ['/A'], indexRetained: false, refOffset: off(100, 0.5), ref2Offset: off(125, 1) }],
      [{ fps: 12 }, { significant: ['/A'], indexRetained: false, refOffset: off(100, 2), ref2Offset: off(200, 1) }],
      [{ fps: null }, { significant: ['/A'], indexRetained: false, refOffset: off(100, 1), ref2Offset: off(150, 1) }],
    ])
  })
})

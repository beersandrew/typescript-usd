// Ported from OpenUSD 26.11.1: pxr/usd/pcp/cache.cpp, pxr/usd/pcp/changes.cpp,
//  pxr/usd/pcp/testenv/testPcpChanges.py
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usd/pcp/testenv/testPcpChanges.py test_InertPrimChanges (:918),
// test_InertPrimRemovalChanges (:957), and test_ChangesToCulledAncestralNodes
// (:1010), driven through real typescript-usd/sdf layers so the Sdf change records are
// the ones production composition sees. Two additional scenarios beyond the
// testenv — retain-and-rescan on inert addition, and last-contributing-spec
// removal — carry their own "Live 26.05 capture:" citations; upstream
// implements them in PcpChanges::DidChangeSpecs (changes.cpp:1921-2028) and
// PcpCache::Apply's rescan/discard pass (cache.cpp:1042-1073).
//
// Expected values were re-captured on the live 26.05 reference build with
// Pcp.Cache(..., usd=True): the python testenv runs a legacy (non-USD) cache,
// and USD caches skip property spec entries in change processing
// (pxr/usd/pcp/changes.cpp:824-846), so the subtree-removal spec-change set
// here is ['/Parent', '/Parent/Child'] — without '/Parent/Child.attr' — and
// the testenv's ComputePropertyIndex assertions do not apply (USD-mode
// PcpCache refuses cached property indexes, pxr/usd/pcp/cache.cpp:1833).
// The culled-ancestral-nodes USD-mode capture matches the legacy testenv
// values exactly (significant, spec, AND prim changes).
//
// These tests gate the spec/index lifecycle mechanism: inert/non-inert Sdf
// change records, first-spec/last-spec significance escalation
// (changes.cpp:1921-2028), didChangePrims culled-node revival
// (changes.cpp:2006-2014), and retain-and-rescan of affected indexes
// (cache.cpp:1042-1073).

import { describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import {
  Cache as PcpCache, LayerOpener as PcpLayerOpener, PrimIndex as PcpPrimIndex,
  _TestChangeProcessor as PcpTestChangeProcessor,
} from '../../src/index.ts'

const enc = (text: string) => new TextEncoder().encode(text)

function openerOver(layers: readonly Layer[]): PcpLayerOpener {
  const byPath = new Map(layers.map(layer => [layer.filePath, layer]))
  return async filePath => byPath.get(filePath) ?? null
}

// `with Pcp._TestChangeProcessor(cache) as cp:` around one edit.
async function processChanges(
  cache: PcpCache,
  _layers: readonly Layer[],
  mutate: () => void,
): Promise<{ significant: string[]; specs: string[]; prims: string[] }> {
  const cp = new PcpTestChangeProcessor(cache).enter()
  mutate()
  await cp.process()
  const summary = {
    significant: cp.getSignificantChanges(),
    specs: cp.getSpecChanges(),
    prims: cp.getPrimChanges(),
  }
  await cp.exit()
  return summary
}

function primStack(index: PcpPrimIndex): Array<[Layer, string]> {
  return index.composePrimStack().map(entry =>
    [entry.layer as Layer, entry.path.pathString])
}

describe('testPcpChanges (inert prim specs)', () => {
  it('test_InertPrimChanges: classifies inert spec additions', async () => {
    const refLayer = Layer.fromBytes(enc(`#usda 1.0
def "Parent" {
    def "Child" {}
}
`), 'inertChanges-ref.usda')
    const rootLayer = Layer.fromBytes(enc(`#usda 1.0
over "Parent" (
    prepend references = @inertChanges-ref.usda@</Parent>
)
{
}
`), 'inertChanges-root.usda')
    const layers = [rootLayer, refLayer]
    const cache = await PcpCache.create(rootLayer, openerOver(layers))

    // Adding an empty over to a prim that already exists (has specs)
    // is an insignificant change. (testPcpChanges.py:930-937)
    const existing = await cache.computePrimIndex('/Parent/Child')
    expect(existing.localErrors).toEqual([])
    expect(await processChanges(cache, layers, () => {
      rootLayer.definePrimSpec('/Parent/Child', undefined, 'over')
    })).toEqual({ significant: [], specs: ['/Parent/Child'], prims: [] })

    // Adding an empty over as the first spec for a prim is a significant
    // change, even if we haven't computed a prim index for that path yet.
    // (testPcpChanges.py:939-946)
    expect(await processChanges(cache, layers, () => {
      rootLayer.definePrimSpec('/Parent/NewChild', undefined, 'over')
    })).toEqual({ significant: ['/Parent/NewChild'], specs: [], prims: [] })

    // ...and likewise when a (valid, empty) prim index has been computed
    // for that path. (testPcpChanges.py:948-955)
    const empty = await cache.computePrimIndex('/Parent/NewChild2')
    expect(empty.localErrors).toEqual([])
    expect(await processChanges(cache, layers, () => {
      rootLayer.definePrimSpec('/Parent/NewChild2', undefined, 'over')
    })).toEqual({ significant: ['/Parent/NewChild2'], specs: [], prims: [] })
  })

  it('test_InertPrimRemovalChanges: rescans retained indexes on subtree removal', async () => {
    const subLayer = Layer.fromBytes(enc(`#usda 1.0
def "Parent" {
    def "Child" {
        double attr = 1.0
    }
}
`), 'inertRemoval-sub.usda')
    const rootLayer = Layer.fromBytes(enc(`#usda 1.0
(
    subLayers = [@inertRemoval-sub.usda@]
)
over "Parent" {
    over "Child" {
        double attr
    }
}
`), 'inertRemoval-root.usda')
    const layers = [rootLayer, subLayer]
    const cache = await PcpCache.create(rootLayer, openerOver(layers))

    const parent = await cache.computePrimIndex('/Parent')
    expect(parent.localErrors).toEqual([])
    expect(primStack(parent)).toEqual([
      [rootLayer, '/Parent'], [subLayer, '/Parent'],
    ])
    const child = await cache.computePrimIndex('/Parent/Child')
    expect(child.localErrors).toEqual([])
    expect(primStack(child)).toEqual([
      [rootLayer, '/Parent/Child'], [subLayer, '/Parent/Child'],
    ])

    // Removing the root layer's inert over subtree reports a spec change for
    // EVERY affected composed path — not just the deleted root — and is not
    // significant. (testPcpChanges.py:985-996; USD-mode capture omits the
    // property path per changes.cpp:824-846.)
    expect(await processChanges(cache, layers, () => {
      rootLayer.getRootPrims().erase('Parent')
    })).toEqual({ significant: [], specs: ['/Parent', '/Parent/Child'], prims: [] })

    // Live 26.05 capture: both indexes survive change processing with exact
    // identity (upstream rescans affected spec stacks in place and discards
    // an index only when no specs remain, pxr/usd/pcp/cache.cpp:1042-1073)
    // and their rescanned stacks no longer carry the deleted root specs.
    expect(cache.findPrimIndex('/Parent')).toBe(parent)
    expect(cache.findPrimIndex('/Parent/Child')).toBe(child)
    const parentAfter = await cache.computePrimIndex('/Parent')
    expect(parentAfter.localErrors).toEqual([])
    expect(primStack(parentAfter)).toEqual([[subLayer, '/Parent']])
    const childAfter = await cache.computePrimIndex('/Parent/Child')
    expect(childAfter.localErrors).toEqual([])
    expect(primStack(childAfter)).toEqual([[subLayer, '/Parent/Child']])
  })

  it('retains and rescans the index across an inert spec addition', async () => {
    const refLayer = Layer.fromBytes(enc(`#usda 1.0
def "Parent" {
    def "Child" {}
}
`), 'inertRetain-ref.usda')
    const rootLayer = Layer.fromBytes(enc(`#usda 1.0
over "Parent" (
    prepend references = @inertRetain-ref.usda@</Parent>
)
{
}
`), 'inertRetain-root.usda')
    const layers = [rootLayer, refLayer]
    const cache = await PcpCache.create(rootLayer, openerOver(layers))

    const before = await cache.computePrimIndex('/Parent/Child')
    expect(before.localErrors).toEqual([])
    expect(primStack(before)).toEqual([[refLayer, '/Parent/Child']])

    expect(await processChanges(cache, layers, () => {
      rootLayer.definePrimSpec('/Parent/Child', undefined, 'over')
    })).toEqual({ significant: [], specs: ['/Parent/Child'], prims: [] })

    // Live 26.05 capture: an insignificant spec change RETAINS the computed
    // index — upstream rescans its spec stack in place (Pcp_RescanForSpecs
    // via PcpCache::Apply, cache.cpp:1042-1073) rather than ejecting it —
    // and the rescanned stack picks up the added root-layer over. Exact
    // object identity: rescan mutates in place, never replaces.
    expect(cache.findPrimIndex('/Parent/Child')).toBe(before)
    const after = await cache.computePrimIndex('/Parent/Child')
    expect(after.localErrors).toEqual([])
    expect(primStack(after)).toEqual([
      [rootLayer, '/Parent/Child'], [refLayer, '/Parent/Child'],
    ])
  })

  it('escalates removal of the last contributing specs to significant', async () => {
    const rootLayer = Layer.fromBytes(enc(`#usda 1.0
def Scope "Solo" {
    def Scope "Child" {}
}
def Scope "Other" {}
`), 'lastSpec-root.usda')
    const layers = [rootLayer]
    const cache = await PcpCache.create(rootLayer, openerOver(layers))

    for (const path of ['/Solo', '/Solo/Child', '/Other']) {
      const index = await cache.computePrimIndex(path)
      expect(index.localErrors).toEqual([])
      expect(index.hasSpecs()).toBe(true)
    }

    // Live 26.05 capture: deleting the ONLY specs contributing to composed
    // prims is a SIGNIFICANT change at the subtree root (non-inert removal,
    // PcpChanges::DidChangeSpecs escalation, changes.cpp:1921-1955) — not an
    // ordinary spec change.
    expect(await processChanges(cache, layers, () => {
      rootLayer.getRootPrims().erase('Solo')
    })).toEqual({ significant: ['/Solo'], specs: [], prims: [] })

    // Live 26.05 capture: both affected indexes are ejected (nothing remains
    // to rescan), the unrelated sibling is retained, and recomputing the
    // deleted root yields a valid, spec-less index with no errors.
    expect(cache.findPrimIndex('/Solo')).toBeUndefined()
    expect(cache.findPrimIndex('/Solo/Child')).toBeUndefined()
    expect(cache.findPrimIndex('/Other')).toBeTruthy()
    const gone = await cache.computePrimIndex('/Solo')
    expect(gone.localErrors).toEqual([])
    expect(gone.hasSpecs()).toBe(false)
  })

  it('test_ChangesToCulledAncestralNodes: revives culled nodes as prim changes', async () => {
    // Fixture: testPcpChanges.testenv/TestCulledAncestralNodes/root.usda,
    // inlined verbatim. The ancestral reference node for
    // /FSToyCarA_defaultShadingVariant/Looks/PaintedWood is culled from
    // /FSToyCarA/Looks/PaintedWood_PaintedYellow's index (no specs).
    const rootLayer = Layer.fromBytes(enc(`#usda 1.0

def "FSToyCarA_defaultShadingVariant"
{
    def "Looks"
    {
    }
}

def "FSToyCarA_geom"
{
    def "Looks"
    {
        def "PaintedWood"
        {
            custom float inputs:wood_diffuseK
        }

        def "PaintedWood_PaintedYellow" (
            inherits = </FSToyCarA_geom/Looks/PaintedWood>
        )
        {
        }
    }
}

over "FSToyCarA" (
    references = [
        </FSToyCarA_defaultShadingVariant>,
        </FSToyCarA_geom>
    ]
)
{
    over "Looks"
    {
        over "PaintedWood"
        {
        }

        over "PaintedWood_PaintedYellow"
        {
        }
    }
}
`), 'culledAncestral-root.usda')
    const layers = [rootLayer]
    const cache = await PcpCache.create(rootLayer, openerOver(layers))

    const yellow = '/FSToyCarA/Looks/PaintedWood_PaintedYellow'
    const before = await cache.computePrimIndex(yellow)
    expect(before.localErrors).toEqual([])
    expect(primStack(before).map(([, path]) => path)).toEqual([
      '/FSToyCarA/Looks/PaintedWood_PaintedYellow',
      '/FSToyCarA/Looks/PaintedWood',
      '/FSToyCarA_geom/Looks/PaintedWood_PaintedYellow',
      '/FSToyCarA_geom/Looks/PaintedWood',
    ])

    // testPcpChanges.py:1018-1033 (USD-mode capture identical): the new spec
    // significantly resyncs the uncomputed dependents, and the prim whose
    // computed index CULLED this site gets a prim change — upstream's
    // didChangePrims — so the culled node is revived without a full resync.
    expect(await processChanges(cache, layers, () => {
      rootLayer.definePrimSpec(
        '/FSToyCarA_defaultShadingVariant/Looks/PaintedWood', undefined, 'over')
    })).toEqual({
      significant: [
        '/FSToyCarA/Looks/PaintedWood',
        '/FSToyCarA_defaultShadingVariant/Looks/PaintedWood',
      ],
      specs: [],
      prims: ['/FSToyCarA/Looks/PaintedWood_PaintedYellow'],
    })

    // Live 26.05 capture: the prim-changed index is ejected, and the
    // recomputed stack carries the revived (formerly culled) site's spec.
    expect(cache.findPrimIndex(yellow)).toBeUndefined()
    const after = await cache.computePrimIndex(yellow)
    expect(after.localErrors).toEqual([])
    expect(primStack(after).map(([, path]) => path)).toEqual([
      '/FSToyCarA/Looks/PaintedWood_PaintedYellow',
      '/FSToyCarA/Looks/PaintedWood',
      '/FSToyCarA_defaultShadingVariant/Looks/PaintedWood',
      '/FSToyCarA_geom/Looks/PaintedWood_PaintedYellow',
      '/FSToyCarA_geom/Looks/PaintedWood',
    ])
  })
})

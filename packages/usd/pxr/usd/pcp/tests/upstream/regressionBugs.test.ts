// Portions ported from OpenUSD 26.11.1, including: pxr/usd/pcp/changes.cpp,
//  pxr/usd/pcp/testenv/testPcpRegressionBugs_bug70951.py,
//  pxr/usd/pcp/testenv/testPcpRegressionBugs_bug90706.py
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _sdfFindOrOpenLayer } from 'typescript-usd/sdf/_internal'
// Ports of the Pcp regression-bug testenv suites that assert COMPOSITION
// results (testPcpRegressionBugs_bug{70951,90706,101300,82180}). Upstream drives
// each with Pcp._TestChangeProcessor (incremental layer-stack/prim-index
// invalidation) and then re-checks composition. typescript-usd deliberately has no
// incremental change processor — its model is recompose-from-scratch (a stage
// edit + await stage.flushChanges(); see the async-coalesced-composition note) —
// so the faithful equivalent of "edit, change-process, recompute" is "compose
// the before scene, then compose the after scene from a fresh cache." Each
// scene's composition golden is upstream's own assertion (verified against the
// Pixar build, the v26.05 reference build). The cache-invalidation-granularity assertions
// (bug90508 FindPrimIndex eviction, bug92955 FindSiteDependencies) are NOT
// ported — they test machinery typescript-usd does not mirror; a recorded divergence.
import { describe, expect, it } from 'vitest'
import { ArInMemoryResolver } from 'typescript-usd/ar/_internal'
import { Layer } from 'typescript-usd/sdf'
import {
  Cache as PcpCache, Layer as PcpLayer, LayerOpener as PcpLayerOpener, Node as PcpNode,
  pcpLayerPathKey, pcpComposeSiteHasSpecs,
} from '../../src/index.ts'

async function openLayers(files: Record<string, string>) {
  const resolver = new ArInMemoryResolver(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, new TextEncoder().encode(text)])))
  const registry = new Map<string, Layer>()
  const opener: PcpLayerOpener = async (filePath) => {
    if (!filePath) return null
    const cached = registry.get(filePath)
    if (cached) return cached
    try {
      const layer = (await _sdfFindOrOpenLayer(filePath, resolver))!
      registry.set(layer.filePath, layer)
      return layer
    } catch { return null }
  }
  const open = async (name: string): Promise<Layer> => {
    const l = (await _sdfFindOrOpenLayer(name, resolver))!
    registry.set(l.filePath, l)
    return l
  }
  return { opener, open }
}

// The (layerName, path) sites a prim index composes, strong→weak.
const sitesOf = (idx: { composePrimStack(): { layer: PcpLayer; path: { pathString: string } }[] }) =>
  idx.composePrimStack().map((e) => [e.layer.filePath, e.path.pathString] as const)

const REGISTERED_PROGRAMS = [
  'testPcpRegressionBugs_bug70951',
  'testPcpRegressionBugs_bug90706',
  'testPcpRegressionBugs_bug101300',
  'testPcpRegressionBugs_bug82180',
] as const

describe(REGISTERED_PROGRAMS.join(' / '), () => {
  // bug70951: adding an (inert) over for a referenced scope must make the root
  // node contribute specs. Before: only the reference contributes; the root node
  // has no specs. After: both contribute.
  it('bug70951: an over on a referenced prim adds the root node to the prim stack', async () => {
    const JOY = `#usda 1.0
def Scope "JoyGroup" { def Scope "Sim" {}
}
`
    const before = `#usda 1.0
def Scope "World" { def Scope "anim" { def Scope "chars" {
  def Scope "JoyGroup" ( add references = @./JoyGroup.usda@</JoyGroup> ) {}
}
}
}
`
    const after = `#usda 1.0
def Scope "World" { def Scope "anim" { def Scope "chars" {
  def Scope "JoyGroup" ( add references = @./JoyGroup.usda@</JoyGroup> ) {
    over Scope "Sim" {}
  }
}
}
}
`
    const SIM = '/World/anim/chars/JoyGroup/Sim'

    const a = await openLayers({ 'root.usda': before, 'JoyGroup.usda': JOY })
    const ca = await PcpCache.create(await a.open('root.usda'), a.opener)
    const ia = await ca.computePrimIndex(SIM)
    expect(sitesOf(ia)).toEqual([['JoyGroup.usda', '/JoyGroup/Sim']])
    // root node contributes no specs (no opinion at SIM in the root layer)
    expect(pcpComposeSiteHasSpecs(ia.rootNode.layerStack, pcpLayerPathKey(ia.rootNode.path))).toBe(false)

    const b = await openLayers({ 'root.usda': after, 'JoyGroup.usda': JOY })
    const cb = await PcpCache.create(await b.open('root.usda'), b.opener)
    const ib = await cb.computePrimIndex(SIM)
    expect(sitesOf(ib)).toEqual([['root.usda', SIM], ['JoyGroup.usda', '/JoyGroup/Sim']])
    expect(pcpComposeSiteHasSpecs(ib.rootNode.layerStack, pcpLayerPathKey(ib.rootNode.path))).toBe(true)
  })

  // bug90706: a variant arc to a path with no prim spec is culled; once a spec is
  // authored inside the selected variant, the variant arc appears.
  it('bug90706: a variant arc materializes only once the variant has a spec', async () => {
    const before = `#usda 1.0
def "Sarah" (
    variants = { string displayColor = "red" }
    add variantSets = "displayColor"
) {
    def Scope "EmptyPrim" {}
    variantSet "displayColor" = { "green" {} "red" {} }
}
`
    const after = `#usda 1.0
def "Sarah" (
    variants = { string displayColor = "red" }
    add variantSets = "displayColor"
) {
    def Scope "EmptyPrim" {}
    variantSet "displayColor" = {
        "green" {}
        "red" { def Scope "EmptyPrim" {}
}
    }
}
`
    // Finalization erases culled nodes unless they serve as origins.
    const liveChildren = (n: PcpNode): PcpNode[] => n.children.filter((c) => !c.isCulled)

    const a = await openLayers({ 'root.usda': before })
    const ca = await PcpCache.create(await a.open('root.usda'), a.opener)
    const ia = await ca.computePrimIndex('/Sarah/EmptyPrim')
    // variant arc to /Sarah{displayColor=red}EmptyPrim is culled (no spec there)
    expect(liveChildren(ia.rootNode).length).toBe(0)
    expect(sitesOf(ia)).toEqual([['root.usda', '/Sarah/EmptyPrim']])

    const b = await openLayers({ 'root.usda': after })
    const cb = await PcpCache.create(await b.open('root.usda'), b.opener)
    const ib = await cb.computePrimIndex('/Sarah/EmptyPrim')
    const live = liveChildren(ib.rootNode)
    expect(live.length).toBe(1)
    const child = live[0]!
    expect(child.path.pathString).toBe('/Sarah{displayColor=red}EmptyPrim')
    // same (local) layer stack as the root node — it's a local variant arc
    expect(child.layerStack).toBe(ib.rootNode.layerStack)
  })

  // OpenUSD pxr/usd/pcp/changes.cpp:435–451: USD-mode relocates are layer
  // metadata. Removing that opinion removes the relocation.
  it('bug101300: relocates apply, and removing the layer opinion drops them', async () => {
    const REF = `#usda 1.0
def "Ref" { def "A" { def "B" {}
}
}
`
    const withRelocates = `#usda 1.0
( relocates = { </Root/A/B>: </Root/A/B_2> } )
def "Root" ( references = @./ref.usda@</Ref> ) {}
`
    const withoutRelocates = `#usda 1.0
def "Root" ( references = @./ref.usda@</Ref> ) {}
`
    const a = await openLayers({ 'root.usda': withRelocates, 'ref.usda': REF })
    const ca = await PcpCache.create(await a.open('root.usda'), a.opener)
    expect((await ca.computePrimIndex('/Root/A')).computePrimChildNames()).toEqual(['B_2'])
    expect(ca.getLayerStack().relocatesSourceToTarget.get('/Root/A/B')).toBe('/Root/A/B_2')

    const b = await openLayers({ 'root.usda': withoutRelocates, 'ref.usda': REF })
    const cb = await PcpCache.create(await b.open('root.usda'), b.opener)
    expect((await cb.computePrimIndex('/Root/A')).computePrimChildNames()).toEqual(['B'])
    expect(cb.getLayerStack().relocatesSourceToTarget.size).toBe(0)
  })

  // bug82180: an insignificant layer-stack change (adding an empty sublayer) must
  // not blow the layer stack's relocations. typescript-usd recomputes the layer stack
  // from scratch either way, so we assert the relocates are identical whether or
  // not the empty sublayer is present.
  it('bug82180: relocations are unaffected by an empty (insignificant) sublayer', async () => {
    const ROOT = `#usda 1.0
( relocates = { </ModelGroup/Model>: </ModelGroup/Model_1> } )
def "ModelGroup" ( references = @./group.usda@</ModelGroup> ) {}
`
    const GROUP = `#usda 1.0
def Scope "ModelGroup" { def Model "Model" {}
}
`
    const EMPTY = '#usda 1.0\n'
    const expected = { '/ModelGroup/Model': '/ModelGroup/Model_1' }

    const relocatesOf = (cache: PcpCache) =>
      Object.fromEntries(cache.getLayerStack().relocatesSourceToTarget.entries())

    // Without the empty sublayer.
    const a = await openLayers({ 'root.usda': ROOT, 'group.usda': GROUP })
    const ca = await PcpCache.create(await a.open('root.usda'), a.opener)
    expect(relocatesOf(ca)).toEqual(expected)

    // With an empty sublayer on the root layer stack — relocates unchanged.
    const rootWithSub = `#usda 1.0
( relocates = { </ModelGroup/Model>: </ModelGroup/Model_1> }
  subLayers = [@./empty.usda@] )
def "ModelGroup" ( references = @./group.usda@</ModelGroup> ) {}
`
    const b = await openLayers({ 'root.usda': rootWithSub, 'group.usda': GROUP, 'empty.usda': EMPTY })
    const cb = await PcpCache.create(await b.open('root.usda'), b.opener)
    expect(relocatesOf(cb)).toEqual(expected)
  })
})

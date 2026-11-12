// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/pcp/testenv/testPcpPrimIndex.py,
//  pxr/usd/pcp/testenv/testPcpCompositionResults.py
// Copyright 2017, 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { describe, expect, it } from 'vitest'
import { ArcType as PcpArcType, Cache as PcpCache, Changes as PcpChanges, Layer as PcpLayer, LayerOpener as PcpLayerOpener } from '../../src/index.ts'

// A fake layer over an explicit scene (specPath -> fields). resolveAsset is
// identity (test asset paths are the layer file paths).
type Scene = Record<string, Record<string, unknown>>
function fakeLayer(filePath: string, scene: Scene): PcpLayer {
  return {
    filePath,
    // An Sdf layer always has its pseudo-root spec.
    hasSpec: path => path === '/' || scene[path] !== undefined,
    getSpecType: path => path === '/' ? 'pseudoRoot' : path.includes('.') ? 'attribute' : 'prim',
    getSpecPaths: () => Object.keys(scene),
    getFieldNames: path => Object.keys(scene[path] ?? {}),
    getField: (specPath, fieldName) => scene[specPath]?.[fieldName],
    resolveAsset: (assetPath) => assetPath,
  }
}
function openerOver(layers: PcpLayer[]): PcpLayerOpener {
  const byPath = new Map(layers.map((l) => [l.filePath, l]))
  return async (filePath) => byPath.get(filePath) ?? null
}
const ref = (assetPath: string, primPath: string) =>
  [{ assetPath, primPath, layerOffset: { offset: 0, scale: 1 } }]

// The (layerName, path) sites a prim index composes, strong→weak.
function sites(idx: { composePrimStack(): { layer: PcpLayer; path: { pathString: string } }[] }) {
  return idx.composePrimStack().map((e) => [e.layer.filePath, e.path.pathString] as const)
}

describe('testPcpPrimIndex — local + sublayers', () => {
  it('a local prim composes from its own layer', async () => {
    const root = fakeLayer('/root', { '/': { primChildren: ['Foo'] }, '/Foo': { typeName: 'Scope' } })
    const cache = await PcpCache.create(root, openerOver([root]))
    const idx = await cache.computePrimIndex('/Foo')
    expect(sites(idx)).toEqual([['/root', '/Foo']])
    expect(idx.hasSpecs()).toBe(true)
  })

  it('sublayer opinions appear strong→weak within the root node', async () => {
    const weak = fakeLayer('/weak', { '/Foo': { typeName: 'Scope' } })
    const root = fakeLayer('/root', { '/': { subLayers: ['/weak'] }, '/Foo': { doc: 'x' } })
    const cache = await PcpCache.create(root, openerOver([root, weak]))
    const idx = await cache.computePrimIndex('/Foo')
    expect(sites(idx)).toEqual([['/root', '/Foo'], ['/weak', '/Foo']])
  })
})

describe('PcpCache.computePrimIndex — references', () => {
  it('an external reference brings the referenced subtree (ancestral seeding)', async () => {
    const model = fakeLayer('/model', {
      '/Model': { primChildren: ['Geom'] },
      '/Model/Geom': { typeName: 'Mesh' },
    })
    const root = fakeLayer('/root', { '/Char': { references: ref('/model', '/Model') } })
    const cache = await PcpCache.create(root, openerOver([root, model]))

    const charIdx = await cache.computePrimIndex('/Char')
    expect(sites(charIdx)).toEqual([['/root', '/Char'], ['/model', '/Model']]) // referencing spec + referenced
    expect(charIdx.computePrimChildNames()).toEqual(['Geom'])

    const geomIdx = await cache.computePrimIndex('/Char/Geom')
    expect(sites(geomIdx)).toEqual([['/model', '/Model/Geom']]) // ancestral arc extended to the child
  })

  it('a local opinion over a referenced prim composes strongest', async () => {
    const model = fakeLayer('/model', { '/Model': { typeName: 'Scope', doc: 'from model' } })
    const root = fakeLayer('/root', { '/Char': { references: ref('/model', '/Model'), doc: 'from root' } })
    const cache = await PcpCache.create(root, openerOver([root, model]))
    const idx = await cache.computePrimIndex('/Char')
    // root (local) is stronger than the reference
    expect(sites(idx)).toEqual([['/root', '/Char'], ['/model', '/Model']])
  })

  it('an internal reference targets another prim in the same layer stack', async () => {
    const root = fakeLayer('/root', {
      '/Class': { primChildren: ['Inner'] },
      '/Class/Inner': { typeName: 'Scope' },
      '/Inst': { references: [{ assetPath: '', primPath: '/Class', layerOffset: { offset: 0, scale: 1 } }] },
    })
    const cache = await PcpCache.create(root, openerOver([root]))
    const idx = await cache.computePrimIndex('/Inst')
    expect(sites(idx)).toEqual([['/root', '/Inst'], ['/root', '/Class']])
    expect(idx.computePrimChildNames()).toEqual(['Inner'])
    const innerIdx = await cache.computePrimIndex('/Inst/Inner')
    expect(sites(innerIdx)).toEqual([['/root', '/Class/Inner']])
  })

  it('chains references (A refs B refs C)', async () => {
    const c = fakeLayer('/c', { '/C': { typeName: 'Scope' } })
    const b = fakeLayer('/b', { '/B': { references: ref('/c', '/C') } })
    const root = fakeLayer('/root', { '/A': { references: ref('/b', '/B') } })
    const cache = await PcpCache.create(root, openerOver([root, b, c]))
    const idx = await cache.computePrimIndex('/A')
    expect(sites(idx)).toEqual([['/root', '/A'], ['/b', '/B'], ['/c', '/C']])
  })
})

describe('PcpCache.computePrimIndex — inherits / specializes (direct arcs)', () => {
  it('a local inherit brings the class subtree (class -> instance)', async () => {
    const root = fakeLayer('/root', {
      '/_Class': { primChildren: ['Sub'], x: 1 },
      '/_Class/Sub': { typeName: 'Scope' },
      '/Model': { inheritPaths: ['/_Class'] },
    })
    const cache = await PcpCache.create(root, openerOver([root]))
    const idx = await cache.computePrimIndex('/Model')
    expect(sites(idx)).toEqual([['/root', '/Model'], ['/root', '/_Class']])
    expect(idx.computePrimChildNames()).toEqual(['Sub'])
    const subIdx = await cache.computePrimIndex('/Model/Sub')
    expect(sites(subIdx)).toEqual([['/root', '/_Class/Sub']]) // ancestral class arc
  })

  it('chains inherits (instance -> class -> base class)', async () => {
    const root = fakeLayer('/root', {
      '/_Base': { typeName: 'Scope' },
      '/_Class': { inheritPaths: ['/_Base'] },
      '/Model': { inheritPaths: ['/_Class'] },
    })
    const cache = await PcpCache.create(root, openerOver([root]))
    const idx = await cache.computePrimIndex('/Model')
    expect(sites(idx)).toEqual([['/root', '/Model'], ['/root', '/_Class'], ['/root', '/_Base']])
  })

  it('a specialize brings the specialized prim subtree', async () => {
    const root = fakeLayer('/root', {
      '/_Base': { typeName: 'Scope' },
      '/Model': { specializes: ['/_Base'] },
    })
    const cache = await PcpCache.create(root, openerOver([root]))
    const idx = await cache.computePrimIndex('/Model')
    // set of contributing sites (specialize-weakest ordering lands in 3f)
    expect(new Set(sites(idx).map((s) => s.join('::'))))
      .toEqual(new Set(['/root::/Model', '/root::/_Base']))
  })
})

describe('PcpCache.computePrimIndex — implied classes (spooky inherits)', () => {
  it('a class inherited across a reference picks up the referencing stack’s class', async () => {
    // model: /Model inherits /Class (and model defines /Class). root references
    // /Model and ALSO has an opinion on /Class. The implied inherit makes root’s
    // /Class compose for /M too.
    const model = fakeLayer('/model', {
      '/Model': { inheritPaths: ['/Class'] },
      '/Class': { typeName: 'Scope', x: 1 },
    })
    const root = fakeLayer('/root', {
      '/M': { references: ref('/model', '/Model') },
      '/Class': { typeName: 'Scope', y: 2 },
    })
    const cache = await PcpCache.create(root, openerOver([root, model]))
    const idx = await cache.computePrimIndex('/M')
    const set = new Set(sites(idx).map((s) => s.join('::')))
    expect(set.has('/root::/M')).toBe(true)       // local
    expect(set.has('/model::/Model')).toBe(true)  // reference
    expect(set.has('/model::/Class')).toBe(true)  // direct inherit
    expect(set.has('/root::/Class')).toBe(true)   // IMPLIED inherit across the reference
  })

  it('does not duplicate a base class in a local inherit chain', async () => {
    const root = fakeLayer('/root', {
      '/_Base': { typeName: 'Scope' },
      '/_Class': { inheritPaths: ['/_Base'] },
      '/Model': { inheritPaths: ['/_Class'] },
    })
    const cache = await PcpCache.create(root, openerOver([root]))
    const idx = await cache.computePrimIndex('/Model')
    expect(sites(idx)).toEqual([['/root', '/Model'], ['/root', '/_Class'], ['/root', '/_Base']])
  })

  it('re-expands an implied class up a CHAIN of inherits (TrickyNestedClasses4)', async () => {
    // A referenced rig: LToesRig inherits SymToesRig inherits _Class_ToesRig.
    const model = fakeLayer('/model', {
      '/CharRig': { primChildren: ['_Class_ToesRig', 'SymToesRig', 'LToesRig'] },
      '/CharRig/_Class_ToesRig': { primChildren: ['_Class_Toe'] },
      '/CharRig/_Class_ToesRig/_Class_Toe': { typeName: 'Scope' },
      '/CharRig/SymToesRig': { inheritPaths: ['/CharRig/_Class_ToesRig'] },
      '/CharRig/LToesRig': { inheritPaths: ['/CharRig/SymToesRig'] },
    })
    // root references the rig and authors a LOCAL over on the class that adds a
    // child. Through the ancestral inherit (/Rig -> /_class_CharRig) the class is
    // re-expressed as /Rig/_Class_ToesRig, so its ThumbToeLOCALRig must reach
    // SymToesRig (1 hop) AND LToesRig (2 hops, through SymToesRig).
    const root = fakeLayer('/root', {
      '/_class_CharRig': { references: ref('/model', '/CharRig') },
      '/Rig': { inheritPaths: ['/_class_CharRig'] },
      '/Rig/_Class_ToesRig': { primChildren: ['ThumbToeLOCALRig'] },
      '/Rig/_Class_ToesRig/ThumbToeLOCALRig': { typeName: 'Scope' },
    })
    const cache = await PcpCache.create(root, openerOver([root, model]))
    const sym = await cache.computePrimIndex('/Rig/SymToesRig')
    expect(sym.computePrimChildNames().sort()).toEqual(['ThumbToeLOCALRig', '_Class_Toe'])
    const lto = await cache.computePrimIndex('/Rig/LToesRig')
    expect(lto.computePrimChildNames().sort()).toEqual(['ThumbToeLOCALRig', '_Class_Toe'])
  })
})

describe('PcpCache.computePrimIndex — variants', () => {
  // A prim defining a variant set with two variants; the root selects one.
  const sceneWith = (selection: string) => fakeLayer('/root', {
    '/Model': { variantSetChildren: ['vset'], variantSetNames: ['vset'], variantSelection: { vset: [selection] } },
    '/Model{vset=}': { variantChildren: ['a', 'b'] },
    '/Model{vset=a}': { primChildren: ['AChild'] },
    '/Model{vset=a}AChild': { typeName: 'Scope' },
    '/Model{vset=b}': { primChildren: ['BChild'] },
    '/Model{vset=b}BChild': { typeName: 'Scope' },
  })

  it('composes the selected variant’s children (selection in the site path)', async () => {
    const root = sceneWith('a')
    const cache = await PcpCache.create(root, openerOver([root]))
    const idx = await cache.computePrimIndex('/Model')
    expect(idx.computePrimChildNames()).toEqual(['AChild'])
    const childIdx = await cache.computePrimIndex('/Model/AChild')
    expect(sites(childIdx)).toEqual([['/root', '/Model{vset=a}AChild']])
  })

  it('a stronger selection wins over a weaker one (strongest-wins)', async () => {
    // The reference authors vset=a; the local root over authors vset=b → b wins.
    const lib = fakeLayer('/lib', {
      '/Lib': { variantSetChildren: ['vset'], variantSetNames: ['vset'], variantSelection: { vset: ['a'] } },
      '/Lib{vset=}': { variantChildren: ['a', 'b'] },
      '/Lib{vset=a}': { primChildren: ['AChild'] },
      '/Lib{vset=a}AChild': { typeName: 'Scope' },
      '/Lib{vset=b}': { primChildren: ['BChild'] },
      '/Lib{vset=b}BChild': { typeName: 'Scope' },
    })
    const root = fakeLayer('/root', { '/Model': { references: ref('/lib', '/Lib'), variantSelection: { vset: ['b'] } } })
    const cache = await PcpCache.create(root, openerOver([root, lib]))
    const idx = await cache.computePrimIndex('/Model')
    expect(idx.computePrimChildNames()).toEqual(['BChild'])
  })

  it('builds an ancestral variant from its single site without cloning ancestral arcs', async () => {
    // testPcpCompositionResults/TrickyVariantOverrideOfFallback. Native Pcp's
    // graph for /C contains one /B/Child reference node; the /A vset1 variant
    // subtree contains only /A{vset1=selection}Child and never temporarily
    // installs a second /B/Child subtree.
    const root = fakeLayer('/root', {
      '/A': {
        primChildren: ['Child'], variantSetChildren: ['vset1'], variantSetNames: ['vset1'],
        references: ref('', '/B'),
      },
      '/A/Child': { typeName: 'Scope' },
      '/A{vset1=}': { variantChildren: ['fallback', 'selection'] },
      '/A{vset1=selection}': {
        primChildren: ['Child'], variantSelection: { vset2: ['ignored_selection'] },
      },
      '/A{vset1=selection}Child': { typeName: 'Scope' },
      '/B': {
        primChildren: ['Child'], variantSetChildren: ['vset2'], variantSetNames: ['vset2'],
        variantSelection: { vset2: ['selection'] },
      },
      '/B/Child': { typeName: 'Scope' },
      '/B{vset2=}': { variantChildren: ['selection', 'ignored_selection'] },
      '/B{vset2=selection}': {
        primChildren: ['Child'], variantSelection: { vset1: ['selection'] },
      },
      '/B{vset2=selection}Child': { typeName: 'Scope' },
      '/C': { references: ref('', '/A/Child') },
    })
    const cache = await PcpCache.create(root, openerOver([root]))
    cache.setVariantFallbacks({ vset1: ['fallback'] })
    const idx = await cache.computePrimIndex('/C')
    const graphSites = [...idx.getNodeRange()].map((node) => node.path.pathString)
    expect(graphSites).toEqual([
      '/C', '/A/Child', '/A{vset1=selection}Child',
      '/B/Child', '/B{vset2=selection}Child',
    ])
    expect(graphSites.filter((path) => path === '/B/Child')).toHaveLength(1)
  })
})

describe('PcpCache.computePrimIndex — relocations', () => {
  // A rig that relocates its internal Tail out to the Anim interface; the root
  // references the rig. The relocate is authored in the rig's namespace. The
  // Tail's opinions arrive via an ANCESTRAL sub-reference (authoring a local
  // opinion at a relocation source is illegal in USD), so they follow the move.
  const tailRig = fakeLayer('/tailrig', {
    '/TailRig': { primChildren: ['Tail'] },
    '/TailRig/Tail': { typeName: 'Scope', primChildren: ['Tip'] },
    '/TailRig/Tail/Tip': { typeName: 'Scope' },
  })
  const charRig = fakeLayer('/rig', {
    '/': { layerRelocates: { '/CharRig/Rig/Tail': '/CharRig/Anim/Tail' } },
    '/CharRig': { primChildren: ['Anim', 'Rig'] },
    '/CharRig/Anim': { typeName: 'Scope' },
    '/CharRig/Rig': { references: ref('/tailrig', '/TailRig') },
  })
  const root = fakeLayer('/root', { '/Char': { references: ref('/rig', '/CharRig') } })

  it('moves the relocated prim to its target and elides the source', async () => {
    const cache = await PcpCache.create(root, openerOver([root, charRig, tailRig]))
    // source elided (Tail moved away from Rig)
    expect((await cache.computePrimIndex('/Char/Rig')).computePrimChildNames()).toEqual([])
    // target materialized with the moved subtree
    expect((await cache.computePrimIndex('/Char/Anim')).computePrimChildNames()).toEqual(['Tail'])
    const tail = await cache.computePrimIndex('/Char/Anim/Tail')
    expect(sites(tail)).toEqual([['/tailrig', '/TailRig/Tail']]) // ancestral opinion follows the relocate arc
    expect(tail.computePrimChildNames()).toEqual(['Tip'])        // and its subtree
  })

  it('materializes an empty relocation target when the source has no opinions', async () => {
    // Same rig, but the root deactivates/omits the Rig subtree by referencing a
    // rig whose Tail source does not compose — the target is still a valid prim.
    const emptyRig = fakeLayer('/rig2', {
      '/': { layerRelocates: { '/CharRig/Rig/Tail': '/CharRig/Anim/Tail' } },
      '/CharRig': { primChildren: ['Anim'] },
      '/CharRig/Anim': { typeName: 'Scope' },
    })
    const root2 = fakeLayer('/root', { '/Char': { references: ref('/rig2', '/CharRig') } })
    const cache = await PcpCache.create(root2, openerOver([root2, emptyRig]))
    expect((await cache.computePrimIndex('/Char/Anim')).computePrimChildNames()).toEqual(['Tail'])
    const tail = await cache.computePrimIndex('/Char/Anim/Tail')
    expect(sites(tail)).toEqual([]) // empty prim stack — the relocation is the only reason it exists
  })

  it('chains relocations across rename levels', async () => {
    // /A -> /A2 (an intermediate target), then /A2/Leaf is relocated to
    // /Moved. The v26.05 oracle reports new child names [Moved], prohibited
    // child names [A]: A2 is queryable as a relocation target but is not itself
    // emitted as a name child after the nested relocation is combined.
    const lib = fakeLayer('/lib', {
      '/': { layerRelocates: { '/Lib/A': '/Lib/A2', '/Lib/A2/Leaf': '/Lib/Moved' } },
      '/Lib': { primChildren: ['A'] },
      '/Lib/A': { primChildren: ['Leaf'] },
      '/Lib/A/Leaf': { typeName: 'Scope' },
    })
    const root3 = fakeLayer('/root', { '/C': { references: ref('/lib', '/Lib') } })
    const cache = await PcpCache.create(root3, openerOver([root3, lib]))
    const chainIndex = await cache.computePrimIndex('/C')
    const names = new Set(chainIndex.computePrimChildNames())
    expect([...names]).toEqual(['Moved'])
    expect(names.has('A2')).toBe(false)   // intermediate target is not a name child
    expect(names.has('A')).toBe(false)    // source elided
    expect(names.has('Moved')).toBe(true) // Leaf relocated up to /C/Moved

    const a2 = await cache.computePrimIndex('/C/A2')
    expect([...a2.getNodeRange()].map(n => [n.arcType, n.path.pathString])).toEqual([
      [PcpArcType.Root, '/C/A2'],
      [PcpArcType.Relocate, '/C/A'],
      [PcpArcType.Reference, '/Lib/A2'],
      [PcpArcType.Relocate, '/Lib/A'],
    ])
    expect([...a2.getNodeRange()].map(n => [...n.mapToParent.evaluate().getSourceToTargetMap()])).toEqual([
      [['/', '/']], [['/', '/']], [['/Lib', '/C']], [['/', '/']],
    ])
    const moved = await cache.computePrimIndex('/C/Moved')
    expect([...moved.getNodeRange()].map(n => [n.arcType, n.path.pathString])).toEqual([
      [PcpArcType.Root, '/C/Moved'],
      [PcpArcType.Relocate, '/C/A2/Leaf'],
      [PcpArcType.Reference, '/Lib/Moved'],
      [PcpArcType.Relocate, '/Lib/A2/Leaf'],
    ])
    expect([...moved.getNodeRange()].map(n => [...n.mapToRoot.evaluate().getSourceToTargetMap()])).toEqual([
      [['/', '/']], [['/', '/']], [['/Lib', '/C']], [['/Lib', '/C']],
    ])
  })
})

describe('PcpCache.computePrimIndex — payloads', () => {
  it('a payload composes like a (weaker) reference once requested', async () => {
    const model = fakeLayer('/model', { '/Model': { typeName: 'Scope' } })
    const root = fakeLayer('/root', {
      '/Char': { payload: { assetPath: '/model', primPath: '/Model', layerOffset: { offset: 0, scale: 1 } } },
    })
    const cache = await PcpCache.create(root, openerOver([root, model]))
    // Unrequested payloads do not compose (PcpCache::RequestPayloads).
    const unloaded = await cache.computePrimIndex('/Char')
    expect(sites(unloaded)).toEqual([['/root', '/Char']])
    const changes = new PcpChanges()
    cache.requestPayloads(['/Char'], [], changes)
    await changes.apply()
    const idx = await cache.computePrimIndex('/Char')
    expect(sites(idx)).toEqual([['/root', '/Char'], ['/model', '/Model']])
  })
})

describe('PcpCache.computePrimIndex — sub-root references (cross-frame builds)', () => {
  const iref = (primPath: string) => [{ primPath, layerOffset: { offset: 0, scale: 1 } }]

  it('a reference to a non-root prim composes the target’s ancestral arcs', async () => {
    // /Impl/A/D references /Prim/A/B; /Prim references /Impl, so /Prim/A/B is
    // /Impl/A/B which has child C. The subroot reference must pick up that
    // ancestral content (SubrootReferenceNonCycle's ImplNoCycle/A/D).
    const root = fakeLayer('/root', {
      '/Impl': { primChildren: ['A'] },
      '/Impl/A': { primChildren: ['B', 'D'] },
      '/Impl/A/B': { primChildren: ['C'] },
      '/Impl/A/B/C': { typeName: 'Scope' },
      '/Impl/A/D': { references: iref('/Prim/A/B') },
      '/Prim': { references: iref('/Impl') },
    })
    const cache = await PcpCache.create(root, openerOver([root]))
    expect((await cache.computePrimIndex('/Impl/A/D')).computePrimChildNames()).toEqual(['C'])
  })

  it('breaks a cyclic sub-root reference instead of recursing forever', async () => {
    // /Impl/A/D references /Prim/A; /Prim references /Impl, so /Prim/A is /Impl/A
    // — an ANCESTOR of /Impl/A/D. The cross-frame cycle check must break this so
    // the prim composes empty rather than /Impl/A/D/D/D… (SubrootReferenceNonCycle
    // ImplCycle). The non-recursion is the test: it would hang/OOM otherwise.
    const root = fakeLayer('/root', {
      '/Impl': { primChildren: ['A'] },
      '/Impl/A': { primChildren: ['D'] },
      '/Impl/A/D': { references: iref('/Prim/A') },
      '/Prim': { references: iref('/Impl') },
    })
    const cache = await PcpCache.create(root, openerOver([root]))
    expect((await cache.computePrimIndex('/Impl/A/D')).computePrimChildNames()).toEqual([])
  })
})

// Ported from OpenUSD 26.11.1: pxr/usd/pcp/testenv/testPcpDependencies.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.08 pxr/usd/pcp/testenv/testPcpDependencies.py
// (registered as testPcpDependencies in pxr/usd/pcp/CMakeLists.txt), using
// its testPcpDependencies.testenv fixtures. typescript-usd caches are USD-mode, so
// every query runs with cacheInUsdMode = True; expected values were captured
// from OpenUSD v26.08 in USD mode and match the upstream expectations. The
// upstream non-USD-mode variant case is not applicable.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/usd/_internal'
import {
  Cache as PcpCache, DependencyType, Layer as PcpLayer, LayerOpener as PcpLayerOpener,
  PcpNeedsLayer, type PrimIndex as PcpPrimIndex, type LayerStack as PcpLayerStack,
} from '../../src/index.ts'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const FIXTURES = path.join(HERE, 'fixtures/testPcpDependencies.testenv')

function opener(): PcpLayerOpener {
  const layers = new Map<string, PcpLayer>()
  return async (filePath: string) => {
    const retained = layers.get(filePath)
    if (retained) return retained
    try {
      const layer = (await Layer.open(filePath))!
      layers.set(filePath, layer)
      return layer
    } catch {
      return null
    }
  }
}

// PcpCache::ComputeLayerStack, loading layers as needed.
async function computeLayerStack(cache: PcpCache, layer: PcpLayer): Promise<PcpLayerStack> {
  for (;;) {
    try {
      return cache.computeLayerStack({ rootLayer: layer }, [])
    } catch (e) {
      if (!(e instanceof PcpNeedsLayer)) throw e
      await cache._layerSource.load(e.identifier)
    }
  }
}

// _ForcePopulateCache: compute every prim index in the namespace.
async function forcePopulateCache(cache: PcpCache): Promise<void> {
  const walk = async (primPath: string): Promise<void> => {
    const index: PcpPrimIndex = await cache.computePrimIndex(primPath)
    for (const name of index.computePrimChildNames()) {
      await walk(primPath === '/' ? `/${name}` : `${primPath}/${name}`)
    }
  }
  await walk('/')
}

type Dep = [indexPath: string, sitePath: string, mapFunc: Record<string, string>]
const dep = (indexPath: string, sitePath: string, mapFunc: Record<string, string>): Dep =>
  [indexPath, sitePath, mapFunc]

interface Case {
  root: string
  site: string
  path: string
  depMask: number
  recurseOnSite: boolean
  recurseOnIndex: boolean
  expected: Dep[]
}

// _FindSiteDeps with cacheInUsdMode = True.
async function findSiteDeps(c: Case): Promise<Dep[]> {
  const rootLayer = (await Layer.open(path.join(FIXTURES, c.root)))!
  const siteLayer = (await Layer.open(path.join(FIXTURES, c.site)))!
  const cache = await PcpCache.create(rootLayer, opener())
  const siteLayerStack = await computeLayerStack(cache, siteLayer)
  await forcePopulateCache(cache)
  const deps = cache.findSiteDependencies(siteLayerStack, c.path, c.depMask,
    c.recurseOnSite, c.recurseOnIndex, false)
  return deps.map((d): Dep => [
    d.indexPath.pathString, d.sitePath.pathString,
    Object.fromEntries(d.mapFunc.getSourceToTargetMap()),
  ]).sort(compareDeps)
}

// _AssertDepsEqual compares sorted dependency lists.
function compareDeps(a: Dep, b: Dep): number {
  const key = (d: Dep): string => `${d[0]}\0${d[1]}\0${JSON.stringify(Object.entries(d[2]).sort())}`
  return key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0
}

const CASES: Case[] = [
    // A basic reference arc.
    {
      root: "BasicReference/root.usda", site: "BasicReference/ref.usda", path: "/PrimA",
      depMask: DependencyType.AnyNonVirtual, recurseOnSite: false, recurseOnIndex: false,
      expected: [
      dep("/PrimWithReferences", "/PrimA", {"/PrimA": "/PrimWithReferences"}),
      ],
    },
    // A reference to a defaultPrim.
    {
      root: "BasicReference/root.usda", site: "BasicReference/defaultRef.usda", path: "/Default",
      depMask: DependencyType.AnyNonVirtual, recurseOnSite: false, recurseOnIndex: false,
      expected: [
      dep("/PrimWithDefaultReferenceTarget", "/Default", {"/Default": "/PrimWithDefaultReferenceTarget"}),
      ],
    },
    // A reference case showing the distinction between ancestral and direct dependencies.
    {
      root: "BasicAncestralReference/root.usda", site: "BasicAncestralReference/A.usda", path: "/A",
      depMask: DependencyType.AnyNonVirtual, recurseOnSite: false, recurseOnIndex: false,
      expected: [
      dep("/A", "/A", {"/A": "/A"}),
      ],
    },
    {
      root: "BasicAncestralReference/root.usda", site: "BasicAncestralReference/B.usda", path: "/B",
      depMask: DependencyType.Direct | DependencyType.NonVirtual, recurseOnSite: false, recurseOnIndex: false,
      expected: [
      dep("/A/B", "/B", {"/B": "/A/B"}),
      ],
    },
    {
      root: "BasicAncestralReference/root.usda", site: "BasicAncestralReference/A.usda", path: "/A/B",
      depMask: DependencyType.Ancestral | DependencyType.NonVirtual, recurseOnSite: false, recurseOnIndex: false,
      expected: [
      dep("/A/B", "/A/B", {"/A": "/A"}),
      ],
    },
    // Existing structure gives deps for sites that do not contain any specs yet; important for change processing the addition of a new child prim.
    {
      root: "BasicAncestralReference/root.usda", site: "BasicAncestralReference/A.usda", path: "/A.HypotheticalProperty",
      depMask: DependencyType.AnyNonVirtual, recurseOnSite: false, recurseOnIndex: false,
      expected: [
      dep("/A.HypotheticalProperty", "/A.HypotheticalProperty", {"/A": "/A"}),
      ],
    },
    // recurseOnSite has no effect on the results.
    {
      root: "BasicAncestralReference/root.usda", site: "BasicAncestralReference/A.usda", path: "/A.HypotheticalProperty",
      depMask: DependencyType.AnyNonVirtual, recurseOnSite: true, recurseOnIndex: false,
      expected: [
      dep("/A.HypotheticalProperty", "/A.HypotheticalProperty", {"/A": "/A"}),
      ],
    },
    {
      root: "BasicAncestralReference/root.usda", site: "BasicAncestralReference/A.usda", path: "/A/B/HypotheticalChildPrim",
      depMask: DependencyType.Ancestral | DependencyType.NonVirtual, recurseOnSite: false, recurseOnIndex: false,
      expected: [
      dep("/A/B/HypotheticalChildPrim", "/A/B/HypotheticalChildPrim", {"/A": "/A"}),
      ],
    },
    // recurseOnSite finds inbound dependencies on child sites, important for significant changes to a prim whose children are inherited elsewhere.
    {
      root: "BasicLocalAndGlobalClassCombination/root.usda", site: "BasicLocalAndGlobalClassCombination/model.usda", path: "/_class_Model/_class_Nested",
      depMask: DependencyType.AnyIncludingVirtual, recurseOnSite: true, recurseOnIndex: false,
      expected: [
      dep("/Model_1/Instance", "/_class_Model/_class_Nested", {"/_class_Model": "/Model_1", "/_class_Model/_class_Nested": "/Model_1/Instance"}),
      dep("/Model_1/Instance/Left", "/_class_Model/_class_Nested/Sym", {"/_class_Model": "/Model_1", "/_class_Model/_class_Nested": "/Model_1/Instance", "/_class_Model/_class_Nested/Sym": "/Model_1/Instance/Left"}),
      dep("/Model_1/_class_Nested", "/_class_Model/_class_Nested", {"/_class_Model": "/Model_1"}),
      dep("/Model_1/_class_Nested/Left", "/_class_Model/_class_Nested/Sym", {"/_class_Model": "/Model_1", "/_class_Model/_class_Nested/Sym": "/Model_1/_class_Nested/Left"}),
      ],
    },
    // Only prims that select a variant depend on that variant's site. Here /Prim1 selects primVariant=one.
    {
      root: "BasicVariant/root.usda", site: "BasicVariant/root.usda", path: "/PrimVariants{primVariant=one}",
      depMask: DependencyType.AnyNonVirtual, recurseOnSite: true, recurseOnIndex: false,
      expected: [
      dep("/Prim1", "/PrimVariants{primVariant=one}", {"/": "/", "/PrimVariants": "/Prim1"}),
      dep("/Prim1", "/PrimVariants{primVariant=one}", {"/": "/", "/PrimVariants": "/Prim1"}),
      ],
    },
    // And /Prim2 selects primVariant=two.
    {
      root: "BasicVariant/root.usda", site: "BasicVariant/root.usda", path: "/PrimVariants{primVariant=two}",
      depMask: DependencyType.AnyNonVirtual, recurseOnSite: true, recurseOnIndex: false,
      expected: [
      dep("/Prim2", "/PrimVariants{primVariant=two}", {"/": "/", "/PrimVariants": "/Prim2"}),
      dep("/Prim2", "/PrimVariants{primVariant=two}", {"/": "/", "/PrimVariants": "/Prim2"}),
      ],
    },
    // recurseOnSite works for a property path, since deps are analyzed in terms of prim arcs.
    {
      root: "BasicVariantWithConnections/root.usda", site: "BasicVariantWithConnections/camera.usda", path: "/camera.HypotheticalProperty",
      depMask: DependencyType.AnyNonVirtual, recurseOnSite: true, recurseOnIndex: false,
      expected: [
      dep("/main_cam.HypotheticalProperty", "/camera.HypotheticalProperty", {"/camera": "/main_cam"}),
      ],
    },
    // A reference arc, using recurseOnIndex to pick up child indexes that do not introduce any new deps.
    {
      root: "BasicReference/root.usda", site: "BasicReference/ref2.usda", path: "/PrimB",
      depMask: DependencyType.AnyNonVirtual, recurseOnSite: false, recurseOnIndex: true,
      expected: [
      dep("/PrimWithReferences", "/PrimB", {"/PrimB": "/PrimWithReferences"}),
      dep("/PrimWithReferences/PrimA_Child", "/PrimB/PrimA_Child", {"/PrimB": "/PrimWithReferences"}),
      dep("/PrimWithReferences/PrimB_Child", "/PrimB/PrimB_Child", {"/PrimB": "/PrimWithReferences"}),
      dep("/PrimWithReferences/PrimC_Child", "/PrimB/PrimC_Child", {"/PrimB": "/PrimWithReferences"}),
      ],
    },
    // A relocation that affects a connection target path, requiring path translation below the dependency arc.
    {
      root: "TrickyConnectionToRelocatedAttribute/root.usda", site: "TrickyConnectionToRelocatedAttribute/eye_rig.usda", path: "/EyeRig/rig/Mover.bar[/EyeRig/Anim.foo]",
      depMask: DependencyType.AnyNonVirtual, recurseOnSite: false, recurseOnIndex: false,
      expected: [
      dep("/HumanRig/rig/Face/rig/LEyeRig/rig/Mover.bar[/HumanRig/Anim/Face/LEye.foo]", "/EyeRig/rig/Mover.bar[/EyeRig/Anim.foo]", {"/EyeRig": "/HumanRig/rig/Face/rig/LEyeRig", "/EyeRig/Anim": "/HumanRig/Anim/Face/LEye"}),
      dep("/HumanRig/rig/Face/rig/REyeRig/rig/Mover.bar[/HumanRig/Anim/Face/REye.foo]", "/EyeRig/rig/Mover.bar[/EyeRig/Anim.foo]", {"/EyeRig": "/HumanRig/rig/Face/rig/REyeRig", "/EyeRig/Anim": "/HumanRig/Anim/Face/REye"}),
      dep("/HumanRig/rig/Face/rig/SymEyeRig/rig/Mover.bar[/HumanRig/rig/Face/rig/SymEyeRig/Anim.foo]", "/EyeRig/rig/Mover.bar[/EyeRig/Anim.foo]", {"/EyeRig": "/HumanRig/rig/Face/rig/SymEyeRig"}),
      ],
    },
    // Virtual dependencies are not returned when not requested.
    {
      root: "TrickyConnectionToRelocatedAttribute/root.usda", site: "TrickyConnectionToRelocatedAttribute/root.usda", path: "/HumanRig/rig/Face/rig/LEyeRig/Anim",
      depMask: DependencyType.Direct | DependencyType.Ancestral | DependencyType.NonVirtual, recurseOnSite: false, recurseOnIndex: false,
      expected: [

      ],
    },
    // Virtual dependencies are introduced by relocations (duplicated by the relocates nodes, as upstream notes).
    {
      root: "TrickyConnectionToRelocatedAttribute/root.usda", site: "TrickyConnectionToRelocatedAttribute/root.usda", path: "/HumanRig/rig/Face/rig/LEyeRig/Anim",
      depMask: DependencyType.Direct | DependencyType.Ancestral | DependencyType.Virtual, recurseOnSite: false, recurseOnIndex: false,
      expected: [
      dep("/HumanRig/Anim/Face/LEye", "/HumanRig/rig/Face/rig/LEyeRig/Anim", {"/": "/"}),
      dep("/HumanRig/Anim/Face/LEye", "/HumanRig/rig/Face/rig/LEyeRig/Anim", {"/": "/"}),
      dep("/HumanRig/Anim/Face/LEye", "/HumanRig/rig/Face/rig/LEyeRig/Anim", {"/": "/"}),
      dep("/HumanRig/Anim/Face/LEye", "/HumanRig/rig/Face/rig/LEyeRig/Anim", {"/": "/"}),
      ],
    },
]

describe('testPcpDependencies', () => {
  for (const [i, c] of CASES.entries()) {
    it(`test_Basic ${i}: ${c.site} <${c.path}>`, async () => {
      expect(await findSiteDeps(c)).toEqual([...c.expected].sort(compareDeps))
    })
  }
})

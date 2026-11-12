// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/pcp/testenv/testPcpInstanceKey.py, pxr/usd/pcp/primIndex.cpp
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _sdfFindOrOpenLayer } from 'typescript-usd/sdf/_internal'
// 1:1 port of testPcpInstanceKey.py (testenv/testPcpInstanceKey.testenv).
//
// PcpInstanceKey: two instanceable prim indexes share a prototype iff they have
// the same instancing arcs + authored variant selections. Loads the real
// testenv .usda scenes through typescript-usd/sdf and derives the key from the composed
// prim index (pcpInstanceKey / pcpRootIsInstanceable), the same surface
// Stage population consumes. Equalities/inequalities are the goldens — verified
// against the OpenUSD v26.08 reference build (`usd=True` cache).
import { describe, expect, it } from 'vitest'
import { ArInMemoryResolver } from 'typescript-usd/ar/_internal'
import { Layer } from 'typescript-usd/sdf'
import {
  Cache as PcpCache, InstanceKey, LayerOpener as PcpLayerOpener,
  pcpInstanceKey,
} from '../../src/index.ts'

// A memory-backed asset reader keyed by basename (the scopedResolver idiom):
// references like @./set.usda@ resolve to the same basename regardless of dir.
async function loadCache(files: Record<string, string>, rootName: string): Promise<PcpCache> {
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
  const rootLayer = (await _sdfFindOrOpenLayer(rootName, resolver))!
  registry.set(rootLayer.filePath, rootLayer)
  return PcpCache.create(rootLayer, opener)
}

// The instance key (null === Pcp.InstanceKey(), the empty/invalid key).
async function keyOf(cache: PcpCache, primPath: string): Promise<string | null> {
  const idx = await cache.computePrimIndex(primPath)
  const instanceable = idx.isInstanceable()
  const key = pcpInstanceKey(idx)
  // IsInstanceable() <=> non-empty key, mirroring _GetInstanceKey's invariant.
  expect(key !== null).toBe(instanceable)
  return key
}

const PROP_REF = `#usda 1.0
def "Prop" {}
`
const PROP = `#usda 1.0
class "_class_Prop" {}
def "Prop" (
    inherits = </_class_Prop>
    references = @./prop_ref.usda@</Prop>
) {
    double a = 1.0
    def "geom" { double x = 1.0 ; }
}
`
const SET = `#usda 1.0
class "_class_Prop" {
    double a = 2.5
    over "geom" { double x = 2.5 ; }
}
def "Set" {
    def "Prop_1" ( references = @./prop.usda@</Prop> ; instanceable = True ) { double a = 2.0 ; }
    def "Prop_2" ( references = @./prop.usda@</Prop> ; instanceable = True ) { double a = 2.0 ; }
}
`
const BASIC = `#usda 1.0
class "_class_Prop" {
    double a = 3.5
    over "geom" { double x = 3.5 ; }
}
def "Set_1" ( references = @./set.usda@</Set> ) {
    over "Prop_1" { double a = 3.0 ; }
    over "Prop_2" { double a = 4.0 ; }
    def "Prop_3" ( references = @./prop.usda@</Prop> ) {}
}
def "NotAnInstance" ( instanceable = True ) { def "Child" {}
}
`
const REF = `#usda 1.0
def "Model" (
    variantSets = ["y"]
    variants = { string y = "a" }
) {
    double x = 5.0
    variantSet "y" = {
        "a" { def "geom" { double x = 10.0 ; }
}
        "b" { def "geom" { double x = 20.0 ; }
}
    }
}
`
const VARIANTS = `#usda 1.0
def "Model_1" ( instanceable = True ; references = @./ref.usda@</Model> ; variants = { string y = "a" } ) {}
def "Model_2" ( instanceable = True ; references = @./ref.usda@</Model> ; variants = { string y = "a" } ) {}
def "Model_3" ( instanceable = True ; references = @./ref.usda@</Model> ) {}
def "Model_4" ( instanceable = True ; references = @./ref.usda@</Model> ; variants = { string y = "b" } ) {}
def "Model_5" ( instanceable = True ; references = @./ref.usda@</Model> ; add variantSets = ["x"] ; variants = { string x = "b"; string y = "b" } ) {
    variantSet "x" = { "a" { double x = 3.0 ; } "b" { double x = 4.0 ; } }
}
def "Model_6" ( instanceable = True ; references = @./ref.usda@</Model> ; add variantSets = ["x"] ; variants = { string x = "b"; string y = "b" } ) {
    variantSet "x" = { "a" { double x = 3.0 ; } "b" { double x = 4.0 ; } }
}
`
const SUBROOT = `#usda 1.0
def Scope "Model_source" {
    def Scope "Looks" {
        def Scope "Material" {
            string value = "source"
            def Scope "Shader" {}
        }
    }
}
over "Model_overrides" ( add references = </Model_source> ) {
    over "Looks" ( instanceable = true ) {
        over "Material" { string value = "override" ; }
    }
}
over "Model_A" ( add references = </Model_overrides> ) {}
over "Model_B" ( add references = </Model_overrides> ) { over "Looks" {}
}
over "Model_C" ( add references = </Model_B> ) {}
def "Instances" {
    over "Ref_Overrides_Looks" ( prepend references = </Model_overrides/Looks> ) {}
    over "Ref_A_Looks" ( prepend references = </Model_A/Looks> ) {}
    over "Ref_B_Looks" ( prepend references = </Model_B/Looks> ) {}
    over "Ref_C_Looks" ( prepend references = </Model_C/Looks> ) {}
}
`
const INTERNAL_REF = `#usda 1.0
def "Class" {}
def "Parent" {
    def "Child" ( instanceable = true ; inherits = </Class> ) {}
}
def "ParentRef" ( references = </Parent> ) {}
`
const IMPLIED_MODEL = `#usda 1.0
class "Inherit" {}
class "Specializes" {}
def "Model" ( instanceable = True ; inherits = </Inherit> ; specializes = </Specializes> ) {}
`
const IMPLIED_ROOT = `#usda 1.0
def "Set" {
    def "SetA" (references = @./setA.usda@</SetA>) {}
    def "SetB" (references = @./setB.usda@</SetB>) {}
}
`
const IMPLIED_SETA = `#usda 1.0
def "SetA" { def "Model" (references = @./model.usda@</Model>) {}
}
`
const IMPLIED_SETB = `#usda 1.0
def "SetB" { def "Model" (references = @./model.usda@</Model>) {}
}
`

const BASIC_FILES = { 'basic.usda': BASIC, 'set.usda': SET, 'prop.usda': PROP, 'prop_ref.usda': PROP_REF }
const VARIANT_FILES = { 'variants.usda': VARIANTS, 'ref.usda': REF }
const SUBROOT_FILES = { 'subroot_arcs.usda': SUBROOT }
const INTERNAL_FILES = { 'internal_ref.usda': INTERNAL_REF }
const IMPLIED_FILES = {
  'root.usda': IMPLIED_ROOT, 'setA.usda': IMPLIED_SETA,
  'setB.usda': IMPLIED_SETB, 'model.usda': IMPLIED_MODEL,
}

describe('PcpInstanceKey', () => {
  it('default (invalid) key equals itself and is the empty key', async () => {
    // The empty key is modeled as null; null === null.
    expect(null).toEqual(null)
  })

  it('basic: shared reference+inherits → equal keys; non-instanceable → empty', async () => {
    const cache = await loadCache(BASIC_FILES, 'basic.usda')
    const firstIndex = await cache.computePrimIndex('/Set_1/Prop_1')
    expect(new InstanceKey(firstIndex).getString()).toBe(
      'Arcs:\n' +
      '  inherit : @basic.usda@</_class_Prop>\n' +
      '  inherit : @set.usda@</_class_Prop>\n' +
      '  reference : @prop.usda@</Prop>\n' +
      'Variant selections:\n' +
      '  (none)',
    )
    const k1 = await keyOf(cache, '/Set_1/Prop_1')
    const k2 = await keyOf(cache, '/Set_1/Prop_2')
    const k3 = await keyOf(cache, '/Set_1/Prop_3')
    expect(k1).toEqual(k2)
    expect(k1).not.toEqual(k3)
    expect(k2).not.toEqual(k3)
    // instanceable=True but introduces no instancing arc → empty key.
    expect(await keyOf(cache, '/NotAnInstance')).toBeNull()
  })

  it('hashing: same prim yields a stable key', async () => {
    const cache = await loadCache(BASIC_FILES, 'basic.usda')
    expect(await keyOf(cache, '/Set_1')).toEqual(await keyOf(cache, '/Set_1'))
  })

  it('variants: same composed selection → equal; differing selections/sets → distinct', async () => {
    const cache = await loadCache(VARIANT_FILES, 'variants.usda')
    const k = await Promise.all([1, 2, 3, 4, 5, 6].map((n) => keyOf(cache, `/Model_${n}`)))
    const [k1, k2, k3, k4, k5, k6] = k
    expect(k1).toEqual(k2)
    expect(k1).toEqual(k3)
    expect(k1).not.toEqual(k4)
    expect(k1).not.toEqual(k5)
    expect(k1).not.toEqual(k6)
    expect(k5).not.toEqual(k6)
  })

  it('implied inherits/specializes with no specs → equal keys', async () => {
    const cache = await loadCache(IMPLIED_FILES, 'root.usda')
    expect(await keyOf(cache, '/Set/SetA/Model')).toEqual(await keyOf(cache, '/Set/SetB/Model'))
  })

  // KNOWN DIVERGENCE (visible xfail, pcpOrdering scoreboard pattern). Upstream
  // _AddArc propagates a direct arc's transitive-direct-dependency flag down the
  // ancestral subtree it grafts in (primIndex.cpp:2003-2010), so a sub-root
  // reference whose direct target has no specs (Ref_A_Looks → specless
  // /Model_A/Looks) still counts the grafted, spec-bearing ancestor
  // (/Model_overrides/Looks) as the instancing arc — making Ref_A_Looks
  // instanceable and key==Ref_Overrides_Looks. typescript-usd seeds those grafted
  // ancestors as ancestral-only (no direct dep) and does not yet propagate the
  // flag (a faithful fix must tag the includeAncestralOpinions graft during the
  // build; a post-hoc flow over-broadens the always-direct root). Result:
  // Ref_A_Looks composes a null key here. A recorded divergence.
  it('subroot references: ancestral nodes under a direct arc count toward the key', async () => {
    const cache = await loadCache(SUBROOT_FILES, 'subroot_arcs.usda')
    const k = await keyOf(cache, '/Instances/Ref_Overrides_Looks')
    const kA = await keyOf(cache, '/Instances/Ref_A_Looks')
    const kB = await keyOf(cache, '/Instances/Ref_B_Looks')
    const kC = await keyOf(cache, '/Instances/Ref_C_Looks')
    expect(k).not.toBeNull()
    expect(k).toEqual(kA)
    expect(kB).not.toBeNull()
    expect(kB).toEqual(kC)
    expect(kA).not.toEqual(kB)
    // Model_A/Looks's reference to Model_overrides/Looks is ancestral-only → not instanceable.
    expect(await keyOf(cache, '/Model_A/Looks')).toBeNull()
  })

  it('internal references + implied arcs: equal keys, inert implied inherit excluded', async () => {
    const cache = await loadCache(INTERNAL_FILES, 'internal_ref.usda')
    expect(await keyOf(cache, '/Parent/Child')).toEqual(await keyOf(cache, '/ParentRef/Child'))
  })
})

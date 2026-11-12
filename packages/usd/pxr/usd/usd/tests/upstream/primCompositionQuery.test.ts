// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usd/testenv/testUsdPrimCompositionQuery.py
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _setResolverForTest } from 'typescript-usd/usd/_internal'
// Ported from pxr/usd/usd/testenv/testUsdPrimCompositionQuery.py
//
// Upstream enumerates a prim's composition arcs via Usd.PrimCompositionQuery
// (one entry per PcpNode, including nodes with NO specs) and exercises the
// arc-type / has-specs / dependency-type / arc-introduced FILTERS plus the
// introducing-node provenance APIs.
//
// typescript-usd exposes a narrower surface: Stage.getPrimStack(path) returns the
// prim's contributing SPECS, strongest-first (the analog of
// UsdPrim::GetPrimStackWithLayerOffsets), each tagged with the outermost
// composition arc that brought it in, its source layer/path, and the
// cumulative layer offset. There is no PrimCompositionQuery filter object and
// no enumeration of has-specs=false nodes, so this file ports the observable
// arc/spec PROVENANCE getPrimStack gives and marks the filter/predicate
// surface as visible it.fails xfails. Global variant fallbacks ARE supported
// (Stage.setGlobalVariantFallbacks, 2026-07-07), mirroring the upstream
// suite's setUpClass configuration.
//
// Goldens captured from the Pixar 26.05 reference build
// (the v26.05 reference build, python3.9) over the upstream test.usda fixture:
//
//   Usd.Stage.SetGlobalVariantFallbacks({"standin":["render"]})
//   prim = Usd.Stage.Open('test.usda').GetPrimAtPath('/Sarah')
//   for s in prim.GetPrimStack(): print(s.layer.identifier, s.path)
//
import { beforeEach, describe, expect, it } from 'vitest'
import {
  Stage, PrimCompositionQuery, type PrimCompositionQueryArc,
  type PrimCompositionQueryArcTypeFilter, type PrimCompositionQueryArcIntroducedFilter,
  type PrimCompositionQueryDependencyTypeFilter, type PrimCompositionQueryHasSpecsFilter,
} from 'typescript-usd/usd'
import { ArcType } from 'typescript-usd/pcp'
import {
  Reference as SdfReference, Payload as SdfPayload, type Layer, type ListEditorProxy,
} from 'typescript-usd/sdf'
import { SdfPath } from 'typescript-usd/sdf/path'
import { ArInMemoryResolver } from 'typescript-usd/usd/_internal'

// ---- Upstream testenv fixture, inlined and served through ArInMemoryResolver ----
// (verbatim from testUsdPrimCompositionQuery.testenv/*.usda, except the
// already-commented-out inherits line in testAPI_root.usda's
// _class_Sarah_Specialized, which upstream also leaves commented.)

const TEST_USDA = `#usda 1.0
(
    relocates = {
        </Sarah/Child_Will_Be_Moved>: </Sarah/Child_Moved>,
    }
)

class "_class_Sarah"
{
    custom color3d displayColor = (1, 1, 1)
}

def "Sarah" (
    add references = [@test.usda@</Sarah_Defaults>,
                      @testAPI_root.usda@</Sarah_Ref>]
    add payload = [</Sarah_Internal_Payload>,
                    @testAPI_root.usda@</Sarah_Payload>]
    add variantSets = ["displayColor", "standin"]
    add inherits = </_class_Sarah>
    variants = {
        string displayColor = "red"
        string lod = "full"
    }
)
{
    custom color3d displayColor = (0.1, 0.2, 0.3)

    variantSet "displayColor" = {
        "green" {
            custom color3d displayColor = (0, 1, 0)
        }
        "red" {
            custom color3d displayColor = (1, 0, 0)
        }
    }

    variantSet "standin" = {
        "anim" {
        }
        "render" (
            add variantSets = ["lod"]
        ) {
            variantSet "lod" = {
                "full" {
                    def Scope "Geom" {
                        def Cone "Cone" {
                        }
                    }
                }
                "lite" {
                    def Scope "Geom" {
                        def Sphere "Sphere" {
                        }
                    }
                }
            }
        }
    }
}

def "Sarah_Defaults" (
    add references = [@test.usda@</Sarah_Base>,
                      @test.usda@</Sarah_Base> (offset = 10)]
)
{
    custom color3d displayColor = (0, 0, 1)
}

def Scope "Sarah_Base" (
    add variantSets = "displayColor"
    variants = {
        string displayColor = "red"
    }
)
{
    variantSet "displayColor" = {
        "green" {
            custom color3d displayColor = (0, 0.8, 0)
        }
        "red" {
            custom color3d displayColor = (0.8, 0, 0)
        }
    }
}

def "Sarah_Internal_Payload"
{
}

def "Sarah_Container" (
    add references = [@testAPI_root.usda@</Sarah_Container_Ref>]
)
{
    over "_class_Sarah_Specialized" (
        inherits = </Sarah_Container/_class_Sarah_Inherited>
    )
    {
    }
}
`

const TESTAPI_ROOT_USDA = `#usda 1.0
(
    subLayers = [
        @testAPI_sub1.usda@,
        @testAPI_sub2.usda@
    ]
)

def "Sarah_Ref" (
    add inherits = </_class_Sarah_Ref>
)
{
    custom color3d color = (1, 1, 1)
    def "Child_Will_Be_Moved"
    {
    }
}

class "_class_Sarah_Ref"
{

}

def "Sarah_Container_Ref" (
)
{
    class "_class_Sarah_Specialized" (
    #    inherits = </Sarah_Container_Ref/_class_Sarah_Inherited>
    )
    {
    }

    class "_class_Sarah_Inherited"
    {
    }
}
`

const TESTAPI_SUB1_USDA = `#usda 1.0

over "Sarah_Ref" (
    add inherits = </_class_Sarah_Ref_Sub1>
)
{
}

class "_class_Sarah_Ref_Sub1"
{
    custom color3d color = (0, 1, 0)
    custom color3d sub1Color = (1, 1, 1)
}
`

const TESTAPI_SUB2_USDA = `#usda 1.0

over "Sarah"
{
    custom color3d color = (0, 0, 1)
    custom color3d sub2Color = (1, 1, 1)
}

def "Sarah_Payload" (
    add specializes = </Sarah_Container/_class_Sarah_Specialized>
)
{
}
`

const FILES: Record<string, string> = {
  'test.usda': TEST_USDA,
  'testAPI_root.usda': TESTAPI_ROOT_USDA,
  'testAPI_sub1.usda': TESTAPI_SUB1_USDA,
  'testAPI_sub2.usda': TESTAPI_SUB2_USDA,
}

beforeEach(() => {
  // Tests that need fallbacks set them explicitly; reset so the module-global
  // map never leaks between tests (it only affects stages opened AFTER a set).
  Stage.setGlobalVariantFallbacks({})
  _setResolverForTest(new ArInMemoryResolver(Object.fromEntries(
    Object.entries(FILES).map(([name, text]) => [name, new TextEncoder().encode(text)]),
  )))
})

interface Entry { layer: string; path: string; arc: string; offset: number }

// The full Pixar GetPrimStack golden for /Sarah, in strength order, captured
// from the 26.05 reference build (see header) with the upstream suite's
// setUpClass fallbacks configured (SetGlobalVariantFallbacks({"standin":
// ["render"]})). Each PcpNode that has specs across every layer of its
// node's layer stack appears here. Both former gaps are CLOSED (2026-07-07):
//   GAP A — Stage.setGlobalVariantFallbacks now threads to
//           PcpCache.setVariantFallbacks (the standin=render / lod=full
//           variant specs below), and
//   GAP B — the ancestral specialize spec under the Sarah_Container_Ref
//           reference surfaces (closed by the 2026-07 pcp ordering
//           campaign's per-node EvalImpliedClasses port, 4c4e50e/7889212).
const PIXAR_PRIM_STACK: Entry[] = [
  { layer: 'test.usda', path: '/Sarah', arc: 'local', offset: 0 },
  { layer: 'test.usda', path: '/_class_Sarah', arc: 'inherit', offset: 0 },
  { layer: 'test.usda', path: '/Sarah{displayColor=red}', arc: 'variant', offset: 0 },
  { layer: 'test.usda', path: '/Sarah{standin=render}', arc: 'variant', offset: 0 },
  { layer: 'test.usda', path: '/Sarah{standin=render}{lod=full}', arc: 'variant', offset: 0 },
  { layer: 'test.usda', path: '/Sarah_Defaults', arc: 'reference', offset: 0 },
  { layer: 'test.usda', path: '/Sarah_Base', arc: 'reference', offset: 0 },
  { layer: 'test.usda', path: '/Sarah_Base{displayColor=red}', arc: 'variant', offset: 0 },
  { layer: 'test.usda', path: '/Sarah_Base', arc: 'reference', offset: 10 },
  { layer: 'test.usda', path: '/Sarah_Base{displayColor=red}', arc: 'variant', offset: 10 },
  { layer: 'testAPI_root.usda', path: '/Sarah_Ref', arc: 'reference', offset: 0 },
  { layer: 'testAPI_sub1.usda', path: '/Sarah_Ref', arc: 'reference', offset: 0 },
  { layer: 'testAPI_sub1.usda', path: '/_class_Sarah_Ref_Sub1', arc: 'inherit', offset: 0 },
  { layer: 'testAPI_root.usda', path: '/_class_Sarah_Ref', arc: 'inherit', offset: 0 },
  { layer: 'test.usda', path: '/Sarah_Internal_Payload', arc: 'payload', offset: 0 },
  { layer: 'testAPI_sub2.usda', path: '/Sarah_Payload', arc: 'payload', offset: 0 },
  { layer: 'test.usda', path: '/Sarah_Container/_class_Sarah_Specialized', arc: 'specialize', offset: 0 },
  { layer: 'testAPI_root.usda', path: '/Sarah_Container_Ref/_class_Sarah_Inherited', arc: 'reference', offset: 0 },
  { layer: 'testAPI_root.usda', path: '/Sarah_Container_Ref/_class_Sarah_Specialized', arc: 'reference', offset: 0 },
]

// The same stack composed with NO variant fallbacks configured: the `standin`
// set has no authored selection anywhere, so its variant nodes are absent.
// Verified live against the 26.05 build (SetGlobalVariantFallbacks({});
// 2026-07-07) — every other entry is identical, in the same order.
const NO_FALLBACK_PRIM_STACK: Entry[] =
  PIXAR_PRIM_STACK.filter(e => !(e.arc === 'variant' && e.path.includes('standin')))

function primStack(stage: Stage, path: string): Entry[] {
  return stage.getPrimStack(path).map(e => ({
    layer: e.layerIdentifier.split('/').pop() ?? e.layerIdentifier,
    path: e.specPath,
    arc: e.arc,
    offset: e.offset.offset,
  }))
}

describe('UsdPrimCompositionQuery / prim-stack arc provenance', () => {
  // The upstream suite's setUpClass configures
  // Usd.Stage.SetGlobalVariantFallbacks({"standin":["render"]}) before
  // opening; mirror that per-test (the map only affects stages created
  // after the call, so each test sets what it composes with).
  it('enumerates /Sarah composition specs strongest-first, matching the full Pixar prim stack', async () => {
    Stage.setGlobalVariantFallbacks({ standin: ['render'] })
    const stage = (await Stage.open('test.usda'))!
    expect(primStack(stage, '/Sarah')).toEqual(PIXAR_PRIM_STACK)
  })

  it('with no fallbacks configured, the standin variant legs are absent (live-oracle verified)', async () => {
    Stage.setGlobalVariantFallbacks({})
    const stage = (await Stage.open('test.usda'))!
    expect(primStack(stage, '/Sarah')).toEqual(NO_FALLBACK_PRIM_STACK)
  })

  it('tags each spec with the outermost composition arc that introduced it', async () => {
    Stage.setGlobalVariantFallbacks({ standin: ['render'] })
    const stage = (await Stage.open('test.usda'))!
    const counts: Record<string, number> = {}
    for (const e of primStack(stage, '/Sarah')) counts[e.arc] = (counts[e.arc] ?? 0) + 1
    expect(counts).toEqual({
      local: 1,
      inherit: 3,
      variant: 5,
      reference: 7,
      payload: 2,
      specialize: 1,
    })
  })

  it('carries the layer offset of the (offset = 10) reference down to its specs', async () => {
    const stage = (await Stage.open('test.usda'))!
    const offset10 = primStack(stage, '/Sarah').filter(e => e.offset === 10)
    expect(offset10).toEqual([
      { layer: 'test.usda', path: '/Sarah_Base', arc: 'reference', offset: 10 },
      { layer: 'test.usda', path: '/Sarah_Base{displayColor=red}', arc: 'variant', offset: 10 },
    ])
  })

  it('reaches reference specs through both layers of the referenced layer stack', async () => {
    // The Sarah_Ref reference pulls in specs from BOTH testAPI_root.usda and
    // its sublayer testAPI_sub1.usda — one PcpNode, two contributing specs.
    const stage = (await Stage.open('test.usda'))!
    const sarahRef = primStack(stage, '/Sarah').filter(e => e.path === '/Sarah_Ref')
    expect(sarahRef).toEqual([
      { layer: 'testAPI_root.usda', path: '/Sarah_Ref', arc: 'reference', offset: 0 },
      { layer: 'testAPI_sub1.usda', path: '/Sarah_Ref', arc: 'reference', offset: 0 },
    ])
  })

  it('resolves the relocated child prim and its source spec', async () => {
    const stage = (await Stage.open('test.usda'))!
    // The relocate moved /Sarah/Child_Will_Be_Moved -> /Sarah/Child_Moved.
    expect(stage.has('/Sarah/Child_Will_Be_Moved')).toBe(false)
    expect(stage.has('/Sarah/Child_Moved')).toBe(true)
    // Pixar's GetPrimStack for the relocated child returns the single source
    // spec it came in through (the reference); the relocate node itself has no
    // specs so it does not appear in the prim stack.
    expect(primStack(stage, '/Sarah/Child_Moved')).toEqual([
      { layer: 'testAPI_root.usda', path: '/Sarah_Ref/Child_Will_Be_Moved', arc: 'reference', offset: 0 },
    ])
  })

  it('returns an empty stack for an unknown prim path', async () => {
    const stage = (await Stage.open('test.usda'))!
    expect(stage.getPrimStack('/Nonexistent')).toEqual([])
  })
})

// ---- Former gaps, kept as targeted checks of the prim stack ----

describe('UsdPrimCompositionQuery / prim-stack former gaps', () => {
  // FORMER GAP A — CLOSED 2026-07-07. Stage.setGlobalVariantFallbacks
  // (UsdStage::SetGlobalVariantFallbacks) selects the standin=render variant
  // (and, through it, lod=full), adding 2 variant specs to /Sarah's prim
  // stack; covered by the full-golden test above. Kept here: the arcs it
  // introduces, specifically.
  it('GlobalVariantFallbacks selects the standin=render / lod=full variant arcs', async () => {
    Stage.setGlobalVariantFallbacks({ standin: ['render'] })
    const stage = (await Stage.open('test.usda'))!
    const stack = primStack(stage, '/Sarah')
    expect(stack).toContainEqual(
      { layer: 'test.usda', path: '/Sarah{standin=render}', arc: 'variant', offset: 0 })
    expect(stack).toContainEqual(
      { layer: 'test.usda', path: '/Sarah{standin=render}{lod=full}', arc: 'variant', offset: 0 })
  })

  // FORMER GAP B — CLOSED 2026-07-07 (the ancestral specialize spec under
  // the Sarah_Container_Ref reference surfaces, matching the live oracle).
  it('ancestral specialize arc under a reference surfaces its class spec', async () => {
    Stage.setGlobalVariantFallbacks({})
    const stage = (await Stage.open('test.usda'))!
    const stack = primStack(stage, '/Sarah')
    expect(stack).toContainEqual({
      layer: 'testAPI_root.usda',
      path: '/Sarah_Container_Ref/_class_Sarah_Specialized',
      arc: 'reference',
      offset: 0,
    })
  })
})

// ---- testUsdPrimCompositionQuery.py ----

const ArcTypeFilter = PrimCompositionQuery.ArcTypeFilter
const ArcIntroducedFilter = PrimCompositionQuery.ArcIntroducedFilter
const DependencyTypeFilter = PrimCompositionQuery.DependencyTypeFilter
const HasSpecsFilter = PrimCompositionQuery.HasSpecsFilter

// Layers compare by their base name (the fixtures are served by name).
function layerName(layer: { identifier: string } | null | undefined): string | null {
  if (!layer) return null
  return layer.identifier.split('/').pop() ?? layer.identifier
}

// A list-op entry in comparable form: SdfPath values by their string.
function listEntry(value: unknown): unknown {
  return value instanceof SdfPath ? value.pathString : value
}

interface ArcValues {
  nodeLayerStack: string | null
  nodePath: string
  arcType: ArcType
  hasSpecs: boolean
  introLayerStack: string | null
  introLayer: string | null
  introPath: string
  introInListEdit: unknown
  isImplicit: boolean
  isAncestral: boolean
  isIntroRootLayer: boolean
  isIntroRootLayerPrim: boolean
}

// _GetArcValuesDict (testUsdPrimCompositionQuery.py:16-28).
function getArcValuesDict(arc: PrimCompositionQueryArc): ArcValues {
  return {
    nodeLayerStack: layerName(arc.getTargetLayer()),
    nodePath: arc.getTargetPrimPath().pathString,
    arcType: arc.getArcType(),
    hasSpecs: arc.hasSpecs(),
    introLayerStack: layerName(
      arc.getIntroducingNode().layerStack.identifier.rootLayer as Layer),
    introLayer: layerName(arc.getIntroducingLayer()),
    introPath: arc.getIntroducingPrimPath().pathString,
    introInListEdit: listEntry(arc.getIntroducingListEditor()[1]),
    isImplicit: arc.isImplicit(),
    isAncestral: arc.isAncestral(),
    isIntroRootLayer: arc.isIntroducedInRootLayerStack(),
    isIntroRootLayerPrim: arc.isIntroducedInRootLayerPrimSpec(),
  }
}

// Explicit set of expected values that should match the unfiltered query
// (testUsdPrimCompositionQuery.py:73-359).
const EXPECTED_VALUES: ArcValues[] = [
  {nodeLayerStack: 'test.usda',
   nodePath: '/Sarah',
   arcType: ArcType.Root,
   hasSpecs: true,
   introLayerStack: 'test.usda',
   introLayer: null,
   introPath: '',
   introInListEdit: null,
   isImplicit: false,
   isAncestral: false,
   isIntroRootLayer: true,
   isIntroRootLayerPrim: true},

  {nodeLayerStack: 'test.usda',
   nodePath: '/_class_Sarah',
   arcType: ArcType.Inherit,
   hasSpecs: true,
   introLayerStack: 'test.usda',
   introLayer: 'test.usda',
   introPath: '/Sarah',
   introInListEdit: '/_class_Sarah',
   isImplicit: false,
   isAncestral: false,
   isIntroRootLayer: true,
   isIntroRootLayerPrim: true},

  {nodeLayerStack: 'test.usda',
   nodePath: '/_class_Sarah_Ref_Sub1',
   arcType: ArcType.Inherit,
   hasSpecs: false,
   introLayerStack: 'testAPI_root.usda',
   introLayer: 'testAPI_sub1.usda',
   introPath: '/Sarah_Ref',
   introInListEdit: '/_class_Sarah_Ref_Sub1',
   isImplicit: true,
   isAncestral: false,
   isIntroRootLayer: false,
   isIntroRootLayerPrim: false},

  {nodeLayerStack: 'test.usda',
   nodePath: '/_class_Sarah_Ref',
   arcType: ArcType.Inherit,
   hasSpecs: false,
   introLayerStack: 'testAPI_root.usda',
   introLayer: 'testAPI_root.usda',
   introPath: '/Sarah_Ref',
   introInListEdit: '/_class_Sarah_Ref',
   isImplicit: true,
   isAncestral: false,
   isIntroRootLayer: false,
   isIntroRootLayerPrim: false},

  {nodeLayerStack: 'test.usda',
   nodePath: '/Sarah{displayColor=red}',
   arcType: ArcType.Variant,
   hasSpecs: true,
   introLayerStack: 'test.usda',
   introLayer: 'test.usda',
   introPath: '/Sarah',
   introInListEdit: 'displayColor',
   isImplicit: false,
   isAncestral: false,
   isIntroRootLayer: true,
   isIntroRootLayerPrim: true},

  {nodeLayerStack: 'test.usda',
   nodePath: '/Sarah{standin=render}',
   arcType: ArcType.Variant,
   hasSpecs: true,
   introLayerStack: 'test.usda',
   introLayer: 'test.usda',
   introPath: '/Sarah',
   introInListEdit: 'standin',
   isImplicit: false,
   isAncestral: false,
   isIntroRootLayer: true,
   isIntroRootLayerPrim: true},

  {nodeLayerStack: 'test.usda',
   nodePath: '/Sarah{standin=render}{lod=full}',
   arcType: ArcType.Variant,
   hasSpecs: true,
   introLayerStack: 'test.usda',
   introLayer: 'test.usda',
   introPath: '/Sarah{standin=render}',
   introInListEdit: 'lod',
   isImplicit: false,
   isAncestral: false,
   isIntroRootLayer: true,
   isIntroRootLayerPrim: false},

  {nodeLayerStack: 'test.usda',
   nodePath: '/Sarah_Defaults',
   arcType: ArcType.Reference,
   hasSpecs: true,
   introLayerStack: 'test.usda',
   introLayer: 'test.usda',
   introPath: '/Sarah',
   introInListEdit: new SdfReference('test.usda', '/Sarah_Defaults'),
   isImplicit: false,
   isAncestral: false,
   isIntroRootLayer: true,
   isIntroRootLayerPrim: true},

  {nodeLayerStack: 'test.usda',
   nodePath: '/Sarah_Base',
   arcType: ArcType.Reference,
   hasSpecs: true,
   introLayerStack: 'test.usda',
   introLayer: 'test.usda',
   introPath: '/Sarah_Defaults',
   introInListEdit: new SdfReference('test.usda', '/Sarah_Base'),
   isImplicit: false,
   isAncestral: false,
   isIntroRootLayer: true,
   isIntroRootLayerPrim: false},

  {nodeLayerStack: 'test.usda',
   nodePath: '/Sarah_Base{displayColor=red}',
   arcType: ArcType.Variant,
   hasSpecs: true,
   introLayerStack: 'test.usda',
   introLayer: 'test.usda',
   introPath: '/Sarah_Base',
   introInListEdit: 'displayColor',
   isImplicit: false,
   isAncestral: false,
   isIntroRootLayer: true,
   isIntroRootLayerPrim: false},

  {nodeLayerStack: 'test.usda',
   nodePath: '/Sarah_Base',
   arcType: ArcType.Reference,
   hasSpecs: true,
   introLayerStack: 'test.usda',
   introLayer: 'test.usda',
   introPath: '/Sarah_Defaults',
   introInListEdit: new SdfReference('test.usda', '/Sarah_Base', { offset: 10, scale: 1 }),
   isImplicit: false,
   isAncestral: false,
   isIntroRootLayer: true,
   isIntroRootLayerPrim: false},

  {nodeLayerStack: 'test.usda',
   nodePath: '/Sarah_Base{displayColor=red}',
   arcType: ArcType.Variant,
   hasSpecs: true,
   introLayerStack: 'test.usda',
   introLayer: 'test.usda',
   introPath: '/Sarah_Base',
   introInListEdit: 'displayColor',
   isImplicit: false,
   isAncestral: false,
   isIntroRootLayer: true,
   isIntroRootLayerPrim: false},

  {nodeLayerStack: 'testAPI_root.usda',
   nodePath: '/Sarah_Ref',
   arcType: ArcType.Reference,
   hasSpecs: true,
   introLayerStack: 'test.usda',
   introLayer: 'test.usda',
   introPath: '/Sarah',
   introInListEdit: new SdfReference('testAPI_root.usda', '/Sarah_Ref'),
   isImplicit: false,
   isAncestral: false,
   isIntroRootLayer: true,
   isIntroRootLayerPrim: true},

  {nodeLayerStack: 'testAPI_root.usda',
   nodePath: '/_class_Sarah_Ref_Sub1',
   arcType: ArcType.Inherit,
   hasSpecs: true,
   introLayerStack: 'testAPI_root.usda',
   introLayer: 'testAPI_sub1.usda',
   introPath: '/Sarah_Ref',
   introInListEdit: '/_class_Sarah_Ref_Sub1',
   isImplicit: false,
   isAncestral: false,
   isIntroRootLayer: false,
   isIntroRootLayerPrim: false},

  {nodeLayerStack: 'testAPI_root.usda',
   nodePath: '/_class_Sarah_Ref',
   arcType: ArcType.Inherit,
   hasSpecs: true,
   introLayerStack: 'testAPI_root.usda',
   introLayer: 'testAPI_root.usda',
   introPath: '/Sarah_Ref',
   introInListEdit: '/_class_Sarah_Ref',
   isImplicit: false,
   isAncestral: false,
   isIntroRootLayer: false,
   isIntroRootLayerPrim: false},

  {nodeLayerStack: 'test.usda',
   nodePath: '/Sarah_Internal_Payload',
   arcType: ArcType.Payload,
   hasSpecs: true,
   introLayerStack: 'test.usda',
   introLayer: 'test.usda',
   introPath: '/Sarah',
   introInListEdit: new SdfPayload('', '/Sarah_Internal_Payload'),
   isImplicit: false,
   isAncestral: false,
   isIntroRootLayer: true,
   isIntroRootLayerPrim: true},

  {nodeLayerStack: 'testAPI_root.usda',
   nodePath: '/Sarah_Payload',
   arcType: ArcType.Payload,
   hasSpecs: true,
   introLayerStack: 'test.usda',
   introLayer: 'test.usda',
   introPath: '/Sarah',
   introInListEdit: new SdfPayload('testAPI_root.usda', '/Sarah_Payload'),
   isImplicit: false,
   isAncestral: false,
   isIntroRootLayer: true,
   isIntroRootLayerPrim: true},

  {nodeLayerStack: 'test.usda',
   nodePath: '/Sarah_Container/_class_Sarah_Specialized',
   arcType: ArcType.Specialize,
   hasSpecs: true,
   introLayerStack: 'testAPI_root.usda',
   introLayer: 'testAPI_sub2.usda',
   introPath: '/Sarah_Payload',
   introInListEdit: '/Sarah_Container/_class_Sarah_Specialized',
   isImplicit: true,
   isAncestral: false,
   isIntroRootLayer: false,
   isIntroRootLayerPrim: false},

  {nodeLayerStack: 'test.usda',
   nodePath: '/Sarah_Container/_class_Sarah_Inherited',
   arcType: ArcType.Inherit,
   hasSpecs: false,
   introLayerStack: 'test.usda',
   introLayer: 'test.usda',
   introPath: '/Sarah_Container/_class_Sarah_Specialized',
   introInListEdit: '/Sarah_Container/_class_Sarah_Inherited',
   isImplicit: false,
   isAncestral: false,
   isIntroRootLayer: true,
   isIntroRootLayerPrim: false},

  {nodeLayerStack: 'testAPI_root.usda',
   nodePath: '/Sarah_Container_Ref/_class_Sarah_Inherited',
   arcType: ArcType.Reference,
   hasSpecs: true,
   introLayerStack: 'test.usda',
   introLayer: 'test.usda',
   introPath: '/Sarah_Container',
   introInListEdit: new SdfReference('testAPI_root.usda', '/Sarah_Container_Ref'),
   isImplicit: false,
   isAncestral: true,
   isIntroRootLayer: true,
   isIntroRootLayerPrim: false},

  {nodeLayerStack: 'testAPI_root.usda',
   nodePath: '/Sarah_Container_Ref/_class_Sarah_Specialized',
   arcType: ArcType.Reference,
   hasSpecs: true,
   introLayerStack: 'test.usda',
   introLayer: 'test.usda',
   introPath: '/Sarah_Container',
   introInListEdit: new SdfReference('testAPI_root.usda', '/Sarah_Container_Ref'),
   isImplicit: false,
   isAncestral: true,
   isIntroRootLayer: true,
   isIntroRootLayerPrim: false},

  {nodeLayerStack: 'testAPI_root.usda',
   nodePath: '/Sarah_Container/_class_Sarah_Specialized',
   arcType: ArcType.Specialize,
   hasSpecs: false,
   introLayerStack: 'testAPI_root.usda',
   introLayer: 'testAPI_sub2.usda',
   introPath: '/Sarah_Payload',
   introInListEdit: '/Sarah_Container/_class_Sarah_Specialized',
   isImplicit: false,
   isAncestral: false,
   isIntroRootLayer: false,
   isIntroRootLayerPrim: false},
]

describe('testUsdPrimCompositionQuery.py', () => {
  it('test_PrimCompositionQuery', async () => {
    // setUpClass (testUsdPrimCompositionQuery.py:54-58).
    Stage.setGlobalVariantFallbacks({ standin: ['render'] })

    const stage = (await Stage.open('test.usda'))!
    expect(stage).toBeTruthy()

    const prim = stage.getPrim('/Sarah')
    expect(prim).toBeTruthy()

    const expectedValues = EXPECTED_VALUES

    // Create the query on the prim.
    let query = new PrimCompositionQuery(prim!)

    // Verify the arcs match the expected arcs.
    const verifyExpectedArcs = (
      arcs: PrimCompositionQueryArc[], expectedArcValues: ArcValues[],
    ): void => {
      expect(arcs.length).toBe(expectedArcValues.length)
      arcs.forEach((arc, i) => {
        expect(arc.getTargetNode().path).toEqual(arc.getTargetPrimPath())
        expect(arc.getTargetNode().layerStack.identifier.rootLayer).toBe(arc.getTargetLayer())
        expect(getArcValuesDict(arc)).toEqual(expectedArcValues[i])
      })
    }

    // Helper function for verifying that the introducing layer and path for
    // an arc actually introduce the arc.
    const verifyArcIntroducingInfo = (arc: PrimCompositionQueryArc): void => {
      const [listEditor, entry] = arc.getIntroducingListEditor()
      if (arc.getArcType() === ArcType.Root) {
        expect(listEditor).toBeNull()
        expect(entry).toBeNull()
        expect(arc.getTargetNode().equals(arc.getIntroducingNode())).toBe(true)
        expect(arc.getIntroducingLayer()).toBeFalsy()
        expect(arc.getIntroducingPrimPath().isEmpty()).toBe(true)
      } else if (arc.getArcType() === ArcType.Relocate) {
        // Confirm that the introducing layer contains the entry for the
        // relocates arc.
        const introLayer = arc.getIntroducingLayer()!
        const relocate = [arc.getTargetPrimPath().pathString,
          arc.getTargetNode().getIntroPath().pathString]
        expect(introLayer.getRelocates()).toContainEqual(relocate)
      } else {
        // The introducing prim spec is obtained from the introducing layer
        // and prim path.
        const primSpec = arc.getIntroducingLayer()!.getPrimAtPath(arc.getIntroducingPrimPath())
        expect(primSpec).toBeTruthy()
        expect(listEditor).toBeTruthy()
        expect(entry).toBeTruthy()
        const listEntries = (listEditor as ListEditorProxy<unknown>).applyEditsToList([])
        expect(listEntries.length).toBeGreaterThan(0)
        expect(listEntries.map(listEntry)).toContainEqual(listEntry(entry))
        switch (arc.getArcType()) {
          case ArcType.Reference:
            expect(listEntries).toEqual(primSpec!.getReferenceList().applyEditsToList([]))
            break
          case ArcType.Payload:
            expect(listEntries).toEqual(primSpec!.getPayloadList().applyEditsToList([]))
            break
          case ArcType.Inherit:
            expect(listEntries).toEqual(primSpec!.getInheritPathList().applyEditsToList([]))
            break
          case ArcType.Specialize:
            expect(listEntries).toEqual(primSpec!.getSpecializesList().applyEditsToList([]))
            break
          case ArcType.Variant:
            expect(listEntries).toEqual(primSpec!.getVariantSetNameList().applyEditsToList([]))
            break
        }
      }
    }

    // Updates the query with a new filter and compares expected values while
    // also checking that our introducing layers have specs that actually
    // introduce the arc.
    const checkWithFilter = (
      expectedFilteredValues: ArcValues[],
      {
        arcTypeFilter = ArcTypeFilter.All,
        arcIntroducedFilter = ArcIntroducedFilter.All,
        dependencyTypeFilter = DependencyTypeFilter.All,
        hasSpecsFilter = HasSpecsFilter.All,
      }: {
        arcTypeFilter?: PrimCompositionQueryArcTypeFilter
        arcIntroducedFilter?: PrimCompositionQueryArcIntroducedFilter
        dependencyTypeFilter?: PrimCompositionQueryDependencyTypeFilter
        hasSpecsFilter?: PrimCompositionQueryHasSpecsFilter
      } = {},
    ): void => {
      // Create an updated filter for the query.
      const qFilter = new PrimCompositionQuery.Filter()
      qFilter.arcTypeFilter = arcTypeFilter
      qFilter.arcIntroducedFilter = arcIntroducedFilter
      qFilter.dependencyTypeFilter = dependencyTypeFilter
      qFilter.hasSpecsFilter = hasSpecsFilter
      query.filter = qFilter

      // Query the composition arcs.
      const arcs = query.getCompositionArcs()

      // Verify the arcs match the expected arcs.
      verifyExpectedArcs(arcs, expectedFilteredValues)

      // Verify that the "introducing" APIs return what we expect for each
      // arc.
      for (const arc of arcs) verifyArcIntroducingInfo(arc)
    }

    // First verify the unfiltered query.
    checkWithFilter(expectedValues)

    // Now we verify each single type filter.

    // Arc type filters
    let filteredExpectedValues = expectedValues.filter(d => d.arcType === ArcType.Reference)
    expect(filteredExpectedValues.length).toBe(6)
    checkWithFilter(filteredExpectedValues, { arcTypeFilter: ArcTypeFilter.Reference })

    filteredExpectedValues = expectedValues.filter(d => d.arcType === ArcType.Payload)
    expect(filteredExpectedValues.length).toBe(2)
    checkWithFilter(filteredExpectedValues, { arcTypeFilter: ArcTypeFilter.Payload })

    filteredExpectedValues = expectedValues.filter(d => d.arcType === ArcType.Inherit)
    expect(filteredExpectedValues.length).toBe(6)
    checkWithFilter(filteredExpectedValues, { arcTypeFilter: ArcTypeFilter.Inherit })

    filteredExpectedValues = expectedValues.filter(d => d.arcType === ArcType.Specialize)
    expect(filteredExpectedValues.length).toBe(2)
    checkWithFilter(filteredExpectedValues, { arcTypeFilter: ArcTypeFilter.Specialize })

    filteredExpectedValues = expectedValues.filter(d => d.arcType === ArcType.Variant)
    expect(filteredExpectedValues.length).toBe(5)
    checkWithFilter(filteredExpectedValues, { arcTypeFilter: ArcTypeFilter.Variant })

    filteredExpectedValues = expectedValues.filter(
      d => [ArcType.Reference, ArcType.Payload].includes(d.arcType))
    expect(filteredExpectedValues.length).toBe(8)
    checkWithFilter(filteredExpectedValues, { arcTypeFilter: ArcTypeFilter.ReferenceOrPayload })

    filteredExpectedValues = expectedValues.filter(
      d => [ArcType.Inherit, ArcType.Specialize].includes(d.arcType))
    expect(filteredExpectedValues.length).toBe(8)
    checkWithFilter(filteredExpectedValues, { arcTypeFilter: ArcTypeFilter.InheritOrSpecialize })

    filteredExpectedValues = expectedValues.filter(
      d => ![ArcType.Reference, ArcType.Payload].includes(d.arcType))
    expect(filteredExpectedValues.length).toBe(14)
    checkWithFilter(filteredExpectedValues, { arcTypeFilter: ArcTypeFilter.NotReferenceOrPayload })

    filteredExpectedValues = expectedValues.filter(
      d => ![ArcType.Inherit, ArcType.Specialize].includes(d.arcType))
    expect(filteredExpectedValues.length).toBe(14)
    checkWithFilter(filteredExpectedValues, { arcTypeFilter: ArcTypeFilter.NotInheritOrSpecialize })

    filteredExpectedValues = expectedValues.filter(d => d.arcType !== ArcType.Variant)
    expect(filteredExpectedValues.length).toBe(17)
    checkWithFilter(filteredExpectedValues, { arcTypeFilter: ArcTypeFilter.NotVariant })

    // Arc introduced filters
    filteredExpectedValues = expectedValues.filter(d => d.isIntroRootLayer)
    expect(filteredExpectedValues.length).toBe(16)
    checkWithFilter(filteredExpectedValues,
      { arcIntroducedFilter: ArcIntroducedFilter.IntroducedInRootLayerStack })

    filteredExpectedValues = expectedValues.filter(d => d.isIntroRootLayerPrim)
    expect(filteredExpectedValues.length).toBe(8)
    checkWithFilter(filteredExpectedValues,
      { arcIntroducedFilter: ArcIntroducedFilter.IntroducedInRootLayerPrimSpec })

    // Dependency type filters
    filteredExpectedValues = expectedValues.filter(d => !d.isAncestral)
    expect(filteredExpectedValues.length).toBe(20)
    checkWithFilter(filteredExpectedValues, { dependencyTypeFilter: DependencyTypeFilter.Direct })

    filteredExpectedValues = expectedValues.filter(d => d.isAncestral)
    expect(filteredExpectedValues.length).toBe(2)
    checkWithFilter(filteredExpectedValues, { dependencyTypeFilter: DependencyTypeFilter.Ancestral })

    // Has specs filters
    filteredExpectedValues = expectedValues.filter(d => d.hasSpecs)
    expect(filteredExpectedValues.length).toBe(18)
    checkWithFilter(filteredExpectedValues, { hasSpecsFilter: HasSpecsFilter.HasSpecs })

    filteredExpectedValues = expectedValues.filter(d => !d.hasSpecs)
    expect(filteredExpectedValues.length).toBe(4)
    checkWithFilter(filteredExpectedValues, { hasSpecsFilter: HasSpecsFilter.HasNoSpecs })

    // Test combining filter types
    // Start with a dependency type filter
    filteredExpectedValues = expectedValues.filter(d => !d.isAncestral)
    expect(filteredExpectedValues.length).toBe(20)
    checkWithFilter(filteredExpectedValues, { dependencyTypeFilter: DependencyTypeFilter.Direct })

    // Add an arc type filter. Note that we refilter the already filtered
    // expected values unlike the cases above.
    filteredExpectedValues = filteredExpectedValues.filter(d => d.arcType !== ArcType.Variant)
    expect(filteredExpectedValues.length).toBe(15)
    checkWithFilter(filteredExpectedValues, {
      dependencyTypeFilter: DependencyTypeFilter.Direct,
      arcTypeFilter: ArcTypeFilter.NotVariant,
    })

    // Add a has specs filter
    filteredExpectedValues = filteredExpectedValues.filter(d => d.hasSpecs)
    expect(filteredExpectedValues.length).toBe(11)
    checkWithFilter(filteredExpectedValues, {
      dependencyTypeFilter: DependencyTypeFilter.Direct,
      arcTypeFilter: ArcTypeFilter.NotVariant,
      hasSpecsFilter: HasSpecsFilter.HasSpecs,
    })

    // Add an arc introduced filter.
    filteredExpectedValues = filteredExpectedValues.filter(d => d.isIntroRootLayer)
    expect(filteredExpectedValues.length).toBe(8)
    checkWithFilter(filteredExpectedValues, {
      dependencyTypeFilter: DependencyTypeFilter.Direct,
      arcTypeFilter: ArcTypeFilter.NotVariant,
      hasSpecsFilter: HasSpecsFilter.HasSpecs,
      arcIntroducedFilter: ArcIntroducedFilter.IntroducedInRootLayerStack,
    })

    // Test the pre-defined queries
    // Direct references
    query = PrimCompositionQuery.getDirectReferences(prim!)
    expect(query.filter.arcTypeFilter).toBe(ArcTypeFilter.Reference)
    expect(query.filter.dependencyTypeFilter).toBe(DependencyTypeFilter.Direct)
    expect(query.filter.arcIntroducedFilter).toBe(ArcIntroducedFilter.All)
    expect(query.filter.hasSpecsFilter).toBe(HasSpecsFilter.All)
    let arcs = query.getCompositionArcs()
    filteredExpectedValues = expectedValues.filter(
      d => !d.isAncestral && d.arcType === ArcType.Reference)
    verifyExpectedArcs(arcs, filteredExpectedValues)

    // Direct inherits
    query = PrimCompositionQuery.getDirectInherits(prim!)
    expect(query.filter.arcTypeFilter).toBe(ArcTypeFilter.Inherit)
    expect(query.filter.dependencyTypeFilter).toBe(DependencyTypeFilter.Direct)
    expect(query.filter.arcIntroducedFilter).toBe(ArcIntroducedFilter.All)
    expect(query.filter.hasSpecsFilter).toBe(HasSpecsFilter.All)
    arcs = query.getCompositionArcs()
    filteredExpectedValues = expectedValues.filter(
      d => !d.isAncestral && d.arcType === ArcType.Inherit)
    verifyExpectedArcs(arcs, filteredExpectedValues)

    // Direct root layer arcs
    query = PrimCompositionQuery.getDirectRootLayerArcs(prim!)
    expect(query.filter.arcTypeFilter).toBe(ArcTypeFilter.All)
    expect(query.filter.dependencyTypeFilter).toBe(DependencyTypeFilter.Direct)
    expect(query.filter.arcIntroducedFilter).toBe(ArcIntroducedFilter.IntroducedInRootLayerStack)
    expect(query.filter.hasSpecsFilter).toBe(HasSpecsFilter.All)
    arcs = query.getCompositionArcs()
    filteredExpectedValues = expectedValues.filter(d => !d.isAncestral && d.isIntroRootLayer)
    verifyExpectedArcs(arcs, filteredExpectedValues)

    // Test that composition query arcs and their nodes can still be validly
    // queried after the composition query itself is gone.
    let newQuery: PrimCompositionQuery | null = new PrimCompositionQuery(prim!)
    arcs = newQuery.getCompositionArcs()
    newQuery = null
    verifyExpectedArcs(arcs, expectedValues)
    for (const arc of arcs) verifyArcIntroducingInfo(arc)

    // Test relocates on a child prim that came through a reference
    query = new PrimCompositionQuery(stage.getPrim('/Sarah/Child_Moved')!)
    // Expect to find relocates arcs from an unfiltered query
    arcs = query.getCompositionArcs()
    // 26 arcs total with only 1 being ArcTypeRelocate
    expect(arcs.length).toBe(26)

    const relocateArcs = arcs.filter(arc => arc.getArcType() === ArcType.Relocate)
    expect(relocateArcs.length).toBe(1)

    filteredExpectedValues = [
      {nodeLayerStack: 'test.usda',
       nodePath: '/Sarah/Child_Will_Be_Moved',
       arcType: ArcType.Relocate,
       hasSpecs: false,
       introLayerStack: 'test.usda',
       introLayer: 'test.usda',
       introPath: '/',
       introInListEdit: null,
       isImplicit: false,
       isAncestral: false,
       isIntroRootLayer: true,
       isIntroRootLayerPrim: true},
    ]

    checkWithFilter(filteredExpectedValues, { arcTypeFilter: ArcTypeFilter.Relocate })

    const notRelocateArcs = arcs.filter(arc => arc.getArcType() !== ArcType.Relocate)
    expect(notRelocateArcs.length).toBe(25)

    // Apply the NotRelocate filter and confirm we get the same result as the
    // manual filtering above
    const qFilter = new PrimCompositionQuery.Filter()
    qFilter.arcTypeFilter = ArcTypeFilter.NotRelocate
    query.filter = qFilter
    const filteredNotRelocateArcs = query.getCompositionArcs()
    expect(filteredNotRelocateArcs.length).toBe(25)
    expect(filteredNotRelocateArcs.some(arc => arc.getArcType() === ArcType.Relocate)).toBe(false)

    // Upstream's last check (testUsdPrimCompositionQuery.py:727-733) asserts
    // the session layer expires once the stage is garbage collected after a
    // query on its pseudo-root; JS has no deterministic collection, so only
    // the pseudo-root query itself is exercised.
    const inMemory = Stage.createNew()
    expect(() => new PrimCompositionQuery(inMemory.getPrim('/')!)).not.toThrow()
  })
})

// Value-resolution behavior for these factories (including non-root arcs,
// layer limits and clips) is tested against native captures in resolveTarget.test.ts.
describe('UsdPrimCompositionQueryArc resolve targets', () => {
  it('makes resolve targets up to and stronger than an arc', () => {
    const stage = Stage.createNew()
    stage.definePrim('/Prim')
    const [arc] = new PrimCompositionQuery(stage.getPrim('/Prim')!).getCompositionArcs()
    const resolveTargetArc = arc as unknown as Record<string, unknown>
    expect(typeof resolveTargetArc.makeResolveTargetUpTo).toBe('function')
    expect(typeof resolveTargetArc.makeResolveTargetStrongerThan).toBe('function')
  })
})

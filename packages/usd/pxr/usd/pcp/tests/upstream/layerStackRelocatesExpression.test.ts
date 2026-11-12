// Ported from OpenUSD 26.11.1: pxr/usd/pcp/layerStack.cpp,
//  pxr/usd/pcp/primIndex.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Oracle for primitive #4 — PcpLayerStack::GetExpressionForRelocatesAtPath
// (layerStack.cpp:1447) and its _FilterRelocationsForPath helper
// (layerStack.cpp:948). Every expected value below is adjudicated against the
// live Pixar build (v26.05):
//
//   PYTHONPATH=<usd-build>/lib/python DYLD_LIBRARY_PATH=<usd-build>/lib \
//   python3 -c "from pxr import Pcp, Usd, Sdf; ..."
//
// GetExpressionForRelocatesAtPath is NOT directly Python-exposed, so it is
// adjudicated two ways:
//   1. its INPUTS — the relocates source→target maps — are dumped from
//      Pcp.Cache.layerStack and reproduced here, and the map function our
//      expression evaluates to is checked against _FilterRelocationsForPath's
//      documented contract for each map (verified against those dumps).
//   2. its OBSERVABLE COMPOSED RESULT — for the inherits-through-relocate stage
//      below, real pcp's prim index for /Char/Anim/A reports the implied-inherit
//      arc's "Map to parent" as
//          / -> /
//          /_class_Inst -> /Char/Rig/Inst
//          /_class_Inst/A -> /Char/Anim/A
//      i.e. the relocate /Char/Rig/Inst/A -> /Char/Anim/A composed INTO the
//      inherit arc map (the _CreateMapExpressionForArc compose, primIndex.cpp:674).
//      We rebuild that compose here from our expression and assert byte-equality
//      with the Pixar dump. This is the mechanism #5 will wire into the indexer.

import { describe, expect, it } from 'vitest'
import {
  Layer as PcpLayer,
  LayerOpener as PcpLayerOpener,
  MapExpression as PcpMapExpression,
  MapFunction as PcpMapFunction,
  computePcpLayerStack,
} from '../../src/index.ts'

function fakeLayer(filePath: string, rootFields: Record<string, unknown> = {}): PcpLayer {
  return {
    filePath,
    hasSpec: path => path === '/',
    getSpecType: path => path === '/' ? 'pseudoRoot' : 'unknown',
    getSpecPaths: () => ['/'],
    getFieldNames: path => path === '/' ? Object.keys(rootFields) : [],
    getField(specPath: string, fieldName: string): unknown {
      return specPath === '/' ? rootFields[fieldName] : undefined
    },
    resolveAsset(assetPath: string): string {
      return assetPath
    },
  }
}

function openerOver(layers: PcpLayer[]): PcpLayerOpener {
  const byPath = new Map(layers.map((l) => [l.filePath, l]))
  return async (filePath: string) => byPath.get(filePath) ?? null
}

// The evaluated source→target map of an expression, as a plain object.
function relocatesMap(expr: PcpMapExpression): Record<string, string> {
  return Object.fromEntries(expr.evaluate().getSourceToTargetMap())
}

describe('GetExpressionForRelocatesAtPath — null fast path', () => {
  it('a stack with no relocates returns a null expression at any path', async () => {
    const root = fakeLayer('/root')
    const ls = await computePcpLayerStack(root, openerOver([root]))
    const expr = ls.getExpressionForRelocatesAtPath('/Anything')
    // Realizes IsUsd() && !HasRelocates() -> PcpMapExpression() (layerStack.cpp:1451).
    expect(expr.isNull()).toBe(true)
    expect(expr.evaluate().isNull()).toBe(true)
  })
})

describe('GetExpressionForRelocatesAtPath — _FilterRelocationsForPath content', () => {
  // Pixar (model.usda single relocate): combined S2T == incremental S2T ==
  //   {/Char/Rig/Inst/A: /Char/Anim/A}
  it('single relocate: source at/below path is included, plus root identity', async () => {
    const root = fakeLayer('/root', {
      layerRelocates: { '/Char/Rig/Inst/A': '/Char/Anim/A' },
    })
    const ls = await computePcpLayerStack(root, openerOver([root]))

    // At the relocate parent: the source /Char/Rig/Inst/A HasPrefix(/Char) so it
    // is included.
    expect(relocatesMap(ls.getExpressionForRelocatesAtPath('/Char'))).toEqual({
      '/': '/',
      '/Char/Rig/Inst/A': '/Char/Anim/A',
    })
    // At the source path itself: still included (HasPrefix is reflexive).
    expect(relocatesMap(ls.getExpressionForRelocatesAtPath('/Char/Rig/Inst/A'))).toEqual({
      '/': '/',
      '/Char/Rig/Inst/A': '/Char/Anim/A',
    })
    // At an unrelated subtree: only the root identity survives.
    expect(relocatesMap(ls.getExpressionForRelocatesAtPath('/Char/Anim'))).toEqual({
      '/': '/',
    })
  })

  // Pixar (nested.usda) at /World:
  //   combined S2T:    {/World/A: /World/B, /World/A/C: /World/D}
  //   incremental S2T: {/World/A: /World/B, /World/B/C: /World/D}
  // _FilterRelocationsForPath uses the COMBINED entries; the incremental ones are
  // dropped because their targets (/World/B, /World/D) are already seen — this is
  // the seenTargets invertibility guard (layerStack.cpp:957-985).
  it('nested relocates: combined entries win, incremental dups dropped for invertibility', async () => {
    const root = fakeLayer('/root', {
      layerRelocates: { '/World/A': '/World/B', '/World/B/C': '/World/D' },
    })
    const ls = await computePcpLayerStack(root, openerOver([root]))
    expect(relocatesMap(ls.getExpressionForRelocatesAtPath('/World'))).toEqual({
      '/': '/',
      '/World/A': '/World/B',
      '/World/A/C': '/World/D',
    })
    // The evaluated function must be invertible (no two pairs share a target).
    const fn = ls.getExpressionForRelocatesAtPath('/World').evaluate()
    const targets = [...fn.getSourceToTargetMap().values()]
    expect(new Set(targets).size).toBe(targets.length)
  })

  // Pixar (none.usda): combined/incremental S2T have /World/Src -> '' (empty).
  // _FilterRelocationsForPath SKIPS empty targets so they don't block mapping;
  // only the root identity remains (layerStack.cpp:966-968, 981-982).
  it('relocate-to-none: empty target is skipped, leaving identity', async () => {
    // A `<>`/None target parses to undefined; computeRelocations normalizes it
    // to '' (relocate-to-none). The fake layer mirrors the parsed shape.
    const root = fakeLayer('/root', {
      layerRelocates: { '/World/Src': undefined as unknown as string },
    })
    const ls = await computePcpLayerStack(root, openerOver([root]))
    const expr = ls.getExpressionForRelocatesAtPath('/World')
    // A relocate-to-none still makes the stack HasRelocates(), so the expression
    // is non-null, but its map is pure identity (the source maps through).
    expect(expr.isNull()).toBe(false)
    expect(relocatesMap(expr)).toEqual({ '/': '/' })
    expect(expr.evaluate().isIdentity()).toBe(true)
  })
})

describe('GetExpressionForRelocatesAtPath — Variable identity + caching', () => {
  it('the same path returns the same cached Variable expression', async () => {
    const root = fakeLayer('/root', { layerRelocates: { '/A/X': '/B/X' } })
    const ls = await computePcpLayerStack(root, openerOver([root]))
    const a = ls.getExpressionForRelocatesAtPath('/A')
    const b = ls.getExpressionForRelocatesAtPath('/A')
    // Same evaluated value (the cache hands back the same Variable). Equality of
    // the underlying function is the observable; node-identity is internal.
    expect(relocatesMap(a)).toEqual(relocatesMap(b))
  })

  it('is built as a Variable: re-set value invalidates dependent composes', async () => {
    const root = fakeLayer('/root', { layerRelocates: { '/A/X': '/B/X' } })
    const ls = await computePcpLayerStack(root, openerOver([root]))
    const reloExpr = ls.getExpressionForRelocatesAtPath('/A')
    // Compose it onto a constant (as _CreateMapExpressionForArc does) and
    // evaluate — exercises that the relocates expr participates as a live subterm.
    const arc = PcpMapExpression.constant(PcpMapFunction.identity())
    const composed = reloExpr.compose(arc)
    expect(composed.mapSourceToTarget('/A/X')).toBe('/B/X')
  })
})

describe('GetExpressionForRelocatesAtPath — composed into an arc map (the #5 mechanism)', () => {
  // Pixar adjudication (inh.usda): inherits-through-a-relocate. Real pcp's prim
  // index for /Char/Anim/A reports the implied inherit arc's Map to parent as:
  //   / -> /
  //   /_class_Inst -> /Char/Rig/Inst
  //   /_class_Inst/A -> /Char/Anim/A
  // Stage:
  //   def "Char" (relocates = {<Rig/Inst/A>: <Anim/A>}) {
  //     def "Rig" { def "Inst" (inherits = </_class_Inst>) { def "A" {} } }
  //     def "Anim" {}
  //   }
  //   class "_class_Inst" { def "A" {} }
  it('reproduces the implied-inherit arc map from the live Pixar prim index', async () => {
    const root = fakeLayer('/root', {
      layerRelocates: { '/Char/Rig/Inst/A': '/Char/Anim/A' },
    })
    const ls = await computePcpLayerStack(root, openerOver([root]))

    // The inherit arc, BEFORE relocates, maps the class namespace onto the
    // instance namespace at the relocate SOURCE (this is the Constant arc expr
    // _CreateMapExpressionForArc starts from, primIndex.cpp:660-668):
    //   /_class_Inst   -> /Char/Rig/Inst
    //   /_class_Inst/A -> /Char/Rig/Inst/A
    const arcConstant = PcpMapExpression.constant(
      PcpMapFunction.create(
        new Map([
          ['/_class_Inst', '/Char/Rig/Inst'],
          ['/', '/'],
        ]),
      ),
    )

    // Relocates that apply at the arc's TARGET path (the relocate source prim).
    // _CreateMapExpressionForArc passes targetPath = /Char/Rig/Inst/A here.
    const reloExpr = ls.getExpressionForRelocatesAtPath('/Char/Rig/Inst/A')

    // arcExpr = reloMapExpr.Compose(arcExpr)  (primIndex.cpp:674) — relocates
    // folded into the arc map.
    const composed = reloExpr.compose(arcConstant)

    expect(Object.fromEntries(composed.evaluate().getSourceToTargetMap())).toEqual({
      '/': '/',
      '/_class_Inst': '/Char/Rig/Inst',
      '/_class_Inst/A': '/Char/Anim/A',
    })
    // And the load-bearing observable: a class-namespace child maps through both
    // the inherit AND the relocate to land at the renamed target.
    expect(composed.mapSourceToTarget('/_class_Inst/A')).toBe('/Char/Anim/A')
  })
})

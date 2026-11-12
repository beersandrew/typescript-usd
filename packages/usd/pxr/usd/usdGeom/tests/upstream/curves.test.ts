// Ported from OpenUSD 26.11.1: pxr/usd/usdGeom/testenv/testUsdGeomCurves.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/usd/usdGeom/testenv/testUsdGeomCurves.py — define + schema
// attribute surface for BasisCurves and NurbsCurves. The upstream test asserts
// each typed attr appears in GetSchemaAttributeNames(); we assert the same
// surface via the typed `get<Attribute>Attribute()` authoring handles (the TS idiom for
// the schema's declared properties).

import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { BasisCurves, NurbsCurves } from 'typescript-usd/usdGeom'

describe('UsdGeomBasisCurves', () => {
  it('defines a BasisCurves prim', () => {
    const stage = Stage.createNew()
    BasisCurves.define(stage, '/TestCurves')
    const prim = stage.getPrim('/TestCurves')!
    expect(prim.path.split('/').pop()).toBe('TestCurves')
    expect(BasisCurves.is(prim)).toBe(true)
  })

  it('exposes the BasisCurves schema attributes', () => {
    const stage = Stage.createNew()
    const curves = BasisCurves.define(stage, '/TestCurves')
    // widths / points / normals / curveVertexCounts / type / basis / wrap
    expect(curves.getWidthsAttr().name).toBe('widths')
    expect(curves.getPointsAttr().name).toBe('points')
    expect(curves.getNormalsAttr().name).toBe('normals')
    expect(curves.getCurveVertexCountsAttr().name).toBe('curveVertexCounts')
    expect(curves.getTypeAttr().name).toBe('type')
    expect(curves.getBasisAttr().name).toBe('basis')
    expect(curves.getWrapAttr().name).toBe('wrap')
  })
})

describe('UsdGeomNurbsCurves', () => {
  it('defines a NurbsCurves prim', () => {
    const stage = Stage.createNew()
    NurbsCurves.define(stage, '/TestCurves')
    const prim = stage.getPrim('/TestCurves')!
    expect(prim.path.split('/').pop()).toBe('TestCurves')
    expect(NurbsCurves.is(prim)).toBe(true)
  })

  it('exposes the NurbsCurves schema attributes', () => {
    const stage = Stage.createNew()
    const curves = NurbsCurves.define(stage, '/TestCurves')
    // widths / points / normals / curveVertexCounts / knots / order / pointWeights
    expect(curves.getWidthsAttr().name).toBe('widths')
    expect(curves.getPointsAttr().name).toBe('points')
    expect(curves.getNormalsAttr().name).toBe('normals')
    expect(curves.getCurveVertexCountsAttr().name).toBe('curveVertexCounts')
    expect(curves.getKnotsAttr().name).toBe('knots')
    expect(curves.getOrderAttr().name).toBe('order')
    expect(curves.getPointWeightsAttr().name).toBe('pointWeights')
  })
})

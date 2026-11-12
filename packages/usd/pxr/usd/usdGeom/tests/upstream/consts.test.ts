// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usdGeom/testenv/testUsdGeomConsts.py, pxr/usd/usdGeom/mesh.cpp
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _resolverContextForResolver } from 'typescript-usd/usd/_internal'
// Mirrors pxr/usd/usdGeom/testenv/testUsdGeomConsts.py — author a schema
// constant (UsdGeomMesh.SHARPNESS_INFINITE) onto a prim, serialize, reread, and
// confirm the round-tripped value still equals the schema constant AND the
// archived baseline (guarding against an unwitting change to the const's value).

import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { ArInMemoryResolver } from 'typescript-usd/usd/_internal'
import { Scope, Mesh } from 'typescript-usd/usdGeom'

describe('UsdGeomConsts', () => {
  it('SHARPNESS_INFINITE round-trips through USDA equal to the schema const', async () => {
    const stage = Stage.createNew()
    const scope = Scope.define(stage, '/ConstRoot')
    stage.declareProperty('/ConstRoot', 'SHARPNESS_INFINITE', 'float')
    scope.prim.attr('SHARPNESS_INFINITE').set(Mesh.SHARPNESS_INFINITE)

    // Serialize to USDA and reopen — a real writer→parser round-trip.
    const usda = stage.exportToUsda()
    const resolver = new ArInMemoryResolver({ 'testConsts.usda': new TextEncoder().encode(usda) })
    const reopened = (await Stage.open('testConsts.usda', { resolverContext: _resolverContextForResolver(resolver) }))!

    const val = reopened.getPrim('/ConstRoot')!.getAttr('SHARPNESS_INFINITE')!.getValue()
    // Round-tripped value compares equal to the (in-code) schema constant.
    expect(val).toBe(Mesh.SHARPNESS_INFINITE)
    // Archived baseline: the constant's value itself (captured from the Pixar
    // build — mesh.cpp `SHARPNESS_INFINITE = 10.0f`) must not drift.
    expect(Mesh.SHARPNESS_INFINITE).toBe(10.0)
  })
})

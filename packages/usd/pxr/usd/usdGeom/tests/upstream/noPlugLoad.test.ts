// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdGeom/testenv/testUsdGeomNoPlugLoad.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/usd/usdGeom/testenv/testUsdGeomNoPlugLoad.py — that core type
// checking and schema fallbacks resolve WITHOUT loading the usdGeom library.
//
// Upstream verifies this by introspecting Plug/TfType while the C++ library is
// unloaded. F1-C: the data path is real now — the vendored usdGeom plugin's
// generatedSchema.usda feeds the schema registry, so an unauthored builtin
// resolves to the SCHEMA fallback through plain stage value resolution
// (Usd_GetFallbackValue), with no schema class in the loop; the class-surface
// reads are kept as the TS-side complement.

import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { Scope, Cube } from 'typescript-usd/usdGeom'

describe('UsdGeomNoPlugLoad', () => {
  it('a Scope prim type-checks from its declared type', () => {
    const stage = Stage.createNew()
    stage.definePrim('/scope', 'Scope')
    const scope = stage.getPrim('/scope')!
    expect(scope).toBeTruthy()
    expect(scope.typeName).toBe('Scope')
    expect(Scope.is(scope)).toBe(true)
  })

  it('Cube.size reports its schema fallback when unauthored, and stays out of the authored set', () => {
    const stage = Stage.createNew()
    stage.definePrim('/cube', 'Cube')
    const cube = stage.getPrim('/cube')!
    expect(cube).toBeTruthy()

    // Fallback comes from the (generated) schema definition — no scene
    // opinion. Both through the schema class AND through plain stage value
    // resolution (the registry-backed weakest step; no usdGeom class in the
    // loop for the latter).
    expect(Cube.getSize(cube)).toBe(2.0)
    expect(stage.get('/cube.size')!.getValue()).toBe(2.0)
    expect(stage.get('/cube.size')!.getDefaultValueResult()).toEqual(
      { source: 'fallback', value: 2.0 })

    // ...but an unauthored builtin is absent from the prim's authored properties.
    expect(cube.attrNames).not.toContain('size')

    // After authoring, it appears in the authored set and the value updates.
    Cube.define(stage, '/cube').getSizeAttr().set(5.0)
    const authored = stage.getPrim('/cube')!
    expect(authored.attrNames).toContain('size')
    expect(Cube.getSize(authored)).toBe(5.0)
  })
})

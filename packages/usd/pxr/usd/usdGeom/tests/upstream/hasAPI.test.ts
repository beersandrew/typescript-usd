// Ported from OpenUSD 26.11.1: pxr/usd/usdGeom/testenv/testUsdGeomHasAPI.cpp
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/usd/usdGeom/testenv/testUsdGeomHasAPI.cpp — the
// HasAPI / CanApplyAPI / ApplyAPI / RemoveAPI lifecycle for single-apply API
// schemas, exercised with MotionAPI and GeomModelAPI.

import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
// Register the vendored usdGeom plugin: ApplyAPI/HasAPI/CanApplyAPI resolve
// MotionAPI/GeomModelAPI through the schema registry (upstream links the
// usdGeom library; F1-C wiring).
import '../../src/plugin/registerPlugin.ts'

describe('UsdGeom HasAPI / ApplyAPI / RemoveAPI', () => {
  for (const schema of ['MotionAPI', 'GeomModelAPI']) {
    it(`${schema}: apply / has / remove / re-apply round-trip`, () => {
      const stage = Stage.createNew()
      const prim = stage.definePrim('/p')

      expect(prim.hasAPI(schema)).toBe(false)
      expect(prim.canApplyAPI(schema)).toBe(true)

      prim.applyAPI(schema)
      expect(prim.hasAPI(schema)).toBe(true)

      prim.removeAPI(schema)
      expect(prim.hasAPI(schema)).toBe(false)

      prim.applyAPI(schema)
      expect(prim.hasAPI(schema)).toBe(true)
    })
  }
})

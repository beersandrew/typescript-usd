// Ported from OpenUSD 26.11.1: pxr/usd/usdGeom/testenv/testUsdGeomMetrics.py
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usd/usdGeom/testenv/testUsdGeomMetrics.py.
// UsdGeomSetStageUpAxis / GetStageUpAxis and
// UsdGeomSetStageMetersPerUnit / GetStageMetersPerUnit.

import { describe, it, expect } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import {
  setStageUpAxis, getStageUpAxis,
  setStageMetersPerUnit, getStageMetersPerUnit, stageHasAuthoredMetersPerUnit,
  UPAXIS_DEFAULT, LINEAR_UNITS_DEFAULT,
} from '../../src/index.ts'

describe('UsdGeom stage metrics', () => {
  it('up-axis: fallback then authored round-trip', () => {
    const stage = Stage.createNew()
    expect(getStageUpAxis(stage)).toBe(UPAXIS_DEFAULT)
    expect(setStageUpAxis(stage, 'Y')).toBe(true)
    expect(getStageUpAxis(stage)).toBe('Y')
    expect(stage.getMetadata('upAxis')).toBe('Y')
    setStageUpAxis(stage, 'Z')
    expect(getStageUpAxis(stage)).toBe('Z')
  })

  it('up-axis rejects invalid tokens', () => {
    const stage = Stage.createNew()
    // @ts-expect-error invalid axis
    expect(() => setStageUpAxis(stage, 'X')).toThrow()
  })

  it('metersPerUnit: fallback, authored-flag, round-trip', () => {
    const stage = Stage.createNew()
    expect(stageHasAuthoredMetersPerUnit(stage)).toBe(false)
    expect(getStageMetersPerUnit(stage)).toBe(LINEAR_UNITS_DEFAULT)
    expect(setStageMetersPerUnit(stage, 0.01)).toBe(true)
    expect(stageHasAuthoredMetersPerUnit(stage)).toBe(true)
    expect(getStageMetersPerUnit(stage)).toBe(0.01)
  })

  it('metrics survive flatten() and exportToUsda()', () => {
    const stage = Stage.createNew()
    stage.definePrim('/World', 'Xform')
    setStageUpAxis(stage, 'Y')
    setStageMetersPerUnit(stage, 1.0)
    const flat = stage.flatten()
    expect(flat.getField('/', 'upAxis')).toBe('Y')
    expect(flat.getField('/', 'metersPerUnit')).toBe(1.0)
    const usda = stage.exportToUsda()
    expect(usda).toMatch(/upAxis = "Y"/)
    expect(usda).toMatch(/metersPerUnit = 1/)
  })
})

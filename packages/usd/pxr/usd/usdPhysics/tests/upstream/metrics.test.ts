// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdPhysics/testenv/testUsdPhysicsMetrics.py
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.11.1 pxr/usd/usdPhysics/testenv/testUsdPhysicsMetrics.py
import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import {
  getStageKilogramsPerUnit, MassUnits, massUnitsAre, setStageKilogramsPerUnit,
  stageHasAuthoredKilogramsPerUnit,
} from 'typescript-usd/usdPhysics'

describe('TestUsdPhysicsMetrics', () => {
  it('test_kilogramsPerUnit', () => {
    const stage = Stage.createNew()
    expect(stage).toBeTruthy()

    expect(getStageKilogramsPerUnit(stage)).toBe(MassUnits.kilograms)
    expect(stageHasAuthoredKilogramsPerUnit(stage)).toBe(false)

    expect(setStageKilogramsPerUnit(stage, MassUnits.grams)).toBe(true)
    expect(stageHasAuthoredKilogramsPerUnit(stage)).toBe(true)
    const authored = getStageKilogramsPerUnit(stage)
    expect(massUnitsAre(authored, MassUnits.grams)).toBe(true)
  })
})

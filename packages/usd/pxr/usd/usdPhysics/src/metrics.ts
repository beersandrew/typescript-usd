// Ported from OpenUSD 26.11.1: pxr/usd/usdPhysics/metrics.cpp,
//  pxr/usd/usdPhysics/metrics.h
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// UsdPhysics stage metrics: the 'kilogramsPerUnit' stage metadatum.
// Ported from OpenUSD v26.11.1 pxr/usd/usdPhysics/metrics.h and
// pxr/usd/usdPhysics/metrics.cpp.
//
// Free functions, exactly as upstream (UsdPhysicsGetStageKilogramsPerUnit,
// UsdPhysicsStageHasAuthoredKilogramsPerUnit, UsdPhysicsSetStageKilogramsPerUnit,
// UsdPhysicsMassUnitsAre) plus the UsdPhysicsMassUnits constants. Upstream's
// TF_CODING_ERROR("Invalid UsdStage") guards (metrics.cpp:29-32, 42-45, 54-57)
// have no counterpart: a TS Stage parameter cannot be a null weak pointer.

import type { Stage } from 'typescript-usd/usd'
import { UsdPhysicsTokens } from './tokens.ts'

// Container class for static double-precision symbols representing common
// mass units of measure expressed in kilograms (metrics.h:52-57).
export const MassUnits = {
  grams: 0.001,
  kilograms: 1.0,
  slugs: 14.5939,
} as const

// Return *stage*'s authored kilogramsPerUnit, or 1.0 if unauthored
// (metrics.cpp:25-36).
export function getStageKilogramsPerUnit(stage: Stage): number {
  let units: number = MassUnits.kilograms
  const v = stage.getMetadata(UsdPhysicsTokens.kilogramsPerUnit)
  if (typeof v === 'number') units = v
  return units
}

// Return whether *stage* has an authored kilogramsPerUnit (metrics.cpp:38-47).
export function stageHasAuthoredKilogramsPerUnit(stage: Stage): boolean {
  return stage.hasMetadata(UsdPhysicsTokens.kilogramsPerUnit)
}

// Author *stage*'s kilogramsPerUnit (metrics.cpp:49-60).
export function setStageKilogramsPerUnit(stage: Stage, kilogramsPerUnit: number): boolean {
  return stage.setMetadata(UsdPhysicsTokens.kilogramsPerUnit, kilogramsPerUnit)
}

// Return *true* if the two given metrics are within the provided relative
// *epsilon* of each other (metrics.cpp:62-72).
export function massUnitsAre(authoredUnits: number, standardUnits: number, epsilon = 1e-5): boolean {
  if (authoredUnits <= 0 || standardUnits <= 0) {
    return false
  }

  const diff = Math.abs(authoredUnits - standardUnits)
  return (diff / authoredUnits < epsilon) && (diff / standardUnits < epsilon)
}

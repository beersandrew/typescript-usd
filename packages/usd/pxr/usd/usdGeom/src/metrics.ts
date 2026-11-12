// Ported from OpenUSD 26.11.1: pxr/usd/usdGeom/metrics.cpp,
//  pxr/usd/usdGeom/metrics.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// UsdGeom stage metrics — up-axis and linear units stage metadata.
// Reference: pxr/usd/usdGeom/metrics.h, pxr/usd/usdGeom/metrics.cpp
//
// These are free functions (not schema methods), exactly as upstream:
// UsdGeomSetStageUpAxis / UsdGeomGetStageUpAxis and
// UsdGeomSetStageMetersPerUnit / UsdGeomGetStageMetersPerUnit. Both author
// and read root-layer stage metadata (the 'upAxis' / 'metersPerUnit' fields).

import type { Stage } from 'typescript-usd/usd'

// Valid values for the 'upAxis' stage metadatum (UsdGeomTokens->{y,z}).
export type UpAxis = 'Y' | 'Z'

// OpenUSD v26.08 pxr/usd/usdGeom/plugInfo.json supplies the Y fallback that
// UsdGeomGetFallbackUpAxis resolves through usdGeom/metrics.cpp:61-143.
export const UPAXIS_DEFAULT: UpAxis = 'Y'

// The value UsdGeomGetStageMetersPerUnit returns when 'metersPerUnit' is
// unauthored: UsdGeomLinearUnits::centimeters (metrics.cpp:155-166), which is
// also the field's registered fallback (usdGeom/plugInfo.json:41-48).
export const LINEAR_UNITS_DEFAULT = 0.01

// Authors the stage's up-axis on the root layer (UsdGeomSetStageUpAxis).
// Returns true on success.
export function setStageUpAxis(stage: Stage, axis: UpAxis): boolean {
  if (axis !== 'Y' && axis !== 'Z') {
    throw new Error(`setStageUpAxis: upAxis must be "Y" or "Z", got "${axis}"`)
  }
  return stage.setMetadata('upAxis', axis)
}

// Reads the composed up-axis, falling back to UPAXIS_DEFAULT when unauthored
// (UsdGeomGetStageUpAxis).
export function getStageUpAxis(stage: Stage): UpAxis {
  const v = stage.getMetadata('upAxis')
  return v === 'Y' || v === 'Z' ? v : UPAXIS_DEFAULT
}

// Authors the stage's metersPerUnit on the root layer
// (UsdGeomSetStageMetersPerUnit). Returns true on success.
export function setStageMetersPerUnit(stage: Stage, metersPerUnit: number): boolean {
  return stage.setMetadata('metersPerUnit', metersPerUnit)
}

// True when 'metersPerUnit' is authored (UsdGeomStageHasAuthoredMetersPerUnit).
export function stageHasAuthoredMetersPerUnit(stage: Stage): boolean {
  return stage.hasMetadata('metersPerUnit')
}

// Reads the composed metersPerUnit, falling back to centimeters when
// unauthored (UsdGeomGetStageMetersPerUnit, metrics.cpp:155-166).
export function getStageMetersPerUnit(stage: Stage): number {
  const v = stage.getMetadata('metersPerUnit')
  return typeof v === 'number' ? v : LINEAR_UNITS_DEFAULT
}

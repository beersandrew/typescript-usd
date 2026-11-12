// Ported from OpenUSD 26.11.1: pxr/usd/usd/interpolation.cpp,
//  pxr/usd/usd/interpolation.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Public counterpart of pxr/usd/usd/interpolation.h.

import { _sdfCanonicalTextTypeName } from 'typescript-usd/sdf/_internal'

export enum UsdInterpolationType {
  Held,
  Linear,
}

// OpenUSD exposes the unscoped C++ enum values under these names.
export const UsdInterpolationTypeHeld = UsdInterpolationType.Held
export const UsdInterpolationTypeLinear = UsdInterpolationType.Linear

export type UsdInterpolation = UsdInterpolationType | 'held' | 'linear'

const linearScalarTypes = new Set([
  'half', 'float', 'double', 'timecode', 'duration',
  'matrix2d', 'matrix3d', 'matrix4d',
  'double2', 'float2', 'half2',
  'double3', 'float3', 'half3',
  'double4', 'float4', 'half4',
  'quatd', 'quatf', 'quath',
  // Role-bearing Sdf names below share the same GfVec C++ value types as
  // floatN/halfN/doubleN. OpenUSD's traits therefore admit them through
  // USD_LINEAR_INTERPOLATION_TYPES (pxr/usd/usd/interpolation.h:35-75).
  'point3h', 'point3f', 'point3d',
  'vector3h', 'vector3f', 'vector3d',
  'normal3h', 'normal3f', 'normal3d',
  'color3h', 'color3f', 'color3d',
  'color4h', 'color4f', 'color4d',
  'texCoord2h', 'texCoord2f', 'texCoord2d',
  'texCoord3h', 'texCoord3f', 'texCoord3d',
])

/** @internal Mirrors USD_LINEAR_INTERPOLATION_TYPES. */
export function _usdTypeSupportsLinearInterpolation(typeName: string | undefined): boolean {
  if (!typeName) return false
  let supported = linearTypeNames.get(typeName)
  if (supported === undefined) {
    // The decision is by value type, so legacy type names ("Vec3f[]",
    // "PointFloat[]") count as the types SdfSchema::FindType maps them to.
    const canonical = _sdfCanonicalTextTypeName(typeName)
    const scalarType = canonical.endsWith('[]') ? canonical.slice(0, -2) : canonical
    supported = linearScalarTypes.has(scalarType)
    linearTypeNames.set(typeName, supported)
  }
  return supported
}

// Per type name, whether it interpolates linearly; type names are few, and
// this is asked on every interpolated read.
const linearTypeNames = new Map<string, boolean>()

/** @internal */
export function _usdInterpolationIsHeld(interpolation: UsdInterpolation | undefined): boolean {
  return interpolation === 'held' || interpolation === UsdInterpolationType.Held
}

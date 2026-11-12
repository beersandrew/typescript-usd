// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImaging/primvarUtils.cpp,
//  pxr/usdImaging/usdImaging/primvarUtils.h
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/primvarUtils.{h,cpp}
// (OpenUSD 26.11.1).

import { Interpolation as HdInterpolation, PrimvarRoleTokens as HdPrimvarRoleTokens } from 'typescript-usd/hd'
import { ValueRoleNames as SdfValueRoleNames } from 'typescript-usd/sdf'
import { TF_CODING_ERROR } from './tfDiagnostic.ts'

// UsdGeomTokens->uniform, vertex, varying, faceVarying, constant.
const _UsdGeomInterpolationTokens = {
  uniform: 'uniform',
  vertex: 'vertex',
  varying: 'varying',
  faceVarying: 'faceVarying',
  constant: 'constant',
} as const

/** primvarUtils.cpp:15-35: converts from `usdRole` to the corresponding Hd
 *  role. */
export function UsdImagingUsdToHdRole(usdRole: string): string {
  if (usdRole === SdfValueRoleNames.Point) {
    return HdPrimvarRoleTokens.point
  } else if (usdRole === SdfValueRoleNames.Normal) {
    return HdPrimvarRoleTokens.normal
  } else if (usdRole === SdfValueRoleNames.Vector) {
    return HdPrimvarRoleTokens.vector
  } else if (usdRole === SdfValueRoleNames.Color) {
    return HdPrimvarRoleTokens.color
  } else if (usdRole === SdfValueRoleNames.TextureCoordinate) {
    return HdPrimvarRoleTokens.textureCoordinate
  }
  // Empty token means no role specified
  return ''
}

/** primvarUtils.cpp:37-59: converts from `usdInterp` to the corresponding
 *  HdInterpolation. */
export function UsdImagingUsdToHdInterpolation(usdInterp: string): HdInterpolation {
  if (usdInterp === _UsdGeomInterpolationTokens.uniform) {
    return HdInterpolation.HdInterpolationUniform
  } else if (usdInterp === _UsdGeomInterpolationTokens.vertex) {
    return HdInterpolation.HdInterpolationVertex
  } else if (usdInterp === _UsdGeomInterpolationTokens.varying) {
    return HdInterpolation.HdInterpolationVarying
  } else if (usdInterp === _UsdGeomInterpolationTokens.faceVarying) {
    return HdInterpolation.HdInterpolationFaceVarying
  } else if (usdInterp === _UsdGeomInterpolationTokens.constant) {
    return HdInterpolation.HdInterpolationConstant
  }
  TF_CODING_ERROR(`Unknown USD interpolation ${usdInterp}; treating as constant`)
  return HdInterpolation.HdInterpolationConstant
}

/** primvarUtils.cpp:61-70: converts from `usdInterp` to the token for the
 *  corresponding HdInterpolation. */
export function UsdImagingUsdToHdInterpolationToken(usdInterp: string): string {
  // Technically, the more correct thing to do is:
  // return TfToken(TEnum::GetDisplayName(UsdImagingUsdToHdInterpolation(usdInterp)))
  //
  // But ultimately, the tokens are the same.  Ideally, this would be
  // something we can static_assert.
  return usdInterp
}

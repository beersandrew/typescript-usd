// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/testenv/testUsdImagingPrimvarUtils.cpp,
//  pxr/imaging/hd/enums.cpp
// Copyright 2018, 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usdImaging/usdImaging/testenv/testUsdImagingPrimvarUtils.cpp
// (OpenUSD 26.11.1), registered in pxr/usdImaging/usdImaging/CMakeLists.txt:398-401.
//
// TfEnum::GetDisplayName(HdInterpolation) reads the display names
// pxr/imaging/hd/enums.cpp:15-23 registers with TF_ADD_ENUM_NAME. The TS
// TfEnum registry is keyed by value only (numeric enums of different types
// would collide), so this port reads that registration from the table below,
// copied from enums.cpp:17-22.
import { describe, expect, it } from 'vitest'
import { Interpolation as HdInterpolation } from 'typescript-usd/hd'
import { UsdImagingUsdToHdInterpolation, UsdImagingUsdToHdInterpolationToken } from 'typescript-usd/usdImaging'

/** pxr/imaging/hd/enums.cpp:17-22 */
const _hdInterpolationDisplayNames = new Map<HdInterpolation, string>([
  [HdInterpolation.HdInterpolationConstant, 'constant'],
  [HdInterpolation.HdInterpolationUniform, 'uniform'],
  [HdInterpolation.HdInterpolationVarying, 'varying'],
  [HdInterpolation.HdInterpolationVertex, 'vertex'],
  [HdInterpolation.HdInterpolationFaceVarying, 'faceVarying'],
  [HdInterpolation.HdInterpolationInstance, 'instance'],
])

function TfEnum_GetDisplayName(value: HdInterpolation): string | undefined {
  return _hdInterpolationDisplayNames.get(value)
}

// UsdGeomTokens->uniform, vertex, varying, faceVarying, constant.
const UsdGeomTokens = {
  uniform: 'uniform', vertex: 'vertex', varying: 'varying',
  faceVarying: 'faceVarying', constant: 'constant',
} as const

describe('testUsdImagingPrimvarUtils', () => {
  /** testUsdImagingPrimvarUtils.cpp:17-44 _TestUsdToHdInterpolation:
   *  verifies that our implementation of UsdImagingUsdToHdInterpolationToken
   *  is correct.  It currently assumes that the usd interpolation tokens
   *  match the HdInterpolation (display) names. */
  it('_TestUsdToHdInterpolation', () => {
    for (const token of [UsdGeomTokens.uniform, UsdGeomTokens.vertex, UsdGeomTokens.varying,
      UsdGeomTokens.faceVarying, UsdGeomTokens.constant]) {
      expect(TfEnum_GetDisplayName(UsdImagingUsdToHdInterpolation(token)))
        .toBe(UsdImagingUsdToHdInterpolationToken(token))
    }
  })
})

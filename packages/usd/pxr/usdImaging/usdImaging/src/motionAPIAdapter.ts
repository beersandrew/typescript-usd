// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImaging/motionAPIAdapter.cpp,
//  pxr/usdImaging/usdImaging/motionAPIAdapter.h
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/motionAPIAdapter.{h,cpp}
// (OpenUSD 26.11.1).

import {
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  PrimvarSchemaTokens as HdPrimvarSchemaTokens,
  PrimvarsSchema as HdPrimvarsSchema,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  Tokens as HdTokens,
  type ContainerDataSource as HdContainerDataSource,
} from 'typescript-usd/hd'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import { UsdImagingAPISchemaAdapter } from './apiSchemaAdapter.ts'
import { UsdImagingDataSourceCustomPrimvars } from './dataSourcePrimvars.ts'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import type { UsdImagingPropertyInvalidationType } from './types.ts'

// UsdGeomTokens->motionBlurScale, motionNonlinearSampleCount
// (usdGeom/tokens.h).
const _UsdGeomTokens = {
  motionBlurScale: 'motion:blurScale',
  motionNonlinearSampleCount: 'motion:nonlinearSampleCount',
} as const

let _mappings: UsdImagingDataSourceCustomPrimvars.Mappings | undefined

/** motionAPIAdapter.cpp:41-53 */
function _GetMotionPrimvarMappings(): UsdImagingDataSourceCustomPrimvars.Mappings {
  return _mappings ??= [
    { primvarName: HdTokens.blurScale,
      usdAttrName: _UsdGeomTokens.motionBlurScale,
      interpolation: HdPrimvarSchemaTokens.constant },
    { primvarName: HdTokens.nonlinearSampleCount,
      usdAttrName: _UsdGeomTokens.motionNonlinearSampleCount,
      interpolation: HdPrimvarSchemaTokens.constant },
  ]
}

/** motionAPIAdapter.h:25-46: reflects UsdGeomMotionAPI's motion:blurScale and
 *  motion:nonlinearSampleCount as the constant primvars blurScale and
 *  nonlinearSampleCount of the prim. */
export class UsdImagingMotionAPIAdapter extends UsdImagingAPISchemaAdapter {
  /** motionAPIAdapter.cpp:57-80 */
  override getImagingSubprimData(
    prim: UsdPrim,
    subprim: string,
    appliedInstanceName: string,
    stageGlobals: UsdImagingDataSourceStageGlobals,
  ): HdContainerDataSource | undefined {
    // MotionAPI is not a multi-apply schema.
    if (appliedInstanceName !== '') {
      return undefined
    }

    // This adapter only contributes to the primary prim, not subprims.
    if (subprim !== '') {
      return undefined
    }

    return HdRetainedContainerDataSource.new(
      [HdPrimvarsSchema.getSchemaToken()],
      [UsdImagingDataSourceCustomPrimvars.new(
        prim.path,
        prim,
        _GetMotionPrimvarMappings(),
        stageGlobals)])
  }

  /** motionAPIAdapter.cpp:82-97 */
  override invalidateImagingSubprim(
    _prim: UsdPrim,
    subprim: string,
    appliedInstanceName: string,
    properties: readonly string[],
    _invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    if (appliedInstanceName !== '' || subprim !== '') {
      return new HdDataSourceLocatorSet()
    }

    return UsdImagingDataSourceCustomPrimvars.invalidate(
      properties, _GetMotionPrimvarMappings())
  }
}

// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImaging/dataSourcePoints.cpp,
//  pxr/usdImaging/usdImaging/dataSourcePoints.h
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/dataSourcePoints.{h,cpp}
// (OpenUSD 26.11.1).

import {
  ContainerDataSource as HdContainerDataSource,
  OverlayContainerDataSource as HdOverlayContainerDataSource,
  PrimvarsSchema as HdPrimvarsSchema,
  PrimvarsSchemaTokens as HdPrimvarsSchemaTokens,
  type DataSourceBase as HdDataSourceBase,
  type DataSourceLocatorSet as HdDataSourceLocatorSet,
} from 'typescript-usd/hd'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import { UsdImagingDataSourceGprim } from './dataSourceGprim.ts'
import { UsdImagingDataSourceCustomPrimvars } from './dataSourcePrimvars.ts'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import type { UsdImagingPropertyInvalidationType } from './types.ts'

// UsdGeomTokens->widths
const _mappings: UsdImagingDataSourceCustomPrimvars.Mappings = [
  { primvarName: HdPrimvarsSchemaTokens.widths, usdAttrName: 'widths' },
]

/** dataSourcePoints.cpp:26-35 */
function _GetCustomPrimvarMappings(_usdPrim: UsdPrim): UsdImagingDataSourceCustomPrimvars.Mappings {
  return _mappings
}

/** dataSourcePoints.h:18-42: a prim data source representing UsdGeomPoints. */
export class UsdImagingDataSourcePointsPrim extends UsdImagingDataSourceGprim {
  /** dataSourcePoints.cpp:18-24 */
  protected constructor(
    sceneIndexPath: string,
    usdPrim: UsdPrim,
    stageGlobals: UsdImagingDataSourceStageGlobals,
  ) {
    super(sceneIndexPath, usdPrim, stageGlobals)
  }

  static override new(
    sceneIndexPath: string, usdPrim: UsdPrim, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): UsdImagingDataSourcePointsPrim {
    return new UsdImagingDataSourcePointsPrim(sceneIndexPath, usdPrim, stageGlobals)
  }

  /** dataSourcePoints.cpp:37-54 */
  override Get(name: string): HdDataSourceBase | undefined {
    const result = super.Get(name)

    if (name === HdPrimvarsSchema.getSchemaToken()) {
      return HdOverlayContainerDataSource.new(
        result instanceof HdContainerDataSource ? result : undefined,
        UsdImagingDataSourceCustomPrimvars.new(
          this._getSceneIndexPath(),
          this._getUsdPrim(),
          _GetCustomPrimvarMappings(this._getUsdPrim()),
          this._getStageGlobals()))
    }

    return result
  }

  /** dataSourcePoints.cpp:56-75 */
  static override invalidate(
    prim: UsdPrim,
    subprim: string,
    properties: readonly string[],
    invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    const result = UsdImagingDataSourceGprim.invalidate(
      prim, subprim, properties, invalidationType)

    if (subprim === '') {
      result.insert(
        UsdImagingDataSourceCustomPrimvars.invalidate(
          properties, _GetCustomPrimvarMappings(prim)))
    }

    return result
  }
}

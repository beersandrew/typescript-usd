// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImaging/dataSourceGprim.cpp,
//  pxr/usdImaging/usdImaging/dataSourceGprim.h
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/dataSourceGprim.{h,cpp}
// (OpenUSD 26.11.1).

import {
  ContainerDataSource as HdContainerDataSource,
  OverlayContainerDataSource as HdOverlayContainerDataSource,
  PrimvarsSchema as HdPrimvarsSchema,
  PrimvarsSchemaTokens as HdPrimvarsSchemaTokens,
  Tokens as HdTokens,
  type DataSourceBase as HdDataSourceBase,
  type DataSourceLocatorSet as HdDataSourceLocatorSet,
} from 'typescript-usd/hd'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import { UsdImagingDataSourcePrim } from './dataSourcePrim.ts'
import { UsdImagingDataSourceCustomPrimvars } from './dataSourcePrimvars.ts'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import type { UsdImagingPropertyInvalidationType } from './types.ts'

type _Mappings = UsdImagingDataSourceCustomPrimvars.Mappings

/** dataSourceGprim.cpp:19-29 */
function _Merge(a: _Mappings, b: _Mappings): _Mappings {
  const result: UsdImagingDataSourceCustomPrimvars.Mapping[] = [...a]
  for (const mapping of b) {
    result.push(mapping)
  }
  return result
}

// UsdGeomTokens->points, velocities, accelerations, normals, widths.
const _forPointBased: _Mappings = [
  { primvarName: HdPrimvarsSchemaTokens.points, usdAttrName: 'points' },
  { primvarName: HdTokens.velocities, usdAttrName: 'velocities' },
  { primvarName: HdTokens.accelerations, usdAttrName: 'accelerations' },
  { primvarName: HdPrimvarsSchemaTokens.normals, usdAttrName: 'normals' },
]
const _forCurves: _Mappings = _Merge(
  _forPointBased,
  [{ primvarName: HdPrimvarsSchemaTokens.widths, usdAttrName: 'widths' }])
const _empty: _Mappings = []

/** dataSourceGprim.cpp:31-63 */
function _GetCustomPrimvarMappings(usdPrim: UsdPrim): _Mappings {
  // UsdPrim::IsA<UsdGeomPointBased>()
  if (usdPrim.isA('PointBased')) {
    // UsdPrim::IsA<UsdGeomCurves>()
    if (usdPrim.isA('Curves')) {
      return _forCurves
    }
    return _forPointBased
  }
  return _empty
}

/** dataSourceGprim.h:24-60: the prim data source base class for gprims. */
export class UsdImagingDataSourceGprim extends UsdImagingDataSourcePrim {
  /** dataSourceGprim.cpp:65-71. Use to construct a new
   *  UsdImagingDataSourceGprim.
   *
   *  `sceneIndexPath` is the path of this object in the scene index.
   *
   *  `usdPrim` is the USD prim object that this data source represents.
   *
   *  `stageGlobals` represents the context object for the UsdStage with
   *  which to evaluate this attribute data source.
   *
   *  Note: client code calls this via static New. */
  protected constructor(
    sceneIndexPath: string,
    usdPrim: UsdPrim,
    stageGlobals: UsdImagingDataSourceStageGlobals,
  ) {
    super(sceneIndexPath, usdPrim, stageGlobals)
  }

  static override new(
    sceneIndexPath: string, usdPrim: UsdPrim, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): UsdImagingDataSourceGprim {
    return new UsdImagingDataSourceGprim(sceneIndexPath, usdPrim, stageGlobals)
  }

  /** dataSourceGprim.cpp:73-83 */
  override getNames(): string[] {
    const names = super.getNames()
    // Add primvars if needed, to accommmodate custom primvar mappings.
    if (!names.includes(HdPrimvarsSchema.getSchemaToken())) {
      names.push(HdPrimvarsSchema.getSchemaToken())
    }
    return names
  }

  /** dataSourceGprim.cpp:85-115 */
  override Get(name: string): HdDataSourceBase | undefined {
    if (!this._getUsdPrim().isValid()) {
      return undefined
    }

    const result = super.Get(name)
    if (name === HdPrimvarsSchema.getSchemaToken()) {
      const mappings = _GetCustomPrimvarMappings(this._getUsdPrim())
      if (mappings.length === 0) {
        return result
      }
      return HdOverlayContainerDataSource.new(
        result instanceof HdContainerDataSource ? result : undefined,
        // Note that a attribute such as "normals" (which we
        // get through the custom primvars data source) is
        // weaker than the preferred form "primvars:normals"
        // (which we get from the base implementation
        // UsdImagingDataSourcePrim::Get).
        UsdImagingDataSourceCustomPrimvars.new(
          this._getSceneIndexPath(),
          this._getUsdPrim(),
          mappings,
          this._getStageGlobals()))
    }

    return result
  }

  /** dataSourceGprim.cpp:117-140 */
  static override invalidate(
    prim: UsdPrim,
    subprim: string,
    properties: readonly string[],
    invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    const result = UsdImagingDataSourcePrim.invalidate(
      prim, subprim, properties, invalidationType)

    if (subprim === '') {
      const mappings = _GetCustomPrimvarMappings(prim)

      if (mappings.length !== 0) {
        result.insert(UsdImagingDataSourceCustomPrimvars.invalidate(
          properties, mappings))
      }
    }

    return result
  }
}

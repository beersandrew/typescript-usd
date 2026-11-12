// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/dataSourceNurbsCurves.cpp,
//  pxr/usdImaging/usdImaging/dataSourceNurbsCurves.h,
//  pxr/usd/usdGeom/curves.cpp, pxr/usd/usdGeom/nurbsCurves.cpp
// Copyright 2016, 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/dataSourceNurbsCurves.{h,cpp}
// (OpenUSD 26.11.1).
//
// The TypeScript UsdGeom schema classes have no GetSchemaAttributeNames, so
// the schema-local attribute names (includeInherited = false) used by
// _GetPropertyMappings are listed from the generated
// pxr/usd/usdGeom/nurbsCurves.cpp:173-178 and curves.cpp:120-123.

import {
  ContainerDataSource as HdContainerDataSource,
  DataSourceLocator as HdDataSourceLocator,
  NurbsCurvesSchema as HdNurbsCurvesSchema,
  OverlayContainerDataSource as HdOverlayContainerDataSource,
  PrimvarsSchema as HdPrimvarsSchema,
  type DataSourceBase as HdDataSourceBase,
  type DataSourceLocatorSet as HdDataSourceLocatorSet,
} from 'typescript-usd/hd'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import { UsdImagingDataSourceGprim } from './dataSourceGprim.ts'
import { UsdImagingDataSourceMapped } from './dataSourceMapped.ts'
import { UsdImagingDataSourceCustomPrimvars } from './dataSourcePrimvars.ts'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import type { UsdImagingPropertyInvalidationType } from './types.ts'

/** UsdGeomNurbsCurves::GetSchemaAttributeNames(false)
 *  (usdGeom/nurbsCurves.cpp:173-178). */
const _usdGeomNurbsCurvesSchemaAttributeNames: readonly string[] = [
  'order', 'knots', 'ranges', 'pointWeights',
]

/** UsdGeomCurves::GetSchemaAttributeNames(false)
 *  (usdGeom/curves.cpp:120-123). */
const _usdGeomCurvesSchemaAttributeNames: readonly string[] = [
  'curveVertexCounts', 'widths',
]

/** dataSourceNurbsCurves.cpp:20-55 */
function _GetPropertyMappings(): UsdImagingDataSourceMapped.PropertyMapping[] {
  const result: UsdImagingDataSourceMapped.PropertyMapping[] = []

  for (const usdName of _usdGeomNurbsCurvesSchemaAttributeNames) {
    // UsdGeomTokens->pointWeights
    if (usdName === 'pointWeights') {
      // Suppress pointWeights from UsdGeomNurbsCurves (which is a custom
      // primvar we process in the prim source below).
      continue
    }
    result.push(
      new UsdImagingDataSourceMapped.AttributeMapping(
        usdName, new HdDataSourceLocator(usdName)))
  }

  for (const usdName of _usdGeomCurvesSchemaAttributeNames) {
    // UsdGeomTokens->widths
    if (usdName === 'widths') {
      // Suppress widths from UsdGeomCurves (which is a custom
      // primvar that UsdImagingDataSourceGprim gives us).
      continue
    }
    result.push(
      new UsdImagingDataSourceMapped.AttributeMapping(
        usdName, new HdDataSourceLocator(usdName)))
  }

  return result
}

let _mappings: UsdImagingDataSourceMapped.PropertyMappings | undefined

/** dataSourceNurbsCurves.cpp:57-63 */
function _GetMappings(): UsdImagingDataSourceMapped.PropertyMappings {
  return _mappings ??= new UsdImagingDataSourceMapped.PropertyMappings(
    _GetPropertyMappings(), HdNurbsCurvesSchema.getDefaultLocator())
}

let _customPrimvarMappings: UsdImagingDataSourceCustomPrimvars.Mappings | undefined

/** dataSourceNurbsCurves.cpp:65-74 */
function _GetCustomPrimvarMappings(_usdPrim: UsdPrim): UsdImagingDataSourceCustomPrimvars.Mappings {
  // UsdGeomTokens->pointWeights
  const hdPrimvarName = 'pointWeights'
  return _customPrimvarMappings ??= [
    { primvarName: hdPrimvarName, usdAttrName: 'pointWeights' },
  ]
}

// ----------------------------------------------------------------------------

/** dataSourceNurbsCurves.h:15-41: a prim data source representing
 *  UsdGeomNurbsCurves. */
export class UsdImagingDataSourceNurbsCurvesPrim extends UsdImagingDataSourceGprim {
  /** dataSourceNurbsCurves.cpp:82-88 */
  protected constructor(
    sceneIndexPath: string,
    usdPrim: UsdPrim,
    stageGlobals: UsdImagingDataSourceStageGlobals,
  ) {
    super(sceneIndexPath, usdPrim, stageGlobals)
  }

  static override new(
    sceneIndexPath: string, usdPrim: UsdPrim, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): UsdImagingDataSourceNurbsCurvesPrim {
    return new UsdImagingDataSourceNurbsCurvesPrim(sceneIndexPath, usdPrim, stageGlobals)
  }

  /** dataSourceNurbsCurves.cpp:90-96 */
  override getNames(): string[] {
    const result = super.getNames()
    result.push(HdNurbsCurvesSchema.getSchemaToken())
    return result
  }

  /** dataSourceNurbsCurves.cpp:98-123 */
  override Get(name: string): HdDataSourceBase | undefined {
    if (name === HdNurbsCurvesSchema.getSchemaToken()) {
      return UsdImagingDataSourceMapped.new(
        this._getUsdPrim(),
        this._getSceneIndexPath(),
        _GetMappings(),
        this._getStageGlobals())
    }
    if (name === HdPrimvarsSchema.getSchemaToken()) {
      const base = super.Get(name)
      return HdOverlayContainerDataSource.new(
        base instanceof HdContainerDataSource ? base : undefined,
        UsdImagingDataSourceCustomPrimvars.new(
          this._getSceneIndexPath(),
          this._getUsdPrim(),
          _GetCustomPrimvarMappings(this._getUsdPrim()),
          this._getStageGlobals()))
    }
    return super.Get(name)
  }

  /** dataSourceNurbsCurves.cpp:125-147 */
  static override invalidate(
    prim: UsdPrim,
    subprim: string,
    properties: readonly string[],
    invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    const locators =
      UsdImagingDataSourceMapped.invalidate(
        properties, _GetMappings())

    locators.insert(
      UsdImagingDataSourceGprim.invalidate(
        prim, subprim, properties, invalidationType))

    locators.insert(
      UsdImagingDataSourceCustomPrimvars.invalidate(
        properties, _GetCustomPrimvarMappings(prim)))

    return locators
  }
}

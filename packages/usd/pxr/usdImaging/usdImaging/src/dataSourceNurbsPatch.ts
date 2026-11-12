// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/dataSourceNurbsPatch.cpp,
//  pxr/usdImaging/usdImaging/dataSourceNurbsPatch.h,
//  pxr/usd/usdGeom/nurbsPatch.cpp
// Copyright 2016, 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/dataSourceNurbsPatch.{h,cpp}
// (OpenUSD 26.11.1).
//
// The TypeScript UsdGeom schema classes have no GetSchemaAttributeNames, so
// the schema-local attribute names (includeInherited = false) used by
// _GetPropertyMappings are listed from the generated
// pxr/usd/usdGeom/nurbsPatch.cpp:394-412.

import {
  ContainerDataSource as HdContainerDataSource,
  DataSourceLocator as HdDataSourceLocator,
  NurbsPatchSchema as HdNurbsPatchSchema,
  NurbsPatchSchemaTokens as HdNurbsPatchSchemaTokens,
  OverlayContainerDataSource as HdOverlayContainerDataSource,
  PrimvarsSchema as HdPrimvarsSchema,
  type DataSourceBase as HdDataSourceBase,
  type DataSourceLocatorSet as HdDataSourceLocatorSet,
} from 'typescript-usd/hd'
import { SdfPath } from 'typescript-usd/sdf/path'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import { UsdImagingDataSourceGprim } from './dataSourceGprim.ts'
import { UsdImagingDataSourceMapped } from './dataSourceMapped.ts'
import { UsdImagingDataSourceCustomPrimvars } from './dataSourcePrimvars.ts'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import type { UsdImagingPropertyInvalidationType } from './types.ts'

/** UsdGeomNurbsPatch::GetSchemaAttributeNames(false)
 *  (usdGeom/nurbsPatch.cpp:394-412). */
const _usdGeomNurbsPatchSchemaAttributeNames: readonly string[] = [
  'uVertexCount',
  'vVertexCount',
  'uOrder',
  'vOrder',
  'uKnots',
  'vKnots',
  'uForm',
  'vForm',
  'uRange',
  'vRange',
  'pointWeights',
  'trimCurve:counts',
  'trimCurve:orders',
  'trimCurve:vertexCounts',
  'trimCurve:knots',
  'trimCurve:ranges',
  'trimCurve:points',
]

/** dataSourceNurbsPatch.cpp:21-27 */
function _ToLocator(name: string): HdDataSourceLocator {
  const tokens = SdfPath.tokenizeIdentifier(name)
  return new HdDataSourceLocator(...tokens)
}

/** dataSourceNurbsPatch.cpp:29-61 */
function _GetPropertyMappings(): UsdImagingDataSourceMapped.PropertyMapping[] {
  const result: UsdImagingDataSourceMapped.PropertyMapping[] = []

  // Pick up from UsdGeomGprim
  result.push(
    new UsdImagingDataSourceMapped.AttributeMapping(
      'doubleSided',
      new HdDataSourceLocator(HdNurbsPatchSchemaTokens.doubleSided)))
  result.push(
    new UsdImagingDataSourceMapped.AttributeMapping(
      'orientation',
      new HdDataSourceLocator(HdNurbsPatchSchemaTokens.orientation)))

  for (const usdName of _usdGeomNurbsPatchSchemaAttributeNames) {
    // UsdGeomTokens->pointWeights
    if (usdName === 'pointWeights') {
      // Suppress pointWeights from UsdGeomNurbsCurves (which is a custom
      // primvar we process in the prim source below).
      continue
    }
    result.push(
      new UsdImagingDataSourceMapped.AttributeMapping(
        usdName, _ToLocator(usdName)))
  }
  return result
}

let _mappings: UsdImagingDataSourceMapped.PropertyMappings | undefined

/** dataSourceNurbsPatch.cpp:63-69 */
function _GetMappings(): UsdImagingDataSourceMapped.PropertyMappings {
  return _mappings ??= new UsdImagingDataSourceMapped.PropertyMappings(
    _GetPropertyMappings(), HdNurbsPatchSchema.getDefaultLocator())
}

let _customPrimvarMappings: UsdImagingDataSourceCustomPrimvars.Mappings | undefined

/** dataSourceNurbsPatch.cpp:71-79 */
function _GetCustomPrimvarMappings(_usdPrim: UsdPrim): UsdImagingDataSourceCustomPrimvars.Mappings {
  // UsdGeomTokens->pointWeights
  const hdPrimvarName = 'pointWeights'
  return _customPrimvarMappings ??= [
    { primvarName: hdPrimvarName, usdAttrName: 'pointWeights' },
  ]
}

// ----------------------------------------------------------------------------

/** dataSourceNurbsPatch.h:15-41: a prim data source representing
 *  UsdGeomNurbsPatch. */
export class UsdImagingDataSourceNurbsPatchPrim extends UsdImagingDataSourceGprim {
  /** dataSourceNurbsPatch.cpp:87-93 */
  protected constructor(
    sceneIndexPath: string,
    usdPrim: UsdPrim,
    stageGlobals: UsdImagingDataSourceStageGlobals,
  ) {
    super(sceneIndexPath, usdPrim, stageGlobals)
  }

  static override new(
    sceneIndexPath: string, usdPrim: UsdPrim, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): UsdImagingDataSourceNurbsPatchPrim {
    return new UsdImagingDataSourceNurbsPatchPrim(sceneIndexPath, usdPrim, stageGlobals)
  }

  /** dataSourceNurbsPatch.cpp:95-101 */
  override getNames(): string[] {
    const result = super.getNames()
    result.push(HdNurbsPatchSchema.getSchemaToken())
    return result
  }

  /** dataSourceNurbsPatch.cpp:103-127 */
  override Get(name: string): HdDataSourceBase | undefined {
    if (name === HdNurbsPatchSchema.getSchemaToken()) {
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

  /** dataSourceNurbsPatch.cpp:129-151 */
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

// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/dataSourceBasisCurves.cpp,
//  pxr/usdImaging/usdImaging/dataSourceBasisCurves.h
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/dataSourceBasisCurves.{h,cpp}
// (OpenUSD 26.11.1).

import {
  BasisCurvesSchema as HdBasisCurvesSchema,
  BasisCurvesSchemaTokens as HdBasisCurvesSchemaTokens,
  BasisCurvesTopologySchema as HdBasisCurvesTopologySchema,
  BasisCurvesTopologySchemaTokens as HdBasisCurvesTopologySchemaTokens,
  ContainerDataSource as HdContainerDataSource,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  type DataSourceBase as HdDataSourceBase,
  type DataSourceLocator as HdDataSourceLocator,
} from 'typescript-usd/hd'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import { BasisCurves as UsdGeomBasisCurves } from 'typescript-usd/usdGeom'
import { UsdImagingDataSourceAttribute } from './dataSourceAttribute.ts'
import { UsdImagingDataSourceGprim } from './dataSourceGprim.ts'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import type { UsdImagingPropertyInvalidationType } from './types.ts'

/** dataSourceBasisCurves.h:20-42: a container data source representing
 *  basis curves topology information. */
export class UsdImagingDataSourceBasisCurvesTopology extends HdContainerDataSource {
  private static _curveVertexCountsLocator: HdDataSourceLocator | undefined

  /** dataSourceBasisCurves.cpp:20-29 */
  private constructor(
    private readonly _sceneIndexPath: string,
    private readonly _usdBasisCurves: UsdGeomBasisCurves,
    private readonly _stageGlobals: UsdImagingDataSourceStageGlobals,
  ) { super() }

  static new(
    sceneIndexPath: string, usdBasisCurves: UsdGeomBasisCurves,
    stageGlobals: UsdImagingDataSourceStageGlobals,
  ): UsdImagingDataSourceBasisCurvesTopology {
    return new UsdImagingDataSourceBasisCurvesTopology(sceneIndexPath, usdBasisCurves, stageGlobals)
  }

  /** dataSourceBasisCurves.cpp:31-40 */
  getNames(): string[] {
    return [
      HdBasisCurvesTopologySchemaTokens.curveVertexCounts,
      HdBasisCurvesTopologySchemaTokens.basis,
      HdBasisCurvesTopologySchemaTokens.type,
      HdBasisCurvesTopologySchemaTokens.wrap,
    ]
  }

  /** dataSourceBasisCurves.cpp:42-62 */
  Get(name: string): HdDataSourceBase | undefined {
    if (name === HdBasisCurvesTopologySchemaTokens.curveVertexCounts) {
      const locator = UsdImagingDataSourceBasisCurvesTopology._curveVertexCountsLocator ??=
        HdBasisCurvesTopologySchema.getDefaultLocator().append(name)
      return UsdImagingDataSourceAttribute.new(
        this._usdBasisCurves.getCurveVertexCountsAttr(), this._stageGlobals,
        this._sceneIndexPath, locator)
    } else if (name === HdBasisCurvesTopologySchemaTokens.basis) {
      return UsdImagingDataSourceAttribute.new<string>(
        this._usdBasisCurves.getBasisAttr(), this._stageGlobals)
    } else if (name === HdBasisCurvesTopologySchemaTokens.type) {
      return UsdImagingDataSourceAttribute.new<string>(
        this._usdBasisCurves.getTypeAttr(), this._stageGlobals)
    } else if (name === HdBasisCurvesTopologySchemaTokens.wrap) {
      return UsdImagingDataSourceAttribute.new<string>(
        this._usdBasisCurves.getWrapAttr(), this._stageGlobals)
    }
    return undefined
  }
}

// ----------------------------------------------------------------------------

/** dataSourceBasisCurves.h:48-70: a container data source representing
 *  data unique to basis curves. */
export class UsdImagingDataSourceBasisCurves extends HdContainerDataSource {
  /** dataSourceBasisCurves.cpp:64-74 */
  private constructor(
    private readonly _sceneIndexPath: string,
    private readonly _usdBasisCurves: UsdGeomBasisCurves,
    private readonly _stageGlobals: UsdImagingDataSourceStageGlobals,
  ) { super() }

  static new(
    sceneIndexPath: string, usdBasisCurves: UsdGeomBasisCurves,
    stageGlobals: UsdImagingDataSourceStageGlobals,
  ): UsdImagingDataSourceBasisCurves {
    return new UsdImagingDataSourceBasisCurves(sceneIndexPath, usdBasisCurves, stageGlobals)
  }

  /** dataSourceBasisCurves.cpp:76-82 */
  getNames(): string[] {
    return [
      HdBasisCurvesSchemaTokens.topology,
    ]
  }

  /** dataSourceBasisCurves.cpp:84-93 */
  Get(name: string): HdDataSourceBase | undefined {
    if (name === HdBasisCurvesSchemaTokens.topology) {
      return UsdImagingDataSourceBasisCurvesTopology.new(
        this._sceneIndexPath, this._usdBasisCurves, this._stageGlobals)
    }

    return undefined
  }
}

// ----------------------------------------------------------------------------

/** dataSourceBasisCurves.h:76-100: a prim data source representing
 *  UsdGeomBasisCurves. */
export class UsdImagingDataSourceBasisCurvesPrim extends UsdImagingDataSourceGprim {
  /** dataSourceBasisCurves.cpp:94-102 */
  protected constructor(
    sceneIndexPath: string,
    usdPrim: UsdPrim,
    stageGlobals: UsdImagingDataSourceStageGlobals,
  ) {
    super(sceneIndexPath, usdPrim, stageGlobals)
  }

  static override new(
    sceneIndexPath: string, usdPrim: UsdPrim, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): UsdImagingDataSourceBasisCurvesPrim {
    return new UsdImagingDataSourceBasisCurvesPrim(sceneIndexPath, usdPrim, stageGlobals)
  }

  /** dataSourceBasisCurves.cpp:104-111 */
  override getNames(): string[] {
    const result = super.getNames()
    result.push(HdBasisCurvesSchema.getSchemaToken())

    return result
  }

  /** dataSourceBasisCurves.cpp:113-125 */
  override Get(name: string): HdDataSourceBase | undefined {
    if (name === HdBasisCurvesSchema.getSchemaToken()) {
      return UsdImagingDataSourceBasisCurves.new(
        this._getSceneIndexPath(),
        new UsdGeomBasisCurves(this._getUsdPrim()),
        this._getStageGlobals())
    }

    return super.Get(name)
  }

  /** dataSourceBasisCurves.cpp:127-160 */
  static override invalidate(
    prim: UsdPrim,
    subprim: string,
    properties: readonly string[],
    invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    let result = new HdDataSourceLocatorSet()

    if (subprim === '') {
      result = UsdImagingDataSourceGprim.invalidate(
        prim, subprim, properties, invalidationType)

      // Property names are UsdGeomTokens.
      for (const propertyName of properties) {
        if (propertyName === 'curveVertexCounts') {
          result.insert(HdBasisCurvesTopologySchema.getDefaultLocator()
            .append(HdBasisCurvesTopologySchemaTokens.curveVertexCounts))
        } else if (propertyName === 'type') {
          result.insert(HdBasisCurvesTopologySchema.getDefaultLocator()
            .append(HdBasisCurvesTopologySchemaTokens.type))
        } else if (propertyName === 'basis') {
          result.insert(HdBasisCurvesTopologySchema.getDefaultLocator()
            .append(HdBasisCurvesTopologySchemaTokens.basis))
        } else if (propertyName === 'wrap') {
          result.insert(HdBasisCurvesTopologySchema.getDefaultLocator()
            .append(HdBasisCurvesTopologySchemaTokens.wrap))
        }
      }
    }

    return result
  }
}

// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/geomSubsetAdapter.cpp,
//  pxr/usdImaging/usdImaging/geomSubsetAdapter.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/geomSubsetAdapter.{h,cpp}
// (OpenUSD 26.11.1): the scene index API. The UsdImagingDelegate overrides
// (Populate, TrackVariability, UpdateForTime, ...; geomSubsetAdapter.cpp:
// 185-) are not ported, see primAdapter.ts.

import {
  DataSourceLocator as HdDataSourceLocator,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  GeomSubsetSchema as HdGeomSubsetSchema,
  GeomSubsetSchemaTokens as HdGeomSubsetSchemaTokens,
  OverlayContainerDataSource as HdOverlayContainerDataSource,
  PrimTypeTokens as HdPrimTypeTokens,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  TokenDataSource as HdTokenDataSource,
  type ContainerDataSource as HdContainerDataSource,
  type IntArrayDataSource as HdIntArrayDataSource,
  type TypedSampledDataSource as HdTypedSampledDataSource,
} from 'typescript-usd/hd'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import { Subset as UsdGeomSubset } from 'typescript-usd/usdGeom'
import { Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { UsdImagingDataSourceAttribute } from './dataSourceAttribute.ts'
import { UsdImagingDataSourcePrim } from './dataSourcePrim.ts'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import { UsdImagingPrimAdapter } from './primAdapter.ts'
import { TF_WARN } from './tfDiagnostic.ts'
import type { UsdImagingPropertyInvalidationType } from './types.ts'

/** geomSubsetAdapter.cpp:50-109: simple data source for converting values
 *  of UsdGeomSubset's `elementType` to the corresponding values of
 *  HdGeomSubset's `type`. */
class _ElementTypeConversionDataSource extends HdTokenDataSource {
  private constructor(private readonly _source: HdTypedSampledDataSource<string> | undefined) {
    super()
  }

  static new(source: HdTypedSampledDataSource<string> | undefined): _ElementTypeConversionDataSource {
    return new _ElementTypeConversionDataSource(source)
  }

  override GetValue(shutterOffset: number): VtValue {
    return VtValue.create(this.getTypedValue(shutterOffset), VtValueTypes.token)
  }

  getTypedValue(shutterOffset: number): string {
    if (!this._source) {
      return ''
    }

    // Translate the type token from USD to Hydra.
    const type = this._source.getTypedValue(shutterOffset)
    // UsdGeomTokens->face
    if (type === 'face') {
      return HdGeomSubsetSchemaTokens.typeFaceSet
    }
    // UsdGeomTokens->point
    if (type === 'point') {
      return HdGeomSubsetSchemaTokens.typePointSet
    }
    // TODO: USD also supports 'edge' and 'tetrahedron' types. These will
    // be added to Hydra in an upcoming change.
    TF_WARN(`Unsupported GeomSubset type: ${type}`)
    return ''
  }

  GetContributingSampleTimesForInterval(
    startTime: number, endTime: number, sampleTimes: number[],
  ): boolean {
    if (!this._source) {
      return false
    }
    return this._source.GetContributingSampleTimesForInterval(
      startTime, endTime, sampleTimes)
  }
}

/** geomSubsetAdapter.h:27-112 */
export class UsdImagingGeomSubsetAdapter extends UsdImagingPrimAdapter {
  /** geomSubsetAdapter.cpp:118-122 */
  override getImagingSubprims(_prim: UsdPrim): string[] {
    return ['']
  }

  /** geomSubsetAdapter.cpp:124-133 */
  override getImagingSubprimType(_prim: UsdPrim, subprim: string): string {
    if (subprim === '') {
      return HdPrimTypeTokens.geomSubset
    }
    return ''
  }

  /** geomSubsetAdapter.cpp:135-162 */
  override getImagingSubprimData(
    prim: UsdPrim, subprim: string, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): HdContainerDataSource | undefined {
    if (subprim === '') {
      const subset = new UsdGeomSubset(prim)
      return HdOverlayContainerDataSource.new(
        HdRetainedContainerDataSource.new(
          [HdGeomSubsetSchema.getSchemaToken()],
          [new HdGeomSubsetSchema.Builder()
            .setIndices(UsdImagingDataSourceAttribute.new(
              subset.getIndicesAttr(), stageGlobals) as unknown as HdIntArrayDataSource)
            .setType(_ElementTypeConversionDataSource.new(
              UsdImagingDataSourceAttribute.new<string>(
                subset.getElementTypeAttr(), stageGlobals)))
            .build()]),
        // The geomSubset must also be a prim so it can
        // pick up existing material binding handling.
        UsdImagingDataSourcePrim.new(
          prim.path,
          prim,
          stageGlobals),
      )
    }
    return undefined
  }

  /** geomSubsetAdapter.cpp:164-183 */
  override invalidateImagingSubprim(
    prim: UsdPrim, subprim: string, properties: readonly string[],
    invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    const locators = new HdDataSourceLocatorSet()
    for (const name of properties) {
      // UsdGeomTokens->indices
      if (name === 'indices') {
        locators.insert(
          new HdDataSourceLocator(HdGeomSubsetSchemaTokens.indices))
      // UsdGeomTokens->elementType
      } else if (name === 'elementType') {
        locators.insert(
          new HdDataSourceLocator(HdGeomSubsetSchemaTokens.type))
      }
    }
    locators.insert(
      UsdImagingDataSourcePrim.invalidate(
        prim, subprim, properties, invalidationType))
    return locators
  }
}

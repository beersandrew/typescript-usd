// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdSkelImaging/dataSourceSkeletonPrim.cpp,
//  pxr/usdImaging/usdSkelImaging/dataSourceSkeletonPrim.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdSkelImaging/dataSourceSkeletonPrim.{h,cpp}
// (OpenUSD 26.11.1).

import {
  DataSourceLocator as HdDataSourceLocator, OverlayContainerDataSource as HdOverlayContainerDataSource,
  PurposeSchema as HdPurposeSchema, RenderTagTokens as HdRenderTagTokens,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  ContainerDataSource as HdContainerDataSource,
  type DataSourceBase as HdDataSourceBase, type DataSourceLocatorSet as HdDataSourceLocatorSet,
} from 'typescript-usd/hd'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import {
  UsdImagingDataSourceGprim, UsdImagingDataSourceMapped,
  type UsdImagingDataSourceStageGlobals, type UsdImagingPropertyInvalidationType,
} from 'typescript-usd/usdImaging'
import { UsdSkelImagingSkeletonSchema } from './skeletonSchema.ts'

/** UsdSkelSkeleton::GetSchemaAttributeNames(false)
 *  (pxr/usd/usdSkel/skeleton.cpp:171-180). */
const _UsdSkelSkeletonLocalSchemaAttributeNames: readonly string[] = [
  'joints',
  'jointNames',
  'bindTransforms',
  'restTransforms',
]

/** dataSourceSkeletonPrim.cpp:23-38 */
function _GetPropertyMappings(): UsdImagingDataSourceMapped.PropertyMapping[] {
  const result: UsdImagingDataSourceMapped.PropertyMapping[] = []

  for (const usdName of _UsdSkelSkeletonLocalSchemaAttributeNames) {
    result.push(
      new UsdImagingDataSourceMapped.AttributeMapping(
        usdName, new HdDataSourceLocator(usdName)))
  }

  return result
}

let _mappings: UsdImagingDataSourceMapped.PropertyMappings | undefined

/** dataSourceSkeletonPrim.cpp:40-46 */
function _GetMappings(): UsdImagingDataSourceMapped.PropertyMappings {
  return _mappings ??= new UsdImagingDataSourceMapped.PropertyMappings(
    _GetPropertyMappings(),
    UsdSkelImagingSkeletonSchema.getDefaultLocator())
}

/** dataSourceSkeletonPrim.cpp:60-66 */
function _AddIfNecessary(name: string, names: string[]): void {
  if (!names.includes(name)) {
    names.push(name)
  }
}

let _purposeSchemaDataSource: HdContainerDataSource | undefined

/** dataSourceSkeletonPrim.h:15-41. A prim data source for UsdSkel's
 *  Skeleton. */
export class UsdSkelImagingDataSourceSkeletonPrim extends UsdImagingDataSourceGprim {
  /** dataSourceSkeletonPrim.cpp:52-58 */
  protected constructor(
    sceneIndexPath: string,
    usdPrim: UsdPrim,
    stageGlobals: UsdImagingDataSourceStageGlobals,
  ) {
    super(sceneIndexPath, usdPrim, stageGlobals)
  }

  static override new(
    sceneIndexPath: string, usdPrim: UsdPrim, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): UsdSkelImagingDataSourceSkeletonPrim {
    return new UsdSkelImagingDataSourceSkeletonPrim(sceneIndexPath, usdPrim, stageGlobals)
  }

  /** dataSourceSkeletonPrim.cpp:68-77 */
  override getNames(): string[] {
    const result = super.getNames()
    result.push(UsdSkelImagingSkeletonSchema.getSchemaToken())

    _AddIfNecessary(HdPurposeSchema.getSchemaToken(), result)

    return result
  }

  /** dataSourceSkeletonPrim.cpp:79-111 */
  override Get(name: string): HdDataSourceBase | undefined {
    if (name === UsdSkelImagingSkeletonSchema.getSchemaToken()) {
      return UsdImagingDataSourceMapped.new(
        this._getUsdPrim(),
        this._getSceneIndexPath(),
        _GetMappings(),
        this._getStageGlobals())
    }

    const result = super.Get(name)

    if (name === HdPurposeSchema.getSchemaToken()) {
      _purposeSchemaDataSource ??= new HdPurposeSchema.Builder()
        .setPurpose(
          // This token and the method returning a token
          // data source should be on HdPurposeSchema.
          HdRetainedTypedSampledDataSource.new<string>(HdRenderTagTokens.guide))
        .build()

      // HdCreateOverlayContainerDataSource
      return HdOverlayContainerDataSource.overlayedContainerDataSources(
        // Authored opinion about purpose overrides default.
        result instanceof HdContainerDataSource ? result : undefined,
        _purposeSchemaDataSource)
    }

    return result
  }

  /** dataSourceSkeletonPrim.cpp:113-131 */
  static override invalidate(
    prim: UsdPrim,
    subprim: string,
    properties: readonly string[],
    invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    const locators = UsdImagingDataSourceMapped.invalidate(
      properties, _GetMappings())

    locators.insert(
      UsdImagingDataSourceGprim.invalidate(
        prim, subprim, properties, invalidationType))

    return locators
  }
}

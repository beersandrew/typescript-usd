// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImaging/dataSourceVolume.cpp,
//  pxr/usdImaging/usdImaging/dataSourceVolume.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/dataSourceVolume.{h,cpp}
// (OpenUSD 26.11.1).

import {
  ContainerDataSource as HdContainerDataSource,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  VolumeFieldBindingSchema as HdVolumeFieldBindingSchema,
  type DataSourceBase as HdDataSourceBase,
  type DataSourceLocatorSet as HdDataSourceLocatorSet,
} from 'typescript-usd/hd'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import { Tokens as UsdVolTokens, Volume as UsdVolVolume } from 'typescript-usd/usdVol'
import { UsdImagingDataSourceGprim } from './dataSourceGprim.ts'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import type { UsdImagingPropertyInvalidationType } from './types.ts'

/** dataSourceVolume.h:20-43: a container data source representing volume
 *  field binding information. */
export class UsdImagingDataSourceVolumeFieldBindings extends HdContainerDataSource {
  /** dataSourceVolume.cpp:16-23. Private constructor, use static New()
   *  instead. */
  private constructor(
    private readonly _usdVolume: UsdVolVolume,
    private readonly _stageGlobals: UsdImagingDataSourceStageGlobals,
  ) { super() }

  static new(
    usdVolume: UsdVolVolume, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): UsdImagingDataSourceVolumeFieldBindings {
    return new UsdImagingDataSourceVolumeFieldBindings(usdVolume, stageGlobals)
  }

  /** dataSourceVolume.cpp:25-40 */
  getNames(): string[] {
    // XXX: This is more expensive than necessary, because we compute
    // relationship targets in addition to enumerating relationships.
    // Maybe ask for a UsdVolVolume.GetFieldRelationships call?
    const fields = this._usdVolume.getFieldPaths()
    const names: string[] = []
    for (const name of fields.keys()) {
      names.push(name)
    }
    return names
  }

  /** dataSourceVolume.cpp:42-53 */
  Get(name: string): HdDataSourceBase | undefined {
    const path = this._usdVolume.getFieldPath(name)
    if (path === '') {
      return undefined
    }

    return HdRetainedTypedSampledDataSource.new(path)
  }
}

/** dataSourceVolume.h:47-75: a prim data source representing a UsdVolVolume
 *  prim. */
export class UsdImagingDataSourceVolumePrim extends UsdImagingDataSourceGprim {
  /** dataSourceVolume.cpp:55-62. Private constructor, use static New()
   *  instead. */
  protected constructor(
    sceneIndexPath: string,
    usdPrim: UsdPrim,
    stageGlobals: UsdImagingDataSourceStageGlobals,
  ) {
    super(sceneIndexPath, usdPrim, stageGlobals)
  }

  static override new(
    sceneIndexPath: string, usdPrim: UsdPrim, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): UsdImagingDataSourceVolumePrim {
    return new UsdImagingDataSourceVolumePrim(sceneIndexPath, usdPrim, stageGlobals)
  }

  /** dataSourceVolume.cpp:65-72 */
  override getNames(): string[] {
    const result = super.getNames()
    result.push(HdVolumeFieldBindingSchema.getSchemaToken())

    return result
  }

  /** dataSourceVolume.cpp:74-83 */
  override Get(name: string): HdDataSourceBase | undefined {
    if (name === HdVolumeFieldBindingSchema.getSchemaToken()) {
      return UsdImagingDataSourceVolumeFieldBindings.new(
        new UsdVolVolume(this._getUsdPrim(), this._getUsdPrim().getStage()), this._getStageGlobals())
    } else {
      return super.Get(name)
    }
  }

  /** dataSourceVolume.cpp:85-109 */
  static override invalidate(
    prim: UsdPrim,
    subprim: string,
    properties: readonly string[],
    invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    const locators = UsdImagingDataSourceGprim.invalidate(
      prim, subprim, properties, invalidationType)

    const fieldPrefix = UsdVolTokens.field + ':'

    for (const propertyName of properties) {
      if (propertyName.startsWith(fieldPrefix)) {
        // There doesn't seem to be any client that can make use of
        // fine-grained invalidation where we sent the sub data source
        // locator of the volume field binding corresponding to this field.
        locators.insert(HdVolumeFieldBindingSchema.getDefaultLocator())
        break
      }
    }

    return locators
  }
}

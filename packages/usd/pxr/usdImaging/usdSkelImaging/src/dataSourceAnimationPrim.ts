// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdSkelImaging/dataSourceAnimationPrim.cpp,
//  pxr/usdImaging/usdSkelImaging/dataSourceAnimationPrim.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdSkelImaging/dataSourceAnimationPrim.{h,cpp}
// (OpenUSD 26.11.1).

import {
  DataSourceLocator as HdDataSourceLocator,
  type DataSourceBase as HdDataSourceBase, type DataSourceLocatorSet as HdDataSourceLocatorSet,
} from 'typescript-usd/hd'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import {
  UsdImagingDataSourceGprim, UsdImagingDataSourceMapped, UsdImagingDataSourcePrim,
  type UsdImagingDataSourceStageGlobals, type UsdImagingPropertyInvalidationType,
} from 'typescript-usd/usdImaging'
import { UsdSkelImagingAnimationSchema } from './animationSchema.ts'

/** UsdSkelAnimation::GetSchemaAttributeNames(false)
 *  (pxr/usd/usdSkel/animation.cpp:205-216). */
const _UsdSkelAnimationLocalSchemaAttributeNames: readonly string[] = [
  'joints',
  'translations',
  'rotations',
  'scales',
  'blendShapes',
  'blendShapeWeights',
]

/** dataSourceAnimationPrim.cpp:19-34 */
function _GetPropertyMappings(): UsdImagingDataSourceMapped.PropertyMapping[] {
  const result: UsdImagingDataSourceMapped.PropertyMapping[] = []

  for (const usdName of _UsdSkelAnimationLocalSchemaAttributeNames) {
    result.push(
      new UsdImagingDataSourceMapped.AttributeMapping(
        usdName, new HdDataSourceLocator(usdName)))
  }

  return result
}

let _mappings: UsdImagingDataSourceMapped.PropertyMappings | undefined

/** dataSourceAnimationPrim.cpp:36-42 */
function _GetMappings(): UsdImagingDataSourceMapped.PropertyMappings {
  return _mappings ??= new UsdImagingDataSourceMapped.PropertyMappings(
    _GetPropertyMappings(),
    UsdSkelImagingAnimationSchema.getDefaultLocator())
}

/** dataSourceAnimationPrim.h:18-50. A prim data source for UsdSkel's
 *  SkelAnimation. */
export class UsdSkelImagingDataSourceAnimationPrim extends UsdImagingDataSourcePrim {
  /** dataSourceAnimationPrim.cpp:48-55 */
  protected constructor(
    sceneIndexPath: string,
    usdPrim: UsdPrim,
    stageGlobals: UsdImagingDataSourceStageGlobals,
  ) {
    super(sceneIndexPath, usdPrim, stageGlobals)
  }

  static override new(
    sceneIndexPath: string, usdPrim: UsdPrim, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): UsdSkelImagingDataSourceAnimationPrim {
    return new UsdSkelImagingDataSourceAnimationPrim(sceneIndexPath, usdPrim, stageGlobals)
  }

  /** dataSourceAnimationPrim.cpp:57-64 */
  override getNames(): string[] {
    const result = super.getNames()
    result.push(UsdSkelImagingAnimationSchema.getSchemaToken())
    return result
  }

  /** dataSourceAnimationPrim.cpp:66-79 */
  override Get(name: string): HdDataSourceBase | undefined {
    if (name === UsdSkelImagingAnimationSchema.getSchemaToken()) {
      return UsdImagingDataSourceMapped.new(
        this._getUsdPrim(),
        this._getSceneIndexPath(),
        _GetMappings(),
        this._getStageGlobals())
    }

    return super.Get(name)
  }

  /** dataSourceAnimationPrim.cpp:81-99 */
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

// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/backPlateAPIAdapter.cpp,
//  pxr/usdImaging/usdImaging/backPlateAPIAdapter.h
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/backPlateAPIAdapter.{h,cpp}
// (OpenUSD 26.11.1).
//
// Divergence: typescript-usd/usdGeom has no UsdGeomBackPlateAPI class. The
// adapter reads the multiple-apply schema's attributes by the names its
// generated accessors use (usdGeom/schema.usda BackPlateAPI:
// "backPlate:<instance>:<baseName>").

import {
  BackPlateSchema as HdBackPlateSchema,
  BackPlateSchemaTokens as HdBackPlateSchemaTokens,
  CameraSchema as HdCameraSchema,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  type ContainerDataSource as HdContainerDataSource,
} from 'typescript-usd/hd'
import type { Vec2f as GfVec2f, Vec3f as GfVec3f } from 'typescript-usd/gf'
import type { AssetPath as SdfAssetPath } from 'typescript-usd/sdf'
import type { Attribute as UsdAttribute, Prim as UsdPrim } from 'typescript-usd/usd'
import { UsdImagingAPISchemaAdapter } from './apiSchemaAdapter.ts'
import { UsdImagingDataSourceAttribute } from './dataSourceAttribute.ts'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import type { UsdImagingPropertyInvalidationType } from './types.ts'

/** UsdGeomBackPlateAPI::Get<BaseName>Attr for the instance `name`
 *  (UsdGeomBackPlateAPI(prim, name)). */
function _GetBackPlateAttr(prim: UsdPrim, name: string, baseName: string): UsdAttribute {
  return prim.getAttr(`backPlate:${name}:${baseName}`)!
}

/** backPlateAPIAdapter.h:14-40 */
export class UsdImagingBackPlateAPIAdapter extends UsdImagingAPISchemaAdapter {
  /** backPlateAPIAdapter.cpp:30-123 */
  override getImagingSubprimData(
    prim: UsdPrim, _subprim: string, appliedInstanceName: string,
    stageGlobals: UsdImagingDataSourceStageGlobals,
  ): HdContainerDataSource | undefined {
    if (appliedInstanceName === '') {
      return undefined
    }
    const backPlate = (baseName: string): UsdAttribute =>
      _GetBackPlateAttr(prim, appliedInstanceName, baseName)

    let plateVisibility: string = HdBackPlateSchemaTokens.solo
    const authoredVisibility = backPlate('plateVisibility')?.get()
    if (typeof authoredVisibility === 'string') {
      plateVisibility = authoredVisibility
    }

    const plateLocator =
      HdCameraSchema.getBackPlateLocator().append(appliedInstanceName)

    const backPlateDs =
      new HdBackPlateSchema.Builder()
        .setScaleTweak(
          UsdImagingDataSourceAttribute.new<GfVec2f>(
            backPlate('scale:tweak'),
            stageGlobals,
            prim.path,
            plateLocator.append(HdBackPlateSchemaTokens.scaleTweak)))
        .setRotateXYZTweak(
          UsdImagingDataSourceAttribute.new<GfVec3f>(
            backPlate('rotateXYZ:tweak'),
            stageGlobals,
            prim.path,
            plateLocator.append(
              HdBackPlateSchemaTokens.rotateXYZTweak)))
        .setTranslateTweak(
          UsdImagingDataSourceAttribute.new<GfVec3f>(
            backPlate('translate:tweak'),
            stageGlobals,
            prim.path,
            plateLocator.append(
              HdBackPlateSchemaTokens.translateTweak)))
        .setImage(
          UsdImagingDataSourceAttribute.new<SdfAssetPath>(
            backPlate('image'),
            stageGlobals,
            prim.path,
            plateLocator.append(
              HdBackPlateSchemaTokens.image)))
        .setAlphaImage(
          UsdImagingDataSourceAttribute.new<SdfAssetPath>(
            backPlate('alpha:image'), stageGlobals))
        .setDepthImage(
          UsdImagingDataSourceAttribute.new<SdfAssetPath>(
            backPlate('depth:image'), stageGlobals))
        .setDepthMinOffset(
          UsdImagingDataSourceAttribute.new<number>(
            backPlate('depth:minOffset'), stageGlobals))
        .setDepthNormalizingFactor(
          UsdImagingDataSourceAttribute.new<number>(
            backPlate('depth:normalizingFactor'), stageGlobals))
        .setDepthCameraSpaceOffset(
          UsdImagingDataSourceAttribute.new<number>(
            backPlate('depth:cameraSpaceOffset'), stageGlobals))
        .setLumaSlope(
          UsdImagingDataSourceAttribute.new<GfVec3f>(
            backPlate('luma:slope'),
            stageGlobals,
            prim.path,
            plateLocator.append(
              HdBackPlateSchemaTokens.lumaSlope)))
        .setLumaPower(
          UsdImagingDataSourceAttribute.new<GfVec3f>(
            backPlate('luma:power'),
            stageGlobals,
            prim.path,
            plateLocator.append(
              HdBackPlateSchemaTokens.lumaPower)))
        .setLumaOffset(
          UsdImagingDataSourceAttribute.new<GfVec3f>(
            backPlate('luma:offset'),
            stageGlobals,
            prim.path,
            plateLocator.append(
              HdBackPlateSchemaTokens.lumaOffset)))
        .setPlateVisibility(
          HdBackPlateSchema.buildPlateVisibilityDataSource(plateVisibility))
        .build()

    return HdRetainedContainerDataSource.new(
      [HdCameraSchema.getSchemaToken()],
      [HdRetainedContainerDataSource.new(
        [HdBackPlateSchema.getSchemaToken()],
        [HdRetainedContainerDataSource.new(
          [appliedInstanceName], [backPlateDs])])])
  }

  /** backPlateAPIAdapter.cpp:125-146 */
  override invalidateImagingSubprim(
    _prim: UsdPrim, subprim: string, appliedInstanceName: string,
    properties: readonly string[], _invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    if (subprim !== '' || appliedInstanceName === '') {
      return new HdDataSourceLocatorSet()
    }
    const prefix = `backPlate:${appliedInstanceName}:`

    for (const propertyName of properties) {
      if (propertyName.startsWith(prefix)) {
        return new HdDataSourceLocatorSet([HdCameraSchema.getBackPlateLocator()
          .append(appliedInstanceName)])
      }
    }
    return new HdDataSourceLocatorSet()
  }
}

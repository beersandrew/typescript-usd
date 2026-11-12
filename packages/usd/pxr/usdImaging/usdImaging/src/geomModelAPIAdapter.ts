// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/geomModelAPIAdapter.cpp,
//  pxr/usdImaging/usdImaging/geomModelAPIAdapter.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/geomModelAPIAdapter.{h,cpp}
// (OpenUSD 26.11.1).

import {
  DataSourceLocator as HdDataSourceLocator,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  OverlayContainerDataSource as HdOverlayContainerDataSource,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  type ContainerDataSource as HdContainerDataSource,
} from 'typescript-usd/hd'
import { SdfPath } from 'typescript-usd/sdf/path'
import { ModelAPI as UsdModelAPI, type Prim as UsdPrim } from 'typescript-usd/usd'
import { UsdImagingAPISchemaAdapter } from './apiSchemaAdapter.ts'
import { UsdImagingDataSourceMapped } from './dataSourceMapped.ts'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import { UsdImagingGeomModelSchema } from './geomModelSchema.ts'
import type { UsdImagingPropertyInvalidationType } from './types.ts'

/** UsdGeomModelAPI::GetSchemaAttributeNames(false) (usdGeom/modelAPI.cpp:288-313). */
const _UsdGeomModelAPILocalSchemaAttributeNames: readonly string[] = [
  'model:drawMode',
  'model:applyDrawMode',
  'model:drawModeColor',
  'model:cardGeometry',
  'model:cardVisibility',
  'model:cardTextureXPos',
  'model:cardTextureYPos',
  'model:cardTextureZPos',
  'model:cardTextureXNeg',
  'model:cardTextureYNeg',
  'model:cardTextureZNeg',
]

// KindTokens->component (pxr/usd/kind/registry.h).
const _KindTokensComponent = 'component'

/** geomModelAPIAdapter.cpp:24-46 */
function _GetPropertyMappings(): UsdImagingDataSourceMapped.PropertyMapping[] {
  const result: UsdImagingDataSourceMapped.PropertyMapping[] = []

  for (const usdName of _UsdGeomModelAPILocalSchemaAttributeNames) {
    const [name, match] = SdfPath.stripPrefixNamespace(
      usdName, 'model')
    if (match) {
      result.push(
        new UsdImagingDataSourceMapped.AttributeMapping(
          usdName,
          new HdDataSourceLocator(name)))
    }
  }

  return result
}

let _mappings: UsdImagingDataSourceMapped.PropertyMappings | undefined

/** geomModelAPIAdapter.cpp:48-53 */
function _GetMappings(): UsdImagingDataSourceMapped.PropertyMappings {
  return _mappings ??= new UsdImagingDataSourceMapped.PropertyMappings(
    _GetPropertyMappings(), UsdImagingGeomModelSchema.getDefaultLocator())
}

let _applyDrawModeDs: HdContainerDataSource | undefined

/** geomModelAPIAdapter.h:17-36 */
export class UsdImagingGeomModelAPIAdapter extends UsdImagingAPISchemaAdapter {
  /** geomModelAPIAdapter.cpp:64-93 */
  override getImagingSubprimData(
    prim: UsdPrim,
    subprim: string,
    appliedInstanceName: string,
    stageGlobals: UsdImagingDataSourceStageGlobals,
  ): HdContainerDataSource | undefined {
    if (subprim !== '' || appliedInstanceName !== '') {
      return undefined
    }

    // Reflect UsdGeomModelAPI as UsdImagingGeomModelSchema.
    let geomModelDs: HdContainerDataSource | undefined =
      UsdImagingDataSourceMapped.new(
        prim, prim.path, _GetMappings(), stageGlobals)

    // For model components, overlay applyDrawMode=true.
    if (new UsdModelAPI(prim, prim.getStage()).isKind(_KindTokensComponent)) {
      const applyDrawModeDs = _applyDrawModeDs ??=
        new UsdImagingGeomModelSchema.Builder()
          .setApplyDrawMode(
            HdRetainedTypedSampledDataSource.new<boolean>(true))
          .build()
      geomModelDs = HdOverlayContainerDataSource.
        overlayedContainerDataSources(applyDrawModeDs, geomModelDs)
    }

    return HdRetainedContainerDataSource.new(
      [UsdImagingGeomModelSchema.getSchemaToken()], [geomModelDs!])
  }

  /** geomModelAPIAdapter.cpp:96-110 */
  override invalidateImagingSubprim(
    _prim: UsdPrim,
    subprim: string,
    appliedInstanceName: string,
    properties: readonly string[],
    _invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    if (subprim !== '' || appliedInstanceName !== '') {
      return new HdDataSourceLocatorSet()
    }

    return UsdImagingDataSourceMapped.invalidate(
      properties, _GetMappings())
  }
}

// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/lightFilterAdapter.cpp,
//  pxr/usdImaging/usdImaging/lightFilterAdapter.h
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/lightFilterAdapter.{h,cpp}
// (OpenUSD 26.11.1): the scene index part (lightFilterAdapter.h:103-136,
// lightFilterAdapter.cpp:201-298).
//
// Not ported (UsdImagingDelegate only, see primAdapter.ts): IsSupported,
// Populate, _RemovePrim, TrackVariability, UpdateForTime,
// ProcessPropertyChange, MarkDirty, MarkTransformDirty, MarkVisibilityDirty
// and GetMaterialResource (lightFilterAdapter.cpp:40-199).

import {
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  MaterialSchema as HdMaterialSchema,
  MaterialTerminalTokens as HdMaterialTerminalTokens,
  OverlayContainerDataSource as HdOverlayContainerDataSource,
  PrimTypeTokens as HdPrimTypeTokens,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  type ContainerDataSource as HdContainerDataSource,
} from 'typescript-usd/hd'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import { LightFilter as UsdLuxLightFilter } from 'typescript-usd/usdLux'
import { UsdImagingDataSourceMaterial } from './dataSourceMaterial.ts'
import { UsdImagingDataSourcePrim } from './dataSourcePrim.ts'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import { UsdImagingPopulationMode, UsdImagingPrimAdapter } from './primAdapter.ts'
import type { UsdImagingPropertyInvalidationType } from './types.ts'

/** lightFilterAdapter.h:25-145 */
export class UsdImagingLightFilterAdapter extends UsdImagingPrimAdapter {
  /** lightFilterAdapter.cpp:201-205 */
  override getImagingSubprims(_prim: UsdPrim): string[] {
    return ['']
  }

  /** lightFilterAdapter.cpp:207-216 */
  override getImagingSubprimType(_prim: UsdPrim, subprim: string): string {
    if (subprim === '') {
      return HdPrimTypeTokens.lightFilter
    }

    return ''
  }

  /** lightFilterAdapter.cpp:218-241 */
  override getImagingSubprimData(
    prim: UsdPrim, subprim: string, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): HdContainerDataSource | undefined {
    if (subprim !== '') {
      return undefined
    }

    // Overlay the material data source, which computes the node
    // network, over the base prim data source, which provides
    // other needed data like xform and visibility.
    return HdOverlayContainerDataSource.new(
      HdRetainedContainerDataSource.new(
        [HdMaterialSchema.getSchemaToken()],
        [UsdImagingDataSourceMaterial.new(
          prim,
          stageGlobals,
          HdMaterialTerminalTokens.lightFilter)]),
      UsdImagingDataSourcePrim.new(prim.path, prim, stageGlobals))
  }

  /** lightFilterAdapter.cpp:243-271 */
  override invalidateImagingSubprim(
    prim: UsdPrim, subprim: string, properties: readonly string[],
    invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    const result = UsdImagingDataSourcePrim.invalidate(prim, subprim, properties, invalidationType)

    if (subprim !== '') {
      return result
    }

    for (const propertyName of properties) {
      if (propertyName.startsWith('inputs:')) {
        // NOTE: since we don't have access to the prim itself and our
        //       lightFilter terminal is currently named for the USD path,
        //       we cannot be specific to the individual parameter.
        // TODO: Consider whether we want to make the terminal node
        //       in the material network have a fixed name for the
        //       lightFilter case so that we could.
        result.insert(HdMaterialSchema.getDefaultLocator())
        break
      }
    }

    return result
  }

  /** lightFilterAdapter.cpp:273-277 */
  override getPopulationMode(): UsdImagingPopulationMode {
    return UsdImagingPrimAdapter.RepresentsSelfAndDescendents
  }

  /** lightFilterAdapter.cpp:279-298 */
  override invalidateImagingSubprimFromDescendent(
    prim: UsdPrim, _descendentPrim: UsdPrim, _subprim: string,
    _properties: readonly string[], _invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    const result = new HdDataSourceLocatorSet()

    const filter = new UsdLuxLightFilter(prim, prim.getStage())
    if (!filter.isValid()) {
      return result
    }

    // TODO: perhaps enable more selective dirtying, as is done in UsdImagingMaterialAdapter
    result.insert(HdMaterialSchema.getDefaultLocator())

    return result
  }
}

// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImaging/lightAdapter.cpp,
//  pxr/usdImaging/usdImaging/lightAdapter.h
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/lightAdapter.{h,cpp}
// (OpenUSD 26.11.1): the scene index part (lightAdapter.h:28-48,
// lightAdapter.cpp:32-63).
//
// Not ported (UsdImagingDelegate only, see primAdapter.ts): IsSupported,
// Populate, _RemovePrim, TrackVariability, UpdateForTime,
// ProcessPropertyChange, the Mark*Dirty methods, GetMaterialResource,
// _AddSprim, _RemoveSprim and the light collection cache bookkeeping
// (lightAdapter.cpp:65-323).
//
// Divergence: upstream derives from UsdImagingInstanceablePrimAdapter
// (lightAdapter.h:25), whose overrides all serve UsdImagingDelegate
// instancing; it has no scene index API. This port derives from
// UsdImagingPrimAdapter directly.

import type { ContainerDataSource as HdContainerDataSource, DataSourceLocatorSet as HdDataSourceLocatorSet } from 'typescript-usd/hd'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import { UsdImagingDataSourcePrim } from './dataSourcePrim.ts'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import { UsdImagingPrimAdapter } from './primAdapter.ts'
import type { UsdImagingPropertyInvalidationType } from './types.ts'

/** lightAdapter.h:25-163 */
export class UsdImagingLightAdapter extends UsdImagingPrimAdapter {
  /** lightAdapter.cpp:32-38. USDIMAGING_ENABLE_SCENE_LIGHTS defaults to 1;
   *  this port has no TfEnvSetting for it. */
  static isEnabledSceneLights(): boolean {
    return true
  }

  /** lightAdapter.cpp:40-52 */
  override getImagingSubprimData(
    prim: UsdPrim, subprim: string, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): HdContainerDataSource | undefined {
    if (subprim === '') {
      return UsdImagingDataSourcePrim.new(prim.path, prim, stageGlobals)
    }

    return undefined
  }

  /** lightAdapter.cpp:54-63 */
  override invalidateImagingSubprim(
    prim: UsdPrim, subprim: string, properties: readonly string[],
    invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    return UsdImagingDataSourcePrim.invalidate(prim, subprim, properties, invalidationType)
  }
}

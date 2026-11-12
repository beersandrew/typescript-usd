// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImaging/cameraAdapter.cpp,
//  pxr/usdImaging/usdImaging/cameraAdapter.h
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/cameraAdapter.{h,cpp} (OpenUSD 26.11.1):
// the scene index API. The UsdImagingDelegate side of the adapter
// (IsSupported, Populate, TrackVariability, ProcessPropertyChange,
// GetPoints/GetTopology and the other value getters) is not ported, see
// primAdapter.ts.

import {
  type ContainerDataSource as HdContainerDataSource,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  PrimTypeTokens as HdPrimTypeTokens,
} from 'typescript-usd/hd'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import { UsdImagingDataSourceCameraPrim } from './dataSourceCamera.ts'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import { UsdImagingPrimAdapter } from './primAdapter.ts'
import type { UsdImagingPropertyInvalidationType } from './types.ts'

/** cameraAdapter.h:25-137 */
export class UsdImagingCameraAdapter extends UsdImagingPrimAdapter {
  /** cameraAdapter.cpp:31-35 */
  override getImagingSubprims(_prim: UsdPrim): string[] {
    return ['']
  }

  /** cameraAdapter.cpp:37-46 */
  override getImagingSubprimType(_prim: UsdPrim, subprim: string): string {
    if (subprim === '') {
      return HdPrimTypeTokens.camera
    }
    return ''
  }

  /** cameraAdapter.cpp:48-61 */
  override getImagingSubprimData(
    prim: UsdPrim, subprim: string, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): HdContainerDataSource | undefined {
    if (subprim === '') {
      return UsdImagingDataSourceCameraPrim.new(
        prim.path,
        prim,
        stageGlobals)
    }
    return undefined
  }

  /** cameraAdapter.cpp:63-76 */
  override invalidateImagingSubprim(
    prim: UsdPrim, subprim: string, properties: readonly string[],
    invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    if (subprim === '') {
      return UsdImagingDataSourceCameraPrim.invalidate(
        prim, subprim, properties, invalidationType)
    }

    return new HdDataSourceLocatorSet()
  }
}

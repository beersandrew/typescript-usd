// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImaging/volumeAdapter.cpp,
//  pxr/usdImaging/usdImaging/volumeAdapter.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/volumeAdapter.{h,cpp}
// (OpenUSD 26.11.1): the scene index part (volumeAdapter.cpp:38-84).
//
// Not ported (UsdImagingDelegate only, see primAdapter.ts): IsSupported,
// _GatherVolumeData, Populate, TrackVariability, UpdateForTime and
// GetVolumeFieldDescriptors (volumeAdapter.cpp:85-185).

import { DataSourceLocatorSet as HdDataSourceLocatorSet, PrimTypeTokens as HdPrimTypeTokens, type ContainerDataSource as HdContainerDataSource } from 'typescript-usd/hd'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import { UsdImagingDataSourceVolumePrim } from './dataSourceVolume.ts'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import { UsdImagingGprimAdapter } from './gprimAdapter.ts'
import type { UsdImagingPropertyInvalidationType } from './types.ts'

/** volumeAdapter.h:24-100 */
export class UsdImagingVolumeAdapter extends UsdImagingGprimAdapter {
  /** volumeAdapter.cpp:38-42 */
  override getImagingSubprims(_prim: UsdPrim): string[] {
    return ['']
  }

  /** volumeAdapter.cpp:44-54 */
  override getImagingSubprimType(_prim: UsdPrim, subprim: string): string {
    if (subprim === '') {
      return HdPrimTypeTokens.volume
    }
    return ''
  }

  /** volumeAdapter.cpp:55-69 */
  override getImagingSubprimData(
    prim: UsdPrim, subprim: string, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): HdContainerDataSource | undefined {
    if (subprim === '') {
      return UsdImagingDataSourceVolumePrim.new(
        prim.path,
        prim,
        stageGlobals)
    }
    return undefined
  }

  /** volumeAdapter.cpp:70-84 */
  override invalidateImagingSubprim(
    prim: UsdPrim, subprim: string, properties: readonly string[],
    invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    if (subprim === '') {
      return UsdImagingDataSourceVolumePrim.invalidate(
        prim, subprim, properties, invalidationType)
    }

    return new HdDataSourceLocatorSet()
  }
}

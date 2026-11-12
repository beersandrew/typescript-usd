// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/renderPassAdapter.cpp,
//  pxr/usdImaging/usdImaging/renderPassAdapter.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/renderPassAdapter.{h,cpp} (OpenUSD 26.11.1):
// the 2.0 (scene index) prim adapter API.
//
// The 1.0 (UsdImagingDelegate) part is not ported (primAdapter.ts header):
// IsSupported, Populate, _RemovePrim, TrackVariability, UpdateForTime,
// ProcessPropertyChange, MarkDirty.

import {
  PrimTypeTokens as HdPrimTypeTokens,
  type ContainerDataSource as HdContainerDataSource,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
} from 'typescript-usd/hd'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import { UsdImagingDataSourceRenderPassPrim } from './dataSourceRenderPrims.ts'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import { UsdImagingPrimAdapter } from './primAdapter.ts'
import type { UsdImagingPropertyInvalidationType } from './types.ts'

/** renderPassAdapter.h:22-126 */
export class UsdImagingRenderPassAdapter extends UsdImagingPrimAdapter {
  /** renderPassAdapter.cpp:35-39 */
  override getImagingSubprims(_prim: UsdPrim): string[] {
    return ['']
  }

  /** renderPassAdapter.cpp:41-50 */
  override getImagingSubprimType(_prim: UsdPrim, subprim: string): string {
    if (subprim === '') {
      return HdPrimTypeTokens.renderPass
    }
    return ''
  }

  /** renderPassAdapter.cpp:52-64 */
  override getImagingSubprimData(
    prim: UsdPrim, subprim: string, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): HdContainerDataSource | undefined {
    if (subprim === '') {
      return UsdImagingDataSourceRenderPassPrim.new(
        prim.path, prim, stageGlobals)
    }

    return undefined
  }

  /** renderPassAdapter.cpp:66-79 */
  override invalidateImagingSubprim(
    prim: UsdPrim, subprim: string, properties: readonly string[],
    invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    if (subprim === '') {
      return UsdImagingDataSourceRenderPassPrim.invalidate(
        prim, subprim, properties, invalidationType)
    }

    return new HdDataSourceLocatorSet()
  }
}

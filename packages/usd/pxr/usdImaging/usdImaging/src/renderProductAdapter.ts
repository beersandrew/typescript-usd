// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/renderProductAdapter.cpp,
//  pxr/usdImaging/usdImaging/renderProductAdapter.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/renderProductAdapter.{h,cpp} (OpenUSD 26.11.1):
// the 2.0 (scene index) prim adapter API.
//
// The 1.0 (UsdImagingDelegate) part is not ported (primAdapter.ts header):
// IsSupported, Populate, _RemovePrim, TrackVariability, UpdateForTime,
// ProcessPropertyChange, MarkDirty, Get.

import {
  RenderProductSchemaTokens as HdRenderProductSchemaTokens,
  type ContainerDataSource as HdContainerDataSource,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
} from 'typescript-usd/hd'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import { UsdImagingDataSourceRenderProductPrim } from './dataSourceRenderPrims.ts'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import { UsdImagingPrimAdapter } from './primAdapter.ts'
import type { UsdImagingPropertyInvalidationType } from './types.ts'

/** renderProductAdapter.h:27-132 */
export class UsdImagingRenderProductAdapter extends UsdImagingPrimAdapter {
  /** renderProductAdapter.cpp:34-38 */
  override getImagingSubprims(_prim: UsdPrim): string[] {
    return ['']
  }

  /** renderProductAdapter.cpp:40-49 */
  override getImagingSubprimType(_prim: UsdPrim, subprim: string): string {
    if (subprim === '') {
      return HdRenderProductSchemaTokens.renderProduct
    }
    return ''
  }

  /** renderProductAdapter.cpp:51-63 */
  override getImagingSubprimData(
    prim: UsdPrim, subprim: string, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): HdContainerDataSource | undefined {
    if (subprim === '') {
      return UsdImagingDataSourceRenderProductPrim.new(
        prim.path, prim, stageGlobals)
    }

    return undefined
  }

  /** renderProductAdapter.cpp:65-78 */
  override invalidateImagingSubprim(
    prim: UsdPrim, subprim: string, properties: readonly string[],
    invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    if (subprim === '') {
      return UsdImagingDataSourceRenderProductPrim.invalidate(
        prim, subprim, properties, invalidationType)
    }

    return new HdDataSourceLocatorSet()
  }
}

// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImaging/renderVarAdapter.cpp,
//  pxr/usdImaging/usdImaging/renderVarAdapter.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/renderVarAdapter.{h,cpp} (OpenUSD 26.11.1):
// the 2.0 (scene index) prim adapter API.
//
// The 1.0 (UsdImagingDelegate) part is not ported (primAdapter.ts header):
// IsSupported, Populate, _RemovePrim, TrackVariability, UpdateForTime,
// ProcessPropertyChange, MarkDirty, Get.

import {
  RenderVarSchemaTokens as HdRenderVarSchemaTokens,
  type ContainerDataSource as HdContainerDataSource,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
} from 'typescript-usd/hd'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import { UsdImagingDataSourceRenderVarPrim } from './dataSourceRenderPrims.ts'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import { UsdImagingPrimAdapter } from './primAdapter.ts'
import type { UsdImagingPropertyInvalidationType } from './types.ts'

/** renderVarAdapter.h:27-131 */
export class UsdImagingRenderVarAdapter extends UsdImagingPrimAdapter {
  /** renderVarAdapter.cpp:36-40 */
  override getImagingSubprims(_prim: UsdPrim): string[] {
    return ['']
  }

  /** renderVarAdapter.cpp:42-51 */
  override getImagingSubprimType(_prim: UsdPrim, subprim: string): string {
    if (subprim === '') {
      return HdRenderVarSchemaTokens.renderVar
    }
    return ''
  }

  /** renderVarAdapter.cpp:53-65 */
  override getImagingSubprimData(
    prim: UsdPrim, subprim: string, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): HdContainerDataSource | undefined {
    if (subprim === '') {
      return UsdImagingDataSourceRenderVarPrim.new(
        prim.path, prim, stageGlobals)
    }

    return undefined
  }

  /** renderVarAdapter.cpp:67-80 */
  override invalidateImagingSubprim(
    prim: UsdPrim, subprim: string, properties: readonly string[],
    invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    if (subprim === '') {
      return UsdImagingDataSourceRenderVarPrim.invalidate(
        prim, subprim, properties, invalidationType)
    }

    return new HdDataSourceLocatorSet()
  }
}

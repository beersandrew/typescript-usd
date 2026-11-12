// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImaging/pointsAdapter.cpp,
//  pxr/usdImaging/usdImaging/pointsAdapter.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/pointsAdapter.{h,cpp} (OpenUSD 26.11.1):
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
import { UsdImagingDataSourcePointsPrim } from './dataSourcePoints.ts'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import { UsdImagingGprimAdapter } from './gprimAdapter.ts'
import type { UsdImagingPropertyInvalidationType } from './types.ts'

/** pointsAdapter.h:24-120 */
export class UsdImagingPointsAdapter extends UsdImagingGprimAdapter {
  /** pointsAdapter.cpp:37-41 */
  override getImagingSubprims(_prim: UsdPrim): string[] {
    return ['']
  }

  /** pointsAdapter.cpp:43-52 */
  override getImagingSubprimType(_prim: UsdPrim, subprim: string): string {
    if (subprim === '') {
      return HdPrimTypeTokens.points
    }
    return ''
  }

  /** pointsAdapter.cpp:54-67 */
  override getImagingSubprimData(
    prim: UsdPrim, subprim: string, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): HdContainerDataSource | undefined {
    if (subprim === '') {
      return UsdImagingDataSourcePointsPrim.new(
        prim.path,
        prim,
        stageGlobals)
    }
    return undefined
  }

  /** pointsAdapter.cpp:69-82 */
  override invalidateImagingSubprim(
    prim: UsdPrim, subprim: string, properties: readonly string[],
    invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    if (subprim === '') {
      return UsdImagingDataSourcePointsPrim.invalidate(
        prim, subprim, properties, invalidationType)
    }

    return new HdDataSourceLocatorSet()
  }
}

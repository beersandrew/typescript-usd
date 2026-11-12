// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/nurbsPatchAdapter.cpp,
//  pxr/usdImaging/usdImaging/nurbsPatchAdapter.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/nurbsPatchAdapter.{h,cpp} (OpenUSD 26.11.1):
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
import { UsdImagingDataSourceNurbsPatchPrim } from './dataSourceNurbsPatch.ts'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import { UsdImagingGprimAdapter } from './gprimAdapter.ts'
import type { UsdImagingPropertyInvalidationType } from './types.ts'

/** nurbsPatchAdapter.h:24-116 */
export class UsdImagingNurbsPatchAdapter extends UsdImagingGprimAdapter {
  /** nurbsPatchAdapter.cpp:204-208 */
  override getImagingSubprims(_prim: UsdPrim): string[] {
    return ['']
  }

  /** nurbsPatchAdapter.cpp:210-219 */
  override getImagingSubprimType(_prim: UsdPrim, subprim: string): string {
    if (subprim === '') {
      return HdPrimTypeTokens.nurbsPatch
    }
    return ''
  }

  /** nurbsPatchAdapter.cpp:221-232 */
  override getImagingSubprimData(
    prim: UsdPrim, subprim: string, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): HdContainerDataSource | undefined {
    if (subprim === '') {
      return UsdImagingDataSourceNurbsPatchPrim.new(
        prim.path,
        prim,
        stageGlobals)
    }
    return undefined
  }

  /** nurbsPatchAdapter.cpp:234-247 */
  override invalidateImagingSubprim(
    prim: UsdPrim, subprim: string, properties: readonly string[],
    invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    if (subprim === '') {
      return UsdImagingDataSourceNurbsPatchPrim.invalidate(
        prim, subprim, properties, invalidationType)
    }

    return new HdDataSourceLocatorSet()
  }
}

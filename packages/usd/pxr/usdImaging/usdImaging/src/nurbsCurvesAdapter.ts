// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/nurbsCurvesAdapter.cpp,
//  pxr/usdImaging/usdImaging/nurbsCurvesAdapter.h
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/nurbsCurvesAdapter.{h,cpp} (OpenUSD 26.11.1):
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
import { UsdImagingDataSourceNurbsCurvesPrim } from './dataSourceNurbsCurves.ts'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import { UsdImagingGprimAdapter } from './gprimAdapter.ts'
import type { UsdImagingPropertyInvalidationType } from './types.ts'

/** nurbsCurvesAdapter.h:24-122 */
export class UsdImagingNurbsCurvesAdapter extends UsdImagingGprimAdapter {
  /** nurbsCurvesAdapter.cpp:343-347 */
  override getImagingSubprims(_prim: UsdPrim): string[] {
    return ['']
  }

  /** nurbsCurvesAdapter.cpp:349-358 */
  override getImagingSubprimType(_prim: UsdPrim, subprim: string): string {
    if (subprim === '') {
      return HdPrimTypeTokens.nurbsCurves
    }
    return ''
  }

  /** nurbsCurvesAdapter.cpp:360-371 */
  override getImagingSubprimData(
    prim: UsdPrim, subprim: string, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): HdContainerDataSource | undefined {
    if (subprim === '') {
      return UsdImagingDataSourceNurbsCurvesPrim.new(
        prim.path,
        prim,
        stageGlobals)
    }
    return undefined
  }

  /** nurbsCurvesAdapter.cpp:373-386 */
  override invalidateImagingSubprim(
    prim: UsdPrim, subprim: string, properties: readonly string[],
    invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    if (subprim === '') {
      return UsdImagingDataSourceNurbsCurvesPrim.invalidate(
        prim, subprim, properties, invalidationType)
    }

    return new HdDataSourceLocatorSet()
  }
}

// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/basisCurvesAdapter.cpp,
//  pxr/usdImaging/usdImaging/basisCurvesAdapter.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/basisCurvesAdapter.{h,cpp} (OpenUSD 26.11.1):
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
import { UsdImagingDataSourceBasisCurvesPrim } from './dataSourceBasisCurves.ts'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import { UsdImagingGprimAdapter } from './gprimAdapter.ts'
import type { UsdImagingPropertyInvalidationType } from './types.ts'

/** basisCurvesAdapter.h:24-129 */
export class UsdImagingBasisCurvesAdapter extends UsdImagingGprimAdapter {
  /** basisCurvesAdapter.cpp:49-53 */
  override getImagingSubprims(_prim: UsdPrim): string[] {
    return ['']
  }

  /** basisCurvesAdapter.cpp:55-64 */
  override getImagingSubprimType(_prim: UsdPrim, subprim: string): string {
    if (subprim === '') {
      return HdPrimTypeTokens.basisCurves
    }
    return ''
  }

  /** basisCurvesAdapter.cpp:66-79 */
  override getImagingSubprimData(
    prim: UsdPrim, subprim: string, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): HdContainerDataSource | undefined {
    if (subprim === '') {
      return UsdImagingDataSourceBasisCurvesPrim.new(
        prim.path,
        prim,
        stageGlobals)
    }
    return undefined
  }

  /** basisCurvesAdapter.cpp:81-94 */
  override invalidateImagingSubprim(
    prim: UsdPrim, subprim: string, properties: readonly string[],
    invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    if (subprim === '') {
      return UsdImagingDataSourceBasisCurvesPrim.invalidate(
        prim, subprim, properties, invalidationType)
    }

    return new HdDataSourceLocatorSet()
  }
}

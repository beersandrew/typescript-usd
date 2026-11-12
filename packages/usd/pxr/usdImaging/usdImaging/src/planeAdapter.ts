// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImaging/planeAdapter.cpp,
//  pxr/usdImaging/usdImaging/planeAdapter.h
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/planeAdapter.{h,cpp} (OpenUSD 26.11.1):
// the scene index API. The UsdImagingDelegate side of the adapter
// (IsSupported, Populate, TrackVariability, ProcessPropertyChange,
// GetPoints/GetTopology and the other value getters) is not ported, see
// primAdapter.ts.

import {
  type ContainerDataSource as HdContainerDataSource,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  PlaneSchema as HdPlaneSchema,
  PrimTypeTokens as HdPrimTypeTokens,
} from 'typescript-usd/hd'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import { UsdImagingDataSourceImplicitsPrim } from './dataSourceImplicits-Impl.ts'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import { UsdImagingGprimAdapter } from './gprimAdapter.ts'
import type { UsdImagingPropertyInvalidationType } from './types.ts'

/** planeAdapter.cpp:28-30 */
const _PrimSource = UsdImagingDataSourceImplicitsPrim.instantiate(
  'Plane', HdPlaneSchema)

/** planeAdapter.h:25-115 */
export class UsdImagingPlaneAdapter extends UsdImagingGprimAdapter {
  /** planeAdapter.cpp:43-47 */
  override getImagingSubprims(_prim: UsdPrim): string[] {
    return ['']
  }

  /** planeAdapter.cpp:49-58 */
  override getImagingSubprimType(_prim: UsdPrim, subprim: string): string {
    if (subprim === '') {
      return HdPrimTypeTokens.plane
    }
    return ''
  }

  /** planeAdapter.cpp:60-73 */
  override getImagingSubprimData(
    prim: UsdPrim, subprim: string, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): HdContainerDataSource | undefined {
    if (subprim === '') {
      return _PrimSource.new(
        prim.path,
        prim,
        stageGlobals)
    }
    return undefined
  }

  /** planeAdapter.cpp:75-88 */
  override invalidateImagingSubprim(
    prim: UsdPrim, subprim: string, properties: readonly string[],
    invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    if (subprim === '') {
      return _PrimSource.invalidate(
        prim, subprim, properties, invalidationType)
    }

    return new HdDataSourceLocatorSet()
  }
}

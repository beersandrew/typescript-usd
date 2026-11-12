// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImaging/cubeAdapter.cpp,
//  pxr/usdImaging/usdImaging/cubeAdapter.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/cubeAdapter.{h,cpp} (OpenUSD 26.11.1):
// the scene index API. The UsdImagingDelegate side of the adapter
// (IsSupported, Populate, TrackVariability, ProcessPropertyChange,
// GetPoints/GetTopology and the other value getters) is not ported, see
// primAdapter.ts.

import {
  type ContainerDataSource as HdContainerDataSource,
  CubeSchema as HdCubeSchema,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  PrimTypeTokens as HdPrimTypeTokens,
} from 'typescript-usd/hd'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import { UsdImagingDataSourceImplicitsPrim } from './dataSourceImplicits-Impl.ts'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import { UsdImagingGprimAdapter } from './gprimAdapter.ts'
import type { UsdImagingPropertyInvalidationType } from './types.ts'

/** cubeAdapter.cpp:28-30 */
const _PrimSource = UsdImagingDataSourceImplicitsPrim.instantiate(
  'Cube', HdCubeSchema)

/** cubeAdapter.h:26-108 */
export class UsdImagingCubeAdapter extends UsdImagingGprimAdapter {
  /** cubeAdapter.cpp:41-45 */
  override getImagingSubprims(_prim: UsdPrim): string[] {
    return ['']
  }

  /** cubeAdapter.cpp:47-56 */
  override getImagingSubprimType(_prim: UsdPrim, subprim: string): string {
    if (subprim === '') {
      return HdPrimTypeTokens.cube
    }
    return ''
  }

  /** cubeAdapter.cpp:58-71 */
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

  /** cubeAdapter.cpp:73-86 */
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

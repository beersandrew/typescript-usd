// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImaging/meshAdapter.cpp,
//  pxr/usdImaging/usdImaging/meshAdapter.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/meshAdapter.{h,cpp} (OpenUSD 26.11.1):
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
import { UsdImagingDataSourceMeshPrim } from './dataSourceMesh.ts'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import { UsdImagingGprimAdapter } from './gprimAdapter.ts'
import type { UsdImagingPropertyInvalidationType } from './types.ts'

/** meshAdapter.h:27-131 */
export class UsdImagingMeshAdapter extends UsdImagingGprimAdapter {
  /** meshAdapter.cpp:44-48 */
  override getImagingSubprims(_prim: UsdPrim): string[] {
    return ['']
  }

  /** meshAdapter.cpp:50-59 */
  override getImagingSubprimType(_prim: UsdPrim, subprim: string): string {
    if (subprim === '') {
      return HdPrimTypeTokens.mesh
    }
    return ''
  }

  /** meshAdapter.cpp:61-74 */
  override getImagingSubprimData(
    prim: UsdPrim, subprim: string, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): HdContainerDataSource | undefined {
    if (subprim === '') {
      return UsdImagingDataSourceMeshPrim.new(
        prim.path,
        prim,
        stageGlobals)
    }
    return undefined
  }

  /** meshAdapter.cpp:76-85 */
  override invalidateImagingSubprim(
    prim: UsdPrim, subprim: string, properties: readonly string[],
    invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    return UsdImagingDataSourceMeshPrim.invalidate(
      prim, subprim, properties, invalidationType)
  }
}

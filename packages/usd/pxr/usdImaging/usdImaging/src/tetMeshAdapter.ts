// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImaging/tetMeshAdapter.cpp,
//  pxr/usdImaging/usdImaging/tetMeshAdapter.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/tetMeshAdapter.{h,cpp} (OpenUSD 26.11.1):
// the scene index API. The UsdImagingDelegate side of the adapter
// (IsSupported, Populate, TrackVariability, ProcessPropertyChange,
// GetPoints/GetTopology and the other value getters) is not ported, see
// primAdapter.ts.

import {
  type ContainerDataSource as HdContainerDataSource,
  type DataSourceLocatorSet as HdDataSourceLocatorSet,
  PrimTypeTokens as HdPrimTypeTokens,
} from 'typescript-usd/hd'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import { UsdImagingDataSourceTetMeshPrim } from './dataSourceTetMesh.ts'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import { UsdImagingGprimAdapter } from './gprimAdapter.ts'
import type { UsdImagingPropertyInvalidationType } from './types.ts'

/** tetMeshAdapter.h:24-104 */
export class UsdImagingTetMeshAdapter extends UsdImagingGprimAdapter {
  /** tetMeshAdapter.cpp:32-36 */
  override getImagingSubprims(_prim: UsdPrim): string[] {
    return ['']
  }

  /** tetMeshAdapter.cpp:38-47 */
  override getImagingSubprimType(_prim: UsdPrim, subprim: string): string {
    if (subprim === '') {
      return HdPrimTypeTokens.tetMesh
    }
    return ''
  }

  /** tetMeshAdapter.cpp:49-62 */
  override getImagingSubprimData(
    prim: UsdPrim, subprim: string, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): HdContainerDataSource | undefined {
    if (subprim === '') {
      return UsdImagingDataSourceTetMeshPrim.new(
        prim.path,
        prim,
        stageGlobals)
    }
    return undefined
  }

  /** tetMeshAdapter.cpp:64-73 */
  override invalidateImagingSubprim(
    prim: UsdPrim, subprim: string, properties: readonly string[],
    invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    return UsdImagingDataSourceTetMeshPrim.invalidate(
      prim, subprim, properties, invalidationType)
  }
}

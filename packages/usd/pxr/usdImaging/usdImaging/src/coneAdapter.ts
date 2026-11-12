// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImaging/coneAdapter.cpp,
//  pxr/usdImaging/usdImaging/coneAdapter.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/coneAdapter.{h,cpp} (OpenUSD 26.11.1):
// the scene index API. The UsdImagingDelegate side of the adapter
// (IsSupported, Populate, TrackVariability, ProcessPropertyChange,
// GetPoints/GetTopology and the other value getters) is not ported, see
// primAdapter.ts.

import {
  ConeSchema as HdConeSchema,
  type ContainerDataSource as HdContainerDataSource,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  PrimTypeTokens as HdPrimTypeTokens,
} from 'typescript-usd/hd'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import { UsdImagingDataSourceImplicitsPrim } from './dataSourceImplicits-Impl.ts'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import { UsdImagingGprimAdapter } from './gprimAdapter.ts'
import type { UsdImagingPropertyInvalidationType } from './types.ts'

/** coneAdapter.cpp:28-30 */
const _PrimSource = UsdImagingDataSourceImplicitsPrim.instantiate(
  'Cone', HdConeSchema)

/** coneAdapter.h:25-109 */
export class UsdImagingConeAdapter extends UsdImagingGprimAdapter {
  /** coneAdapter.cpp:43-47 */
  override getImagingSubprims(_prim: UsdPrim): string[] {
    return ['']
  }

  /** coneAdapter.cpp:49-58 */
  override getImagingSubprimType(_prim: UsdPrim, subprim: string): string {
    if (subprim === '') {
      return HdPrimTypeTokens.cone
    }
    return ''
  }

  /** coneAdapter.cpp:60-73 */
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

  /** coneAdapter.cpp:75-88 */
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

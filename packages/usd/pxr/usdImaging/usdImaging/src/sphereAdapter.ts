// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImaging/sphereAdapter.cpp,
//  pxr/usdImaging/usdImaging/sphereAdapter.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/sphereAdapter.{h,cpp} (OpenUSD 26.11.1):
// the scene index API. The UsdImagingDelegate side of the adapter
// (IsSupported, Populate, TrackVariability, ProcessPropertyChange,
// GetPoints/GetTopology and the other value getters) is not ported, see
// primAdapter.ts.

import {
  type ContainerDataSource as HdContainerDataSource,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  PrimTypeTokens as HdPrimTypeTokens,
  SphereSchema as HdSphereSchema,
} from 'typescript-usd/hd'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import { UsdImagingDataSourceImplicitsPrim } from './dataSourceImplicits-Impl.ts'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import { UsdImagingGprimAdapter } from './gprimAdapter.ts'
import type { UsdImagingPropertyInvalidationType } from './types.ts'

/** sphereAdapter.cpp:28-30 */
const _PrimSource = UsdImagingDataSourceImplicitsPrim.instantiate(
  'Sphere', HdSphereSchema)

/** sphereAdapter.h:26-113 */
export class UsdImagingSphereAdapter extends UsdImagingGprimAdapter {
  /** sphereAdapter.cpp:41-45 */
  override getImagingSubprims(_prim: UsdPrim): string[] {
    return ['']
  }

  /** sphereAdapter.cpp:47-56 */
  override getImagingSubprimType(_prim: UsdPrim, subprim: string): string {
    if (subprim === '') {
      return HdPrimTypeTokens.sphere
    }
    return ''
  }

  /** sphereAdapter.cpp:58-71 */
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

  /** sphereAdapter.cpp:73-86 */
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

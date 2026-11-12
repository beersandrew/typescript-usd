// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImaging/capsuleAdapter.cpp,
//  pxr/usdImaging/usdImaging/capsuleAdapter.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/capsuleAdapter.{h,cpp} (OpenUSD 26.11.1):
// the scene index API. The UsdImagingDelegate side of the adapter
// (IsSupported, Populate, TrackVariability, ProcessPropertyChange,
// GetPoints/GetTopology and the other value getters) is not ported, see
// primAdapter.ts.

import {
  CapsuleSchema as HdCapsuleSchema,
  type ContainerDataSource as HdContainerDataSource,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  PrimTypeTokens as HdPrimTypeTokens,
} from 'typescript-usd/hd'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import { UsdImagingDataSourceImplicitsPrim } from './dataSourceImplicits-Impl.ts'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import { UsdImagingGprimAdapter } from './gprimAdapter.ts'
import type { UsdImagingPropertyInvalidationType } from './types.ts'

/** capsuleAdapter.cpp:31-34 */
const _PrimSource_0 = UsdImagingDataSourceImplicitsPrim.instantiate(
  'Capsule', HdCapsuleSchema)
const _PrimSource_1 = UsdImagingDataSourceImplicitsPrim.instantiate(
  'Capsule_1', HdCapsuleSchema)

/** capsuleAdapter.h:25-110 */
export class UsdImagingCapsuleAdapter extends UsdImagingGprimAdapter {
  /** capsuleAdapter.cpp:47-51 */
  override getImagingSubprims(_prim: UsdPrim): string[] {
    return ['']
  }

  /** capsuleAdapter.cpp:53-62 */
  override getImagingSubprimType(_prim: UsdPrim, subprim: string): string {
    if (subprim === '') {
      return HdPrimTypeTokens.capsule
    }
    return ''
  }

  /** capsuleAdapter.cpp:64-85 */
  override getImagingSubprimData(
    prim: UsdPrim, subprim: string, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): HdContainerDataSource | undefined {
    if (subprim === '') {
      if (prim.isA('Capsule')) {
        return _PrimSource_0.new(
          prim.path,
          prim,
          stageGlobals)
      } else { // IsA<UsdGeomCapsule_1>()
        return _PrimSource_1.new(
          prim.path,
          prim,
          stageGlobals)
      }
    }
    return undefined
  }

  /** capsuleAdapter.cpp:87-105 */
  override invalidateImagingSubprim(
    prim: UsdPrim, subprim: string, properties: readonly string[],
    invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    if (subprim === '') {
      if (prim.isA('Capsule')) {
        return _PrimSource_0.invalidate(
          prim, subprim, properties, invalidationType)
      } else { // IsA<UsdGeomCapsule_1>()
        return _PrimSource_1.invalidate(
          prim, subprim, properties, invalidationType)
      }
    }

    return new HdDataSourceLocatorSet()
  }
}

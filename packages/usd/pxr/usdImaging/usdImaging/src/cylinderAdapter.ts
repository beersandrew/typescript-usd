// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImaging/cylinderAdapter.cpp,
//  pxr/usdImaging/usdImaging/cylinderAdapter.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/cylinderAdapter.{h,cpp} (OpenUSD 26.11.1):
// the scene index API. The UsdImagingDelegate side of the adapter
// (IsSupported, Populate, TrackVariability, ProcessPropertyChange,
// GetPoints/GetTopology and the other value getters) is not ported, see
// primAdapter.ts.

import {
  type ContainerDataSource as HdContainerDataSource,
  CylinderSchema as HdCylinderSchema,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  PrimTypeTokens as HdPrimTypeTokens,
} from 'typescript-usd/hd'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import { UsdImagingDataSourceImplicitsPrim } from './dataSourceImplicits-Impl.ts'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import { UsdImagingGprimAdapter } from './gprimAdapter.ts'
import type { UsdImagingPropertyInvalidationType } from './types.ts'

/** cylinderAdapter.cpp:29-34 */
const _PrimSource_0 = UsdImagingDataSourceImplicitsPrim.instantiate(
  'Cylinder', HdCylinderSchema)
const _PrimSource_1 = UsdImagingDataSourceImplicitsPrim.instantiate(
  'Cylinder_1', HdCylinderSchema)

/** cylinderAdapter.h:25-110 */
export class UsdImagingCylinderAdapter extends UsdImagingGprimAdapter {
  /** cylinderAdapter.cpp:45-49 */
  override getImagingSubprims(_prim: UsdPrim): string[] {
    return ['']
  }

  /** cylinderAdapter.cpp:51-60 */
  override getImagingSubprimType(_prim: UsdPrim, subprim: string): string {
    if (subprim === '') {
      return HdPrimTypeTokens.cylinder
    }
    return ''
  }

  /** cylinderAdapter.cpp:62-82 */
  override getImagingSubprimData(
    prim: UsdPrim, subprim: string, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): HdContainerDataSource | undefined {
    if (subprim === '') {
      if (prim.isA('Cylinder')) {
        return _PrimSource_0.new(
          prim.path,
          prim,
          stageGlobals)
      } else { // IsA<UsdGeomCylinder_1>()
        return _PrimSource_1.new(
          prim.path,
          prim,
          stageGlobals)
      }
    }
    return undefined
  }

  /** cylinderAdapter.cpp:84-102 */
  override invalidateImagingSubprim(
    prim: UsdPrim, subprim: string, properties: readonly string[],
    invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    if (subprim === '') {
      if (prim.isA('Cylinder')) {
        return _PrimSource_0.invalidate(
          prim, subprim, properties, invalidationType)
      } else { // IsA<UsdGeomCylinder_1>()
        return _PrimSource_1.invalidate(
          prim, subprim, properties, invalidationType)
      }
    }

    return new HdDataSourceLocatorSet()
  }
}

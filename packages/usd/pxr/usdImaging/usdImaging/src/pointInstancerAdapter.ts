// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/pointInstancerAdapter.cpp,
//  pxr/usdImaging/usdImaging/pointInstancerAdapter.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/pointInstancerAdapter.{h,cpp}
// (OpenUSD 26.11.1): the "Scene Index Support" part
// (pointInstancerAdapter.h:44-67, pointInstancerAdapter.cpp:49-95).
//
// The rest of UsdImagingPointInstancerAdapter serves UsdImagingDelegate
// (Populate, TrackVariability, UpdateForTime, ProcessPropertyChange,
// MarkDirty, the instancer/prototype bookkeeping, GetScenePrimPath,
// SampleInstancerTransform, ...) and is not ported (see primAdapter.ts).
// ShouldCullChildren and IsInstancerAdapter (pointInstancerAdapter.cpp:97-107)
// are UsdImagingDelegate population queries and are not ported either.
//
// Divergence: upstream derives from UsdImagingInstanceablePrimAdapter
// (pointInstancerAdapter.h:28-31), which overrides none of the scene index
// API; this port has no instanceablePrimAdapter.ts, so the adapter derives
// from UsdImagingPrimAdapter directly.

import {
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  PrimTypeTokens as HdPrimTypeTokens,
  type ContainerDataSource as HdContainerDataSource,
} from 'typescript-usd/hd'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import { UsdImagingDataSourcePointInstancerPrim } from './dataSourcePointInstancer.ts'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import { UsdImagingPrimAdapter } from './primAdapter.ts'
import type { UsdImagingPropertyInvalidationType } from './types.ts'

/** pointInstancerAdapter.h:26-532: delegate support for
 *  UsdGeomPointInstancer. */
export class UsdImagingPointInstancerAdapter extends UsdImagingPrimAdapter {
  /** pointInstancerAdapter.cpp:49-53 */
  override getImagingSubprims(_prim: UsdPrim): string[] {
    return ['']
  }

  /** pointInstancerAdapter.cpp:56-65 */
  override getImagingSubprimType(_prim: UsdPrim, subprim: string): string {
    if (subprim === '') {
      return HdPrimTypeTokens.instancer
    }
    return ''
  }

  /** pointInstancerAdapter.cpp:67-80 */
  override getImagingSubprimData(
    prim: UsdPrim, subprim: string, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): HdContainerDataSource | undefined {
    if (subprim === '') {
      return UsdImagingDataSourcePointInstancerPrim.new(
        prim.path,
        prim,
        stageGlobals)
    }
    return undefined
  }

  /** pointInstancerAdapter.cpp:82-95 */
  override invalidateImagingSubprim(
    prim: UsdPrim, subprim: string, properties: readonly string[],
    invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    if (subprim === '') {
      return UsdImagingDataSourcePointInstancerPrim.invalidate(
        prim, subprim, properties, invalidationType)
    }

    return new HdDataSourceLocatorSet()
  }
}

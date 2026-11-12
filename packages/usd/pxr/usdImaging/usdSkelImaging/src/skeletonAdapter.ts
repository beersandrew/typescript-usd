// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdSkelImaging/skeletonAdapter.cpp,
//  pxr/usdImaging/usdSkelImaging/skeletonAdapter.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdSkelImaging/skeletonAdapter.{h,cpp}
// (OpenUSD 26.11.1): the scene index API only (skeletonAdapter.h:244-266,
// skeletonAdapter.cpp:2962-3011).
//
// Not ported: everything else in skeletonAdapter.cpp serves the
// UsdImagingDelegate (legacy) path - Populate, TrackVariability,
// UpdateForTime, change processing, the bone mesh and skinning ext
// computations of the delegate (GetExtComputation*, InvokeComputation,
// RegisterSkelBinding, _SkelData, _SkinnedPrimData). The faithful chain of
// this port is scene-index only; there, the skeleton guide mesh and the
// skinning ext computations come from the skeleton and points resolving
// scene indices.
//
// Divergence: upstream derives from UsdImagingInstanceablePrimAdapter, which
// is not ported (it is part of the delegate's instancing support); the scene
// index API it inherits is UsdImagingPrimAdapter's, so that is the base here.

import {
  DataSourceLocatorSet as HdDataSourceLocatorSet, type ContainerDataSource as HdContainerDataSource,
} from 'typescript-usd/hd'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import {
  UsdImagingPrimAdapter,
  type UsdImagingDataSourceStageGlobals, type UsdImagingPropertyInvalidationType,
} from 'typescript-usd/usdImaging'
import { UsdSkelImagingDataSourceSkeletonPrim } from './dataSourceSkeletonPrim.ts'
import { UsdSkelImagingPrimTypeTokens } from './tokens.ts'

/** skeletonAdapter.h:27-530 (scene index API) */
export class UsdSkelImagingSkeletonAdapter extends UsdImagingPrimAdapter {
  /** skeletonAdapter.cpp:2962-2966 */
  override getImagingSubprims(_prim: UsdPrim): string[] {
    return ['']
  }

  /** skeletonAdapter.cpp:2968-2978 */
  override getImagingSubprimType(_prim: UsdPrim, subprim: string): string {
    if (subprim !== '') {
      return ''
    }

    return UsdSkelImagingPrimTypeTokens.skeleton
  }

  /** skeletonAdapter.cpp:2980-2992 */
  override getImagingSubprimData(
    prim: UsdPrim, subprim: string, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): HdContainerDataSource | undefined {
    if (subprim !== '') {
      return undefined
    }

    return UsdSkelImagingDataSourceSkeletonPrim.new(
      prim.path, prim, stageGlobals)
  }

  /** skeletonAdapter.cpp:2994-3007 */
  override invalidateImagingSubprim(
    prim: UsdPrim, subprim: string, properties: readonly string[],
    invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    if (subprim !== '') {
      return new HdDataSourceLocatorSet()
    }

    return UsdSkelImagingDataSourceSkeletonPrim.invalidate(
      prim, subprim, properties, invalidationType)
  }
}

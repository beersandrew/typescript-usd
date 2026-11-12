// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdSkelImaging/blendShapeAdapter.cpp,
//  pxr/usdImaging/usdSkelImaging/blendShapeAdapter.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdSkelImaging/blendShapeAdapter.{h,cpp}
// (OpenUSD 26.11.1).
//
// Divergence: upstream derives from UsdImagingSceneIndexPrimAdapter, which
// only adds final no-op implementations of the UsdImagingDelegate
// (legacy) virtuals to UsdImagingPrimAdapter. The faithful chain of this
// port is scene-index only and UsdImagingPrimAdapter carries only the scene
// index API (see usdImaging/src/primAdapter.ts), so it is the base here.

import {
  DataSourceLocatorSet as HdDataSourceLocatorSet, type ContainerDataSource as HdContainerDataSource,
} from 'typescript-usd/hd'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import {
  UsdImagingPrimAdapter,
  type UsdImagingDataSourceStageGlobals, type UsdImagingPropertyInvalidationType,
} from 'typescript-usd/usdImaging'
import { UsdSkelImagingDataSourceBlendShapePrim } from './dataSourceBlendShapePrim.ts'
import { UsdSkelImagingPrimTypeTokens } from './tokens.ts'

/** blendShapeAdapter.h:19-56 */
export class UsdSkelImagingBlendShapeAdapter extends UsdImagingPrimAdapter {
  /** blendShapeAdapter.cpp:27-31 */
  override getImagingSubprims(_prim: UsdPrim): string[] {
    return ['']
  }

  /** blendShapeAdapter.cpp:33-43 */
  override getImagingSubprimType(_prim: UsdPrim, subprim: string): string {
    if (subprim !== '') {
      return ''
    }

    return UsdSkelImagingPrimTypeTokens.skelBlendShape
  }

  /** blendShapeAdapter.cpp:45-57 */
  override getImagingSubprimData(
    prim: UsdPrim, subprim: string, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): HdContainerDataSource | undefined {
    if (subprim !== '') {
      return undefined
    }

    return UsdSkelImagingDataSourceBlendShapePrim.new(
      prim.path, prim, stageGlobals)
  }

  /** blendShapeAdapter.cpp:59-72 */
  override invalidateImagingSubprim(
    prim: UsdPrim, subprim: string, properties: readonly string[],
    invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    if (subprim !== '') {
      return new HdDataSourceLocatorSet()
    }

    return UsdSkelImagingDataSourceBlendShapePrim.invalidate(
      prim, subprim, properties, invalidationType)
  }
}

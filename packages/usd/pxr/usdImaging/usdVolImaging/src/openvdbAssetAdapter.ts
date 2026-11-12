// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdVolImaging/openvdbAssetAdapter.cpp,
//  pxr/usdImaging/usdVolImaging/openvdbAssetAdapter.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdVolImaging/openvdbAssetAdapter.{h,cpp} (OpenUSD
// 26.11.1): the scene index part, publishing a UsdVolOpenVDBAsset prim as a
// 'openvdbAsset' field prim (usdVolImaging/plugInfo.json).
//
// Not ported: the UsdImagingDelegate part (Get, and UsdImagingFieldAdapter's
// Populate / TrackVariability / UpdateForTime / IsSupported, which serve the
// legacy scene delegate only; see usdImaging/src/primAdapter.ts).

import { DataSourceLocatorSet as HdDataSourceLocatorSet, type ContainerDataSource as HdContainerDataSource } from 'typescript-usd/hd'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import {
  UsdImagingPrimAdapter,
  type UsdImagingDataSourceStageGlobals,
  type UsdImagingPropertyInvalidationType,
} from 'typescript-usd/usdImaging'
import { UsdImagingDataSourceFieldAssetPrim } from './dataSourceFieldAsset.ts'
import { UsdVolImagingTokens } from './tokens.ts'

/** openvdbAssetAdapter.h:25-73 */
export class UsdImagingOpenVDBAssetAdapter extends UsdImagingPrimAdapter {
  /** openvdbAssetAdapter.cpp:27-31 */
  override getImagingSubprims(_prim: UsdPrim): string[] {
    return ['']
  }

  /** openvdbAssetAdapter.cpp:33-42 */
  override getImagingSubprimType(_prim: UsdPrim, subprim: string): string {
    if (subprim === '') {
      return UsdVolImagingTokens.openvdbAsset
    }
    return ''
  }

  /** openvdbAssetAdapter.cpp:44-57 */
  override getImagingSubprimData(
    prim: UsdPrim, subprim: string, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): HdContainerDataSource | undefined {
    if (subprim === '') {
      return UsdImagingDataSourceFieldAssetPrim.new(
        prim.path,
        prim,
        stageGlobals)
    }
    return undefined
  }

  /** openvdbAssetAdapter.cpp:59-72 */
  override invalidateImagingSubprim(
    prim: UsdPrim, subprim: string, properties: readonly string[],
    invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    if (subprim === '') {
      return UsdImagingDataSourceFieldAssetPrim.invalidate(
        prim, subprim, properties, invalidationType)
    }
    return new HdDataSourceLocatorSet()
  }

  /** openvdbAssetAdapter.cpp:116-120 (UsdImagingFieldAdapter's pure virtual). */
  getPrimTypeToken(): string {
    return UsdVolImagingTokens.openvdbAsset
  }
}

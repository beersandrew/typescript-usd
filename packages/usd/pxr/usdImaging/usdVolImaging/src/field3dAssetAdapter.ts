// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdVolImaging/field3dAssetAdapter.cpp,
//  pxr/usdImaging/usdVolImaging/field3dAssetAdapter.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdVolImaging/field3dAssetAdapter.{h,cpp} (OpenUSD
// 26.11.1): the scene index part, publishing a UsdVolField3DAsset prim as a
// 'field3dAsset' field prim (usdVolImaging/plugInfo.json).
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

/** field3dAssetAdapter.h:25-73 */
export class UsdImagingField3DAssetAdapter extends UsdImagingPrimAdapter {
  /** field3dAssetAdapter.cpp:27-31 */
  override getImagingSubprims(_prim: UsdPrim): string[] {
    return ['']
  }

  /** field3dAssetAdapter.cpp:33-42 */
  override getImagingSubprimType(_prim: UsdPrim, subprim: string): string {
    if (subprim === '') {
      return UsdVolImagingTokens.field3dAsset
    }
    return ''
  }

  /** field3dAssetAdapter.cpp:44-57 */
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

  /** field3dAssetAdapter.cpp:59-72 */
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

  /** field3dAssetAdapter.cpp:115-119 (UsdImagingFieldAdapter's pure virtual). */
  getPrimTypeToken(): string {
    return UsdVolImagingTokens.field3dAsset
  }
}

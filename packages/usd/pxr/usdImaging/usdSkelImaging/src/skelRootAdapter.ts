// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdSkelImaging/skelRootAdapter.cpp,
//  pxr/usdImaging/usdSkelImaging/skelRootAdapter.h
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdSkelImaging/skelRootAdapter.{h,cpp}
// (OpenUSD 26.11.1): the scene index API (skelRootAdapter.cpp:195-247).
//
// The UsdImagingDelegate (legacy) side of the adapter is not ported: the
// faithful chain of this port is scene-index only (see
// usdImaging/src/primAdapter.ts). That is Populate (which hijacks skinned
// prims through UsdSkelImagingSkeletonAdapter::RegisterSkelBinding),
// CanPopulateUsdInstance, ShouldIgnoreNativeInstanceSubtrees,
// TrackVariability, UpdateForTime, ProcessPropertyChange, MarkDirty and
// _RemovePrim (skelRootAdapter.cpp:42-193).

import {
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  OverlayContainerDataSource as HdOverlayContainerDataSource,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  type ContainerDataSource as HdContainerDataSource,
} from 'typescript-usd/hd'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import {
  UsdImagingDataSourcePrim, UsdImagingPrimAdapter,
  type UsdImagingDataSourceStageGlobals, type UsdImagingPropertyInvalidationType,
} from 'typescript-usd/usdImaging'
import { UsdSkelImagingBindingSchema, UsdSkelImagingBindingSchemaTokens } from './bindingSchema.ts'

let _skelRootDs: HdContainerDataSource | undefined

/** skelRootAdapter.h:16-119. The SkelRoot adapter. In the scene index API
 *  it marks the prim with skelBinding.hasSkelRoot = true (inherited by
 *  descendants through the flattening scene index). */
export class UsdSkelImagingSkelRootAdapter extends UsdImagingPrimAdapter {
  /** skelRootAdapter.cpp:195-199 */
  override getImagingSubprims(_prim: UsdPrim): string[] {
    return ['']
  }

  /** skelRootAdapter.cpp:201-207 */
  override getImagingSubprimType(_prim: UsdPrim, _subprim: string): string {
    return ''
  }

  /** skelRootAdapter.cpp:209-232 */
  override getImagingSubprimData(
    prim: UsdPrim, subprim: string, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): HdContainerDataSource | undefined {
    if (subprim !== '') {
      return undefined
    }

    _skelRootDs ??= HdRetainedContainerDataSource.new(
      [UsdSkelImagingBindingSchema.getSchemaToken()],
      [HdRetainedContainerDataSource.new(
        [UsdSkelImagingBindingSchemaTokens.hasSkelRoot],
        [HdRetainedTypedSampledDataSource.new<boolean>(true)])])

    return HdOverlayContainerDataSource.new(
      UsdImagingDataSourcePrim.new(
        prim.path, prim, stageGlobals),
      _skelRootDs)
  }

  /** skelRootAdapter.cpp:234-247 */
  override invalidateImagingSubprim(
    prim: UsdPrim, subprim: string, properties: readonly string[],
    invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    if (subprim !== '') {
      return new HdDataSourceLocatorSet()
    }

    return UsdImagingDataSourcePrim.invalidate(
      prim, subprim, properties, invalidationType)
  }
}

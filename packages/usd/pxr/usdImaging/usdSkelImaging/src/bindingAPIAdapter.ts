// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdSkelImaging/bindingAPIAdapter.cpp,
//  pxr/usdImaging/usdSkelImaging/bindingAPIAdapter.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdSkelImaging/bindingAPIAdapter.{h,cpp}
// (OpenUSD 26.11.1).

import {
  DataSourceLocatorSet as HdDataSourceLocatorSet, type ContainerDataSource as HdContainerDataSource,
} from 'typescript-usd/hd'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import {
  UsdImagingAPISchemaAdapter,
  type UsdImagingDataSourceStageGlobals, type UsdImagingPropertyInvalidationType,
} from 'typescript-usd/usdImaging'
import { UsdSkelImagingDataSourceBindingAPI } from './dataSourceBindingAPI.ts'

/** bindingAPIAdapter.h:19-48 */
export class UsdSkelImagingBindingAPIAdapter extends UsdImagingAPISchemaAdapter {
  /** bindingAPIAdapter.cpp:26-39 */
  override getImagingSubprimData(
    prim: UsdPrim, subprim: string, appliedInstanceName: string,
    stageGlobals: UsdImagingDataSourceStageGlobals,
  ): HdContainerDataSource | undefined {
    if (subprim !== '' || appliedInstanceName !== '') {
      return undefined
    }

    return UsdSkelImagingDataSourceBindingAPI.new(
      prim.path, prim, stageGlobals)
  }

  /** bindingAPIAdapter.cpp:41-55 */
  override invalidateImagingSubprim(
    prim: UsdPrim, subprim: string, appliedInstanceName: string,
    properties: readonly string[], invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    if (subprim !== '' || appliedInstanceName !== '') {
      return new HdDataSourceLocatorSet()
    }

    return UsdSkelImagingDataSourceBindingAPI.invalidate(
      prim, subprim, properties, invalidationType)
  }
}

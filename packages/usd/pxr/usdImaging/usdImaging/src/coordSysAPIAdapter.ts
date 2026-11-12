// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/coordSysAPIAdapter.cpp,
//  pxr/usdImaging/usdImaging/coordSysAPIAdapter.h
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/coordSysAPIAdapter.{h,cpp}
// (OpenUSD 26.11.1).

import {
  CoordSysBindingSchema as HdCoordSysBindingSchema,
  CoordSysBindingSchemaTokens as HdCoordSysBindingSchemaTokens,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  type ContainerDataSource as HdContainerDataSource,
} from 'typescript-usd/hd'
import { Type as TfType } from 'typescript-usd/tf'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import { CoordSysAPI as UsdShadeCoordSysAPI } from 'typescript-usd/usdShade'
import { UsdImagingAPISchemaAdapter } from './apiSchemaAdapter.ts'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import type { UsdImagingPropertyInvalidationType } from './types.ts'

const _SdfPathType = TfType.declare('SdfPath')

/** coordSysAPIAdapter.h:17-36 */
export class UsdImagingCoordSysAPIAdapter extends UsdImagingAPISchemaAdapter {
  /** coordSysAPIAdapter.cpp:32-59 */
  override getImagingSubprimData(
    prim: UsdPrim,
    subprim: string,
    appliedInstanceName: string,
    _stageGlobals: UsdImagingDataSourceStageGlobals,
  ): HdContainerDataSource | undefined {
    if (appliedInstanceName === '') {
      return undefined
    }

    if (subprim === '') {
      const binding =
        UsdShadeCoordSysAPI.get(prim, appliedInstanceName).getLocalBinding()
      if (binding.name === '') {
        return undefined
      }

      return HdRetainedContainerDataSource.new(
        [HdCoordSysBindingSchemaTokens.coordSysBinding],
        [HdRetainedContainerDataSource.new(
          [appliedInstanceName],
          [new HdRetainedTypedSampledDataSource<string>(
            binding.coordSysPrimPath, _SdfPathType)])])
    }

    return undefined
  }

  /** coordSysAPIAdapter.cpp:61-84 */
  override invalidateImagingSubprim(
    _prim: UsdPrim,
    subprim: string,
    appliedInstanceName: string,
    properties: readonly string[],
    _invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    if (appliedInstanceName === '') {
      return new HdDataSourceLocatorSet()
    }

    if (subprim === '') {
      for (const propertyName of properties) {
        // Could use coord sys name for more targeted invalidation
        // to improve performance.
        if (UsdShadeCoordSysAPI.canContainPropertyName(propertyName)) {
          return new HdDataSourceLocatorSet(HdCoordSysBindingSchema.getDefaultLocator())
        }
      }
    }

    return new HdDataSourceLocatorSet()
  }
}

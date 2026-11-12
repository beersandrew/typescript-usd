// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImaging/apiSchemaAdapter.cpp,
//  pxr/usdImaging/usdImaging/apiSchemaAdapter.h
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/apiSchemaAdapter.{h,cpp}
// (OpenUSD 26.11.1).

import { DataSourceLocatorSet as HdDataSourceLocatorSet, type ContainerDataSource as HdContainerDataSource } from 'typescript-usd/hd'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import type { UsdImagingPropertyInvalidationType } from './types.ts'

/** apiSchemaAdapter.h:28-97: base class for all API schema adapters. These
 *  map behavior of applied API schemas to contributions to the hydra prims
 *  and data sources generated for a given USD prim. */
export class UsdImagingAPISchemaAdapter {
  /** apiSchemaAdapter.cpp:16-22. Called to determine whether an API schema
   *  defines additional child hydra prims beyond the primary hydra prim
   *  representing the USD prim on which the API schema is applied.
   *  appliedInstanceName is non-empty for multiple-apply schema instances. */
  getImagingSubprims(_prim: UsdPrim, _appliedInstanceName: string): string[] {
    return []
  }

  /** apiSchemaAdapter.cpp:24-31 */
  getImagingSubprimType(_prim: UsdPrim, _subprim: string, _appliedInstanceName: string): string {
    return ''
  }

  /** apiSchemaAdapter.cpp:33-41. The non-null results of the prim adapter
   *  and each applied API schema adapter are overlaid (in application
   *  order). */
  getImagingSubprimData(
    _prim: UsdPrim, _subprim: string, _appliedInstanceName: string,
    _stageGlobals: UsdImagingDataSourceStageGlobals,
  ): HdContainerDataSource | undefined {
    return undefined
  }

  /** apiSchemaAdapter.cpp:43-51 */
  invalidateImagingSubprim(
    _prim: UsdPrim, _subprim: string, _appliedInstanceName: string,
    _properties: readonly string[], _invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    return new HdDataSourceLocatorSet()
  }
}

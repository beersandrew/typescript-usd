// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hd/flattenedOverlayDataSourceProvider.cpp,
//  pxr/imaging/hd/flattenedOverlayDataSourceProvider.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/flattenedOverlayDataSourceProvider.{h,cpp}
// (OpenUSD 26.11.1).

import type { HdContainerDataSource } from './dataSource.ts'
import type { HdDataSourceLocatorSet } from './dataSourceLocator.ts'
import { HdFlattenedDataSourceProvider } from './flattenedDataSourceProvider.ts'
import { HdOverlayContainerDataSource } from './overlayContainerDataSource.ts'

/** flattenedOverlayDataSourceProvider.h:16-30: flattens by overlaying the
 *  prim's input data source over the parent's flattened data source. */
export class HdFlattenedOverlayDataSourceProvider extends HdFlattenedDataSourceProvider {
  /** flattenedOverlayDataSourceProvider.cpp:13-21 (HdCreateOverlayContainerDataSource
   *  is HdOverlayContainerDataSource.OverlayedContainerDataSources here). */
  getFlattenedDataSource(ctx: HdFlattenedDataSourceProvider.Context):
    HdContainerDataSource | undefined {
    return HdOverlayContainerDataSource.overlayedContainerDataSources(
      ctx.getInputDataSource(),
      ctx.getFlattenedDataSourceFromParentPrim())
  }

  /** flattenedOverlayDataSourceProvider.cpp:23-27 */
  computeDirtyLocatorsForDescendants(locators: HdDataSourceLocatorSet): HdDataSourceLocatorSet {
    return locators
  }
}

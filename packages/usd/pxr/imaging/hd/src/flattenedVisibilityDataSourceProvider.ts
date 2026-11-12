// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hd/flattenedVisibilityDataSourceProvider.cpp,
//  pxr/imaging/hd/flattenedVisibilityDataSourceProvider.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/flattenedVisibilityDataSourceProvider.{h,cpp}
// (OpenUSD 26.11.1).

import { HdRetainedTypedSampledDataSource, type HdContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocatorSet } from './dataSourceLocator.ts'
import { HdFlattenedDataSourceProvider } from './flattenedDataSourceProvider.ts'
import { HdVisibilitySchema } from './visibilitySchema.ts'

let _identityVisibility: HdContainerDataSource | undefined

/** flattenedVisibilityDataSourceProvider.h:16-28 */
export class HdFlattenedVisibilityDataSourceProvider extends HdFlattenedDataSourceProvider {
  /** flattenedVisibilityDataSourceProvider.cpp:14-38 */
  getFlattenedDataSource(ctx: HdFlattenedDataSourceProvider.Context):
    HdContainerDataSource | undefined {
    // Note: this resolves the visibility not according to USD spec.
    // That is, if a parent is invis'd, we should never be vis'd.

    const inputVisibility = new HdVisibilitySchema(ctx.getInputDataSource())
    if (inputVisibility.getVisibility()) {
      return inputVisibility.getContainer()
    }

    const parentVisibility = new HdVisibilitySchema(
      ctx.getFlattenedDataSourceFromParentPrim())
    if (parentVisibility.getVisibility()) {
      return parentVisibility.getContainer()
    }

    return _identityVisibility ??= new HdVisibilitySchema.Builder()
      .setVisibility(HdRetainedTypedSampledDataSource.new(true))
      .build()
  }

  /** flattenedVisibilityDataSourceProvider.cpp:40-45 */
  computeDirtyLocatorsForDescendants(_locators: HdDataSourceLocatorSet): HdDataSourceLocatorSet {
    return HdDataSourceLocatorSet.UniversalSet
  }
}

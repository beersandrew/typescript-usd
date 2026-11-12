// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hd/flattenedPurposeDataSourceProvider.cpp,
//  pxr/imaging/hd/flattenedPurposeDataSourceProvider.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/flattenedPurposeDataSourceProvider.{h,cpp}
// (OpenUSD 26.11.1).

import type { HdContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocatorSet } from './dataSourceLocator.ts'
import { HdFlattenedDataSourceProvider } from './flattenedDataSourceProvider.ts'
import { HdPurposeSchema } from './purposeSchema.ts'

/** flattenedPurposeDataSourceProvider.h:16-28 */
export class HdFlattenedPurposeDataSourceProvider extends HdFlattenedDataSourceProvider {
  /** flattenedPurposeDataSourceProvider.cpp:15-43 */
  getFlattenedDataSource(ctx: HdFlattenedDataSourceProvider.Context):
    HdContainerDataSource | undefined {
    // If there is a purpose on this prim, use it.
    const inputPurpose = new HdPurposeSchema(ctx.getInputDataSource())
    if (inputPurpose.getPurpose()) {
      return inputPurpose.getContainer()
    }

    // If there is a parent purpose we can inherit, use that.
    const parentPurpose = new HdPurposeSchema(ctx.getFlattenedDataSourceFromParentPrim())
    const inheritableDs = parentPurpose.getInheritable()
    if (inheritableDs) {
      if (inheritableDs.getTypedValue(0.0)) {
        // Parent purpose is inheritable.
        return parentPurpose.getContainer()
      }
    }

    // If there is a fallback purpose, use that.
    const fallbackDs = inputPurpose.getFallback()
    if (fallbackDs) {
      // Fallback purposes are not inheritable.
      return new HdPurposeSchema.Builder()
        .setPurpose(fallbackDs)
        .build()
    }

    // Pass through the existing data untouched.
    return inputPurpose.getContainer()
  }

  /** flattenedPurposeDataSourceProvider.cpp:45-50 */
  computeDirtyLocatorsForDescendants(_locators: HdDataSourceLocatorSet): HdDataSourceLocatorSet {
    return HdDataSourceLocatorSet.UniversalSet
  }
}

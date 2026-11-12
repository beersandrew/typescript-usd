// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hd/invalidatableContainerDataSource.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/invalidatableContainerDataSource.h
// (OpenUSD 26.11.1).

import { HdContainerDataSource } from './dataSource.ts'
import type { HdDataSourceLocatorSet } from './dataSourceLocator.ts'

/**
 * invalidatableContainerDataSource.h:16-31. A container data source that can
 * be invalidated: Invalidate drops cached data for the given locators
 * (relative to this container) and returns true if anything was dropped.
 */
export abstract class HdInvalidatableContainerDataSource extends HdContainerDataSource {
  abstract invalidate(dirtyLocators: HdDataSourceLocatorSet): boolean
}

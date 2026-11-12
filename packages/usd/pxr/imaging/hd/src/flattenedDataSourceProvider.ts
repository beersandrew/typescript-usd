// Ported from OpenUSD 26.11.1: pxr/imaging/hd/flattenedDataSourceProvider.cpp,
//  pxr/imaging/hd/flattenedDataSourceProvider.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/flattenedDataSourceProvider.{h,cpp}
// (OpenUSD 26.11.1).
//
// Divergence: upstream ComputeDirtyLocatorsForDescendants takes an
// HdDataSourceLocatorSet* it may overwrite (`*locators = ...`). Here the
// (possibly replaced) set is returned instead; implementations that leave the
// set untouched return their argument.

import { SdfPath } from 'typescript-usd/sdf/path'
import { HdContainerDataSource, HdRetainedTypedSampledDataSource,
  type HdDataSourceBase, type HdTypedSampledDataSource } from './dataSource.ts'
import type { HdDataSourceLocatorSet } from './dataSourceLocator.ts'
import type { HdSceneIndexBase, HdSceneIndexPrim } from './sceneIndex.ts'

/** flattenedDataSourceProvider.cpp:12-21 */
function _Get(primDataSource: HdContainerDataSource | undefined,
  name: string): HdContainerDataSource | undefined {
  if (!primDataSource) return undefined
  const ds: HdDataSourceBase | undefined = primDataSource.Get(name)
  return ds instanceof HdContainerDataSource ? ds : undefined
}

/** flattenedDataSourceProvider.h:24-99 */
export abstract class HdFlattenedDataSourceProvider {
  /** Returns flattened data source. */
  abstract getFlattenedDataSource(
    ctx: HdFlattenedDataSourceProvider.Context): HdContainerDataSource | undefined

  /**
   * If data source locators are dirtied in the input scene index, the
   * locators relevant for the input data source serving this provider
   * are extracted and made relative to the input data source.
   *
   * They are later used to invalidate the flattened data source of the
   * dirtied prim and its descendants and send prim dirtied messages to
   * the descendants.
   *
   * Example: If a prim dirtied for locator xform:matrix was received, the
   * flattening scene index will call the flattened data source provider
   * for xform. The locators given to ComputeDirtyLocatorsForDescendants
   * will be { matrix }. If ComputeDirtyLocatorsForDescendants sets it to
   * the universal set, the flatening scene index will emit a prim dirtied
   * locator xform for the descendants.
   *
   * The implementation of ComputeDirtyLocatorsForDescendants gives a chance
   * to drop locators or expand the locator set in between.
   *
   * Note that ComputeDirtyLocatorsForDescendants will never be called with
   * the empty or universal set as these cases are already handled by the
   * callee.
   *
   * (TS: returns the resulting set instead of assigning through a pointer.)
   */
  abstract computeDirtyLocatorsForDescendants(
    locators: HdDataSourceLocatorSet): HdDataSourceLocatorSet
}

export namespace HdFlattenedDataSourceProvider {
  /** flattenedDataSourceProvider.h:27-60, .cpp:23-41 */
  export class Context {
    constructor(
      private readonly _flatteningSceneIndex: HdSceneIndexBase,
      private readonly _primPath: string,
      private readonly _name: string,
      private readonly _inputPrim: HdSceneIndexPrim,
    ) {}

    /** Returns data source of input scene index which is in
     *  the prim container data source. */
    getInputDataSource(): HdContainerDataSource | undefined {
      return _Get(this._inputPrim.dataSource, this._name)
    }

    /** Returns flattened data source which is in the flattened
     *  container data source of the parent prim. */
    getFlattenedDataSourceFromParentPrim(): HdContainerDataSource | undefined {
      if (this._primPath === '/') return undefined
      return _Get(
        this._flatteningSceneIndex.getPrim(
          SdfPath.fromString(this._primPath).getParentPath().pathString).dataSource,
        this._name)
    }

    /** Returns the type of the prim from the input scene index. */
    getInputPrimType(): string {
      return this._inputPrim.primType
    }
  }
}

/** HdTypedSampledDataSource<HdFlattenedDataSourceProviderSharedPtr> */
export type HdFlattenedDataSourceProviderDataSource =
  HdTypedSampledDataSource<HdFlattenedDataSourceProvider | undefined>

/** flattenedDataSourceProvider.h:101-112. Make<T>() takes the provider class
 *  (std::make_shared<T>() becomes `new T()`). */
export const HdMakeDataSourceContainingFlattenedDataSourceProvider = {
  Make<T extends HdFlattenedDataSourceProvider>(
    providerClass: new () => T,
  ): HdFlattenedDataSourceProviderDataSource {
    return HdRetainedTypedSampledDataSource.new<HdFlattenedDataSourceProvider | undefined>(
      new providerClass())
  },
}

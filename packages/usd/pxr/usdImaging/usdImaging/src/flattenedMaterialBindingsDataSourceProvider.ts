// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/flattenedMaterialBindingsDataSourceProvider.cpp,
//  pxr/usdImaging/usdImaging/flattenedMaterialBindingsDataSourceProvider.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from
// pxr/usdImaging/usdImaging/flattenedMaterialBindingsDataSourceProvider.{h,cpp}
// (OpenUSD 26.11.1).

import {
  ContainerDataSource as HdContainerDataSource,
  DataSourceLocator as HdDataSourceLocator,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  FlattenedDataSourceProvider as HdFlattenedDataSourceProvider,
  RetainedSmallVectorDataSource as HdRetainedSmallVectorDataSource,
  type DataSourceBase as HdDataSourceBase,
  type VectorDataSource as HdVectorDataSource,
} from 'typescript-usd/hd'
import { TF_VERIFY } from './tfDiagnostic.ts'
import { UsdImagingMaterialBindingsSchema } from './materialBindingsSchema.ts'

/** flattenedMaterialBindingsDataSourceProvider.cpp:18-122. Aggregate material
 *  bindings from the parent with the prim's local bindings. */
class _MaterialBindingsDataSource extends HdContainerDataSource {
  private constructor(
    private readonly _primBindings: HdContainerDataSource,
    private readonly _parentBindings: HdContainerDataSource,
  ) { super() }

  static new(
    primBindings: HdContainerDataSource, parentBindings: HdContainerDataSource,
  ): _MaterialBindingsDataSource {
    return new _MaterialBindingsDataSource(primBindings, parentBindings)
  }

  /** flattenedMaterialBindingsDataSourceProvider.cpp:26-34 (TfDenseHashSet
   *  iteration order is first-insertion order here). */
  getNames(): string[] {
    const allPurposes = new Set<string>()
    for (const purposes of [this._primBindings.getNames(), this._parentBindings.getNames()]) {
      for (const purpose of purposes) allPurposes.add(purpose)
    }
    return [...allPurposes]
  }

  /** flattenedMaterialBindingsDataSourceProvider.cpp:36-62 */
  Get(name: string): HdDataSourceBase | undefined {
    TF_VERIFY(this._primBindings && this._parentBindings)
    const purpose = name

    const parentSchema = new UsdImagingMaterialBindingsSchema(this._parentBindings)
    const parentBindingsSchema = parentSchema.getMaterialBindings(purpose)

    const primSchema = new UsdImagingMaterialBindingsSchema(this._primBindings)
    const primBindingsSchema = primSchema.getMaterialBindings(purpose)

    if (parentBindingsSchema.getNumElements() === 0) {
      return primBindingsSchema.getVector()
    }

    if (primBindingsSchema.getNumElements() === 0) {
      return parentBindingsSchema.getVector()
    }

    // Insert the prim's opinion after the parent's. The binding resolving
    // scene index walks through the bindings in this order to short
    // circuit membership evaluation when possible.
    return _MaterialBindingsDataSource._concat(
      parentBindingsSchema.getVector()!, primBindingsSchema.getVector()!)
  }

  /** flattenedMaterialBindingsDataSourceProvider.cpp:64-89. Returns a vector
   *  data source that concatenates valid elements of the given vector data
   *  sources. */
  private static _concat(a: HdVectorDataSource, b: HdVectorDataSource): HdVectorDataSource {
    const numA = a.getNumElements()
    const numB = b.getNumElements()
    const result: HdDataSourceBase[] = []

    for (let i = 0; i < numA; ++i) {
      const ds = a.getElement(i)
      if (ds) {
        result.push(ds)
      }
    }
    for (let i = 0; i < numB; ++i) {
      const ds = b.getElement(i)
      if (ds) {
        result.push(ds)
      }
    }

    return HdRetainedSmallVectorDataSource.new(result)
  }

  /** flattenedMaterialBindingsDataSourceProvider.cpp:91-110. Return data
   *  source with the correct composition behavior.
   *
   *  This avoids allocating the aggregated data source if only one of the
   *  given handles is non-null (which we expect to be the general case). */
  static useOrCreateNew(
    primBindings: HdContainerDataSource | undefined,
    parentBindings: HdContainerDataSource | undefined,
  ): HdContainerDataSource | undefined {
    if (!primBindings) {
      return parentBindings
    }
    if (!parentBindings) {
      return primBindings
    }
    return _MaterialBindingsDataSource.new(primBindings, parentBindings)
  }
}

/** flattenedMaterialBindingsDataSourceProvider.h:16-26 */
export class UsdImagingFlattenedMaterialBindingsDataSourceProvider extends HdFlattenedDataSourceProvider {
  /** flattenedMaterialBindingsDataSourceProvider.cpp:126-134 */
  getFlattenedDataSource(ctx: HdFlattenedDataSourceProvider.Context): HdContainerDataSource | undefined {
    return _MaterialBindingsDataSource.useOrCreateNew(
      ctx.getInputDataSource(),
      ctx.getFlattenedDataSourceFromParentPrim())
  }

  /** flattenedMaterialBindingsDataSourceProvider.cpp:136-165 (returns the
   *  resulting set, see HdFlattenedDataSourceProvider). */
  computeDirtyLocatorsForDescendants(locators: HdDataSourceLocatorSet): HdDataSourceLocatorSet {
    // Any locator of the form BindingPurpose:Foo:... will be turned into
    // BindingPurpose. The data source for the aggregated bindings needs
    // to be recomputed.
    let modifyInputLocators = false

    for (const locator of locators) {
      if (locator.getElementCount() !== 1) {
        modifyInputLocators = true
        break
      }
    }
    if (!modifyInputLocators) {
      return locators // Use input locators set.
    }

    const result = new HdDataSourceLocatorSet()
    for (const locator of locators) {
      result.insert(new HdDataSourceLocator(locator.getFirstElement()))
    }
    return result
  }
}

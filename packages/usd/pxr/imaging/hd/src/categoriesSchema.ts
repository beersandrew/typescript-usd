// Ported from OpenUSD 26.11.1: pxr/imaging/hd/categoriesSchema.cpp,
//  pxr/imaging/hd/categoriesSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/categoriesSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the Categories entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream categoriesSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource, type HdDataSourceBase, HdRetainedContainerDataSource, HdRetainedTypedSampledDataSource, HdSampledDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import { HdSchema } from './schema.ts'

// --(BEGIN CUSTOM CODE: Declares)--
const _boolTrueDs = HdRetainedTypedSampledDataSource.new<boolean>(true)
const _boolFalseDs = HdRetainedTypedSampledDataSource.new<boolean>(false)
// --(END CUSTOM CODE: Declares)--

/** categoriesSchema.h TF_DECLARE_PUBLIC_TOKENS(HdCategoriesSchemaTokens) */
export const HdCategoriesSchemaTokens = TfMakeTokens({
  categories: 'categories',
})

export class HdCategoriesSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** categoriesSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdCategoriesSchema {
    const ds = fromParentContainer?.Get(HdCategoriesSchemaTokens.categories)
    return new HdCategoriesSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  // --(BEGIN CUSTOM CODE: Schema Methods)--

  /** categoriesSchema.cpp GetIncludedCategoryNames */
  getIncludedCategoryNames(): TfToken[] {
    const result: TfToken[] = []
    if (!this._container) return result
    for (const name of this._container.getNames()) {
      const valueDs = this._container.Get(name)
      if (valueDs instanceof HdSampledDataSource && valueDs.GetValue(0)) {
        result.push(name as TfToken)
      }
    }
    return result
  }

  /** categoriesSchema.cpp IsIncludedInCategory */
  isIncludedInCategory(categoryName: string): boolean {
    const valueDs = this._getTypedDataSource(categoryName)
    return !!(valueDs && valueDs.GetValue(0))
  }

  /** categoriesSchema.cpp BuildRetained (the counts are implied by the array
   * lengths). */
  static buildRetained(
    includedNames: readonly string[] | undefined,
    excludedNames: readonly string[] | undefined,
  ): HdContainerDataSource {
    const names: string[] = []
    const values: HdDataSourceBase[] = []
    for (const n of includedNames ?? []) { names.push(n); values.push(_boolTrueDs) }
    for (const n of excludedNames ?? []) { names.push(n); values.push(_boolFalseDs) }
    return HdRetainedContainerDataSource.new(names, values)
  }
  // --(END CUSTOM CODE: Schema Methods)--

  static getSchemaToken(): TfToken {
    return HdCategoriesSchemaTokens.categories
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdCategoriesSchema._defaultLocator ??= new HdDataSourceLocator(HdCategoriesSchema.getSchemaToken())
  }
}

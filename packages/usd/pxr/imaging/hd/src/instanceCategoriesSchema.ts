// Ported from OpenUSD 26.11.1: pxr/imaging/hd/instanceCategoriesSchema.cpp,
//  pxr/imaging/hd/instanceCategoriesSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/instanceCategoriesSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the InstanceCategories entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream instanceCategoriesSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource, type HdVectorDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'

/** instanceCategoriesSchema.h TF_DECLARE_PUBLIC_TOKENS(HdInstanceCategoriesSchemaTokens) */
export const HdInstanceCategoriesSchemaTokens = TfMakeTokens({
  instanceCategories: 'instanceCategories',
  categoriesValues: 'categoriesValues',
})

export class HdInstanceCategoriesSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** instanceCategoriesSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdInstanceCategoriesSchema {
    const ds = fromParentContainer?.Get(HdInstanceCategoriesSchemaTokens.instanceCategories)
    return new HdInstanceCategoriesSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getCategoriesValues(): HdVectorDataSource | undefined {
    return this._getVectorDataSource(HdInstanceCategoriesSchemaTokens.categoriesValues)
  }

  static getSchemaToken(): TfToken {
    return HdInstanceCategoriesSchemaTokens.instanceCategories
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdInstanceCategoriesSchema._defaultLocator ??= new HdDataSourceLocator(HdInstanceCategoriesSchema.getSchemaToken())
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    categoriesValues?: HdVectorDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdInstanceCategoriesSchemaTokens.categoriesValues]: categoriesValues,
    })
  }
}

export namespace HdInstanceCategoriesSchema {
  /** HdInstanceCategoriesSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _categoriesValues: HdVectorDataSource | undefined
    setCategoriesValues(categoriesValues: HdVectorDataSource | undefined): this {
      this._categoriesValues = categoriesValues
      return this
    }
    build(): HdContainerDataSource {
      return HdInstanceCategoriesSchema.buildRetained(
        this._categoriesValues,
      )
    }
  }
}

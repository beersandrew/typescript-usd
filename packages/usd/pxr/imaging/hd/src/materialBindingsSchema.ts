// Ported from OpenUSD 26.11.1: pxr/imaging/hd/materialBindingsSchema.cpp,
//  pxr/imaging/hd/materialBindingsSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/materialBindingsSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the MaterialBindings entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream materialBindingsSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource, type HdDataSourceBase, HdRetainedContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import { HdMaterialBindingSchema } from './materialBindingSchema.ts'
import { HdSchema } from './schema.ts'

/** materialBindingsSchema.h TF_DECLARE_PUBLIC_TOKENS(HdMaterialBindingsSchemaTokens) */
export const HdMaterialBindingsSchemaTokens = TfMakeTokens({
  materialBindings: 'materialBindings',
  allPurpose: '',
  _allPurposeToken: 'allPurpose',
})

export class HdMaterialBindingsSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** materialBindingsSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdMaterialBindingsSchema {
    const ds = fromParentContainer?.Get(HdMaterialBindingsSchemaTokens.materialBindings)
    return new HdMaterialBindingsSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  // --(BEGIN CUSTOM CODE: Schema Methods)--

  /** materialBindingsSchema.cpp: GetMaterialBinding() returns the allPurpose
   * binding; GetMaterialBinding(purpose) falls back to it when the
   * purpose-specific binding is missing. */
  getMaterialBinding(purpose?: string): HdMaterialBindingSchema {
    if (purpose !== undefined) {
      const b = this._getContainerDataSource(purpose)
      if (b) return new HdMaterialBindingSchema(b)
    }
    return new HdMaterialBindingSchema(
      this._getContainerDataSource(HdMaterialBindingsSchemaTokens.allPurpose))
  }
  // --(END CUSTOM CODE: Schema Methods)--

  static getSchemaToken(): TfToken {
    return HdMaterialBindingsSchemaTokens.materialBindings
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdMaterialBindingsSchema._defaultLocator ??= new HdDataSourceLocator(HdMaterialBindingsSchema.getSchemaToken())
  }

  /** schemaClass.cpp:115-124 (the count argument is implied by the
   * array lengths, as in HdRetainedContainerDataSource.New of this port). */
  static buildRetained(
    names: readonly string[], values: readonly HdDataSourceBase[],
  ): HdContainerDataSource {
    return HdRetainedContainerDataSource.new([...names], [...values])
  }
}

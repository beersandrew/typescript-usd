// Ported from OpenUSD 26.11.1: pxr/imaging/hd/lightSchema.cpp,
//  pxr/imaging/hd/lightSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/lightSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the Light entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream lightSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import { HdSchema } from './schema.ts'

/** lightSchema.h TF_DECLARE_PUBLIC_TOKENS(HdLightSchemaTokens) */
export const HdLightSchemaTokens = TfMakeTokens({
  light: 'light',
})

export class HdLightSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** lightSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdLightSchema {
    const ds = fromParentContainer?.Get(HdLightSchemaTokens.light)
    return new HdLightSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  static getSchemaToken(): TfToken {
    return HdLightSchemaTokens.light
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdLightSchema._defaultLocator ??= new HdDataSourceLocator(HdLightSchema.getSchemaToken())
  }
}

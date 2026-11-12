// Ported from OpenUSD 26.11.1: pxr/imaging/hd/volumeSchema.cpp,
//  pxr/imaging/hd/volumeSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/volumeSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the Volume entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream volumeSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import { HdSchema } from './schema.ts'

/** volumeSchema.h TF_DECLARE_PUBLIC_TOKENS(HdVolumeSchemaTokens) */
export const HdVolumeSchemaTokens = TfMakeTokens({
  volume: 'volume',
})

export class HdVolumeSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** volumeSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdVolumeSchema {
    const ds = fromParentContainer?.Get(HdVolumeSchemaTokens.volume)
    return new HdVolumeSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  static getSchemaToken(): TfToken {
    return HdVolumeSchemaTokens.volume
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdVolumeSchema._defaultLocator ??= new HdDataSourceLocator(HdVolumeSchema.getSchemaToken())
  }
}

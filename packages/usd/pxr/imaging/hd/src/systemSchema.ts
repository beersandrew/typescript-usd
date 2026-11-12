// Ported from OpenUSD 26.11.1: pxr/imaging/hd/systemSchema.cpp,
//  pxr/imaging/hd/systemSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/systemSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the System entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates.
// Not ported: the custom GetFromPath / Compose / ComposeAsPrimDataSource helpers.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'

/** systemSchema.h TF_DECLARE_PUBLIC_TOKENS(HdSystemSchemaTokens) */
export const HdSystemSchemaTokens = TfMakeTokens({
  system: 'system',
})

export class HdSystemSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** systemSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdSystemSchema {
    const ds = fromParentContainer?.Get(HdSystemSchemaTokens.system)
    return new HdSystemSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  static getSchemaToken(): TfToken {
    return HdSystemSchemaTokens.system
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdSystemSchema._defaultLocator ??= new HdDataSourceLocator(HdSystemSchema.getSchemaToken())
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
  ): HdContainerDataSource {
    return _HdBuildRetained({
    })
  }
}

export namespace HdSystemSchema {
  /** HdSystemSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    build(): HdContainerDataSource {
      return HdSystemSchema.buildRetained(
      )
    }
  }
}

// Ported from OpenUSD 26.11.1: pxr/imaging/hd/visibilitySchema.cpp,
//  pxr/imaging/hd/visibilitySchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/visibilitySchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the Visibility entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream visibilitySchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdBoolDataSource } from './dataSourceTypeDefs.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'

/** visibilitySchema.h TF_DECLARE_PUBLIC_TOKENS(HdVisibilitySchemaTokens) */
export const HdVisibilitySchemaTokens = TfMakeTokens({
  visibility: 'visibility',
})

export class HdVisibilitySchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** visibilitySchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdVisibilitySchema {
    const ds = fromParentContainer?.Get(HdVisibilitySchemaTokens.visibility)
    return new HdVisibilitySchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getVisibility(): HdBoolDataSource | undefined {
    return this._getTypedDataSource<HdBoolDataSource>(HdVisibilitySchemaTokens.visibility)
  }

  static getSchemaToken(): TfToken {
    return HdVisibilitySchemaTokens.visibility
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdVisibilitySchema._defaultLocator ??= new HdDataSourceLocator(HdVisibilitySchema.getSchemaToken())
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    visibility?: HdBoolDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdVisibilitySchemaTokens.visibility]: visibility,
    })
  }
}

export namespace HdVisibilitySchema {
  /** HdVisibilitySchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _visibility: HdBoolDataSource | undefined
    setVisibility(visibility: HdBoolDataSource | undefined): this {
      this._visibility = visibility
      return this
    }
    build(): HdContainerDataSource {
      return HdVisibilitySchema.buildRetained(
        this._visibility,
      )
    }
  }
}

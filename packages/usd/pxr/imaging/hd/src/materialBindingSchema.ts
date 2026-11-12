// Ported from OpenUSD 26.11.1: pxr/imaging/hd/materialBindingSchema.cpp,
//  pxr/imaging/hd/materialBindingSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/materialBindingSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the MaterialBinding entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream materialBindingSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdPathDataSource } from './dataSourceTypeDefs.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'

/** materialBindingSchema.h TF_DECLARE_PUBLIC_TOKENS(HdMaterialBindingSchemaTokens) */
export const HdMaterialBindingSchemaTokens = TfMakeTokens({
  path: 'path',
})

export class HdMaterialBindingSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  getPath(): HdPathDataSource | undefined {
    return this._getTypedDataSource<HdPathDataSource>(HdMaterialBindingSchemaTokens.path)
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    path?: HdPathDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdMaterialBindingSchemaTokens.path]: path,
    })
  }
}

export namespace HdMaterialBindingSchema {
  /** HdMaterialBindingSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _path: HdPathDataSource | undefined
    setPath(path: HdPathDataSource | undefined): this {
      this._path = path
      return this
    }
    build(): HdContainerDataSource {
      return HdMaterialBindingSchema.buildRetained(
        this._path,
      )
    }
  }
}

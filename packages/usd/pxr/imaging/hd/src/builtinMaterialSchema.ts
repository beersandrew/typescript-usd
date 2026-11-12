// Ported from OpenUSD 26.11.1: pxr/imaging/hd/builtinMaterialSchema.cpp,
//  pxr/imaging/hd/builtinMaterialSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/builtinMaterialSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the BuiltinMaterial entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdBoolDataSource } from './dataSourceTypeDefs.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'

/** builtinMaterialSchema.h TF_DECLARE_PUBLIC_TOKENS(HdBuiltinMaterialSchemaTokens) */
export const HdBuiltinMaterialSchemaTokens = TfMakeTokens({
  builtinMaterial: 'builtinMaterial',
})

export class HdBuiltinMaterialSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** builtinMaterialSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdBuiltinMaterialSchema {
    const ds = fromParentContainer?.Get(HdBuiltinMaterialSchemaTokens.builtinMaterial)
    return new HdBuiltinMaterialSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getBuiltinMaterial(): HdBoolDataSource | undefined {
    return this._getTypedDataSource<HdBoolDataSource>(HdBuiltinMaterialSchemaTokens.builtinMaterial)
  }

  static getSchemaToken(): TfToken {
    return HdBuiltinMaterialSchemaTokens.builtinMaterial
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdBuiltinMaterialSchema._defaultLocator ??= new HdDataSourceLocator(HdBuiltinMaterialSchema.getSchemaToken())
  }

  private static _builtinMaterialLocator: HdDataSourceLocator | undefined
  static getBuiltinMaterialLocator(): HdDataSourceLocator {
    return HdBuiltinMaterialSchema._builtinMaterialLocator ??= HdBuiltinMaterialSchema.getDefaultLocator().append(HdBuiltinMaterialSchemaTokens.builtinMaterial)
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    builtinMaterial?: HdBoolDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdBuiltinMaterialSchemaTokens.builtinMaterial]: builtinMaterial,
    })
  }
}

export namespace HdBuiltinMaterialSchema {
  /** HdBuiltinMaterialSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _builtinMaterial: HdBoolDataSource | undefined
    setBuiltinMaterial(builtinMaterial: HdBoolDataSource | undefined): this {
      this._builtinMaterial = builtinMaterial
      return this
    }
    build(): HdContainerDataSource {
      return HdBuiltinMaterialSchema.buildRetained(
        this._builtinMaterial,
      )
    }
  }
}

// Ported from OpenUSD 26.11.1: pxr/imaging/hd/materialNodeParameterSchema.cpp,
//  pxr/imaging/hd/materialNodeParameterSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/materialNodeParameterSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the MaterialNodeParameter entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream materialNodeParameterSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource, type HdSampledDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdTokenDataSource } from './dataSourceTypeDefs.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'

/** materialNodeParameterSchema.h TF_DECLARE_PUBLIC_TOKENS(HdMaterialNodeParameterSchemaTokens) */
export const HdMaterialNodeParameterSchemaTokens = TfMakeTokens({
  value: 'value',
  colorSpace: 'colorSpace',
  typeName: 'typeName',
})

/**
 * The MaterialNodeParameter schema defines the value data source for the
 * parameter.
 */
export class HdMaterialNodeParameterSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  GetValue(): HdSampledDataSource | undefined {
    return this._getTypedDataSource<HdSampledDataSource>(HdMaterialNodeParameterSchemaTokens.value)
  }

  getColorSpace(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdMaterialNodeParameterSchemaTokens.colorSpace)
  }

  getTypeName(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdMaterialNodeParameterSchemaTokens.typeName)
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    value?: HdSampledDataSource | undefined,
    colorSpace?: HdTokenDataSource | undefined,
    typeName?: HdTokenDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdMaterialNodeParameterSchemaTokens.value]: value,
      [HdMaterialNodeParameterSchemaTokens.colorSpace]: colorSpace,
      [HdMaterialNodeParameterSchemaTokens.typeName]: typeName,
    })
  }
}

export namespace HdMaterialNodeParameterSchema {
  /** HdMaterialNodeParameterSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _value: HdSampledDataSource | undefined
    private _colorSpace: HdTokenDataSource | undefined
    private _typeName: HdTokenDataSource | undefined
    setValue(value: HdSampledDataSource | undefined): this {
      this._value = value
      return this
    }
    setColorSpace(colorSpace: HdTokenDataSource | undefined): this {
      this._colorSpace = colorSpace
      return this
    }
    setTypeName(typeName: HdTokenDataSource | undefined): this {
      this._typeName = typeName
      return this
    }
    build(): HdContainerDataSource {
      return HdMaterialNodeParameterSchema.buildRetained(
        this._value,
        this._colorSpace,
        this._typeName,
      )
    }
  }
}

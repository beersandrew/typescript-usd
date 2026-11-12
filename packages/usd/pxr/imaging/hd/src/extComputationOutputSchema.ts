// Ported from OpenUSD 26.11.1: pxr/imaging/hd/extComputationOutputSchema.cpp,
//  pxr/imaging/hd/extComputationOutputSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/extComputationOutputSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the ExtComputationOutput entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream extComputationOutputSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdTupleTypeDataSource } from './dataSourceTypeDefs.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'

/** extComputationOutputSchema.h TF_DECLARE_PUBLIC_TOKENS(HdExtComputationOutputSchemaTokens) */
export const HdExtComputationOutputSchemaTokens = TfMakeTokens({
  valueType: 'valueType',
})

export class HdExtComputationOutputSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  GetValueType(): HdTupleTypeDataSource | undefined {
    return this._getTypedDataSource<HdTupleTypeDataSource>(HdExtComputationOutputSchemaTokens.valueType)
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    valueType?: HdTupleTypeDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdExtComputationOutputSchemaTokens.valueType]: valueType,
    })
  }
}

export namespace HdExtComputationOutputSchema {
  /** HdExtComputationOutputSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _valueType: HdTupleTypeDataSource | undefined
    setValueType(valueType: HdTupleTypeDataSource | undefined): this {
      this._valueType = valueType
      return this
    }
    build(): HdContainerDataSource {
      return HdExtComputationOutputSchema.buildRetained(
        this._valueType,
      )
    }
  }
}

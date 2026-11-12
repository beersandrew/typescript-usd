// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hd/extComputationInputComputationSchema.cpp,
//  pxr/imaging/hd/extComputationInputComputationSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/extComputationInputComputationSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the ExtComputationInputComputation entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream extComputationInputComputationSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdPathDataSource, HdTokenDataSource } from './dataSourceTypeDefs.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'

/** extComputationInputComputationSchema.h TF_DECLARE_PUBLIC_TOKENS(HdExtComputationInputComputationSchemaTokens) */
export const HdExtComputationInputComputationSchemaTokens = TfMakeTokens({
  sourceComputation: 'sourceComputation',
  sourceComputationOutputName: 'sourceComputationOutputName',
})

export class HdExtComputationInputComputationSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  getSourceComputation(): HdPathDataSource | undefined {
    return this._getTypedDataSource<HdPathDataSource>(HdExtComputationInputComputationSchemaTokens.sourceComputation)
  }

  getSourceComputationOutputName(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdExtComputationInputComputationSchemaTokens.sourceComputationOutputName)
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    sourceComputation?: HdPathDataSource | undefined,
    sourceComputationOutputName?: HdTokenDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdExtComputationInputComputationSchemaTokens.sourceComputation]: sourceComputation,
      [HdExtComputationInputComputationSchemaTokens.sourceComputationOutputName]: sourceComputationOutputName,
    })
  }
}

export namespace HdExtComputationInputComputationSchema {
  /** HdExtComputationInputComputationSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _sourceComputation: HdPathDataSource | undefined
    private _sourceComputationOutputName: HdTokenDataSource | undefined
    setSourceComputation(sourceComputation: HdPathDataSource | undefined): this {
      this._sourceComputation = sourceComputation
      return this
    }
    setSourceComputationOutputName(sourceComputationOutputName: HdTokenDataSource | undefined): this {
      this._sourceComputationOutputName = sourceComputationOutputName
      return this
    }
    build(): HdContainerDataSource {
      return HdExtComputationInputComputationSchema.buildRetained(
        this._sourceComputation,
        this._sourceComputationOutputName,
      )
    }
  }
}

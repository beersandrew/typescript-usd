// Ported from OpenUSD 26.11.1: pxr/imaging/hd/extComputationPrimvarSchema.cpp,
//  pxr/imaging/hd/extComputationPrimvarSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/extComputationPrimvarSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the ExtComputationPrimvar entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream extComputationPrimvarSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdPathDataSource, HdTokenDataSource, HdTupleTypeDataSource } from './dataSourceTypeDefs.ts'
import { HdPrimvarSchema } from './primvarSchema.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'

/** extComputationPrimvarSchema.h TF_DECLARE_PUBLIC_TOKENS(HdExtComputationPrimvarSchemaTokens) */
export const HdExtComputationPrimvarSchemaTokens = TfMakeTokens({
  interpolation: 'interpolation',
  role: 'role',
  sourceComputation: 'sourceComputation',
  sourceComputationOutputName: 'sourceComputationOutputName',
  valueType: 'valueType',
})

export class HdExtComputationPrimvarSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  // --(BEGIN CUSTOM CODE: Schema Methods)--

  // these return statically allocated instances for the common cases.
  static buildInterpolationDataSource(interpolation: string): HdTokenDataSource {
    return HdPrimvarSchema.buildInterpolationDataSource(interpolation)
  }

  static buildRoleDataSource(role: string): HdTokenDataSource {
    return HdPrimvarSchema.buildRoleDataSource(role)
  }
  // --(END CUSTOM CODE: Schema Methods)--

  getInterpolation(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdExtComputationPrimvarSchemaTokens.interpolation)
  }

  getRole(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdExtComputationPrimvarSchemaTokens.role)
  }

  getSourceComputation(): HdPathDataSource | undefined {
    return this._getTypedDataSource<HdPathDataSource>(HdExtComputationPrimvarSchemaTokens.sourceComputation)
  }

  getSourceComputationOutputName(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdExtComputationPrimvarSchemaTokens.sourceComputationOutputName)
  }

  GetValueType(): HdTupleTypeDataSource | undefined {
    return this._getTypedDataSource<HdTupleTypeDataSource>(HdExtComputationPrimvarSchemaTokens.valueType)
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    interpolation?: HdTokenDataSource | undefined,
    role?: HdTokenDataSource | undefined,
    sourceComputation?: HdPathDataSource | undefined,
    sourceComputationOutputName?: HdTokenDataSource | undefined,
    valueType?: HdTupleTypeDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdExtComputationPrimvarSchemaTokens.interpolation]: interpolation,
      [HdExtComputationPrimvarSchemaTokens.role]: role,
      [HdExtComputationPrimvarSchemaTokens.sourceComputation]: sourceComputation,
      [HdExtComputationPrimvarSchemaTokens.sourceComputationOutputName]: sourceComputationOutputName,
      [HdExtComputationPrimvarSchemaTokens.valueType]: valueType,
    })
  }
}

export namespace HdExtComputationPrimvarSchema {
  /** HdExtComputationPrimvarSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _interpolation: HdTokenDataSource | undefined
    private _role: HdTokenDataSource | undefined
    private _sourceComputation: HdPathDataSource | undefined
    private _sourceComputationOutputName: HdTokenDataSource | undefined
    private _valueType: HdTupleTypeDataSource | undefined
    setInterpolation(interpolation: HdTokenDataSource | undefined): this {
      this._interpolation = interpolation
      return this
    }
    setRole(role: HdTokenDataSource | undefined): this {
      this._role = role
      return this
    }
    setSourceComputation(sourceComputation: HdPathDataSource | undefined): this {
      this._sourceComputation = sourceComputation
      return this
    }
    setSourceComputationOutputName(sourceComputationOutputName: HdTokenDataSource | undefined): this {
      this._sourceComputationOutputName = sourceComputationOutputName
      return this
    }
    setValueType(valueType: HdTupleTypeDataSource | undefined): this {
      this._valueType = valueType
      return this
    }
    build(): HdContainerDataSource {
      return HdExtComputationPrimvarSchema.buildRetained(
        this._interpolation,
        this._role,
        this._sourceComputation,
        this._sourceComputationOutputName,
        this._valueType,
      )
    }
  }
}

// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hd/extComputationPrimvarsSchema.cpp,
//  pxr/imaging/hd/extComputationPrimvarsSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/extComputationPrimvarsSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the ExtComputationPrimvars entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream extComputationPrimvarsSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource, type HdDataSourceBase, HdRetainedContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import { HdExtComputationPrimvarSchema } from './extComputationPrimvarSchema.ts'
import { HdSchema } from './schema.ts'

/** extComputationPrimvarsSchema.h TF_DECLARE_PUBLIC_TOKENS(HdExtComputationPrimvarsSchemaTokens) */
export const HdExtComputationPrimvarsSchemaTokens = TfMakeTokens({
  extComputationPrimvars: 'extComputationPrimvars',
})

export class HdExtComputationPrimvarsSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** extComputationPrimvarsSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdExtComputationPrimvarsSchema {
    const ds = fromParentContainer?.Get(HdExtComputationPrimvarsSchemaTokens.extComputationPrimvars)
    return new HdExtComputationPrimvarsSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getExtComputationPrimvarNames(): TfToken[] {
    return (this._container?.getNames() ?? []) as TfToken[]
  }

  getExtComputationPrimvar(name: string): HdExtComputationPrimvarSchema {
    return new HdExtComputationPrimvarSchema(this._getContainerDataSource(name))
  }

  static getSchemaToken(): TfToken {
    return HdExtComputationPrimvarsSchemaTokens.extComputationPrimvars
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdExtComputationPrimvarsSchema._defaultLocator ??= new HdDataSourceLocator(HdExtComputationPrimvarsSchema.getSchemaToken())
  }

  /** schemaClass.cpp:115-124 (the count argument is implied by the
   * array lengths, as in HdRetainedContainerDataSource.New of this port). */
  static buildRetained(
    names: readonly string[], values: readonly HdDataSourceBase[],
  ): HdContainerDataSource {
    return HdRetainedContainerDataSource.new([...names], [...values])
  }
}

// Ported from OpenUSD 26.11.1: pxr/imaging/hd/coordSysBindingSchema.cpp,
//  pxr/imaging/hd/coordSysBindingSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/coordSysBindingSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the CoordSysBinding entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream coordSysBindingSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource, type HdDataSourceBase, HdRetainedContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdPathDataSource } from './dataSourceTypeDefs.ts'
import { HdSchema } from './schema.ts'

/** coordSysBindingSchema.h TF_DECLARE_PUBLIC_TOKENS(HdCoordSysBindingSchemaTokens) */
export const HdCoordSysBindingSchemaTokens = TfMakeTokens({
  coordSysBinding: 'coordSysBinding',
})

export class HdCoordSysBindingSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** coordSysBindingSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdCoordSysBindingSchema {
    const ds = fromParentContainer?.Get(HdCoordSysBindingSchemaTokens.coordSysBinding)
    return new HdCoordSysBindingSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getCoordSysBindingNames(): TfToken[] {
    return (this._container?.getNames() ?? []) as TfToken[]
  }

  getCoordSysBinding(name: string): HdPathDataSource | undefined {
    return this._getTypedDataSource<HdPathDataSource>(name)
  }

  static getSchemaToken(): TfToken {
    return HdCoordSysBindingSchemaTokens.coordSysBinding
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdCoordSysBindingSchema._defaultLocator ??= new HdDataSourceLocator(HdCoordSysBindingSchema.getSchemaToken())
  }

  /** schemaClass.cpp:115-124 (the count argument is implied by the
   * array lengths, as in HdRetainedContainerDataSource.New of this port). */
  static buildRetained(
    names: readonly string[], values: readonly HdDataSourceBase[],
  ): HdContainerDataSource {
    return HdRetainedContainerDataSource.new([...names], [...values])
  }
}

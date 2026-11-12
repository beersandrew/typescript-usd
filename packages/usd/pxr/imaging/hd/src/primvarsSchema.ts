// Ported from OpenUSD 26.11.1: pxr/imaging/hd/primvarsSchema.cpp,
//  pxr/imaging/hd/primvarsSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/primvarsSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the Primvars entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream primvarsSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource, type HdDataSourceBase, HdRetainedContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import { HdPrimvarSchema } from './primvarSchema.ts'
import { HdSchema } from './schema.ts'

/** primvarsSchema.h TF_DECLARE_PUBLIC_TOKENS(HdPrimvarsSchemaTokens) */
export const HdPrimvarsSchemaTokens = TfMakeTokens({
  primvars: 'primvars',
  points: 'points',
  normals: 'normals',
  widths: 'widths',
})

export class HdPrimvarsSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** primvarsSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdPrimvarsSchema {
    const ds = fromParentContainer?.Get(HdPrimvarsSchemaTokens.primvars)
    return new HdPrimvarsSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getPrimvarNames(): TfToken[] {
    return (this._container?.getNames() ?? []) as TfToken[]
  }

  getPrimvar(name: string): HdPrimvarSchema {
    return new HdPrimvarSchema(this._getContainerDataSource(name))
  }

  static getSchemaToken(): TfToken {
    return HdPrimvarsSchemaTokens.primvars
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdPrimvarsSchema._defaultLocator ??= new HdDataSourceLocator(HdPrimvarsSchema.getSchemaToken())
  }

  private static _pointsLocator: HdDataSourceLocator | undefined
  static getPointsLocator(): HdDataSourceLocator {
    return HdPrimvarsSchema._pointsLocator ??= HdPrimvarsSchema.getDefaultLocator().append(HdPrimvarsSchemaTokens.points)
  }

  private static _normalsLocator: HdDataSourceLocator | undefined
  static getNormalsLocator(): HdDataSourceLocator {
    return HdPrimvarsSchema._normalsLocator ??= HdPrimvarsSchema.getDefaultLocator().append(HdPrimvarsSchemaTokens.normals)
  }

  private static _widthsLocator: HdDataSourceLocator | undefined
  static getWidthsLocator(): HdDataSourceLocator {
    return HdPrimvarsSchema._widthsLocator ??= HdPrimvarsSchema.getDefaultLocator().append(HdPrimvarsSchemaTokens.widths)
  }

  /** schemaClass.cpp:115-124 (the count argument is implied by the
   * array lengths, as in HdRetainedContainerDataSource.New of this port). */
  static buildRetained(
    names: readonly string[], values: readonly HdDataSourceBase[],
  ): HdContainerDataSource {
    return HdRetainedContainerDataSource.new([...names], [...values])
  }
}

// Ported from OpenUSD 26.11.1: pxr/imaging/hd/coordSysSchema.cpp,
//  pxr/imaging/hd/coordSysSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/coordSysSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the CoordSys entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream coordSysSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdTokenDataSource } from './dataSourceTypeDefs.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'

/** coordSysSchema.h TF_DECLARE_PUBLIC_TOKENS(HdCoordSysSchemaTokens) */
export const HdCoordSysSchemaTokens = TfMakeTokens({
  coordSys: 'coordSys',
  name: 'name',
})

export class HdCoordSysSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** coordSysSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdCoordSysSchema {
    const ds = fromParentContainer?.Get(HdCoordSysSchemaTokens.coordSys)
    return new HdCoordSysSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getName(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdCoordSysSchemaTokens.name)
  }

  static getSchemaToken(): TfToken {
    return HdCoordSysSchemaTokens.coordSys
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdCoordSysSchema._defaultLocator ??= new HdDataSourceLocator(HdCoordSysSchema.getSchemaToken())
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    name?: HdTokenDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdCoordSysSchemaTokens.name]: name,
    })
  }
}

export namespace HdCoordSysSchema {
  /** HdCoordSysSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _name: HdTokenDataSource | undefined
    setName(name: HdTokenDataSource | undefined): this {
      this._name = name
      return this
    }
    build(): HdContainerDataSource {
      return HdCoordSysSchema.buildRetained(
        this._name,
      )
    }
  }
}

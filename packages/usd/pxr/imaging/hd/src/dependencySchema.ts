// Ported from OpenUSD 26.11.1: pxr/imaging/hd/dependencySchema.cpp,
//  pxr/imaging/hd/dependencySchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/dependencySchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the Dependency entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream dependencySchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdLocatorDataSource, HdPathDataSource } from './dataSourceTypeDefs.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'

/** dependencySchema.h TF_DECLARE_PUBLIC_TOKENS(HdDependencySchemaTokens) */
export const HdDependencySchemaTokens = TfMakeTokens({
  dependedOnPrimPath: 'dependedOnPrimPath',
  dependedOnDataSourceLocator: 'dependedOnDataSourceLocator',
  affectedDataSourceLocator: 'affectedDataSourceLocator',
})

export class HdDependencySchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  getDependedOnPrimPath(): HdPathDataSource | undefined {
    return this._getTypedDataSource<HdPathDataSource>(HdDependencySchemaTokens.dependedOnPrimPath)
  }

  getDependedOnDataSourceLocator(): HdLocatorDataSource | undefined {
    return this._getTypedDataSource<HdLocatorDataSource>(HdDependencySchemaTokens.dependedOnDataSourceLocator)
  }

  getAffectedDataSourceLocator(): HdLocatorDataSource | undefined {
    return this._getTypedDataSource<HdLocatorDataSource>(HdDependencySchemaTokens.affectedDataSourceLocator)
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    dependedOnPrimPath?: HdPathDataSource | undefined,
    dependedOnDataSourceLocator?: HdLocatorDataSource | undefined,
    affectedDataSourceLocator?: HdLocatorDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdDependencySchemaTokens.dependedOnPrimPath]: dependedOnPrimPath,
      [HdDependencySchemaTokens.dependedOnDataSourceLocator]: dependedOnDataSourceLocator,
      [HdDependencySchemaTokens.affectedDataSourceLocator]: affectedDataSourceLocator,
    })
  }
}

export namespace HdDependencySchema {
  /** HdDependencySchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _dependedOnPrimPath: HdPathDataSource | undefined
    private _dependedOnDataSourceLocator: HdLocatorDataSource | undefined
    private _affectedDataSourceLocator: HdLocatorDataSource | undefined
    setDependedOnPrimPath(dependedOnPrimPath: HdPathDataSource | undefined): this {
      this._dependedOnPrimPath = dependedOnPrimPath
      return this
    }
    setDependedOnDataSourceLocator(dependedOnDataSourceLocator: HdLocatorDataSource | undefined): this {
      this._dependedOnDataSourceLocator = dependedOnDataSourceLocator
      return this
    }
    setAffectedDataSourceLocator(affectedDataSourceLocator: HdLocatorDataSource | undefined): this {
      this._affectedDataSourceLocator = affectedDataSourceLocator
      return this
    }
    build(): HdContainerDataSource {
      return HdDependencySchema.buildRetained(
        this._dependedOnPrimPath,
        this._dependedOnDataSourceLocator,
        this._affectedDataSourceLocator,
      )
    }
  }
}

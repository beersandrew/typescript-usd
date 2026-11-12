// Ported from OpenUSD 26.11.1: pxr/imaging/hd/dependenciesSchema.cpp,
//  pxr/imaging/hd/dependenciesSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/dependenciesSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the Dependencies entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream dependenciesSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource, type HdDataSourceBase, HdRetainedContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import { HdDependencySchema } from './dependencySchema.ts'
import { HdSchema } from './schema.ts'

/** dependenciesSchema.h TF_DECLARE_PUBLIC_TOKENS(HdDependenciesSchemaTokens) */
export const HdDependenciesSchemaTokens = TfMakeTokens({
  __dependencies: '__dependencies',
})

export class HdDependenciesSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** dependenciesSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdDependenciesSchema {
    const ds = fromParentContainer?.Get(HdDependenciesSchemaTokens.__dependencies)
    return new HdDependenciesSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  // --(BEGIN CUSTOM CODE: Schema Methods)--

  /** dependenciesSchema.cpp GetEntries */
  getEntries(): Array<[TfToken, HdDependencySchema]> {
    const result: Array<[TfToken, HdDependencySchema]> = []
    if (!this._container) return result
    for (const childName of this._container.getNames()) {
      const child = this._container.Get(childName)
      if (child instanceof HdContainerDataSource) {
        result.push([childName as TfToken, new HdDependencySchema(child)])
      }
    }
    return result
  }
  // --(END CUSTOM CODE: Schema Methods)--

  static getSchemaToken(): TfToken {
    return HdDependenciesSchemaTokens.__dependencies
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdDependenciesSchema._defaultLocator ??= new HdDataSourceLocator(HdDependenciesSchema.getSchemaToken())
  }

  /** schemaClass.cpp:115-124 (the count argument is implied by the
   * array lengths, as in HdRetainedContainerDataSource.New of this port). */
  static buildRetained(
    names: readonly string[], values: readonly HdDataSourceBase[],
  ): HdContainerDataSource {
    return HdRetainedContainerDataSource.new([...names], [...values])
  }
}

// Ported from OpenUSD 26.11.1: pxr/imaging/hd/collectionsSchema.cpp,
//  pxr/imaging/hd/collectionsSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/collectionsSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the Collections entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream collectionsSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdCollectionSchema } from './collectionSchema.ts'
import { HdContainerDataSource, type HdDataSourceBase, HdRetainedContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import { HdSchema } from './schema.ts'

/** collectionsSchema.h TF_DECLARE_PUBLIC_TOKENS(HdCollectionsSchemaTokens) */
export const HdCollectionsSchemaTokens = TfMakeTokens({
  collections: 'collections',
})

/**
 * The {{ SCHEMA_CLASS_NAME }} specifies a wrapper container for collection
 * entries with the key being the collection name.
 */
export class HdCollectionsSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** collectionsSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdCollectionsSchema {
    const ds = fromParentContainer?.Get(HdCollectionsSchemaTokens.collections)
    return new HdCollectionsSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getCollectionNames(): TfToken[] {
    return (this._container?.getNames() ?? []) as TfToken[]
  }

  getCollection(name: string): HdCollectionSchema {
    return new HdCollectionSchema(this._getContainerDataSource(name))
  }

  static getSchemaToken(): TfToken {
    return HdCollectionsSchemaTokens.collections
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdCollectionsSchema._defaultLocator ??= new HdDataSourceLocator(HdCollectionsSchema.getSchemaToken())
  }

  /** schemaClass.cpp:115-124 (the count argument is implied by the
   * array lengths, as in HdRetainedContainerDataSource.New of this port). */
  static buildRetained(
    names: readonly string[], values: readonly HdDataSourceBase[],
  ): HdContainerDataSource {
    return HdRetainedContainerDataSource.new([...names], [...values])
  }
}

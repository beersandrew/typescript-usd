// Ported from OpenUSD 26.11.1: pxr/imaging/hd/collectionSchema.cpp,
//  pxr/imaging/hd/collectionSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/collectionSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the Collection entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream collectionSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdPathExpressionDataSource } from './dataSourceTypeDefs.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'

/** collectionSchema.h TF_DECLARE_PUBLIC_TOKENS(HdCollectionSchemaTokens) */
export const HdCollectionSchemaTokens = TfMakeTokens({
  collection: 'collection',
  membershipExpression: 'membershipExpression',
})

export class HdCollectionSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** collectionSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdCollectionSchema {
    const ds = fromParentContainer?.Get(HdCollectionSchemaTokens.collection)
    return new HdCollectionSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getMembershipExpression(): HdPathExpressionDataSource | undefined {
    return this._getTypedDataSource<HdPathExpressionDataSource>(HdCollectionSchemaTokens.membershipExpression)
  }

  static getSchemaToken(): TfToken {
    return HdCollectionSchemaTokens.collection
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdCollectionSchema._defaultLocator ??= new HdDataSourceLocator(HdCollectionSchema.getSchemaToken())
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    membershipExpression?: HdPathExpressionDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdCollectionSchemaTokens.membershipExpression]: membershipExpression,
    })
  }
}

export namespace HdCollectionSchema {
  /** HdCollectionSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _membershipExpression: HdPathExpressionDataSource | undefined
    setMembershipExpression(membershipExpression: HdPathExpressionDataSource | undefined): this {
      this._membershipExpression = membershipExpression
      return this
    }
    build(): HdContainerDataSource {
      return HdCollectionSchema.buildRetained(
        this._membershipExpression,
      )
    }
  }
}

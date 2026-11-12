// Ported from OpenUSD 26.11.1: pxr/imaging/hd/materialConnectionSchema.cpp,
//  pxr/imaging/hd/materialConnectionSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/materialConnectionSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the MaterialConnection entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream materialConnectionSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdTokenDataSource } from './dataSourceTypeDefs.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'

/** materialConnectionSchema.h TF_DECLARE_PUBLIC_TOKENS(HdMaterialConnectionSchemaTokens) */
export const HdMaterialConnectionSchemaTokens = TfMakeTokens({
  upstreamNodePath: 'upstreamNodePath',
  upstreamNodeOutputName: 'upstreamNodeOutputName',
})

/**
 * The MaterialConnection schema defines an upstream connected node and
 * output.
 *
 * See MaterialNode schema's documentation on its 'inputConnections' member
 * for an example.
 */
export class HdMaterialConnectionSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  getUpstreamNodePath(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdMaterialConnectionSchemaTokens.upstreamNodePath)
  }

  getUpstreamNodeOutputName(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdMaterialConnectionSchemaTokens.upstreamNodeOutputName)
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    upstreamNodePath?: HdTokenDataSource | undefined,
    upstreamNodeOutputName?: HdTokenDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdMaterialConnectionSchemaTokens.upstreamNodePath]: upstreamNodePath,
      [HdMaterialConnectionSchemaTokens.upstreamNodeOutputName]: upstreamNodeOutputName,
    })
  }
}

export namespace HdMaterialConnectionSchema {
  /** HdMaterialConnectionSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _upstreamNodePath: HdTokenDataSource | undefined
    private _upstreamNodeOutputName: HdTokenDataSource | undefined
    setUpstreamNodePath(upstreamNodePath: HdTokenDataSource | undefined): this {
      this._upstreamNodePath = upstreamNodePath
      return this
    }
    setUpstreamNodeOutputName(upstreamNodeOutputName: HdTokenDataSource | undefined): this {
      this._upstreamNodeOutputName = upstreamNodeOutputName
      return this
    }
    build(): HdContainerDataSource {
      return HdMaterialConnectionSchema.buildRetained(
        this._upstreamNodePath,
        this._upstreamNodeOutputName,
      )
    }
  }
}

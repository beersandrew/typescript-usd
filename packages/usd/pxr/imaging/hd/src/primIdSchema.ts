// Ported from OpenUSD 26.11.1: pxr/imaging/hd/primIdSchema.cpp,
//  pxr/imaging/hd/primIdSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/primIdSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the PrimId entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream primIdSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'

// --(BEGIN CUSTOM CODE: Declares)--
// primIdSchema.h Declares: `using HdPrimIdDataSource = HdTypedSampledDataSource<uint32_t>;`
import type { HdTypedSampledDataSource } from './dataSource.ts'
export type HdPrimIdDataSource = HdTypedSampledDataSource<number>
// --(END CUSTOM CODE: Declares)--

/** primIdSchema.h TF_DECLARE_PUBLIC_TOKENS(HdPrimIdSchemaTokens) */
export const HdPrimIdSchemaTokens = TfMakeTokens({
  primId: 'primId',
})

/**
 * Unique id assigned to all imageable prims. Inverse map is in SceneGlobals.
 * For example, these can be assigned by the HdsiPrimIdSceneIndex and used for
 * an Id buffer for picking.
 */
export class HdPrimIdSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** primIdSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdPrimIdSchema {
    const ds = fromParentContainer?.Get(HdPrimIdSchemaTokens.primId)
    return new HdPrimIdSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getPrimId(): HdPrimIdDataSource | undefined {
    return this._getTypedDataSource<HdPrimIdDataSource>(HdPrimIdSchemaTokens.primId)
  }

  static getSchemaToken(): TfToken {
    return HdPrimIdSchemaTokens.primId
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdPrimIdSchema._defaultLocator ??= new HdDataSourceLocator(HdPrimIdSchema.getSchemaToken())
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    primId?: HdPrimIdDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdPrimIdSchemaTokens.primId]: primId,
    })
  }
}

export namespace HdPrimIdSchema {
  /** HdPrimIdSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _primId: HdPrimIdDataSource | undefined
    setPrimId(primId: HdPrimIdDataSource | undefined): this {
      this._primId = primId
      return this
    }
    build(): HdContainerDataSource {
      return HdPrimIdSchema.buildRetained(
        this._primId,
      )
    }
  }
}

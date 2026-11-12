// Ported from OpenUSD 26.11.1: pxr/imaging/hd/xformSchema.cpp,
//  pxr/imaging/hd/xformSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/xformSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the Xform entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream xformSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdBoolDataSource, HdMatrixDataSource } from './dataSourceTypeDefs.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'

/** xformSchema.h TF_DECLARE_PUBLIC_TOKENS(HdXformSchemaTokens) */
export const HdXformSchemaTokens = TfMakeTokens({
  xform: 'xform',
  matrix: 'matrix',
  resetXformStack: 'resetXformStack',
})

export class HdXformSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** xformSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdXformSchema {
    const ds = fromParentContainer?.Get(HdXformSchemaTokens.xform)
    return new HdXformSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getMatrix(): HdMatrixDataSource | undefined {
    return this._getTypedDataSource<HdMatrixDataSource>(HdXformSchemaTokens.matrix)
  }

  /**
   * The "resetXformStack" flag tells consumers that this transform doesn't
   * inherit from the parent prim's transform.
   */
  getResetXformStack(): HdBoolDataSource | undefined {
    return this._getTypedDataSource<HdBoolDataSource>(HdXformSchemaTokens.resetXformStack)
  }

  static getSchemaToken(): TfToken {
    return HdXformSchemaTokens.xform
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdXformSchema._defaultLocator ??= new HdDataSourceLocator(HdXformSchema.getSchemaToken())
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    matrix?: HdMatrixDataSource | undefined,
    resetXformStack?: HdBoolDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdXformSchemaTokens.matrix]: matrix,
      [HdXformSchemaTokens.resetXformStack]: resetXformStack,
    })
  }
}

export namespace HdXformSchema {
  /** HdXformSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _matrix: HdMatrixDataSource | undefined
    private _resetXformStack: HdBoolDataSource | undefined
    setMatrix(matrix: HdMatrixDataSource | undefined): this {
      this._matrix = matrix
      return this
    }
    setResetXformStack(resetXformStack: HdBoolDataSource | undefined): this {
      this._resetXformStack = resetXformStack
      return this
    }
    build(): HdContainerDataSource {
      return HdXformSchema.buildRetained(
        this._matrix,
        this._resetXformStack,
      )
    }
  }
}

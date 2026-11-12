// Ported from OpenUSD 26.11.1: pxr/imaging/hd/cubeSchema.cpp,
//  pxr/imaging/hd/cubeSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/cubeSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the Cube entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream cubeSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdDoubleDataSource } from './dataSourceTypeDefs.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'

/** cubeSchema.h TF_DECLARE_PUBLIC_TOKENS(HdCubeSchemaTokens) */
export const HdCubeSchemaTokens = TfMakeTokens({
  cube: 'cube',
  size: 'size',
})

export class HdCubeSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** cubeSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdCubeSchema {
    const ds = fromParentContainer?.Get(HdCubeSchemaTokens.cube)
    return new HdCubeSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getSize(): HdDoubleDataSource | undefined {
    return this._getTypedDataSource<HdDoubleDataSource>(HdCubeSchemaTokens.size)
  }

  static getSchemaToken(): TfToken {
    return HdCubeSchemaTokens.cube
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdCubeSchema._defaultLocator ??= new HdDataSourceLocator(HdCubeSchema.getSchemaToken())
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    size?: HdDoubleDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdCubeSchemaTokens.size]: size,
    })
  }
}

export namespace HdCubeSchema {
  /** HdCubeSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _size: HdDoubleDataSource | undefined
    setSize(size: HdDoubleDataSource | undefined): this {
      this._size = size
      return this
    }
    build(): HdContainerDataSource {
      return HdCubeSchema.buildRetained(
        this._size,
      )
    }
  }
}

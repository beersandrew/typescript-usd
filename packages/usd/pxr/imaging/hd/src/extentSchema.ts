// Ported from OpenUSD 26.11.1: pxr/imaging/hd/extentSchema.cpp,
//  pxr/imaging/hd/extentSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/extentSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the Extent entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream extentSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdVec3dDataSource } from './dataSourceTypeDefs.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'

/** extentSchema.h TF_DECLARE_PUBLIC_TOKENS(HdExtentSchemaTokens) */
export const HdExtentSchemaTokens = TfMakeTokens({
  extent: 'extent',
  min: 'min',
  max: 'max',
})

export class HdExtentSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** extentSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdExtentSchema {
    const ds = fromParentContainer?.Get(HdExtentSchemaTokens.extent)
    return new HdExtentSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getMin(): HdVec3dDataSource | undefined {
    return this._getTypedDataSource<HdVec3dDataSource>(HdExtentSchemaTokens.min)
  }

  getMax(): HdVec3dDataSource | undefined {
    return this._getTypedDataSource<HdVec3dDataSource>(HdExtentSchemaTokens.max)
  }

  static getSchemaToken(): TfToken {
    return HdExtentSchemaTokens.extent
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdExtentSchema._defaultLocator ??= new HdDataSourceLocator(HdExtentSchema.getSchemaToken())
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    min?: HdVec3dDataSource | undefined,
    max?: HdVec3dDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdExtentSchemaTokens.min]: min,
      [HdExtentSchemaTokens.max]: max,
    })
  }
}

export namespace HdExtentSchema {
  /** HdExtentSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _min: HdVec3dDataSource | undefined
    private _max: HdVec3dDataSource | undefined
    setMin(min: HdVec3dDataSource | undefined): this {
      this._min = min
      return this
    }
    setMax(max: HdVec3dDataSource | undefined): this {
      this._max = max
      return this
    }
    build(): HdContainerDataSource {
      return HdExtentSchema.buildRetained(
        this._min,
        this._max,
      )
    }
  }
}

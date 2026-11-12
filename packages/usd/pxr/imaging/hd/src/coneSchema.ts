// Ported from OpenUSD 26.11.1: pxr/imaging/hd/coneSchema.cpp,
//  pxr/imaging/hd/coneSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/coneSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the Cone entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream coneSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource, HdRetainedTypedSampledDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdDoubleDataSource, HdTokenDataSource } from './dataSourceTypeDefs.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'

/** coneSchema.h TF_DECLARE_PUBLIC_TOKENS(HdConeSchemaTokens) */
export const HdConeSchemaTokens = TfMakeTokens({
  cone: 'cone',
  height: 'height',
  radius: 'radius',
  axis: 'axis',
  X: 'X',
  Y: 'Y',
  Z: 'Z',
})

export class HdConeSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** coneSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdConeSchema {
    const ds = fromParentContainer?.Get(HdConeSchemaTokens.cone)
    return new HdConeSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getHeight(): HdDoubleDataSource | undefined {
    return this._getTypedDataSource<HdDoubleDataSource>(HdConeSchemaTokens.height)
  }

  getRadius(): HdDoubleDataSource | undefined {
    return this._getTypedDataSource<HdDoubleDataSource>(HdConeSchemaTokens.radius)
  }

  getAxis(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdConeSchemaTokens.axis)
  }

  static getSchemaToken(): TfToken {
    return HdConeSchemaTokens.cone
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdConeSchema._defaultLocator ??= new HdDataSourceLocator(HdConeSchema.getSchemaToken())
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    height?: HdDoubleDataSource | undefined,
    radius?: HdDoubleDataSource | undefined,
    axis?: HdTokenDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdConeSchemaTokens.height]: height,
      [HdConeSchemaTokens.radius]: radius,
      [HdConeSchemaTokens.axis]: axis,
    })
  }

  private static _axisDataSources: Map<string, HdTokenDataSource> | undefined
  /** Returns token data source for use as axis value; the values
   * X, Y, Z are stored statically and reused. */
  static buildAxisDataSource(axis: string): HdTokenDataSource {
    const known: readonly string[] = [HdConeSchemaTokens.X, HdConeSchemaTokens.Y, HdConeSchemaTokens.Z]
    if (known.includes(axis)) {
      const cache = HdConeSchema._axisDataSources ??= new Map()
      let ds = cache.get(axis)
      if (!ds) {
        ds = HdRetainedTypedSampledDataSource.new<string>(axis)
        cache.set(axis, ds)
      }
      return ds
    }
    // fallback for unknown token
    return HdRetainedTypedSampledDataSource.new<string>(axis)
  }
}

export namespace HdConeSchema {
  /** HdConeSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _height: HdDoubleDataSource | undefined
    private _radius: HdDoubleDataSource | undefined
    private _axis: HdTokenDataSource | undefined
    setHeight(height: HdDoubleDataSource | undefined): this {
      this._height = height
      return this
    }
    setRadius(radius: HdDoubleDataSource | undefined): this {
      this._radius = radius
      return this
    }
    setAxis(axis: HdTokenDataSource | undefined): this {
      this._axis = axis
      return this
    }
    build(): HdContainerDataSource {
      return HdConeSchema.buildRetained(
        this._height,
        this._radius,
        this._axis,
      )
    }
  }
}

// Ported from OpenUSD 26.11.1: pxr/imaging/hd/planeSchema.cpp,
//  pxr/imaging/hd/planeSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/planeSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the Plane entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Written by hand in the
// style of coneSchema.ts; planeSchema has no custom code sections.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource, HdRetainedTypedSampledDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdBoolDataSource, HdDoubleDataSource, HdTokenDataSource } from './dataSourceTypeDefs.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'

/** planeSchema.h TF_DECLARE_PUBLIC_TOKENS(HdPlaneSchemaTokens) */
export const HdPlaneSchemaTokens = TfMakeTokens({
  plane: 'plane',
  doubleSided: 'doubleSided',
  axis: 'axis',
  length: 'length',
  width: 'width',
  X: 'X',
  Y: 'Y',
  Z: 'Z',
})

export class HdPlaneSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** planeSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdPlaneSchema {
    const ds = fromParentContainer?.Get(HdPlaneSchemaTokens.plane)
    return new HdPlaneSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getDoubleSided(): HdBoolDataSource | undefined {
    return this._getTypedDataSource<HdBoolDataSource>(HdPlaneSchemaTokens.doubleSided)
  }

  getAxis(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdPlaneSchemaTokens.axis)
  }

  GetLength(): HdDoubleDataSource | undefined {
    return this._getTypedDataSource<HdDoubleDataSource>(HdPlaneSchemaTokens.length)
  }

  getWidth(): HdDoubleDataSource | undefined {
    return this._getTypedDataSource<HdDoubleDataSource>(HdPlaneSchemaTokens.width)
  }

  static getSchemaToken(): TfToken {
    return HdPlaneSchemaTokens.plane
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdPlaneSchema._defaultLocator ??= new HdDataSourceLocator(HdPlaneSchema.getSchemaToken())
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    doubleSided?: HdBoolDataSource | undefined,
    axis?: HdTokenDataSource | undefined,
    length?: HdDoubleDataSource | undefined,
    width?: HdDoubleDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdPlaneSchemaTokens.doubleSided]: doubleSided,
      [HdPlaneSchemaTokens.axis]: axis,
      [HdPlaneSchemaTokens.length]: length,
      [HdPlaneSchemaTokens.width]: width,
    })
  }

  private static _axisDataSources: Map<string, HdTokenDataSource> | undefined
  /** Returns token data source for use as axis value; the values
   * X, Y, Z are stored statically and reused. */
  static buildAxisDataSource(axis: string): HdTokenDataSource {
    const known: readonly string[] = [HdPlaneSchemaTokens.X, HdPlaneSchemaTokens.Y, HdPlaneSchemaTokens.Z]
    if (known.includes(axis)) {
      const cache = HdPlaneSchema._axisDataSources ??= new Map()
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

export namespace HdPlaneSchema {
  /** HdPlaneSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _doubleSided: HdBoolDataSource | undefined
    private _axis: HdTokenDataSource | undefined
    private _length: HdDoubleDataSource | undefined
    private _width: HdDoubleDataSource | undefined
    setDoubleSided(doubleSided: HdBoolDataSource | undefined): this {
      this._doubleSided = doubleSided
      return this
    }
    setAxis(axis: HdTokenDataSource | undefined): this {
      this._axis = axis
      return this
    }
    setLength(length: HdDoubleDataSource | undefined): this {
      this._length = length
      return this
    }
    setWidth(width: HdDoubleDataSource | undefined): this {
      this._width = width
      return this
    }
    build(): HdContainerDataSource {
      return HdPlaneSchema.buildRetained(
        this._doubleSided,
        this._axis,
        this._length,
        this._width,
      )
    }
  }
}

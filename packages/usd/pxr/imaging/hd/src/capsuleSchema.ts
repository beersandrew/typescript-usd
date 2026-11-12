// Ported from OpenUSD 26.11.1: pxr/imaging/hd/capsuleSchema.cpp,
//  pxr/imaging/hd/capsuleSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/capsuleSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the Capsule entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream capsuleSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource, HdRetainedTypedSampledDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdDoubleDataSource, HdTokenDataSource } from './dataSourceTypeDefs.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'

/** capsuleSchema.h TF_DECLARE_PUBLIC_TOKENS(HdCapsuleSchemaTokens) */
export const HdCapsuleSchemaTokens = TfMakeTokens({
  capsule: 'capsule',
  height: 'height',
  radius: 'radius',
  radiusTop: 'radiusTop',
  radiusBottom: 'radiusBottom',
  axis: 'axis',
  X: 'X',
  Y: 'Y',
  Z: 'Z',
})

export class HdCapsuleSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** capsuleSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdCapsuleSchema {
    const ds = fromParentContainer?.Get(HdCapsuleSchemaTokens.capsule)
    return new HdCapsuleSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getHeight(): HdDoubleDataSource | undefined {
    return this._getTypedDataSource<HdDoubleDataSource>(HdCapsuleSchemaTokens.height)
  }

  /**
   * Deprecated. Only use if no radiusTop or radiusBottom data source. Comes
   * from UsdGeom Capsule which has been deprecated in favor of Capsule_1.
   */
  getRadius(): HdDoubleDataSource | undefined {
    return this._getTypedDataSource<HdDoubleDataSource>(HdCapsuleSchemaTokens.radius)
  }

  getRadiusTop(): HdDoubleDataSource | undefined {
    return this._getTypedDataSource<HdDoubleDataSource>(HdCapsuleSchemaTokens.radiusTop)
  }

  getRadiusBottom(): HdDoubleDataSource | undefined {
    return this._getTypedDataSource<HdDoubleDataSource>(HdCapsuleSchemaTokens.radiusBottom)
  }

  getAxis(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdCapsuleSchemaTokens.axis)
  }

  static getSchemaToken(): TfToken {
    return HdCapsuleSchemaTokens.capsule
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdCapsuleSchema._defaultLocator ??= new HdDataSourceLocator(HdCapsuleSchema.getSchemaToken())
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    height?: HdDoubleDataSource | undefined,
    radius?: HdDoubleDataSource | undefined,
    radiusTop?: HdDoubleDataSource | undefined,
    radiusBottom?: HdDoubleDataSource | undefined,
    axis?: HdTokenDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdCapsuleSchemaTokens.height]: height,
      [HdCapsuleSchemaTokens.radius]: radius,
      [HdCapsuleSchemaTokens.radiusTop]: radiusTop,
      [HdCapsuleSchemaTokens.radiusBottom]: radiusBottom,
      [HdCapsuleSchemaTokens.axis]: axis,
    })
  }

  private static _axisDataSources: Map<string, HdTokenDataSource> | undefined
  /** Returns token data source for use as axis value; the values
   * X, Y, Z are stored statically and reused. */
  static buildAxisDataSource(axis: string): HdTokenDataSource {
    const known: readonly string[] = [HdCapsuleSchemaTokens.X, HdCapsuleSchemaTokens.Y, HdCapsuleSchemaTokens.Z]
    if (known.includes(axis)) {
      const cache = HdCapsuleSchema._axisDataSources ??= new Map()
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

export namespace HdCapsuleSchema {
  /** HdCapsuleSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _height: HdDoubleDataSource | undefined
    private _radius: HdDoubleDataSource | undefined
    private _radiusTop: HdDoubleDataSource | undefined
    private _radiusBottom: HdDoubleDataSource | undefined
    private _axis: HdTokenDataSource | undefined
    setHeight(height: HdDoubleDataSource | undefined): this {
      this._height = height
      return this
    }
    setRadius(radius: HdDoubleDataSource | undefined): this {
      this._radius = radius
      return this
    }
    setRadiusTop(radiusTop: HdDoubleDataSource | undefined): this {
      this._radiusTop = radiusTop
      return this
    }
    setRadiusBottom(radiusBottom: HdDoubleDataSource | undefined): this {
      this._radiusBottom = radiusBottom
      return this
    }
    setAxis(axis: HdTokenDataSource | undefined): this {
      this._axis = axis
      return this
    }
    build(): HdContainerDataSource {
      return HdCapsuleSchema.buildRetained(
        this._height,
        this._radius,
        this._radiusTop,
        this._radiusBottom,
        this._axis,
      )
    }
  }
}

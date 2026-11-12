// Ported from OpenUSD 26.11.1: pxr/imaging/hd/cylinderSchema.cpp,
//  pxr/imaging/hd/cylinderSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/cylinderSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the Cylinder entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream cylinderSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource, HdRetainedTypedSampledDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdDoubleDataSource, HdTokenDataSource } from './dataSourceTypeDefs.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'

/** cylinderSchema.h TF_DECLARE_PUBLIC_TOKENS(HdCylinderSchemaTokens) */
export const HdCylinderSchemaTokens = TfMakeTokens({
  cylinder: 'cylinder',
  height: 'height',
  radius: 'radius',
  radiusTop: 'radiusTop',
  radiusBottom: 'radiusBottom',
  axis: 'axis',
  X: 'X',
  Y: 'Y',
  Z: 'Z',
})

export class HdCylinderSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** cylinderSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdCylinderSchema {
    const ds = fromParentContainer?.Get(HdCylinderSchemaTokens.cylinder)
    return new HdCylinderSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getHeight(): HdDoubleDataSource | undefined {
    return this._getTypedDataSource<HdDoubleDataSource>(HdCylinderSchemaTokens.height)
  }

  /**
   * Deprecated. Only use if no radiusTop or radiusBottom data source. Comes
   * from UsdGeom Cylinder which has been deprecated in favor of Cylinder_1.
   */
  getRadius(): HdDoubleDataSource | undefined {
    return this._getTypedDataSource<HdDoubleDataSource>(HdCylinderSchemaTokens.radius)
  }

  getRadiusTop(): HdDoubleDataSource | undefined {
    return this._getTypedDataSource<HdDoubleDataSource>(HdCylinderSchemaTokens.radiusTop)
  }

  getRadiusBottom(): HdDoubleDataSource | undefined {
    return this._getTypedDataSource<HdDoubleDataSource>(HdCylinderSchemaTokens.radiusBottom)
  }

  getAxis(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdCylinderSchemaTokens.axis)
  }

  static getSchemaToken(): TfToken {
    return HdCylinderSchemaTokens.cylinder
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdCylinderSchema._defaultLocator ??= new HdDataSourceLocator(HdCylinderSchema.getSchemaToken())
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
      [HdCylinderSchemaTokens.height]: height,
      [HdCylinderSchemaTokens.radius]: radius,
      [HdCylinderSchemaTokens.radiusTop]: radiusTop,
      [HdCylinderSchemaTokens.radiusBottom]: radiusBottom,
      [HdCylinderSchemaTokens.axis]: axis,
    })
  }

  private static _axisDataSources: Map<string, HdTokenDataSource> | undefined
  /** Returns token data source for use as axis value; the values
   * X, Y, Z are stored statically and reused. */
  static buildAxisDataSource(axis: string): HdTokenDataSource {
    const known: readonly string[] = [HdCylinderSchemaTokens.X, HdCylinderSchemaTokens.Y, HdCylinderSchemaTokens.Z]
    if (known.includes(axis)) {
      const cache = HdCylinderSchema._axisDataSources ??= new Map()
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

export namespace HdCylinderSchema {
  /** HdCylinderSchema::Builder (schemaClass.cpp:150-166) */
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
      return HdCylinderSchema.buildRetained(
        this._height,
        this._radius,
        this._radiusTop,
        this._radiusBottom,
        this._axis,
      )
    }
  }
}

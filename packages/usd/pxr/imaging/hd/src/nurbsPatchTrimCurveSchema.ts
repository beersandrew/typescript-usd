// Ported from OpenUSD 26.11.1: pxr/imaging/hd/nurbsPatchTrimCurveSchema.cpp,
//  pxr/imaging/hd/nurbsPatchTrimCurveSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/nurbsPatchTrimCurveSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the NurbsPatchTrimCurve entry of pxr/imaging/hd/hdSchemaDefs.py:187-203 with the
// codegenTemplates/schemaClass.{h,cpp} templates.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdDoubleArrayDataSource, HdIntArrayDataSource, HdVec2dArrayDataSource, HdVec3dArrayDataSource } from './dataSourceTypeDefs.ts'
import { HdNurbsPatchSchema } from './nurbsPatchSchema.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'

/** nurbsPatchTrimCurveSchema.h TF_DECLARE_PUBLIC_TOKENS(HdNurbsPatchTrimCurveSchemaTokens) */
export const HdNurbsPatchTrimCurveSchemaTokens = TfMakeTokens({
  trimCurve: 'trimCurve',
  counts: 'counts',
  orders: 'orders',
  vertexCounts: 'vertexCounts',
  knots: 'knots',
  ranges: 'ranges',
  points: 'points',
})

export class HdNurbsPatchTrimCurveSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** nurbsPatchTrimCurveSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdNurbsPatchTrimCurveSchema {
    const ds = fromParentContainer?.Get(HdNurbsPatchTrimCurveSchemaTokens.trimCurve)
    return new HdNurbsPatchTrimCurveSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getCounts(): HdIntArrayDataSource | undefined {
    return this._getTypedDataSource<HdIntArrayDataSource>(HdNurbsPatchTrimCurveSchemaTokens.counts)
  }

  getOrders(): HdIntArrayDataSource | undefined {
    return this._getTypedDataSource<HdIntArrayDataSource>(HdNurbsPatchTrimCurveSchemaTokens.orders)
  }

  getVertexCounts(): HdIntArrayDataSource | undefined {
    return this._getTypedDataSource<HdIntArrayDataSource>(HdNurbsPatchTrimCurveSchemaTokens.vertexCounts)
  }

  getKnots(): HdDoubleArrayDataSource | undefined {
    return this._getTypedDataSource<HdDoubleArrayDataSource>(HdNurbsPatchTrimCurveSchemaTokens.knots)
  }

  getRanges(): HdVec2dArrayDataSource | undefined {
    return this._getTypedDataSource<HdVec2dArrayDataSource>(HdNurbsPatchTrimCurveSchemaTokens.ranges)
  }

  getPoints(): HdVec3dArrayDataSource | undefined {
    return this._getTypedDataSource<HdVec3dArrayDataSource>(HdNurbsPatchTrimCurveSchemaTokens.points)
  }

  static getSchemaToken(): TfToken {
    return HdNurbsPatchTrimCurveSchemaTokens.trimCurve
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdNurbsPatchTrimCurveSchema._defaultLocator ??= HdNurbsPatchSchema.getDefaultLocator().append(HdNurbsPatchTrimCurveSchema.getSchemaToken())
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    counts?: HdIntArrayDataSource | undefined,
    orders?: HdIntArrayDataSource | undefined,
    vertexCounts?: HdIntArrayDataSource | undefined,
    knots?: HdDoubleArrayDataSource | undefined,
    ranges?: HdVec2dArrayDataSource | undefined,
    points?: HdVec3dArrayDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdNurbsPatchTrimCurveSchemaTokens.counts]: counts,
      [HdNurbsPatchTrimCurveSchemaTokens.orders]: orders,
      [HdNurbsPatchTrimCurveSchemaTokens.vertexCounts]: vertexCounts,
      [HdNurbsPatchTrimCurveSchemaTokens.knots]: knots,
      [HdNurbsPatchTrimCurveSchemaTokens.ranges]: ranges,
      [HdNurbsPatchTrimCurveSchemaTokens.points]: points,
    })
  }
}

export namespace HdNurbsPatchTrimCurveSchema {
  /** HdNurbsPatchTrimCurveSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _counts: HdIntArrayDataSource | undefined
    private _orders: HdIntArrayDataSource | undefined
    private _vertexCounts: HdIntArrayDataSource | undefined
    private _knots: HdDoubleArrayDataSource | undefined
    private _ranges: HdVec2dArrayDataSource | undefined
    private _points: HdVec3dArrayDataSource | undefined
    setCounts(counts: HdIntArrayDataSource | undefined): this {
      this._counts = counts
      return this
    }
    setOrders(orders: HdIntArrayDataSource | undefined): this {
      this._orders = orders
      return this
    }
    setVertexCounts(vertexCounts: HdIntArrayDataSource | undefined): this {
      this._vertexCounts = vertexCounts
      return this
    }
    setKnots(knots: HdDoubleArrayDataSource | undefined): this {
      this._knots = knots
      return this
    }
    setRanges(ranges: HdVec2dArrayDataSource | undefined): this {
      this._ranges = ranges
      return this
    }
    setPoints(points: HdVec3dArrayDataSource | undefined): this {
      this._points = points
      return this
    }
    build(): HdContainerDataSource {
      return HdNurbsPatchTrimCurveSchema.buildRetained(
        this._counts,
        this._orders,
        this._vertexCounts,
        this._knots,
        this._ranges,
        this._points,
      )
    }
  }
}

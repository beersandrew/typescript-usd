// Ported from OpenUSD 26.11.1: pxr/imaging/hd/nurbsCurvesSchema.cpp,
//  pxr/imaging/hd/nurbsCurvesSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/nurbsCurvesSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the NurbsCurves entry of pxr/imaging/hd/hdSchemaDefs.py:241-251 with the
// codegenTemplates/schemaClass.{h,cpp} templates.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdDoubleArrayDataSource, HdIntArrayDataSource, HdVec2dArrayDataSource } from './dataSourceTypeDefs.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'

/** nurbsCurvesSchema.h TF_DECLARE_PUBLIC_TOKENS(HdNurbsCurvesSchemaTokens) */
export const HdNurbsCurvesSchemaTokens = TfMakeTokens({
  nurbsCurves: 'nurbsCurves',
  curveVertexCounts: 'curveVertexCounts',
  order: 'order',
  knots: 'knots',
  ranges: 'ranges',
})

export class HdNurbsCurvesSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** nurbsCurvesSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdNurbsCurvesSchema {
    const ds = fromParentContainer?.Get(HdNurbsCurvesSchemaTokens.nurbsCurves)
    return new HdNurbsCurvesSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getCurveVertexCounts(): HdIntArrayDataSource | undefined {
    return this._getTypedDataSource<HdIntArrayDataSource>(HdNurbsCurvesSchemaTokens.curveVertexCounts)
  }

  getOrder(): HdIntArrayDataSource | undefined {
    return this._getTypedDataSource<HdIntArrayDataSource>(HdNurbsCurvesSchemaTokens.order)
  }

  getKnots(): HdDoubleArrayDataSource | undefined {
    return this._getTypedDataSource<HdDoubleArrayDataSource>(HdNurbsCurvesSchemaTokens.knots)
  }

  getRanges(): HdVec2dArrayDataSource | undefined {
    return this._getTypedDataSource<HdVec2dArrayDataSource>(HdNurbsCurvesSchemaTokens.ranges)
  }

  static getSchemaToken(): TfToken {
    return HdNurbsCurvesSchemaTokens.nurbsCurves
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdNurbsCurvesSchema._defaultLocator ??= new HdDataSourceLocator(HdNurbsCurvesSchema.getSchemaToken())
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    curveVertexCounts?: HdIntArrayDataSource | undefined,
    order?: HdIntArrayDataSource | undefined,
    knots?: HdDoubleArrayDataSource | undefined,
    ranges?: HdVec2dArrayDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdNurbsCurvesSchemaTokens.curveVertexCounts]: curveVertexCounts,
      [HdNurbsCurvesSchemaTokens.order]: order,
      [HdNurbsCurvesSchemaTokens.knots]: knots,
      [HdNurbsCurvesSchemaTokens.ranges]: ranges,
    })
  }
}

export namespace HdNurbsCurvesSchema {
  /** HdNurbsCurvesSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _curveVertexCounts: HdIntArrayDataSource | undefined
    private _order: HdIntArrayDataSource | undefined
    private _knots: HdDoubleArrayDataSource | undefined
    private _ranges: HdVec2dArrayDataSource | undefined
    setCurveVertexCounts(curveVertexCounts: HdIntArrayDataSource | undefined): this {
      this._curveVertexCounts = curveVertexCounts
      return this
    }
    setOrder(order: HdIntArrayDataSource | undefined): this {
      this._order = order
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
    build(): HdContainerDataSource {
      return HdNurbsCurvesSchema.buildRetained(
        this._curveVertexCounts,
        this._order,
        this._knots,
        this._ranges,
      )
    }
  }
}

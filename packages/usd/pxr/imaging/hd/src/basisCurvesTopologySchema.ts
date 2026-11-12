// Ported from OpenUSD 26.11.1: pxr/imaging/hd/basisCurvesTopologySchema.cpp,
//  pxr/imaging/hd/basisCurvesTopologySchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/basisCurvesTopologySchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the BasisCurvesTopology entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream basisCurvesTopologySchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdBasisCurvesSchema } from './basisCurvesSchema.ts'
import { HdContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdIntArrayDataSource, HdTokenDataSource } from './dataSourceTypeDefs.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'

/** basisCurvesTopologySchema.h TF_DECLARE_PUBLIC_TOKENS(HdBasisCurvesTopologySchemaTokens) */
export const HdBasisCurvesTopologySchemaTokens = TfMakeTokens({
  topology: 'topology',
  curveVertexCounts: 'curveVertexCounts',
  curveIndices: 'curveIndices',
  basis: 'basis',
  type: 'type',
  wrap: 'wrap',
})

export class HdBasisCurvesTopologySchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** basisCurvesTopologySchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdBasisCurvesTopologySchema {
    const ds = fromParentContainer?.Get(HdBasisCurvesTopologySchemaTokens.topology)
    return new HdBasisCurvesTopologySchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getCurveVertexCounts(): HdIntArrayDataSource | undefined {
    return this._getTypedDataSource<HdIntArrayDataSource>(HdBasisCurvesTopologySchemaTokens.curveVertexCounts)
  }

  getCurveIndices(): HdIntArrayDataSource | undefined {
    return this._getTypedDataSource<HdIntArrayDataSource>(HdBasisCurvesTopologySchemaTokens.curveIndices)
  }

  getBasis(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdBasisCurvesTopologySchemaTokens.basis)
  }

  getType(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdBasisCurvesTopologySchemaTokens.type)
  }

  getWrap(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdBasisCurvesTopologySchemaTokens.wrap)
  }

  static getSchemaToken(): TfToken {
    return HdBasisCurvesTopologySchemaTokens.topology
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdBasisCurvesTopologySchema._defaultLocator ??= HdBasisCurvesSchema.getDefaultLocator().append(HdBasisCurvesTopologySchema.getSchemaToken())
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    curveVertexCounts?: HdIntArrayDataSource | undefined,
    curveIndices?: HdIntArrayDataSource | undefined,
    basis?: HdTokenDataSource | undefined,
    type?: HdTokenDataSource | undefined,
    wrap?: HdTokenDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdBasisCurvesTopologySchemaTokens.curveVertexCounts]: curveVertexCounts,
      [HdBasisCurvesTopologySchemaTokens.curveIndices]: curveIndices,
      [HdBasisCurvesTopologySchemaTokens.basis]: basis,
      [HdBasisCurvesTopologySchemaTokens.type]: type,
      [HdBasisCurvesTopologySchemaTokens.wrap]: wrap,
    })
  }
}

export namespace HdBasisCurvesTopologySchema {
  /** HdBasisCurvesTopologySchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _curveVertexCounts: HdIntArrayDataSource | undefined
    private _curveIndices: HdIntArrayDataSource | undefined
    private _basis: HdTokenDataSource | undefined
    private _type: HdTokenDataSource | undefined
    private _wrap: HdTokenDataSource | undefined
    setCurveVertexCounts(curveVertexCounts: HdIntArrayDataSource | undefined): this {
      this._curveVertexCounts = curveVertexCounts
      return this
    }
    setCurveIndices(curveIndices: HdIntArrayDataSource | undefined): this {
      this._curveIndices = curveIndices
      return this
    }
    setBasis(basis: HdTokenDataSource | undefined): this {
      this._basis = basis
      return this
    }
    setType(type: HdTokenDataSource | undefined): this {
      this._type = type
      return this
    }
    setWrap(wrap: HdTokenDataSource | undefined): this {
      this._wrap = wrap
      return this
    }
    build(): HdContainerDataSource {
      return HdBasisCurvesTopologySchema.buildRetained(
        this._curveVertexCounts,
        this._curveIndices,
        this._basis,
        this._type,
        this._wrap,
      )
    }
  }
}

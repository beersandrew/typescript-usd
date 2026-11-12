// Ported from OpenUSD 26.11.1: pxr/imaging/hd/nurbsPatchSchema.cpp,
//  pxr/imaging/hd/nurbsPatchSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/nurbsPatchSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the NurbsPatch entry of pxr/imaging/hd/hdSchemaDefs.py:158-185 with the
// codegenTemplates/schemaClass.{h,cpp} templates.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource, HdRetainedTypedSampledDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdBoolDataSource, HdDoubleArrayDataSource, HdIntDataSource, HdTokenDataSource, HdVec2dDataSource } from './dataSourceTypeDefs.ts'
import { HdNurbsPatchTrimCurveSchema } from './nurbsPatchTrimCurveSchema.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'

/** nurbsPatchSchema.h TF_DECLARE_PUBLIC_TOKENS(HdNurbsPatchSchemaTokens) */
export const HdNurbsPatchSchemaTokens = TfMakeTokens({
  nurbsPatch: 'nurbsPatch',
  uVertexCount: 'uVertexCount',
  vVertexCount: 'vVertexCount',
  uOrder: 'uOrder',
  vOrder: 'vOrder',
  uKnots: 'uKnots',
  vKnots: 'vKnots',
  uForm: 'uForm',
  vForm: 'vForm',
  uRange: 'uRange',
  vRange: 'vRange',
  trimCurve: 'trimCurve',
  orientation: 'orientation',
  doubleSided: 'doubleSided',
  open: 'open',
  closed: 'closed',
  periodic: 'periodic',
  leftHanded: 'leftHanded',
  rightHanded: 'rightHanded',
})

export class HdNurbsPatchSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** nurbsPatchSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdNurbsPatchSchema {
    const ds = fromParentContainer?.Get(HdNurbsPatchSchemaTokens.nurbsPatch)
    return new HdNurbsPatchSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getUVertexCount(): HdIntDataSource | undefined {
    return this._getTypedDataSource<HdIntDataSource>(HdNurbsPatchSchemaTokens.uVertexCount)
  }

  getVVertexCount(): HdIntDataSource | undefined {
    return this._getTypedDataSource<HdIntDataSource>(HdNurbsPatchSchemaTokens.vVertexCount)
  }

  getUOrder(): HdIntDataSource | undefined {
    return this._getTypedDataSource<HdIntDataSource>(HdNurbsPatchSchemaTokens.uOrder)
  }

  getVOrder(): HdIntDataSource | undefined {
    return this._getTypedDataSource<HdIntDataSource>(HdNurbsPatchSchemaTokens.vOrder)
  }

  getUKnots(): HdDoubleArrayDataSource | undefined {
    return this._getTypedDataSource<HdDoubleArrayDataSource>(HdNurbsPatchSchemaTokens.uKnots)
  }

  getVKnots(): HdDoubleArrayDataSource | undefined {
    return this._getTypedDataSource<HdDoubleArrayDataSource>(HdNurbsPatchSchemaTokens.vKnots)
  }

  getUForm(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdNurbsPatchSchemaTokens.uForm)
  }

  getVForm(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdNurbsPatchSchemaTokens.vForm)
  }

  getURange(): HdVec2dDataSource | undefined {
    return this._getTypedDataSource<HdVec2dDataSource>(HdNurbsPatchSchemaTokens.uRange)
  }

  getVRange(): HdVec2dDataSource | undefined {
    return this._getTypedDataSource<HdVec2dDataSource>(HdNurbsPatchSchemaTokens.vRange)
  }

  getTrimCurve(): HdNurbsPatchTrimCurveSchema {
    return new HdNurbsPatchTrimCurveSchema(this._getContainerDataSource(HdNurbsPatchSchemaTokens.trimCurve))
  }

  getOrientation(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdNurbsPatchSchemaTokens.orientation)
  }

  getDoubleSided(): HdBoolDataSource | undefined {
    return this._getTypedDataSource<HdBoolDataSource>(HdNurbsPatchSchemaTokens.doubleSided)
  }

  static getSchemaToken(): TfToken {
    return HdNurbsPatchSchemaTokens.nurbsPatch
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdNurbsPatchSchema._defaultLocator ??= new HdDataSourceLocator(HdNurbsPatchSchema.getSchemaToken())
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    uVertexCount?: HdIntDataSource | undefined,
    vVertexCount?: HdIntDataSource | undefined,
    uOrder?: HdIntDataSource | undefined,
    vOrder?: HdIntDataSource | undefined,
    uKnots?: HdDoubleArrayDataSource | undefined,
    vKnots?: HdDoubleArrayDataSource | undefined,
    uForm?: HdTokenDataSource | undefined,
    vForm?: HdTokenDataSource | undefined,
    uRange?: HdVec2dDataSource | undefined,
    vRange?: HdVec2dDataSource | undefined,
    trimCurve?: HdContainerDataSource | undefined,
    orientation?: HdTokenDataSource | undefined,
    doubleSided?: HdBoolDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdNurbsPatchSchemaTokens.uVertexCount]: uVertexCount,
      [HdNurbsPatchSchemaTokens.vVertexCount]: vVertexCount,
      [HdNurbsPatchSchemaTokens.uOrder]: uOrder,
      [HdNurbsPatchSchemaTokens.vOrder]: vOrder,
      [HdNurbsPatchSchemaTokens.uKnots]: uKnots,
      [HdNurbsPatchSchemaTokens.vKnots]: vKnots,
      [HdNurbsPatchSchemaTokens.uForm]: uForm,
      [HdNurbsPatchSchemaTokens.vForm]: vForm,
      [HdNurbsPatchSchemaTokens.uRange]: uRange,
      [HdNurbsPatchSchemaTokens.vRange]: vRange,
      [HdNurbsPatchSchemaTokens.trimCurve]: trimCurve,
      [HdNurbsPatchSchemaTokens.orientation]: orientation,
      [HdNurbsPatchSchemaTokens.doubleSided]: doubleSided,
    })
  }

  private static _formDataSources: Map<string, HdTokenDataSource> | undefined
  /** Returns token data source for use as form value; the values
   * open, closed, periodic are stored statically and reused. */
  static buildFormDataSource(form: string): HdTokenDataSource {
    const known: readonly string[] = [HdNurbsPatchSchemaTokens.open, HdNurbsPatchSchemaTokens.closed, HdNurbsPatchSchemaTokens.periodic]
    if (known.includes(form)) {
      const cache = HdNurbsPatchSchema._formDataSources ??= new Map()
      let ds = cache.get(form)
      if (!ds) {
        ds = HdRetainedTypedSampledDataSource.new<string>(form)
        cache.set(form, ds)
      }
      return ds
    }
    // fallback for unknown token
    return HdRetainedTypedSampledDataSource.new<string>(form)
  }

  private static _orientationDataSources: Map<string, HdTokenDataSource> | undefined
  /** Returns token data source for use as orientation value; the values
   * leftHanded, rightHanded are stored statically and reused. */
  static buildOrientationDataSource(orientation: string): HdTokenDataSource {
    const known: readonly string[] = [HdNurbsPatchSchemaTokens.leftHanded, HdNurbsPatchSchemaTokens.rightHanded]
    if (known.includes(orientation)) {
      const cache = HdNurbsPatchSchema._orientationDataSources ??= new Map()
      let ds = cache.get(orientation)
      if (!ds) {
        ds = HdRetainedTypedSampledDataSource.new<string>(orientation)
        cache.set(orientation, ds)
      }
      return ds
    }
    // fallback for unknown token
    return HdRetainedTypedSampledDataSource.new<string>(orientation)
  }
}

export namespace HdNurbsPatchSchema {
  /** HdNurbsPatchSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _uVertexCount: HdIntDataSource | undefined
    private _vVertexCount: HdIntDataSource | undefined
    private _uOrder: HdIntDataSource | undefined
    private _vOrder: HdIntDataSource | undefined
    private _uKnots: HdDoubleArrayDataSource | undefined
    private _vKnots: HdDoubleArrayDataSource | undefined
    private _uForm: HdTokenDataSource | undefined
    private _vForm: HdTokenDataSource | undefined
    private _uRange: HdVec2dDataSource | undefined
    private _vRange: HdVec2dDataSource | undefined
    private _trimCurve: HdContainerDataSource | undefined
    private _orientation: HdTokenDataSource | undefined
    private _doubleSided: HdBoolDataSource | undefined
    setUVertexCount(uVertexCount: HdIntDataSource | undefined): this {
      this._uVertexCount = uVertexCount
      return this
    }
    setVVertexCount(vVertexCount: HdIntDataSource | undefined): this {
      this._vVertexCount = vVertexCount
      return this
    }
    setUOrder(uOrder: HdIntDataSource | undefined): this {
      this._uOrder = uOrder
      return this
    }
    setVOrder(vOrder: HdIntDataSource | undefined): this {
      this._vOrder = vOrder
      return this
    }
    setUKnots(uKnots: HdDoubleArrayDataSource | undefined): this {
      this._uKnots = uKnots
      return this
    }
    setVKnots(vKnots: HdDoubleArrayDataSource | undefined): this {
      this._vKnots = vKnots
      return this
    }
    setUForm(uForm: HdTokenDataSource | undefined): this {
      this._uForm = uForm
      return this
    }
    setVForm(vForm: HdTokenDataSource | undefined): this {
      this._vForm = vForm
      return this
    }
    setURange(uRange: HdVec2dDataSource | undefined): this {
      this._uRange = uRange
      return this
    }
    setVRange(vRange: HdVec2dDataSource | undefined): this {
      this._vRange = vRange
      return this
    }
    setTrimCurve(trimCurve: HdContainerDataSource | undefined): this {
      this._trimCurve = trimCurve
      return this
    }
    setOrientation(orientation: HdTokenDataSource | undefined): this {
      this._orientation = orientation
      return this
    }
    setDoubleSided(doubleSided: HdBoolDataSource | undefined): this {
      this._doubleSided = doubleSided
      return this
    }
    build(): HdContainerDataSource {
      return HdNurbsPatchSchema.buildRetained(
        this._uVertexCount,
        this._vVertexCount,
        this._uOrder,
        this._vOrder,
        this._uKnots,
        this._vKnots,
        this._uForm,
        this._vForm,
        this._uRange,
        this._vRange,
        this._trimCurve,
        this._orientation,
        this._doubleSided,
      )
    }
  }
}

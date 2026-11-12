// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImaging/geomModelSchema.cpp,
//  pxr/usdImaging/usdImaging/geomModelSchema.h,
//  pxr/usdImaging/usdImaging/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/geomModelSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the GeomModel entry of pxr/usdImaging/usdImaging/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. The
// STATIC_TOKEN_DATASOURCE_BUILDERS methods are ported by hand.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { ContainerDataSource as HdContainerDataSource, DataSourceLocator as HdDataSourceLocator, Schema as HdSchema, _HdBuildRetained, RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource, type AssetPathDataSource as HdAssetPathDataSource, type BoolDataSource as HdBoolDataSource, type TokenDataSource as HdTokenDataSource, type TypedSampledDataSource as HdTypedSampledDataSource } from 'typescript-usd/hd'
import type { Vec3f as GfVec3f } from 'typescript-usd/gf'

/** geomModelSchema.h TF_DECLARE_PUBLIC_TOKENS(UsdImagingGeomModelSchemaTokens) */
export const UsdImagingGeomModelSchemaTokens = TfMakeTokens({
  geomModel: 'geomModel',
  drawMode: 'drawMode',
  applyDrawMode: 'applyDrawMode',
  drawModeColor: 'drawModeColor',
  cardGeometry: 'cardGeometry',
  cardVisibility: 'cardVisibility',
  cardTextureXPos: 'cardTextureXPos',
  cardTextureYPos: 'cardTextureYPos',
  cardTextureZPos: 'cardTextureZPos',
  cardTextureXNeg: 'cardTextureXNeg',
  cardTextureYNeg: 'cardTextureYNeg',
  cardTextureZNeg: 'cardTextureZNeg',
  default_: 'default',
  origin: 'origin',
  bounds: 'bounds',
  cards: 'cards',
  inherited: 'inherited',
  cross: 'cross',
  box: 'box',
  fromTexture: 'fromTexture',
  simple: 'simple',
  full: 'full',
})

export class UsdImagingGeomModelSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** geomModelSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): UsdImagingGeomModelSchema {
    const ds = fromParentContainer?.Get(UsdImagingGeomModelSchemaTokens.geomModel)
    return new UsdImagingGeomModelSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getDrawMode(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(UsdImagingGeomModelSchemaTokens.drawMode)
  }

  getApplyDrawMode(): HdBoolDataSource | undefined {
    return this._getTypedDataSource<HdBoolDataSource>(UsdImagingGeomModelSchemaTokens.applyDrawMode)
  }

  getDrawModeColor(): HdTypedSampledDataSource<GfVec3f> | undefined {
    return this._getTypedDataSource<HdTypedSampledDataSource<GfVec3f>>(UsdImagingGeomModelSchemaTokens.drawModeColor)
  }

  getCardGeometry(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(UsdImagingGeomModelSchemaTokens.cardGeometry)
  }

  getCardVisibility(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(UsdImagingGeomModelSchemaTokens.cardVisibility)
  }

  getCardTextureXPos(): HdAssetPathDataSource | undefined {
    return this._getTypedDataSource<HdAssetPathDataSource>(UsdImagingGeomModelSchemaTokens.cardTextureXPos)
  }

  getCardTextureYPos(): HdAssetPathDataSource | undefined {
    return this._getTypedDataSource<HdAssetPathDataSource>(UsdImagingGeomModelSchemaTokens.cardTextureYPos)
  }

  getCardTextureZPos(): HdAssetPathDataSource | undefined {
    return this._getTypedDataSource<HdAssetPathDataSource>(UsdImagingGeomModelSchemaTokens.cardTextureZPos)
  }

  getCardTextureXNeg(): HdAssetPathDataSource | undefined {
    return this._getTypedDataSource<HdAssetPathDataSource>(UsdImagingGeomModelSchemaTokens.cardTextureXNeg)
  }

  getCardTextureYNeg(): HdAssetPathDataSource | undefined {
    return this._getTypedDataSource<HdAssetPathDataSource>(UsdImagingGeomModelSchemaTokens.cardTextureYNeg)
  }

  getCardTextureZNeg(): HdAssetPathDataSource | undefined {
    return this._getTypedDataSource<HdAssetPathDataSource>(UsdImagingGeomModelSchemaTokens.cardTextureZNeg)
  }

  static getSchemaToken(): TfToken {
    return UsdImagingGeomModelSchemaTokens.geomModel
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return UsdImagingGeomModelSchema._defaultLocator ??= new HdDataSourceLocator(UsdImagingGeomModelSchema.getSchemaToken())
  }

  private static _drawModeLocator: HdDataSourceLocator | undefined
  static getDrawModeLocator(): HdDataSourceLocator {
    return UsdImagingGeomModelSchema._drawModeLocator ??= UsdImagingGeomModelSchema.getDefaultLocator().append(UsdImagingGeomModelSchemaTokens.drawMode)
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    drawMode?: HdTokenDataSource | undefined,
    applyDrawMode?: HdBoolDataSource | undefined,
    drawModeColor?: HdTypedSampledDataSource<GfVec3f> | undefined,
    cardGeometry?: HdTokenDataSource | undefined,
    cardVisibility?: HdTokenDataSource | undefined,
    cardTextureXPos?: HdAssetPathDataSource | undefined,
    cardTextureYPos?: HdAssetPathDataSource | undefined,
    cardTextureZPos?: HdAssetPathDataSource | undefined,
    cardTextureXNeg?: HdAssetPathDataSource | undefined,
    cardTextureYNeg?: HdAssetPathDataSource | undefined,
    cardTextureZNeg?: HdAssetPathDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [UsdImagingGeomModelSchemaTokens.drawMode]: drawMode,
      [UsdImagingGeomModelSchemaTokens.applyDrawMode]: applyDrawMode,
      [UsdImagingGeomModelSchemaTokens.drawModeColor]: drawModeColor,
      [UsdImagingGeomModelSchemaTokens.cardGeometry]: cardGeometry,
      [UsdImagingGeomModelSchemaTokens.cardVisibility]: cardVisibility,
      [UsdImagingGeomModelSchemaTokens.cardTextureXPos]: cardTextureXPos,
      [UsdImagingGeomModelSchemaTokens.cardTextureYPos]: cardTextureYPos,
      [UsdImagingGeomModelSchemaTokens.cardTextureZPos]: cardTextureZPos,
      [UsdImagingGeomModelSchemaTokens.cardTextureXNeg]: cardTextureXNeg,
      [UsdImagingGeomModelSchemaTokens.cardTextureYNeg]: cardTextureYNeg,
      [UsdImagingGeomModelSchemaTokens.cardTextureZNeg]: cardTextureZNeg,
    })
  }

  private static _drawModeDataSources: Map<string, HdTokenDataSource> | undefined
  /** geomModelSchema.cpp BuildDrawModeDataSource: returns token data source for
   *  use as drawMode value. The values default_, origin, bounds, cards, inherited are stored statically and
   *  reused for future calls. */
  static buildDrawModeDataSource(drawMode: string): HdTokenDataSource {
    const known: readonly string[] = [UsdImagingGeomModelSchemaTokens.default_, UsdImagingGeomModelSchemaTokens.origin, UsdImagingGeomModelSchemaTokens.bounds, UsdImagingGeomModelSchemaTokens.cards, UsdImagingGeomModelSchemaTokens.inherited]
    if (known.includes(drawMode)) {
      const cache = UsdImagingGeomModelSchema._drawModeDataSources ??= new Map()
      let ds = cache.get(drawMode)
      if (!ds) {
        ds = HdRetainedTypedSampledDataSource.new<string>(drawMode)
        cache.set(drawMode, ds)
      }
      return ds
    }
    // fallback for unknown token
    return HdRetainedTypedSampledDataSource.new<string>(drawMode)
  }

  private static _cardGeometryDataSources: Map<string, HdTokenDataSource> | undefined
  /** geomModelSchema.cpp BuildCardGeometryDataSource: returns token data source for
   *  use as cardGeometry value. The values cross, box, fromTexture are stored statically and
   *  reused for future calls. */
  static buildCardGeometryDataSource(cardGeometry: string): HdTokenDataSource {
    const known: readonly string[] = [UsdImagingGeomModelSchemaTokens.cross, UsdImagingGeomModelSchemaTokens.box, UsdImagingGeomModelSchemaTokens.fromTexture]
    if (known.includes(cardGeometry)) {
      const cache = UsdImagingGeomModelSchema._cardGeometryDataSources ??= new Map()
      let ds = cache.get(cardGeometry)
      if (!ds) {
        ds = HdRetainedTypedSampledDataSource.new<string>(cardGeometry)
        cache.set(cardGeometry, ds)
      }
      return ds
    }
    // fallback for unknown token
    return HdRetainedTypedSampledDataSource.new<string>(cardGeometry)
  }

  private static _cardVisibilityDataSources: Map<string, HdTokenDataSource> | undefined
  /** geomModelSchema.cpp BuildCardVisibilityDataSource: returns token data source for
   *  use as cardVisibility value. The values inherited, simple, full are stored statically and
   *  reused for future calls. */
  static buildCardVisibilityDataSource(cardVisibility: string): HdTokenDataSource {
    const known: readonly string[] = [UsdImagingGeomModelSchemaTokens.inherited, UsdImagingGeomModelSchemaTokens.simple, UsdImagingGeomModelSchemaTokens.full]
    if (known.includes(cardVisibility)) {
      const cache = UsdImagingGeomModelSchema._cardVisibilityDataSources ??= new Map()
      let ds = cache.get(cardVisibility)
      if (!ds) {
        ds = HdRetainedTypedSampledDataSource.new<string>(cardVisibility)
        cache.set(cardVisibility, ds)
      }
      return ds
    }
    // fallback for unknown token
    return HdRetainedTypedSampledDataSource.new<string>(cardVisibility)
  }
}

export namespace UsdImagingGeomModelSchema {
  /** UsdImagingGeomModelSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _drawMode: HdTokenDataSource | undefined
    private _applyDrawMode: HdBoolDataSource | undefined
    private _drawModeColor: HdTypedSampledDataSource<GfVec3f> | undefined
    private _cardGeometry: HdTokenDataSource | undefined
    private _cardVisibility: HdTokenDataSource | undefined
    private _cardTextureXPos: HdAssetPathDataSource | undefined
    private _cardTextureYPos: HdAssetPathDataSource | undefined
    private _cardTextureZPos: HdAssetPathDataSource | undefined
    private _cardTextureXNeg: HdAssetPathDataSource | undefined
    private _cardTextureYNeg: HdAssetPathDataSource | undefined
    private _cardTextureZNeg: HdAssetPathDataSource | undefined
    setDrawMode(drawMode: HdTokenDataSource | undefined): this {
      this._drawMode = drawMode
      return this
    }
    setApplyDrawMode(applyDrawMode: HdBoolDataSource | undefined): this {
      this._applyDrawMode = applyDrawMode
      return this
    }
    setDrawModeColor(drawModeColor: HdTypedSampledDataSource<GfVec3f> | undefined): this {
      this._drawModeColor = drawModeColor
      return this
    }
    setCardGeometry(cardGeometry: HdTokenDataSource | undefined): this {
      this._cardGeometry = cardGeometry
      return this
    }
    setCardVisibility(cardVisibility: HdTokenDataSource | undefined): this {
      this._cardVisibility = cardVisibility
      return this
    }
    setCardTextureXPos(cardTextureXPos: HdAssetPathDataSource | undefined): this {
      this._cardTextureXPos = cardTextureXPos
      return this
    }
    setCardTextureYPos(cardTextureYPos: HdAssetPathDataSource | undefined): this {
      this._cardTextureYPos = cardTextureYPos
      return this
    }
    setCardTextureZPos(cardTextureZPos: HdAssetPathDataSource | undefined): this {
      this._cardTextureZPos = cardTextureZPos
      return this
    }
    setCardTextureXNeg(cardTextureXNeg: HdAssetPathDataSource | undefined): this {
      this._cardTextureXNeg = cardTextureXNeg
      return this
    }
    setCardTextureYNeg(cardTextureYNeg: HdAssetPathDataSource | undefined): this {
      this._cardTextureYNeg = cardTextureYNeg
      return this
    }
    setCardTextureZNeg(cardTextureZNeg: HdAssetPathDataSource | undefined): this {
      this._cardTextureZNeg = cardTextureZNeg
      return this
    }
    build(): HdContainerDataSource {
      return UsdImagingGeomModelSchema.buildRetained(
        this._drawMode,
        this._applyDrawMode,
        this._drawModeColor,
        this._cardGeometry,
        this._cardVisibility,
        this._cardTextureXPos,
        this._cardTextureYPos,
        this._cardTextureZPos,
        this._cardTextureXNeg,
        this._cardTextureYNeg,
        this._cardTextureZNeg,
      )
    }
  }
}

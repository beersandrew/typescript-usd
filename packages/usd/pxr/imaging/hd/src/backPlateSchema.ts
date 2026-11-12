// Ported from OpenUSD 26.11.1: pxr/imaging/hd/backPlateSchema.cpp,
//  pxr/imaging/hd/backPlateSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/backPlateSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the BackPlate entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream backPlateSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource, HdRetainedTypedSampledDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdAssetPathDataSource, HdFloatDataSource, HdTokenDataSource, HdVec2fDataSource, HdVec3fDataSource } from './dataSourceTypeDefs.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'

/** backPlateSchema.h TF_DECLARE_PUBLIC_TOKENS(HdBackPlateSchemaTokens) */
export const HdBackPlateSchemaTokens = TfMakeTokens({
  backPlate: 'backPlate',
  scaleTweak: 'scaleTweak',
  rotateXYZTweak: 'rotateXYZTweak',
  translateTweak: 'translateTweak',
  image: 'image',
  alphaImage: 'alphaImage',
  depthImage: 'depthImage',
  depthMinOffset: 'depthMinOffset',
  depthNormalizingFactor: 'depthNormalizingFactor',
  depthCameraSpaceOffset: 'depthCameraSpaceOffset',
  lumaSlope: 'lumaSlope',
  lumaOffset: 'lumaOffset',
  lumaPower: 'lumaPower',
  plateVisibility: 'plateVisibility',
  all: 'all',
  solo: 'solo',
  none: 'none',
})

/**
 * The {{ SCHEMA_CLASS_NAME }} specifies a container that will hold "back
 * plate" data. This data is parallel to the properties defined in
 * UsdGeomBackPlateAPI and more details can be found at usdGeom/backPlateAPI.h
 */
export class HdBackPlateSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** backPlateSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdBackPlateSchema {
    const ds = fromParentContainer?.Get(HdBackPlateSchemaTokens.backPlate)
    return new HdBackPlateSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getScaleTweak(): HdVec2fDataSource | undefined {
    return this._getTypedDataSource<HdVec2fDataSource>(HdBackPlateSchemaTokens.scaleTweak)
  }

  getRotateXYZTweak(): HdVec3fDataSource | undefined {
    return this._getTypedDataSource<HdVec3fDataSource>(HdBackPlateSchemaTokens.rotateXYZTweak)
  }

  getTranslateTweak(): HdVec3fDataSource | undefined {
    return this._getTypedDataSource<HdVec3fDataSource>(HdBackPlateSchemaTokens.translateTweak)
  }

  getImage(): HdAssetPathDataSource | undefined {
    return this._getTypedDataSource<HdAssetPathDataSource>(HdBackPlateSchemaTokens.image)
  }

  getAlphaImage(): HdAssetPathDataSource | undefined {
    return this._getTypedDataSource<HdAssetPathDataSource>(HdBackPlateSchemaTokens.alphaImage)
  }

  getDepthImage(): HdAssetPathDataSource | undefined {
    return this._getTypedDataSource<HdAssetPathDataSource>(HdBackPlateSchemaTokens.depthImage)
  }

  getDepthMinOffset(): HdFloatDataSource | undefined {
    return this._getTypedDataSource<HdFloatDataSource>(HdBackPlateSchemaTokens.depthMinOffset)
  }

  getDepthNormalizingFactor(): HdFloatDataSource | undefined {
    return this._getTypedDataSource<HdFloatDataSource>(HdBackPlateSchemaTokens.depthNormalizingFactor)
  }

  getDepthCameraSpaceOffset(): HdFloatDataSource | undefined {
    return this._getTypedDataSource<HdFloatDataSource>(HdBackPlateSchemaTokens.depthCameraSpaceOffset)
  }

  getLumaSlope(): HdVec3fDataSource | undefined {
    return this._getTypedDataSource<HdVec3fDataSource>(HdBackPlateSchemaTokens.lumaSlope)
  }

  getLumaOffset(): HdVec3fDataSource | undefined {
    return this._getTypedDataSource<HdVec3fDataSource>(HdBackPlateSchemaTokens.lumaOffset)
  }

  getLumaPower(): HdVec3fDataSource | undefined {
    return this._getTypedDataSource<HdVec3fDataSource>(HdBackPlateSchemaTokens.lumaPower)
  }

  getPlateVisibility(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdBackPlateSchemaTokens.plateVisibility)
  }

  static getSchemaToken(): TfToken {
    return HdBackPlateSchemaTokens.backPlate
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    scaleTweak?: HdVec2fDataSource | undefined,
    rotateXYZTweak?: HdVec3fDataSource | undefined,
    translateTweak?: HdVec3fDataSource | undefined,
    image?: HdAssetPathDataSource | undefined,
    alphaImage?: HdAssetPathDataSource | undefined,
    depthImage?: HdAssetPathDataSource | undefined,
    depthMinOffset?: HdFloatDataSource | undefined,
    depthNormalizingFactor?: HdFloatDataSource | undefined,
    depthCameraSpaceOffset?: HdFloatDataSource | undefined,
    lumaSlope?: HdVec3fDataSource | undefined,
    lumaOffset?: HdVec3fDataSource | undefined,
    lumaPower?: HdVec3fDataSource | undefined,
    plateVisibility?: HdTokenDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdBackPlateSchemaTokens.scaleTweak]: scaleTweak,
      [HdBackPlateSchemaTokens.rotateXYZTweak]: rotateXYZTweak,
      [HdBackPlateSchemaTokens.translateTweak]: translateTweak,
      [HdBackPlateSchemaTokens.image]: image,
      [HdBackPlateSchemaTokens.alphaImage]: alphaImage,
      [HdBackPlateSchemaTokens.depthImage]: depthImage,
      [HdBackPlateSchemaTokens.depthMinOffset]: depthMinOffset,
      [HdBackPlateSchemaTokens.depthNormalizingFactor]: depthNormalizingFactor,
      [HdBackPlateSchemaTokens.depthCameraSpaceOffset]: depthCameraSpaceOffset,
      [HdBackPlateSchemaTokens.lumaSlope]: lumaSlope,
      [HdBackPlateSchemaTokens.lumaOffset]: lumaOffset,
      [HdBackPlateSchemaTokens.lumaPower]: lumaPower,
      [HdBackPlateSchemaTokens.plateVisibility]: plateVisibility,
    })
  }

  private static _plateVisibilityDataSources: Map<string, HdTokenDataSource> | undefined
  /** Returns token data source for use as plateVisibility value; the values
   * all, solo, none are stored statically and reused. */
  static buildPlateVisibilityDataSource(plateVisibility: string): HdTokenDataSource {
    const known: readonly string[] = [HdBackPlateSchemaTokens.all, HdBackPlateSchemaTokens.solo, HdBackPlateSchemaTokens.none]
    if (known.includes(plateVisibility)) {
      const cache = HdBackPlateSchema._plateVisibilityDataSources ??= new Map()
      let ds = cache.get(plateVisibility)
      if (!ds) {
        ds = HdRetainedTypedSampledDataSource.new<string>(plateVisibility)
        cache.set(plateVisibility, ds)
      }
      return ds
    }
    // fallback for unknown token
    return HdRetainedTypedSampledDataSource.new<string>(plateVisibility)
  }
}

export namespace HdBackPlateSchema {
  /** HdBackPlateSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _scaleTweak: HdVec2fDataSource | undefined
    private _rotateXYZTweak: HdVec3fDataSource | undefined
    private _translateTweak: HdVec3fDataSource | undefined
    private _image: HdAssetPathDataSource | undefined
    private _alphaImage: HdAssetPathDataSource | undefined
    private _depthImage: HdAssetPathDataSource | undefined
    private _depthMinOffset: HdFloatDataSource | undefined
    private _depthNormalizingFactor: HdFloatDataSource | undefined
    private _depthCameraSpaceOffset: HdFloatDataSource | undefined
    private _lumaSlope: HdVec3fDataSource | undefined
    private _lumaOffset: HdVec3fDataSource | undefined
    private _lumaPower: HdVec3fDataSource | undefined
    private _plateVisibility: HdTokenDataSource | undefined
    setScaleTweak(scaleTweak: HdVec2fDataSource | undefined): this {
      this._scaleTweak = scaleTweak
      return this
    }
    setRotateXYZTweak(rotateXYZTweak: HdVec3fDataSource | undefined): this {
      this._rotateXYZTweak = rotateXYZTweak
      return this
    }
    setTranslateTweak(translateTweak: HdVec3fDataSource | undefined): this {
      this._translateTweak = translateTweak
      return this
    }
    setImage(image: HdAssetPathDataSource | undefined): this {
      this._image = image
      return this
    }
    setAlphaImage(alphaImage: HdAssetPathDataSource | undefined): this {
      this._alphaImage = alphaImage
      return this
    }
    setDepthImage(depthImage: HdAssetPathDataSource | undefined): this {
      this._depthImage = depthImage
      return this
    }
    setDepthMinOffset(depthMinOffset: HdFloatDataSource | undefined): this {
      this._depthMinOffset = depthMinOffset
      return this
    }
    setDepthNormalizingFactor(depthNormalizingFactor: HdFloatDataSource | undefined): this {
      this._depthNormalizingFactor = depthNormalizingFactor
      return this
    }
    setDepthCameraSpaceOffset(depthCameraSpaceOffset: HdFloatDataSource | undefined): this {
      this._depthCameraSpaceOffset = depthCameraSpaceOffset
      return this
    }
    setLumaSlope(lumaSlope: HdVec3fDataSource | undefined): this {
      this._lumaSlope = lumaSlope
      return this
    }
    setLumaOffset(lumaOffset: HdVec3fDataSource | undefined): this {
      this._lumaOffset = lumaOffset
      return this
    }
    setLumaPower(lumaPower: HdVec3fDataSource | undefined): this {
      this._lumaPower = lumaPower
      return this
    }
    setPlateVisibility(plateVisibility: HdTokenDataSource | undefined): this {
      this._plateVisibility = plateVisibility
      return this
    }
    build(): HdContainerDataSource {
      return HdBackPlateSchema.buildRetained(
        this._scaleTweak,
        this._rotateXYZTweak,
        this._translateTweak,
        this._image,
        this._alphaImage,
        this._depthImage,
        this._depthMinOffset,
        this._depthNormalizingFactor,
        this._depthCameraSpaceOffset,
        this._lumaSlope,
        this._lumaOffset,
        this._lumaPower,
        this._plateVisibility,
      )
    }
  }
}

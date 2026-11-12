// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/geomXformVectorsSchema.cpp,
//  pxr/usdImaging/usdImaging/geomXformVectorsSchema.h,
//  pxr/usdImaging/usdImaging/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/geomXformVectorsSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the GeomXformVectors entry of pxr/usdImaging/usdImaging/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { ContainerDataSource as HdContainerDataSource, DataSourceLocator as HdDataSourceLocator, Schema as HdSchema, _HdBuildRetained, type TokenDataSource as HdTokenDataSource, type TypedSampledDataSource as HdTypedSampledDataSource } from 'typescript-usd/hd'
import type { Vec3d as GfVec3d, Vec3f as GfVec3f } from 'typescript-usd/gf'

/** geomXformVectorsSchema.h TF_DECLARE_PUBLIC_TOKENS(UsdImagingGeomXformVectorsSchemaTokens) */
export const UsdImagingGeomXformVectorsSchemaTokens = TfMakeTokens({
  geomXformVectors: 'geomXformVectors',
  translation: 'translation',
  rotation: 'rotation',
  rotationOrder: 'rotationOrder',
  scale: 'scale',
  pivot: 'pivot',
})

export class UsdImagingGeomXformVectorsSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** geomXformVectorsSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): UsdImagingGeomXformVectorsSchema {
    const ds = fromParentContainer?.Get(UsdImagingGeomXformVectorsSchemaTokens.geomXformVectors)
    return new UsdImagingGeomXformVectorsSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getTranslation(): HdTypedSampledDataSource<GfVec3d> | undefined {
    return this._getTypedDataSource<HdTypedSampledDataSource<GfVec3d>>(UsdImagingGeomXformVectorsSchemaTokens.translation)
  }

  getRotation(): HdTypedSampledDataSource<GfVec3f> | undefined {
    return this._getTypedDataSource<HdTypedSampledDataSource<GfVec3f>>(UsdImagingGeomXformVectorsSchemaTokens.rotation)
  }

  getRotationOrder(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(UsdImagingGeomXformVectorsSchemaTokens.rotationOrder)
  }

  getScale(): HdTypedSampledDataSource<GfVec3f> | undefined {
    return this._getTypedDataSource<HdTypedSampledDataSource<GfVec3f>>(UsdImagingGeomXformVectorsSchemaTokens.scale)
  }

  getPivot(): HdTypedSampledDataSource<GfVec3f> | undefined {
    return this._getTypedDataSource<HdTypedSampledDataSource<GfVec3f>>(UsdImagingGeomXformVectorsSchemaTokens.pivot)
  }

  static getSchemaToken(): TfToken {
    return UsdImagingGeomXformVectorsSchemaTokens.geomXformVectors
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return UsdImagingGeomXformVectorsSchema._defaultLocator ??= new HdDataSourceLocator(UsdImagingGeomXformVectorsSchema.getSchemaToken())
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    translation?: HdTypedSampledDataSource<GfVec3d> | undefined,
    rotation?: HdTypedSampledDataSource<GfVec3f> | undefined,
    rotationOrder?: HdTokenDataSource | undefined,
    scale?: HdTypedSampledDataSource<GfVec3f> | undefined,
    pivot?: HdTypedSampledDataSource<GfVec3f> | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [UsdImagingGeomXformVectorsSchemaTokens.translation]: translation,
      [UsdImagingGeomXformVectorsSchemaTokens.rotation]: rotation,
      [UsdImagingGeomXformVectorsSchemaTokens.rotationOrder]: rotationOrder,
      [UsdImagingGeomXformVectorsSchemaTokens.scale]: scale,
      [UsdImagingGeomXformVectorsSchemaTokens.pivot]: pivot,
    })
  }
}

export namespace UsdImagingGeomXformVectorsSchema {
  /** UsdImagingGeomXformVectorsSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _translation: HdTypedSampledDataSource<GfVec3d> | undefined
    private _rotation: HdTypedSampledDataSource<GfVec3f> | undefined
    private _rotationOrder: HdTokenDataSource | undefined
    private _scale: HdTypedSampledDataSource<GfVec3f> | undefined
    private _pivot: HdTypedSampledDataSource<GfVec3f> | undefined
    setTranslation(translation: HdTypedSampledDataSource<GfVec3d> | undefined): this {
      this._translation = translation
      return this
    }
    setRotation(rotation: HdTypedSampledDataSource<GfVec3f> | undefined): this {
      this._rotation = rotation
      return this
    }
    setRotationOrder(rotationOrder: HdTokenDataSource | undefined): this {
      this._rotationOrder = rotationOrder
      return this
    }
    setScale(scale: HdTypedSampledDataSource<GfVec3f> | undefined): this {
      this._scale = scale
      return this
    }
    setPivot(pivot: HdTypedSampledDataSource<GfVec3f> | undefined): this {
      this._pivot = pivot
      return this
    }
    build(): HdContainerDataSource {
      return UsdImagingGeomXformVectorsSchema.buildRetained(
        this._translation,
        this._rotation,
        this._rotationOrder,
        this._scale,
        this._pivot,
      )
    }
  }
}

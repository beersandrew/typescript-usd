// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/collectionMaterialBindingSchema.cpp,
//  pxr/usdImaging/usdImaging/collectionMaterialBindingSchema.h,
//  pxr/usdImaging/usdImaging/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/collectionMaterialBindingSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the CollectionMaterialBinding entry of pxr/usdImaging/usdImaging/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { ContainerDataSource as HdContainerDataSource, DataSourceLocator as HdDataSourceLocator, Schema as HdSchema, _HdBuildRetained, type PathDataSource as HdPathDataSource, type TokenDataSource as HdTokenDataSource } from 'typescript-usd/hd'

/** collectionMaterialBindingSchema.h TF_DECLARE_PUBLIC_TOKENS(UsdImagingCollectionMaterialBindingSchemaTokens) */
export const UsdImagingCollectionMaterialBindingSchemaTokens = TfMakeTokens({
  collectionMaterialBinding: 'collectionMaterialBinding',
  collectionPrimPath: 'collectionPrimPath',
  collectionName: 'collectionName',
  materialPath: 'materialPath',
  bindingStrength: 'bindingStrength',
})

export class UsdImagingCollectionMaterialBindingSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** collectionMaterialBindingSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): UsdImagingCollectionMaterialBindingSchema {
    const ds = fromParentContainer?.Get(UsdImagingCollectionMaterialBindingSchemaTokens.collectionMaterialBinding)
    return new UsdImagingCollectionMaterialBindingSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getCollectionPrimPath(): HdPathDataSource | undefined {
    return this._getTypedDataSource<HdPathDataSource>(UsdImagingCollectionMaterialBindingSchemaTokens.collectionPrimPath)
  }

  getCollectionName(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(UsdImagingCollectionMaterialBindingSchemaTokens.collectionName)
  }

  getMaterialPath(): HdPathDataSource | undefined {
    return this._getTypedDataSource<HdPathDataSource>(UsdImagingCollectionMaterialBindingSchemaTokens.materialPath)
  }

  getBindingStrength(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(UsdImagingCollectionMaterialBindingSchemaTokens.bindingStrength)
  }

  static getSchemaToken(): TfToken {
    return UsdImagingCollectionMaterialBindingSchemaTokens.collectionMaterialBinding
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return UsdImagingCollectionMaterialBindingSchema._defaultLocator ??= new HdDataSourceLocator(UsdImagingCollectionMaterialBindingSchema.getSchemaToken())
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    collectionPrimPath?: HdPathDataSource | undefined,
    collectionName?: HdTokenDataSource | undefined,
    materialPath?: HdPathDataSource | undefined,
    bindingStrength?: HdTokenDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [UsdImagingCollectionMaterialBindingSchemaTokens.collectionPrimPath]: collectionPrimPath,
      [UsdImagingCollectionMaterialBindingSchemaTokens.collectionName]: collectionName,
      [UsdImagingCollectionMaterialBindingSchemaTokens.materialPath]: materialPath,
      [UsdImagingCollectionMaterialBindingSchemaTokens.bindingStrength]: bindingStrength,
    })
  }
}

export namespace UsdImagingCollectionMaterialBindingSchema {
  /** UsdImagingCollectionMaterialBindingSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _collectionPrimPath: HdPathDataSource | undefined
    private _collectionName: HdTokenDataSource | undefined
    private _materialPath: HdPathDataSource | undefined
    private _bindingStrength: HdTokenDataSource | undefined
    setCollectionPrimPath(collectionPrimPath: HdPathDataSource | undefined): this {
      this._collectionPrimPath = collectionPrimPath
      return this
    }
    setCollectionName(collectionName: HdTokenDataSource | undefined): this {
      this._collectionName = collectionName
      return this
    }
    setMaterialPath(materialPath: HdPathDataSource | undefined): this {
      this._materialPath = materialPath
      return this
    }
    setBindingStrength(bindingStrength: HdTokenDataSource | undefined): this {
      this._bindingStrength = bindingStrength
      return this
    }
    build(): HdContainerDataSource {
      return UsdImagingCollectionMaterialBindingSchema.buildRetained(
        this._collectionPrimPath,
        this._collectionName,
        this._materialPath,
        this._bindingStrength,
      )
    }
  }
}

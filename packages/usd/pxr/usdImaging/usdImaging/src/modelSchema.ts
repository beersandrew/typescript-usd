// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImaging/modelSchema.cpp,
//  pxr/usdImaging/usdImaging/modelSchema.h,
//  pxr/usdImaging/usdImaging/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/modelSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the Model entry of pxr/usdImaging/usdImaging/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { ContainerDataSource as HdContainerDataSource, DataSourceLocator as HdDataSourceLocator, Schema as HdSchema, _HdBuildRetained, type AssetPathDataSource as HdAssetPathDataSource, type PathDataSource as HdPathDataSource, type StringDataSource as HdStringDataSource } from 'typescript-usd/hd'

/** modelSchema.h TF_DECLARE_PUBLIC_TOKENS(UsdImagingModelSchemaTokens) */
export const UsdImagingModelSchemaTokens = TfMakeTokens({
  model: 'model',
  modelPath: 'modelPath',
  assetIdentifier: 'assetIdentifier',
  assetName: 'assetName',
  assetVersion: 'assetVersion',
  modelPathPrimvarName: 'model:modelPath',
})

export class UsdImagingModelSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** modelSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): UsdImagingModelSchema {
    const ds = fromParentContainer?.Get(UsdImagingModelSchemaTokens.model)
    return new UsdImagingModelSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getModelPath(): HdPathDataSource | undefined {
    return this._getTypedDataSource<HdPathDataSource>(UsdImagingModelSchemaTokens.modelPath)
  }

  getAssetIdentifier(): HdAssetPathDataSource | undefined {
    return this._getTypedDataSource<HdAssetPathDataSource>(UsdImagingModelSchemaTokens.assetIdentifier)
  }

  getAssetName(): HdStringDataSource | undefined {
    return this._getTypedDataSource<HdStringDataSource>(UsdImagingModelSchemaTokens.assetName)
  }

  getAssetVersion(): HdStringDataSource | undefined {
    return this._getTypedDataSource<HdStringDataSource>(UsdImagingModelSchemaTokens.assetVersion)
  }

  static getSchemaToken(): TfToken {
    return UsdImagingModelSchemaTokens.model
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return UsdImagingModelSchema._defaultLocator ??= new HdDataSourceLocator(UsdImagingModelSchema.getSchemaToken())
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    modelPath?: HdPathDataSource | undefined,
    assetIdentifier?: HdAssetPathDataSource | undefined,
    assetName?: HdStringDataSource | undefined,
    assetVersion?: HdStringDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [UsdImagingModelSchemaTokens.modelPath]: modelPath,
      [UsdImagingModelSchemaTokens.assetIdentifier]: assetIdentifier,
      [UsdImagingModelSchemaTokens.assetName]: assetName,
      [UsdImagingModelSchemaTokens.assetVersion]: assetVersion,
    })
  }
}

export namespace UsdImagingModelSchema {
  /** UsdImagingModelSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _modelPath: HdPathDataSource | undefined
    private _assetIdentifier: HdAssetPathDataSource | undefined
    private _assetName: HdStringDataSource | undefined
    private _assetVersion: HdStringDataSource | undefined
    setModelPath(modelPath: HdPathDataSource | undefined): this {
      this._modelPath = modelPath
      return this
    }
    setAssetIdentifier(assetIdentifier: HdAssetPathDataSource | undefined): this {
      this._assetIdentifier = assetIdentifier
      return this
    }
    setAssetName(assetName: HdStringDataSource | undefined): this {
      this._assetName = assetName
      return this
    }
    setAssetVersion(assetVersion: HdStringDataSource | undefined): this {
      this._assetVersion = assetVersion
      return this
    }
    build(): HdContainerDataSource {
      return UsdImagingModelSchema.buildRetained(
        this._modelPath,
        this._assetIdentifier,
        this._assetName,
        this._assetVersion,
      )
    }
  }
}

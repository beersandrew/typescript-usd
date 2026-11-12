// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/usdRenderVarSchema.cpp,
//  pxr/usdImaging/usdImaging/usdRenderVarSchema.h,
//  pxr/usdImaging/usdImaging/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/usdRenderVarSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the UsdRenderVar entry of pxr/usdImaging/usdImaging/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { ContainerDataSource as HdContainerDataSource, DataSourceLocator as HdDataSourceLocator, Schema as HdSchema, _HdBuildRetained, type StringDataSource as HdStringDataSource, type TokenDataSource as HdTokenDataSource } from 'typescript-usd/hd'

/** usdRenderVarSchema.h TF_DECLARE_PUBLIC_TOKENS(UsdImagingUsdRenderVarSchemaTokens) */
export const UsdImagingUsdRenderVarSchemaTokens = TfMakeTokens({
  __usdRenderVar: '__usdRenderVar',
  dataType: 'dataType',
  sourceName: 'sourceName',
  sourceType: 'sourceType',
  namespacedSettings: 'namespacedSettings',
})

export class UsdImagingUsdRenderVarSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** usdRenderVarSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): UsdImagingUsdRenderVarSchema {
    const ds = fromParentContainer?.Get(UsdImagingUsdRenderVarSchemaTokens.__usdRenderVar)
    return new UsdImagingUsdRenderVarSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getDataType(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(UsdImagingUsdRenderVarSchemaTokens.dataType)
  }

  getSourceName(): HdStringDataSource | undefined {
    return this._getTypedDataSource<HdStringDataSource>(UsdImagingUsdRenderVarSchemaTokens.sourceName)
  }

  getSourceType(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(UsdImagingUsdRenderVarSchemaTokens.sourceType)
  }

  getNamespacedSettings(): HdContainerDataSource | undefined {
    return this._getContainerDataSource(UsdImagingUsdRenderVarSchemaTokens.namespacedSettings)
  }

  static getSchemaToken(): TfToken {
    return UsdImagingUsdRenderVarSchemaTokens.__usdRenderVar
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return UsdImagingUsdRenderVarSchema._defaultLocator ??= new HdDataSourceLocator(UsdImagingUsdRenderVarSchema.getSchemaToken())
  }

  private static _namespacedSettingsLocator: HdDataSourceLocator | undefined
  static getNamespacedSettingsLocator(): HdDataSourceLocator {
    return UsdImagingUsdRenderVarSchema._namespacedSettingsLocator ??= UsdImagingUsdRenderVarSchema.getDefaultLocator().append(UsdImagingUsdRenderVarSchemaTokens.namespacedSettings)
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    dataType?: HdTokenDataSource | undefined,
    sourceName?: HdStringDataSource | undefined,
    sourceType?: HdTokenDataSource | undefined,
    namespacedSettings?: HdContainerDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [UsdImagingUsdRenderVarSchemaTokens.dataType]: dataType,
      [UsdImagingUsdRenderVarSchemaTokens.sourceName]: sourceName,
      [UsdImagingUsdRenderVarSchemaTokens.sourceType]: sourceType,
      [UsdImagingUsdRenderVarSchemaTokens.namespacedSettings]: namespacedSettings,
    })
  }
}

export namespace UsdImagingUsdRenderVarSchema {
  /** UsdImagingUsdRenderVarSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _dataType: HdTokenDataSource | undefined
    private _sourceName: HdStringDataSource | undefined
    private _sourceType: HdTokenDataSource | undefined
    private _namespacedSettings: HdContainerDataSource | undefined
    setDataType(dataType: HdTokenDataSource | undefined): this {
      this._dataType = dataType
      return this
    }
    setSourceName(sourceName: HdStringDataSource | undefined): this {
      this._sourceName = sourceName
      return this
    }
    setSourceType(sourceType: HdTokenDataSource | undefined): this {
      this._sourceType = sourceType
      return this
    }
    setNamespacedSettings(namespacedSettings: HdContainerDataSource | undefined): this {
      this._namespacedSettings = namespacedSettings
      return this
    }
    build(): HdContainerDataSource {
      return UsdImagingUsdRenderVarSchema.buildRetained(
        this._dataType,
        this._sourceName,
        this._sourceType,
        this._namespacedSettings,
      )
    }
  }
}

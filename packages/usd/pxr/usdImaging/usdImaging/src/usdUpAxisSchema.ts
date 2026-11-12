// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImaging/usdUpAxisSchema.cpp,
//  pxr/usdImaging/usdImaging/usdUpAxisSchema.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/usdUpAxisSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the UsdUpAxis entry of pxr/usdImaging/usdImaging/usdImagingSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { ContainerDataSource as HdContainerDataSource, DataSourceLocator as HdDataSourceLocator, Schema as HdSchema, _HdBuildRetained, type TokenDataSource as HdTokenDataSource } from 'typescript-usd/hd'

/** usdUpAxisSchema.h TF_DECLARE_PUBLIC_TOKENS(UsdImagingUsdUpAxisSchemaTokens) */
export const UsdImagingUsdUpAxisSchemaTokens = TfMakeTokens({
  usdUpAxis: '__usdUpAxis',
  upAxis: 'upAxis',
})

export class UsdImagingUsdUpAxisSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** usdUpAxisSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): UsdImagingUsdUpAxisSchema {
    const ds = fromParentContainer?.Get(UsdImagingUsdUpAxisSchemaTokens.usdUpAxis)
    return new UsdImagingUsdUpAxisSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getUpAxis(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(UsdImagingUsdUpAxisSchemaTokens.upAxis)
  }

  static getSchemaToken(): TfToken {
    return UsdImagingUsdUpAxisSchemaTokens.usdUpAxis
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return UsdImagingUsdUpAxisSchema._defaultLocator ??= new HdDataSourceLocator(UsdImagingUsdUpAxisSchema.getSchemaToken())
  }

  private static _upAxisLocator: HdDataSourceLocator | undefined
  static getUpAxisLocator(): HdDataSourceLocator {
    return UsdImagingUsdUpAxisSchema._upAxisLocator ??= UsdImagingUsdUpAxisSchema.getDefaultLocator().append(UsdImagingUsdUpAxisSchemaTokens.upAxis)
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    upAxis?: HdTokenDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [UsdImagingUsdUpAxisSchemaTokens.upAxis]: upAxis,
    })
  }
}

export namespace UsdImagingUsdUpAxisSchema {
  /** UsdImagingUsdUpAxisSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _upAxis: HdTokenDataSource | undefined
    setUpAxis(upAxis: HdTokenDataSource | undefined): this {
      this._upAxis = upAxis
      return this
    }
    build(): HdContainerDataSource {
      return UsdImagingUsdUpAxisSchema.buildRetained(
        this._upAxis,
      )
    }
  }
}

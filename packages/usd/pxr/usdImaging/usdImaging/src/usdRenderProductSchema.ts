// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/usdRenderProductSchema.cpp,
//  pxr/usdImaging/usdImaging/usdRenderProductSchema.h,
//  pxr/imaging/hd/dataSourceTypeDefs.h,
//  pxr/usdImaging/usdImaging/hdSchemaDefs.py
// Copyright 2021, 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/usdRenderProductSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the UsdRenderProduct entry of pxr/usdImaging/usdImaging/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates.
// dataWindowNDC is a GfVec4f data source (HdVec4fDataSource of
// dataSourceTypeDefs.h); the barrel's Vec4fDataSource is the older tuple form.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { ContainerDataSource as HdContainerDataSource, DataSourceLocator as HdDataSourceLocator, Schema as HdSchema, _HdBuildRetained, type BoolDataSource as HdBoolDataSource, type FloatDataSource as HdFloatDataSource, type PathArrayDataSource as HdPathArrayDataSource, type PathDataSource as HdPathDataSource, type TokenDataSource as HdTokenDataSource, type TypedSampledDataSource as HdTypedSampledDataSource, type Vec2iDataSource as HdVec2iDataSource } from 'typescript-usd/hd'
import type { Vec4f as GfVec4f } from 'typescript-usd/gf'

/** usdRenderProductSchema.h TF_DECLARE_PUBLIC_TOKENS(UsdImagingUsdRenderProductSchemaTokens) */
export const UsdImagingUsdRenderProductSchemaTokens = TfMakeTokens({
  __usdRenderProduct: '__usdRenderProduct',
  resolution: 'resolution',
  pixelAspectRatio: 'pixelAspectRatio',
  aspectRatioConformPolicy: 'aspectRatioConformPolicy',
  dataWindowNDC: 'dataWindowNDC',
  disableMotionBlur: 'disableMotionBlur',
  disableDepthOfField: 'disableDepthOfField',
  camera: 'camera',
  productType: 'productType',
  productName: 'productName',
  orderedVars: 'orderedVars',
  namespacedSettings: 'namespacedSettings',
})

export class UsdImagingUsdRenderProductSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** usdRenderProductSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): UsdImagingUsdRenderProductSchema {
    const ds = fromParentContainer?.Get(UsdImagingUsdRenderProductSchemaTokens.__usdRenderProduct)
    return new UsdImagingUsdRenderProductSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getResolution(): HdVec2iDataSource | undefined {
    return this._getTypedDataSource<HdVec2iDataSource>(UsdImagingUsdRenderProductSchemaTokens.resolution)
  }

  getPixelAspectRatio(): HdFloatDataSource | undefined {
    return this._getTypedDataSource<HdFloatDataSource>(UsdImagingUsdRenderProductSchemaTokens.pixelAspectRatio)
  }

  getAspectRatioConformPolicy(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(UsdImagingUsdRenderProductSchemaTokens.aspectRatioConformPolicy)
  }

  getDataWindowNDC(): HdTypedSampledDataSource<GfVec4f> | undefined {
    return this._getTypedDataSource<HdTypedSampledDataSource<GfVec4f>>(UsdImagingUsdRenderProductSchemaTokens.dataWindowNDC)
  }

  getDisableMotionBlur(): HdBoolDataSource | undefined {
    return this._getTypedDataSource<HdBoolDataSource>(UsdImagingUsdRenderProductSchemaTokens.disableMotionBlur)
  }

  getDisableDepthOfField(): HdBoolDataSource | undefined {
    return this._getTypedDataSource<HdBoolDataSource>(UsdImagingUsdRenderProductSchemaTokens.disableDepthOfField)
  }

  getCamera(): HdPathDataSource | undefined {
    return this._getTypedDataSource<HdPathDataSource>(UsdImagingUsdRenderProductSchemaTokens.camera)
  }

  getProductType(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(UsdImagingUsdRenderProductSchemaTokens.productType)
  }

  getProductName(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(UsdImagingUsdRenderProductSchemaTokens.productName)
  }

  getOrderedVars(): HdPathArrayDataSource | undefined {
    return this._getTypedDataSource<HdPathArrayDataSource>(UsdImagingUsdRenderProductSchemaTokens.orderedVars)
  }

  getNamespacedSettings(): HdContainerDataSource | undefined {
    return this._getContainerDataSource(UsdImagingUsdRenderProductSchemaTokens.namespacedSettings)
  }

  static getSchemaToken(): TfToken {
    return UsdImagingUsdRenderProductSchemaTokens.__usdRenderProduct
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return UsdImagingUsdRenderProductSchema._defaultLocator ??= new HdDataSourceLocator(UsdImagingUsdRenderProductSchema.getSchemaToken())
  }

  private static _namespacedSettingsLocator: HdDataSourceLocator | undefined
  static getNamespacedSettingsLocator(): HdDataSourceLocator {
    return UsdImagingUsdRenderProductSchema._namespacedSettingsLocator ??= UsdImagingUsdRenderProductSchema.getDefaultLocator().append(UsdImagingUsdRenderProductSchemaTokens.namespacedSettings)
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    resolution?: HdVec2iDataSource | undefined,
    pixelAspectRatio?: HdFloatDataSource | undefined,
    aspectRatioConformPolicy?: HdTokenDataSource | undefined,
    dataWindowNDC?: HdTypedSampledDataSource<GfVec4f> | undefined,
    disableMotionBlur?: HdBoolDataSource | undefined,
    disableDepthOfField?: HdBoolDataSource | undefined,
    camera?: HdPathDataSource | undefined,
    productType?: HdTokenDataSource | undefined,
    productName?: HdTokenDataSource | undefined,
    orderedVars?: HdPathArrayDataSource | undefined,
    namespacedSettings?: HdContainerDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [UsdImagingUsdRenderProductSchemaTokens.resolution]: resolution,
      [UsdImagingUsdRenderProductSchemaTokens.pixelAspectRatio]: pixelAspectRatio,
      [UsdImagingUsdRenderProductSchemaTokens.aspectRatioConformPolicy]: aspectRatioConformPolicy,
      [UsdImagingUsdRenderProductSchemaTokens.dataWindowNDC]: dataWindowNDC,
      [UsdImagingUsdRenderProductSchemaTokens.disableMotionBlur]: disableMotionBlur,
      [UsdImagingUsdRenderProductSchemaTokens.disableDepthOfField]: disableDepthOfField,
      [UsdImagingUsdRenderProductSchemaTokens.camera]: camera,
      [UsdImagingUsdRenderProductSchemaTokens.productType]: productType,
      [UsdImagingUsdRenderProductSchemaTokens.productName]: productName,
      [UsdImagingUsdRenderProductSchemaTokens.orderedVars]: orderedVars,
      [UsdImagingUsdRenderProductSchemaTokens.namespacedSettings]: namespacedSettings,
    })
  }
}

export namespace UsdImagingUsdRenderProductSchema {
  /** UsdImagingUsdRenderProductSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _resolution: HdVec2iDataSource | undefined
    private _pixelAspectRatio: HdFloatDataSource | undefined
    private _aspectRatioConformPolicy: HdTokenDataSource | undefined
    private _dataWindowNDC: HdTypedSampledDataSource<GfVec4f> | undefined
    private _disableMotionBlur: HdBoolDataSource | undefined
    private _disableDepthOfField: HdBoolDataSource | undefined
    private _camera: HdPathDataSource | undefined
    private _productType: HdTokenDataSource | undefined
    private _productName: HdTokenDataSource | undefined
    private _orderedVars: HdPathArrayDataSource | undefined
    private _namespacedSettings: HdContainerDataSource | undefined
    setResolution(resolution: HdVec2iDataSource | undefined): this {
      this._resolution = resolution
      return this
    }
    setPixelAspectRatio(pixelAspectRatio: HdFloatDataSource | undefined): this {
      this._pixelAspectRatio = pixelAspectRatio
      return this
    }
    setAspectRatioConformPolicy(aspectRatioConformPolicy: HdTokenDataSource | undefined): this {
      this._aspectRatioConformPolicy = aspectRatioConformPolicy
      return this
    }
    setDataWindowNDC(dataWindowNDC: HdTypedSampledDataSource<GfVec4f> | undefined): this {
      this._dataWindowNDC = dataWindowNDC
      return this
    }
    setDisableMotionBlur(disableMotionBlur: HdBoolDataSource | undefined): this {
      this._disableMotionBlur = disableMotionBlur
      return this
    }
    setDisableDepthOfField(disableDepthOfField: HdBoolDataSource | undefined): this {
      this._disableDepthOfField = disableDepthOfField
      return this
    }
    setCamera(camera: HdPathDataSource | undefined): this {
      this._camera = camera
      return this
    }
    setProductType(productType: HdTokenDataSource | undefined): this {
      this._productType = productType
      return this
    }
    setProductName(productName: HdTokenDataSource | undefined): this {
      this._productName = productName
      return this
    }
    setOrderedVars(orderedVars: HdPathArrayDataSource | undefined): this {
      this._orderedVars = orderedVars
      return this
    }
    setNamespacedSettings(namespacedSettings: HdContainerDataSource | undefined): this {
      this._namespacedSettings = namespacedSettings
      return this
    }
    build(): HdContainerDataSource {
      return UsdImagingUsdRenderProductSchema.buildRetained(
        this._resolution,
        this._pixelAspectRatio,
        this._aspectRatioConformPolicy,
        this._dataWindowNDC,
        this._disableMotionBlur,
        this._disableDepthOfField,
        this._camera,
        this._productType,
        this._productName,
        this._orderedVars,
        this._namespacedSettings,
      )
    }
  }
}

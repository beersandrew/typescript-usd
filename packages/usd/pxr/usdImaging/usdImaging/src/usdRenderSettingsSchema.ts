// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/usdRenderSettingsSchema.cpp,
//  pxr/usdImaging/usdImaging/usdRenderSettingsSchema.h,
//  pxr/imaging/hd/dataSourceTypeDefs.h,
//  pxr/usdImaging/usdImaging/hdSchemaDefs.py
// Copyright 2021, 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/usdRenderSettingsSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the UsdRenderSettings entry of pxr/usdImaging/usdImaging/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates.
// dataWindowNDC is a GfVec4f data source (HdVec4fDataSource of
// dataSourceTypeDefs.h); the barrel's Vec4fDataSource is the older tuple form.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { ContainerDataSource as HdContainerDataSource, DataSourceLocator as HdDataSourceLocator, Schema as HdSchema, _HdBuildRetained, type BoolDataSource as HdBoolDataSource, type FloatDataSource as HdFloatDataSource, type PathArrayDataSource as HdPathArrayDataSource, type PathDataSource as HdPathDataSource, type TokenArrayDataSource as HdTokenArrayDataSource, type TokenDataSource as HdTokenDataSource, type TypedSampledDataSource as HdTypedSampledDataSource, type Vec2iDataSource as HdVec2iDataSource } from 'typescript-usd/hd'
import type { Vec4f as GfVec4f } from 'typescript-usd/gf'

/** usdRenderSettingsSchema.h TF_DECLARE_PUBLIC_TOKENS(UsdImagingUsdRenderSettingsSchemaTokens) */
export const UsdImagingUsdRenderSettingsSchemaTokens = TfMakeTokens({
  __usdRenderSettings: '__usdRenderSettings',
  resolution: 'resolution',
  pixelAspectRatio: 'pixelAspectRatio',
  aspectRatioConformPolicy: 'aspectRatioConformPolicy',
  dataWindowNDC: 'dataWindowNDC',
  disableMotionBlur: 'disableMotionBlur',
  disableDepthOfField: 'disableDepthOfField',
  camera: 'camera',
  includedPurposes: 'includedPurposes',
  materialBindingPurposes: 'materialBindingPurposes',
  renderingColorSpace: 'renderingColorSpace',
  products: 'products',
  namespacedSettings: 'namespacedSettings',
})

export class UsdImagingUsdRenderSettingsSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** usdRenderSettingsSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): UsdImagingUsdRenderSettingsSchema {
    const ds = fromParentContainer?.Get(UsdImagingUsdRenderSettingsSchemaTokens.__usdRenderSettings)
    return new UsdImagingUsdRenderSettingsSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getResolution(): HdVec2iDataSource | undefined {
    return this._getTypedDataSource<HdVec2iDataSource>(UsdImagingUsdRenderSettingsSchemaTokens.resolution)
  }

  getPixelAspectRatio(): HdFloatDataSource | undefined {
    return this._getTypedDataSource<HdFloatDataSource>(UsdImagingUsdRenderSettingsSchemaTokens.pixelAspectRatio)
  }

  getAspectRatioConformPolicy(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(UsdImagingUsdRenderSettingsSchemaTokens.aspectRatioConformPolicy)
  }

  getDataWindowNDC(): HdTypedSampledDataSource<GfVec4f> | undefined {
    return this._getTypedDataSource<HdTypedSampledDataSource<GfVec4f>>(UsdImagingUsdRenderSettingsSchemaTokens.dataWindowNDC)
  }

  getDisableMotionBlur(): HdBoolDataSource | undefined {
    return this._getTypedDataSource<HdBoolDataSource>(UsdImagingUsdRenderSettingsSchemaTokens.disableMotionBlur)
  }

  getDisableDepthOfField(): HdBoolDataSource | undefined {
    return this._getTypedDataSource<HdBoolDataSource>(UsdImagingUsdRenderSettingsSchemaTokens.disableDepthOfField)
  }

  getCamera(): HdPathDataSource | undefined {
    return this._getTypedDataSource<HdPathDataSource>(UsdImagingUsdRenderSettingsSchemaTokens.camera)
  }

  getIncludedPurposes(): HdTokenArrayDataSource | undefined {
    return this._getTypedDataSource<HdTokenArrayDataSource>(UsdImagingUsdRenderSettingsSchemaTokens.includedPurposes)
  }

  getMaterialBindingPurposes(): HdTokenArrayDataSource | undefined {
    return this._getTypedDataSource<HdTokenArrayDataSource>(UsdImagingUsdRenderSettingsSchemaTokens.materialBindingPurposes)
  }

  getRenderingColorSpace(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(UsdImagingUsdRenderSettingsSchemaTokens.renderingColorSpace)
  }

  getProducts(): HdPathArrayDataSource | undefined {
    return this._getTypedDataSource<HdPathArrayDataSource>(UsdImagingUsdRenderSettingsSchemaTokens.products)
  }

  getNamespacedSettings(): HdContainerDataSource | undefined {
    return this._getContainerDataSource(UsdImagingUsdRenderSettingsSchemaTokens.namespacedSettings)
  }

  static getSchemaToken(): TfToken {
    return UsdImagingUsdRenderSettingsSchemaTokens.__usdRenderSettings
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return UsdImagingUsdRenderSettingsSchema._defaultLocator ??= new HdDataSourceLocator(UsdImagingUsdRenderSettingsSchema.getSchemaToken())
  }

  private static _resolutionLocator: HdDataSourceLocator | undefined
  static getResolutionLocator(): HdDataSourceLocator {
    return UsdImagingUsdRenderSettingsSchema._resolutionLocator ??= UsdImagingUsdRenderSettingsSchema.getDefaultLocator().append(UsdImagingUsdRenderSettingsSchemaTokens.resolution)
  }

  private static _pixelAspectRatioLocator: HdDataSourceLocator | undefined
  static getPixelAspectRatioLocator(): HdDataSourceLocator {
    return UsdImagingUsdRenderSettingsSchema._pixelAspectRatioLocator ??= UsdImagingUsdRenderSettingsSchema.getDefaultLocator().append(UsdImagingUsdRenderSettingsSchemaTokens.pixelAspectRatio)
  }

  private static _aspectRatioConformPolicyLocator: HdDataSourceLocator | undefined
  static getAspectRatioConformPolicyLocator(): HdDataSourceLocator {
    return UsdImagingUsdRenderSettingsSchema._aspectRatioConformPolicyLocator ??= UsdImagingUsdRenderSettingsSchema.getDefaultLocator().append(UsdImagingUsdRenderSettingsSchemaTokens.aspectRatioConformPolicy)
  }

  private static _dataWindowNDCLocator: HdDataSourceLocator | undefined
  static getDataWindowNDCLocator(): HdDataSourceLocator {
    return UsdImagingUsdRenderSettingsSchema._dataWindowNDCLocator ??= UsdImagingUsdRenderSettingsSchema.getDefaultLocator().append(UsdImagingUsdRenderSettingsSchemaTokens.dataWindowNDC)
  }

  private static _disableMotionBlurLocator: HdDataSourceLocator | undefined
  static getDisableMotionBlurLocator(): HdDataSourceLocator {
    return UsdImagingUsdRenderSettingsSchema._disableMotionBlurLocator ??= UsdImagingUsdRenderSettingsSchema.getDefaultLocator().append(UsdImagingUsdRenderSettingsSchemaTokens.disableMotionBlur)
  }

  private static _disableDepthOfFieldLocator: HdDataSourceLocator | undefined
  static getDisableDepthOfFieldLocator(): HdDataSourceLocator {
    return UsdImagingUsdRenderSettingsSchema._disableDepthOfFieldLocator ??= UsdImagingUsdRenderSettingsSchema.getDefaultLocator().append(UsdImagingUsdRenderSettingsSchemaTokens.disableDepthOfField)
  }

  private static _cameraLocator: HdDataSourceLocator | undefined
  static getCameraLocator(): HdDataSourceLocator {
    return UsdImagingUsdRenderSettingsSchema._cameraLocator ??= UsdImagingUsdRenderSettingsSchema.getDefaultLocator().append(UsdImagingUsdRenderSettingsSchemaTokens.camera)
  }

  private static _includedPurposesLocator: HdDataSourceLocator | undefined
  static getIncludedPurposesLocator(): HdDataSourceLocator {
    return UsdImagingUsdRenderSettingsSchema._includedPurposesLocator ??= UsdImagingUsdRenderSettingsSchema.getDefaultLocator().append(UsdImagingUsdRenderSettingsSchemaTokens.includedPurposes)
  }

  private static _materialBindingPurposesLocator: HdDataSourceLocator | undefined
  static getMaterialBindingPurposesLocator(): HdDataSourceLocator {
    return UsdImagingUsdRenderSettingsSchema._materialBindingPurposesLocator ??= UsdImagingUsdRenderSettingsSchema.getDefaultLocator().append(UsdImagingUsdRenderSettingsSchemaTokens.materialBindingPurposes)
  }

  private static _renderingColorSpaceLocator: HdDataSourceLocator | undefined
  static getRenderingColorSpaceLocator(): HdDataSourceLocator {
    return UsdImagingUsdRenderSettingsSchema._renderingColorSpaceLocator ??= UsdImagingUsdRenderSettingsSchema.getDefaultLocator().append(UsdImagingUsdRenderSettingsSchemaTokens.renderingColorSpace)
  }

  private static _productsLocator: HdDataSourceLocator | undefined
  static getProductsLocator(): HdDataSourceLocator {
    return UsdImagingUsdRenderSettingsSchema._productsLocator ??= UsdImagingUsdRenderSettingsSchema.getDefaultLocator().append(UsdImagingUsdRenderSettingsSchemaTokens.products)
  }

  private static _namespacedSettingsLocator: HdDataSourceLocator | undefined
  static getNamespacedSettingsLocator(): HdDataSourceLocator {
    return UsdImagingUsdRenderSettingsSchema._namespacedSettingsLocator ??= UsdImagingUsdRenderSettingsSchema.getDefaultLocator().append(UsdImagingUsdRenderSettingsSchemaTokens.namespacedSettings)
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
    includedPurposes?: HdTokenArrayDataSource | undefined,
    materialBindingPurposes?: HdTokenArrayDataSource | undefined,
    renderingColorSpace?: HdTokenDataSource | undefined,
    products?: HdPathArrayDataSource | undefined,
    namespacedSettings?: HdContainerDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [UsdImagingUsdRenderSettingsSchemaTokens.resolution]: resolution,
      [UsdImagingUsdRenderSettingsSchemaTokens.pixelAspectRatio]: pixelAspectRatio,
      [UsdImagingUsdRenderSettingsSchemaTokens.aspectRatioConformPolicy]: aspectRatioConformPolicy,
      [UsdImagingUsdRenderSettingsSchemaTokens.dataWindowNDC]: dataWindowNDC,
      [UsdImagingUsdRenderSettingsSchemaTokens.disableMotionBlur]: disableMotionBlur,
      [UsdImagingUsdRenderSettingsSchemaTokens.disableDepthOfField]: disableDepthOfField,
      [UsdImagingUsdRenderSettingsSchemaTokens.camera]: camera,
      [UsdImagingUsdRenderSettingsSchemaTokens.includedPurposes]: includedPurposes,
      [UsdImagingUsdRenderSettingsSchemaTokens.materialBindingPurposes]: materialBindingPurposes,
      [UsdImagingUsdRenderSettingsSchemaTokens.renderingColorSpace]: renderingColorSpace,
      [UsdImagingUsdRenderSettingsSchemaTokens.products]: products,
      [UsdImagingUsdRenderSettingsSchemaTokens.namespacedSettings]: namespacedSettings,
    })
  }
}

export namespace UsdImagingUsdRenderSettingsSchema {
  /** UsdImagingUsdRenderSettingsSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _resolution: HdVec2iDataSource | undefined
    private _pixelAspectRatio: HdFloatDataSource | undefined
    private _aspectRatioConformPolicy: HdTokenDataSource | undefined
    private _dataWindowNDC: HdTypedSampledDataSource<GfVec4f> | undefined
    private _disableMotionBlur: HdBoolDataSource | undefined
    private _disableDepthOfField: HdBoolDataSource | undefined
    private _camera: HdPathDataSource | undefined
    private _includedPurposes: HdTokenArrayDataSource | undefined
    private _materialBindingPurposes: HdTokenArrayDataSource | undefined
    private _renderingColorSpace: HdTokenDataSource | undefined
    private _products: HdPathArrayDataSource | undefined
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
    setIncludedPurposes(includedPurposes: HdTokenArrayDataSource | undefined): this {
      this._includedPurposes = includedPurposes
      return this
    }
    setMaterialBindingPurposes(materialBindingPurposes: HdTokenArrayDataSource | undefined): this {
      this._materialBindingPurposes = materialBindingPurposes
      return this
    }
    setRenderingColorSpace(renderingColorSpace: HdTokenDataSource | undefined): this {
      this._renderingColorSpace = renderingColorSpace
      return this
    }
    setProducts(products: HdPathArrayDataSource | undefined): this {
      this._products = products
      return this
    }
    setNamespacedSettings(namespacedSettings: HdContainerDataSource | undefined): this {
      this._namespacedSettings = namespacedSettings
      return this
    }
    build(): HdContainerDataSource {
      return UsdImagingUsdRenderSettingsSchema.buildRetained(
        this._resolution,
        this._pixelAspectRatio,
        this._aspectRatioConformPolicy,
        this._dataWindowNDC,
        this._disableMotionBlur,
        this._disableDepthOfField,
        this._camera,
        this._includedPurposes,
        this._materialBindingPurposes,
        this._renderingColorSpace,
        this._products,
        this._namespacedSettings,
      )
    }
  }
}

// Ported from OpenUSD 26.11.1: pxr/imaging/hd/renderSettingsSchema.cpp,
//  pxr/imaging/hd/renderSettingsSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/renderSettingsSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the RenderSettings entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream renderSettingsSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource, type HdVectorDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdBoolDataSource, HdPathDataSource, HdTokenArrayDataSource, HdTokenDataSource, HdVec2dDataSource } from './dataSourceTypeDefs.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'
import { HdRenderProductVectorSchema, HdSampledDataSourceContainerSchema } from './schemaTypeDefs.ts'

/** renderSettingsSchema.h TF_DECLARE_PUBLIC_TOKENS(HdRenderSettingsSchemaTokens) */
export const HdRenderSettingsSchemaTokens = TfMakeTokens({
  renderSettings: 'renderSettings',
  namespacedSettings: 'namespacedSettings',
  active: 'active',
  camera: 'camera',
  disableMotionBlur: 'disableMotionBlur',
  disableDepthOfField: 'disableDepthOfField',
  renderProducts: 'renderProducts',
  includedPurposes: 'includedPurposes',
  materialBindingPurposes: 'materialBindingPurposes',
  renderingColorSpace: 'renderingColorSpace',
  unionedSamplingInterval: 'unionedSamplingInterval',
  useForLegacyRenderDelegateSettings: 'useForLegacyRenderDelegateSettings',
})

export class HdRenderSettingsSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** renderSettingsSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdRenderSettingsSchema {
    const ds = fromParentContainer?.Get(HdRenderSettingsSchemaTokens.renderSettings)
    return new HdRenderSettingsSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  // --(BEGIN CUSTOM CODE: Schema Methods)--

  private static _frameLocator: HdDataSourceLocator | undefined
  /** renderSettingsSchema.cpp: This locator is to pass along dirtying of the
   * currentFrame locator on the Scene Globals Scene Index through the render
   * Settings prim. (private token `frame`) */
  static getFrameLocator(): HdDataSourceLocator {
    return HdRenderSettingsSchema._frameLocator ??=
      HdRenderSettingsSchema.getDefaultLocator().append('frame')
  }
  // --(END CUSTOM CODE: Schema Methods)--

  getNamespacedSettings(): HdSampledDataSourceContainerSchema {
    return new HdSampledDataSourceContainerSchema(this._getContainerDataSource(HdRenderSettingsSchemaTokens.namespacedSettings))
  }

  getActive(): HdBoolDataSource | undefined {
    return this._getTypedDataSource<HdBoolDataSource>(HdRenderSettingsSchemaTokens.active)
  }

  getCamera(): HdPathDataSource | undefined {
    return this._getTypedDataSource<HdPathDataSource>(HdRenderSettingsSchemaTokens.camera)
  }

  getDisableMotionBlur(): HdBoolDataSource | undefined {
    return this._getTypedDataSource<HdBoolDataSource>(HdRenderSettingsSchemaTokens.disableMotionBlur)
  }

  getDisableDepthOfField(): HdBoolDataSource | undefined {
    return this._getTypedDataSource<HdBoolDataSource>(HdRenderSettingsSchemaTokens.disableDepthOfField)
  }

  getRenderProducts(): HdRenderProductVectorSchema {
    return new HdRenderProductVectorSchema(this._getVectorDataSource(HdRenderSettingsSchemaTokens.renderProducts))
  }

  getIncludedPurposes(): HdTokenArrayDataSource | undefined {
    return this._getTypedDataSource<HdTokenArrayDataSource>(HdRenderSettingsSchemaTokens.includedPurposes)
  }

  getMaterialBindingPurposes(): HdTokenArrayDataSource | undefined {
    return this._getTypedDataSource<HdTokenArrayDataSource>(HdRenderSettingsSchemaTokens.materialBindingPurposes)
  }

  getRenderingColorSpace(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdRenderSettingsSchemaTokens.renderingColorSpace)
  }

  /**
   * Frame-relative time interval representing the sampling window for data
   * relevant to motion blur. Renderers can use this interval when querying
   * time-sampled data (e.g., xforms, points, velocities, ...) to simulate
   * motion blur effects.
   *
   * Note: This closely relates to the (frame-relative) shutter interval of a
   * camera specified via shutter open and close times and is expected to span
   * the union of the shutter intervals of cameras used in generating the
   * render artifacts.
   */
  getUnionedSamplingInterval(): HdVec2dDataSource | undefined {
    return this._getTypedDataSource<HdVec2dDataSource>(HdRenderSettingsSchemaTokens.unionedSamplingInterval)
  }

  /**
   * A temporary field to transition to in-band render settings.
   *
   * This field will not exist in a pure Hydra 2.0 world since render settings
   * are always communicated in-band through the scene index. It mitigates the
   * risk for HdRenderDelegate's implementing both in-band render settings and
   * the legacy HdRenderDelegate::SetRenderSettings and those implementations
   * interact in complicated ways. That is, applications can use, for example,
   * an env var to switch between the new mechanism and direct calls to
   * HdRenderDelegate::SetRenderSettings to revert to the old behavior while
   * we address fall-out.
   *
   * This field changes the emulation layer HdRenderDelegateAdapterRenderer,
   * to set the legacy render settings on the legacy render delegate using
   * HdRenderDelegate::SetRenderSetting with the values provided by this
   * schema.
   */
  getUseForLegacyRenderDelegateSettings(): HdBoolDataSource | undefined {
    return this._getTypedDataSource<HdBoolDataSource>(HdRenderSettingsSchemaTokens.useForLegacyRenderDelegateSettings)
  }

  static getSchemaToken(): TfToken {
    return HdRenderSettingsSchemaTokens.renderSettings
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdRenderSettingsSchema._defaultLocator ??= new HdDataSourceLocator(HdRenderSettingsSchema.getSchemaToken())
  }

  private static _namespacedSettingsLocator: HdDataSourceLocator | undefined
  static getNamespacedSettingsLocator(): HdDataSourceLocator {
    return HdRenderSettingsSchema._namespacedSettingsLocator ??= HdRenderSettingsSchema.getDefaultLocator().append(HdRenderSettingsSchemaTokens.namespacedSettings)
  }

  private static _activeLocator: HdDataSourceLocator | undefined
  static getActiveLocator(): HdDataSourceLocator {
    return HdRenderSettingsSchema._activeLocator ??= HdRenderSettingsSchema.getDefaultLocator().append(HdRenderSettingsSchemaTokens.active)
  }

  private static _cameraLocator: HdDataSourceLocator | undefined
  static getCameraLocator(): HdDataSourceLocator {
    return HdRenderSettingsSchema._cameraLocator ??= HdRenderSettingsSchema.getDefaultLocator().append(HdRenderSettingsSchemaTokens.camera)
  }

  private static _disableMotionBlurLocator: HdDataSourceLocator | undefined
  static getDisableMotionBlurLocator(): HdDataSourceLocator {
    return HdRenderSettingsSchema._disableMotionBlurLocator ??= HdRenderSettingsSchema.getDefaultLocator().append(HdRenderSettingsSchemaTokens.disableMotionBlur)
  }

  private static _disableDepthOfFieldLocator: HdDataSourceLocator | undefined
  static getDisableDepthOfFieldLocator(): HdDataSourceLocator {
    return HdRenderSettingsSchema._disableDepthOfFieldLocator ??= HdRenderSettingsSchema.getDefaultLocator().append(HdRenderSettingsSchemaTokens.disableDepthOfField)
  }

  private static _renderProductsLocator: HdDataSourceLocator | undefined
  static getRenderProductsLocator(): HdDataSourceLocator {
    return HdRenderSettingsSchema._renderProductsLocator ??= HdRenderSettingsSchema.getDefaultLocator().append(HdRenderSettingsSchemaTokens.renderProducts)
  }

  private static _includedPurposesLocator: HdDataSourceLocator | undefined
  static getIncludedPurposesLocator(): HdDataSourceLocator {
    return HdRenderSettingsSchema._includedPurposesLocator ??= HdRenderSettingsSchema.getDefaultLocator().append(HdRenderSettingsSchemaTokens.includedPurposes)
  }

  private static _materialBindingPurposesLocator: HdDataSourceLocator | undefined
  static getMaterialBindingPurposesLocator(): HdDataSourceLocator {
    return HdRenderSettingsSchema._materialBindingPurposesLocator ??= HdRenderSettingsSchema.getDefaultLocator().append(HdRenderSettingsSchemaTokens.materialBindingPurposes)
  }

  private static _renderingColorSpaceLocator: HdDataSourceLocator | undefined
  static getRenderingColorSpaceLocator(): HdDataSourceLocator {
    return HdRenderSettingsSchema._renderingColorSpaceLocator ??= HdRenderSettingsSchema.getDefaultLocator().append(HdRenderSettingsSchemaTokens.renderingColorSpace)
  }

  private static _unionedSamplingIntervalLocator: HdDataSourceLocator | undefined
  static getUnionedSamplingIntervalLocator(): HdDataSourceLocator {
    return HdRenderSettingsSchema._unionedSamplingIntervalLocator ??= HdRenderSettingsSchema.getDefaultLocator().append(HdRenderSettingsSchemaTokens.unionedSamplingInterval)
  }

  private static _useForLegacyRenderDelegateSettingsLocator: HdDataSourceLocator | undefined
  static getUseForLegacyRenderDelegateSettingsLocator(): HdDataSourceLocator {
    return HdRenderSettingsSchema._useForLegacyRenderDelegateSettingsLocator ??= HdRenderSettingsSchema.getDefaultLocator().append(HdRenderSettingsSchemaTokens.useForLegacyRenderDelegateSettings)
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    namespacedSettings?: HdContainerDataSource | undefined,
    active?: HdBoolDataSource | undefined,
    camera?: HdPathDataSource | undefined,
    disableMotionBlur?: HdBoolDataSource | undefined,
    disableDepthOfField?: HdBoolDataSource | undefined,
    renderProducts?: HdVectorDataSource | undefined,
    includedPurposes?: HdTokenArrayDataSource | undefined,
    materialBindingPurposes?: HdTokenArrayDataSource | undefined,
    renderingColorSpace?: HdTokenDataSource | undefined,
    unionedSamplingInterval?: HdVec2dDataSource | undefined,
    useForLegacyRenderDelegateSettings?: HdBoolDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdRenderSettingsSchemaTokens.namespacedSettings]: namespacedSettings,
      [HdRenderSettingsSchemaTokens.active]: active,
      [HdRenderSettingsSchemaTokens.camera]: camera,
      [HdRenderSettingsSchemaTokens.disableMotionBlur]: disableMotionBlur,
      [HdRenderSettingsSchemaTokens.disableDepthOfField]: disableDepthOfField,
      [HdRenderSettingsSchemaTokens.renderProducts]: renderProducts,
      [HdRenderSettingsSchemaTokens.includedPurposes]: includedPurposes,
      [HdRenderSettingsSchemaTokens.materialBindingPurposes]: materialBindingPurposes,
      [HdRenderSettingsSchemaTokens.renderingColorSpace]: renderingColorSpace,
      [HdRenderSettingsSchemaTokens.unionedSamplingInterval]: unionedSamplingInterval,
      [HdRenderSettingsSchemaTokens.useForLegacyRenderDelegateSettings]: useForLegacyRenderDelegateSettings,
    })
  }
}

export namespace HdRenderSettingsSchema {
  /** HdRenderSettingsSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _namespacedSettings: HdContainerDataSource | undefined
    private _active: HdBoolDataSource | undefined
    private _camera: HdPathDataSource | undefined
    private _disableMotionBlur: HdBoolDataSource | undefined
    private _disableDepthOfField: HdBoolDataSource | undefined
    private _renderProducts: HdVectorDataSource | undefined
    private _includedPurposes: HdTokenArrayDataSource | undefined
    private _materialBindingPurposes: HdTokenArrayDataSource | undefined
    private _renderingColorSpace: HdTokenDataSource | undefined
    private _unionedSamplingInterval: HdVec2dDataSource | undefined
    private _useForLegacyRenderDelegateSettings: HdBoolDataSource | undefined
    setNamespacedSettings(namespacedSettings: HdContainerDataSource | undefined): this {
      this._namespacedSettings = namespacedSettings
      return this
    }
    setActive(active: HdBoolDataSource | undefined): this {
      this._active = active
      return this
    }
    setCamera(camera: HdPathDataSource | undefined): this {
      this._camera = camera
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
    setRenderProducts(renderProducts: HdVectorDataSource | undefined): this {
      this._renderProducts = renderProducts
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
    setUnionedSamplingInterval(unionedSamplingInterval: HdVec2dDataSource | undefined): this {
      this._unionedSamplingInterval = unionedSamplingInterval
      return this
    }
    setUseForLegacyRenderDelegateSettings(useForLegacyRenderDelegateSettings: HdBoolDataSource | undefined): this {
      this._useForLegacyRenderDelegateSettings = useForLegacyRenderDelegateSettings
      return this
    }
    build(): HdContainerDataSource {
      return HdRenderSettingsSchema.buildRetained(
        this._namespacedSettings,
        this._active,
        this._camera,
        this._disableMotionBlur,
        this._disableDepthOfField,
        this._renderProducts,
        this._includedPurposes,
        this._materialBindingPurposes,
        this._renderingColorSpace,
        this._unionedSamplingInterval,
        this._useForLegacyRenderDelegateSettings,
      )
    }
  }
}

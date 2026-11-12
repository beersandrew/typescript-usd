// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdSkelImaging/animationSchema.cpp,
//  pxr/usdImaging/usdSkelImaging/animationSchema.h,
//  pxr/usdImaging/usdSkelImaging/hdSchemaDefs.py
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdSkelImaging/animationSchema.{h,cpp} (OpenUSD 26.11.1), generated
// from the Animation entry of pxr/usdImaging/usdSkelImaging/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates (same shape as
// pxr/imaging/hd/src/extComputationSchema.ts).

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { ContainerDataSource as HdContainerDataSource, Schema as HdSchema, _HdBuildRetained, DataSourceLocator as HdDataSourceLocator, type TokenArrayDataSource as HdTokenArrayDataSource, type FloatArrayDataSource as HdFloatArrayDataSource, type TypedSampledDataSource as HdTypedSampledDataSource } from 'typescript-usd/hd'
import type { Vec3f as GfVec3f, Quatf as GfQuatf, Vec3h as GfVec3h } from 'typescript-usd/gf'
import type { Array as VtArray } from 'typescript-usd/vt'

/** animationSchema.h:44 TF_DECLARE_PUBLIC_TOKENS(UsdSkelImagingAnimationSchemaTokens) */
export const UsdSkelImagingAnimationSchemaTokens = TfMakeTokens({
  skelAnimation: 'skelAnimation',
  joints: 'joints',
  translations: 'translations',
  rotations: 'rotations',
  scales: 'scales',
  blendShapes: 'blendShapes',
  blendShapeWeights: 'blendShapeWeights',
})

/** animationSchema.h:50 */
export class UsdSkelImagingAnimationSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** animationSchema.cpp:188 */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): UsdSkelImagingAnimationSchema {
    const ds = fromParentContainer?.Get(UsdSkelImagingAnimationSchemaTokens.skelAnimation)
    return new UsdSkelImagingAnimationSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  /** animationSchema.cpp:36 */
  getJoints(): HdTokenArrayDataSource | undefined {
    return this._getTypedDataSource<HdTokenArrayDataSource>(UsdSkelImagingAnimationSchemaTokens.joints)
  }

  /** animationSchema.cpp:43 */
  getTranslations(): HdTypedSampledDataSource<VtArray<GfVec3f>> | undefined {
    return this._getTypedDataSource<HdTypedSampledDataSource<VtArray<GfVec3f>>>(UsdSkelImagingAnimationSchemaTokens.translations)
  }

  /** animationSchema.cpp:50 */
  getRotations(): HdTypedSampledDataSource<VtArray<GfQuatf>> | undefined {
    return this._getTypedDataSource<HdTypedSampledDataSource<VtArray<GfQuatf>>>(UsdSkelImagingAnimationSchemaTokens.rotations)
  }

  /** animationSchema.cpp:57 */
  getScales(): HdTypedSampledDataSource<VtArray<GfVec3h>> | undefined {
    return this._getTypedDataSource<HdTypedSampledDataSource<VtArray<GfVec3h>>>(UsdSkelImagingAnimationSchemaTokens.scales)
  }

  /** animationSchema.cpp:64 */
  getBlendShapes(): HdTokenArrayDataSource | undefined {
    return this._getTypedDataSource<HdTokenArrayDataSource>(UsdSkelImagingAnimationSchemaTokens.blendShapes)
  }

  /** animationSchema.cpp:71 */
  getBlendShapeWeights(): HdFloatArrayDataSource | undefined {
    return this._getTypedDataSource<HdFloatArrayDataSource>(UsdSkelImagingAnimationSchemaTokens.blendShapeWeights)
  }

  /** animationSchema.cpp:200 */
  static getSchemaToken(): TfToken {
    return UsdSkelImagingAnimationSchemaTokens.skelAnimation
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  /** animationSchema.cpp:207 */
  static getDefaultLocator(): HdDataSourceLocator {
    return UsdSkelImagingAnimationSchema._defaultLocator ??= new HdDataSourceLocator(UsdSkelImagingAnimationSchema.getSchemaToken())
  }

  private static _jointsLocator: HdDataSourceLocator | undefined
  /** animationSchema.cpp:215 */
  static getJointsLocator(): HdDataSourceLocator {
    return UsdSkelImagingAnimationSchema._jointsLocator ??= UsdSkelImagingAnimationSchema.getDefaultLocator().append(UsdSkelImagingAnimationSchemaTokens.joints)
  }

  private static _translationsLocator: HdDataSourceLocator | undefined
  /** animationSchema.cpp:225 */
  static getTranslationsLocator(): HdDataSourceLocator {
    return UsdSkelImagingAnimationSchema._translationsLocator ??= UsdSkelImagingAnimationSchema.getDefaultLocator().append(UsdSkelImagingAnimationSchemaTokens.translations)
  }

  private static _rotationsLocator: HdDataSourceLocator | undefined
  /** animationSchema.cpp:235 */
  static getRotationsLocator(): HdDataSourceLocator {
    return UsdSkelImagingAnimationSchema._rotationsLocator ??= UsdSkelImagingAnimationSchema.getDefaultLocator().append(UsdSkelImagingAnimationSchemaTokens.rotations)
  }

  private static _scalesLocator: HdDataSourceLocator | undefined
  /** animationSchema.cpp:245 */
  static getScalesLocator(): HdDataSourceLocator {
    return UsdSkelImagingAnimationSchema._scalesLocator ??= UsdSkelImagingAnimationSchema.getDefaultLocator().append(UsdSkelImagingAnimationSchemaTokens.scales)
  }

  private static _blendShapesLocator: HdDataSourceLocator | undefined
  /** animationSchema.cpp:255 */
  static getBlendShapesLocator(): HdDataSourceLocator {
    return UsdSkelImagingAnimationSchema._blendShapesLocator ??= UsdSkelImagingAnimationSchema.getDefaultLocator().append(UsdSkelImagingAnimationSchemaTokens.blendShapes)
  }

  private static _blendShapeWeightsLocator: HdDataSourceLocator | undefined
  /** animationSchema.cpp:265 */
  static getBlendShapeWeightsLocator(): HdDataSourceLocator {
    return UsdSkelImagingAnimationSchema._blendShapeWeightsLocator ??= UsdSkelImagingAnimationSchema.getDefaultLocator().append(UsdSkelImagingAnimationSchemaTokens.blendShapeWeights)
  }

  /** @deprecated Use Builder instead. (animationSchema.cpp:79) */
  static buildRetained(
    joints?: HdTokenArrayDataSource | undefined,
    translations?: HdTypedSampledDataSource<VtArray<GfVec3f>> | undefined,
    rotations?: HdTypedSampledDataSource<VtArray<GfQuatf>> | undefined,
    scales?: HdTypedSampledDataSource<VtArray<GfVec3h>> | undefined,
    blendShapes?: HdTokenArrayDataSource | undefined,
    blendShapeWeights?: HdFloatArrayDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [UsdSkelImagingAnimationSchemaTokens.joints]: joints,
      [UsdSkelImagingAnimationSchemaTokens.translations]: translations,
      [UsdSkelImagingAnimationSchemaTokens.rotations]: rotations,
      [UsdSkelImagingAnimationSchemaTokens.scales]: scales,
      [UsdSkelImagingAnimationSchemaTokens.blendShapes]: blendShapes,
      [UsdSkelImagingAnimationSchemaTokens.blendShapeWeights]: blendShapeWeights,
    })
  }
}

export namespace UsdSkelImagingAnimationSchema {
  /** UsdSkelImagingAnimationSchema::Builder (animationSchema.cpp:126) */
  export class Builder {
    private _joints: HdTokenArrayDataSource | undefined
    private _translations: HdTypedSampledDataSource<VtArray<GfVec3f>> | undefined
    private _rotations: HdTypedSampledDataSource<VtArray<GfQuatf>> | undefined
    private _scales: HdTypedSampledDataSource<VtArray<GfVec3h>> | undefined
    private _blendShapes: HdTokenArrayDataSource | undefined
    private _blendShapeWeights: HdFloatArrayDataSource | undefined
    setJoints(joints: HdTokenArrayDataSource | undefined): this {
      this._joints = joints
      return this
    }
    setTranslations(translations: HdTypedSampledDataSource<VtArray<GfVec3f>> | undefined): this {
      this._translations = translations
      return this
    }
    setRotations(rotations: HdTypedSampledDataSource<VtArray<GfQuatf>> | undefined): this {
      this._rotations = rotations
      return this
    }
    setScales(scales: HdTypedSampledDataSource<VtArray<GfVec3h>> | undefined): this {
      this._scales = scales
      return this
    }
    setBlendShapes(blendShapes: HdTokenArrayDataSource | undefined): this {
      this._blendShapes = blendShapes
      return this
    }
    setBlendShapeWeights(blendShapeWeights: HdFloatArrayDataSource | undefined): this {
      this._blendShapeWeights = blendShapeWeights
      return this
    }
    build(): HdContainerDataSource {
      return UsdSkelImagingAnimationSchema.buildRetained(
        this._joints,
        this._translations,
        this._rotations,
        this._scales,
        this._blendShapes,
        this._blendShapeWeights,
      )
    }
  }
}

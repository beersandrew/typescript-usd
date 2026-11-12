// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdSkelImaging/resolvedSkeletonSchema.cpp,
//  pxr/usdImaging/usdSkelImaging/resolvedSkeletonSchema.h,
//  pxr/usdImaging/usdSkelImaging/hdSchemaDefs.py
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdSkelImaging/resolvedSkeletonSchema.{h,cpp} (OpenUSD 26.11.1), generated
// from the ResolvedSkeleton entry of pxr/usdImaging/usdSkelImaging/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates (same shape as
// pxr/imaging/hd/src/extComputationSchema.ts).

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { ContainerDataSource as HdContainerDataSource, Schema as HdSchema, _HdBuildRetained, DataSourceLocator as HdDataSourceLocator, type TokenArrayDataSource as HdTokenArrayDataSource, type FloatArrayDataSource as HdFloatArrayDataSource, type TypedSampledDataSource as HdTypedSampledDataSource } from 'typescript-usd/hd'
import type { Matrix4d as GfMatrix4d, Matrix4f as GfMatrix4f, Vec2i as GfVec2i } from 'typescript-usd/gf'
import type { Array as VtArray } from 'typescript-usd/vt'

/** resolvedSkeletonSchema.h:43 TF_DECLARE_PUBLIC_TOKENS(UsdSkelImagingResolvedSkeletonSchemaTokens) */
export const UsdSkelImagingResolvedSkeletonSchemaTokens = TfMakeTokens({
  resolvedSkeleton: 'resolvedSkeleton',
  skelLocalToCommonSpace: 'skelLocalToCommonSpace',
  skinningTransforms: 'skinningTransforms',
  blendShapes: 'blendShapes',
  blendShapeWeights: 'blendShapeWeights',
  blendShapeRanges: 'blendShapeRanges',
})

/** resolvedSkeletonSchema.h:49 */
export class UsdSkelImagingResolvedSkeletonSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** resolvedSkeletonSchema.cpp:166 */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): UsdSkelImagingResolvedSkeletonSchema {
    const ds = fromParentContainer?.Get(UsdSkelImagingResolvedSkeletonSchemaTokens.resolvedSkeleton)
    return new UsdSkelImagingResolvedSkeletonSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  /** resolvedSkeletonSchema.cpp:36 */
  getSkelLocalToCommonSpace(): HdTypedSampledDataSource<GfMatrix4d> | undefined {
    return this._getTypedDataSource<HdTypedSampledDataSource<GfMatrix4d>>(UsdSkelImagingResolvedSkeletonSchemaTokens.skelLocalToCommonSpace)
  }

  /** resolvedSkeletonSchema.cpp:43 */
  getSkinningTransforms(): HdTypedSampledDataSource<VtArray<GfMatrix4f>> | undefined {
    return this._getTypedDataSource<HdTypedSampledDataSource<VtArray<GfMatrix4f>>>(UsdSkelImagingResolvedSkeletonSchemaTokens.skinningTransforms)
  }

  /** resolvedSkeletonSchema.cpp:50 */
  getBlendShapes(): HdTokenArrayDataSource | undefined {
    return this._getTypedDataSource<HdTokenArrayDataSource>(UsdSkelImagingResolvedSkeletonSchemaTokens.blendShapes)
  }

  /** resolvedSkeletonSchema.cpp:57 */
  getBlendShapeWeights(): HdFloatArrayDataSource | undefined {
    return this._getTypedDataSource<HdFloatArrayDataSource>(UsdSkelImagingResolvedSkeletonSchemaTokens.blendShapeWeights)
  }

  /** resolvedSkeletonSchema.cpp:64 */
  getBlendShapeRanges(): HdTypedSampledDataSource<VtArray<GfVec2i>> | undefined {
    return this._getTypedDataSource<HdTypedSampledDataSource<VtArray<GfVec2i>>>(UsdSkelImagingResolvedSkeletonSchemaTokens.blendShapeRanges)
  }

  /** resolvedSkeletonSchema.cpp:178 */
  static getSchemaToken(): TfToken {
    return UsdSkelImagingResolvedSkeletonSchemaTokens.resolvedSkeleton
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  /** resolvedSkeletonSchema.cpp:185 */
  static getDefaultLocator(): HdDataSourceLocator {
    return UsdSkelImagingResolvedSkeletonSchema._defaultLocator ??= new HdDataSourceLocator(UsdSkelImagingResolvedSkeletonSchema.getSchemaToken())
  }

  private static _skelLocalToCommonSpaceLocator: HdDataSourceLocator | undefined
  /** resolvedSkeletonSchema.cpp:193 */
  static getSkelLocalToCommonSpaceLocator(): HdDataSourceLocator {
    return UsdSkelImagingResolvedSkeletonSchema._skelLocalToCommonSpaceLocator ??= UsdSkelImagingResolvedSkeletonSchema.getDefaultLocator().append(UsdSkelImagingResolvedSkeletonSchemaTokens.skelLocalToCommonSpace)
  }

  private static _skinningTransformsLocator: HdDataSourceLocator | undefined
  /** resolvedSkeletonSchema.cpp:203 */
  static getSkinningTransformsLocator(): HdDataSourceLocator {
    return UsdSkelImagingResolvedSkeletonSchema._skinningTransformsLocator ??= UsdSkelImagingResolvedSkeletonSchema.getDefaultLocator().append(UsdSkelImagingResolvedSkeletonSchemaTokens.skinningTransforms)
  }

  private static _blendShapesLocator: HdDataSourceLocator | undefined
  /** resolvedSkeletonSchema.cpp:213 */
  static getBlendShapesLocator(): HdDataSourceLocator {
    return UsdSkelImagingResolvedSkeletonSchema._blendShapesLocator ??= UsdSkelImagingResolvedSkeletonSchema.getDefaultLocator().append(UsdSkelImagingResolvedSkeletonSchemaTokens.blendShapes)
  }

  private static _blendShapeWeightsLocator: HdDataSourceLocator | undefined
  /** resolvedSkeletonSchema.cpp:223 */
  static getBlendShapeWeightsLocator(): HdDataSourceLocator {
    return UsdSkelImagingResolvedSkeletonSchema._blendShapeWeightsLocator ??= UsdSkelImagingResolvedSkeletonSchema.getDefaultLocator().append(UsdSkelImagingResolvedSkeletonSchemaTokens.blendShapeWeights)
  }

  private static _blendShapeRangesLocator: HdDataSourceLocator | undefined
  /** resolvedSkeletonSchema.cpp:233 */
  static getBlendShapeRangesLocator(): HdDataSourceLocator {
    return UsdSkelImagingResolvedSkeletonSchema._blendShapeRangesLocator ??= UsdSkelImagingResolvedSkeletonSchema.getDefaultLocator().append(UsdSkelImagingResolvedSkeletonSchemaTokens.blendShapeRanges)
  }

  /** @deprecated Use Builder instead. (resolvedSkeletonSchema.cpp:72) */
  static buildRetained(
    skelLocalToCommonSpace?: HdTypedSampledDataSource<GfMatrix4d> | undefined,
    skinningTransforms?: HdTypedSampledDataSource<VtArray<GfMatrix4f>> | undefined,
    blendShapes?: HdTokenArrayDataSource | undefined,
    blendShapeWeights?: HdFloatArrayDataSource | undefined,
    blendShapeRanges?: HdTypedSampledDataSource<VtArray<GfVec2i>> | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [UsdSkelImagingResolvedSkeletonSchemaTokens.skelLocalToCommonSpace]: skelLocalToCommonSpace,
      [UsdSkelImagingResolvedSkeletonSchemaTokens.skinningTransforms]: skinningTransforms,
      [UsdSkelImagingResolvedSkeletonSchemaTokens.blendShapes]: blendShapes,
      [UsdSkelImagingResolvedSkeletonSchemaTokens.blendShapeWeights]: blendShapeWeights,
      [UsdSkelImagingResolvedSkeletonSchemaTokens.blendShapeRanges]: blendShapeRanges,
    })
  }
}

export namespace UsdSkelImagingResolvedSkeletonSchema {
  /** UsdSkelImagingResolvedSkeletonSchema::Builder (resolvedSkeletonSchema.cpp:113) */
  export class Builder {
    private _skelLocalToCommonSpace: HdTypedSampledDataSource<GfMatrix4d> | undefined
    private _skinningTransforms: HdTypedSampledDataSource<VtArray<GfMatrix4f>> | undefined
    private _blendShapes: HdTokenArrayDataSource | undefined
    private _blendShapeWeights: HdFloatArrayDataSource | undefined
    private _blendShapeRanges: HdTypedSampledDataSource<VtArray<GfVec2i>> | undefined
    setSkelLocalToCommonSpace(skelLocalToCommonSpace: HdTypedSampledDataSource<GfMatrix4d> | undefined): this {
      this._skelLocalToCommonSpace = skelLocalToCommonSpace
      return this
    }
    setSkinningTransforms(skinningTransforms: HdTypedSampledDataSource<VtArray<GfMatrix4f>> | undefined): this {
      this._skinningTransforms = skinningTransforms
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
    setBlendShapeRanges(blendShapeRanges: HdTypedSampledDataSource<VtArray<GfVec2i>> | undefined): this {
      this._blendShapeRanges = blendShapeRanges
      return this
    }
    build(): HdContainerDataSource {
      return UsdSkelImagingResolvedSkeletonSchema.buildRetained(
        this._skelLocalToCommonSpace,
        this._skinningTransforms,
        this._blendShapes,
        this._blendShapeWeights,
        this._blendShapeRanges,
      )
    }
  }
}

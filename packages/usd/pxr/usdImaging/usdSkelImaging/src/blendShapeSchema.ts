// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdSkelImaging/blendShapeSchema.cpp,
//  pxr/usdImaging/usdSkelImaging/blendShapeSchema.h,
//  pxr/usdImaging/usdSkelImaging/hdSchemaDefs.py
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdSkelImaging/blendShapeSchema.{h,cpp} (OpenUSD 26.11.1), generated
// from the BlendShape entry of pxr/usdImaging/usdSkelImaging/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates (same shape as
// pxr/imaging/hd/src/extComputationSchema.ts).

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { ContainerDataSource as HdContainerDataSource, Schema as HdSchema, _HdBuildRetained, DataSourceLocator as HdDataSourceLocator, ContainerOfSchemasSchema as HdContainerOfSchemasSchema, type IntArrayDataSource as HdIntArrayDataSource, type TypedSampledDataSource as HdTypedSampledDataSource } from 'typescript-usd/hd'
import type { Vec3f as GfVec3f } from 'typescript-usd/gf'
import type { Array as VtArray } from 'typescript-usd/vt'
import { UsdSkelImagingInbetweenShapeSchema } from './inbetweenShapeSchema.ts'

/** blendShapeSchema.h:45 TF_DECLARE_PUBLIC_TOKENS(UsdSkelImagingBlendShapeSchemaTokens) */
export const UsdSkelImagingBlendShapeSchemaTokens = TfMakeTokens({
  skelBlendShape: 'skelBlendShape',
  offsets: 'offsets',
  normalOffsets: 'normalOffsets',
  pointIndices: 'pointIndices',
  inbetweenShapes: 'inbetweenShapes',
})

// --(BEGIN CUSTOM CODE: Declares)--
/** blendShapeSchema.h:34-35 */
export class UsdSkelImagingInbetweenShapeContainerSchema extends HdContainerOfSchemasSchema<UsdSkelImagingInbetweenShapeSchema> {
  constructor(container?: HdContainerDataSource | undefined) { super(container, UsdSkelImagingInbetweenShapeSchema) }
}
// --(END CUSTOM CODE: Declares)--

/** blendShapeSchema.h:51 */
export class UsdSkelImagingBlendShapeSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** blendShapeSchema.cpp:144 */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): UsdSkelImagingBlendShapeSchema {
    const ds = fromParentContainer?.Get(UsdSkelImagingBlendShapeSchemaTokens.skelBlendShape)
    return new UsdSkelImagingBlendShapeSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  /** blendShapeSchema.cpp:36 */
  getOffsets(): HdTypedSampledDataSource<VtArray<GfVec3f>> | undefined {
    return this._getTypedDataSource<HdTypedSampledDataSource<VtArray<GfVec3f>>>(UsdSkelImagingBlendShapeSchemaTokens.offsets)
  }

  /** blendShapeSchema.cpp:43 */
  getNormalOffsets(): HdTypedSampledDataSource<VtArray<GfVec3f>> | undefined {
    return this._getTypedDataSource<HdTypedSampledDataSource<VtArray<GfVec3f>>>(UsdSkelImagingBlendShapeSchemaTokens.normalOffsets)
  }

  /** blendShapeSchema.cpp:50 */
  getPointIndices(): HdIntArrayDataSource | undefined {
    return this._getTypedDataSource<HdIntArrayDataSource>(UsdSkelImagingBlendShapeSchemaTokens.pointIndices)
  }

  /** blendShapeSchema.cpp:57 */
  getInbetweenShapes(): UsdSkelImagingInbetweenShapeContainerSchema {
    return new UsdSkelImagingInbetweenShapeContainerSchema(this._getContainerDataSource(UsdSkelImagingBlendShapeSchemaTokens.inbetweenShapes))
  }

  /** blendShapeSchema.cpp:156 */
  static getSchemaToken(): TfToken {
    return UsdSkelImagingBlendShapeSchemaTokens.skelBlendShape
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  /** blendShapeSchema.cpp:163 */
  static getDefaultLocator(): HdDataSourceLocator {
    return UsdSkelImagingBlendShapeSchema._defaultLocator ??= new HdDataSourceLocator(UsdSkelImagingBlendShapeSchema.getSchemaToken())
  }

  private static _offsetsLocator: HdDataSourceLocator | undefined
  /** blendShapeSchema.cpp:171 */
  static getOffsetsLocator(): HdDataSourceLocator {
    return UsdSkelImagingBlendShapeSchema._offsetsLocator ??= UsdSkelImagingBlendShapeSchema.getDefaultLocator().append(UsdSkelImagingBlendShapeSchemaTokens.offsets)
  }

  private static _normalOffsetsLocator: HdDataSourceLocator | undefined
  /** blendShapeSchema.cpp:181 */
  static getNormalOffsetsLocator(): HdDataSourceLocator {
    return UsdSkelImagingBlendShapeSchema._normalOffsetsLocator ??= UsdSkelImagingBlendShapeSchema.getDefaultLocator().append(UsdSkelImagingBlendShapeSchemaTokens.normalOffsets)
  }

  private static _pointIndicesLocator: HdDataSourceLocator | undefined
  /** blendShapeSchema.cpp:191 */
  static getPointIndicesLocator(): HdDataSourceLocator {
    return UsdSkelImagingBlendShapeSchema._pointIndicesLocator ??= UsdSkelImagingBlendShapeSchema.getDefaultLocator().append(UsdSkelImagingBlendShapeSchemaTokens.pointIndices)
  }

  private static _inbetweenShapesLocator: HdDataSourceLocator | undefined
  /** blendShapeSchema.cpp:201 */
  static getInbetweenShapesLocator(): HdDataSourceLocator {
    return UsdSkelImagingBlendShapeSchema._inbetweenShapesLocator ??= UsdSkelImagingBlendShapeSchema.getDefaultLocator().append(UsdSkelImagingBlendShapeSchemaTokens.inbetweenShapes)
  }

  /** @deprecated Use Builder instead. (blendShapeSchema.cpp:65) */
  static buildRetained(
    offsets?: HdTypedSampledDataSource<VtArray<GfVec3f>> | undefined,
    normalOffsets?: HdTypedSampledDataSource<VtArray<GfVec3f>> | undefined,
    pointIndices?: HdIntArrayDataSource | undefined,
    inbetweenShapes?: HdContainerDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [UsdSkelImagingBlendShapeSchemaTokens.offsets]: offsets,
      [UsdSkelImagingBlendShapeSchemaTokens.normalOffsets]: normalOffsets,
      [UsdSkelImagingBlendShapeSchemaTokens.pointIndices]: pointIndices,
      [UsdSkelImagingBlendShapeSchemaTokens.inbetweenShapes]: inbetweenShapes,
    })
  }
}

export namespace UsdSkelImagingBlendShapeSchema {
  /** UsdSkelImagingBlendShapeSchema::Builder (blendShapeSchema.cpp:100) */
  export class Builder {
    private _offsets: HdTypedSampledDataSource<VtArray<GfVec3f>> | undefined
    private _normalOffsets: HdTypedSampledDataSource<VtArray<GfVec3f>> | undefined
    private _pointIndices: HdIntArrayDataSource | undefined
    private _inbetweenShapes: HdContainerDataSource | undefined
    setOffsets(offsets: HdTypedSampledDataSource<VtArray<GfVec3f>> | undefined): this {
      this._offsets = offsets
      return this
    }
    setNormalOffsets(normalOffsets: HdTypedSampledDataSource<VtArray<GfVec3f>> | undefined): this {
      this._normalOffsets = normalOffsets
      return this
    }
    setPointIndices(pointIndices: HdIntArrayDataSource | undefined): this {
      this._pointIndices = pointIndices
      return this
    }
    setInbetweenShapes(inbetweenShapes: HdContainerDataSource | undefined): this {
      this._inbetweenShapes = inbetweenShapes
      return this
    }
    build(): HdContainerDataSource {
      return UsdSkelImagingBlendShapeSchema.buildRetained(
        this._offsets,
        this._normalOffsets,
        this._pointIndices,
        this._inbetweenShapes,
      )
    }
  }
}

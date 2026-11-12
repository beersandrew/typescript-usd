// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdSkelImaging/inbetweenShapeSchema.cpp,
//  pxr/usdImaging/usdSkelImaging/inbetweenShapeSchema.h,
//  pxr/usdImaging/usdSkelImaging/hdSchemaDefs.py
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdSkelImaging/inbetweenShapeSchema.{h,cpp} (OpenUSD 26.11.1), generated
// from the InbetweenShape entry of pxr/usdImaging/usdSkelImaging/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates (same shape as
// pxr/imaging/hd/src/extComputationSchema.ts).

import { MakeTokens as TfMakeTokens } from 'typescript-usd/tf'
import { ContainerDataSource as HdContainerDataSource, Schema as HdSchema, _HdBuildRetained, type FloatDataSource as HdFloatDataSource, type TypedSampledDataSource as HdTypedSampledDataSource } from 'typescript-usd/hd'
import type { Vec3f as GfVec3f } from 'typescript-usd/gf'
import type { Array as VtArray } from 'typescript-usd/vt'

/** inbetweenShapeSchema.h:40 TF_DECLARE_PUBLIC_TOKENS(UsdSkelImagingInbetweenShapeSchemaTokens) */
export const UsdSkelImagingInbetweenShapeSchemaTokens = TfMakeTokens({
  weight: 'weight',
  offsets: 'offsets',
  normalOffsets: 'normalOffsets',
})

/** inbetweenShapeSchema.h:46 */
export class UsdSkelImagingInbetweenShapeSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** inbetweenShapeSchema.cpp:36 */
  getWeight(): HdFloatDataSource | undefined {
    return this._getTypedDataSource<HdFloatDataSource>(UsdSkelImagingInbetweenShapeSchemaTokens.weight)
  }

  /** inbetweenShapeSchema.cpp:43 */
  getOffsets(): HdTypedSampledDataSource<VtArray<GfVec3f>> | undefined {
    return this._getTypedDataSource<HdTypedSampledDataSource<VtArray<GfVec3f>>>(UsdSkelImagingInbetweenShapeSchemaTokens.offsets)
  }

  /** inbetweenShapeSchema.cpp:50 */
  getNormalOffsets(): HdTypedSampledDataSource<VtArray<GfVec3f>> | undefined {
    return this._getTypedDataSource<HdTypedSampledDataSource<VtArray<GfVec3f>>>(UsdSkelImagingInbetweenShapeSchemaTokens.normalOffsets)
  }

  /** @deprecated Use Builder instead. (inbetweenShapeSchema.cpp:58) */
  static buildRetained(
    weight?: HdFloatDataSource | undefined,
    offsets?: HdTypedSampledDataSource<VtArray<GfVec3f>> | undefined,
    normalOffsets?: HdTypedSampledDataSource<VtArray<GfVec3f>> | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [UsdSkelImagingInbetweenShapeSchemaTokens.weight]: weight,
      [UsdSkelImagingInbetweenShapeSchemaTokens.offsets]: offsets,
      [UsdSkelImagingInbetweenShapeSchemaTokens.normalOffsets]: normalOffsets,
    })
  }
}

export namespace UsdSkelImagingInbetweenShapeSchema {
  /** UsdSkelImagingInbetweenShapeSchema::Builder (inbetweenShapeSchema.cpp:87) */
  export class Builder {
    private _weight: HdFloatDataSource | undefined
    private _offsets: HdTypedSampledDataSource<VtArray<GfVec3f>> | undefined
    private _normalOffsets: HdTypedSampledDataSource<VtArray<GfVec3f>> | undefined
    setWeight(weight: HdFloatDataSource | undefined): this {
      this._weight = weight
      return this
    }
    setOffsets(offsets: HdTypedSampledDataSource<VtArray<GfVec3f>> | undefined): this {
      this._offsets = offsets
      return this
    }
    setNormalOffsets(normalOffsets: HdTypedSampledDataSource<VtArray<GfVec3f>> | undefined): this {
      this._normalOffsets = normalOffsets
      return this
    }
    build(): HdContainerDataSource {
      return UsdSkelImagingInbetweenShapeSchema.buildRetained(
        this._weight,
        this._offsets,
        this._normalOffsets,
      )
    }
  }
}

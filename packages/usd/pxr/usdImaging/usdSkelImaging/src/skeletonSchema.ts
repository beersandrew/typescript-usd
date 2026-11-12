// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdSkelImaging/skeletonSchema.cpp,
//  pxr/usdImaging/usdSkelImaging/skeletonSchema.h,
//  pxr/usdImaging/usdSkelImaging/hdSchemaDefs.py
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdSkelImaging/skeletonSchema.{h,cpp} (OpenUSD 26.11.1), generated
// from the Skeleton entry of pxr/usdImaging/usdSkelImaging/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates (same shape as
// pxr/imaging/hd/src/extComputationSchema.ts).

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { ContainerDataSource as HdContainerDataSource, Schema as HdSchema, _HdBuildRetained, DataSourceLocator as HdDataSourceLocator, type TokenArrayDataSource as HdTokenArrayDataSource, type TypedSampledDataSource as HdTypedSampledDataSource } from 'typescript-usd/hd'
import type { Matrix4d as GfMatrix4d } from 'typescript-usd/gf'
import type { Array as VtArray } from 'typescript-usd/vt'

/** skeletonSchema.h:42 TF_DECLARE_PUBLIC_TOKENS(UsdSkelImagingSkeletonSchemaTokens) */
export const UsdSkelImagingSkeletonSchemaTokens = TfMakeTokens({
  skeleton: 'skeleton',
  joints: 'joints',
  jointNames: 'jointNames',
  bindTransforms: 'bindTransforms',
  restTransforms: 'restTransforms',
})

/** skeletonSchema.h:48 */
export class UsdSkelImagingSkeletonSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** skeletonSchema.cpp:144 */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): UsdSkelImagingSkeletonSchema {
    const ds = fromParentContainer?.Get(UsdSkelImagingSkeletonSchemaTokens.skeleton)
    return new UsdSkelImagingSkeletonSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  /** skeletonSchema.cpp:36 */
  getJoints(): HdTokenArrayDataSource | undefined {
    return this._getTypedDataSource<HdTokenArrayDataSource>(UsdSkelImagingSkeletonSchemaTokens.joints)
  }

  /** skeletonSchema.cpp:43 */
  getJointNames(): HdTokenArrayDataSource | undefined {
    return this._getTypedDataSource<HdTokenArrayDataSource>(UsdSkelImagingSkeletonSchemaTokens.jointNames)
  }

  /** skeletonSchema.cpp:50 */
  getBindTransforms(): HdTypedSampledDataSource<VtArray<GfMatrix4d>> | undefined {
    return this._getTypedDataSource<HdTypedSampledDataSource<VtArray<GfMatrix4d>>>(UsdSkelImagingSkeletonSchemaTokens.bindTransforms)
  }

  /** skeletonSchema.cpp:57 */
  getRestTransforms(): HdTypedSampledDataSource<VtArray<GfMatrix4d>> | undefined {
    return this._getTypedDataSource<HdTypedSampledDataSource<VtArray<GfMatrix4d>>>(UsdSkelImagingSkeletonSchemaTokens.restTransforms)
  }

  /** skeletonSchema.cpp:156 */
  static getSchemaToken(): TfToken {
    return UsdSkelImagingSkeletonSchemaTokens.skeleton
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  /** skeletonSchema.cpp:163 */
  static getDefaultLocator(): HdDataSourceLocator {
    return UsdSkelImagingSkeletonSchema._defaultLocator ??= new HdDataSourceLocator(UsdSkelImagingSkeletonSchema.getSchemaToken())
  }

  private static _jointsLocator: HdDataSourceLocator | undefined
  /** skeletonSchema.cpp:171 */
  static getJointsLocator(): HdDataSourceLocator {
    return UsdSkelImagingSkeletonSchema._jointsLocator ??= UsdSkelImagingSkeletonSchema.getDefaultLocator().append(UsdSkelImagingSkeletonSchemaTokens.joints)
  }

  private static _jointNamesLocator: HdDataSourceLocator | undefined
  /** skeletonSchema.cpp:181 */
  static getJointNamesLocator(): HdDataSourceLocator {
    return UsdSkelImagingSkeletonSchema._jointNamesLocator ??= UsdSkelImagingSkeletonSchema.getDefaultLocator().append(UsdSkelImagingSkeletonSchemaTokens.jointNames)
  }

  private static _bindTransformsLocator: HdDataSourceLocator | undefined
  /** skeletonSchema.cpp:191 */
  static getBindTransformsLocator(): HdDataSourceLocator {
    return UsdSkelImagingSkeletonSchema._bindTransformsLocator ??= UsdSkelImagingSkeletonSchema.getDefaultLocator().append(UsdSkelImagingSkeletonSchemaTokens.bindTransforms)
  }

  private static _restTransformsLocator: HdDataSourceLocator | undefined
  /** skeletonSchema.cpp:201 */
  static getRestTransformsLocator(): HdDataSourceLocator {
    return UsdSkelImagingSkeletonSchema._restTransformsLocator ??= UsdSkelImagingSkeletonSchema.getDefaultLocator().append(UsdSkelImagingSkeletonSchemaTokens.restTransforms)
  }

  /** @deprecated Use Builder instead. (skeletonSchema.cpp:65) */
  static buildRetained(
    joints?: HdTokenArrayDataSource | undefined,
    jointNames?: HdTokenArrayDataSource | undefined,
    bindTransforms?: HdTypedSampledDataSource<VtArray<GfMatrix4d>> | undefined,
    restTransforms?: HdTypedSampledDataSource<VtArray<GfMatrix4d>> | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [UsdSkelImagingSkeletonSchemaTokens.joints]: joints,
      [UsdSkelImagingSkeletonSchemaTokens.jointNames]: jointNames,
      [UsdSkelImagingSkeletonSchemaTokens.bindTransforms]: bindTransforms,
      [UsdSkelImagingSkeletonSchemaTokens.restTransforms]: restTransforms,
    })
  }
}

export namespace UsdSkelImagingSkeletonSchema {
  /** UsdSkelImagingSkeletonSchema::Builder (skeletonSchema.cpp:100) */
  export class Builder {
    private _joints: HdTokenArrayDataSource | undefined
    private _jointNames: HdTokenArrayDataSource | undefined
    private _bindTransforms: HdTypedSampledDataSource<VtArray<GfMatrix4d>> | undefined
    private _restTransforms: HdTypedSampledDataSource<VtArray<GfMatrix4d>> | undefined
    setJoints(joints: HdTokenArrayDataSource | undefined): this {
      this._joints = joints
      return this
    }
    setJointNames(jointNames: HdTokenArrayDataSource | undefined): this {
      this._jointNames = jointNames
      return this
    }
    setBindTransforms(bindTransforms: HdTypedSampledDataSource<VtArray<GfMatrix4d>> | undefined): this {
      this._bindTransforms = bindTransforms
      return this
    }
    setRestTransforms(restTransforms: HdTypedSampledDataSource<VtArray<GfMatrix4d>> | undefined): this {
      this._restTransforms = restTransforms
      return this
    }
    build(): HdContainerDataSource {
      return UsdSkelImagingSkeletonSchema.buildRetained(
        this._joints,
        this._jointNames,
        this._bindTransforms,
        this._restTransforms,
      )
    }
  }
}

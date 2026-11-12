// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdSkelImaging/bindingSchema.cpp,
//  pxr/usdImaging/usdSkelImaging/bindingSchema.h,
//  pxr/usdImaging/usdSkelImaging/hdSchemaDefs.py
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdSkelImaging/bindingSchema.{h,cpp} (OpenUSD 26.11.1), generated
// from the Binding entry of pxr/usdImaging/usdSkelImaging/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates (same shape as
// pxr/imaging/hd/src/extComputationSchema.ts).

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { ContainerDataSource as HdContainerDataSource, Schema as HdSchema, _HdBuildRetained, DataSourceLocator as HdDataSourceLocator, type PathDataSource as HdPathDataSource, type TokenArrayDataSource as HdTokenArrayDataSource, type PathArrayDataSource as HdPathArrayDataSource, type BoolDataSource as HdBoolDataSource } from 'typescript-usd/hd'

/** bindingSchema.h:48 TF_DECLARE_PUBLIC_TOKENS(UsdSkelImagingBindingSchemaTokens) */
export const UsdSkelImagingBindingSchemaTokens = TfMakeTokens({
  skelBinding: 'skelBinding',
  animationSource: 'animationSource',
  skeleton: 'skeleton',
  joints: 'joints',
  blendShapes: 'blendShapes',
  blendShapeTargets: 'blendShapeTargets',
  hasSkelRoot: 'hasSkelRoot',
  skinningMethodPrimvar: 'skel:skinningMethod',
  geomBindTransformPrimvar: 'skel:geomBindTransform',
  jointIndicesPrimvar: 'skel:jointIndices',
  jointWeightsPrimvar: 'skel:jointWeights',
})

/** bindingSchema.h:54 */
export class UsdSkelImagingBindingSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** bindingSchema.cpp:188 */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): UsdSkelImagingBindingSchema {
    const ds = fromParentContainer?.Get(UsdSkelImagingBindingSchemaTokens.skelBinding)
    return new UsdSkelImagingBindingSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  /** bindingSchema.cpp:36 */
  getAnimationSource(): HdPathDataSource | undefined {
    return this._getTypedDataSource<HdPathDataSource>(UsdSkelImagingBindingSchemaTokens.animationSource)
  }

  /** bindingSchema.cpp:43 */
  getSkeleton(): HdPathDataSource | undefined {
    return this._getTypedDataSource<HdPathDataSource>(UsdSkelImagingBindingSchemaTokens.skeleton)
  }

  /** bindingSchema.cpp:50 */
  getJoints(): HdTokenArrayDataSource | undefined {
    return this._getTypedDataSource<HdTokenArrayDataSource>(UsdSkelImagingBindingSchemaTokens.joints)
  }

  /** bindingSchema.cpp:57 */
  getBlendShapes(): HdTokenArrayDataSource | undefined {
    return this._getTypedDataSource<HdTokenArrayDataSource>(UsdSkelImagingBindingSchemaTokens.blendShapes)
  }

  /** bindingSchema.cpp:64 */
  getBlendShapeTargets(): HdPathArrayDataSource | undefined {
    return this._getTypedDataSource<HdPathArrayDataSource>(UsdSkelImagingBindingSchemaTokens.blendShapeTargets)
  }

  /** bindingSchema.cpp:71 */
  getHasSkelRoot(): HdBoolDataSource | undefined {
    return this._getTypedDataSource<HdBoolDataSource>(UsdSkelImagingBindingSchemaTokens.hasSkelRoot)
  }

  /** bindingSchema.cpp:200 */
  static getSchemaToken(): TfToken {
    return UsdSkelImagingBindingSchemaTokens.skelBinding
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  /** bindingSchema.cpp:207 */
  static getDefaultLocator(): HdDataSourceLocator {
    return UsdSkelImagingBindingSchema._defaultLocator ??= new HdDataSourceLocator(UsdSkelImagingBindingSchema.getSchemaToken())
  }

  private static _animationSourceLocator: HdDataSourceLocator | undefined
  /** bindingSchema.cpp:215 */
  static getAnimationSourceLocator(): HdDataSourceLocator {
    return UsdSkelImagingBindingSchema._animationSourceLocator ??= UsdSkelImagingBindingSchema.getDefaultLocator().append(UsdSkelImagingBindingSchemaTokens.animationSource)
  }

  private static _skeletonLocator: HdDataSourceLocator | undefined
  /** bindingSchema.cpp:225 */
  static getSkeletonLocator(): HdDataSourceLocator {
    return UsdSkelImagingBindingSchema._skeletonLocator ??= UsdSkelImagingBindingSchema.getDefaultLocator().append(UsdSkelImagingBindingSchemaTokens.skeleton)
  }

  private static _jointsLocator: HdDataSourceLocator | undefined
  /** bindingSchema.cpp:235 */
  static getJointsLocator(): HdDataSourceLocator {
    return UsdSkelImagingBindingSchema._jointsLocator ??= UsdSkelImagingBindingSchema.getDefaultLocator().append(UsdSkelImagingBindingSchemaTokens.joints)
  }

  private static _blendShapesLocator: HdDataSourceLocator | undefined
  /** bindingSchema.cpp:245 */
  static getBlendShapesLocator(): HdDataSourceLocator {
    return UsdSkelImagingBindingSchema._blendShapesLocator ??= UsdSkelImagingBindingSchema.getDefaultLocator().append(UsdSkelImagingBindingSchemaTokens.blendShapes)
  }

  private static _blendShapeTargetsLocator: HdDataSourceLocator | undefined
  /** bindingSchema.cpp:255 */
  static getBlendShapeTargetsLocator(): HdDataSourceLocator {
    return UsdSkelImagingBindingSchema._blendShapeTargetsLocator ??= UsdSkelImagingBindingSchema.getDefaultLocator().append(UsdSkelImagingBindingSchemaTokens.blendShapeTargets)
  }

  private static _hasSkelRootLocator: HdDataSourceLocator | undefined
  /** bindingSchema.cpp:265 */
  static getHasSkelRootLocator(): HdDataSourceLocator {
    return UsdSkelImagingBindingSchema._hasSkelRootLocator ??= UsdSkelImagingBindingSchema.getDefaultLocator().append(UsdSkelImagingBindingSchemaTokens.hasSkelRoot)
  }

  /** @deprecated Use Builder instead. (bindingSchema.cpp:79) */
  static buildRetained(
    animationSource?: HdPathDataSource | undefined,
    skeleton?: HdPathDataSource | undefined,
    joints?: HdTokenArrayDataSource | undefined,
    blendShapes?: HdTokenArrayDataSource | undefined,
    blendShapeTargets?: HdPathArrayDataSource | undefined,
    hasSkelRoot?: HdBoolDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [UsdSkelImagingBindingSchemaTokens.animationSource]: animationSource,
      [UsdSkelImagingBindingSchemaTokens.skeleton]: skeleton,
      [UsdSkelImagingBindingSchemaTokens.joints]: joints,
      [UsdSkelImagingBindingSchemaTokens.blendShapes]: blendShapes,
      [UsdSkelImagingBindingSchemaTokens.blendShapeTargets]: blendShapeTargets,
      [UsdSkelImagingBindingSchemaTokens.hasSkelRoot]: hasSkelRoot,
    })
  }
}

export namespace UsdSkelImagingBindingSchema {
  /** UsdSkelImagingBindingSchema::Builder (bindingSchema.cpp:126) */
  export class Builder {
    private _animationSource: HdPathDataSource | undefined
    private _skeleton: HdPathDataSource | undefined
    private _joints: HdTokenArrayDataSource | undefined
    private _blendShapes: HdTokenArrayDataSource | undefined
    private _blendShapeTargets: HdPathArrayDataSource | undefined
    private _hasSkelRoot: HdBoolDataSource | undefined
    setAnimationSource(animationSource: HdPathDataSource | undefined): this {
      this._animationSource = animationSource
      return this
    }
    setSkeleton(skeleton: HdPathDataSource | undefined): this {
      this._skeleton = skeleton
      return this
    }
    setJoints(joints: HdTokenArrayDataSource | undefined): this {
      this._joints = joints
      return this
    }
    setBlendShapes(blendShapes: HdTokenArrayDataSource | undefined): this {
      this._blendShapes = blendShapes
      return this
    }
    setBlendShapeTargets(blendShapeTargets: HdPathArrayDataSource | undefined): this {
      this._blendShapeTargets = blendShapeTargets
      return this
    }
    setHasSkelRoot(hasSkelRoot: HdBoolDataSource | undefined): this {
      this._hasSkelRoot = hasSkelRoot
      return this
    }
    build(): HdContainerDataSource {
      return UsdSkelImagingBindingSchema.buildRetained(
        this._animationSource,
        this._skeleton,
        this._joints,
        this._blendShapes,
        this._blendShapeTargets,
        this._hasSkelRoot,
      )
    }
  }
}

// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdSkelImaging/dataSourceResolvedPointsBasedPrim.cpp,
//  pxr/usdImaging/usdSkelImaging/dataSourceResolvedPointsBasedPrim.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdSkelImaging/dataSourceResolvedPointsBasedPrim.{h,cpp}
// (OpenUSD 26.11.1).
//
// Divergences:
// - Scalar ext computation input values (_ToDataSource,
//   dataSourceResolvedPointsBasedPrim.cpp:49-54) are retained data sources
//   carrying their Vt value type (int, bool, GfMatrix4f), since a JavaScript
//   number does not say int vs float.
// - Typed array values are VtArrays with the upstream element types
//   (GfMatrix4f, GfMatrix3f, GfVec4f, float, ...).

import {
  DualQuatf as GfDualQuatf, Matrix3f as GfMatrix3f, Matrix4d as GfMatrix4d, Matrix4f as GfMatrix4f,
  Quatf as GfQuatf, Vec3f as GfVec3f, Vec4f as GfVec4f, type Vec2i as GfVec2i,
} from 'typescript-usd/gf'
import {
  BlockDataSource as HdBlockDataSource, ContainerDataSource as HdContainerDataSource,
  DataSourceLocatorSet as HdDataSourceLocatorSet, ExtComputationPrimvarSchema as HdExtComputationPrimvarSchema,
  ExtComputationPrimvarsSchema as HdExtComputationPrimvarsSchema, ExtComputationSchema as HdExtComputationSchema,
  MeshSchema as HdMeshSchema, MeshSchemaTokens as HdMeshSchemaTokens,
  MeshTopologySchemaTokens as HdMeshTopologySchemaTokens, OverlayContainerDataSource as HdOverlayContainerDataSource,
  PrimTypeTokens as HdPrimTypeTokens, PrimvarSchemaTokens as HdPrimvarSchemaTokens,
  PrimvarsSchema as HdPrimvarsSchema, PrimvarsSchemaTokens as HdPrimvarsSchemaTokens,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource, SampledDataSource as HdSampledDataSource,
  SkinningInputTokens as HdSkinningInputTokens, SkinningSettings as HdSkinningSettings,
  SkinningSkelInputTokens as HdSkinningSkelInputTokens, Type as HdType,
  TypedSampledDataSource as HdTypedSampledDataSource,
  type DataSourceBase as HdDataSourceBase, type DataSourceLocator as HdDataSourceLocator,
  type DirtiedPrimEntry as HdDirtiedPrimEntry, type SceneIndexBase as HdSceneIndexBase,
  type TokenArrayDataSource as HdTokenArrayDataSource, type FloatArrayDataSource as HdFloatArrayDataSource,
} from 'typescript-usd/hd'
import { OpenSubdivTokens as PxOsdOpenSubdivTokens } from 'typescript-usd/pxOsd'
import { TfDiagnosticMgr, TfGetEnvSetting, Type as TfType } from 'typescript-usd/tf'
import { Tokens as UsdSkelTokens } from 'typescript-usd/usdSkel'
import { Array as VtArray, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { UsdSkelImagingBindingSchema, UsdSkelImagingBindingSchemaTokens } from './bindingSchema.ts'
import {
  UsdSkelImagingComputeBlendShapeData, UsdSkelImagingComputeBlendShapeWeights,
  type UsdSkelImagingBlendShapeData,
} from './blendShapeData.ts'
import { UsdSkelImagingBlendShapeSchema } from './blendShapeSchema.ts'
import { UsdSkelImaging_DataSourcePrimvar } from './dataSourcePrimvar.ts'
import {
  _UsdSkelImagingGetArray, _UsdSkelImagingToArray, UsdSkelImagingGetTypedValue,
  UsdSkelImagingSharedPtrThunk,
} from './dataSourceUtils.ts'
import { USDSKELIMAGING_ENABLE_NORMAL_COMPUTATIONS } from './extComputations.ts'
import {
  UsdSkelImagingComputeJointInfluencesData, type UsdSkelImagingJointInfluencesData,
} from './jointInfluencesData.ts'
import { UsdSkelImagingResolvedSkeletonSchema } from './resolvedSkeletonSchema.ts'
import { UsdSkelImagingSkeletonSchema } from './skeletonSchema.ts'
import {
  UsdSkelImagingExtAggregatorComputationInputNameTokens, UsdSkelImagingExtComputationInputNameTokens,
  UsdSkelImagingExtComputationNameTokens, UsdSkelImagingExtComputationOutputNameTokens,
  UsdSkelImagingPrimTypeTokens,
} from './tokens.ts'
import { UsdSkelImagingDataSourceXformResolver } from './xformResolver.ts'

type HdMatrixDataSource = HdTypedSampledDataSource<GfMatrix4d>
type HdMatrix4fArrayDataSource = HdTypedSampledDataSource<VtArray<GfMatrix4f>>
type HdMatrix3fArrayDataSource = HdTypedSampledDataSource<VtArray<GfMatrix3f>>
type HdVec4fArrayDataSource = HdTypedSampledDataSource<VtArray<GfVec4f>>
type HdVec2iArrayDataSource = HdTypedSampledDataSource<VtArray<GfVec2i>>

const _GfMatrix4fType = TfType.declare('GfMatrix4f')
const _GfMatrix3fType = TfType.declare('GfMatrix3f')

function TF_WARN(message: string): void {
  TfDiagnosticMgr.GetInstance().postWarning(message)
}

/** SdfPath::AppendChild for the string paths of this port. */
function _AppendChild(path: string, name: string): string {
  return path === '/' ? '/' + name : path + '/' + name
}

/** dataSourceResolvedPointsBasedPrim.cpp:49-54 (see the header). */
function _ToDataSource(value: unknown, valueType?: TfType): HdDataSourceBase {
  return new HdRetainedTypedSampledDataSource(value, valueType)
}

/** dataSourceResolvedPointsBasedPrim.cpp:56-104. GfMatrix4d-typed sampled
 *  data source giving inverse matrix for given data source (of same type). */
class _MatrixInverseDataSource extends HdTypedSampledDataSource<GfMatrix4d> {
  private readonly _valueAtZero: GfMatrix4d

  private constructor(private readonly _inputSrc: HdMatrixDataSource | undefined) {
    super()
    this._valueAtZero = this._compute(0.0)
  }

  static new(inputSrc: HdMatrixDataSource | undefined): _MatrixInverseDataSource {
    return new _MatrixInverseDataSource(inputSrc)
  }

  getTypedValue(shutterOffset: number): GfMatrix4d {
    if (shutterOffset === 0.0) {
      return this._valueAtZero
    }
    return this._compute(shutterOffset)
  }

  GetContributingSampleTimesForInterval(
    startTime: number, endTime: number, outSampleTimes: number[],
  ): boolean {
    if (!this._inputSrc) {
      return false
    }
    return this._inputSrc.GetContributingSampleTimesForInterval(
      startTime, endTime, outSampleTimes)
  }

  private _compute(shutterOffset: number): GfMatrix4d {
    if (!this._inputSrc) {
      return new GfMatrix4d(1.0)
    }
    return this._inputSrc.getTypedValue(shutterOffset).getInverse()
  }
}

/** dataSourceResolvedPointsBasedPrim.cpp:158-186 */
function _GetSkinningMethod(
  primvars: HdPrimvarsSchema,
  primPath: string, // For warning messages only.
): string {
  const ds = primvars
    .getPrimvar(UsdSkelImagingBindingSchemaTokens.skinningMethodPrimvar)
    .getPrimvarValue()
  const method = ds instanceof HdSampledDataSource
    ? String(UsdSkelImagingGetTypedValue(ds as HdTypedSampledDataSource<string>) ?? '') : ''
  if (method === '') {
    return UsdSkelTokens.classicLinear
  }

  if (method !== UsdSkelTokens.classicLinear &&
      method !== UsdSkelTokens.dualQuaternion) {
    TF_WARN(`Unknown skinning method ${method} on prim ${primPath}. ` +
      'Falling back to classicLinear.\n')
    return UsdSkelTokens.classicLinear
  }

  return method
}

/** dataSourceResolvedPointsBasedPrim.cpp:221-288 */
function _ExtComputationPrimvars(
  primPath: string,
  haveNormalsComputations: boolean,
  primvars: HdPrimvarsSchema,
): HdContainerDataSource {
  const names: string[] = [HdPrimvarsSchemaTokens.points]
  const values: HdDataSourceBase[] = [
    new HdExtComputationPrimvarSchema.Builder()
      .setInterpolation(
        HdExtComputationPrimvarSchema.buildInterpolationDataSource(
          HdPrimvarSchemaTokens.vertex))
      .setRole(
        HdExtComputationPrimvarSchema.buildRoleDataSource(
          HdPrimvarSchemaTokens.point))
      .setSourceComputation(
        HdRetainedTypedSampledDataSource.new(
          _AppendChild(primPath, UsdSkelImagingExtComputationNameTokens.pointsComputation)))
      .setSourceComputationOutputName(
        HdRetainedTypedSampledDataSource.new<string>(
          UsdSkelImagingExtComputationOutputNameTokens.skinnedPoints))
      .setValueType(
        HdRetainedTypedSampledDataSource.new({ type: HdType.HdTypeFloatVec3, count: 1 }))
      .build(),
  ]

  if (haveNormalsComputations) {
    const normalsInterpolationDs =
      primvars.getPrimvar(HdPrimvarsSchemaTokens.normals).getInterpolation()
    const normalsInterpolation = normalsInterpolationDs
      ? normalsInterpolationDs.getTypedValue(0.0)
      : HdPrimvarSchemaTokens.vertex

    names.push(HdPrimvarsSchemaTokens.normals)
    values.push(
      new HdExtComputationPrimvarSchema.Builder()
        .setInterpolation(
          HdExtComputationPrimvarSchema.buildInterpolationDataSource(normalsInterpolation))
        .setRole(
          HdExtComputationPrimvarSchema.buildRoleDataSource(HdPrimvarSchemaTokens.normal))
        .setSourceComputation(
          HdRetainedTypedSampledDataSource.new(
            _AppendChild(primPath, UsdSkelImagingExtComputationNameTokens.normalsComputation)))
        .setSourceComputationOutputName(
          HdRetainedTypedSampledDataSource.new<string>(
            UsdSkelImagingExtComputationOutputNameTokens.skinnedNormals))
        .setValueType(
          HdRetainedTypedSampledDataSource.new({ type: HdType.HdTypeFloatVec3, count: 1 }))
        .build())
  }

  return HdExtComputationPrimvarsSchema.buildRetained(names, values)
}

/** dataSourceResolvedPointsBasedPrim.cpp:290-304 */
function _BlockPointsAndNormalsPrimvars(): HdContainerDataSource {
  return HdPrimvarsSchema.buildRetained(
    [HdPrimvarsSchemaTokens.points, HdPrimvarsSchemaTokens.normals],
    [HdBlockDataSource.new(), HdBlockDataSource.new()])
}

let _blockPointsAndNormalsPrimvars: HdContainerDataSource | undefined

/** dataSourceResolvedPointsBasedPrim.cpp:307-449 */
class _SkinningPrimvarsDataSource extends HdContainerDataSource {
  private constructor(
    private readonly _resolvedPrimSource: UsdSkelImagingDataSourceResolvedPointsBasedPrim,
    private readonly _skeletonPrimSource: HdContainerDataSource | undefined,
    private readonly _useInstanceOffset: boolean,
  ) { super() }

  static new(
    resolvedPrimSource: UsdSkelImagingDataSourceResolvedPointsBasedPrim,
    skeletonPrimSource: HdContainerDataSource | undefined,
    useInstanceOffset: boolean,
  ): _SkinningPrimvarsDataSource {
    return new _SkinningPrimvarsDataSource(resolvedPrimSource, skeletonPrimSource, useInstanceOffset)
  }

  /** dataSourceResolvedPointsBasedPrim.cpp:312-326 */
  getNames(): string[] {
    // XXX
    // should prob check if skinningMethod primvar actually exists, it's
    // possible that it got aggregated to instance primvar on the instancer.
    // if it doesn't exist then we create the fall back primvar here.
    // enumerate skinningMethod because we can't pass down existing Token
    // primvar to vertex shader. also, base on that, we should decide we want
    // to filter out dualQuat or skinningXforms inputs. see:
    // _ExtComputationInputNamesForClassicLinear() in
    // dataSourceResolvedExtComputationPrim.cpp.
    return HdSkinningSettings.getSkinningInputNames()
  }

  /** dataSourceResolvedPointsBasedPrim.cpp:328-403 */
  Get(name: string): HdDataSourceBase | undefined {
    const P = UsdSkelImaging_DataSourcePrimvar
    const r = this._resolvedPrimSource
    // ExtComputationInputValues
    if (name === HdSkinningInputTokens.skinningXforms) {
      return P.new(r.getSkinningTransforms())
    }
    if (name === HdSkinningInputTokens.skinningScaleXforms) {
      return P.new(r.getSkinningScaleTransforms())
    }
    if (name === HdSkinningInputTokens.skinningDualQuats) {
      return P.new(r.getSkinningDualQuats())
    }
    if (name === HdSkinningInputTokens.blendShapeWeights) {
      return P.new(r.getBlendShapeWeights())
    }
    if (name === HdSkinningInputTokens.skelLocalToCommonSpace) {
      return P.new(this._getResolvedSkeletonSchema().getSkelLocalToCommonSpace())
    }
    if (name === HdSkinningInputTokens.commonSpaceToPrimLocal) {
      return P.new(r.getCommonSpaceToPrimLocal())
    }

    // ExtAggregatorComputationInputValues
    if (name === HdSkinningSkelInputTokens.geomBindTransform) {
      return P.new(r.getGeomBindTransform())
    }
    if (name === HdSkinningInputTokens.hasConstantInfluences) {
      return P.new(r.getHasConstantInfluences())
    }
    if (name === HdSkinningInputTokens.numInfluencesPerComponent) {
      return P.new(r.getNumInfluencesPerComponent())
    }
    if (name === HdSkinningInputTokens.influences) {
      return P.new(r.getInfluences())
    }

    if (name === HdSkinningInputTokens.blendShapeOffsets) {
      return P.new(r.getBlendShapeOffsets())
    }
    if (name === HdSkinningInputTokens.blendShapeOffsetRanges) {
      return P.new(r.getBlendShapeOffsetRanges())
    }
    if (name === HdSkinningInputTokens.numBlendShapeOffsetRanges) {
      return P.new(r.getNumBlendShapeOffsetRanges())
    }

    if (name === HdSkinningInputTokens.numSkinningMethod) {
      // numSkinningMethod: default LBS = 0, DQS = 1,
      return P.new(_ToDataSource(this._isDualQuatSkinning() ? 1 : 0, VtValueTypes.int))
    }
    if (name === HdSkinningInputTokens.numJoints) {
      return P.new(_ToDataSource(this._getNumJoints(), VtValueTypes.int))
    }
    if (name === HdSkinningInputTokens.numBlendShapeWeights) {
      return P.new(_ToDataSource(this._getNumBlendShapeWeights(), VtValueTypes.int))
    }
    return r.Get(name)
  }

  /** dataSourceResolvedPointsBasedPrim.cpp:417-428 */
  private _getNumJoints(): number {
    if (!this._useInstanceOffset) {
      // A hack to zero out the instanceOffset in skinning vertex shader if
      // we only have one instance or when there's no instance animation
      // source override.
      return 0
    }
    const schema = UsdSkelImagingSkeletonSchema.getFromParent(this._skeletonPrimSource)
    return schema.isDefined() ? _UsdSkelImagingGetArray(schema.getJoints()).length : 0
  }

  /** dataSourceResolvedPointsBasedPrim.cpp:430-433 */
  private _getNumBlendShapeWeights(): number {
    return this._useInstanceOffset
      ? this._resolvedPrimSource.getBlendShapeData().numSubShapes : 0
  }

  /** dataSourceResolvedPointsBasedPrim.cpp:435-437 */
  private _getResolvedSkeletonSchema(): UsdSkelImagingResolvedSkeletonSchema {
    return this._resolvedPrimSource.getResolvedSkeletonSchema()
  }

  /** dataSourceResolvedPointsBasedPrim.cpp:439-442 */
  private _isDualQuatSkinning(): boolean {
    return this._resolvedPrimSource.getSkinningMethod() === UsdSkelTokens.dualQuaternion
  }
}

/** dataSourceResolvedPointsBasedPrim.cpp:451-458 */
function _AddIfNecessary(name: string, names: string[]): void {
  if (names.includes(name)) {
    return
  }
  names.push(name)
}

/** dataSourceResolvedPointsBasedPrim.cpp:532-583. Data source for locator
 *  extComputations:inputValues:skinningXforms on skinningComputation prim.
 *
 *  Takes skinnigXforms from resolved skeleton schema (in skelSkinningXforms)
 *  applies jointMapper from jointInfluencesData. */
class _SkinningXformsDataSource extends HdTypedSampledDataSource<VtArray<GfMatrix4f>> {
  private constructor(
    private readonly _jointInfluencesData: UsdSkelImagingJointInfluencesData,
    private readonly _skelSkinningXforms: HdMatrix4fArrayDataSource,
  ) { super() }

  static new(
    jointInfluencesData: UsdSkelImagingJointInfluencesData,
    skelSkinningXforms: HdMatrix4fArrayDataSource,
  ): _SkinningXformsDataSource {
    return new _SkinningXformsDataSource(jointInfluencesData, skelSkinningXforms)
  }

  /** dataSourceResolvedPointsBasedPrim.cpp:547-559 */
  getTypedValue(shutterOffset: number): VtArray<GfMatrix4f> {
    // XXX TODO
    // we need to chop up and remap the concatenated instance skinning
    // transforms here.
    //
    // UsdSkelAnimMapper::RemapTransforms (usdSkel/animMapper.h:269-277):
    // Remap with the identity matrix as default value.
    const result = this._jointInfluencesData.jointMapper.remap(
      _UsdSkelImagingToArray<GfMatrix4f>(this._skelSkinningXforms.getTypedValue(shutterOffset)),
      null, 1, new GfMatrix4f(1.0))
    return new VtArray<GfMatrix4f>(result, _GfMatrix4fType)
  }

  /** dataSourceResolvedPointsBasedPrim.cpp:561-570 */
  GetContributingSampleTimesForInterval(
    startTime: number, endTime: number, outSampleTimes: number[],
  ): boolean {
    return this._skelSkinningXforms.GetContributingSampleTimesForInterval(
      startTime, endTime, outSampleTimes)
  }
}

/** dataSourceResolvedPointsBasedPrim.cpp:585-684. Data source for locator
 *  extComputations:inputValues:blendShapeWeights on skinningComputation
 *  prim. */
class _BlendShapeWeightsDataSource extends HdTypedSampledDataSource<VtArray<number>> {
  private constructor(
    private readonly _blendShapeData: UsdSkelImagingBlendShapeData,
    private readonly _blendShapes: HdTokenArrayDataSource | undefined,
    private readonly _blendShapeWeights: HdFloatArrayDataSource | undefined,
    private readonly _blendShapeRanges: HdVec2iArrayDataSource | undefined,
  ) { super() }

  static new(
    blendShapeData: UsdSkelImagingBlendShapeData,
    blendShapes: HdTokenArrayDataSource | undefined,
    blendShapeWeights: HdFloatArrayDataSource | undefined,
    blendShapeRanges: HdVec2iArrayDataSource | undefined,
  ): _BlendShapeWeightsDataSource {
    return new _BlendShapeWeightsDataSource(
      blendShapeData, blendShapes, blendShapeWeights, blendShapeRanges)
  }

  /** dataSourceResolvedPointsBasedPrim.cpp:596-649 */
  getTypedValue(shutterOffset: number): VtArray<number> {
    const blendShapes = _UsdSkelImagingGetArray<string>(this._blendShapes, shutterOffset)
    const blendShapeWeights = _UsdSkelImagingGetArray<number>(this._blendShapeWeights, shutterOffset)
    const blendShapeRanges = _UsdSkelImagingGetArray<GfVec2i>(this._blendShapeRanges, shutterOffset)

    const numSubShapes = this._blendShapeData.numSubShapes

    const result = new Float32Array(blendShapeRanges.length * numSubShapes)
    for (let i = 0; i < blendShapeRanges.length; ++i) {
      const range = blendShapeRanges[i]!.data
      // TfSpan::subspan(offset, count)
      const shapes = blendShapes.slice(range[0]!, range[0]! + range[1]!)
      const weights = blendShapeWeights.slice(range[0]!, range[0]! + range[1]!)

      const outWeights = UsdSkelImagingComputeBlendShapeWeights(
        this._blendShapeData, shapes, weights)

      // XXX
      // outWeights.size() should equal to numSubShapes
      // do we need a TF_VERIFY here?
      for (let j = 0; j < numSubShapes; ++j) {
        result[i * numSubShapes + j] = outWeights[j]!
      }
    }

    return new VtArray<number>(Array.from(result), VtValueTypes.float)
  }

  /** dataSourceResolvedPointsBasedPrim.cpp:651-665 */
  GetContributingSampleTimesForInterval(
    startTime: number, endTime: number, outSampleTimes: number[],
  ): boolean {
    if (!this._blendShapeWeights) {
      return false
    }
    return this._blendShapeWeights.GetContributingSampleTimesForInterval(
      startTime, endTime, outSampleTimes)
  }
}

/** dataSourceResolvedPointsBasedPrim.cpp:686-713. Extract the Scale & Shear
 *  parts of 4x4 matrix by removing the translation & rotation. Return only
 *  the upper-left 3x3 matrix. */
function _ComputeSkinningScaleXform(skinningXform: GfMatrix4f): GfMatrix3f {
  // From _ExtractSkinningScaleXforms in skeletonAdapter.cpp
  const factored = skinningXform.factor()
  if (!factored.success) {
    // Unable to decompose.
    return new GfMatrix3f(1.0)
  }
  const factoredRotMat = new GfMatrix4f(factored.rotation)
  const translation = factored.translation

  // Remove shear & extract rotation
  factoredRotMat.orthonormalize()
  // Calculate the scale + shear transform

  const tmpNonScaleXform =
    factoredRotMat.getMultiply(new GfMatrix4f(1.0).setTranslate(translation))
  return skinningXform.getMultiply(tmpNonScaleXform.getInverse())
    .extractRotationMatrix() as GfMatrix3f // Extract the upper-left 3x3 matrix
}

/** dataSourceResolvedPointsBasedPrim.cpp:715-741 */
function _ComputeSkinningScaleXforms(skinningXforms: readonly GfMatrix4f[]): VtArray<GfMatrix3f> {
  return new VtArray<GfMatrix3f>(
    skinningXforms.map(_ComputeSkinningScaleXform), _GfMatrix3fType)
}

/** dataSourceResolvedPointsBasedPrim.cpp:743-787. Data source for locator
 *  extComputations:inputValues:skinningScaleXforms on skinningComputation
 *  prim. */
class _SkinningScaleXformsDataSource extends HdTypedSampledDataSource<VtArray<GfMatrix3f>> {
  private constructor(private readonly _skinningXforms: HdMatrix4fArrayDataSource | undefined) { super() }

  static new(skinningXforms: HdMatrix4fArrayDataSource | undefined): _SkinningScaleXformsDataSource {
    return new _SkinningScaleXformsDataSource(skinningXforms)
  }

  getTypedValue(shutterOffset: number): VtArray<GfMatrix3f> {
    return _ComputeSkinningScaleXforms(
      _UsdSkelImagingGetArray<GfMatrix4f>(this._skinningXforms, shutterOffset))
  }

  GetContributingSampleTimesForInterval(
    startTime: number, endTime: number, outSampleTimes: number[],
  ): boolean {
    if (!this._skinningXforms) {
      return false
    }
    return this._skinningXforms.GetContributingSampleTimesForInterval(
      startTime, endTime, outSampleTimes)
  }
}

/** dataSourceResolvedPointsBasedPrim.cpp:795-816. Extract the translation &
 *  rotation parts of 4x4 matrix into dual quaternion. */
function _ComputeSkinningDualQuat(skinningXform: GfMatrix4f): GfDualQuatf {
  // Taken from _ExtractSkinningDualQuats in skeletonAdapter.cpp
  const factored = skinningXform.factor()
  if (!factored.success) {
    // Unable to decompose.
    return GfDualQuatf.getZero()
  }
  const factoredRotMat = new GfMatrix4f(factored.rotation)
  const translation = new GfVec3f(factored.translation)

  // Remove shear & extract rotation
  factoredRotMat.orthonormalize()
  // GfQuaternion [w, x, y, z]; _ToGfQuatf (cpp:789-793) rounds it to float.
  const [w, x, y, z] = (factoredRotMat.extractRotationMatrix() as GfMatrix3f).extractRotationQuaternion()
  const rotationQ = new GfQuatf(w, new GfVec3f(x, y, z))
  return new GfDualQuatf(rotationQ, translation)
}

/** dataSourceResolvedPointsBasedPrim.cpp:818-823 */
function _ToVec4f(q: GfQuatf): GfVec4f {
  const img = q.GetImaginary().data
  return new GfVec4f(img[0]!, img[1]!, img[2]!, q.GetReal())
}

/** dataSourceResolvedPointsBasedPrim.cpp:825-852. Use a pair of Vec4f to
 *  represent a dual quaternion. */
function _ComputeSkinningDualQuats(skinningXforms: readonly GfMatrix4f[]): VtArray<GfVec4f> {
  const result: GfVec4f[] = []
  for (const skinningXform of skinningXforms) {
    const dq = _ComputeSkinningDualQuat(skinningXform)
    result.push(_ToVec4f(dq.GetReal() as GfQuatf))
    result.push(_ToVec4f(dq.getDual() as GfQuatf))
  }
  return new VtArray<GfVec4f>(result, VtValueTypes.GfVec4f)
}

/** dataSourceResolvedPointsBasedPrim.cpp:854-897. Data source for locator
 *  extComputations:inputValues:skinningDualQuats on skinningComputation
 *  prim. */
class _SkinningDualQuatsDataSource extends HdTypedSampledDataSource<VtArray<GfVec4f>> {
  private constructor(private readonly _skinningXforms: HdMatrix4fArrayDataSource | undefined) { super() }

  static new(skinningXforms: HdMatrix4fArrayDataSource | undefined): _SkinningDualQuatsDataSource {
    return new _SkinningDualQuatsDataSource(skinningXforms)
  }

  getTypedValue(shutterOffset: number): VtArray<GfVec4f> {
    return _ComputeSkinningDualQuats(
      _UsdSkelImagingGetArray<GfMatrix4f>(this._skinningXforms, shutterOffset))
  }

  GetContributingSampleTimesForInterval(
    startTime: number, endTime: number, outSampleTimes: number[],
  ): boolean {
    if (!this._skinningXforms) {
      return false
    }
    return this._skinningXforms.GetContributingSampleTimesForInterval(
      startTime, endTime, outSampleTimes)
  }
}

/** dataSourceResolvedPointsBasedPrim.h:33-180 _BlendShapeDataCache */
class _BlendShapeDataCache extends UsdSkelImagingSharedPtrThunk<UsdSkelImagingBlendShapeData> {
  constructor(
    private readonly _sceneIndex: HdSceneIndexBase,
    private readonly _primPath: string,
  ) { super() }

  /** dataSourceResolvedPointsBasedPrim.cpp:1636-1644 */
  protected _compute(): UsdSkelImagingBlendShapeData {
    return UsdSkelImagingComputeBlendShapeData(this._sceneIndex, this._primPath)
  }
}

/** dataSourceResolvedPointsBasedPrim.h:258-271 _JointInfluencesDataCache */
class _JointInfluencesDataCache extends UsdSkelImagingSharedPtrThunk<UsdSkelImagingJointInfluencesData> {
  constructor(
    private readonly _primSource: HdContainerDataSource | undefined,
    private readonly _skeletonPrimSource: HdContainerDataSource | undefined,
  ) { super() }

  /** dataSourceResolvedPointsBasedPrim.cpp:1655-1663 */
  protected _compute(): UsdSkelImagingJointInfluencesData {
    return UsdSkelImagingComputeJointInfluencesData(this._primSource, this._skeletonPrimSource)
  }
}

const _locators: Record<string, HdDataSourceLocator | HdDataSourceLocatorSet> = {}
/** The function-local static locators of this file. */
function _Static<T extends HdDataSourceLocator | HdDataSourceLocatorSet>(key: string, make: () => T): T {
  return (_locators[key] ??= make()) as T
}

function _InputValueLocator(name: string): HdDataSourceLocator {
  return HdExtComputationSchema.getInputValuesLocator().append(name)
}

let _normalComputationsEnabled: boolean | undefined

/** dataSourceResolvedPointsBasedPrim.h:27-280. A prim data source providing
 *  resolved data for a points based prim (mesh, basisCurves, points)
 *  deformed by a skeleton. As a data source, it populates the
 *  HdExtComputationPrimvarsSchema for points and possibly for normals and
 *  removes points and normals from the HdPrimvarsSchema.
 *
 *  Used by the UsdSkelImagingPointsResolvingSceneIndex in conjunction with
 *  the UsdSkelImagingDataSourceResolvedExtComputationPrim. */
export class UsdSkelImagingDataSourceResolvedPointsBasedPrim extends HdContainerDataSource {
  private readonly _primvars: HdPrimvarsSchema
  private readonly _mesh: HdMeshSchema
  private readonly _skinningMethod: string
  private readonly _blendShapeDataCache: _BlendShapeDataCache
  private readonly _jointInfluencesDataCache: _JointInfluencesDataCache
  // Serves GetPrimWorldToLocal - taking instancing into account.
  private readonly _xformResolver: UsdSkelImagingDataSourceXformResolver

  /** dataSourceResolvedPointsBasedPrim.cpp:188-213 */
  private constructor(
    // Input scene.
    private readonly _sceneIndex: HdSceneIndexBase,
    // Path of prim in the input scene.
    private readonly _primPath: string,
    // Data source for _primPath from input scene _sceneIndex.
    private readonly _primSource: HdContainerDataSource,
    private readonly _hasSkelRoot: boolean,
    private readonly _blendShapeTargetPaths: string[],
    private readonly _skeletonPath: string,
    private readonly _skeletonPrimSource: HdContainerDataSource | undefined,
    private readonly _resolvedSkeletonSchema: UsdSkelImagingResolvedSkeletonSchema,
  ) {
    super()
    this._primvars = HdPrimvarsSchema.getFromParent(_primSource)
    this._mesh = HdMeshSchema.getFromParent(_primSource)
    this._skinningMethod = _GetSkinningMethod(this._primvars, _primPath)
    this._blendShapeDataCache = new _BlendShapeDataCache(_sceneIndex, _primPath)
    this._jointInfluencesDataCache = new _JointInfluencesDataCache(_primSource, _skeletonPrimSource)
    this._xformResolver = new UsdSkelImagingDataSourceXformResolver(_sceneIndex, _primSource)
  }

  /** dataSourceResolvedPointsBasedPrim.cpp:108-156.
   *
   *  Note that it takes the data source for the prim at primPath in the
   *  given sceneIndex. This is for performance: the client probably already
   *  retrieved this data source so we want to avoid looking it up again
   *  here.
   *
   *  Returns undefined if the prim in the input scene does not bind a
   *  skeleton. */
  static new(
    sceneIndex: HdSceneIndexBase,
    primPath: string,
    primSource: HdContainerDataSource | undefined,
  ): UsdSkelImagingDataSourceResolvedPointsBasedPrim | undefined {
    if (!primSource) {
      return undefined
    }

    const bindingSchema = UsdSkelImagingBindingSchema.getFromParent(primSource)

    const hasSkelRootDs = bindingSchema.getHasSkelRoot()

    const hasSkelRoot = !!(hasSkelRootDs && hasSkelRootDs.getTypedValue(0.0))

    const skeletonPathDataSource = bindingSchema.getSkeleton()
    if (!skeletonPathDataSource) {
      return undefined
    }
    const skeletonPath = String(skeletonPathDataSource.getTypedValue(0.0) ?? '')
    if (skeletonPath === '') {
      return undefined
    }

    const blendShapeTargetPaths = _UsdSkelImagingGetArray<string>(
      bindingSchema.getBlendShapeTargets())

    const skeletonPrimSource = sceneIndex.getPrim(skeletonPath).dataSource

    const resolvedSkeletonSchema =
      UsdSkelImagingResolvedSkeletonSchema.getFromParent(skeletonPrimSource)

    return new UsdSkelImagingDataSourceResolvedPointsBasedPrim(
      sceneIndex,
      primPath,
      primSource,
      hasSkelRoot,
      blendShapeTargetPaths,
      skeletonPath,
      skeletonPrimSource,
      resolvedSkeletonSchema)
  }

  /** dataSourceResolvedPointsBasedPrim.cpp:513-527 */
  getNames(): string[] {
    const names = [...this._primSource.getNames()]

    if (!this._resolvedSkeletonSchema.isDefined()) {
      return names
    }

    if (!HdSkinningSettings.isSkinningDeferred()) {
      _AddIfNecessary(HdExtComputationPrimvarsSchema.getSchemaToken(), names)
    }
    return names
  }

  /** dataSourceResolvedPointsBasedPrim.cpp:462-511 */
  Get(name: string): HdDataSourceBase | undefined {
    // For vertex shader codepath we convert all the extComputation
    // inputValues to primvars.
    if (HdSkinningSettings.isSkinningDeferred() &&
        name === HdPrimvarsSchema.getSchemaToken()) {
      // skeleton guide primvars are handled in
      // UsdSkelImagingDataSourceResolvedSkeletonPrim
      if (this._primPath !== this._skeletonPath && this._skeletonPrimSource) {
        // if we only have a single animation source then we don't need to
        // instance offset the index into skinning primvars.
        const blendShapeRanges = _UsdSkelImagingGetArray(
          this._resolvedSkeletonSchema.getBlendShapeRanges(), 0.0)
        const useInstanceOffset = blendShapeRanges.length > 1
        return _SkinningPrimvarsDataSource.new(
          this, this._skeletonPrimSource, useInstanceOffset)
      }
    }

    const inputSrc = this._primSource.Get(name)

    if (!this.hasExtComputations()) {
      return inputSrc
    }

    if (name === HdExtComputationPrimvarsSchema.getSchemaToken()) {
      return HdOverlayContainerDataSource.overlayedContainerDataSources(
        _ExtComputationPrimvars(
          this._primPath,
          this.hasNormalsExtComputations(),
          this._primvars),
        inputSrc instanceof HdContainerDataSource ? inputSrc : undefined)
    }

    if (name === HdPrimvarsSchema.getSchemaToken()) {
      // Block points primvar.
      // The normals are also blocked since they are either deformed by the
      // computation or recomputed after skinning,
      return _blockPointsAndNormalsPrimvars ??= _BlockPointsAndNormalsPrimvars()
    }

    return inputSrc
  }

  /** dataSourceResolvedPointsBasedPrim.h:66-67. Path of prim in input scene
   *  (and for prim this data source is for). */
  getPrimPath(): string { return this._primPath }

  /** dataSourceResolvedPointsBasedPrim.h:69-70. Path of bound skeleton. */
  getSkeletonPath(): string { return this._skeletonPath }

  /** dataSourceResolvedPointsBasedPrim.h:72-75. Paths to BlendShape prims. */
  getBlendShapeTargetPaths(): readonly string[] {
    return this._blendShapeTargetPaths
  }

  /** dataSourceResolvedPointsBasedPrim.h:77-85. Paths to instancers
   *  instancing this prim - not including ones outside the skel root. */
  getInstancerPaths(): readonly string[] {
    return this._xformResolver.getInstancerPaths()
  }

  /** dataSourceResolvedPointsBasedPrim.h:87-88. Primvars of prim in the
   *  input scene. */
  getPrimvars(): HdPrimvarsSchema { return this._primvars }

  /** dataSourceResolvedPointsBasedPrim.h:90-93. Resolved skeleton of prim in
   *  the input scene. */
  getResolvedSkeletonSchema(): UsdSkelImagingResolvedSkeletonSchema {
    return this._resolvedSkeletonSchema
  }

  /** dataSourceResolvedPointsBasedPrim.cpp:912-934 */
  getSkinningTransforms(): HdMatrix4fArrayDataSource | undefined {
    // Apply jointMapper to skinning xforms from resolved skeleton if
    // necessary.
    const skelSkinningXforms = this._resolvedSkeletonSchema.getSkinningTransforms()
    if (!skelSkinningXforms) {
      return undefined
    }

    const jointInfluencesData = this.getJointInfluencesData()
    if (jointInfluencesData.jointMapper.isNull() ||
        jointInfluencesData.jointMapper.isIdentity()) {
      return skelSkinningXforms
    }

    return _SkinningXformsDataSource.new(jointInfluencesData, skelSkinningXforms)
  }

  /** dataSourceResolvedPointsBasedPrim.cpp:936-941. Only valid if
   *  GetSkinningMethod() == UsdSkelTokens->dualQuaternion */
  getSkinningScaleTransforms(): HdMatrix3fArrayDataSource {
    return _SkinningScaleXformsDataSource.new(this.getSkinningTransforms())
  }

  /** dataSourceResolvedPointsBasedPrim.cpp:943-948. Only valid if
   *  GetSkinningMethod() == UsdSkelTokens->dualQuaternion */
  getSkinningDualQuats(): HdVec4fArrayDataSource {
    return _SkinningDualQuatsDataSource.new(this.getSkinningTransforms())
  }

  /** dataSourceResolvedPointsBasedPrim.cpp:902-910 */
  getBlendShapeWeights(): HdTypedSampledDataSource<VtArray<number>> {
    return _BlendShapeWeightsDataSource.new(this.getBlendShapeData(),
      this._resolvedSkeletonSchema.getBlendShapes(),
      this._resolvedSkeletonSchema.getBlendShapeWeights(),
      this._resolvedSkeletonSchema.getBlendShapeRanges())
  }

  /** dataSourceResolvedPointsBasedPrim.cpp:950-957. Transfrom to go from
   *  common space (as defined by UsdSkelImagingDataSourceXformResolver) to
   *  the local space of this prim. */
  getCommonSpaceToPrimLocal(): HdMatrixDataSource {
    return _MatrixInverseDataSource.new(
      this._xformResolver.getPrimLocalToCommonSpace())
  }

  /** dataSourceResolvedPointsBasedPrim.cpp:959-965 */
  getPoints(): HdSampledDataSource | undefined {
    return this.getPrimvars().getPrimvar(HdPrimvarsSchemaTokens.points).getPrimvarValue()
  }

  /** dataSourceResolvedPointsBasedPrim.cpp:967-980 */
  getGeomBindTransform(): HdDataSourceBase {
    const primvarValueDs = this.getPrimvars().getPrimvar(
      UsdSkelImagingBindingSchemaTokens.geomBindTransformPrimvar).getPrimvarValue()
    const value = primvarValueDs instanceof HdSampledDataSource
      ? (primvarValueDs as HdTypedSampledDataSource<unknown>).getTypedValue(0.0) : undefined

    // Convert the primvar value to GfMatrix4f for vertex shader access.
    return _ToDataSource(
      value instanceof GfMatrix4d || value instanceof GfMatrix4f
        ? new GfMatrix4f(value) : new GfMatrix4f(1.0),
      _GfMatrix4fType)
  }

  /** dataSourceResolvedPointsBasedPrim.cpp:982-987 */
  getHasConstantInfluences(): HdDataSourceBase {
    return _ToDataSource(this.getJointInfluencesData().hasConstantInfluences, VtValueTypes.bool)
  }

  /** dataSourceResolvedPointsBasedPrim.cpp:989-994 */
  getNumInfluencesPerComponent(): HdDataSourceBase {
    return _ToDataSource(this.getJointInfluencesData().numInfluencesPerComponent, VtValueTypes.int)
  }

  /** dataSourceResolvedPointsBasedPrim.cpp:996-1001 */
  getInfluences(): HdDataSourceBase {
    return _ToDataSource(this.getJointInfluencesData().influences)
  }

  /** dataSourceResolvedPointsBasedPrim.cpp:1003-1008 */
  getBlendShapeOffsets(): HdDataSourceBase {
    return _ToDataSource(this.getBlendShapeData().blendShapeOffsets)
  }

  /** dataSourceResolvedPointsBasedPrim.cpp:1010-1015 */
  getBlendShapeOffsetRanges(): HdDataSourceBase {
    return _ToDataSource(this.getBlendShapeData().blendShapeOffsetRanges)
  }

  /** dataSourceResolvedPointsBasedPrim.cpp:1017-1023 */
  getNumBlendShapeOffsetRanges(): HdDataSourceBase {
    return _ToDataSource(this.getBlendShapeData().blendShapeOffsetRanges.size, VtValueTypes.int)
  }

  /** dataSourceResolvedPointsBasedPrim.cpp:1025-1031 */
  getNormals(): HdSampledDataSource | undefined {
    return this.getPrimvars().getPrimvar(HdPrimvarsSchemaTokens.normals).getPrimvarValue()
  }

  /** dataSourceResolvedPointsBasedPrim.cpp:1033-1054 */
  getFaceVertexIndices(): HdSampledDataSource | undefined {
    const meshDs = this.Get(HdMeshSchemaTokens.mesh)
    if (!(meshDs instanceof HdContainerDataSource)) {
      return undefined
    }

    const meshSchema = new HdMeshSchema(meshDs)
    const topoSchema = meshSchema.GetTopology()
    if (!topoSchema.isDefined()) {
      return undefined
    }

    const ds = topoSchema.getContainer()!.Get(HdMeshTopologySchemaTokens.faceVertexIndices)
    return ds instanceof HdSampledDataSource ? ds : undefined
  }

  /** dataSourceResolvedPointsBasedPrim.cpp:1056-1071 */
  getHasFaceVaryingNormals(): HdDataSourceBase | undefined {
    const normalsPrimvar = this.getPrimvars().getPrimvar(HdPrimvarsSchemaTokens.normals)
    const interpDs = normalsPrimvar.getInterpolation()
    if (!interpDs) {
      return undefined
    }
    const interpolation = interpDs.getTypedValue(0.0)
    const hasFaceVaryingNormals = interpolation === HdPrimvarSchemaTokens.faceVarying
    return _ToDataSource(hasFaceVaryingNormals, VtValueTypes.bool)
  }

  /** dataSourceResolvedPointsBasedPrim.cpp:1073-1077. Blend shape data
   *  computed from primvars, skel bindings and skeleton. */
  getBlendShapeData(): UsdSkelImagingBlendShapeData {
    return this._blendShapeDataCache.Get()!
  }

  /** dataSourceResolvedPointsBasedPrim.cpp:1079-1083. Joint influences data
   *  computed from primvars. */
  getJointInfluencesData(): UsdSkelImagingJointInfluencesData {
    return this._jointInfluencesDataCache.Get()!
  }

  /** dataSourceResolvedPointsBasedPrim.h:153-156. Skinning method computed
   *  from corresponding primvar. */
  getSkinningMethod(): string {
    return this._skinningMethod
  }

  /** dataSourceResolvedPointsBasedPrim.cpp:1085-1107. Should the points for
   *  this primvar be given by an ext computation or from the primvars
   *  schema. */
  hasExtComputations(): boolean {
    return (
      // If we're not using vertex shader skinning.
      !HdSkinningSettings.isSkinningDeferred() &&
      // Points are only posed if we bind a Skeleton prim (and the
      // UsdSkelImagingSkeletonResolvingSceneIndex has populated the resolved
      // skeleton schema).
      this._resolvedSkeletonSchema.isDefined() &&
      // Do not use ext computation if this prim was the Skeleton itself.
      // For the Skeleton prim itself, the
      // UsdSkelImagingSkeletonResolvingSceneIndex has populated the points
      // primvar already (with the points for the mesh guide) and changed the
      // prim type to mesh.
      this._primPath !== this._skeletonPath &&
      // We only skin prims if they are under a SkelRoot.
      //
      // Note that when we bake the points of a skinned prim, we also change
      // the SkelRoot to a different prim type (such as Scope or Xform) so
      // that the baked points are not skinned again.
      this._hasSkelRoot)
  }

  /** dataSourceResolvedPointsBasedPrim.cpp:1109-1139. Should the normals for
   *  this primvar be given by an ext computation. */
  hasNormalsExtComputations(): boolean {
    _normalComputationsEnabled ??= TfGetEnvSetting(USDSKELIMAGING_ENABLE_NORMAL_COMPUTATIONS)

    if (_normalComputationsEnabled) {
      // If there are ext computations ...
      if (this.hasExtComputations()) {
        // And the subdivision scheme is "none" ...
        const subdivisionSchemeDs = this._mesh.getSubdivisionScheme()
        const subdivisionScheme = subdivisionSchemeDs
          ? subdivisionSchemeDs.getTypedValue(0.0)
          : PxOsdOpenSubdivTokens.none
        if (subdivisionScheme === PxOsdOpenSubdivTokens.none) {
          // And there are authored normals ...
          const normals = _UsdSkelImagingGetArray(this.getNormals())

          // Then we should have ext computations for normals.
          return normals.length > 0
        }
      }
    }

    return false
  }

  /** dataSourceResolvedPointsBasedPrim.cpp:1141-1152. Data source locators
   *  (on this prim) that this prim depends on.
   *
   *  That is, if the input scene sends a dirty entry for this prim path with
   *  dirty locators intersecting these data source locators, we need to call
   *  ProcessDirtyLocators. */
  static getDependendendOnDataSourceLocators(): HdDataSourceLocatorSet {
    return _Static('dependedOn', () => new HdDataSourceLocatorSet([
      UsdSkelImagingBindingSchema.getDefaultLocator(),
      HdPrimvarsSchema.getDefaultLocator(),
      UsdSkelImagingDataSourceXformResolver.getXformLocator(),
    ]))
  }

  /** dataSourceResolvedPointsBasedPrim.cpp:1157-1330 */
  private _processDirtyLocators(
    dirtyLocators: HdDataSourceLocatorSet,
    dirtyLocatorsForAggregatorComputation: HdDataSourceLocatorSet | undefined,
    dirtyLocatorsForComputation: HdDataSourceLocatorSet | undefined,
    dirtyPrimvars: string[] | undefined,
  ): boolean {
    const A = UsdSkelImagingExtAggregatorComputationInputNameTokens
    const I = UsdSkelImagingExtComputationInputNameTokens
    const primvarsLocator = HdPrimvarsSchema.getDefaultLocator()

    if (dirtyLocators.contains(UsdSkelImagingBindingSchema.getSkeletonLocator())) {
      return true
    }
    if (dirtyLocators.contains(UsdSkelImagingBindingSchema.getHasSkelRootLocator())) {
      return true
    }
    if (dirtyLocators.contains(UsdSkelImagingBindingSchema.getBlendShapeTargetsLocator())) {
      return true
    }
    if (dirtyLocators.contains(primvarsLocator)) {
      return true
    }
    if (dirtyLocators.contains(UsdSkelImagingDataSourceXformResolver.getInstancedByLocator())) {
      // Instancers have changed.
      // Just indicate that we want to blow everything.
      return true
    }
    const skinningMethodLocator = _Static('skinningMethod', () =>
      primvarsLocator.append(UsdSkelImagingBindingSchemaTokens.skinningMethodPrimvar))
    if (dirtyLocators.contains(skinningMethodLocator)) {
      // XXX
      // we can potentially just dirty skinningXforms, skinningScaleXforms and
      // skinningDualQuats and return false here?
      return true
    }

    if (!this._resolvedSkeletonSchema.isDefined()) {
      return false
    }

    this._processDirtySkelBlendShapeLocators(dirtyLocators,
      dirtyLocatorsForAggregatorComputation, dirtyLocatorsForComputation,
      dirtyPrimvars)

    const jointInfluencesDataLocators = _Static('jointInfluencesData', () =>
      new HdDataSourceLocatorSet([
        primvarsLocator.append(UsdSkelImagingBindingSchemaTokens.jointIndicesPrimvar),
        primvarsLocator.append(UsdSkelImagingBindingSchemaTokens.jointWeightsPrimvar),
        UsdSkelImagingBindingSchema.getJointsLocator()]))
    if (dirtyLocators.intersects(jointInfluencesDataLocators)) {
      this._jointInfluencesDataCache.invalidate()

      if (dirtyLocatorsForAggregatorComputation) {
        dirtyLocatorsForAggregatorComputation.add(_Static('influencesInputs', () =>
          new HdDataSourceLocatorSet([
            _InputValueLocator(A.hasConstantInfluences),
            _InputValueLocator(A.numInfluencesPerComponent),
            _InputValueLocator(A.influences)])))
      }

      if (dirtyPrimvars) {
        dirtyPrimvars.push(
          HdSkinningInputTokens.hasConstantInfluences,
          HdSkinningInputTokens.numInfluencesPerComponent,
          HdSkinningInputTokens.influences)
      }
    }

    const pointsPrimvarLocator = _Static('pointsPrimvar', () =>
      primvarsLocator.append(HdPrimvarsSchemaTokens.points))
    if (dirtyLocators.intersects(pointsPrimvarLocator)) {
      if (dirtyLocatorsForAggregatorComputation) {
        dirtyLocatorsForAggregatorComputation.add(_InputValueLocator(A.restPoints))
      }

      if (dirtyLocatorsForComputation) {
        dirtyLocatorsForComputation.add(_Static('counts', () =>
          new HdDataSourceLocatorSet([
            HdExtComputationSchema.getDispatchCountLocator(),
            HdExtComputationSchema.getElementCountLocator()])))
      }
    }

    if (this.hasNormalsExtComputations()) {
      const normalsPrimvarLocator = _Static('normalsPrimvar', () =>
        primvarsLocator.append(HdPrimvarsSchemaTokens.normals))
      if (dirtyLocators.intersects(normalsPrimvarLocator)) {
        if (dirtyLocatorsForAggregatorComputation) {
          dirtyLocatorsForAggregatorComputation.add(_InputValueLocator(A.restNormals))
        }

        if (dirtyLocatorsForComputation) {
          dirtyLocatorsForComputation.add(_Static('counts', () =>
            new HdDataSourceLocatorSet([
              HdExtComputationSchema.getDispatchCountLocator(),
              HdExtComputationSchema.getElementCountLocator()])))
        }
      }
    }

    const geomBindXformPrimvarLocator = _Static('geomBindXformPrimvar', () =>
      primvarsLocator.append(UsdSkelImagingBindingSchemaTokens.geomBindTransformPrimvar))
    if (dirtyLocators.intersects(geomBindXformPrimvarLocator)) {
      if (dirtyLocatorsForAggregatorComputation) {
        dirtyLocatorsForAggregatorComputation.add(_InputValueLocator(A.geomBindXform))
      }
    }

    if (dirtyLocators.intersects(UsdSkelImagingDataSourceXformResolver.getXformLocator())) {
      if (dirtyLocatorsForComputation) {
        dirtyLocatorsForComputation.add(_InputValueLocator(I.commonSpaceToPrimLocal))
      }

      if (dirtyPrimvars) {
        dirtyPrimvars.push(HdSkinningInputTokens.commonSpaceToPrimLocal)
      }
    }

    return false
  }

  /** dataSourceResolvedPointsBasedPrim.cpp:1332-1413 */
  private _processDirtySkeletonLocators(
    dirtyLocators: HdDataSourceLocatorSet,
    _dirtyLocatorsForAggregatorComputation: HdDataSourceLocatorSet | undefined,
    dirtyLocatorsForComputation: HdDataSourceLocatorSet | undefined,
    dirtyPrimvars: string[] | undefined,
  ): boolean {
    const I = UsdSkelImagingExtComputationInputNameTokens
    if (dirtyLocators.contains(UsdSkelImagingResolvedSkeletonSchema.getDefaultLocator())) {
      return true
    }

    if (!this._resolvedSkeletonSchema.isDefined()) {
      return false
    }

    if (dirtyLocators.intersects(
        UsdSkelImagingResolvedSkeletonSchema.getSkelLocalToCommonSpaceLocator())) {
      if (dirtyLocatorsForComputation) {
        dirtyLocatorsForComputation.add(_InputValueLocator(I.skelLocalToCommonSpace))
      }
      if (dirtyPrimvars) {
        dirtyPrimvars.push(HdSkinningInputTokens.skelLocalToCommonSpace)
      }
    }

    if (dirtyLocators.intersects(
        UsdSkelImagingResolvedSkeletonSchema.getSkinningTransformsLocator())) {
      if (dirtyLocatorsForComputation) {
        dirtyLocatorsForComputation.add(_Static('skinningXformsInputs', () =>
          new HdDataSourceLocatorSet([
            _InputValueLocator(I.skinningXforms),
            _InputValueLocator(I.skinningScaleXforms),
            _InputValueLocator(I.skinningDualQuats)])))
      }
      if (dirtyPrimvars) {
        dirtyPrimvars.push(HdSkinningInputTokens.skinningXforms)
        dirtyPrimvars.push(HdSkinningInputTokens.skinningScaleXforms)
        dirtyPrimvars.push(HdSkinningInputTokens.skinningDualQuats)
        dirtyPrimvars.push(HdSkinningInputTokens.numJoints)
      }
    }

    const blendLocators = _Static('blendLocators', () => new HdDataSourceLocatorSet([
      UsdSkelImagingResolvedSkeletonSchema.getBlendShapesLocator(),
      UsdSkelImagingResolvedSkeletonSchema.getBlendShapeWeightsLocator(),
      UsdSkelImagingResolvedSkeletonSchema.getBlendShapeRangesLocator()]))
    if (dirtyLocators.intersects(blendLocators)) {
      if (dirtyLocatorsForComputation) {
        dirtyLocatorsForComputation.add(_InputValueLocator(I.blendShapeWeights))
      }
      if (dirtyPrimvars) {
        dirtyPrimvars.push(HdSkinningInputTokens.blendShapeWeights)
        dirtyPrimvars.push(HdSkinningInputTokens.numBlendShapeWeights)
      }
    }

    return false
  }

  /** dataSourceResolvedPointsBasedPrim.cpp:1415-1475 */
  private _processDirtySkelBlendShapeLocators(
    dirtyLocators: HdDataSourceLocatorSet,
    dirtyLocatorsForAggregatorComputation: HdDataSourceLocatorSet | undefined,
    dirtyLocatorsForComputation: HdDataSourceLocatorSet | undefined,
    dirtyPrimvars: string[] | undefined,
  ): boolean {
    const A = UsdSkelImagingExtAggregatorComputationInputNameTokens
    const I = UsdSkelImagingExtComputationInputNameTokens
    if (!this._resolvedSkeletonSchema.isDefined()) {
      return false
    }

    if (dirtyLocators.intersects(UsdSkelImagingBlendShapeSchema.getDefaultLocator())) {
      this._blendShapeDataCache.invalidate()

      if (dirtyLocatorsForAggregatorComputation) {
        dirtyLocatorsForAggregatorComputation.add(_Static('blendShapeInputs', () =>
          new HdDataSourceLocatorSet([
            _InputValueLocator(A.blendShapeOffsets),
            _InputValueLocator(A.blendShapeOffsetRanges),
            _InputValueLocator(A.numBlendShapeOffsetRanges)])))
      }

      if (dirtyLocatorsForComputation) {
        dirtyLocatorsForComputation.add(_InputValueLocator(I.blendShapeWeights))
      }

      if (dirtyPrimvars) {
        dirtyPrimvars.push(
          HdSkinningInputTokens.blendShapeOffsets,
          HdSkinningInputTokens.blendShapeOffsetRanges,
          HdSkinningInputTokens.numBlendShapeOffsetRanges,
          HdSkinningInputTokens.blendShapeWeights,
          HdSkinningInputTokens.numBlendShapeWeights)
      }
    }

    return false
  }

  /** dataSourceResolvedPointsBasedPrim.cpp:1477-1509 */
  private _processDirtyInstancerLocators(
    dirtyLocators: HdDataSourceLocatorSet,
    _dirtyLocatorsForAggregatorComputation: HdDataSourceLocatorSet | undefined,
    dirtyLocatorsForComputation: HdDataSourceLocatorSet | undefined,
  ): boolean {
    if (dirtyLocators.intersects(UsdSkelImagingDataSourceXformResolver.getInstancedByLocator())) {
      return true
    }

    if (!this._resolvedSkeletonSchema.isDefined()) {
      return false
    }

    if (dirtyLocators.intersects(UsdSkelImagingDataSourceXformResolver.getXformLocator()) ||
        dirtyLocators.intersects(UsdSkelImagingDataSourceXformResolver.getInstanceXformLocator())) {
      if (dirtyLocatorsForComputation) {
        dirtyLocatorsForComputation.add(
          _InputValueLocator(UsdSkelImagingExtComputationInputNameTokens.commonSpaceToPrimLocal))
      }
    }

    return false
  }

  /** dataSourceResolvedPointsBasedPrim.cpp:1511-1625. Dirty internal
   *  structures in response to dirty locators for the target (resolved)
   *  skeleton prim (dirtiedPrimType = "skeleton"), a targeted
   *  skelBlendShape prim (dirtiedPrimType = "skelBlendShape") or the prim in
   *  the input scene itself (any other dirtiedPrimType). Fills dirtied prim
   *  entries with affected locators for this prim or returns true to
   *  indicate that we could not dirty this data source and need to refetch
   *  it. */
  processDirtyLocators(
    dirtiedPrimType: string,
    dirtyLocators: HdDataSourceLocatorSet,
    entries: HdDirtiedPrimEntry[] | undefined,
  ): boolean {
    const dirtyLocatorsForAggregatorComputation = new HdDataSourceLocatorSet()
    const dirtyLocatorsForComputation = new HdDataSourceLocatorSet()
    const dirtyPrimvars: string[] = []

    const hasExtComputations = this.hasExtComputations()
    const dirtyLocatorsForAggregatorComputationPtr =
      entries && hasExtComputations ? dirtyLocatorsForAggregatorComputation : undefined
    const dirtyLocatorsForComputationPtr =
      entries && hasExtComputations ? dirtyLocatorsForComputation : undefined
    // dirtyPrimvars is for vertex shader code path so we check if there's no
    // extComputation.
    const dirtyPrimvarsPtr = entries && !hasExtComputations ? dirtyPrimvars : undefined

    let result = false
    if (dirtiedPrimType === UsdSkelImagingPrimTypeTokens.skeleton) {
      result = this._processDirtySkeletonLocators(
        dirtyLocators,
        dirtyLocatorsForAggregatorComputationPtr,
        dirtyLocatorsForComputationPtr,
        dirtyPrimvarsPtr)
    } else if (dirtiedPrimType === UsdSkelImagingPrimTypeTokens.skelBlendShape) {
      result = this._processDirtySkelBlendShapeLocators(
        dirtyLocators,
        dirtyLocatorsForAggregatorComputationPtr,
        dirtyLocatorsForComputationPtr,
        dirtyPrimvarsPtr)
    } else if (dirtiedPrimType === HdPrimTypeTokens.instancer) {
      result = this._processDirtyInstancerLocators(
        dirtyLocators,
        dirtyLocatorsForAggregatorComputationPtr,
        dirtyLocatorsForComputationPtr)
    } else {
      result = this._processDirtyLocators(
        dirtyLocators,
        dirtyLocatorsForAggregatorComputationPtr,
        dirtyLocatorsForComputationPtr,
        dirtyPrimvarsPtr)
    }

    if (entries) {
      const hasNormalsComputations = this.hasNormalsExtComputations()
      let sendPrimvarsValueDirty = false

      if (!dirtyLocatorsForAggregatorComputation.IsEmpty()) {
        entries.push({
          primPath: _AppendChild(this._primPath,
            UsdSkelImagingExtComputationNameTokens.pointsAggregatorComputation),
          dirtyLocators: dirtyLocatorsForAggregatorComputation,
        })

        if (hasNormalsComputations) {
          entries.push({
            primPath: _AppendChild(this._primPath,
              UsdSkelImagingExtComputationNameTokens.normalsAggregatorComputation),
            dirtyLocators: dirtyLocatorsForAggregatorComputation,
          })
        }
        sendPrimvarsValueDirty = true
      }
      if (!dirtyLocatorsForComputation.IsEmpty()) {
        entries.push({
          primPath: _AppendChild(this._primPath,
            UsdSkelImagingExtComputationNameTokens.pointsComputation),
          dirtyLocators: dirtyLocatorsForComputation,
        })

        if (hasNormalsComputations) {
          entries.push({
            primPath: _AppendChild(this._primPath,
              UsdSkelImagingExtComputationNameTokens.normalsComputation),
            dirtyLocators: dirtyLocatorsForComputation,
          })
        }
        sendPrimvarsValueDirty = true
      }

      if (sendPrimvarsValueDirty) {
        const pointsLocator = _Static('pointsValue', () =>
          HdPrimvarsSchema.getDefaultLocator()
            .append(HdPrimvarsSchemaTokens.points)
            .append(HdPrimvarSchemaTokens.primvarValue))
        entries.push({ primPath: this._primPath, dirtyLocators: new HdDataSourceLocatorSet(pointsLocator) })

        if (hasNormalsComputations) {
          const normalsLocator = _Static('normalsValue', () =>
            HdPrimvarsSchema.getDefaultLocator()
              .append(HdPrimvarsSchemaTokens.normals)
              .append(HdPrimvarSchemaTokens.primvarValue))
          entries.push({ primPath: this._primPath, dirtyLocators: new HdDataSourceLocatorSet(normalsLocator) })
        }
      }

      if (dirtyPrimvars.length > 0) {
        const primvarLocators = new HdDataSourceLocatorSet()
        for (const primvar of dirtyPrimvars) {
          primvarLocators.add(
            HdPrimvarsSchema.getDefaultLocator().append(primvar)
              .append(HdPrimvarSchemaTokens.primvarValue))
        }
        entries.push({ primPath: this._primPath, dirtyLocators: primvarLocators })
      }
    }

    return result
  }
}

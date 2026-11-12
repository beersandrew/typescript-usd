// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdSkelImaging/dataSourceResolvedSkeletonPrim.cpp,
//  pxr/usdImaging/usdSkelImaging/dataSourceResolvedSkeletonPrim.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdSkelImaging/dataSourceResolvedSkeletonPrim.{h,cpp}
// (OpenUSD 26.11.1).
//
// Divergences:
// - shared_from_this() is `this`; std::shared_ptr<...Data> are plain object
//   references cached by UsdSkelImagingSharedPtrThunk.
// - VtTokenArray / VtFloatArray values are plain arrays, VtVec2iArray and
//   VtArray<GfMatrix4f> are VtArrays (hd/src/dataSourceTypeDefs.ts).
// - WorkParallelForN loops are serial.
// - Retained scalar data sources carry their Vt type (valueType) so
//   consumers can rebuild the VtValue (hd/src/dataSource.ts).

import { Matrix4f as GfMatrix4f, Vec2f as GfVec2f, Vec2i as GfVec2i, type Matrix4d as GfMatrix4d } from 'typescript-usd/gf'
import {
  ContainerDataSource as HdContainerDataSource, DataSourceLocator as HdDataSourceLocator,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  GetMergedContributingSampleTimesForInterval as HdGetMergedContributingSampleTimesForInterval,
  MeshSchema as HdMeshSchema, MeshSchemaTokens as HdMeshSchemaTokens,
  MeshTopologySchema as HdMeshTopologySchema, MeshTopologySchemaTokens as HdMeshTopologySchemaTokens,
  PrimTypeTokens as HdPrimTypeTokens, PrimvarSchemaTokens as HdPrimvarSchemaTokens,
  PrimvarsSchema as HdPrimvarsSchema, PrimvarsSchemaTokens as HdPrimvarsSchemaTokens,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  SkinningInputTokens as HdSkinningInputTokens, SkinningSettings as HdSkinningSettings,
  SkinningSkelInputTokens as HdSkinningSkelInputTokens, TypedSampledDataSource as HdTypedSampledDataSource,
  type DataSourceBase as HdDataSourceBase, type DirtiedPrimEntry, type SampledDataSource as HdSampledDataSource,
  type SceneIndexBase as HdSceneIndexBase,
} from 'typescript-usd/hd'
import { OpenSubdivTokens as PxOsdOpenSubdivTokens } from 'typescript-usd/pxOsd'
import { Array as VtArray, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { UsdSkelImagingAnimationSchema } from './animationSchema.ts'
import { UsdSkelImagingBindingSchema } from './bindingSchema.ts'
import { UsdSkelImaging_DataSourcePrimvar } from './dataSourcePrimvar.ts'
import { _UsdSkelImagingGetArray, UsdSkelImagingGetTypedValue, UsdSkelImagingSharedPtrThunk } from './dataSourceUtils.ts'
import { UsdSkelImagingResolvedSkeletonSchema, UsdSkelImagingResolvedSkeletonSchemaTokens } from './resolvedSkeletonSchema.ts'
import {
  _UsdSkelImagingMatrix4fArray, _UsdSkelImagingMatrix4fType, type HdMatrix4fArrayDataSource,
  UsdSkelImagingComputeSkelData, UsdSkelImagingComputeSkinningTransforms, type UsdSkelImagingSkelData,
} from './skelData.ts'
import {
  UsdSkelImagingComputeSkelGuideData, UsdSkelImagingComputeSkelGuideFaceVertexCounts,
  UsdSkelImagingComputeSkelGuideFaceVertexIndices, UsdSkelImagingComputeSkelGuidePoints,
  type UsdSkelImagingSkelGuideData,
} from './skelGuideData.ts'
import { UsdSkelImagingSkeletonSchema } from './skeletonSchema.ts'
import { TF_VERIFY } from './tfDiagnostic.ts'
import { UsdSkelImagingPrimTypeTokens } from './tokens.ts'
import { UsdSkelImagingDataSourceXformResolver } from './xformResolver.ts'

type HdMatrixDataSource = HdTypedSampledDataSource<GfMatrix4d>
type HdVec2iArrayDataSource = HdTypedSampledDataSource<VtArray<GfVec2i>>

/** dataSourceResolvedSkeletonPrim.cpp:31-42. Set-wise union of two sorted
 *  vectors of sample times. */
function _Union(a: readonly number[], b: readonly number[]): number[] {
  const result: number[] = []
  let i = 0, j = 0
  while (i < a.length && j < b.length) {
    const x = a[i]!, y = b[j]!
    if (x < y) { result.push(x); ++i }
    else if (y < x) { result.push(y); ++j }
    else { result.push(x); ++i; ++j }
  }
  while (i < a.length) result.push(a[i++]!)
  while (j < b.length) result.push(b[j++]!)
  return result
}

/** Replaces the contents of `out` (the std::vector<float>* out-parameter). */
function _Assign(out: number[], values: number[]): void {
  out.splice(0, out.length, ...values)
}

/** dataSourceResolvedSkeletonPrim.cpp:44-144. Data source for
 *  resolvedSkeleton/skinningTransforms */
class _SkinningTransformsDataSource extends HdTypedSampledDataSource<VtArray<GfMatrix4f>> {
  // Safe value at zero. Similar to how the xform data source for
  // the flattening scene index works.
  private readonly _valueAtZero: VtArray<GfMatrix4f>

  private constructor(
    private readonly _data: UsdSkelImagingSkelData | undefined,
    private readonly _restTransformsDataSource: HdMatrix4fArrayDataSource | undefined,
    private readonly _animationSchemas: readonly UsdSkelImagingAnimationSchema[],
    private readonly _animationSources: readonly string[],
  ) {
    super()
    this._valueAtZero = this._compute(0.0)
  }

  static new(
    data: UsdSkelImagingSkelData | undefined,
    restTransformsDataSource: HdMatrix4fArrayDataSource | undefined,
    animationSchemas: readonly UsdSkelImagingAnimationSchema[],
    animationSources: readonly string[],
  ): _SkinningTransformsDataSource {
    return new _SkinningTransformsDataSource(
      data, restTransformsDataSource, animationSchemas, animationSources)
  }

  /** dataSourceResolvedSkeletonPrim.cpp:54-60 */
  getTypedValue(shutterOffset: number): VtArray<GfMatrix4f> {
    if (shutterOffset === 0.0) {
      return this._valueAtZero
    }
    return this._compute(shutterOffset)
  }

  /** dataSourceResolvedSkeletonPrim.cpp:62-108 */
  GetContributingSampleTimesForInterval(
    startTime: number, endTime: number, outSampleTimes: number[],
  ): boolean {
    const ds: (HdSampledDataSource | undefined)[] = []
    for (const animSchema of this._animationSchemas) {
      ds.push(animSchema.getTranslations())
      ds.push(animSchema.getRotations())
      ds.push(animSchema.getScales())
    }

    if (!HdGetMergedContributingSampleTimesForInterval(
      ds, startTime, endTime, outSampleTimes)) {
      return false
    }

    if (outSampleTimes) {
      // Replicate behavior of usdSkel/skeletonAdapter.cpp
      // and usdImagingDelegate.
      //
      // startTime and endTime are explictily added by
      // _UnionTimeSample in skeletonAdapter.cpp
      //
      // If a USD attribute is not animated, the UsdImagingDelegate
      // sample method gives a sample at time zero.
      // HdsiExtComputationPrimvarPruningSceneIndex takes the union
      // of all input time samples.
      // For skeletons served by the UsdImagingDelegate, the
      // geomBindTransform is typically not animated and ultimately
      // causes the 0 sample time to be seen by the render delegate.
      //
      // TODO: This should be controlled by the Usd MotionAPI.
      // It is unclear though whether to apply it to the Skeleton
      // or the affected mesh.
      //
      _Assign(outSampleTimes, _Union(outSampleTimes, [startTime, 0.0, endTime]))
    }

    return true
  }

  /** dataSourceResolvedSkeletonPrim.cpp:124-134 */
  private _compute(shutterOffset: number): VtArray<GfMatrix4f> {
    if (!TF_VERIFY(this._data)) {
      return _UsdSkelImagingMatrix4fArray([])
    }

    return UsdSkelImagingComputeSkinningTransforms(
      this._data!, this._restTransformsDataSource, this._animationSchemas,
      this._animationSources, shutterOffset)
  }
}

/** dataSourceResolvedSkeletonPrim.cpp:146-253. Data source for
 *  resolvedSkeleton/blendShapes. This concatenates all the blendShapes from
 *  resolved animation schemas on the resolved skeleton data source. */
class _BlendShapesDataSource extends HdTypedSampledDataSource<string[]> {
  // XXX
  // pattern copied from _SkinningTransformsDataSource but doesn't feel
  // necessary in both?
  private readonly _valueAtZero: string[]

  private constructor(
    private readonly _animSchemas: readonly UsdSkelImagingAnimationSchema[],
    private readonly _blendShapeRanges: HdVec2iArrayDataSource | undefined,
  ) {
    super()
    this._valueAtZero = this._compute(0.0)
  }

  static new(
    animationSchemas: readonly UsdSkelImagingAnimationSchema[],
    blendShapeRanges: HdVec2iArrayDataSource | undefined,
  ): _BlendShapesDataSource {
    return new _BlendShapesDataSource(animationSchemas, blendShapeRanges)
  }

  /** dataSourceResolvedSkeletonPrim.cpp:158-164 */
  getTypedValue(shutterOffset: number): string[] {
    if (shutterOffset === 0.0) {
      return this._valueAtZero
    }
    return this._compute(shutterOffset)
  }

  /** dataSourceResolvedSkeletonPrim.cpp:166-192 */
  GetContributingSampleTimesForInterval(
    startTime: number, endTime: number, outSampleTimes: number[],
  ): boolean {
    const ds = this._animSchemas.map(animSchema => animSchema.getBlendShapes())

    if (!HdGetMergedContributingSampleTimesForInterval(
      ds, startTime, endTime, outSampleTimes)) {
      return false
    }

    if (outSampleTimes) {
      // Same logic as _SkinningTransformsDataSource
      _Assign(outSampleTimes, _Union(outSampleTimes, [startTime, 0.0, endTime]))
    }

    return true
  }

  /** dataSourceResolvedSkeletonPrim.cpp:204-244 */
  private _compute(shutterOffset: number): string[] {
    if (this._animSchemas.length === 0) {
      return []
    }

    const ranges = _UsdSkelImagingGetArray<GfVec2i>(this._blendShapeRanges, shutterOffset)
    const lastRange = ranges[ranges.length - 1]!.data
    const numBlendShapes = lastRange[0]! + lastRange[1]!

    const result: string[] = new Array(numBlendShapes)
    for (let i = 0; i < this._animSchemas.length; ++i) {
      const shapes = _UsdSkelImagingGetArray<string>(
        this._animSchemas[i]!.getBlendShapes(), shutterOffset)
      const range = ranges[i]!.data
      for (let j = 0; j < range[1]!; ++j) {
        result[range[0]! + j] = shapes[j]!
      }
    }

    return result
  }
}

/** dataSourceResolvedSkeletonPrim.cpp:255-357. Data source for
 *  resolvedSkeleton/blendShapeWeights. This concatenates all the
 *  blendShapeWeights from resolved animation schemas on the resolved
 *  skeleton data source. */
class _BlendShapeWeightsDataSource extends HdTypedSampledDataSource<number[]> {
  private readonly _valueAtZero: number[]

  private constructor(
    private readonly _animSchemas: readonly UsdSkelImagingAnimationSchema[],
    private readonly _blendShapeRanges: HdVec2iArrayDataSource | undefined,
  ) {
    super()
    this._valueAtZero = this._compute(0.0)
  }

  static new(
    animationSchemas: readonly UsdSkelImagingAnimationSchema[],
    blendShapeRanges: HdVec2iArrayDataSource | undefined,
  ): _BlendShapeWeightsDataSource {
    return new _BlendShapeWeightsDataSource(animationSchemas, blendShapeRanges)
  }

  /** dataSourceResolvedSkeletonPrim.cpp:267-273 */
  getTypedValue(shutterOffset: number): number[] {
    if (shutterOffset === 0.0) {
      return this._valueAtZero
    }
    return this._compute(shutterOffset)
  }

  /** dataSourceResolvedSkeletonPrim.cpp:275-301 */
  GetContributingSampleTimesForInterval(
    startTime: number, endTime: number, outSampleTimes: number[],
  ): boolean {
    const ds = this._animSchemas.map(animSchema => animSchema.getBlendShapeWeights())

    if (!HdGetMergedContributingSampleTimesForInterval(
      ds, startTime, endTime, outSampleTimes)) {
      return false
    }

    if (outSampleTimes) {
      // Same logic as _SkinningTransformsDataSource
      _Assign(outSampleTimes, _Union(outSampleTimes, [startTime, 0.0, endTime]))
    }

    return true
  }

  /** dataSourceResolvedSkeletonPrim.cpp:313-348 */
  private _compute(shutterOffset: number): number[] {
    if (this._animSchemas.length === 0) {
      return []
    }

    const ranges = _UsdSkelImagingGetArray<GfVec2i>(this._blendShapeRanges, shutterOffset)
    const lastRange = ranges[ranges.length - 1]!.data
    const numBlendShapes = lastRange[0]! + lastRange[1]!

    const result: number[] = new Array(numBlendShapes)
    for (let i = 0; i < this._animSchemas.length; ++i) {
      const weights = _UsdSkelImagingGetArray<number>(
        this._animSchemas[i]!.getBlendShapeWeights(), shutterOffset)
      const range = ranges[i]!.data
      for (let j = 0; j < range[1]!; ++j) {
        result[range[0]! + j] = weights[j]!
      }
    }

    return result
  }
}

/** dataSourceResolvedSkeletonPrim.cpp:359-456. Data source for
 *  resolvedSkeleton/blendShapeRanges. This provides the ranges (offset,
 *  numElements tuple) of the concatenated blendShapes and blendShapeWeights
 *  from resolved animation schemas on the resolved skeleton data source.
 *  Because animation schemas don't necessarily have the same number of blend
 *  shapes, this provides the downstream data source (namely
 *  UsdSkelImagingDataSourceResolvedPointsBasedPrim) a way to restore them
 *  individually. */
class _BlendShapeRangesDataSource extends HdTypedSampledDataSource<VtArray<GfVec2i>> {
  private readonly _valueAtZero: VtArray<GfVec2i>

  private constructor(
    private readonly _animSchemas: readonly UsdSkelImagingAnimationSchema[],
  ) {
    super()
    this._valueAtZero = this._compute(0.0)
  }

  static new(animationSchemas: readonly UsdSkelImagingAnimationSchema[]): _BlendShapeRangesDataSource {
    return new _BlendShapeRangesDataSource(animationSchemas)
  }

  /** dataSourceResolvedSkeletonPrim.cpp:378-384 */
  getTypedValue(shutterOffset: number): VtArray<GfVec2i> {
    if (shutterOffset === 0.0) {
      return this._valueAtZero
    }
    return this._compute(shutterOffset)
  }

  /** dataSourceResolvedSkeletonPrim.cpp:386-412 */
  GetContributingSampleTimesForInterval(
    startTime: number, endTime: number, outSampleTimes: number[],
  ): boolean {
    const ds = this._animSchemas.map(animSchema => animSchema.getBlendShapeWeights())

    if (!HdGetMergedContributingSampleTimesForInterval(
      ds, startTime, endTime, outSampleTimes)) {
      return false
    }

    if (outSampleTimes) {
      // Same logic as _SkinningTransformsDataSource
      _Assign(outSampleTimes, _Union(outSampleTimes, [startTime, 0.0, endTime]))
    }

    return true
  }

  /** dataSourceResolvedSkeletonPrim.cpp:422-448 */
  private _compute(shutterOffset: number): VtArray<GfVec2i> {
    if (this._animSchemas.length === 0) {
      return new VtArray<GfVec2i>([], VtValueTypes.GfVec2i)
    }

    let offset = 0
    const result: GfVec2i[] = []
    for (const animSchema of this._animSchemas) {
      const size = _UsdSkelImagingGetArray<number>(
        animSchema.getBlendShapeWeights(), shutterOffset).length
      result.push(new GfVec2i(offset, size))
      offset += size
    }
    return new VtArray<GfVec2i>(result, VtValueTypes.GfVec2i)
  }
}

/** dataSourceResolvedSkeletonPrim.cpp:458-518. Data source for
 *  resolvedSkeleton */
class _ResolvedSkeletonSchemaDataSource extends HdContainerDataSource {
  private constructor(
    private readonly _resolvedSkeletonSource: UsdSkelImagingDataSourceResolvedSkeletonPrim,
  ) { super() }

  static new(
    resolvedSkeletonSource: UsdSkelImagingDataSourceResolvedSkeletonPrim,
  ): _ResolvedSkeletonSchemaDataSource {
    return new _ResolvedSkeletonSchemaDataSource(resolvedSkeletonSource)
  }

  /** dataSourceResolvedSkeletonPrim.cpp:464-473 */
  getNames(): string[] {
    return [
      UsdSkelImagingResolvedSkeletonSchemaTokens.skelLocalToCommonSpace,
      UsdSkelImagingResolvedSkeletonSchemaTokens.skinningTransforms,
      UsdSkelImagingResolvedSkeletonSchemaTokens.blendShapes,
      UsdSkelImagingResolvedSkeletonSchemaTokens.blendShapeWeights,
      UsdSkelImagingResolvedSkeletonSchemaTokens.blendShapeRanges,
    ]
  }

  /** dataSourceResolvedSkeletonPrim.cpp:475-506 */
  Get(name: string): HdDataSourceBase | undefined {
    if (name === UsdSkelImagingResolvedSkeletonSchemaTokens.skelLocalToCommonSpace) {
      // XXX
      // this entry is surprisingly expensive, in the 10k human female
      // test it's taking almost 3s to compute this and in multiple
      // levels of call sites in both HdStPopulateConstantPrimvars() and
      // HdStPopulateVertexPrimvars() since there's only 1 skeleton in
      // the scene it's prob getting called per instance?
      return this._resolvedSkeletonSource.getSkelLocalToCommonSpace()
    }
    if (name === UsdSkelImagingResolvedSkeletonSchemaTokens.skinningTransforms) {
      return this._resolvedSkeletonSource.getSkinningTransforms()
    }
    if (name === UsdSkelImagingResolvedSkeletonSchemaTokens.blendShapes) {
      return this._resolvedSkeletonSource.getBlendShapes()
    }
    if (name === UsdSkelImagingResolvedSkeletonSchemaTokens.blendShapeWeights) {
      return this._resolvedSkeletonSource.getBlendShapeWeights()
    }
    if (name === UsdSkelImagingResolvedSkeletonSchemaTokens.blendShapeRanges) {
      return this._resolvedSkeletonSource.getBlendShapeRanges()
    }
    return undefined
  }
}

/** dataSourceResolvedSkeletonPrim.cpp:520-578. Data source for
 *  mesh/topology - for guide. */
class _MeshTopologySchemaDataSource extends HdContainerDataSource {
  private constructor(
    private readonly _resolvedSkeletonSource: UsdSkelImagingDataSourceResolvedSkeletonPrim,
  ) { super() }

  static new(
    resolvedSkeletonSource: UsdSkelImagingDataSourceResolvedSkeletonPrim,
  ): _MeshTopologySchemaDataSource {
    return new _MeshTopologySchemaDataSource(resolvedSkeletonSource)
  }

  /** dataSourceResolvedSkeletonPrim.cpp:526-534 */
  getNames(): string[] {
    return [
      HdMeshTopologySchemaTokens.faceVertexCounts,
      HdMeshTopologySchemaTokens.faceVertexIndices,
      HdMeshTopologySchemaTokens.orientation,
    ]
  }

  /** dataSourceResolvedSkeletonPrim.cpp:536-561 */
  Get(name: string): HdDataSourceBase | undefined {
    if (name === HdMeshTopologySchemaTokens.faceVertexCounts) {
      return new HdRetainedTypedSampledDataSource<number[]>(
        UsdSkelImagingComputeSkelGuideFaceVertexCounts(this._getSkelGuideData()),
        VtValueTypes.int)
    }

    if (name === HdMeshTopologySchemaTokens.faceVertexIndices) {
      return new HdRetainedTypedSampledDataSource<number[]>(
        UsdSkelImagingComputeSkelGuideFaceVertexIndices(this._getSkelGuideData()),
        VtValueTypes.int)
    }

    if (name === HdMeshTopologySchemaTokens.orientation) {
      return HdMeshTopologySchema.buildOrientationDataSource(
        HdMeshTopologySchemaTokens.rightHanded)
    }

    return undefined
  }

  /** dataSourceResolvedSkeletonPrim.cpp:571-574 */
  private _getSkelGuideData(): UsdSkelImagingSkelGuideData {
    return this._resolvedSkeletonSource.getSkelGuideData()!
  }
}

/** dataSourceResolvedSkeletonPrim.cpp:580-619. Data source for
 *  primvars/points/primvarValue - for mesh guide. */
class _PointsPrimvarValueDataSource extends HdTypedSampledDataSource<VtArray<unknown>> {
  private constructor(
    private readonly _data: UsdSkelImagingSkelGuideData,
    private readonly _skinningTransforms: HdMatrix4fArrayDataSource,
  ) { super() }

  static new(
    data: UsdSkelImagingSkelGuideData,
    skinningTransforms: HdMatrix4fArrayDataSource,
  ): _PointsPrimvarValueDataSource {
    return new _PointsPrimvarValueDataSource(data, skinningTransforms)
  }

  /** dataSourceResolvedSkeletonPrim.cpp:590-597 */
  getTypedValue(shutterOffset: number): VtArray<unknown> {
    return UsdSkelImagingComputeSkelGuidePoints(
      this._data,
      UsdSkelImagingGetTypedValue(this._skinningTransforms, shutterOffset)) as VtArray<unknown>
  }

  /** dataSourceResolvedSkeletonPrim.cpp:599-606 */
  GetContributingSampleTimesForInterval(
    startTime: number, endTime: number, outSampleTimes: number[],
  ): boolean {
    return this._skinningTransforms.GetContributingSampleTimesForInterval(
      startTime, endTime, outSampleTimes)
  }
}

/** dataSourceResolvedSkeletonPrim.cpp:621-640 */
function _GetInstanceAnimationSchemas(
  instanceAnimationSources: readonly string[],
  sceneIndex: HdSceneIndexBase,
): UsdSkelImagingAnimationSchema[] {
  return instanceAnimationSources.map(source =>
    UsdSkelImagingAnimationSchema.getFromParent(
      source === '' ? undefined : sceneIndex.getPrim(source).dataSource))
}

/** dataSourceResolvedSkeletonPrim.cpp:642-647 */
function _ToDataSource<T>(value: T, valueType?: unknown): HdRetainedTypedSampledDataSource<T> {
  return new HdRetainedTypedSampledDataSource<T>(value, valueType)
}

/** dataSourceResolvedSkeletonPrim.cpp:649-775. Data source that provides
 *  the primvars for skeleton guide vertex shader skinning. */
class _SkelGuideSkinningPrimvarsDataSource extends HdContainerDataSource {
  private constructor(
    private readonly _data: UsdSkelImagingSkelGuideData,
    private readonly _skinningTransforms: HdMatrix4fArrayDataSource,
    private readonly _useInstanceOffset: boolean,
  ) { super() }

  static new(
    data: UsdSkelImagingSkelGuideData,
    skinningTransforms: HdMatrix4fArrayDataSource,
    useInstanceOffset: boolean,
  ): _SkelGuideSkinningPrimvarsDataSource {
    return new _SkelGuideSkinningPrimvarsDataSource(data, skinningTransforms, useInstanceOffset)
  }

  /** dataSourceResolvedSkeletonPrim.cpp:656-691 */
  getNames(): string[] {
    return [
      HdPrimvarsSchemaTokens.points,

      // ExtComputationInputValues
      HdSkinningInputTokens.skinningXforms,
      HdSkinningInputTokens.skelLocalToCommonSpace,
      HdSkinningInputTokens.commonSpaceToPrimLocal,

      // ExtAggregatorComputationInputValues
      HdSkinningSkelInputTokens.geomBindTransform,

      HdSkinningInputTokens.hasConstantInfluences,
      // TODO
      // If we can get vertex primvar to accept tensor values in
      // imaging/hdSt/mesh.cpp _PopulateVertexPrimvars()#1417
      // (buffer source array size is currently hardcoded to 1)
      // then we'd change these 2 to
      // skel:jointIndices and skel:jointWeights
      HdSkinningInputTokens.numInfluencesPerComponent,
      HdSkinningInputTokens.influences,

      // XXX
      // need to check if skinningMethod primvar actually exists, it's
      // possible that it got aggregated to instance primvar on the instancer.
      // if it doesn't exist then we create the fall back primvar here.
      // enumerate skinningMethod because we can't pass down existing
      // Token primvar to vertex shader.
      HdSkinningInputTokens.numSkinningMethod,
      // Extra primvars needed for processing instance/vertex indexing
      // in the vertex shader.
      HdSkinningInputTokens.numJoints,
    ]
  }

  /** dataSourceResolvedSkeletonPrim.cpp:693-759 */
  Get(name: string): HdDataSourceBase | undefined {
    if (name === HdPrimvarsSchemaTokens.points) {
      return UsdSkelImaging_DataSourcePrimvar.new(
        _ToDataSource(new VtArray(this._data.boneMeshPoints, VtValueTypes.GfVec3f)),
        HdPrimvarSchemaTokens.vertex,
        HdPrimvarSchemaTokens.point)
    }

    // ExtComputationInputValues
    if (name === HdSkinningInputTokens.skinningXforms) {
      return UsdSkelImaging_DataSourcePrimvar.new(this._skinningTransforms)
    }
    if (name === HdSkinningInputTokens.skelLocalToCommonSpace) {
      return UsdSkelImaging_DataSourcePrimvar.new(
        _ToDataSource(new GfMatrix4f(1.0), _UsdSkelImagingMatrix4fType))
    }
    if (name === HdSkinningInputTokens.commonSpaceToPrimLocal) {
      return UsdSkelImaging_DataSourcePrimvar.new(
        _ToDataSource(new GfMatrix4f(1.0), _UsdSkelImagingMatrix4fType))
    }

    // ExtAggregatorComputationInputValues
    if (name === HdSkinningSkelInputTokens.geomBindTransform) {
      return UsdSkelImaging_DataSourcePrimvar.new(
        _ToDataSource(new GfMatrix4f(1.0), _UsdSkelImagingMatrix4fType))
    }
    if (name === HdSkinningInputTokens.hasConstantInfluences) {
      return UsdSkelImaging_DataSourcePrimvar.new(
        _ToDataSource(false, VtValueTypes.bool))
    }
    if (name === HdSkinningInputTokens.numInfluencesPerComponent) {
      return UsdSkelImaging_DataSourcePrimvar.new(_ToDataSource(1, VtValueTypes.int))
    }
    if (name === HdSkinningInputTokens.influences) {
      const influences = this._data.boneJointIndices.map(
        jointIndex => new GfVec2f(jointIndex, 1.0))
      return UsdSkelImaging_DataSourcePrimvar.new(
        _ToDataSource(new VtArray<GfVec2f>(influences, VtValueTypes.GfVec2f)))
    }

    if (name === HdSkinningInputTokens.numSkinningMethod) {
      // default LBS = 0
      return UsdSkelImaging_DataSourcePrimvar.new(_ToDataSource(0, VtValueTypes.int))
    }
    if (name === HdSkinningInputTokens.numJoints) {
      return UsdSkelImaging_DataSourcePrimvar.new(
        // Zero out the instanceOffset in skinning vertex shader if we
        // only have one instance or when there's no instance animation
        // source override.
        _ToDataSource(this._useInstanceOffset ? this._data.numJoints : 0, VtValueTypes.int))
    }
    return undefined
  }
}

/** dataSourceResolvedSkeletonPrim.cpp:809-825 */
class _RestTransformsCache extends UsdSkelImagingSharedPtrThunk<VtArray<GfMatrix4f>> {
  constructor(private readonly _schema: UsdSkelImagingSkeletonSchema) { super() }

  /** dataSourceResolvedSkeletonPrim.cpp:816-822 */
  protected _compute(): VtArray<GfMatrix4f> {
    const m = _UsdSkelImagingGetArray<GfMatrix4d>(this._schema.getRestTransforms())
    return _UsdSkelImagingMatrix4fArray(m.map(x => new GfMatrix4f(x)))
  }
}

/** dataSourceResolvedSkeletonPrim.cpp:779-827. Read rest transforms from
 *  UsdSkelImagingSkeletonSchema lazily and convert to VtArray<GfMatrix4f>.
 *
 *  Note that rest transforms is only needed if there is no animation or the
 *  animation is not sparse. */
class _RestTransformsDataSource extends HdTypedSampledDataSource<VtArray<GfMatrix4f>> {
  private readonly _cache: _RestTransformsCache

  private constructor(schema: UsdSkelImagingSkeletonSchema) {
    super()
    this._cache = new _RestTransformsCache(schema)
  }

  static new(schema: UsdSkelImagingSkeletonSchema): _RestTransformsDataSource {
    return new _RestTransformsDataSource(schema)
  }

  /** dataSourceResolvedSkeletonPrim.cpp:787 */
  invalidate(): void { this._cache.invalidate() }

  /** dataSourceResolvedSkeletonPrim.cpp:793-795 */
  getTypedValue(_shutterOffset: number): VtArray<GfMatrix4f> {
    return this._cache.Get()!
  }

  /** dataSourceResolvedSkeletonPrim.cpp:797-802 */
  GetContributingSampleTimesForInterval(
    _startTime: number, _endTime: number, _outSampleTimes: number[],
  ): boolean {
    return false
  }
}

/** dataSourceResolvedSkeletonPrim.h:156-168, .cpp:1206-1222 */
class _SkelDataCache extends UsdSkelImagingSharedPtrThunk<UsdSkelImagingSkelData> {
  constructor(
    private readonly _sceneIndex: HdSceneIndexBase,
    private readonly _primPath: string,
  ) { super() }

  protected _compute(): UsdSkelImagingSkelData {
    return UsdSkelImagingComputeSkelData(this._sceneIndex, this._primPath)
  }
}

/** dataSourceResolvedSkeletonPrim.h:170-181, .cpp:1225-1240 */
class _SkelGuideDataCache extends UsdSkelImagingSharedPtrThunk<UsdSkelImagingSkelGuideData> {
  constructor(
    private readonly _resolvedSkeleton: UsdSkelImagingDataSourceResolvedSkeletonPrim,
  ) { super() }

  protected _compute(): UsdSkelImagingSkelGuideData {
    return UsdSkelImagingComputeSkelGuideData(this._resolvedSkeleton.getSkelData()!)
  }
}

let _dependedOnLocators: HdDataSourceLocatorSet | undefined
let _pointsPrimvarValueLocator: HdDataSourceLocator | undefined

/** dataSourceResolvedSkeletonPrim.cpp:989-998 */
function _PointsPrimvarValueLocator(): HdDataSourceLocator {
  return _pointsPrimvarValueLocator ??= HdPrimvarsSchema.getDefaultLocator()
    .append(HdPrimvarsSchemaTokens.points)
    .append(HdPrimvarSchemaTokens.primvarValue)
}

/** dataSourceResolvedSkeletonPrim.h:23-200. A data source providing data for
 *  the UsdSkelImagingResolvedSkeletonSchema and for drawing the guide as a
 *  mesh.
 *
 *  Used by skeleton resolving scene index. */
export class UsdSkelImagingDataSourceResolvedSkeletonPrim extends HdContainerDataSource {
  // Path of skel animation prim.
  private readonly _animationSource: string
  // Animation schema from the above skel animation prim.
  private readonly _animationSchema: UsdSkelImagingAnimationSchema
  private readonly _skelDataCache: _SkelDataCache
  private readonly _skelGuideDataCache: _SkelGuideDataCache
  private readonly _restTransformsDataSource: _RestTransformsDataSource
  // Serves GetSkelLocalToWorld - taking instancing into account.
  private readonly _xformResolver: UsdSkelImagingDataSourceXformResolver
  // Paths of skel animation prims bound to the instancer.
  // They came in as skel:animationSource primvar on the instancer.
  private readonly _instanceAnimationSources: string[]
  // Animation schema from the above skel animation prims.
  private readonly _instanceAnimationSchemas: UsdSkelImagingAnimationSchema[]

  /** dataSourceResolvedSkeletonPrim.cpp:829-859 */
  private constructor(
    sceneIndex: HdSceneIndexBase,
    // Path to this skeleton prim.
    private readonly _primPath: string,
    // Input data source for this skeleton prim.
    private readonly _primSource: HdContainerDataSource | undefined,
  ) {
    super()
    this._animationSource =
      UsdSkelImagingGetTypedValue(
        UsdSkelImagingBindingSchema.getFromParent(_primSource)
          .getAnimationSource()) ?? ''
    this._animationSchema =
      UsdSkelImagingAnimationSchema.getFromParent(
        this._animationSource === ''
          ? undefined
          : sceneIndex.getPrim(this._animationSource).dataSource)
    this._skelDataCache = new _SkelDataCache(sceneIndex, _primPath)
    this._skelGuideDataCache = new _SkelGuideDataCache(this)
    this._restTransformsDataSource = _RestTransformsDataSource.new(
      UsdSkelImagingSkeletonSchema.getFromParent(_primSource))
    this._xformResolver = new UsdSkelImagingDataSourceXformResolver(sceneIndex, _primSource)
    // XXX
    // Should verify if the instancer we get from _xformResolver that instances
    // this skeleton and the instancer with prototypes bound to this skeleton are
    // the same thing. Is it possible that they could be different?
    this._instanceAnimationSources = this._xformResolver.getInstanceAnimationSource()
    this._instanceAnimationSchemas =
      _GetInstanceAnimationSchemas(this._instanceAnimationSources, sceneIndex)
  }

  /** HD_DECLARE_DATASOURCE New */
  static new(
    sceneIndex: HdSceneIndexBase,
    primPath: string,
    primSource: HdContainerDataSource | undefined,
  ): UsdSkelImagingDataSourceResolvedSkeletonPrim {
    return new UsdSkelImagingDataSourceResolvedSkeletonPrim(sceneIndex, primPath, primSource)
  }

  /** dataSourceResolvedSkeletonPrim.cpp:864-873 */
  getNames(): string[] {
    return [
      UsdSkelImagingResolvedSkeletonSchema.getSchemaToken(),
      HdMeshSchema.getSchemaToken(),
      HdPrimvarsSchema.getSchemaToken(),
    ]
  }

  /** dataSourceResolvedSkeletonPrim.cpp:875-913 */
  Get(name: string): HdDataSourceBase | undefined {
    if (name === UsdSkelImagingResolvedSkeletonSchema.getSchemaToken()) {
      return _ResolvedSkeletonSchemaDataSource.new(this)
    }
    if (name === HdMeshSchema.getSchemaToken()) {
      return HdRetainedContainerDataSource.new(
        [HdMeshSchemaTokens.topology,
          HdMeshSchemaTokens.subdivisionScheme,
          HdMeshSchemaTokens.doubleSided],
        [_MeshTopologySchemaDataSource.new(this),
          _ToDataSource(PxOsdOpenSubdivTokens.none, VtValueTypes.token),
          _ToDataSource(true, VtValueTypes.bool)])
    }
    if (name === HdPrimvarsSchema.getSchemaToken()) {
      if (HdSkinningSettings.isSkinningDeferred()) {
        // if we only have a single animation source then we don't need to
        // instance offset the index into skinning primvars.
        const useInstanceOffset = this.getAnimationSource().length > 1
        return _SkelGuideSkinningPrimvarsDataSource.new(
          this.getSkelGuideData()!, this.getSkinningTransforms(), useInstanceOffset)
      }
      return HdRetainedContainerDataSource.new(
        [HdPrimvarsSchemaTokens.points],
        [UsdSkelImaging_DataSourcePrimvar.new(
          _PointsPrimvarValueDataSource.new(
            this.getSkelGuideData()!, this.getSkinningTransforms()),
          HdPrimvarSchemaTokens.vertex,
          HdPrimvarSchemaTokens.point)])
    }
    return undefined
  }

  /** dataSourceResolvedSkeletonPrim.cpp:915-922 */
  private _shouldResolveInstanceAnimation(): boolean {
    const instancerPaths = this.getInstancerPaths()
    return HdSkinningSettings.isSkinningDeferred() &&
      instancerPaths.length > 0 && this._instanceAnimationSources.length > 0
  }

  /** dataSourceResolvedSkeletonPrim.cpp:924-929. skelAnimation targeted by
   *  the skeleton. Used to track dependency of this prim on the
   *  skelAnimation. When skinning is deferred, return the animationSource
   *  overrides on the instancer instead if it exists. */
  getAnimationSource(): string[] {
    return this._shouldResolveInstanceAnimation()
      ? this._instanceAnimationSources
      : [this._animationSource]
  }

  /** dataSourceResolvedSkeletonPrim.cpp:931-936. Schema(s) from
   *  skelAnimation at GetAnimationSource(). */
  getAnimationSchema(): UsdSkelImagingAnimationSchema[] {
    return this._shouldResolveInstanceAnimation()
      ? this._instanceAnimationSchemas
      : [this._animationSchema]
  }

  /** dataSourceResolvedSkeletonPrim.h:56-63. Paths to instancers instancing
   *  this prim - not including ones outside the skel root. */
  getInstancerPaths(): readonly string[] {
    return this._xformResolver.getInstancerPaths()
  }

  /** dataSourceResolvedSkeletonPrim.cpp:938-943. Transfrom to go from local
   *  space of skeleton prim to common space (as defined by
   *  UsdSkelImagingDataSourceXformResolver). */
  getSkelLocalToCommonSpace(): HdMatrixDataSource | undefined {
    return this._xformResolver.getPrimLocalToCommonSpace()
  }

  /** dataSourceResolvedSkeletonPrim.cpp:945-952. Skinning transforms. */
  getSkinningTransforms(): HdMatrix4fArrayDataSource {
    return _SkinningTransformsDataSource.new(
      this._skelDataCache.Get(), this._restTransformsDataSource,
      this.getAnimationSchema(), this.getAnimationSource())
  }

  /** dataSourceResolvedSkeletonPrim.cpp:954-960 */
  getBlendShapes(): HdTypedSampledDataSource<string[]> {
    return _BlendShapesDataSource.new(
      this.getAnimationSchema(), this.getBlendShapeRanges())
  }

  /** dataSourceResolvedSkeletonPrim.cpp:962-968 */
  getBlendShapeWeights(): HdTypedSampledDataSource<number[]> {
    return _BlendShapeWeightsDataSource.new(
      this.getAnimationSchema(), this.getBlendShapeRanges())
  }

  /** dataSourceResolvedSkeletonPrim.cpp:970-975 */
  getBlendShapeRanges(): HdVec2iArrayDataSource {
    return _BlendShapeRangesDataSource.new(this.getAnimationSchema())
  }

  /** dataSourceResolvedSkeletonPrim.h:90-94. (Non-animated) skel data
   *  computed from this skeleton and the parts of skelAnimation relating to
   *  the topology/remapping. */
  getSkelData(): UsdSkelImagingSkelData | undefined {
    return this._skelDataCache.Get()
  }

  /** dataSourceResolvedSkeletonPrim.h:96-100. Some of the (non-animated)
   *  data to compute the points and topology for the mesh guide. */
  getSkelGuideData(): UsdSkelImagingSkelGuideData | undefined {
    return this._skelGuideDataCache.Get()
  }

  /** dataSourceResolvedSkeletonPrim.cpp:977-987. Data source locators (on
   *  this prim) that this prim depends on.
   *
   *  That is, if the input scene sends a dirty entry for this prim path with
   *  dirty locators intersecting these data source locators, we need to call
   *  ProcessDirtyLocators. */
  static getDependendendOnDataSourceLocators(): HdDataSourceLocatorSet {
    return _dependedOnLocators ??= new HdDataSourceLocatorSet([
      UsdSkelImagingSkeletonSchema.getDefaultLocator(),
      UsdSkelImagingBindingSchema.getAnimationSourceLocator(),
      UsdSkelImagingDataSourceXformResolver.getXformLocator(),
    ])
  }

  /** dataSourceResolvedSkeletonPrim.cpp:1000-1069 */
  private _processSkeletonDirtyLocators(
    dirtyLocators: HdDataSourceLocatorSet,
    newDirtyLocators: HdDataSourceLocatorSet | undefined,
  ): boolean {
    if (dirtyLocators.contains(
      UsdSkelImagingSkeletonSchema.getDefaultLocator())) {
      // The entire skeleton schema was changed, blow everything.
      // resolved skeleton schema data source.
      return true
    }

    if (dirtyLocators.contains(
      UsdSkelImagingBindingSchema.getAnimationSourceLocator()) &&
        !this._shouldResolveInstanceAnimation()) {
      // Our _animationSource and _animationSchema are invalid.
      // Just indicate that we want to blow everything.
      return true
    }

    if (dirtyLocators.contains(
      UsdSkelImagingDataSourceXformResolver.getInstancedByLocator())) {
      // Instancers have changed.
      // Just indicate that we want to blow everything.
      return true
    }

    const skelDataLocators = new HdDataSourceLocatorSet([
      UsdSkelImagingSkeletonSchema.getJointsLocator(),
      UsdSkelImagingSkeletonSchema.getBindTransformsLocator()])
    if (dirtyLocators.intersects(skelDataLocators)) {
      this._skelDataCache.invalidate()
      this._skelGuideDataCache.invalidate()
      if (newDirtyLocators) {
        newDirtyLocators.insert(
          UsdSkelImagingResolvedSkeletonSchema.getSkinningTransformsLocator())
        newDirtyLocators.insert(
          HdMeshSchema.getTopologyLocator())
        newDirtyLocators.insert(
          _PointsPrimvarValueLocator())
      }
    }

    if (dirtyLocators.contains(
      UsdSkelImagingSkeletonSchema.getRestTransformsLocator())) {
      this._restTransformsDataSource.invalidate()
      if (newDirtyLocators) {
        newDirtyLocators.insert(
          UsdSkelImagingResolvedSkeletonSchema.getSkinningTransformsLocator())
        newDirtyLocators.insert(
          _PointsPrimvarValueLocator())
      }
    }

    if (dirtyLocators.intersects(
      UsdSkelImagingDataSourceXformResolver.getXformLocator())) {
      if (newDirtyLocators) {
        newDirtyLocators.insert(
          UsdSkelImagingResolvedSkeletonSchema.getSkelLocalToCommonSpaceLocator())
      }
    }

    return false
  }

  /** dataSourceResolvedSkeletonPrim.cpp:1071-1135 */
  private _processSkelAnimationDirtyLocators(
    dirtyLocators: HdDataSourceLocatorSet,
    newDirtyLocators: HdDataSourceLocatorSet | undefined,
  ): boolean {
    if (dirtyLocators.contains(
      UsdSkelImagingAnimationSchema.getDefaultLocator())) {
      return true
    }
    if (dirtyLocators.contains(
      UsdSkelImagingDataSourceXformResolver.getInstancedByLocator())) {
      return true
    }

    if (dirtyLocators.contains(
      UsdSkelImagingAnimationSchema.getJointsLocator())) {
      this._skelDataCache.invalidate()
      this._skelGuideDataCache.invalidate()
      if (newDirtyLocators) {
        newDirtyLocators.insert(
          UsdSkelImagingResolvedSkeletonSchema.getSkinningTransformsLocator())
        newDirtyLocators.insert(
          _PointsPrimvarValueLocator())
      }
    }

    const transformsLocators = new HdDataSourceLocatorSet([
      UsdSkelImagingAnimationSchema.getTranslationsLocator(),
      UsdSkelImagingAnimationSchema.getRotationsLocator(),
      UsdSkelImagingAnimationSchema.getScalesLocator()])
    if (dirtyLocators.intersects(transformsLocators)) {
      if (newDirtyLocators) {
        newDirtyLocators.insert(
          UsdSkelImagingResolvedSkeletonSchema.getSkinningTransformsLocator())
        newDirtyLocators.insert(
          _PointsPrimvarValueLocator())
      }
    }

    if (dirtyLocators.intersects(
      UsdSkelImagingAnimationSchema.getBlendShapesLocator())) {
      if (newDirtyLocators) {
        newDirtyLocators.insert(
          UsdSkelImagingResolvedSkeletonSchema.getBlendShapesLocator())
        newDirtyLocators.insert(
          UsdSkelImagingResolvedSkeletonSchema.getBlendShapeRangesLocator())
      }
    }
    if (dirtyLocators.intersects(
      UsdSkelImagingAnimationSchema.getBlendShapeWeightsLocator())) {
      if (newDirtyLocators) {
        newDirtyLocators.insert(
          UsdSkelImagingResolvedSkeletonSchema.getBlendShapeWeightsLocator())
      }
    }

    return false
  }

  /** dataSourceResolvedSkeletonPrim.cpp:1137-1168 */
  private _processInstancerDirtyLocators(
    dirtyLocators: HdDataSourceLocatorSet,
    newDirtyLocators: HdDataSourceLocatorSet | undefined,
  ): boolean {
    if (dirtyLocators.intersects(
      UsdSkelImagingDataSourceXformResolver.getInstancedByLocator())) {
      return true
    }
    if (dirtyLocators.intersects(
      UsdSkelImagingDataSourceXformResolver.getInstanceAnimationSourceLocator()) &&
        this._shouldResolveInstanceAnimation()) {
      return true
    }

    if (dirtyLocators.intersects(
      UsdSkelImagingDataSourceXformResolver.getXformLocator()) ||
        dirtyLocators.intersects(
          UsdSkelImagingDataSourceXformResolver.getInstanceXformLocator())) {
      if (newDirtyLocators) {
        newDirtyLocators.insert(
          UsdSkelImagingResolvedSkeletonSchema.getSkelLocalToCommonSpaceLocator())
      }
    }

    return false
  }

  /** dataSourceResolvedSkeletonPrim.cpp:1170-1203. Dirty internal
   *  structures in response to dirty locators for skeleton prim
   *  (dirtiedPrimType = "skeleton"), the targeted skelAnimaton prim
   *  (dirtiedPrimType = "skelAnimation") or an instancer
   *  (dirtiedPrimType = "instancer"). Fills dirtied prim entries with
   *  affected locators for this prim or returns true to indicate that we
   *  could not dirty this data source and need to refetch it. */
  processDirtyLocators(
    dirtiedPrimType: string,
    dirtyLocators: HdDataSourceLocatorSet,
    entries: DirtiedPrimEntry[] | undefined,
  ): boolean {
    const newDirtyLocators = new HdDataSourceLocatorSet()
    let result = false

    if (dirtiedPrimType === UsdSkelImagingPrimTypeTokens.skeleton) {
      result = this._processSkeletonDirtyLocators(
        dirtyLocators, entries ? newDirtyLocators : undefined)
    } else if (dirtiedPrimType === UsdSkelImagingPrimTypeTokens.skelAnimation) {
      result = this._processSkelAnimationDirtyLocators(
        dirtyLocators, entries ? newDirtyLocators : undefined)
    } else if (dirtiedPrimType === HdPrimTypeTokens.instancer) {
      result = this._processInstancerDirtyLocators(
        dirtyLocators, entries ? newDirtyLocators : undefined)
    }

    if (entries) {
      if (!newDirtyLocators.IsEmpty()) {
        entries.push({ primPath: this._primPath, dirtyLocators: newDirtyLocators })
      }
    }

    return result
  }

}

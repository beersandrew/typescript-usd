// Ported from OpenUSD 26.11.1: pxr/imaging/hd/dataSourceLegacyPrim.cpp,
//  pxr/imaging/hd/dataSourceLegacyPrim.h, pxr/imaging/hd/tokens.h,
//  pxr/imaging/hd/utils.cpp
// Copyright 2016, 2021, 2023 Pixar. Tomorrow Open Source Technology License
//  1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/dataSourceLegacyPrim.{h,cpp} (OpenUSD 26.11.1):
// HdDataSourceLegacyPrim, the container data source that presents a prim of
// a legacy HdSceneDelegate through the Hydra 2.0 schemas.
//
// Deliberate divergences:
// - SdfPath ids are path strings (as everywhere in this hd port).
// - Typed sampled data sources return their typed value from GetValue (see
//   retainedDataSource.ts); the type-erased value data sources
//   (Hd_DataSourceLegacyPrimvarValue, ...) return a VtValue, as upstream.
// - Typed members follow the value conventions of this port: VtIntArray /
//   VtFloatArray are number[], VtArray<TfToken> / VtArray<SdfPath> are
//   string[], VtArray<GfVec4d> is GfVec4d[].
// - Thread-safety primitives (std::atomic, TfSpinMutex) are plain fields:
//   JavaScript runs data source queries on one thread.
// - VtValue::IsHolding<T> for types that have no TfType in this port is a
//   runtime check of the held object (instanceof / typeof), see _Held.
// - HdSceneIndexEmulationTokens (tokens.h:484-485, 569-570) is declared in
//   this file, next to its main user.
// - HdUtils::ConvertVtDictionaryToContainerDS (utils.cpp:354-369) is a
//   private helper here; this port's utils.ts does not export it yet.

import type { HdExtComputationContextArg } from './extComputationContextInternal.ts'
import { Token as TfToken, MakeTokens as TfMakeTokens } from 'typescript-usd/tf'
import {
  Value as VtValue, Array as VtArray, ValueTypes as VtValueTypes,
  Dictionary as VtDictionary,
} from 'typescript-usd/vt'
import {
  Matrix4d as GfMatrix4d, Range1f as GfRange1f, Vec2f as GfVec2f, Vec2i as GfVec2i,
  Vec3d as GfVec3d, Vec3i as GfVec3i, Vec4d as GfVec4d, Vec4f as GfVec4f,
  Quatf as GfQuatf, GfSlerp,
} from 'typescript-usd/gf'
import { PathExpression as SdfPathExpression } from 'typescript-usd/sdf'
import { ConformWindowPolicy as CameraUtilConformWindowPolicy } from 'typescript-usd/cameraUtil'

import {
  HdContainerDataSource, HdDataSourceBase, HdSampledDataSource,
  HdTypedSampledDataSource, HdVectorDataSource,
} from './dataSource.ts'
import {
  HdCreateTypedRetainedDataSource, HdRetainedContainerDataSource, HdRetainedSampledDataSource,
  HdRetainedSmallVectorDataSource, HdRetainedTypedSampledDataSource,
} from './retainedDataSource.ts'
import { HdDataSourceLocatorSet } from './dataSourceLocator.ts'
import type { HdSceneDelegate } from './sceneDelegate.ts'
import { HdMeshTopology } from './meshTopology.ts'
import { HdBasisCurvesTopology } from './basisCurvesTopology.ts'
import { HdCullStyle, HdDisplayStyle, HdReprSelector } from './displayStyle.ts'
import { HdInterpolation } from './enums.ts'
import { HdTimeSampleArray } from './timeSampleArray.ts'
import { HdCamera, HdCameraTokens } from './camera.ts'
import { HdMaterialNetworkMap, HdMaterialNode2, HdMaterialNode2Type } from './material.ts'
import {
  type HdRenderSettingsRenderProduct, type HdRenderSettingsRenderProducts,
  HdRenderSettingsIsHoldingRenderProducts,
} from './renderSettings.ts'
import { HdUtils } from './utils.ts'
import type { HdExtComputationContext } from './extComputationUtils.ts'
import type { HdTupleType } from './types.ts'
import {
  HdCollectionEmulationTokens, HdCullStyleTokens, HdPrimTypeIsGprim,
  HdPrimTypeIsLight, HdPrimTypeTokens, HdRenderSettingsPrimTokens, HdTokens,
} from './tokens.ts'
import { TF_CODING_ERROR, TF_VERIFY, TF_WARN } from './tfDiagnostic.ts'

import { HdBasisCurvesSchemaTokens } from './basisCurvesSchema.ts'
import { HdBasisCurvesTopologySchemaTokens } from './basisCurvesTopologySchema.ts'
import { HdCameraSchemaTokens } from './cameraSchema.ts'
import { HdCategoriesSchema, HdCategoriesSchemaTokens } from './categoriesSchema.ts'
import { HdCollectionSchema } from './collectionSchema.ts'
import { HdCollectionsSchemaTokens } from './collectionsSchema.ts'
import { HdCoordSysBindingSchema, HdCoordSysBindingSchemaTokens } from './coordSysBindingSchema.ts'
import { HdDependenciesSchemaTokens } from './dependenciesSchema.ts'
import { HdDisplayFilterSchema, HdDisplayFilterSchemaTokens } from './displayFilterSchema.ts'
import { HdExtComputationInputComputationSchema } from './extComputationInputComputationSchema.ts'
import { HdExtComputationOutputSchema } from './extComputationOutputSchema.ts'
import { HdExtComputationPrimvarSchema } from './extComputationPrimvarSchema.ts'
import { HdExtComputationPrimvarsSchemaTokens } from './extComputationPrimvarsSchema.ts'
import { HdExtComputationSchemaTokens } from './extComputationSchema.ts'
import { HdExtentSchema, HdExtentSchemaTokens } from './extentSchema.ts'
import { HdImageShaderSchemaTokens } from './imageShaderSchema.ts'
import { HdInstanceCategoriesSchema, HdInstanceCategoriesSchemaTokens } from './instanceCategoriesSchema.ts'
import { HdInstancedBySchema, HdInstancedBySchemaTokens } from './instancedBySchema.ts'
import { HdInstancerTopologySchema, HdInstancerTopologySchemaTokens } from './instancerTopologySchema.ts'
import { HdIntegratorSchema, HdIntegratorSchemaTokens } from './integratorSchema.ts'
import { HdLegacyDisplayStyleSchemaTokens } from './legacyDisplayStyleSchema.ts'
import { HdLensDistortionSchema } from './lensDistortionSchema.ts'
import { HdLightSchemaTokens } from './lightSchema.ts'
import { HdMaterialBindingSchema } from './materialBindingSchema.ts'
import { HdMaterialBindingsSchema, HdMaterialBindingsSchemaTokens } from './materialBindingsSchema.ts'
import { HdMaterialNodeParameterSchema } from './materialNodeParameterSchema.ts'
import { HdMaterialNodeSchema } from './materialNodeSchema.ts'
import { HdMaterialSchemaTokens } from './materialSchema.ts'
import { HdMeshSchemaTokens } from './meshSchema.ts'
import { HdMeshTopologySchemaTokens } from './meshTopologySchema.ts'
import { HdPrimvarSchema, HdPrimvarSchemaTokens } from './primvarSchema.ts'
import { HdPrimvarsSchema, HdPrimvarsSchemaTokens } from './primvarsSchema.ts'
import { HdPurposeSchema, HdPurposeSchemaTokens } from './purposeSchema.ts'
import { HdRenderBufferSchemaTokens } from './renderBufferSchema.ts'
import { HdRenderProductSchema } from './renderProductSchema.ts'
import { HdRenderSettingsSchemaTokens } from './renderSettingsSchema.ts'
import { HdRenderVarSchema } from './renderVarSchema.ts'
import { HdSampleFilterSchema, HdSampleFilterSchemaTokens } from './sampleFilterSchema.ts'
import { HdSplitDiopterSchema } from './splitDiopterSchema.ts'
import { HdSubdivisionTagsSchema } from './subdivisionTagsSchema.ts'
import { HdVisibilitySchema, HdVisibilitySchemaTokens } from './visibilitySchema.ts'
import { HdVolumeFieldBindingSchema, HdVolumeFieldBindingSchemaTokens } from './volumeFieldBindingSchema.ts'
import { HdVolumeFieldSchemaTokens } from './volumeFieldSchema.ts'
import { HdXformSchema, HdXformSchemaTokens } from './xformSchema.ts'

type Time = number

/** tokens.h:484-485, 569-570 */
export const HdSceneIndexEmulationTokens = TfMakeTokens({
  sceneDelegate: 'sceneDelegate',
})

/** dataSourceLegacyPrim.h:28-34 */
export const HdLegacyPrimTypeTokens = TfMakeTokens({
  // Bprims
  openvdbAsset: 'openvdbAsset',
  field3dAsset: 'field3dAsset',
})

/** dataSourceLegacyPrim.h:39-43 */
export const HdLegacyFlagTokens = TfMakeTokens({
  isLegacyInstancer: 'isLegacyInstancer',
})

// dataSourceLegacyPrim.cpp:82-89: currently private and duplicated where used
// so as to not yet formally define this convention.
const _tokens = TfMakeTokens({
  binding: 'binding',
  coordSys: 'coordSys',
  lightLinkingCollectionsDependency: 'lightLinkingCollectionsDependency',
})

// light.h:21-57 HdLightTokens (the members used here; light.h is not ported).
const HdLightTokens = TfMakeTokens({
  params: 'params',
  shadowCollection: 'shadowCollection',
  shadowParams: 'shadowParams',
})

/** dataSourceLegacyPrim.cpp:93-98 */
export function HdLegacyPrimTypeIsVolumeField(primType: TfToken | string): boolean {
  return (primType === HdLegacyPrimTypeTokens.openvdbAsset ||
    primType === HdLegacyPrimTypeTokens.field3dAsset)
}

// ---------------------------------------------------------------------------
// VtValue helpers

// The held object of a VtValue (undefined when empty). Scene delegates of
// this port hand back VtValues; a plain value is tolerated as already held.
function _Held(v: unknown): unknown {
  if (v instanceof VtValue) return v.IsEmpty() ? undefined : v.UncheckedGet<unknown>()
  return v ?? undefined
}

// VtValue::IsHolding<T>() for T with a TfType in VtValueTypes.
function _IsHoldingType(v: VtValue, typeName: keyof typeof VtValueTypes): boolean {
  return v instanceof VtValue && v.IsHolding(VtValueTypes[typeName])
}

// VtValue::GetWithDefault<T>(def).
function _GetWithDefault<T>(v: VtValue, typeName: keyof typeof VtValueTypes, def: T): T {
  return _IsHoldingType(v, typeName) ? v.UncheckedGet<T>() : def
}

/** utils.cpp:354-369 HdUtils::ConvertVtDictionaryToContainerDS */
function _ConvertVtDictionaryToContainerDS(dict: VtDictionary): HdContainerDataSource {
  const names: TfToken[] = []
  const values: HdDataSourceBase[] = []
  for (const [name, value] of dict) {
    names.push(TfToken(name))
    values.push(HdCreateTypedRetainedDataSource(value)!)
  }
  return HdRetainedContainerDataSource.new(names, values)
}

// ---------------------------------------------------------------------------
// Time sample helpers (timeSampleArray.{h,cpp}). The port's HdTimeSampleArray
// resamples numbers only; these follow the generic templates.

// timeSampleArray.h:22-50 HdResampleNeighbors for T / VtArray<T>; GfLerp is
// (1-alpha)*v0 + alpha*v1.
function _ResampleNeighborsTyped(alpha: number, v0: unknown, v1: unknown): unknown {
  if (typeof v0 === 'number' && typeof v1 === 'number') {
    return (1 - alpha) * v0 + alpha * v1
  }
  if (v0 instanceof VtArray && v1 instanceof VtArray) {
    // timeSampleArray.h:38-50: component-wise resampling.
    const a0 = v0.toArray() as unknown[]
    const a1 = v1.toArray() as unknown[]
    const r = a0.map((e, i) => _ResampleNeighborsTyped(alpha, e, a1[i]))
    return new VtArray<unknown>(r, v0.getElementType())
  }
  if (v0 instanceof GfQuatf) {
    // timeSampleArray.h:30-36: GfQuatf resamples by spherical linear
    // interpolation.
    return GfSlerp(alpha, v0, v1 as GfQuatf)
  }
  const g0 = v0 as { getScaled?: (s: number) => unknown, add?: (o: unknown) => unknown }
  if (typeof g0.getScaled === 'function' && typeof g0.add === 'function') {
    // Gf vectors and GfQuatd / GfQuath: GfLerp.
    const s1 = (v1 as { getScaled: (s: number) => unknown }).getScaled(alpha)
    return (g0.getScaled(1 - alpha) as { add: (o: unknown) => unknown }).add(s1)
  }
  const m0 = v0 as {
    getElement?: (i: number, j: number) => number, SetElement?: unknown,
    constructor: new (m: unknown) => unknown, numRows?: number,
  }
  if (typeof m0.getElement === 'function' && typeof m0.SetElement === 'function') {
    // Gf matrices: element-wise GfLerp.
    const out = new m0.constructor(v0) as {
      getElement(i: number, j: number): number, SetElement(i: number, j: number, v: number): void,
    }
    const m1 = v1 as { getElement(i: number, j: number): number }
    const n = _MatrixDimension(v0)
    for (let i = 0; i < n; ++i) {
      for (let j = 0; j < n; ++j) {
        out.SetElement(i, j, (1 - alpha) * m0.getElement(i, j) + alpha * m1.getElement(i, j))
      }
    }
    return out
  }
  // timeSampleArray.cpp:60-65: other types hold the earlier sample.
  return alpha < 1 ? v0 : v1
}

function _MatrixDimension(m: unknown): number {
  const name = (m as { constructor: { name: string } }).constructor.name
  if (name.includes('2')) return 2
  if (name.includes('3')) return 3
  return 4
}

// timeSampleArray.cpp:72-98 HdResampleNeighbors(float, VtValue, VtValue).
const _interpTypeNames = new Set([
  'float', 'double', 'half', 'GfMatrix2f', 'GfMatrix3f', 'GfMatrix4f',
  'GfMatrix2d', 'GfMatrix3d', 'GfMatrix4d', 'GfVec2d', 'GfVec2f', 'GfVec2h',
  'GfVec3d', 'GfVec3f', 'GfVec3h', 'GfVec4d', 'GfVec4f', 'GfVec4h', 'GfQuatd',
  'GfQuatf', 'GfQuath',
])

function _ResampleNeighborsValue(alpha: number, v0: VtValue, v1: VtValue): VtValue {
  // After verifying that the values have matching types, return the result
  // of HdResampleNeighbors() for the enclosed values.
  if (v0.IsEmpty()) {
    TF_CODING_ERROR(`Unknown sample value type '${v0.getTypeName()}'`)
    return v0
  }
  if (v0.getType() !== v1.getType()) {
    TF_CODING_ERROR(`Mismatched sample value types '${v0.getTypeName()}' and ` +
      `'${v1.getTypeName()}'`)
    return v0
  }
  // A VtValue containing T or a VtArray<T> is supported.
  const elementName = v0.isArrayValued() ? v0.getElementType().getTypeName()
    : v0.getTypeName()
  if (!_interpTypeNames.has(elementName)) {
    // If the VtValue's don't contain any of the types that can be
    // interpolated, just hold the preceding time sample's value.
    return (alpha < 1) ? v0 : v1
  }
  const r = _ResampleNeighborsTyped(alpha, v0.UncheckedGet<unknown>(), v1.UncheckedGet<unknown>())
  if (r instanceof VtArray) return VtValue.createArray(r)
  return VtValue.create(r, v0.getType())
}

function _ResampleNeighbors<T>(alpha: number, v0: T, v1: T): T {
  if (v0 instanceof VtValue) {
    return _ResampleNeighborsValue(alpha, v0, v1 as VtValue) as T
  }
  return _ResampleNeighborsTyped(alpha, v0, v1) as T
}

/** timeSampleArray.h:59-100 HdResampleRawTimeSamples */
function _Resample<T>(sa: HdTimeSampleArray<T>, u: number): T {
  const numSamples = sa.count
  const us = sa.times
  const vs = sa.values
  if (numSamples === 0) {
    TF_CODING_ERROR('HdResample: Zero samples provided')
    return undefined as T
  }
  let i = 0
  for (; i < numSamples; ++i) {
    if (us[i] === u) {
      // Fast path for exact parameter match.
      return vs[i]!
    }
    if (us[i]! > u) {
      break
    }
  }
  if (i === 0) {
    // u is before the first sample.
    return vs[0]!
  } else if (i === numSamples) {
    // u is after the last sample.
    return vs[numSamples - 1]!
  } else if (us[i] === us[i - 1]) {
    // Neighboring samples have identical parameter.
    // Arbitrarily choose a sample.
    TF_WARN(`HdResampleRawTimeSamples: overlapping samples at ${us[i]}; ` +
      'using first sample')
    return vs[i - 1]!
  } else {
    // Linear blend of neighboring samples.
    const alpha = (u - us[i - 1]!) / (us[i]! - us[i - 1]!)
    return _ResampleNeighbors(alpha, vs[i - 1]!, vs[i]!)
  }
}

/** timeSampleArray.h:244-290 HdIndexedTimeSampleArray (struct-of-arrays). */
class _IndexedTimeSampleArray<T> extends HdTimeSampleArray<T> {
  indices: number[][] = []

  override resize(newSize: number): void {
    super.resize(newSize)
    this.indices.length = newSize
  }

  /** timeSampleArray.h:102-150 HdResampleRawTimeSamples (indexed). */
  resampleIndexed(u: number): [T, number[]] {
    const numSamples = this.count
    const us = this.times
    const vs = this.values
    const is = this.indices
    if (numSamples === 0) {
      TF_CODING_ERROR('HdResample: Zero samples provided')
      return [undefined as T, []]
    }
    let i = 0
    for (; i < numSamples; ++i) {
      if (us[i] === u) {
        // Fast path for exact parameter match.
        return [vs[i]!, is[i]!]
      }
      if (us[i]! > u) {
        break
      }
    }
    if (i === 0) {
      // u is before the first sample.
      return [vs[0]!, is[0]!]
    } else if (i === numSamples) {
      // u is after the last sample.
      return [vs[numSamples - 1]!, is[numSamples - 1]!]
    } else if (us[i] === us[i - 1]) {
      // Neighboring samples have identical parameter.
      // Arbitrarily choose a sample.
      TF_WARN(`HdResampleRawTimeSamples: overlapping samples at ${us[i]}; ` +
        'using first sample')
      return [vs[i - 1]!, is[i - 1]!]
    } else {
      // Linear blend of neighboring samples for values
      // Hold earlier value for indices
      // (timeSampleArray.h:141, the alpha upstream computes here).
      const alpha = (us[i]! - u) / (us[i]! - us[i - 1]!)
      return [_ResampleNeighbors(alpha, vs[i - 1]!, vs[i]!), is[i - 1]!]
    }
  }
}

// HdTimeSampleArray::GetContributingSampleTimesForInterval with the C++
// out-vector (timeSampleArray.h:224-232).
function _ContributingSampleTimes<T>(sa: HdTimeSampleArray<T>, startTime: Time,
  endTime: Time, outSampleTimes: number[] | undefined): boolean {
  const r = sa.GetContributingSampleTimesForInterval(startTime, endTime)
  if (outSampleTimes) {
    outSampleTimes.length = 0
    outSampleTimes.push(...r.sampleTimes)
  }
  return r.changing
}

/** sceneDelegate.h SampleIndexedPrimvar(id, key, HdIndexedTimeSampleArray*)
 *  (the CAPACITY template; sceneDelegate.ts has no overload for it). */
function _SampleIndexedPrimvar(sceneDelegate: HdSceneDelegate, id: string,
  key: TfToken, sa: _IndexedTimeSampleArray<VtValue>, capacity: number): void {
  const run = (max: number): number => {
    const times: number[] = []
    const values: VtValue[] = []
    const indices: number[][] = []
    const n = sceneDelegate.sampleIndexedPrimvar(id, key, max, times, values, indices)
    for (let i = 0; i < Math.min(n, max); ++i) {
      sa.times[i] = times[i]!
      sa.values[i] = values[i]!
      sa.indices[i] = indices[i] ?? []
    }
    return n
  }
  sa.resize(capacity)
  const authoredSamples = run(capacity)
  if (authoredSamples > capacity) {
    sa.resize(authoredSamples)
    const authoredSamplesSecondAttempt = run(authoredSamples)
    // Number of samples should be consistent through multiple invocations
    // of the sampling function.
    TF_VERIFY(authoredSamples === authoredSamplesSecondAttempt)
  }
  sa.count = authoredSamples
}

// ---------------------------------------------------------------------------

/** extComputationCpuCallback.h HdExtComputationCpuCallback: the TS port has
 *  no base class yet, so the callback is this structural shape. */
export interface HdExtComputationCpuCallback {
  compute(ctx: HdExtComputationContextArg): void
}

/** dataSourceLegacyPrim.cpp:104-120 */
export class Hd_SceneDelegateExtComputationCpuCallback implements HdExtComputationCpuCallback {
  constructor(private readonly _id: string, private readonly _sceneDelegate: HdSceneDelegate) {}

  compute(ctx: HdExtComputationContextArg): void {
    this._sceneDelegate.invokeExtComputation(this._id, ctx)
  }
}

/** dataSourceLegacyPrim.cpp:122-187 */
export class Hd_DataSourceLegacyPrimvarValue extends HdSampledDataSource {
  private _timeSamples = new HdTimeSampleArray<VtValue>()

  constructor(
    private readonly _primvarName: TfToken,
    private readonly _primId: string,
    private readonly _sceneDelegate: HdSceneDelegate,
  ) {
    super()
    TF_VERIFY(this._sceneDelegate)
  }

  static new(primvarName: TfToken, primId: string,
    sceneDelegate: HdSceneDelegate): Hd_DataSourceLegacyPrimvarValue {
    return new Hd_DataSourceLegacyPrimvarValue(primvarName, primId, sceneDelegate)
  }

  GetValue(shutterOffset: Time): VtValue {
    if (shutterOffset === 0) {
      const result = this._sceneDelegate.Get(this._primId, this._primvarName)
      if (!result.IsEmpty()) {
        return result
      }

      // XXX: In UsdImaging, lights derived from the base prim adapter
      //      directly and therefore its Get doesn't have "primvars:"
      //      namespace awareness. It is supported by SamplePrimvar so
      //      we can handle we'll fall back to use that if the Get
      //      query fails
      const sampleTimes: number[] = []
      const sampleValues: VtValue[] = [result]
      this._sceneDelegate.samplePrimvar(
        this._primId, this._primvarName, 1, sampleTimes, sampleValues)

      return sampleValues[0] ?? result
    } else {
      this._getTimeSamples()
      return _Resample(this._timeSamples, shutterOffset)
    }
  }

  GetContributingSampleTimesForInterval(startTime: Time, endTime: Time,
    outSampleTimes: number[]): boolean {
    this._getTimeSamples()

    // XXX: Start and end times come from the sene delegate, so we can't
    // get samples outside of those provided. However, we can clamp
    // returned samples to be in the right range.
    return _ContributingSampleTimes(this._timeSamples, startTime, endTime, outSampleTimes)
  }

  private _getTimeSamples(): void {
    if (this._timeSamples.count === 0) {
      this._sceneDelegate.samplePrimvar(this._primId, this._primvarName, this._timeSamples, 1)
    }
  }
}

/** dataSourceLegacyPrim.cpp:191-251 */
export class Hd_DataSourceLegacyIndexedPrimvarValue extends HdSampledDataSource {
  private _timeSamples = new _IndexedTimeSampleArray<VtValue>()

  constructor(
    private readonly _primvarName: TfToken,
    private readonly _primId: string,
    private readonly _sceneDelegate: HdSceneDelegate,
  ) {
    super()
    TF_VERIFY(this._sceneDelegate)
  }

  static new(primvarName: TfToken, primId: string,
    sceneDelegate: HdSceneDelegate): Hd_DataSourceLegacyIndexedPrimvarValue {
    return new Hd_DataSourceLegacyIndexedPrimvarValue(primvarName, primId, sceneDelegate)
  }

  GetValue(shutterOffset: Time): VtValue {
    if (shutterOffset === 0) {
      const indices = { value: [] as number[] }
      return this._sceneDelegate.getIndexedPrimvar(this._primId, this._primvarName,
        indices)
    } else {
      this._getTimeSamples()
      const pv = this._timeSamples.resampleIndexed(shutterOffset)
      return pv[0]
    }
  }

  GetContributingSampleTimesForInterval(startTime: Time, endTime: Time,
    outSampleTimes: number[]): boolean {
    this._getTimeSamples()

    // XXX: Start and end times come from the sene delegate, so we can't
    // get samples outside of those provided. However, we can clamp
    // returned samples to be in the right range.
    _ContributingSampleTimes(this._timeSamples, startTime, endTime, outSampleTimes)

    return true
  }

  private _getTimeSamples(): void {
    if (this._timeSamples.count === 0) {
      _SampleIndexedPrimvar(this._sceneDelegate, this._primId, this._primvarName,
        this._timeSamples, 1)
    }
  }
}

/** dataSourceLegacyPrim.cpp:255-320 */
export class Hd_DataSourceLegacyPrimvarIndices extends HdTypedSampledDataSource<number[]> {
  private _timeSamples = new _IndexedTimeSampleArray<VtValue>()

  constructor(
    private readonly _primvarName: TfToken,
    private readonly _primId: string,
    private readonly _sceneDelegate: HdSceneDelegate,
  ) {
    super()
    TF_VERIFY(this._sceneDelegate)
  }

  static new(primvarName: TfToken, primId: string,
    sceneDelegate: HdSceneDelegate): Hd_DataSourceLegacyPrimvarIndices {
    return new Hd_DataSourceLegacyPrimvarIndices(primvarName, primId, sceneDelegate)
  }

  getTypedValue(shutterOffset: Time): number[] {
    if (shutterOffset === 0) {
      const indices = { value: [] as number[] }
      this._sceneDelegate.getIndexedPrimvar(this._primId, this._primvarName, indices)
      return indices.value
    } else {
      this._getTimeSamples()
      const pv = this._timeSamples.resampleIndexed(shutterOffset)
      return pv[1]
    }
  }

  GetContributingSampleTimesForInterval(startTime: Time, endTime: Time,
    outSampleTimes: number[]): boolean {
    this._getTimeSamples()

    // XXX: Start and end times come from the sene delegate, so we can't
    // get samples outside of those provided. However, we can clamp
    // returned samples to be in the right range.
    _ContributingSampleTimes(this._timeSamples, startTime, endTime, outSampleTimes)
    return true
  }

  private _getTimeSamples(): void {
    if (this._timeSamples.count === 0) {
      _SampleIndexedPrimvar(this._sceneDelegate, this._primId, this._primvarName,
        this._timeSamples, 1)
    }
  }
}

interface _PrimvarEntry {
  interpolation: TfToken
  role: TfToken
  indexed: boolean
  elementSize: number
}

let _elementSizeOneDs: HdTypedSampledDataSource<number> | undefined

/** dataSourceLegacyPrim.cpp:324-418 */
export class Hd_DataSourceLegacyPrimvarsContainer extends HdContainerDataSource {
  private _entries = new Map<string, _PrimvarEntry>()

  constructor(private readonly _primId: string,
    private readonly _sceneDelegate: HdSceneDelegate) {
    super()
    TF_VERIFY(this._sceneDelegate)
  }

  static new(primId: string, sceneDelegate: HdSceneDelegate): Hd_DataSourceLegacyPrimvarsContainer {
    return new Hd_DataSourceLegacyPrimvarsContainer(primId, sceneDelegate)
  }

  addDesc(name: TfToken, interpolation: TfToken, role: TfToken, indexed: boolean,
    elementSize: number): void {
    this._entries.set(name, { interpolation, role, indexed, elementSize })
  }

  getNames(): TfToken[] {
    return [...this._entries.keys()].map(n => TfToken(n))
  }

  Get(name: TfToken | string): HdDataSourceBase | undefined {
    const it = this._entries.get(name)
    if (!it) {
      return undefined
    }
    const token = TfToken(name)

    // Convert elementSize to data source.
    // Use a static DS for the default case of 1.
    const elemSize = it.elementSize
    _elementSizeOneDs ??= HdRetainedTypedSampledDataSource.new(1)
    const elementSizeDs = (elemSize === 1)
      ? _elementSizeOneDs
      : HdRetainedTypedSampledDataSource.new(elemSize)

    if (it.indexed) {
      return new HdPrimvarSchema.Builder()
        .setIndexedPrimvarValue(
          Hd_DataSourceLegacyIndexedPrimvarValue.new(
            token, this._primId, this._sceneDelegate))
        .setIndices(
          Hd_DataSourceLegacyPrimvarIndices.new(
            token, this._primId, this._sceneDelegate))
        .setInterpolation(
          HdPrimvarSchema.buildInterpolationDataSource(it.interpolation))
        .setRole(
          HdPrimvarSchema.buildRoleDataSource(it.role))
        .setElementSize(elementSizeDs)
        .build()
    } else {
      return new HdPrimvarSchema.Builder()
        .setPrimvarValue(
          Hd_DataSourceLegacyPrimvarValue.new(
            token, this._primId, this._sceneDelegate))
        .setInterpolation(
          HdPrimvarSchema.buildInterpolationDataSource(it.interpolation))
        .setRole(
          HdPrimvarSchema.buildRoleDataSource(it.role))
        .setElementSize(elementSizeDs)
        .build()
    }
  }
}

/** dataSourceLegacyPrim.cpp:424-491 */
export class Hd_DataSourceLegacyMatrixValue extends HdTypedSampledDataSource<GfMatrix4d> {
  private _timeSamples = new HdTimeSampleArray<GfMatrix4d>()

  constructor(
    private readonly _type: TfToken | string,
    private readonly _primId: string,
    private readonly _sceneDelegate: HdSceneDelegate,
  ) {
    super()
    TF_VERIFY(this._sceneDelegate)
  }

  static new(type: TfToken | string, primId: string,
    sceneDelegate: HdSceneDelegate): Hd_DataSourceLegacyMatrixValue {
    return new Hd_DataSourceLegacyMatrixValue(type, primId, sceneDelegate)
  }

  getTypedValue(shutterOffset: Time): GfMatrix4d {
    if (shutterOffset === 0) {
      if (this._type === HdPrimTypeTokens.instancer) {
        return this._sceneDelegate.getInstancerTransform(this._primId)
      } else {
        return this._sceneDelegate.getTransform(this._primId)
      }
    } else {
      this._getTimeSamples()
      return _Resample(this._timeSamples, shutterOffset)
    }
  }

  GetContributingSampleTimesForInterval(startTime: Time, endTime: Time,
    outSampleTimes: number[]): boolean {
    this._getTimeSamples()

    // XXX: Start and end times come from the scene delegate, so we can't
    // get samples outside of those provided. However, we can clamp
    // returned samples to be in the right range.
    _ContributingSampleTimes(this._timeSamples, startTime, endTime, outSampleTimes)
    return true
  }

  private _getTimeSamples(): void {
    if (this._timeSamples.count === 0) {
      if (this._type === HdPrimTypeTokens.instancer) {
        this._sceneDelegate.sampleInstancerTransform(this._primId, this._timeSamples, 1)
      } else {
        this._sceneDelegate.sampleTransform(this._primId, this._timeSamples, 1)
      }
    }
  }
}

// ---------------------------------------------------------------------------

// dataSourceLegacyPrim.cpp:526-555 MemberDataSource<T>: a typed data source
// with no time samples reading one member of a cached topology.
class _TopologyMemberDataSource<T> extends HdTypedSampledDataSource<T> {
  constructor(private readonly _read: () => T) { super() }
  getTypedValue(_shutterOffset: Time): T { return this._read() }
  GetContributingSampleTimesForInterval(_startTime: Time, _endTime: Time,
    _outSampleTimes: number[]): boolean {
    return false
  }
}

/** dataSourceLegacyPrim.cpp:498-588 */
export class Hd_MeshTopologyStore {
  private _meshTopology: HdMeshTopology | undefined

  constructor(private readonly _id: string, private readonly _sceneDelegate: HdSceneDelegate) {}

  Get(): HdMeshTopology {
    let mt = this._meshTopology
    if (mt) {
      return mt
    }
    mt = this._sceneDelegate.getMeshTopology(this._id)
    this._meshTopology = mt
    return mt
  }

  invalidate(): void {
    this._meshTopology = undefined
  }

  // DEFINE_MESH_TOPOLOGY_ACCESSOR_DATASOURCE (dataSourceLegacyPrim.cpp:558-582)
  static faceVertexCountsDataSource(mts: Hd_MeshTopologyStore): HdTypedSampledDataSource<number[]> {
    return new _TopologyMemberDataSource(() => mts.Get().getFaceVertexCounts())
  }
  static faceVertexIndicesDataSource(mts: Hd_MeshTopologyStore): HdTypedSampledDataSource<number[]> {
    return new _TopologyMemberDataSource(() => mts.Get().getFaceVertexIndices())
  }
  static holeIndicesDataSource(mts: Hd_MeshTopologyStore): HdTypedSampledDataSource<number[]> {
    return new _TopologyMemberDataSource(() => mts.Get().getHoleIndices())
  }
  static orientationDataSource(mts: Hd_MeshTopologyStore): HdTypedSampledDataSource<TfToken> {
    return new _TopologyMemberDataSource(() => mts.Get().getOrientation())
  }
  static subdivisionSchemeDataSource(mts: Hd_MeshTopologyStore): HdTypedSampledDataSource<TfToken> {
    return new _TopologyMemberDataSource(() => mts.Get().getScheme())
  }
}

/** dataSourceLegacyPrim.cpp:591-630 */
export class Hd_DataSourceMeshTopology extends HdContainerDataSource {
  constructor(private readonly _mts: Hd_MeshTopologyStore) { super() }

  static new(mts: Hd_MeshTopologyStore): Hd_DataSourceMeshTopology {
    return new Hd_DataSourceMeshTopology(mts)
  }

  getNames(): TfToken[] {
    return [
      HdMeshTopologySchemaTokens.faceVertexCounts,
      HdMeshTopologySchemaTokens.faceVertexIndices,
      HdMeshTopologySchemaTokens.holeIndices,
      HdMeshTopologySchemaTokens.orientation,
    ]
  }

  Get(name: TfToken | string): HdDataSourceBase | undefined {
    if (name === HdMeshTopologySchemaTokens.faceVertexCounts) {
      return Hd_MeshTopologyStore.faceVertexCountsDataSource(this._mts)
    }
    if (name === HdMeshTopologySchemaTokens.faceVertexIndices) {
      return Hd_MeshTopologyStore.faceVertexIndicesDataSource(this._mts)
    }
    if (name === HdMeshTopologySchemaTokens.holeIndices) {
      return Hd_MeshTopologyStore.holeIndicesDataSource(this._mts)
    }
    if (name === HdMeshTopologySchemaTokens.orientation) {
      return Hd_MeshTopologyStore.orientationDataSource(this._mts)
    }

    return undefined
  }
}

/** dataSourceLegacyPrim.cpp:633-722 */
export class Hd_DataSourceMesh extends HdContainerDataSource {
  private _meshTopologyStore: Hd_MeshTopologyStore | undefined

  constructor(private readonly _id: string, private readonly _sceneDelegate: HdSceneDelegate) {
    super()
  }

  static new(id: string, sceneDelegate: HdSceneDelegate): Hd_DataSourceMesh {
    return new Hd_DataSourceMesh(id, sceneDelegate)
  }

  getNames(): TfToken[] {
    return [
      HdMeshSchemaTokens.topology,
      HdMeshSchemaTokens.subdivisionTags,
      HdMeshSchemaTokens.subdivisionScheme,
      HdMeshSchemaTokens.doubleSided,
    ]
  }

  Get(name: TfToken | string): HdDataSourceBase | undefined {
    if (name === HdMeshSchemaTokens.topology) {
      return Hd_DataSourceMeshTopology.new(this._getMeshTopologyStore())
    }

    if (name === HdMeshSchemaTokens.subdivisionTags) {
      const t = this._sceneDelegate.getSubdivTags(this._id)
      return new HdSubdivisionTagsSchema.Builder()
        .setFaceVaryingLinearInterpolation(
          HdRetainedTypedSampledDataSource.new(t.getFaceVaryingInterpolationRule()))
        .setInterpolateBoundary(
          HdRetainedTypedSampledDataSource.new(t.getVertexInterpolationRule()))
        .setTriangleSubdivisionRule(
          HdRetainedTypedSampledDataSource.new(t.getTriangleSubdivision()))
        .setCornerIndices(
          HdRetainedTypedSampledDataSource.new(t.getCornerIndices()))
        .setCornerSharpnesses(
          HdRetainedTypedSampledDataSource.new(t.getCornerWeights()))
        .setCreaseIndices(
          HdRetainedTypedSampledDataSource.new(t.getCreaseIndices()))
        .setCreaseLengths(
          HdRetainedTypedSampledDataSource.new(t.getCreaseLengths()))
        .setCreaseSharpnesses(
          HdRetainedTypedSampledDataSource.new(t.getCreaseWeights()))
        .build()
    }

    if (name === HdMeshSchemaTokens.subdivisionScheme) {
      return Hd_MeshTopologyStore.subdivisionSchemeDataSource(this._getMeshTopologyStore())
    }

    if (name === HdMeshSchemaTokens.doubleSided) {
      return HdRetainedTypedSampledDataSource.new(this._sceneDelegate.getDoubleSided(this._id))
    }

    return undefined
  }

  private _getMeshTopologyStore(): Hd_MeshTopologyStore {
    let mts = this._meshTopologyStore
    if (mts) {
      return mts
    }
    mts = new Hd_MeshTopologyStore(this._id, this._sceneDelegate)
    this._meshTopologyStore = mts
    return mts
  }
}

// ---------------------------------------------------------------------------

/** dataSourceLegacyPrim.cpp:730-821 */
export class Hd_BasisCurvesTopologyStore {
  private _basisCurvesTopology: HdBasisCurvesTopology | undefined

  constructor(private readonly _id: string, private readonly _sceneDelegate: HdSceneDelegate) {}

  Get(): HdBasisCurvesTopology {
    let bct = this._basisCurvesTopology
    if (bct) {
      return bct
    }
    bct = this._sceneDelegate.getBasisCurvesTopology(this._id)
    this._basisCurvesTopology = bct
    return bct
  }

  invalidate(): void {
    this._basisCurvesTopology = undefined
  }

  // DEFINE_BASISCURVES_TOPOLOGY_ACCESSOR_DATASOURCE
  // (dataSourceLegacyPrim.cpp:791-815)
  static curveTypeDataSource(bcts: Hd_BasisCurvesTopologyStore): HdTypedSampledDataSource<TfToken> {
    return new _TopologyMemberDataSource(() => TfToken(bcts.Get().getCurveType()))
  }
  static curveWrapDataSource(bcts: Hd_BasisCurvesTopologyStore): HdTypedSampledDataSource<TfToken> {
    return new _TopologyMemberDataSource(() => TfToken(bcts.Get().getCurveWrap()))
  }
  static curveBasisDataSource(bcts: Hd_BasisCurvesTopologyStore): HdTypedSampledDataSource<TfToken> {
    return new _TopologyMemberDataSource(() => TfToken(bcts.Get().getCurveBasis()))
  }
  static curveVertexCountsDataSource(bcts: Hd_BasisCurvesTopologyStore): HdTypedSampledDataSource<number[]> {
    return new _TopologyMemberDataSource(() => bcts.Get().getCurveVertexCounts())
  }
  static curveIndicesDataSource(bcts: Hd_BasisCurvesTopologyStore): HdTypedSampledDataSource<number[]> {
    return new _TopologyMemberDataSource(() => bcts.Get().getCurveIndices())
  }
}

/** dataSourceLegacyPrim.cpp:825-872 */
export class Hd_DataSourceBasisCurvesTopology extends HdContainerDataSource {
  constructor(private readonly _bcts: Hd_BasisCurvesTopologyStore) { super() }

  static new(bcts: Hd_BasisCurvesTopologyStore): Hd_DataSourceBasisCurvesTopology {
    return new Hd_DataSourceBasisCurvesTopology(bcts)
  }

  getNames(): TfToken[] {
    return [
      HdBasisCurvesTopologySchemaTokens.curveVertexCounts,
      HdBasisCurvesTopologySchemaTokens.curveIndices,
      HdBasisCurvesTopologySchemaTokens.basis,
      HdBasisCurvesTopologySchemaTokens.type,
      HdBasisCurvesTopologySchemaTokens.wrap,
    ]
  }

  Get(name: TfToken | string): HdDataSourceBase | undefined {
    if (name === HdBasisCurvesTopologySchemaTokens.curveVertexCounts) {
      return Hd_BasisCurvesTopologyStore.curveVertexCountsDataSource(this._bcts)
    }
    if (name === HdBasisCurvesTopologySchemaTokens.curveIndices) {
      return Hd_BasisCurvesTopologyStore.curveIndicesDataSource(this._bcts)
    }
    if (name === HdBasisCurvesTopologySchemaTokens.basis) {
      return Hd_BasisCurvesTopologyStore.curveBasisDataSource(this._bcts)
    }
    if (name === HdBasisCurvesTopologySchemaTokens.type) {
      return Hd_BasisCurvesTopologyStore.curveTypeDataSource(this._bcts)
    }
    if (name === HdBasisCurvesTopologySchemaTokens.wrap) {
      return Hd_BasisCurvesTopologyStore.curveWrapDataSource(this._bcts)
    }
    return undefined
  }
}

/** dataSourceLegacyPrim.cpp:874-921 */
export class Hd_DataSourceBasisCurves extends HdContainerDataSource {
  private _basisCurvesTopologyStore: Hd_BasisCurvesTopologyStore | undefined

  constructor(private readonly _id: string, private readonly _sceneDelegate: HdSceneDelegate) {
    super()
  }

  static new(id: string, sceneDelegate: HdSceneDelegate): Hd_DataSourceBasisCurves {
    return new Hd_DataSourceBasisCurves(id, sceneDelegate)
  }

  getNames(): TfToken[] {
    return [
      HdBasisCurvesSchemaTokens.topology,
    ]
  }

  Get(name: TfToken | string): HdDataSourceBase | undefined {
    if (name === HdBasisCurvesSchemaTokens.topology) {
      return Hd_DataSourceBasisCurvesTopology.new(this._getBasisCurvesTopologyStore())
    }

    return undefined
  }

  private _getBasisCurvesTopologyStore(): Hd_BasisCurvesTopologyStore {
    let bcts = this._basisCurvesTopologyStore
    if (bcts) {
      return bcts
    }
    bcts = new Hd_BasisCurvesTopologyStore(this._id, this._sceneDelegate)
    this._basisCurvesTopologyStore = bcts
    return bcts
  }
}

// ---------------------------------------------------------------------------

// The T of Hd_TypedDataSourceLegacyCameraParamValue<T>: VtValue::IsHolding<T>
// and T().
interface _CameraParamType<T> {
  isHolding(v: VtValue): boolean
  makeDefault(): T
}

const _CameraParamFloat: _CameraParamType<number> = {
  isHolding: v => _IsHoldingType(v, 'float'), makeDefault: () => 0,
}
const _CameraParamDouble: _CameraParamType<number> = {
  isHolding: v => _IsHoldingType(v, 'double'), makeDefault: () => 0,
}
const _CameraParamInt: _CameraParamType<number> = {
  isHolding: v => _IsHoldingType(v, 'int'), makeDefault: () => 0,
}
const _CameraParamBool: _CameraParamType<boolean> = {
  isHolding: v => _IsHoldingType(v, 'bool'), makeDefault: () => false,
}
const _CameraParamToken: _CameraParamType<TfToken> = {
  isHolding: v => _IsHoldingType(v, 'token'), makeDefault: () => TfToken(''),
}
const _CameraParamVec2f: _CameraParamType<GfVec2f> = {
  isHolding: v => _IsHoldingType(v, 'GfVec2f'), makeDefault: () => new GfVec2f(0, 0),
}

/** dataSourceLegacyPrim.cpp:925-982 */
export class Hd_TypedDataSourceLegacyCameraParamValue<T> extends HdTypedSampledDataSource<T> {
  constructor(
    private readonly _id: string,
    private readonly _key: TfToken,
    private readonly _sceneDelegate: HdSceneDelegate,
    private readonly _t: _CameraParamType<T>,
  ) {
    super()
    TF_VERIFY(this._sceneDelegate)
  }

  static new<T>(id: string, key: TfToken | string, sceneDelegate: HdSceneDelegate,
    t: _CameraParamType<T>): Hd_TypedDataSourceLegacyCameraParamValue<T> {
    return new Hd_TypedDataSourceLegacyCameraParamValue(id, TfToken(key), sceneDelegate, t)
  }

  GetContributingSampleTimesForInterval(startTime: Time, endTime: Time,
    outSampleTimes: number[]): boolean {
    return Hd_DataSourceLegacyPrimvarValue.new(
      this._key, this._id, this._sceneDelegate).GetContributingSampleTimesForInterval(
      startTime, endTime, outSampleTimes)
  }

  getTypedValue(shutterOffset: Time): T {
    let v: VtValue
    if (shutterOffset === 0.0) {
      v = this._sceneDelegate.getCameraParamValue(this._id, this._key)
    } else {
      v = Hd_DataSourceLegacyPrimvarValue.new(
        this._key, this._id, this._sceneDelegate).GetValue(shutterOffset)
    }

    if (this._t.isHolding(v)) {
      return v.UncheckedGet<T>()
    }

    return this._t.makeDefault()
  }

  // Upstream returns the scene delegate's VtValue for shutterOffset 0 and
  // VtValue(GetTypedValue) otherwise; the latter is the typed value here
  // (see the header comment).
  override GetValue(shutterOffset: Time): unknown {
    if (shutterOffset === 0.0) {
      return this._sceneDelegate.getCameraParamValue(this._id, this._key)
    }

    return this.getTypedValue(shutterOffset)
  }
}

/** dataSourceLegacyPrim.cpp:985-1025 */
export class Hd_DataSourceLegacyCameraParamValue extends HdSampledDataSource {
  constructor(
    private readonly _id: string,
    private readonly _key: TfToken,
    private readonly _sceneDelegate: HdSceneDelegate,
  ) {
    super()
    TF_VERIFY(this._sceneDelegate)
  }

  static new(id: string, key: TfToken | string,
    sceneDelegate: HdSceneDelegate): Hd_DataSourceLegacyCameraParamValue {
    return new Hd_DataSourceLegacyCameraParamValue(id, TfToken(key), sceneDelegate)
  }

  GetContributingSampleTimesForInterval(startTime: Time, endTime: Time,
    outSampleTimes: number[]): boolean {
    return Hd_DataSourceLegacyPrimvarValue.new(
      this._key, this._id, this._sceneDelegate).GetContributingSampleTimesForInterval(
      startTime, endTime, outSampleTimes)
  }

  GetValue(shutterOffset: Time): VtValue {
    if (shutterOffset === 0.0) {
      return this._sceneDelegate.getCameraParamValue(this._id, this._key)
    }

    return Hd_DataSourceLegacyPrimvarValue.new(
      this._key, this._id, this._sceneDelegate).GetValue(shutterOffset)
  }
}

/** dataSourceLegacyPrim.cpp:1028-1211 */
export class Hd_DataSourceCamera extends HdContainerDataSource {
  constructor(private readonly _id: string, private readonly _sceneDelegate: HdSceneDelegate) {
    super()
    TF_VERIFY(this._sceneDelegate)
  }

  static new(id: string, sceneDelegate: HdSceneDelegate): Hd_DataSourceCamera {
    return new Hd_DataSourceCamera(id, sceneDelegate)
  }

  getNames(): TfToken[] {
    // HdSceneDelegate has no API for advertising what keys it will provide
    // an answer for in response to HdSceneDelegate::GetCameraParamValue.
    // Because HdContainerDataSource does (with this method), we take our
    // best guess by answering with the common ones defined by
    // HdCameraSchema.

    return [
      HdCameraSchemaTokens.projection,
      HdCameraSchemaTokens.horizontalAperture,
      HdCameraSchemaTokens.verticalAperture,
      HdCameraSchemaTokens.horizontalApertureOffset,
      HdCameraSchemaTokens.verticalApertureOffset,
      HdCameraSchemaTokens.focalLength,
      HdCameraSchemaTokens.clippingRange,
      HdCameraSchemaTokens.clippingPlanes,
      HdCameraSchemaTokens.fStop,
      HdCameraSchemaTokens.focusDistance,
      HdCameraSchemaTokens.shutterOpen,
      HdCameraSchemaTokens.shutterClose,
      HdCameraSchemaTokens.exposure,
      HdCameraSchemaTokens.exposureTime,
      HdCameraSchemaTokens.exposureIso,
      HdCameraSchemaTokens.exposureFStop,
      HdCameraSchemaTokens.exposureResponsivity,
      HdCameraSchemaTokens.linearExposureScale,
      HdCameraSchemaTokens.focusOn,
      HdCameraSchemaTokens.dofAspect,
      HdCameraSchemaTokens.splitDiopter,
      HdCameraSchemaTokens.lensDistortion,
    ]
  }

  Get(name: TfToken | string): HdDataSourceBase | undefined {
    // Smooth out some incompatibilities between scene delegate and
    // datasource schemas...
    if (name === HdCameraSchemaTokens.projection) {
      const v = this._sceneDelegate.getCameraParamValue(this._id, name)

      // VtValue::IsHolding<HdCamera::Projection>: the enum is a number here.
      let proj = HdCamera.Perspective
      const held = _Held(v)
      if (typeof held === 'number') {
        proj = held
      }
      return HdRetainedTypedSampledDataSource.new(
        proj === HdCamera.Perspective
          ? HdCameraSchemaTokens.perspective
          : HdCameraSchemaTokens.orthographic)
    } else if (name === HdCameraSchemaTokens.clippingRange) {
      const v = this._sceneDelegate.getCameraParamValue(this._id, name)

      let range = new GfRange1f()
      const held = _Held(v)
      if (held instanceof GfRange1f) {
        range = held
      }
      return HdRetainedTypedSampledDataSource.new(
        new GfVec2f(range.getMin(), range.getMax()))
    } else if (name === HdCameraTokens.windowPolicy) {
      const v = this._sceneDelegate.getCameraParamValue(this._id, name)

      // XXX: this should probably be in the schema, and a token...
      // (VtValue::IsHolding<CameraUtilConformWindowPolicy>: a number enum.)
      let wp = CameraUtilConformWindowPolicy.CameraUtilDontConform
      const held = _Held(v)
      if (typeof held === 'number') {
        wp = held as CameraUtilConformWindowPolicy
      }
      return HdRetainedTypedSampledDataSource.new(wp)
    } else if (name === HdCameraSchemaTokens.clippingPlanes) {
      const v = this._sceneDelegate.getCameraParamValue(this._id, HdCameraTokens.clipPlanes)
      // std::vector<GfVec4d> is a plain array of GfVec4d here.
      const array: GfVec4d[] = []
      const held = _Held(v)
      if (Array.isArray(held)) {
        for (const p of held) {
          if (p instanceof GfVec4d) array.push(p)
        }
      }
      return HdRetainedTypedSampledDataSource.new(array)
    } else if (name === HdCameraSchemaTokens.shutterOpen ||
      name === HdCameraSchemaTokens.shutterClose) {
      return Hd_TypedDataSourceLegacyCameraParamValue.new(
        this._id, name, this._sceneDelegate, _CameraParamDouble)
    } else if (name === HdCameraSchemaTokens.focusOn) {
      return Hd_TypedDataSourceLegacyCameraParamValue.new(
        this._id, name, this._sceneDelegate, _CameraParamBool)
    } else if (name === HdCameraSchemaTokens.splitDiopter) {
      return this._buildSplitDiopter()
    } else if (name === HdCameraSchemaTokens.lensDistortion) {
      return this._buildLensDistortion()
    } else if (HdCameraSchemaTokens.allTokens.includes(TfToken(name))) {
      // all remaining HdCameraSchema members are floats and should
      // be returned as a typed data source for schema conformance.
      return Hd_TypedDataSourceLegacyCameraParamValue.new(
        this._id, name, this._sceneDelegate, _CameraParamFloat)
    } else {
      return Hd_DataSourceLegacyCameraParamValue.new(
        this._id, name, this._sceneDelegate)
    }
  }

  private _buildSplitDiopter(): HdDataSourceBase {
    const sd = this._sceneDelegate
    return new HdSplitDiopterSchema.Builder()
      .setCount(Hd_TypedDataSourceLegacyCameraParamValue.new(
        this._id, HdCameraTokens.splitDiopterCount, sd, _CameraParamInt))
      .setAngle(Hd_TypedDataSourceLegacyCameraParamValue.new(
        this._id, HdCameraTokens.splitDiopterAngle, sd, _CameraParamFloat))
      .setOffset1(Hd_TypedDataSourceLegacyCameraParamValue.new(
        this._id, HdCameraTokens.splitDiopterOffset1, sd, _CameraParamFloat))
      .setWidth1(Hd_TypedDataSourceLegacyCameraParamValue.new(
        this._id, HdCameraTokens.splitDiopterWidth1, sd, _CameraParamFloat))
      .setFocusDistance1(Hd_TypedDataSourceLegacyCameraParamValue.new(
        this._id, HdCameraTokens.splitDiopterFocusDistance1, sd, _CameraParamFloat))
      .setOffset2(Hd_TypedDataSourceLegacyCameraParamValue.new(
        this._id, HdCameraTokens.splitDiopterOffset2, sd, _CameraParamFloat))
      .setWidth2(Hd_TypedDataSourceLegacyCameraParamValue.new(
        this._id, HdCameraTokens.splitDiopterWidth2, sd, _CameraParamFloat))
      .setFocusDistance2(Hd_TypedDataSourceLegacyCameraParamValue.new(
        this._id, HdCameraTokens.splitDiopterFocusDistance2, sd, _CameraParamFloat))
      .build()
  }

  private _buildLensDistortion(): HdDataSourceBase {
    const sd = this._sceneDelegate
    return new HdLensDistortionSchema.Builder()
      .setType(Hd_TypedDataSourceLegacyCameraParamValue.new(
        this._id, HdCameraTokens.lensDistortionType, sd, _CameraParamToken))
      .setK1(Hd_TypedDataSourceLegacyCameraParamValue.new(
        this._id, HdCameraTokens.lensDistortionK1, sd, _CameraParamFloat))
      .setK2(Hd_TypedDataSourceLegacyCameraParamValue.new(
        this._id, HdCameraTokens.lensDistortionK2, sd, _CameraParamFloat))
      .setCenter(Hd_TypedDataSourceLegacyCameraParamValue.new(
        this._id, HdCameraTokens.lensDistortionCenter, sd, _CameraParamVec2f))
      .setAnaSq(Hd_TypedDataSourceLegacyCameraParamValue.new(
        this._id, HdCameraTokens.lensDistortionAnaSq, sd, _CameraParamFloat))
      .setAsym(Hd_TypedDataSourceLegacyCameraParamValue.new(
        this._id, HdCameraTokens.lensDistortionAsym, sd, _CameraParamVec2f))
      .setScale(Hd_TypedDataSourceLegacyCameraParamValue.new(
        this._id, HdCameraTokens.lensDistortionScale, sd, _CameraParamFloat))
      .setIor(Hd_TypedDataSourceLegacyCameraParamValue.new(
        this._id, HdCameraTokens.lensDistortionIor, sd, _CameraParamFloat))
      .build()
  }
}

// ---------------------------------------------------------------------------

/** dataSourceLegacyPrim.cpp:1215-1285 */
export class Hd_DataSourceLight extends HdContainerDataSource {
  constructor(private readonly _id: string, private readonly _sceneDelegate: HdSceneDelegate) {
    super()
  }

  static new(id: string, sceneDelegate: HdSceneDelegate): Hd_DataSourceLight {
    return new Hd_DataSourceLight(id, sceneDelegate)
  }

  getNames(): TfToken[] {
    // XXX: return the schema tokens when we have them.
    //      for now, return the values which are non-material-based.
    return [
      HdTokens.filters,
      HdTokens.lightLink,
      HdTokens.shadowLink,
      HdTokens.lightFilterLink,
      HdTokens.isLight,
      HdTokens.materialSyncMode,
      HdTokens.portals,
    ]
  }

  Get(name: TfToken | string): HdDataSourceBase | undefined {
    let v: VtValue
    if (this._useGet(name)) {
      v = this._sceneDelegate.Get(this._id, name)
    } else {
      v = this._sceneDelegate.getLightParamValue(this._id, name)
    }

    // XXX: The simpleLight params all have problematic types. 'params' is
    // GlfSimpleLight, and 'shadowParams' is HdxShadowParams, neither of
    // which we can link to from here.  'shadowCollection' is an
    // HdRprimCollection, which we could technically add as a case to
    // HdCreateTypedRetaiendDataSource; but for now we're just passing all
    // of the simpleLight params through as retained VtValues.
    if (name === HdLightTokens.params) {
      return HdRetainedSampledDataSource.new(v)
    } else if (name === HdLightTokens.shadowParams) {
      return HdRetainedSampledDataSource.new(v)
    } else if (name === HdLightTokens.shadowCollection) {
      return HdRetainedSampledDataSource.new(v)
    } else {
      return HdCreateTypedRetainedDataSource(v)
    }
  }

  private _useGet(name: TfToken | string): boolean {
    // Certain legacy attribute names use Get() instead of
    // GetLightParamValue(), which was the more modern implementation added
    // along with the UsdLux imaging adapter implementation

    if (name === HdLightTokens.params ||
      name === HdLightTokens.shadowParams ||
      name === HdLightTokens.shadowCollection) {
      return true
    }

    return false
  }
}

/** dataSourceLegacyPrim.cpp:1289-1305 */
function _BuildCollectionDataSourceFromLightParam(id: string,
  sceneDelegate: HdSceneDelegate, exprToken: TfToken): HdDataSourceBase | undefined {
  const v = sceneDelegate.getLightParamValue(id, exprToken)
  const held = _Held(v)
  if (held instanceof SdfPathExpression) {
    return new HdCollectionSchema.Builder()
      .setMembershipExpression(HdRetainedTypedSampledDataSource.new(held))
      .build()
  }
  return undefined
}

/** dataSourceLegacyPrim.cpp:1308-1348 */
export class Hd_DataSourceLightCollections extends HdContainerDataSource {
  constructor(private readonly _id: string, private readonly _sceneDelegate: HdSceneDelegate) {
    super()
    TF_VERIFY(this._sceneDelegate)
  }

  static new(id: string, sceneDelegate: HdSceneDelegate): Hd_DataSourceLightCollections {
    return new Hd_DataSourceLightCollections(id, sceneDelegate)
  }

  getNames(): TfToken[] {
    return [HdCollectionEmulationTokens.lightLinkCollection,
      HdCollectionEmulationTokens.shadowLinkCollection]
  }

  Get(name: TfToken | string): HdDataSourceBase | undefined {
    if (name === HdCollectionEmulationTokens.lightLinkCollection) {
      return _BuildCollectionDataSourceFromLightParam(this._id, this._sceneDelegate,
        HdCollectionEmulationTokens.lightLinkCollectionMembershipExpression)
    }

    if (name === HdCollectionEmulationTokens.shadowLinkCollection) {
      return _BuildCollectionDataSourceFromLightParam(this._id, this._sceneDelegate,
        HdCollectionEmulationTokens.shadowLinkCollectionMembershipExpression)
    }

    return undefined
  }
}

/** dataSourceLegacyPrim.cpp:1350-1382 */
export class Hd_DataSourceLightFilterCollections extends HdContainerDataSource {
  constructor(private readonly _id: string, private readonly _sceneDelegate: HdSceneDelegate) {
    super()
    TF_VERIFY(this._sceneDelegate)
  }

  static new(id: string, sceneDelegate: HdSceneDelegate): Hd_DataSourceLightFilterCollections {
    return new Hd_DataSourceLightFilterCollections(id, sceneDelegate)
  }

  getNames(): TfToken[] {
    return [HdCollectionEmulationTokens.filterLinkCollection]
  }

  Get(name: TfToken | string): HdDataSourceBase | undefined {
    if (name === HdCollectionEmulationTokens.filterLinkCollection) {
      return _BuildCollectionDataSourceFromLightParam(this._id, this._sceneDelegate,
        HdCollectionEmulationTokens.filterLinkCollectionMembershipExpression)
    }

    return undefined
  }
}

// ---------------------------------------------------------------------------

/** dataSourceLegacyPrim.cpp:1386-1419 */
export class Hd_DataSourceVolumeField extends HdContainerDataSource {
  constructor(private readonly _id: string, private readonly _sceneDelegate: HdSceneDelegate) {
    super()
    TF_VERIFY(this._sceneDelegate)
  }

  static new(id: string, sceneDelegate: HdSceneDelegate): Hd_DataSourceVolumeField {
    return new Hd_DataSourceVolumeField(id, sceneDelegate)
  }

  getNames(): TfToken[] {
    // We don't actually know? but return the schema tokens.
    return [
      HdVolumeFieldSchemaTokens.filePath,
      HdVolumeFieldSchemaTokens.fieldName,
      HdVolumeFieldSchemaTokens.fieldIndex,
      HdVolumeFieldSchemaTokens.fieldDataType,
      HdVolumeFieldSchemaTokens.vectorDataRoleHint,
    ]
  }

  Get(name: TfToken | string): HdDataSourceBase | undefined {
    const v = this._sceneDelegate.Get(this._id, name)
    return HdCreateTypedRetainedDataSource(v)
  }
}

// ---------------------------------------------------------------------------

/** dataSourceLegacyPrim.cpp:1423-1483 */
export class Hd_InstanceCategoriesVectorDataSource extends HdVectorDataSource {
  private _checked = false
  private _values: HdDataSourceBase[] = []

  constructor(private readonly _id: string, private readonly _sceneDelegate: HdSceneDelegate) {
    super()
    TF_VERIFY(this._sceneDelegate)
  }

  static new(id: string, sceneDelegate: HdSceneDelegate): Hd_InstanceCategoriesVectorDataSource {
    return new Hd_InstanceCategoriesVectorDataSource(id, sceneDelegate)
  }

  getNumElements(): number {
    if (!this._checked) {
      this._fillArray()
    }
    return this._values.length
  }

  getElement(element: number): HdDataSourceBase | undefined {
    if (!this._checked) {
      this._fillArray()
    }
    if (element < this._values.length) {
      return this._values[element]
    }
    return undefined
  }

  private _fillArray(): void {
    // NOTE: in emulation, multiple threads are reading from the scene
    // index, but only one thread is reading from any specific prim at a
    // time, so we don't need to worry about concurrent access.
    if (this._checked) {
      return
    }
    const values = this._sceneDelegate.getInstanceCategories(this._id)
    if (values.length > 0) {
      for (const value of values) {
        // TODO, deduplicate by address or value
        this._values.push(HdCategoriesSchema.buildRetained(value, []))
      }
    }
    this._checked = true
  }
}

// ---------------------------------------------------------------------------

/** dataSourceLegacyPrim.cpp:1526-1561 */
class Hd_InstanceIndicesDataSource extends HdVectorDataSource {
  constructor(
    private readonly _id: string,
    private readonly _sceneDelegate: HdSceneDelegate,
    private readonly _protos: readonly string[],
  ) {
    super()
    TF_VERIFY(this._sceneDelegate)
  }

  static new(id: string, sceneDelegate: HdSceneDelegate,
    protos: readonly string[]): Hd_InstanceIndicesDataSource {
    return new Hd_InstanceIndicesDataSource(id, sceneDelegate, protos)
  }

  getNumElements(): number {
    return this._protos.length
  }

  getElement(element: number): HdDataSourceBase | undefined {
    if (element >= this._protos.length) {
      return undefined
    }

    const instanceIndices = this._sceneDelegate.getInstanceIndices(this._id,
      this._protos[element]!)

    return HdRetainedTypedSampledDataSource.new(instanceIndices)
  }
}

/** dataSourceLegacyPrim.cpp:1487-1566 */
export class Hd_InstancerTopologyDataSource extends HdContainerDataSource {
  private readonly _protos: string[]

  constructor(private readonly _id: string, private readonly _sceneDelegate: HdSceneDelegate) {
    super()
    TF_VERIFY(this._sceneDelegate)
    const protos = this._sceneDelegate.getInstancerPrototypes(this._id)
    this._protos = [...protos]
  }

  static new(id: string, sceneDelegate: HdSceneDelegate): Hd_InstancerTopologyDataSource {
    return new Hd_InstancerTopologyDataSource(id, sceneDelegate)
  }

  getNames(): TfToken[] {
    return [
      HdInstancerTopologySchemaTokens.prototypes,
      HdInstancerTopologySchemaTokens.instanceIndices,
      HdLegacyFlagTokens.isLegacyInstancer,
    ]
  }

  Get(name: TfToken | string): HdDataSourceBase | undefined {
    if (name === HdInstancerTopologySchemaTokens.prototypes) {
      return HdRetainedTypedSampledDataSource.new(this._protos)
    } else if (name === HdInstancerTopologySchemaTokens.instanceIndices) {
      return Hd_InstanceIndicesDataSource.new(this._id, this._sceneDelegate, this._protos)
    } else if (name === HdLegacyFlagTokens.isLegacyInstancer) {
      return HdRetainedTypedSampledDataSource.new(true)
    } else {
      return undefined
    }
  }
}

// ---------------------------------------------------------------------------

/** dataSourceLegacyPrim.cpp:1570-1716 */
export class Hd_DisplayStyleDataSource extends HdContainerDataSource {
  private _displayStyle = new HdDisplayStyle()
  private _displayStyleRead = false

  constructor(private readonly _sceneDelegate: HdSceneDelegate, private readonly _id: string) {
    super()
    TF_VERIFY(this._sceneDelegate)
  }

  static new(sceneDelegate: HdSceneDelegate, id: string): Hd_DisplayStyleDataSource {
    return new Hd_DisplayStyleDataSource(sceneDelegate, id)
  }

  getNames(): TfToken[] {
    return [
      HdLegacyDisplayStyleSchemaTokens.refineLevel,
      HdLegacyDisplayStyleSchemaTokens.flatShadingEnabled,
      HdLegacyDisplayStyleSchemaTokens.displacementEnabled,
      HdLegacyDisplayStyleSchemaTokens.displayInOverlay,
      HdLegacyDisplayStyleSchemaTokens.occludedSelectionShowsThrough,
      HdLegacyDisplayStyleSchemaTokens.pointsShadingEnabled,
      HdLegacyDisplayStyleSchemaTokens.materialIsFinal,
      HdLegacyDisplayStyleSchemaTokens.shadingStyle,
      HdLegacyDisplayStyleSchemaTokens.reprSelector,
      HdLegacyDisplayStyleSchemaTokens.cullStyle,
    ]
  }

  private _readDisplayStyle(): HdDisplayStyle {
    if (!this._displayStyleRead) {
      this._displayStyle = this._sceneDelegate.getDisplayStyle(this._id)
      this._displayStyleRead = true
    }
    return this._displayStyle
  }

  Get(name: TfToken | string): HdDataSourceBase | undefined {
    if (name === HdLegacyDisplayStyleSchemaTokens.refineLevel) {
      const displayStyle = this._readDisplayStyle()
      return (displayStyle.refineLevel !== 0)
        ? HdRetainedTypedSampledDataSource.new(displayStyle.refineLevel)
        : undefined
    } else if (name === HdLegacyDisplayStyleSchemaTokens.flatShadingEnabled) {
      return HdRetainedTypedSampledDataSource.new(this._readDisplayStyle().flatShadingEnabled)
    } else if (name === HdLegacyDisplayStyleSchemaTokens.displacementEnabled) {
      return HdRetainedTypedSampledDataSource.new(this._readDisplayStyle().displacementEnabled)
    } else if (name === HdLegacyDisplayStyleSchemaTokens.displayInOverlay) {
      return HdRetainedTypedSampledDataSource.new(this._readDisplayStyle().displayInOverlay)
    } else if (name === HdLegacyDisplayStyleSchemaTokens.occludedSelectionShowsThrough) {
      return HdRetainedTypedSampledDataSource.new(
        this._readDisplayStyle().occludedSelectionShowsThrough)
    } else if (name === HdLegacyDisplayStyleSchemaTokens.pointsShadingEnabled) {
      return HdRetainedTypedSampledDataSource.new(this._readDisplayStyle().pointsShadingEnabled)
    } else if (name === HdLegacyDisplayStyleSchemaTokens.materialIsFinal) {
      return HdRetainedTypedSampledDataSource.new(this._readDisplayStyle().materialIsFinal)
    } else if (name === HdLegacyDisplayStyleSchemaTokens.shadingStyle) {
      const shadingStyle = _GetWithDefault<TfToken>(
        this._sceneDelegate.getShadingStyle(this._id), 'token', TfToken(''))
      if (shadingStyle === '') {
        return undefined
      }
      return HdRetainedTypedSampledDataSource.new(shadingStyle)
    } else if (name === HdLegacyDisplayStyleSchemaTokens.reprSelector) {
      const repr: HdReprSelector = this._sceneDelegate.getReprSelector(this._id)
      let reprSelectorDs: HdTypedSampledDataSource<TfToken[]> | undefined = undefined
      let empty = true
      for (let i = 0; i < HdReprSelector.MAX_TOPOLOGY_REPRS; ++i) {
        if (repr.at(i) !== '') {
          empty = false
          break
        }
      }
      if (!empty) {
        const array: TfToken[] = []
        for (let i = 0; i < HdReprSelector.MAX_TOPOLOGY_REPRS; ++i) {
          array[i] = TfToken(repr.at(i))
        }
        reprSelectorDs = HdRetainedTypedSampledDataSource.new(array)
      }
      return reprSelectorDs
    } else if (name === HdLegacyDisplayStyleSchemaTokens.cullStyle) {
      const cullStyle = this._sceneDelegate.getCullStyle(this._id)
      if (cullStyle === HdCullStyle.HdCullStyleDontCare) {
        return undefined
      }
      let cullStyleToken: TfToken
      switch (cullStyle) {
        case HdCullStyle.HdCullStyleNothing:
          cullStyleToken = HdCullStyleTokens.nothing
          break
        case HdCullStyle.HdCullStyleBack:
          cullStyleToken = HdCullStyleTokens.back
          break
        case HdCullStyle.HdCullStyleFront:
          cullStyleToken = HdCullStyleTokens.front
          break
        case HdCullStyle.HdCullStyleBackUnlessDoubleSided:
          cullStyleToken = HdCullStyleTokens.backUnlessDoubleSided
          break
        case HdCullStyle.HdCullStyleFrontUnlessDoubleSided:
          cullStyleToken = HdCullStyleTokens.frontUnlessDoubleSided
          break
        default:
          cullStyleToken = HdCullStyleTokens.dontCare
          break
      }
      return HdRetainedTypedSampledDataSource.new(cullStyleToken)
    } else {
      return undefined
    }
  }
}

// ---------------------------------------------------------------------------

/** dataSourceLegacyPrim.cpp:1720-1750 */
export class Hd_GenericGetSampledDataSource extends HdSampledDataSource {
  constructor(
    private readonly _sceneDelegate: HdSceneDelegate,
    private readonly _id: string,
    private readonly _key: TfToken | string,
  ) {
    super()
  }

  static new(sceneDelegate: HdSceneDelegate, id: string,
    key: TfToken | string): Hd_GenericGetSampledDataSource {
    return new Hd_GenericGetSampledDataSource(sceneDelegate, id, key)
  }

  GetValue(_shutterOffset: Time): VtValue {
    return this._sceneDelegate.Get(this._id, this._key)
  }

  // returning false indicates constant value for any time
  GetContributingSampleTimesForInterval(_startTime: Time, _endTime: Time,
    _outSampleTimes: number[]): boolean {
    return false
  }
}

// dataSourceLegacyPrim.cpp:1754-1765: duplicated here because they are
// currently only defined in hdSt -- on which we cannot depend on but must be
// able to emulate
const _drawTargetTokens = TfMakeTokens({
  camera: 'camera',
  collection: 'collection',
  drawTargetSet: 'drawTargetSet',
  enable: 'enable',
  resolution: 'resolution',
  aovBindings: 'aovBindings',
  depthPriority: 'depthPriority',
})

/** dataSourceLegacyPrim.cpp:1768-1790 */
export class Hd_LegacyDrawTargetContainerDataSource extends HdContainerDataSource {
  constructor(private readonly _sceneDelegate: HdSceneDelegate, private readonly _id: string) {
    super()
  }

  static new(sceneDelegate: HdSceneDelegate, id: string): Hd_LegacyDrawTargetContainerDataSource {
    return new Hd_LegacyDrawTargetContainerDataSource(sceneDelegate, id)
  }

  getNames(): TfToken[] {
    return [..._drawTargetTokens.allTokens]
  }

  Get(name: TfToken | string): HdDataSourceBase | undefined {
    return Hd_GenericGetSampledDataSource.new(this._sceneDelegate, this._id, name)
  }
}

// ---------------------------------------------------------------------------

interface _ExtComputationPrimvarEntry {
  interpolation: TfToken
  role: TfToken
  sourceComputation: string
  sourceComputationOutputName: TfToken
  valueType: unknown
}

/** dataSourceLegacyPrim.cpp:1794-1870 */
export class Hd_DataSourceLegacyExtComputationPrimvarsContainer extends HdContainerDataSource {
  private _entries = new Map<string, _ExtComputationPrimvarEntry>()

  constructor(private readonly _primId: string) { super() }

  static new(primId: string): Hd_DataSourceLegacyExtComputationPrimvarsContainer {
    return new Hd_DataSourceLegacyExtComputationPrimvarsContainer(primId)
  }

  addDesc(name: TfToken, interpolation: TfToken, role: TfToken,
    sourceComputation: string, sourceComputationOutputName: TfToken,
    valueType: unknown): void {
    this._entries.set(name, { interpolation, role, sourceComputation,
      sourceComputationOutputName, valueType })
  }

  getNames(): TfToken[] {
    return [...this._entries.keys()].map(n => TfToken(n))
  }

  Get(name: TfToken | string): HdDataSourceBase | undefined {
    const it = this._entries.get(name)
    if (!it) {
      return undefined
    }

    return new HdExtComputationPrimvarSchema.Builder()
      .setInterpolation(
        HdExtComputationPrimvarSchema.buildInterpolationDataSource(it.interpolation))
      .setRole(
        HdExtComputationPrimvarSchema.buildRoleDataSource(it.role))
      .setSourceComputation(
        HdRetainedTypedSampledDataSource.new(it.sourceComputation))
      .setSourceComputationOutputName(
        HdRetainedTypedSampledDataSource.new(it.sourceComputationOutputName))
      .setValueType(
        HdRetainedTypedSampledDataSource.new(it.valueType as HdTupleType))
      .build()
  }
}

/** dataSourceLegacyPrim.cpp:1874-1926 */
export class Hd_DataSourceLegacyExtComputationInput extends HdSampledDataSource {
  private _timeSamples = new HdTimeSampleArray<VtValue>()

  constructor(
    private readonly _name: TfToken,
    private readonly _id: string,
    private readonly _sceneDelegate: HdSceneDelegate,
  ) {
    super()
    TF_VERIFY(this._sceneDelegate)
  }

  static new(name: TfToken | string, id: string,
    sceneDelegate: HdSceneDelegate): Hd_DataSourceLegacyExtComputationInput {
    return new Hd_DataSourceLegacyExtComputationInput(TfToken(name), id, sceneDelegate)
  }

  GetValue(shutterOffset: Time): VtValue {
    if (shutterOffset === 0) {
      return this._sceneDelegate.getExtComputationInput(this._id, this._name)
    } else {
      this._getTimeSamples()
      return _Resample(this._timeSamples, shutterOffset)
    }
  }

  GetContributingSampleTimesForInterval(startTime: Time, endTime: Time,
    outSampleTimes: number[]): boolean {
    this._getTimeSamples()

    // XXX: Start and end times come from the sene delegate, so we can't
    // get samples outside of those provided. However, we can clamp
    // returned samples to be in the right range.
    _ContributingSampleTimes(this._timeSamples, startTime, endTime, outSampleTimes)
    return true
  }

  private _getTimeSamples(): void {
    if (this._timeSamples.count === 0) {
      this._sceneDelegate.sampleExtComputationInput(this._id, this._name, this._timeSamples, 1)
    }
  }
}

/** dataSourceLegacyPrim.cpp:1930-1954 */
export class Hd_DataSourceLegacyExtComputationInputValues extends HdContainerDataSource {
  constructor(private readonly _id: string, private readonly _sceneDelegate: HdSceneDelegate) {
    super()
  }

  static new(id: string, sceneDelegate: HdSceneDelegate): Hd_DataSourceLegacyExtComputationInputValues {
    return new Hd_DataSourceLegacyExtComputationInputValues(id, sceneDelegate)
  }

  getNames(): TfToken[] {
    return this._sceneDelegate.getExtComputationSceneInputNames(this._id)
  }

  Get(name: TfToken | string): HdDataSourceBase | undefined {
    return Hd_DataSourceLegacyExtComputationInput.new(name, this._id, this._sceneDelegate)
  }
}

/** dataSourceLegacyPrim.cpp:1958-2052 */
export class Hd_DataSourceLegacyExtComputation extends HdContainerDataSource {
  constructor(private readonly _id: string, private readonly _sceneDelegate: HdSceneDelegate) {
    super()
  }

  static new(id: string, sceneDelegate: HdSceneDelegate): Hd_DataSourceLegacyExtComputation {
    return new Hd_DataSourceLegacyExtComputation(id, sceneDelegate)
  }

  getNames(): TfToken[] {
    return [
      HdExtComputationSchemaTokens.inputValues,
      HdExtComputationSchemaTokens.inputComputations,
      HdExtComputationSchemaTokens.outputs,
      HdExtComputationSchemaTokens.glslKernel,
      HdExtComputationSchemaTokens.cpuCallback,
      HdExtComputationSchemaTokens.dispatchCount,
      HdExtComputationSchemaTokens.elementCount,
    ]
  }

  Get(name: TfToken | string): HdDataSourceBase | undefined {
    if (name === HdExtComputationSchemaTokens.inputValues) {
      return Hd_DataSourceLegacyExtComputationInputValues.new(this._id, this._sceneDelegate)
    } else if (name === HdExtComputationSchemaTokens.inputComputations) {
      const descs = this._sceneDelegate.getExtComputationInputDescriptors(this._id)
      const names: TfToken[] = []
      const dataSources: HdDataSourceBase[] = []
      for (const desc of descs) {
        names.push(TfToken(desc.name))
        dataSources.push(
          new HdExtComputationInputComputationSchema.Builder()
            .setSourceComputation(
              HdRetainedTypedSampledDataSource.new(desc.sourceComputationId))
            .setSourceComputationOutputName(
              HdRetainedTypedSampledDataSource.new(TfToken(desc.sourceComputationOutputName)))
            .build())
      }
      return HdRetainedContainerDataSource.new(names, dataSources)
    } else if (name === HdExtComputationSchemaTokens.outputs) {
      const descs = this._sceneDelegate.getExtComputationOutputDescriptors(this._id)
      const names: TfToken[] = []
      const dataSources: HdDataSourceBase[] = []
      for (const desc of descs) {
        names.push(TfToken(desc.name))
        dataSources.push(
          new HdExtComputationOutputSchema.Builder()
            .setValueType(HdRetainedTypedSampledDataSource.new(desc.valueType as HdTupleType))
            .build())
      }
      return HdRetainedContainerDataSource.new(names, dataSources)
    } else if (name === HdExtComputationSchemaTokens.glslKernel) {
      const kernel = this._sceneDelegate.getExtComputationKernel(this._id)
      return HdRetainedTypedSampledDataSource.new(kernel)
    } else if (name === HdExtComputationSchemaTokens.cpuCallback) {
      return HdRetainedTypedSampledDataSource.new<HdExtComputationCpuCallback>(
        new Hd_SceneDelegateExtComputationCpuCallback(this._id, this._sceneDelegate))
    } else if (name === HdExtComputationSchemaTokens.dispatchCount) {
      const vDispatch = this._sceneDelegate.getExtComputationInput(
        this._id, HdTokens.dispatchCount)
      // size_t is uint64 here.
      return HdRetainedTypedSampledDataSource.new(_GetWithDefault(vDispatch, 'uint64', 0))
    } else if (name === HdExtComputationSchemaTokens.elementCount) {
      const vElement = this._sceneDelegate.getExtComputationInput(
        this._id, HdTokens.elementCount)
      return HdRetainedTypedSampledDataSource.new(_GetWithDefault(vElement, 'uint64', 0))
    } else {
      return undefined
    }
  }
}

// ---------------------------------------------------------------------------

/** dataSourceLegacyPrim.cpp:2056-2099 */
export class Hd_DataSourceRenderBuffer extends HdContainerDataSource {
  private readonly rb

  constructor(private readonly _sceneDelegate: HdSceneDelegate, private readonly _id: string) {
    super()
    TF_VERIFY(this._sceneDelegate)
    this.rb = this._sceneDelegate.getRenderBufferDescriptor(this._id)
  }

  static new(sceneDelegate: HdSceneDelegate, id: string): Hd_DataSourceRenderBuffer {
    return new Hd_DataSourceRenderBuffer(sceneDelegate, id)
  }

  getNames(): TfToken[] {
    return [
      HdRenderBufferSchemaTokens.dimensions,
      HdRenderBufferSchemaTokens.format,
      HdRenderBufferSchemaTokens.multiSampled,
    ]
  }

  Get(name: TfToken | string): HdDataSourceBase | undefined {
    if (name === HdRenderBufferSchemaTokens.dimensions) {
      // HdRenderBufferDescriptor::dimensions is a [x, y, z] tuple in aov.ts;
      // the schema member is GfVec3i.
      const d = this.rb.dimensions
      return HdRetainedTypedSampledDataSource.new(new GfVec3i(d[0], d[1], d[2]))
    } else if (name === HdRenderBufferSchemaTokens.format) {
      return HdRetainedTypedSampledDataSource.new(this.rb.format)
    } else if (name === HdRenderBufferSchemaTokens.multiSampled) {
      return HdRetainedTypedSampledDataSource.new(this.rb.multiSampled)
    } else {
      return Hd_GenericGetSampledDataSource.new(this._sceneDelegate, this._id, name)
    }
  }
}

// ---------------------------------------------------------------------------

/** dataSourceLegacyPrim.cpp:2103-2184 */
function _ToVectorDS(hdProducts: readonly HdRenderSettingsRenderProduct[]): HdVectorDataSource {
  const productsDs: HdDataSourceBase[] = []

  for (const hdProduct of hdProducts) {
    // Construct render var ds.
    const varsDs: HdDataSourceBase[] = []
    for (const hdVar of hdProduct.renderVars) {
      varsDs.push(
        new HdRenderVarSchema.Builder()
          .setPath(HdRetainedTypedSampledDataSource.new(hdVar.varPath))
          .setDataType(HdRetainedTypedSampledDataSource.new(hdVar.dataType))
          .setSourceName(HdRetainedTypedSampledDataSource.new(TfToken(hdVar.sourceName)))
          .setSourceType(HdRetainedTypedSampledDataSource.new(hdVar.sourceType))
          .setNamespacedSettings(
            _ConvertVtDictionaryToContainerDS(hdVar.namespacedSettings))
          .build())
    }

    productsDs.push(
      new HdRenderProductSchema.Builder()
        .setPath(HdRetainedTypedSampledDataSource.new(hdProduct.productPath))
        .setType(HdRetainedTypedSampledDataSource.new(hdProduct.type))
        .setName(HdRetainedTypedSampledDataSource.new(hdProduct.name))
        .setResolution(HdRetainedTypedSampledDataSource.new(hdProduct.resolution))
        .setRenderVars(HdRetainedSmallVectorDataSource.new(varsDs))
        .setCameraPrim(HdRetainedTypedSampledDataSource.new(hdProduct.cameraPath))
        .setPixelAspectRatio(HdRetainedTypedSampledDataSource.new(hdProduct.pixelAspectRatio))
        .setAspectRatioConformPolicy(
          HdRetainedTypedSampledDataSource.new(hdProduct.aspectRatioConformPolicy))
        .setApertureSize(HdRetainedTypedSampledDataSource.new(hdProduct.apertureSize))
        .setDataWindowNDC(
          HdRetainedTypedSampledDataSource.new(
            new GfVec4f(
              hdProduct.dataWindowNDC.getMin().get(0),
              hdProduct.dataWindowNDC.getMin().get(1),
              hdProduct.dataWindowNDC.getMax().get(0),
              hdProduct.dataWindowNDC.getMax().get(1))))
        .setDisableMotionBlur(HdRetainedTypedSampledDataSource.new(hdProduct.disableMotionBlur))
        .setDisableDepthOfField(
          HdRetainedTypedSampledDataSource.new(hdProduct.disableDepthOfField))
        .setNamespacedSettings(
          _ConvertVtDictionaryToContainerDS(hdProduct.namespacedSettings))
        .build())
  }

  return HdRetainedSmallVectorDataSource.new(productsDs)
}

/** dataSourceLegacyPrim.cpp:2186-2291 */
export class Hd_DataSourceRenderSettings extends HdContainerDataSource {
  constructor(private readonly _sceneDelegate: HdSceneDelegate, private readonly _id: string) {
    super()
    TF_VERIFY(this._sceneDelegate)
  }

  static new(sceneDelegate: HdSceneDelegate, id: string): Hd_DataSourceRenderSettings {
    return new Hd_DataSourceRenderSettings(sceneDelegate, id)
  }

  getNames(): TfToken[] {
    return [
      HdRenderSettingsSchemaTokens.namespacedSettings,
      HdRenderSettingsSchemaTokens.renderProducts,
      HdRenderSettingsSchemaTokens.includedPurposes,
      HdRenderSettingsSchemaTokens.materialBindingPurposes,
      HdRenderSettingsSchemaTokens.renderingColorSpace,
      HdRenderSettingsSchemaTokens.camera,
      HdRenderSettingsSchemaTokens.disableDepthOfField,
      HdRenderSettingsSchemaTokens.disableMotionBlur,
    ]
  }

  Get(name: TfToken | string): HdDataSourceBase | undefined {
    const sd = this._sceneDelegate
    if (name === HdRenderSettingsSchemaTokens.namespacedSettings) {
      const value = sd.Get(this._id, HdRenderSettingsPrimTokens.namespacedSettings)
      const held = _Held(value)
      if (held instanceof VtDictionary) {
        return _ConvertVtDictionaryToContainerDS(held)
      }
    }

    if (name === HdRenderSettingsSchemaTokens.renderProducts) {
      const value = sd.Get(this._id, HdRenderSettingsPrimTokens.renderProducts)
      if (HdRenderSettingsIsHoldingRenderProducts(value)) {
        return _ToVectorDS(value.UncheckedGet<HdRenderSettingsRenderProducts>())
      }
    }

    if (name === HdRenderSettingsSchemaTokens.includedPurposes) {
      const value = sd.Get(this._id, HdRenderSettingsPrimTokens.includedPurposes)
      const held = _Held(value)
      if (held instanceof VtArray && _IsTokenArray(value)) {
        return HdRetainedTypedSampledDataSource.new(held.toArray() as TfToken[])
      }
    }

    if (name === HdRenderSettingsSchemaTokens.materialBindingPurposes) {
      const value = sd.Get(this._id, HdRenderSettingsPrimTokens.materialBindingPurposes)
      const held = _Held(value)
      if (held instanceof VtArray && _IsTokenArray(value)) {
        return HdRetainedTypedSampledDataSource.new(held.toArray() as TfToken[])
      }
    }

    if (name === HdRenderSettingsSchemaTokens.renderingColorSpace) {
      const value = sd.Get(this._id, HdRenderSettingsPrimTokens.renderingColorSpace)
      if (_IsHoldingType(value, 'token')) {
        return HdRetainedTypedSampledDataSource.new(value.UncheckedGet<TfToken>())
      }
    }

    if (name === HdRenderSettingsSchemaTokens.camera) {
      const value = sd.Get(this._id, HdRenderSettingsPrimTokens.camera)
      if (_IsHoldingPath(value)) {
        return HdRetainedTypedSampledDataSource.new(String(_Held(value)))
      }
    }

    if (name === HdRenderSettingsSchemaTokens.disableDepthOfField) {
      const value = sd.Get(this._id, HdRenderSettingsPrimTokens.disableDepthOfField)
      if (_IsHoldingType(value, 'bool')) {
        return HdRetainedTypedSampledDataSource.new(value.UncheckedGet<boolean>())
      }
    }

    if (name === HdRenderSettingsSchemaTokens.disableMotionBlur) {
      const value = sd.Get(this._id, HdRenderSettingsPrimTokens.disableMotionBlur)
      if (_IsHoldingType(value, 'bool')) {
        return HdRetainedTypedSampledDataSource.new(value.UncheckedGet<boolean>())
      }
    }

    return undefined
  }
}

// VtValue::IsHolding<VtArray<TfToken>>().
function _IsTokenArray(v: VtValue): boolean {
  return v instanceof VtValue && v.isArrayValued() &&
    v.getElementType() === VtValueTypes.token
}

// VtValue::IsHolding<SdfPath>(): a VtValue whose type is SdfPath, holding an
// SdfPath object or (as hd ids are) a path string; read as a path string.
function _IsHoldingPath(v: VtValue): boolean {
  return v instanceof VtValue && !v.IsEmpty() && v.getTypeName() === 'SdfPath'
}

// ---------------------------------------------------------------------------

/** dataSourceLegacyPrim.cpp:2295-2384 */
export class Hd_DataSourceImageShader extends HdContainerDataSource {
  constructor(private readonly _id: string, private readonly _sceneDelegate: HdSceneDelegate) {
    super()
    TF_VERIFY(this._sceneDelegate)
  }

  static new(id: string, sceneDelegate: HdSceneDelegate): Hd_DataSourceImageShader {
    return new Hd_DataSourceImageShader(id, sceneDelegate)
  }

  getNames(): TfToken[] {
    return [
      HdImageShaderSchemaTokens.enabled,
      HdImageShaderSchemaTokens.priority,
      HdImageShaderSchemaTokens.filePath,
      HdImageShaderSchemaTokens.constants,
      HdImageShaderSchemaTokens.materialNetwork,
    ]
  }

  Get(name: TfToken | string): HdDataSourceBase | undefined {
    const sd = this._sceneDelegate
    if (name === HdImageShaderSchemaTokens.enabled) {
      const value = sd.Get(this._id, HdImageShaderSchemaTokens.enabled)
      if (_IsHoldingType(value, 'bool')) {
        return HdRetainedTypedSampledDataSource.new(value.UncheckedGet<boolean>())
      } else {
        return undefined
      }
    }

    if (name === HdImageShaderSchemaTokens.priority) {
      const value = sd.Get(this._id, HdImageShaderSchemaTokens.priority)
      if (_IsHoldingType(value, 'int')) {
        return HdRetainedTypedSampledDataSource.new(value.UncheckedGet<number>())
      } else {
        return undefined
      }
    }

    if (name === HdImageShaderSchemaTokens.filePath) {
      const value = sd.Get(this._id, HdImageShaderSchemaTokens.filePath)
      if (_IsHoldingType(value, 'string')) {
        return HdRetainedTypedSampledDataSource.new(value.UncheckedGet<string>())
      } else {
        return undefined
      }
    }

    if (name === HdImageShaderSchemaTokens.constants) {
      const value = sd.Get(this._id, HdImageShaderSchemaTokens.constants)
      const held = _Held(value)
      if (held instanceof VtDictionary) {
        return _ConvertVtDictionaryToContainerDS(held)
      } else {
        return undefined
      }
    }

    if (name === HdImageShaderSchemaTokens.materialNetwork) {
      const value = sd.Get(this._id, HdImageShaderSchemaTokens.materialNetwork)
      const held = _Held(value)
      if (held instanceof HdMaterialNetworkMap) {
        // HdUtils::ConvertHdMaterialNetworkToHdMaterialNetworkSchema
        // (utils.cpp:244-337) is the network ConvertHdMaterialNetworkTo
        // HdMaterialSchema wraps under the universal render context
        // (utils.cpp:339-352); utils.ts exports only the latter.
        return HdUtils.convertHdMaterialNetworkToHdMaterialSchema(held)
          .Get(HdMaterialSchemaTokens.universalRenderContext)
      } else {
        return undefined
      }
    }

    return Hd_GenericGetSampledDataSource.new(sd, this._id, name)
  }
}

// ---------------------------------------------------------------------------

/** dataSourceLegacyPrim.cpp:2388-2407 */
function _InterpolationAsToken(interpolation: HdInterpolation): TfToken {
  switch (interpolation) {
    case HdInterpolation.HdInterpolationConstant:
      return HdPrimvarSchemaTokens.constant
    case HdInterpolation.HdInterpolationUniform:
      return HdPrimvarSchemaTokens.uniform
    case HdInterpolation.HdInterpolationVarying:
      return HdPrimvarSchemaTokens.varying
    case HdInterpolation.HdInterpolationVertex:
      return HdPrimvarSchemaTokens.vertex
    case HdInterpolation.HdInterpolationFaceVarying:
      return HdPrimvarSchemaTokens.faceVarying
    case HdInterpolation.HdInterpolationInstance:
      return HdPrimvarSchemaTokens.instance

    default:
      return HdPrimvarSchemaTokens.constant
  }
}

// Schemas with a resource member built by
// _ConvertRenderTerminalResourceToHdDataSource<SchemaType>.
interface _ResourceSchemaType {
  Builder: new () => { setResource(ds: HdContainerDataSource): unknown, build(): HdContainerDataSource }
}

/** dataSourceLegacyPrim.cpp:2597-2640 */
function _ConvertRenderTerminalResourceToHdDataSource(SchemaType: _ResourceSchemaType,
  outputNodeValue: VtValue): HdContainerDataSource | undefined {
  // IsHolding<HdMaterialNode2> (material.h:147-158).
  if (!(outputNodeValue instanceof VtValue) || outputNodeValue.getType() !== HdMaterialNode2Type ||
    !(outputNodeValue.UncheckedGet<unknown>() instanceof HdMaterialNode2)) {
    return undefined
  }

  const outputNode = outputNodeValue.UncheckedGet<HdMaterialNode2>()

  const paramsNames: TfToken[] = []
  const paramsValues: HdDataSourceBase[] = []
  for (const [name, value] of outputNode.parameters) {
    paramsNames.push(TfToken(name))
    paramsValues.push(
      new HdMaterialNodeParameterSchema.Builder()
        .setValue(HdRetainedTypedSampledDataSource.new(value as VtValue))
        .build())
  }

  const nodeDS = new HdMaterialNodeSchema.Builder()
    .setParameters(HdRetainedContainerDataSource.new(paramsNames, paramsValues))
    .setInputConnections(HdRetainedContainerDataSource.new([], []))
    .setNodeIdentifier(HdRetainedTypedSampledDataSource.new(TfToken(outputNode.nodeTypeId)))
    .build()

  const builder = new SchemaType.Builder()
  builder.setResource(nodeDS)
  return builder.build()
}

// SdfPath::GetName for a path string: the prim or property name.
function _PathGetName(path: string): string {
  const slash = path.lastIndexOf('/')
  const tail = path.substring(slash + 1)
  const dot = tail.indexOf('.')
  return dot >= 0 ? tail.substring(dot + 1) : tail
}

// TfStringGetBeforeSuffix(s, delimiter): s up to the last delimiter.
function _TfStringGetBeforeSuffix(s: string, delimiter: string): string {
  const i = s.lastIndexOf(delimiter)
  return i < 0 ? s : s.substring(0, i)
}

// SdfPath::StripPrefixNamespace(name, prefix).first.
function _StripPrefixNamespace(name: string, prefix: string): string {
  const full = prefix + ':'
  return name.startsWith(full) ? name.substring(full.length) : name
}

let _visOn: HdContainerDataSource | undefined
let _visOff: HdContainerDataSource | undefined
let _cachedLocators: HdDataSourceLocatorSet | undefined

/**
 * dataSourceLegacyPrim.h:51-112. This is an HdContainerDataSource which
 * represents a prim-level data source for adapting HdSceneDelegate calls into
 * the forms defined by HdSchemas during emulation of legacy scene delegates.
 */
export class HdDataSourceLegacyPrim extends HdContainerDataSource {
  protected _id: string
  protected _type: TfToken
  protected _sceneDelegate: HdSceneDelegate

  private _primvarsBuilt = false
  private _extComputationPrimvarsBuilt = false

  private _primvars: HdContainerDataSource | undefined
  private _extComputationPrimvars: HdContainerDataSource | undefined

  // Note: _instancerTopology is cached for performance reasons, but the
  // other data sources are not.
  private _instancerTopology: HdContainerDataSource | undefined

  /** dataSourceLegacyPrim.cpp:2413-2424 */
  protected constructor(id: string, type: TfToken | string, sceneDelegate: HdSceneDelegate) {
    super()
    this._id = id
    this._type = TfToken(type)
    this._sceneDelegate = sceneDelegate
    TF_VERIFY(this._sceneDelegate)
  }

  /** HD_DECLARE_DATASOURCE New */
  static new(id: string, type: TfToken | string,
    sceneDelegate: HdSceneDelegate): HdDataSourceLegacyPrim {
    return new HdDataSourceLegacyPrim(id, type, sceneDelegate)
  }

  /** HD_DECLARE_DATASOURCE Cast */
  static cast(ds: HdDataSourceBase | undefined): HdDataSourceLegacyPrim | undefined {
    return ds instanceof HdDataSourceLegacyPrim ? ds : undefined
  }

  /** dataSourceLegacyPrim.cpp:2426-2442. Called by HdLegacyPrimSceneIndex to
   *  invalidate caches when the owning prim is dirtied. */
  primDirtied(locators: HdDataSourceLocatorSet): void {
    if (locators.intersects(HdPrimvarsSchema.getDefaultLocator())) {
      this._primvars = undefined
      this._primvarsBuilt = false
      this._extComputationPrimvarsBuilt = false
      this._extComputationPrimvars = undefined
    }

    if (locators.intersects(HdInstancerTopologySchema.getDefaultLocator())) {
      this._instancerTopology = undefined
    }
  }

  /** dataSourceLegacyPrim.cpp:2444-2453. Returns locators for data sources
   *  that cache data. */
  static getCachedLocators(): HdDataSourceLocatorSet {
    _cachedLocators ??= new HdDataSourceLocatorSet([
      HdPrimvarsSchema.getDefaultLocator(),
      HdInstancerTopologySchema.getDefaultLocator(),
    ])
    return _cachedLocators
  }

  /** dataSourceLegacyPrim.cpp:2455-2476 */
  private _isLight(): boolean {
    if (HdPrimTypeIsLight(this._type)) {
      return true
    }

    // NOTE: This convention allows for things like meshes to identify
    //       themselves also as lights.
    //
    //       While downstream consumers might query for this equivalent data
    //       source directly (see Hd_DataSourceLight), its use here is only
    //       part of GetNames and Has for the prim-level data source.
    //
    //       This specific method will not be invoked by rendering directly.
    //       Hydra Scene Debugger is the only caller of GetNames for
    //       a prim-level container data source -- and only for the selected
    //       prim.
    const v = this._sceneDelegate.getLightParamValue(this._id, HdTokens.isLight)
    return _GetWithDefault(v, 'bool', false)
  }

  /** dataSourceLegacyPrim.cpp:2478-2484 */
  private _isInstanceable(): boolean {
    return HdPrimTypeIsGprim(this._type) ||
      this._isLight() ||
      this._type === HdPrimTypeTokens.instancer
  }

  /** dataSourceLegacyPrim.cpp:2486-2595 */
  getNames(): TfToken[] {
    const result: TfToken[] = []
    const type = this._type

    if (type === HdPrimTypeTokens.mesh) {
      result.push(HdMeshSchemaTokens.mesh)
    }

    if (type === HdPrimTypeTokens.basisCurves) {
      result.push(HdBasisCurvesSchemaTokens.basisCurves)
    }

    // Allow all legacy prims to provide primvars as that's the only interface
    // for advertising what names/values are there.
    // Abstract prims which may need to be expressed via legacy scene delegate
    // APIs can make use of it without this code needing to be aware of any
    // custom types.
    result.push(HdPrimvarsSchemaTokens.primvars)

    if (HdPrimTypeIsGprim(type)) {
      result.push(HdExtComputationPrimvarsSchemaTokens.extComputationPrimvars)
      result.push(HdMaterialBindingsSchema.getSchemaToken())
      result.push(HdLegacyDisplayStyleSchemaTokens.displayStyle)
      result.push(HdCoordSysBindingSchemaTokens.coordSysBinding)
      result.push(HdPurposeSchemaTokens.purpose)
      result.push(HdVisibilitySchemaTokens.visibility)
      result.push(HdCategoriesSchemaTokens.categories)
      result.push(HdXformSchemaTokens.xform)
      result.push(HdExtentSchemaTokens.extent)
    }

    if (this._isLight() || type === HdPrimTypeTokens.lightFilter) {
      result.push(HdMaterialSchemaTokens.material)
      result.push(HdXformSchemaTokens.xform)
      result.push(HdLightSchemaTokens.light)
      result.push(HdCollectionsSchemaTokens.collections)
      result.push(HdDependenciesSchemaTokens.__dependencies)
    }

    if (type === HdPrimTypeTokens.material) {
      result.push(HdMaterialSchemaTokens.material)
    }

    if (type === HdPrimTypeTokens.instancer) {
      result.push(HdXformSchemaTokens.xform)
      result.push(HdInstancerTopologySchemaTokens.instancerTopology)
      result.push(HdInstanceCategoriesSchemaTokens.instanceCategories)

      // This is relevant for instancer prims created for point instancers.
      result.push(HdCategoriesSchemaTokens.categories)
    }

    if (this._isInstanceable()) {
      result.push(HdInstancedBySchemaTokens.instancedBy)
    }

    if (type === HdPrimTypeTokens.camera) {
      result.push(HdCameraSchemaTokens.camera)
      result.push(HdXformSchemaTokens.xform)
    }

    if (type === HdPrimTypeTokens.renderBuffer) {
      result.push(HdRenderBufferSchemaTokens.renderBuffer)
    }

    if (type === HdPrimTypeTokens.renderSettings) {
      result.push(HdRenderSettingsSchemaTokens.renderSettings)
    }

    if (type === HdPrimTypeTokens.integrator) {
      result.push(HdIntegratorSchemaTokens.integrator)
    }

    if (type === HdPrimTypeTokens.sampleFilter) {
      result.push(HdSampleFilterSchemaTokens.sampleFilter)
    }

    if (type === HdPrimTypeTokens.displayFilter) {
      result.push(HdDisplayFilterSchemaTokens.displayFilter)
    }

    if (HdLegacyPrimTypeIsVolumeField(type)) {
      result.push(HdVolumeFieldSchemaTokens.volumeField)
    }

    if (type === HdPrimTypeTokens.volume) {
      result.push(HdVolumeFieldBindingSchemaTokens.volumeFieldBinding)
    }

    if (type === HdPrimTypeTokens.extComputation) {
      result.push(HdExtComputationSchemaTokens.extComputation)
    }

    if (type === HdPrimTypeTokens.coordSys) {
      result.push(HdXformSchemaTokens.xform)
    }

    if (type === HdPrimTypeTokens.drawTarget) {
      result.push(TfToken(HdPrimTypeTokens.drawTarget))
    }

    if (type === HdPrimTypeTokens.imageShader) {
      result.push(TfToken(HdPrimTypeTokens.imageShader))
    }

    result.push(HdSceneIndexEmulationTokens.sceneDelegate)

    return result
  }

  /** dataSourceLegacyPrim.cpp:2642-2688 */
  private _getPrimvarsDataSource(): HdDataSourceBase | undefined {
    if (this._primvarsBuilt) {
      return this._primvars
    }

    let primvarsDs: Hd_DataSourceLegacyPrimvarsContainer | undefined

    for (let interpolation = HdInterpolation.HdInterpolationConstant;
      interpolation < HdInterpolation.HdInterpolationCount; ++interpolation) {

      const v = this._sceneDelegate.getPrimvarDescriptors(this._id, interpolation)

      const interpolationToken = _InterpolationAsToken(interpolation)

      for (const primvarDesc of v) {
        if (!primvarsDs) {
          primvarsDs = Hd_DataSourceLegacyPrimvarsContainer.new(this._id, this._sceneDelegate)
        }
        primvarsDs.addDesc(
          TfToken(primvarDesc.name), interpolationToken, TfToken(primvarDesc.role),
          primvarDesc.indexed, primvarDesc.elementSize)
      }
    }

    this._primvars = primvarsDs
    this._primvarsBuilt = true

    return primvarsDs
  }

  /** dataSourceLegacyPrim.cpp:2690-2725 */
  private _getExtComputationPrimvarsDataSource(): HdDataSourceBase | undefined {
    if (this._extComputationPrimvarsBuilt) {
      return this._extComputationPrimvars
    }

    let primvarsDs: Hd_DataSourceLegacyExtComputationPrimvarsContainer | undefined

    for (let interpolation = HdInterpolation.HdInterpolationConstant;
      interpolation < HdInterpolation.HdInterpolationCount; ++interpolation) {
      const v = this._sceneDelegate.getExtComputationPrimvarDescriptors(
        this._id, interpolation)

      const interpolationToken = _InterpolationAsToken(interpolation)

      for (const primvarDesc of v) {
        if (!primvarsDs) {
          primvarsDs = Hd_DataSourceLegacyExtComputationPrimvarsContainer.new(this._id)
        }
        primvarsDs.addDesc(
          TfToken(primvarDesc.name), interpolationToken, TfToken(primvarDesc.role ?? ''),
          primvarDesc.sourceComputationId,
          TfToken(primvarDesc.sourceComputationOutputName),
          primvarDesc.valueType)
      }
    }

    this._extComputationPrimvars = primvarsDs
    this._extComputationPrimvarsBuilt = true
    return this._extComputationPrimvars
  }

  /** dataSourceLegacyPrim.cpp:2727-2747 */
  private _getMaterialBindingsDataSource(): HdDataSourceBase | undefined {
    const path = this._sceneDelegate.getMaterialId(this._id)
    if (path === '') {
      return undefined
    }
    const purposes = [
      HdMaterialBindingsSchemaTokens.allPurpose,
    ]
    const materialBindingSources: HdDataSourceBase[] = [
      new HdMaterialBindingSchema.Builder()
        .setPath(HdRetainedTypedSampledDataSource.new(path))
        .build(),
    ]

    return HdMaterialBindingsSchema.buildRetained(purposes, materialBindingSources)
  }

  /** dataSourceLegacyPrim.cpp:2749-2762 */
  private _getXformDataSource(): HdDataSourceBase | undefined {
    const t = new HdXformSchema.Builder()
      .setMatrix(
        Hd_DataSourceLegacyMatrixValue.new(this._type, this._id, this._sceneDelegate))
      .setResetXformStack(
        // Mark this transform as fully composed, since scene delegate
        // transforms are always fully composed.
        HdRetainedTypedSampledDataSource.new(true))
      .build()
    return t
  }

  /** dataSourceLegacyPrim.cpp:2764-2776 */
  private _getMaterialDataSource(): HdDataSourceBase | undefined {
    const materialContainer = this._sceneDelegate.getMaterialResource(this._id)

    // VtValue::IsHolding<HdMaterialNetworkMap>.
    const held = _Held(materialContainer)
    if (!(held instanceof HdMaterialNetworkMap)) {
      return undefined
    }

    const hdNetworkMap = held
    return HdUtils.convertHdMaterialNetworkToHdMaterialSchema(hdNetworkMap)
  }

  /** dataSourceLegacyPrim.cpp:2778-2783 */
  private _getIntegratorDataSource(): HdDataSourceBase | undefined {
    return _ConvertRenderTerminalResourceToHdDataSource(HdIntegratorSchema,
      this._sceneDelegate.Get(this._id, HdIntegratorSchemaTokens.resource))
  }

  /** dataSourceLegacyPrim.cpp:2785-2790 */
  private _getSampleFilterDataSource(): HdDataSourceBase | undefined {
    return _ConvertRenderTerminalResourceToHdDataSource(HdSampleFilterSchema,
      this._sceneDelegate.Get(this._id, HdSampleFilterSchemaTokens.resource))
  }

  /** dataSourceLegacyPrim.cpp:2792-2797 */
  private _getDisplayFilterDataSource(): HdDataSourceBase | undefined {
    return _ConvertRenderTerminalResourceToHdDataSource(HdDisplayFilterSchema,
      this._sceneDelegate.Get(this._id, HdDisplayFilterSchemaTokens.resource))
  }

  /** dataSourceLegacyPrim.cpp:2799-2803 */
  private _getDisplayStyleDataSource(): HdDataSourceBase | undefined {
    return Hd_DisplayStyleDataSource.new(this._sceneDelegate, this._id)
  }

  /** dataSourceLegacyPrim.cpp:2805-2818 */
  private _getInstancedByDataSource(): HdDataSourceBase | undefined {
    const instancerId = this._sceneDelegate.getInstancerId(this._id)
    if (instancerId === '') {
      return undefined
    }
    return new HdInstancedBySchema.Builder()
      .setPaths(HdRetainedTypedSampledDataSource.new([instancerId]))
      .build()
  }

  /** dataSourceLegacyPrim.cpp:2820-2839 */
  private _getInstancerTopologyDataSource(): HdDataSourceBase | undefined {
    let instancerTopology = this._instancerTopology

    if (instancerTopology) {
      return instancerTopology
    }

    instancerTopology = Hd_InstancerTopologyDataSource.new(this._id, this._sceneDelegate)

    this._instancerTopology = instancerTopology

    return instancerTopology
  }

  /** dataSourceLegacyPrim.cpp:2841-2860 */
  private _getVolumeFieldBindingDataSource(): HdDataSourceBase | undefined {
    const volumeFields = this._sceneDelegate.getVolumeFieldDescriptors(this._id)

    if (volumeFields.length === 0) {
      return undefined
    }

    const names: TfToken[] = []
    const paths: HdDataSourceBase[] = []
    for (const desc of volumeFields) {
      names.push(TfToken(desc.fieldName))
      paths.push(HdRetainedTypedSampledDataSource.new(desc.fieldId))
    }
    return HdVolumeFieldBindingSchema.buildRetained(names, paths)
  }

  /** dataSourceLegacyPrim.cpp:2862-2899 */
  private _getCoordSysBindingDataSource(): HdDataSourceBase | undefined {
    const coordSysBindings = this._sceneDelegate.getCoordSysBindings(this._id)

    if (coordSysBindings === null || coordSysBindings.length === 0) {
      return undefined
    }

    const names: TfToken[] = []
    const paths: HdDataSourceBase[] = []
    for (const path of coordSysBindings) {
      // Note: the scene delegate API just binds prims to unnamed
      // coord sys objects.  These coord sys objects have paths of the
      // form /path/to/object.coordSys:foo:binding, where "foo" is the name
      // the shader gets to access.  We pull these names out to store in the
      // schema.
      // XXX: Note that for backward compatibility of non-applied
      // UsdShadeCoordSysAPI api schema, a form like
      // /path/to/object.coordSys:foo is supporterd!
      const attrName = _PathGetName(path)
      const nameSpacedCoordSysName = attrName.endsWith(_tokens.binding)
        ? _TfStringGetBeforeSuffix(attrName, ':')
        : attrName
      names.push(TfToken(_StripPrefixNamespace(nameSpacedCoordSysName, _tokens.coordSys)))

      paths.push(HdRetainedTypedSampledDataSource.new(path))
    }
    return HdCoordSysBindingSchema.buildRetained(names, paths)
  }

  /** dataSourceLegacyPrim.cpp:2901-2920 */
  private _getVisibilityDataSource(): HdDataSourceBase | undefined {
    const vis = this._sceneDelegate.getVisible(this._id)
    if (vis) {
      _visOn ??= new HdVisibilitySchema.Builder()
        .setVisibility(HdRetainedTypedSampledDataSource.new(true))
        .build()
      return _visOn
    } else {
      _visOff ??= new HdVisibilitySchema.Builder()
        .setVisibility(HdRetainedTypedSampledDataSource.new(false))
        .build()
      return _visOff
    }
  }

  /** dataSourceLegacyPrim.cpp:2922-2931 */
  private _getPurposeDataSource(): HdDataSourceBase | undefined {
    const purpose = this._sceneDelegate.getRenderTag(this._id)
    return new HdPurposeSchema.Builder()
      .setPurpose(HdRetainedTypedSampledDataSource.new(purpose))
      .build()
  }

  /** dataSourceLegacyPrim.cpp:2933-2944 */
  private _getExtentDataSource(): HdDataSourceBase | undefined {
    const extent = this._sceneDelegate.getExtent(this._id)
    return new HdExtentSchema.Builder()
      .setMin(HdRetainedTypedSampledDataSource.new(new GfVec3d(extent.getMin())))
      .setMax(HdRetainedTypedSampledDataSource.new(new GfVec3d(extent.getMax())))
      .build()
  }

  /** dataSourceLegacyPrim.cpp:2946-2956 */
  private _getCategoriesDataSource(): HdDataSourceBase | undefined {
    const categories = this._sceneDelegate.getCategories(this._id)
    if (categories.length > 0) {
      return HdCategoriesSchema.buildRetained(categories, [])
    }
    return undefined
  }

  /** dataSourceLegacyPrim.cpp:2958-2968 */
  private _getInstanceCategoriesDataSource(): HdDataSourceBase | undefined {
    return new HdInstanceCategoriesSchema.Builder()
      .setCategoriesValues(Hd_InstanceCategoriesVectorDataSource.new(this._id, this._sceneDelegate))
      .build()
  }

  /** dataSourceLegacyPrim.cpp:2970-3059 */
  Get(name: TfToken | string): HdDataSourceBase | undefined {
    if (name === HdMeshSchemaTokens.mesh) {
      if (this._type === HdPrimTypeTokens.mesh) {
        return Hd_DataSourceMesh.new(this._id, this._sceneDelegate)
      }

    } else if (name === HdBasisCurvesSchemaTokens.basisCurves) {
      if (this._type === HdPrimTypeTokens.basisCurves) {
        return Hd_DataSourceBasisCurves.new(this._id, this._sceneDelegate)
      }
    } else if (name === HdPrimvarsSchemaTokens.primvars) {
      return this._getPrimvarsDataSource()
    } else if (name === HdExtComputationPrimvarsSchemaTokens.extComputationPrimvars) {
      return this._getExtComputationPrimvarsDataSource()
    } else if (name === HdMaterialBindingsSchema.getSchemaToken()) {
      return this._getMaterialBindingsDataSource()
    } else if (name === HdXformSchemaTokens.xform) {
      return this._getXformDataSource()
    } else if (name === HdMaterialSchemaTokens.material) {
      return this._getMaterialDataSource()
    } else if (name === HdLegacyDisplayStyleSchemaTokens.displayStyle) {
      return this._getDisplayStyleDataSource()
    } else if (name === HdSceneIndexEmulationTokens.sceneDelegate) {
      return HdRetainedTypedSampledDataSource.new<HdSceneDelegate>(this._sceneDelegate)
    } else if (name === HdInstancedBySchemaTokens.instancedBy) {
      return this._getInstancedByDataSource()
    } else if (name === HdInstancerTopologySchemaTokens.instancerTopology) {
      return this._getInstancerTopologyDataSource()
    } else if (name === HdVolumeFieldBindingSchemaTokens.volumeFieldBinding) {
      return this._getVolumeFieldBindingDataSource()
    } else if (name === HdCoordSysBindingSchemaTokens.coordSysBinding) {
      return this._getCoordSysBindingDataSource()
    } else if (name === HdVisibilitySchemaTokens.visibility) {
      return this._getVisibilityDataSource()
    } else if (name === HdPurposeSchemaTokens.purpose) {
      return this._getPurposeDataSource()
    } else if (name === HdExtentSchemaTokens.extent) {
      return this._getExtentDataSource()
    } else if (name === HdCameraSchemaTokens.camera) {
      return Hd_DataSourceCamera.new(this._id, this._sceneDelegate)
    } else if (name === HdLightSchemaTokens.light) {
      return Hd_DataSourceLight.new(this._id, this._sceneDelegate)
    } else if (name === HdCategoriesSchemaTokens.categories) {
      return this._getCategoriesDataSource()
    } else if (name === HdInstanceCategoriesSchemaTokens.instanceCategories) {
      return this._getInstanceCategoriesDataSource()
    } else if (name === HdRenderBufferSchemaTokens.renderBuffer) {
      return Hd_DataSourceRenderBuffer.new(this._sceneDelegate, this._id)
    } else if (name === HdRenderSettingsSchemaTokens.renderSettings) {
      return Hd_DataSourceRenderSettings.new(this._sceneDelegate, this._id)
    } else if (name === HdSampleFilterSchemaTokens.sampleFilter) {
      return this._getSampleFilterDataSource()
    } else if (name === HdIntegratorSchemaTokens.integrator) {
      return this._getIntegratorDataSource()
    } else if (name === HdDisplayFilterSchemaTokens.displayFilter) {
      return this._getDisplayFilterDataSource()
    } else if (name === HdVolumeFieldSchemaTokens.volumeField) {
      return Hd_DataSourceVolumeField.new(this._id, this._sceneDelegate)
    } else if (name === HdPrimTypeTokens.drawTarget) {
      return Hd_LegacyDrawTargetContainerDataSource.new(this._sceneDelegate, this._id)
    } else if (name === HdExtComputationSchemaTokens.extComputation) {
      return Hd_DataSourceLegacyExtComputation.new(this._id, this._sceneDelegate)
    } else if (name === HdImageShaderSchemaTokens.imageShader) {
      return Hd_DataSourceImageShader.new(this._id, this._sceneDelegate)
    } else if (name === HdCollectionsSchemaTokens.collections) {
      // Hydra 1.0 doesn't transport the USD notion of collections.
      // Instead, behaviors that leverage collections (e.g. light linking)
      // are implemented on the scene delegate end.
      //
      // Below, we "promote" membership expression attributes on the light or
      // light filter as collections. This bit of glue code helps unify
      // the light linking scene index handling for emulated and native
      // scene indices.
      //
      if (this._isLight()) {
        return Hd_DataSourceLightCollections.new(this._id, this._sceneDelegate)
      }
      if (this._type === HdPrimTypeTokens.lightFilter) {
        return Hd_DataSourceLightFilterCollections.new(this._id, this._sceneDelegate)
      }
    }

    return undefined
  }
}

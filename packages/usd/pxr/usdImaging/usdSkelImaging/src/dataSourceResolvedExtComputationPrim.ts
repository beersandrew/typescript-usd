// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdSkelImaging/dataSourceResolvedExtComputationPrim.cpp,
//  pxr/usdImaging/usdSkelImaging/dataSourceResolvedExtComputationPrim.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdSkelImaging/dataSourceResolvedExtComputationPrim.{h,cpp}
// (OpenUSD 26.11.1).

import {
  ContainerDataSource as HdContainerDataSource, ExtComputationInputComputationSchema as HdExtComputationInputComputationSchema,
  ExtComputationOutputSchema as HdExtComputationOutputSchema, ExtComputationSchema as HdExtComputationSchema,
  PrimvarsSchemaTokens as HdPrimvarsSchemaTokens, RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource, Type as HdType,
  TypedSampledDataSource as HdTypedSampledDataSource,
  type DataSourceBase as HdDataSourceBase, type PrimvarsSchema as HdPrimvarsSchema,
  type SampledDataSource as HdSampledDataSource,
} from 'typescript-usd/hd'
import { Tokens as UsdSkelTokens } from 'typescript-usd/usdSkel'
import { _UsdSkelImagingToArray } from './dataSourceUtils.ts'
import type { UsdSkelImagingDataSourceResolvedPointsBasedPrim } from './dataSourceResolvedPointsBasedPrim.ts'
import { UsdSkelImagingExtComputationCpuCallback, UsdSkelImagingExtComputationGlslKernel } from './extComputations.ts'
import type { UsdSkelImagingResolvedSkeletonSchema } from './resolvedSkeletonSchema.ts'
import {
  UsdSkelImagingExtAggregatorComputationInputNameTokens, UsdSkelImagingExtComputationInputNameTokens,
  UsdSkelImagingExtComputationNameTokens, UsdSkelImagingExtComputationOutputNameTokens,
  UsdSkelImagingExtComputationTypeTokens,
} from './tokens.ts'

/** dataSourceResolvedExtComputationPrim.h:17-18 */
export type UsdSkelImagingDataSourceResolvedPointsBasedPrimHandle =
  UsdSkelImagingDataSourceResolvedPointsBasedPrim

/** SdfPath::AppendChild for the string paths of this port. */
function _AppendChild(path: string, name: string): string {
  return path === '/' ? '/' + name : path + '/' + name
}

/** dataSourceResolvedExtComputationPrim.cpp:28-49 */
function _ExtComputationInputNamesForPoints(): string[] {
  const A = UsdSkelImagingExtAggregatorComputationInputNameTokens
  const result: string[] = []
  for (const name of A.allTokens) {
    if (name === A.restNormals) continue
    if (name === A.faceVertexIndices) continue
    if (name === A.hasFaceVaryingNormals) continue
    result.push(name)
  }
  return result
}

/** dataSourceResolvedExtComputationPrim.cpp:51-72 */
function _ExtComputationInputNamesForNormals(): string[] {
  const A = UsdSkelImagingExtAggregatorComputationInputNameTokens
  const result: string[] = []
  for (const name of A.allTokens) {
    if (name === A.restPoints) continue
    if (name === A.blendShapeOffsets) continue
    if (name === A.blendShapeOffsetRanges) continue
    if (name === A.numBlendShapeOffsetRanges) continue
    result.push(name)
  }
  return result
}

let _pointInputNames: string[] | undefined
let _normalInputNames: string[] | undefined
const _PointInputNames = (): string[] => _pointInputNames ??= _ExtComputationInputNamesForPoints()
const _NormalInputNames = (): string[] => _normalInputNames ??= _ExtComputationInputNamesForNormals()

/** dataSourceResolvedExtComputationPrim.cpp:74-164. Data source for locator
 *  extComputation:inputValues on skinningInputAggregatorComputation prim. */
class _ExtAggregatorComputationInputValuesDataSource extends HdContainerDataSource {
  private constructor(
    private readonly _resolvedPrimSource: UsdSkelImagingDataSourceResolvedPointsBasedPrimHandle,
    private readonly _computationType: string,
  ) { super() }

  static new(
    resolvedPrimSource: UsdSkelImagingDataSourceResolvedPointsBasedPrimHandle,
    computationType: string,
  ): _ExtAggregatorComputationInputValuesDataSource {
    return new _ExtAggregatorComputationInputValuesDataSource(resolvedPrimSource, computationType)
  }

  /** dataSourceResolvedExtComputationPrim.cpp:82-96 */
  getNames(): string[] {
    // TODO
    // We might wanna consider reusing HdSkinningInputTokens here.
    if (this._computationType === UsdSkelImagingExtComputationTypeTokens.points) {
      return _PointInputNames()
    } else {
      return _NormalInputNames()
    }
  }

  /** dataSourceResolvedExtComputationPrim.cpp:98-152 */
  Get(name: string): HdDataSourceBase | undefined {
    const A = UsdSkelImagingExtAggregatorComputationInputNameTokens
    const r = this._resolvedPrimSource
    if (name === A.restPoints) {
      return r.getPoints()
    }
    if (name === A.geomBindXform) {
      return r.getGeomBindTransform()
    }
    if (name === A.hasConstantInfluences) {
      return r.getHasConstantInfluences()
    }
    if (name === A.numInfluencesPerComponent) {
      return r.getNumInfluencesPerComponent()
    }
    if (name === A.influences) {
      return r.getInfluences()
    }
    if (name === A.blendShapeOffsets) {
      return r.getBlendShapeOffsets()
    }
    if (name === A.blendShapeOffsetRanges) {
      return r.getBlendShapeOffsetRanges()
    }
    if (name === A.numBlendShapeOffsetRanges) {
      return r.getNumBlendShapeOffsetRanges()
    }
    if (name === A.restNormals) {
      return r.getNormals()
    }
    if (name === A.faceVertexIndices) {
      return r.getFaceVertexIndices()
    }
    if (name === A.hasFaceVaryingNormals) {
      return r.getHasFaceVaryingNormals()
    }

    return undefined
  }
}

/** dataSourceResolvedExtComputationPrim.cpp:166-184 */
function _ExtComputationInputNamesForClassicLinear(): string[] {
  const I = UsdSkelImagingExtComputationInputNameTokens
  const result: string[] = []
  for (const name of I.allTokens) {
    if (name === I.skinningScaleXforms) continue
    if (name === I.skinningDualQuats) continue
    result.push(name)
  }
  return result
}

let _classicLinearInputNames: string[] | undefined

/** dataSourceResolvedExtComputationPrim.cpp:186-260 */
class _ExtComputationInputValuesDataSource extends HdContainerDataSource {
  private constructor(
    private readonly _resolvedPrimSource: UsdSkelImagingDataSourceResolvedPointsBasedPrimHandle,
  ) { super() }

  static new(
    resolvedPrimSource: UsdSkelImagingDataSourceResolvedPointsBasedPrimHandle,
  ): _ExtComputationInputValuesDataSource {
    return new _ExtComputationInputValuesDataSource(resolvedPrimSource)
  }

  /** dataSourceResolvedExtComputationPrim.cpp:191-202 */
  getNames(): string[] {
    // TODO
    // We might wanna consider reusing HdSkinningInputTokens here.
    if (this._isDualQuatSkinning()) {
      return [...UsdSkelImagingExtComputationInputNameTokens.allTokens]
    } else {
      return _classicLinearInputNames ??= _ExtComputationInputNamesForClassicLinear()
    }
  }

  /** dataSourceResolvedExtComputationPrim.cpp:204-240 */
  Get(name: string): HdDataSourceBase | undefined {
    const I = UsdSkelImagingExtComputationInputNameTokens
    if (name === I.commonSpaceToPrimLocal) {
      // Typed sampled data source holding inverse of xform:matrix from prim
      // from input scene.
      return this._resolvedPrimSource.getCommonSpaceToPrimLocal()
    }
    if (name === I.blendShapeWeights) {
      return this._resolvedPrimSource.getBlendShapeWeights()
    }
    if (name === I.skinningXforms) {
      return this._resolvedPrimSource.getSkinningTransforms()
    }
    if (name === I.skinningScaleXforms) {
      return this._isDualQuatSkinning()
        ? this._resolvedPrimSource.getSkinningScaleTransforms() : undefined
    }
    if (name === I.skinningDualQuats) {
      return this._isDualQuatSkinning()
        ? this._resolvedPrimSource.getSkinningDualQuats() : undefined
    }
    if (name === I.skelLocalToCommonSpace) {
      return this._getResolvedSkeletonSchema().getSkelLocalToCommonSpace()
    }

    return undefined
  }

  /** dataSourceResolvedExtComputationPrim.cpp:248-252 */
  private _getResolvedSkeletonSchema(): UsdSkelImagingResolvedSkeletonSchema {
    return this._resolvedPrimSource.getResolvedSkeletonSchema()
  }

  /** dataSourceResolvedExtComputationPrim.cpp:254-258 */
  private _isDualQuatSkinning(): boolean {
    return this._resolvedPrimSource.getSkinningMethod() === UsdSkelTokens.dualQuaternion
  }
}

/** dataSourceResolvedExtComputationPrim.cpp:262-314. Data source for
 *  locator extComputations:dispatchCount and extComputations:elementCount on
 *  skinningComputation prim. */
class _NumElementsDataSource extends HdTypedSampledDataSource<number> {
  private constructor(
    private readonly _primvars: HdPrimvarsSchema,
    private readonly _primvarName: string,
  ) { super() }

  static new(primvars: HdPrimvarsSchema, primvarName: string): _NumElementsDataSource {
    return new _NumElementsDataSource(primvars, primvarName)
  }

  /** dataSourceResolvedExtComputationPrim.cpp:273-283 */
  getTypedValue(shutterOffset: number): number {
    const ds = this._getPrimvarValue()
    if (!ds) {
      return 0
    }
    // VtValue::GetArraySize
    return _UsdSkelImagingToArray(ds.GetValue(shutterOffset)).length
  }

  /** dataSourceResolvedExtComputationPrim.cpp:285-298 */
  GetContributingSampleTimesForInterval(
    startTime: number, endTime: number, outSampleTimes: number[],
  ): boolean {
    const ds = this._getPrimvarValue()
    if (!ds) {
      return false
    }
    return ds.GetContributingSampleTimesForInterval(startTime, endTime, outSampleTimes)
  }

  /** dataSourceResolvedExtComputationPrim.cpp:307-310 */
  private _getPrimvarValue(): HdSampledDataSource | undefined {
    return this._primvars.getPrimvar(this._primvarName).getPrimvarValue()
  }
}

/** dataSourceResolvedExtComputationPrim.cpp:316-332. Prim data source
 *  skinningInputAggregatorComputation prim. */
function _ExtAggregatorComputationPrimDataSource(
  resolvedPrimSource: UsdSkelImagingDataSourceResolvedPointsBasedPrimHandle,
  computationType: string,
): HdContainerDataSource {
  return HdRetainedContainerDataSource.new(
    [HdExtComputationSchema.getSchemaToken()],
    [new HdExtComputationSchema.Builder()
      .setInputValues(
        _ExtAggregatorComputationInputValuesDataSource.new(
          resolvedPrimSource, computationType))
      .build()])
}

/** dataSourceResolvedExtComputationPrim.cpp:334-381. Data source for locator
 *  extComputation:inputComputations on skinningComputation prim. */
function _ExtComputationInputComputations(
  primPath: string,
  computationType: string,
): HdContainerDataSource {
  const names = computationType === UsdSkelImagingExtComputationTypeTokens.points
    ? _PointInputNames()
    : _NormalInputNames()

  const computationName = computationType === UsdSkelImagingExtComputationTypeTokens.points
    ? UsdSkelImagingExtComputationNameTokens.pointsAggregatorComputation
    : UsdSkelImagingExtComputationNameTokens.normalsAggregatorComputation

  const pathSrc = HdRetainedTypedSampledDataSource.new<string>(
    _AppendChild(primPath, computationName))

  const values: HdDataSourceBase[] = []

  for (const name of names) {
    values.push(
      new HdExtComputationInputComputationSchema.Builder()
        .setSourceComputation(pathSrc)
        .setSourceComputationOutputName(HdRetainedTypedSampledDataSource.new<string>(name))
        .build())
  }

  // HdExtComputationInputComputationContainerSchema::BuildRetained
  return HdRetainedContainerDataSource.new([...names], values)
}

/** dataSourceResolvedExtComputationPrim.cpp:383-405. Data source for locator
 *  extComputation:outputs on skinningComputation prim. */
function _ExtComputationOutputs(computationType: string): HdContainerDataSource {
  const computationOutput = computationType === UsdSkelImagingExtComputationTypeTokens.points
    ? UsdSkelImagingExtComputationOutputNameTokens.skinnedPoints
    : UsdSkelImagingExtComputationOutputNameTokens.skinnedNormals
  // HdExtComputationOutputContainerSchema::BuildRetained
  return HdRetainedContainerDataSource.new(
    [computationOutput],
    [new HdExtComputationOutputSchema.Builder()
      .setValueType(
        HdRetainedTypedSampledDataSource.new({ type: HdType.HdTypeFloatVec3, count: 1 }))
      .build()])
}

/** dataSourceResolvedExtComputationPrim.cpp:407-451. Prim data source
 *  skinningComputation prim. */
function _ExtComputationPrimDataSource(
  resolvedPrimSource: UsdSkelImagingDataSourceResolvedPointsBasedPrimHandle,
  computationType: string,
): HdContainerDataSource {
  const primvarName = computationType === UsdSkelImagingExtComputationTypeTokens.points
    ? HdPrimvarsSchemaTokens.points
    : HdPrimvarsSchemaTokens.normals
  const elementCount = _NumElementsDataSource.new(
    resolvedPrimSource.getPrimvars(), primvarName)

  return HdRetainedContainerDataSource.new(
    [HdExtComputationSchema.getSchemaToken()],
    [new HdExtComputationSchema.Builder()
      .setInputValues(
        _ExtComputationInputValuesDataSource.new(resolvedPrimSource))
      .setInputComputations(
        _ExtComputationInputComputations(
          resolvedPrimSource.getPrimPath(), computationType))
      .setOutputs(
        _ExtComputationOutputs(computationType))
      .setGlslKernel(
        UsdSkelImagingExtComputationGlslKernel(
          resolvedPrimSource.getSkinningMethod(), computationType))
      .setCpuCallback(
        UsdSkelImagingExtComputationCpuCallback(
          resolvedPrimSource.getSkinningMethod()))
      .setDispatchCount(elementCount)
      .setElementCount(elementCount)
      .build()])
}

/** dataSourceResolvedExtComputationPrim.cpp:455-494. Returns a data source
 *  for an ext computation prim of a skinned prim.
 *
 *  Used by the points resolving scene index. That scene index adds the ext
 *  computations as children of the skinned prim with name computationName. */
export function UsdSkelImagingDataSourceResolvedExtComputationPrim(
  resolvedPrimSource: UsdSkelImagingDataSourceResolvedPointsBasedPrimHandle,
  computationName: string,
): HdContainerDataSource | undefined {
  const N = UsdSkelImagingExtComputationNameTokens
  const T = UsdSkelImagingExtComputationTypeTokens
  if (computationName === N.pointsComputation) {
    return _ExtComputationPrimDataSource(resolvedPrimSource, T.points)
  }
  if (computationName === N.normalsComputation) {
    return _ExtComputationPrimDataSource(resolvedPrimSource, T.normals)
  }
  if (computationName === N.pointsAggregatorComputation) {
    return _ExtAggregatorComputationPrimDataSource(resolvedPrimSource, T.points)
  }
  if (computationName === N.normalsAggregatorComputation) {
    return _ExtAggregatorComputationPrimDataSource(resolvedPrimSource, T.normals)
  }

  return undefined
}

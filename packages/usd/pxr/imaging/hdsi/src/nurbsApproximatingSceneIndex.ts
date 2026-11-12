// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdsi/nurbsApproximatingSceneIndex.cpp,
//  pxr/imaging/hdsi/nurbsApproximatingSceneIndex.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/imaging/hdsi/nurbsApproximatingSceneIndex.{h,cpp}.
//
// Divergences:
// - The namespaces _NurbsCurvesToBasisCurves and _NurbsPatchToMesh are
//   module-level objects of functions and classes.
// - The function-local statics (data sources and locators) are module-level
//   lazily initialized values.
// - HdIntDataSource::Cast / HdBoolDataSource::Cast are
//   `instanceof HdTypedSampledDataSource` (a usdImaging attribute data source
//   is not one of the typed aliases of dataSource.ts).

import { OpenSubdivTokens as PxOsdOpenSubdivTokens } from 'typescript-usd/pxOsd'
import {
  BasisCurvesSchemaTokens as HdBasisCurvesSchemaTokens,
  BasisCurvesTopologySchema as HdBasisCurvesTopologySchema,
  BasisCurvesTopologySchemaTokens as HdBasisCurvesTopologySchemaTokens,
  BlockDataSource as HdBlockDataSource,
  ContainerDataSource as HdContainerDataSource,
  DataSourceLocator as HdDataSourceLocator,
  DependenciesSchemaTokens as HdDependenciesSchemaTokens,
  DependencySchema as HdDependencySchema,
  GetMergedContributingSampleTimesForInterval as HdGetMergedContributingSampleTimesForInterval,
  MeshSchema as HdMeshSchema,
  MeshSchemaTokens as HdMeshSchemaTokens,
  MeshTopologySchemaTokens as HdMeshTopologySchemaTokens,
  NurbsCurvesSchema as HdNurbsCurvesSchema,
  NurbsCurvesSchemaTokens as HdNurbsCurvesSchemaTokens,
  NurbsPatchSchema as HdNurbsPatchSchema,
  NurbsPatchSchemaTokens as HdNurbsPatchSchemaTokens,
  OverlayContainerDataSource as HdOverlayContainerDataSource,
  PrimTypeTokens as HdPrimTypeTokens,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  SingleInputFilteringSceneIndexBase as HdSingleInputFilteringSceneIndexBase,
  Tokens as HdTokens,
  TypedSampledDataSource as HdTypedSampledDataSource,
} from 'typescript-usd/hd'
import type {
  AddedPrimEntry,
  BoolDataSource as HdBoolDataSource,
  DataSourceBase as HdDataSourceBase,
  DirtiedPrimEntry,
  IntDataSource as HdIntDataSource,
  LocatorDataSource as HdLocatorDataSource,
  RemovedPrimEntry,
  SampledDataSource as HdSampledDataSource,
  SceneIndexBase as HdSceneIndexBase,
  SceneIndexPrim as HdSceneIndexPrim,
  TokenDataSource as HdTokenDataSource,
} from 'typescript-usd/hd'

type Time = number

/** HdBoolDataSource::Cast */
function _BoolCast(ds: HdDataSourceBase | undefined): HdBoolDataSource | undefined {
  return ds instanceof HdTypedSampledDataSource ? ds as HdBoolDataSource : undefined
}

// ----------------------------------------------------------------------------
// nurbsApproximatingSceneIndex.cpp:25-141 namespace _NurbsCurvesToBasisCurves

// To convert a nurbsCurves prim to a basisCurves prim, we compute a data source
// for locator basisCurves using the data from the data source at locator
// nurbsCurves.

// The only data we actually use from nurbsCurves is the curveVertexCounts.

let _curveVertexCountsSourceLocator: HdDataSourceLocator | undefined
/** nurbsApproximatingSceneIndex.cpp:34-36 */
function _CurveVertexCountsSourceLocator(): HdDataSourceLocator {
  return _curveVertexCountsSourceLocator ??=
    HdNurbsCurvesSchema.getDefaultLocator().append(
      HdNurbsCurvesSchemaTokens.curveVertexCounts)
}

let _curvesDependedOnLocatorDataSource: HdLocatorDataSource | undefined
let _curvesAffectedLocatorDataSource: HdLocatorDataSource | undefined
let _curvesLinearDataSource: HdTokenDataSource | undefined
let _curvesNonperiodicDataSource: HdTokenDataSource | undefined
let _nurbsCurvesBlockDataSource: HdBlockDataSource | undefined

/** Data source for basisCurves/topology,
 *  nurbsApproximatingSceneIndex.cpp:65-114. */
class _BasisCurvesTopologyDataSource extends HdContainerDataSource {
  static new(primDataSource: HdContainerDataSource | undefined): _BasisCurvesTopologyDataSource {
    return new _BasisCurvesTopologyDataSource(primDataSource)
  }

  /** nurbsApproximatingSceneIndex.cpp:107-111 */
  private constructor(private readonly _primDataSource: HdContainerDataSource | undefined) {
    super()
  }

  /** nurbsApproximatingSceneIndex.cpp:72-80 */
  getNames(): string[] {
    return [
      HdBasisCurvesTopologySchemaTokens.curveVertexCounts,
      HdBasisCurvesTopologySchemaTokens.basis,
      HdBasisCurvesTopologySchemaTokens.type,
      HdBasisCurvesTopologySchemaTokens.wrap,
    ]
  }

  /** nurbsApproximatingSceneIndex.cpp:82-104 */
  Get(name: string): HdDataSourceBase | undefined {
    if (name === HdBasisCurvesTopologySchemaTokens.curveVertexCounts) {
      return HdContainerDataSource.Get(
        this._primDataSource, _CurveVertexCountsSourceLocator())
    }

    if (name === HdBasisCurvesTopologySchemaTokens.basis ||
        name === HdBasisCurvesTopologySchemaTokens.type) {
      return _curvesLinearDataSource ??=
        HdRetainedTypedSampledDataSource.new<string>(HdTokens.linear)
    }

    if (name === HdBasisCurvesTopologySchemaTokens.wrap) {
      return _curvesNonperiodicDataSource ??=
        HdRetainedTypedSampledDataSource.new<string>(HdTokens.nonperiodic)
    }

    return undefined
  }
}

const _NurbsCurvesToBasisCurves = {
  /** Data source for __dependencies.
   *
   *  Only dependency is curveVertexCounts which we computed for basisCurves
   *  from nurbsCurves. nurbsApproximatingSceneIndex.cpp:38-64 */
  _computeDependenciesDataSource(primPath: string): HdDataSourceBase {
    const dependedOnPrimPathDataSource =
      HdRetainedTypedSampledDataSource.new<string>(primPath)
    const dependedOnLocatorDataSource = _curvesDependedOnLocatorDataSource ??=
      HdRetainedTypedSampledDataSource.new<HdDataSourceLocator>(
        _CurveVertexCountsSourceLocator())
    const affectedLocatorDataSource = _curvesAffectedLocatorDataSource ??=
      HdRetainedTypedSampledDataSource.new<HdDataSourceLocator>(
        HdBasisCurvesTopologySchema.getDefaultLocator().append(
          HdBasisCurvesTopologySchemaTokens.curveVertexCounts))

    return HdRetainedContainerDataSource.new(
      [HdBasisCurvesTopologySchemaTokens.curveVertexCounts],
      [new HdDependencySchema.Builder()
        .setDependedOnPrimPath(dependedOnPrimPathDataSource)
        .setDependedOnDataSourceLocator(dependedOnLocatorDataSource)
        .setAffectedDataSourceLocator(affectedLocatorDataSource)
        .build()])
  },

  /** nurbsApproximatingSceneIndex.cpp:116-139 */
  _computePrimDataSource(
    primPath: string,
    primDataSource: HdContainerDataSource | undefined,
  ): HdContainerDataSource {
    const nurbsCurvesDataSource = _nurbsCurvesBlockDataSource ??=
      HdBlockDataSource.new()
    const basisCurvesDataSource =
      HdRetainedContainerDataSource.new(
        [HdBasisCurvesTopologySchemaTokens.topology],
        [_BasisCurvesTopologyDataSource.new(primDataSource)])
    const dependenciesDataSource =
      _NurbsCurvesToBasisCurves._computeDependenciesDataSource(primPath)

    return HdOverlayContainerDataSource.new(
      HdRetainedContainerDataSource.new(
        [HdNurbsCurvesSchemaTokens.nurbsCurves,
          HdBasisCurvesSchemaTokens.basisCurves,
          HdDependenciesSchemaTokens.__dependencies],
        [nurbsCurvesDataSource,
          basisCurvesDataSource,
          dependenciesDataSource]),
      primDataSource)
  },
}

// ----------------------------------------------------------------------------
// nurbsApproximatingSceneIndex.cpp:143-408 namespace _NurbsPatchToMesh

// To convert a nurbsPatch prim to a mesh prim, we create a data source for
// locator mesh using the data from the data source at locator nurbsPatch.

// nurbsApproximatingSceneIndex.cpp:149-152
const _tokens = {
  basisCurvesToMesh: 'basisCurvesToMesh',
} as const

let _patchDependedOnLocatorDataSource: HdLocatorDataSource | undefined
let _patchAffectedLocatorDataSource: HdLocatorDataSource | undefined
let _patchOrientationLocator: HdDataSourceLocator | undefined
let _patchDoubleSidedLocator: HdDataSourceLocator | undefined
let _patchSubdivisionSchemeDs: HdTokenDataSource | undefined
let _nurbsPatchBlockDataSource: HdBlockDataSource | undefined

/** Get the data sources for uVertexCount and vVertexCount from nurbsPath.
 *  nurbsApproximatingSceneIndex.cpp:181-187 */
function _GetUVVertexCountDataSources(
  primDataSource: HdContainerDataSource | undefined,
): [HdIntDataSource | undefined, HdIntDataSource | undefined] {
  const schema = HdNurbsPatchSchema.getFromParent(primDataSource)
  return [schema.getUVertexCount(), schema.getVVertexCount()]
}

/** Get the uVertexCount and vVertexCount from nurbsPath.
 *  nurbsApproximatingSceneIndex.cpp:189-200 */
function _GetUVVertexCounts(
  primDataSource: HdContainerDataSource | undefined,
  shutterOffset: Time,
): [number, number] {
  const sources = _GetUVVertexCountDataSources(primDataSource)

  return [
    sources[0] ? Number(sources[0].getTypedValue(shutterOffset)) : 0,
    sources[1] ? Number(sources[1].getTypedValue(shutterOffset)) : 0]
}

/** Implements HdSampledDataSource::GetContributingSampleTimesForInterval for
 *  data sources that depend on the uVertexCount and vVertexCount of
 *  nurbsPath. nurbsApproximatingSceneIndex.cpp:202-216 */
function _GetMergedContributingSampleTimesForIntervalForTopology(
  primDataSource: HdContainerDataSource | undefined,
  startTime: Time,
  endTime: Time,
  outSampleTimes: Time[] | undefined,
): boolean {
  const sources = _GetUVVertexCountDataSources(primDataSource)
  const srcs: (HdSampledDataSource | undefined)[] = [sources[0], sources[1]]
  return HdGetMergedContributingSampleTimesForInterval(
    srcs, startTime, endTime, outSampleTimes)
}

/** Data source for locator mesh/topology/faceVertexCounts,
 *  nurbsApproximatingSceneIndex.cpp:218-256 */
class _FaceVertexCountsDataSource extends HdTypedSampledDataSource<number[]> {
  static new(primDataSource: HdContainerDataSource | undefined): _FaceVertexCountsDataSource {
    return new _FaceVertexCountsDataSource(primDataSource)
  }

  /** nurbsApproximatingSceneIndex.cpp:249-253 */
  private constructor(private readonly _primDataSource: HdContainerDataSource | undefined) {
    super()
  }

  /** nurbsApproximatingSceneIndex.cpp:224-226 */
  override GetValue(shutterOffset: Time): number[] {
    return this.getTypedValue(shutterOffset)
  }

  /** nurbsApproximatingSceneIndex.cpp:228-237 */
  getTypedValue(shutterOffset: Time): number[] {
    const [uVertexCount, vVertexCount] =
      _GetUVVertexCounts(this._primDataSource, shutterOffset)

    const numFaces =
      Math.max(0, uVertexCount - 1) * Math.max(0, vVertexCount - 1)

    return new Array<number>(numFaces).fill(4)
  }

  /** nurbsApproximatingSceneIndex.cpp:239-246 */
  GetContributingSampleTimesForInterval(
    startTime: Time,
    endTime: Time,
    outSampleTimes: Time[] | undefined,
  ): boolean {
    return _GetMergedContributingSampleTimesForIntervalForTopology(
      this._primDataSource, startTime, endTime, outSampleTimes)
  }
}

/** Data source for locator mesh/topology/faceVertexIndices,
 *  nurbsApproximatingSceneIndex.cpp:258-315 */
class _FaceVertexIndicesDataSource extends HdTypedSampledDataSource<number[]> {
  static new(primDataSource: HdContainerDataSource | undefined): _FaceVertexIndicesDataSource {
    return new _FaceVertexIndicesDataSource(primDataSource)
  }

  /** nurbsApproximatingSceneIndex.cpp:308-312 */
  private constructor(private readonly _primDataSource: HdContainerDataSource | undefined) {
    super()
  }

  /** nurbsApproximatingSceneIndex.cpp:264-266 */
  override GetValue(shutterOffset: Time): number[] {
    return this.getTypedValue(shutterOffset)
  }

  /** nurbsApproximatingSceneIndex.cpp:268-296 */
  getTypedValue(shutterOffset: Time): number[] {
    const [uVertexCount, vVertexCount] =
      _GetUVVertexCounts(this._primDataSource, shutterOffset)

    const numFaces =
      Math.max(0, uVertexCount - 1) * Math.max(0, vVertexCount - 1)
    const numIndices =
      4 * numFaces

    const result = new Array<number>(numIndices).fill(0)

    if (numIndices === 0) {
      return result
    }

    for (let row = 0; row < vVertexCount - 1; ++row) {
      for (let col = 0; col < uVertexCount - 1; ++col) {
        const faceIdx = row * (uVertexCount - 1) + col
        const vertexIdx = row * uVertexCount + col
        result[4 * faceIdx] = vertexIdx
        result[4 * faceIdx + 1] = vertexIdx + 1
        result[4 * faceIdx + 2] = vertexIdx + uVertexCount + 1
        result[4 * faceIdx + 3] = vertexIdx + uVertexCount
      }
    }

    return result
  }

  /** nurbsApproximatingSceneIndex.cpp:298-305 */
  GetContributingSampleTimesForInterval(
    startTime: Time,
    endTime: Time,
    outSampleTimes: Time[] | undefined,
  ): boolean {
    return _GetMergedContributingSampleTimesForIntervalForTopology(
      this._primDataSource, startTime, endTime, outSampleTimes)
  }
}

/** Data source for locator mesh/topology,
 *  nurbsApproximatingSceneIndex.cpp:317-356 */
class _MeshTopologyDataSource extends HdContainerDataSource {
  static new(primDataSource: HdContainerDataSource | undefined): _MeshTopologyDataSource {
    return new _MeshTopologyDataSource(primDataSource)
  }

  /** nurbsApproximatingSceneIndex.cpp:349-353 */
  private constructor(private readonly _primDataSource: HdContainerDataSource | undefined) {
    super()
  }

  /** nurbsApproximatingSceneIndex.cpp:323-329 */
  getNames(): string[] {
    return [
      HdMeshTopologySchemaTokens.faceVertexCounts,
      HdMeshTopologySchemaTokens.faceVertexIndices,
      HdMeshTopologySchemaTokens.orientation]
  }

  /** nurbsApproximatingSceneIndex.cpp:331-346 */
  Get(name: string): HdDataSourceBase | undefined {
    if (name === HdMeshTopologySchemaTokens.faceVertexCounts) {
      return _FaceVertexCountsDataSource.new(this._primDataSource)
    }
    if (name === HdMeshTopologySchemaTokens.faceVertexIndices) {
      return _FaceVertexIndicesDataSource.new(this._primDataSource)
    }
    if (name === HdMeshTopologySchemaTokens.orientation) {
      const locator = _patchOrientationLocator ??=
        HdNurbsPatchSchema.getDefaultLocator()
          .append(HdNurbsPatchSchemaTokens.orientation)
      return HdContainerDataSource.Get(this._primDataSource, locator)
    }

    return undefined
  }
}

const _NurbsPatchToMesh = {
  /** Data source for __dependencies.
   *
   *  We nuke all of mesh whenever anything underneath nurbsPatch gets
   *  dirtied. nurbsApproximatingSceneIndex.cpp:154-179 */
  _computeDependenciesDataSource(primPath: string): HdDataSourceBase {
    const dependedOnPrimPathDataSource =
      HdRetainedTypedSampledDataSource.new<string>(primPath)
    const dependedOnLocatorDataSource = _patchDependedOnLocatorDataSource ??=
      HdRetainedTypedSampledDataSource.new<HdDataSourceLocator>(
        HdNurbsPatchSchema.getDefaultLocator())
    const affectedLocatorDataSource = _patchAffectedLocatorDataSource ??=
      HdRetainedTypedSampledDataSource.new<HdDataSourceLocator>(
        HdMeshSchema.getDefaultLocator())

    return HdRetainedContainerDataSource.new(
      [_tokens.basisCurvesToMesh],
      [new HdDependencySchema.Builder()
        .setDependedOnPrimPath(dependedOnPrimPathDataSource)
        .setDependedOnDataSourceLocator(dependedOnLocatorDataSource)
        .setAffectedDataSourceLocator(affectedLocatorDataSource)
        .build()])
  },

  /** Data source for locator mesh,
   *  nurbsApproximatingSceneIndex.cpp:358-383 */
  _computeMeshDataSource(primDataSource: HdContainerDataSource | undefined): HdDataSourceBase {
    const topologyDs =
      _MeshTopologyDataSource.new(primDataSource)

    const subdivisionSchemeDs = _patchSubdivisionSchemeDs ??=
      HdRetainedTypedSampledDataSource.new<string>(
        PxOsdOpenSubdivTokens.catmullClark)

    const doubleSidedLocator = _patchDoubleSidedLocator ??=
      HdNurbsPatchSchema.getDefaultLocator()
        .append(HdNurbsPatchSchemaTokens.doubleSided)
    const doubleSidedDs =
      _BoolCast(
        HdContainerDataSource.Get(
          primDataSource, doubleSidedLocator))

    return new HdMeshSchema.Builder()
      .setTopology(topologyDs)
      .setSubdivisionScheme(subdivisionSchemeDs)
      .setDoubleSided(doubleSidedDs)
      .build()
  },

  /** nurbsApproximatingSceneIndex.cpp:385-406 */
  _computePrimDataSource(
    primPath: string,
    primDataSource: HdContainerDataSource | undefined,
  ): HdContainerDataSource {
    const nurbsPatchDataSource = _nurbsPatchBlockDataSource ??=
      HdBlockDataSource.new()
    const meshDataSource =
      _NurbsPatchToMesh._computeMeshDataSource(primDataSource)
    const dependenciesDataSource =
      _NurbsPatchToMesh._computeDependenciesDataSource(primPath)

    return HdOverlayContainerDataSource.new(
      HdRetainedContainerDataSource.new(
        [HdNurbsPatchSchemaTokens.nurbsPatch,
          HdMeshSchemaTokens.mesh,
          HdDependenciesSchemaTokens.__dependencies],
        [nurbsPatchDataSource,
          meshDataSource,
          dependenciesDataSource]),
      primDataSource)
  },
}

// ----------------------------------------------------------------------------

/** nurbsApproximatingSceneIndex.h:17-52
 *
 *  Converts prims of type nurbsCurves and nurbsPatches to basisCurves and
 *  mesh, respectively. The result is only an approximation for clients that
 *  do not natively supports nurbs. */
export class HdsiNurbsApproximatingSceneIndex extends HdSingleInputFilteringSceneIndexBase {
  /** nurbsApproximatingSceneIndex.cpp:410-417 */
  static new(inputSceneIndex: HdSceneIndexBase): HdsiNurbsApproximatingSceneIndex {
    return new HdsiNurbsApproximatingSceneIndex(inputSceneIndex)
  }

  /** nurbsApproximatingSceneIndex.cpp:419-423 */
  protected constructor(inputSceneIndex: HdSceneIndexBase) {
    super(inputSceneIndex)
  }

  /** nurbsApproximatingSceneIndex.cpp:425-443 */
  getPrim(primPath: string): HdSceneIndexPrim {
    const prim = this._getInputSceneIndex().getPrim(primPath)
    if (prim.primType === HdPrimTypeTokens.nurbsCurves) {
      return {
        primType: HdPrimTypeTokens.basisCurves,
        dataSource: _NurbsCurvesToBasisCurves._computePrimDataSource(
          primPath, prim.dataSource) }
    }
    if (prim.primType === HdPrimTypeTokens.nurbsPatch) {
      return {
        primType: HdPrimTypeTokens.mesh,
        dataSource: _NurbsPatchToMesh._computePrimDataSource(
          primPath, prim.dataSource) }
    }

    return prim
  }

  /** nurbsApproximatingSceneIndex.cpp:445-449 */
  getChildPrimPaths(primPath: string): string[] {
    return this._getInputSceneIndex().getChildPrimPaths(primPath)
  }

  /** nurbsApproximatingSceneIndex.cpp:451-488 */
  protected _primsAdded(_sender: HdSceneIndexBase, entries: AddedPrimEntry[]): void {
    if (!this._isObserved()) {
      return
    }

    // Replace nurbsCurves by basisCurves
    //         nurbsPatch  by mesh

    const indices: number[] = []
    for (let i = 0; i < entries.length; i++) {
      const primType = entries[i]!.primType
      if (primType === HdPrimTypeTokens.nurbsCurves ||
          primType === HdPrimTypeTokens.nurbsPatch) {
        indices.push(i)
      }
    }

    if (indices.length === 0) {
      this._sendPrimsAdded(entries)
      return
    }

    const newEntries: AddedPrimEntry[] = entries.map((e) => ({ ...e }))
    for (const i of indices) {
      const entry = newEntries[i]!
      if (entry.primType === HdPrimTypeTokens.nurbsCurves) {
        entry.primType = HdPrimTypeTokens.basisCurves
      } else {
        entry.primType = HdPrimTypeTokens.mesh
      }
    }

    this._sendPrimsAdded(newEntries)
  }

  /** nurbsApproximatingSceneIndex.cpp:490-500 */
  protected _primsRemoved(_sender: HdSceneIndexBase, entries: RemovedPrimEntry[]): void {
    if (!this._isObserved()) {
      return
    }

    this._sendPrimsRemoved(entries)
  }

  /** nurbsApproximatingSceneIndex.cpp:502-512 */
  protected _primsDirtied(_sender: HdSceneIndexBase, entries: DirtiedPrimEntry[]): void {
    if (!this._isObserved()) {
      return
    }

    this._sendPrimsDirtied(entries)
  }
}

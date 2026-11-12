// Ported from OpenUSD 26.11.1: pxr/imaging/hdsi/implicitSurfaceSceneIndex.cpp,
//  pxr/imaging/hdsi/implicitSurfaceSceneIndex.h
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/imaging/hdsi/implicitSurfaceSceneIndex.{h,cpp}.
//
// Divergences:
// - HdDoubleDataSource::Cast / HdTokenDataSource::Cast are
//   `instanceof HdTypedSampledDataSource` (a usdImaging attribute data source
//   is not one of the typed aliases of dataSource.ts).
// - The function-local statics (topologies, locators, role/interpolation
//   data sources) are module-level lazily initialized values.
// - The per-shape namespaces (_CubeToMesh, ...) are module-level objects of
//   functions and classes.
// - TRACE_FUNCTION_SCOPE is not ported.

import {
  Matrix4d as GfMatrix4d,
  Vec3d as GfVec3d,
  Vec3f as GfVec3f,
  Vec4d as GfVec4d,
} from 'typescript-usd/gf'
import { Array as VtArray, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { MakeTokens as TfMakeTokens, Type as TfType } from 'typescript-usd/tf'
import type { MeshTopology as PxOsdMeshTopology } from 'typescript-usd/pxOsd'
import {
  CapsuleMeshGenerator as GeomUtilCapsuleMeshGenerator,
  ConeMeshGenerator as GeomUtilConeMeshGenerator,
  CuboidMeshGenerator as GeomUtilCuboidMeshGenerator,
  CylinderMeshGenerator as GeomUtilCylinderMeshGenerator,
  PlaneMeshGenerator as GeomUtilPlaneMeshGenerator,
  PointIter as GeomUtilPointIter,
  SphereMeshGenerator as GeomUtilSphereMeshGenerator,
} from 'typescript-usd/geomUtil'
import {
  BlockDataSource as HdBlockDataSource,
  CapsuleSchema as HdCapsuleSchema,
  CapsuleSchemaTokens as HdCapsuleSchemaTokens,
  ConeSchema as HdConeSchema,
  ConeSchemaTokens as HdConeSchemaTokens,
  ContainerDataSource as HdContainerDataSource,
  CubeSchema as HdCubeSchema,
  CubeSchemaTokens as HdCubeSchemaTokens,
  CylinderSchema as HdCylinderSchema,
  CylinderSchemaTokens as HdCylinderSchemaTokens,
  DataSourceLocator as HdDataSourceLocator,
  DependenciesSchema as HdDependenciesSchema,
  DependenciesSchemaTokens as HdDependenciesSchemaTokens,
  DependencySchema as HdDependencySchema,
  GetMergedContributingSampleTimesForInterval as HdGetMergedContributingSampleTimesForInterval,
  MeshSchema as HdMeshSchema,
  MeshSchemaTokens as HdMeshSchemaTokens,
  MeshTopologySchema as HdMeshTopologySchema,
  MeshTopologySchemaTokens as HdMeshTopologySchemaTokens,
  OverlayContainerDataSource as HdOverlayContainerDataSource,
  PlaneSchema as HdPlaneSchema,
  PlaneSchemaTokens as HdPlaneSchemaTokens,
  PrimTypeTokens as HdPrimTypeTokens,
  PrimvarSchema as HdPrimvarSchema,
  PrimvarSchemaTokens as HdPrimvarSchemaTokens,
  PrimvarsSchema as HdPrimvarsSchema,
  PrimvarsSchemaTokens as HdPrimvarsSchemaTokens,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  SingleInputFilteringSceneIndexBase as HdSingleInputFilteringSceneIndexBase,
  SphereSchema as HdSphereSchema,
  SphereSchemaTokens as HdSphereSchemaTokens,
  TypedSampledDataSource as HdTypedSampledDataSource,
  XformSchema as HdXformSchema,
  XformSchemaTokens as HdXformSchemaTokens,
} from 'typescript-usd/hd'
import type {
  AddedPrimEntry,
  BoolDataSource as HdBoolDataSource,
  DataSourceBase as HdDataSourceBase,
  DirtiedPrimEntry,
  LocatorDataSource as HdLocatorDataSource,
  MatrixDataSource as HdMatrixDataSource,
  RemovedPrimEntry,
  SampledDataSource as HdSampledDataSource,
  SceneIndexBase as HdSceneIndexBase,
  SceneIndexPrim as HdSceneIndexPrim,
  TokenDataSource as HdTokenDataSource,
} from 'typescript-usd/hd'

/** implicitSurfaceSceneIndex.h:16-21 HDSI_IMPLICIT_SURFACE_SCENE_INDEX_TOKENS */
export const HdsiImplicitSurfaceSceneIndexTokens = TfMakeTokens({
  toMesh: 'toMesh',
  axisToTransform: 'axisToTransform',
})

// implicitSurfaceSceneIndex.cpp:44-52
const _tokens = {
  xAxis: 'X',
  yAxis: 'Y',
  zAxis: 'Z',

  implicitToMesh: 'implicitToMesh',
  implicitToXform: 'implicitToXform',
} as const

type Time = number
type _DoubleDataSource = HdTypedSampledDataSource<number>
type _TokenDataSource = HdTypedSampledDataSource<string>

/** HdDoubleDataSource::Cast */
function _DoubleCast(ds: HdDataSourceBase | undefined): _DoubleDataSource | undefined {
  return ds instanceof HdTypedSampledDataSource ? ds as _DoubleDataSource : undefined
}

/** HdTokenDataSource::Cast */
function _TokenCast(ds: HdDataSourceBase | undefined): _TokenDataSource | undefined {
  return ds instanceof HdTypedSampledDataSource ? ds as _TokenDataSource : undefined
}

/** HdBoolDataSource::Cast */
function _BoolCast(ds: HdDataSourceBase | undefined): HdBoolDataSource | undefined {
  return ds instanceof HdTypedSampledDataSource ? ds as HdBoolDataSource : undefined
}

/** implicitSurfaceSceneIndex.cpp:57-83 */
function _GetBasis(axis: string): GfMatrix4d {
  let u: GfVec4d, v: GfVec4d, spine: GfVec4d
  if (axis === _tokens.xAxis) {
    u = GfVec4d.yAxis()
    v = GfVec4d.zAxis()
    spine = GfVec4d.xAxis()
  } else if (axis === _tokens.yAxis) {
    u = GfVec4d.zAxis()
    v = GfVec4d.xAxis()
    spine = GfVec4d.yAxis()
  } else { // (axis == _tokens->zAxis)
    u = GfVec4d.xAxis()
    v = GfVec4d.yAxis()
    spine = GfVec4d.zAxis()
  }

  const basis = new GfMatrix4d()
  basis.setRow(0, u)
  basis.setRow(1, v)
  basis.setRow(2, spine)
  basis.setRow(3, GfVec4d.wAxis())

  return basis
}

/** The default locator of a Hydra schema (the template parameter S). */
interface _Schema {
  getDefaultLocator(): HdDataSourceLocator
}

let _pointsAffectedLocatorDataSource: HdLocatorDataSource | undefined

/** implicitSurfaceSceneIndex.cpp:87-111 */
function _ComputePointsDependenciesDataSource(S: _Schema, primPath: string): HdContainerDataSource {
  const dependedOnPrimPathDataSource =
    HdRetainedTypedSampledDataSource.new<string>(primPath)
  const dependedOnLocatorDataSource =
    HdRetainedTypedSampledDataSource.new<HdDataSourceLocator>(S.getDefaultLocator())
  const affectedLocatorDataSource = _pointsAffectedLocatorDataSource ??=
    HdRetainedTypedSampledDataSource.new<HdDataSourceLocator>(
      HdPrimvarsSchema.getPointsLocator().append(
        HdPrimvarSchemaTokens.primvarValue))

  return HdRetainedContainerDataSource.new(
    [_tokens.implicitToMesh],
    [new HdDependencySchema.Builder()
      .setDependedOnPrimPath(dependedOnPrimPathDataSource)
      .setDependedOnDataSourceLocator(dependedOnLocatorDataSource)
      .setAffectedDataSourceLocator(affectedLocatorDataSource)
      .build()])
}

let _matrixAffectedLocatorDataSource: HdLocatorDataSource | undefined

/** implicitSurfaceSceneIndex.cpp:113-138 */
function _ComputeMatrixDependenciesDataSource(S: _Schema, primPath: string): HdContainerDataSource {
  const dependedOnPrimPathDataSource =
    HdRetainedTypedSampledDataSource.new<string>(primPath)
  const dependedOnLocatorDataSource =
    HdRetainedTypedSampledDataSource.new<HdDataSourceLocator>(S.getDefaultLocator())
  const affectedLocatorDataSource = _matrixAffectedLocatorDataSource ??=
    HdRetainedTypedSampledDataSource.new<HdDataSourceLocator>(
      HdXformSchema.getDefaultLocator()
        .append(HdXformSchemaTokens.matrix))

  return HdRetainedContainerDataSource.new(
    [_tokens.implicitToXform],
    [new HdDependencySchema.Builder()
      .setDependedOnPrimPath(dependedOnPrimPathDataSource)
      .setDependedOnDataSourceLocator(dependedOnLocatorDataSource)
      .setAffectedDataSourceLocator(affectedLocatorDataSource)
      .build()])
}

/** VtIntArray, the value type of the topology's
 *  HdRetainedTypedSampledDataSource<VtIntArray> (e.g.
 *  implicitSurfaceSceneIndex.cpp:156-161). */
const _VtIntArrayType = TfType.declare('int[]')

/** The HdMeshSchema container every `_ComputeMeshDataSource` builds from a
 *  generated topology (e.g. implicitSurfaceSceneIndex.cpp:148-172). */
function _MeshDataSource(
  topology: PxOsdMeshTopology,
  doubleSided: HdBoolDataSource | undefined,
): HdContainerDataSource {
  return new HdMeshSchema.Builder()
    .setTopology(
      new HdMeshTopologySchema.Builder()
        .setFaceVertexCounts(
          new HdRetainedTypedSampledDataSource<number[]>(
            topology.getFaceVertexCounts(), _VtIntArrayType))
        .setFaceVertexIndices(
          new HdRetainedTypedSampledDataSource<number[]>(
            topology.getFaceVertexIndices(), _VtIntArrayType))
        .setOrientation(
          HdRetainedTypedSampledDataSource.new<string>(
            HdMeshTopologySchemaTokens.rightHanded))
        .build())
    .setSubdivisionScheme(
      HdRetainedTypedSampledDataSource.new<string>(
        topology.getScheme()))
    .setDoubleSided(doubleSided)
    .build()
}

let _roleDataSource: HdTokenDataSource | undefined
let _interpolationDataSource: HdTokenDataSource | undefined

/** The `_ComputePointsPrimvarDataSource` of each shape
 *  (e.g. implicitSurfaceSceneIndex.cpp:229-246). */
function _ComputePointsPrimvarDataSource(pointsDataSource: HdSampledDataSource): HdContainerDataSource {
  const roleDataSource = _roleDataSource ??=
    HdPrimvarSchema.buildRoleDataSource(
      HdPrimvarSchemaTokens.point)
  const interpolationDataSource = _interpolationDataSource ??=
    HdPrimvarSchema.buildInterpolationDataSource(
      HdPrimvarSchemaTokens.vertex)

  return new HdPrimvarSchema.Builder()
    .setRole(roleDataSource)
    .setInterpolation(interpolationDataSource)
    .setPrimvarValue(pointsDataSource)
    .build()
}

/** The `_ComputePrimvarsDataSource` of each shape
 *  (e.g. implicitSurfaceSceneIndex.cpp:248-255). */
function _ComputePrimvarsDataSource(pointsDataSource: HdSampledDataSource): HdContainerDataSource {
  return HdRetainedContainerDataSource.new(
    [HdPrimvarsSchemaTokens.points],
    [_ComputePointsPrimvarDataSource(pointsDataSource)])
}

/** The `_ComputePrimDataSource` of each shape converted to a mesh
 *  (e.g. implicitSurfaceSceneIndex.cpp:257-281): the implicit schema is
 *  blocked and the mesh, points primvar and dependency on the implicit
 *  schema are overlaid on the prim's data source. */
function _ComputeMeshPrimDataSource(
  schemaToken: string,
  meshDataSource: HdDataSourceBase,
  primvarsDataSource: HdDataSourceBase,
  dependenciesDataSource: HdDataSourceBase,
  primDataSource: HdContainerDataSource | undefined,
): HdContainerDataSource {
  return HdOverlayContainerDataSource.new(
    HdRetainedContainerDataSource.new(
      [schemaToken,
        HdMeshSchema.getSchemaToken(),
        HdPrimvarsSchema.getSchemaToken(),
        HdDependenciesSchema.getSchemaToken()],
      [_blockDataSource ??= HdBlockDataSource.new(),
        meshDataSource,
        primvarsDataSource,
        dependenciesDataSource]),
    primDataSource)
}

// The `static HdDataSourceBaseHandle const <shape>DataSource =
// HdBlockDataSource::New()` of each _ComputePrimDataSource.
let _blockDataSource: HdBlockDataSource | undefined

/** A points primvar value: HdVec3fArrayDataSource (VtVec3fArray). */
abstract class _PointsDataSourceBase extends HdTypedSampledDataSource<VtArray<GfVec3f>> {
  constructor(protected readonly _primDataSource: HdContainerDataSource | undefined) {
    super()
  }

  /** e.g. implicitSurfaceSceneIndex.cpp:179-181 */
  override GetValue(shutterOffset: Time): VtArray<GfVec3f> {
    return this.getTypedValue(shutterOffset)
  }

  /** The double at `locator` under the prim, or `fallback`. */
  protected _getDouble(source: _DoubleDataSource | undefined, shutterOffset: Time, fallback: number): number {
    if (source) {
      return Number(source.getTypedValue(shutterOffset))
    }
    return fallback
  }

  protected _getDoubleSource(locator: HdDataSourceLocator): _DoubleDataSource | undefined {
    return _DoubleCast(HdContainerDataSource.Get(this._primDataSource, locator))
  }

  protected _getTokenSource(locator: HdDataSourceLocator): _TokenDataSource | undefined {
    return _TokenCast(HdContainerDataSource.Get(this._primDataSource, locator))
  }

  /** VtVec3fArray points(numPoints) */
  protected static _points(numPoints: number): GfVec3f[] {
    return Array.from({ length: numPoints }, () => new GfVec3f(0, 0, 0))
  }

  protected static _vtVec3fArray(points: GfVec3f[]): VtArray<GfVec3f> {
    return new VtArray<GfVec3f>(points, VtValueTypes.GfVec3f)
  }
}

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

// Cube

namespace _CubeToMesh {

let _meshDataSource: HdContainerDataSource | undefined

/** implicitSurfaceSceneIndex.cpp:146-172 */
function _ComputeMeshDataSource(): HdContainerDataSource {
  return _MeshDataSource(
    GeomUtilCuboidMeshGenerator.generateTopology(),
    HdRetainedTypedSampledDataSource.new<boolean>(false))
}

const _sizeLocator = (): HdDataSourceLocator =>
  new HdDataSourceLocator(HdCubeSchemaTokens.cube, HdCubeSchemaTokens.size)

/** implicitSurfaceSceneIndex.cpp:174-227 */
class _PointsDataSource extends _PointsDataSourceBase {
  static new(primDataSource: HdContainerDataSource | undefined): _PointsDataSource {
    return new _PointsDataSource(primDataSource)
  }

  getTypedValue(shutterOffset: Time): VtArray<GfVec3f> {
    const numPoints =
      GeomUtilCuboidMeshGenerator.computeNumPoints()
    const points = _PointsDataSourceBase._points(numPoints)

    const size = this._getSize(shutterOffset)

    GeomUtilCuboidMeshGenerator.generatePoints(
      GeomUtilPointIter.Vec3f(points),
      size, size, size,
    )

    return _PointsDataSourceBase._vtVec3fArray(points)
  }

  GetContributingSampleTimesForInterval(
    startTime: Time, endTime: Time, outSampleTimes: Time[],
  ): boolean {
    const s = this._getSizeSource()
    if (s) {
      return s.GetContributingSampleTimesForInterval(
        startTime, endTime, outSampleTimes)
    }
    return false
  }

  private _getSizeSource(): _DoubleDataSource | undefined {
    return this._getDoubleSource(_sizeLocator())
  }

  private _getSize(shutterOffset: Time): number {
    return this._getDouble(this._getSizeSource(), shutterOffset, 1.0)
  }
}

/** implicitSurfaceSceneIndex.cpp:257-281 */
export function _ComputePrimDataSource(
  primPath: string,
  primDataSource: HdContainerDataSource | undefined,
): HdContainerDataSource {
  return _ComputeMeshPrimDataSource(
    HdCubeSchema.getSchemaToken(),
    _meshDataSource ??= _ComputeMeshDataSource(),
    _ComputePrimvarsDataSource(_PointsDataSource.new(primDataSource)),
    _ComputePointsDependenciesDataSource(HdCubeSchema, primPath),
    primDataSource)
}

} // namespace _CubeToMesh

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

// Cone

namespace _ConeToMesh {

const numRadial = 10

let _meshDataSource: HdContainerDataSource | undefined

/** implicitSurfaceSceneIndex.cpp:296-320 */
function _ComputeMeshDataSource(): HdContainerDataSource {
  return _MeshDataSource(
    GeomUtilConeMeshGenerator.generateTopology(numRadial),
    HdRetainedTypedSampledDataSource.new<boolean>(false))
}

/** implicitSurfaceSceneIndex.cpp:322-411 */
class _PointsDataSource extends _PointsDataSourceBase {
  static new(primDataSource: HdContainerDataSource | undefined): _PointsDataSource {
    return new _PointsDataSource(primDataSource)
  }

  getTypedValue(shutterOffset: Time): VtArray<GfVec3f> {
    const basis = _GetBasis(this._getAxis(shutterOffset))
    const numPoints =
      GeomUtilConeMeshGenerator.computeNumPoints(numRadial)
    const points = _PointsDataSourceBase._points(numPoints)

    GeomUtilConeMeshGenerator.generatePoints(
      GeomUtilPointIter.Vec3f(points),
      numRadial,
      this._getRadius(shutterOffset),
      this._getHeight(shutterOffset),
      basis,
    )

    return _PointsDataSourceBase._vtVec3fArray(points)
  }

  GetContributingSampleTimesForInterval(
    startTime: Time, endTime: Time, outSampleTimes: Time[],
  ): boolean {
    const sources = [
      this._getHeightSource(), this._getRadiusSource(), this._getAxisSource()]
    return HdGetMergedContributingSampleTimesForInterval(
      sources, startTime, endTime, outSampleTimes)
  }

  private _getHeightSource(): _DoubleDataSource | undefined {
    return this._getDoubleSource(
      HdConeSchema.getDefaultLocator().append(HdConeSchemaTokens.height))
  }

  private _getHeight(shutterOffset: Time): number {
    return this._getDouble(this._getHeightSource(), shutterOffset, 1.0)
  }

  private _getRadiusSource(): _DoubleDataSource | undefined {
    return this._getDoubleSource(
      HdConeSchema.getDefaultLocator().append(HdConeSchemaTokens.radius))
  }

  private _getRadius(shutterOffset: Time): number {
    return this._getDouble(this._getRadiusSource(), shutterOffset, 1.0)
  }

  private _getAxisSource(): _TokenDataSource | undefined {
    return this._getTokenSource(
      HdConeSchema.getDefaultLocator().append(HdConeSchemaTokens.axis))
  }

  private _getAxis(shutterOffset: Time): string {
    const s = this._getAxisSource()
    if (s) {
      return s.getTypedValue(shutterOffset)
    }
    return HdConeSchemaTokens.X
  }
}

/** implicitSurfaceSceneIndex.cpp:441-465 */
export function _ComputePrimDataSource(
  primPath: string,
  primDataSource: HdContainerDataSource | undefined,
): HdContainerDataSource {
  return _ComputeMeshPrimDataSource(
    HdConeSchema.getSchemaToken(),
    _meshDataSource ??= _ComputeMeshDataSource(),
    _ComputePrimvarsDataSource(_PointsDataSource.new(primDataSource)),
    _ComputePointsDependenciesDataSource(HdConeSchema, primPath),
    primDataSource)
}

} // namespace _ConeToMesh

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

// Cylinder

namespace _CylinderToMesh {

const numRadial = 10

let _meshDataSource: HdContainerDataSource | undefined

/** implicitSurfaceSceneIndex.cpp:479-503 */
function _ComputeMeshDataSource(): HdContainerDataSource {
  return _MeshDataSource(
    GeomUtilCylinderMeshGenerator.generateTopology(numRadial),
    HdRetainedTypedSampledDataSource.new<boolean>(false))
}

/** implicitSurfaceSceneIndex.cpp:505-645 */
class _PointsDataSource extends _PointsDataSourceBase {
  static new(primDataSource: HdContainerDataSource | undefined): _PointsDataSource {
    return new _PointsDataSource(primDataSource)
  }

  getTypedValue(shutterOffset: Time): VtArray<GfVec3f> {
    const basis = _GetBasis(this._getAxis(shutterOffset))
    const numPoints =
      GeomUtilCylinderMeshGenerator.computeNumPoints(numRadial)
    const points = _PointsDataSourceBase._points(numPoints)

    GeomUtilCylinderMeshGenerator.generatePoints(
      GeomUtilPointIter.Vec3f(points),
      numRadial,
      this._getRadiusBottom(shutterOffset),
      this._getRadiusTop(shutterOffset),
      this._getHeight(shutterOffset),
      basis,
    )

    return _PointsDataSourceBase._vtVec3fArray(points)
  }

  GetContributingSampleTimesForInterval(
    startTime: Time, endTime: Time, outSampleTimes: Time[],
  ): boolean {
    // Note contributing sources also include radius source for backward
    // compatibility with cylinder schema with just 1 radius.
    const sources = [
      this._getHeightSource(), this._getRadiusSource(), this._getRadiusBottomSource(),
      this._getRadiusTopSource(), this._getAxisSource()]
    return HdGetMergedContributingSampleTimesForInterval(
      sources, startTime, endTime, outSampleTimes)
  }

  private _getHeightSource(): _DoubleDataSource | undefined {
    return this._getDoubleSource(new HdDataSourceLocator(
      HdCylinderSchema.getSchemaToken(),
      HdCylinderSchemaTokens.height))
  }

  private _getHeight(shutterOffset: Time): number {
    return this._getDouble(this._getHeightSource(), shutterOffset, 2.0)
  }

  // Deprecated
  private _getRadiusSource(): _DoubleDataSource | undefined {
    return this._getDoubleSource(new HdDataSourceLocator(
      HdCylinderSchema.getSchemaToken(),
      HdCylinderSchemaTokens.radius))
  }

  private _getRadiusBottomSource(): _DoubleDataSource | undefined {
    return this._getDoubleSource(new HdDataSourceLocator(
      HdCylinderSchema.getSchemaToken(),
      HdCylinderSchemaTokens.radiusBottom))
  }

  private _getRadiusBottom(shutterOffset: Time): number {
    const s = this._getRadiusBottomSource()
    if (s) {
      return Number(s.getTypedValue(shutterOffset))
    }
    // Fallback to old cylinder schema - deprecated
    return this._getDouble(this._getRadiusSource(), shutterOffset, 1.0)
  }

  private _getRadiusTopSource(): _DoubleDataSource | undefined {
    return this._getDoubleSource(new HdDataSourceLocator(
      HdCylinderSchema.getSchemaToken(),
      HdCylinderSchemaTokens.radiusTop))
  }

  private _getRadiusTop(shutterOffset: Time): number {
    const s = this._getRadiusTopSource()
    if (s) {
      return Number(s.getTypedValue(shutterOffset))
    }
    // Fallback to old cylinder schema - deprecated
    return this._getDouble(this._getRadiusSource(), shutterOffset, 1.0)
  }

  private _getAxisSource(): _TokenDataSource | undefined {
    return this._getTokenSource(new HdDataSourceLocator(
      HdCylinderSchema.getSchemaToken(),
      HdCylinderSchemaTokens.axis))
  }

  private _getAxis(shutterOffset: Time): string {
    const s = this._getAxisSource()
    if (s) {
      return s.getTypedValue(shutterOffset)
    }
    return HdCylinderSchemaTokens.Z
  }
}

/** implicitSurfaceSceneIndex.cpp:675-699 */
export function _ComputePrimDataSource(
  primPath: string,
  primDataSource: HdContainerDataSource | undefined,
): HdContainerDataSource {
  return _ComputeMeshPrimDataSource(
    HdCylinderSchema.getSchemaToken(),
    _meshDataSource ??= _ComputeMeshDataSource(),
    _ComputePrimvarsDataSource(_PointsDataSource.new(primDataSource)),
    _ComputePointsDependenciesDataSource(HdCylinderSchema, primPath),
    primDataSource)
}

} // namespace _CylinderToMesh

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

// Sphere

namespace _SphereToMesh {

const numRadial = 10
const numAxial = 10

let _meshDataSource: HdContainerDataSource | undefined

/** implicitSurfaceSceneIndex.cpp:711-735 */
function _ComputeMeshDataSource(): HdContainerDataSource {
  return _MeshDataSource(
    GeomUtilSphereMeshGenerator.generateTopology(numRadial, numAxial),
    HdRetainedTypedSampledDataSource.new<boolean>(false))
}

const _radiusLocator = (): HdDataSourceLocator =>
  new HdDataSourceLocator(HdSphereSchemaTokens.sphere, HdSphereSchemaTokens.radius)

/** implicitSurfaceSceneIndex.cpp:737-791 */
class _PointsDataSource extends _PointsDataSourceBase {
  static new(primDataSource: HdContainerDataSource | undefined): _PointsDataSource {
    return new _PointsDataSource(primDataSource)
  }

  getTypedValue(shutterOffset: Time): VtArray<GfVec3f> {
    const numPoints =
      GeomUtilSphereMeshGenerator.computeNumPoints(numRadial, numAxial)
    const points = _PointsDataSourceBase._points(numPoints)

    GeomUtilSphereMeshGenerator.generatePoints(
      GeomUtilPointIter.Vec3f(points),
      numRadial,
      numAxial,
      this._getRadius(shutterOffset),
    )

    return _PointsDataSourceBase._vtVec3fArray(points)
  }

  GetContributingSampleTimesForInterval(
    startTime: Time, endTime: Time, outSampleTimes: Time[],
  ): boolean {
    const s = this._getRadiusSource()
    if (s) {
      return s.GetContributingSampleTimesForInterval(
        startTime, endTime, outSampleTimes)
    }
    return false
  }

  private _getRadiusSource(): _DoubleDataSource | undefined {
    return this._getDoubleSource(_radiusLocator())
  }

  private _getRadius(shutterOffset: Time): number {
    return this._getDouble(this._getRadiusSource(), shutterOffset, 1.0)
  }
}

/** implicitSurfaceSceneIndex.cpp:821-845 */
export function _ComputePrimDataSource(
  primPath: string,
  primDataSource: HdContainerDataSource | undefined,
): HdContainerDataSource {
  return _ComputeMeshPrimDataSource(
    HdSphereSchemaTokens.sphere,
    _meshDataSource ??= _ComputeMeshDataSource(),
    _ComputePrimvarsDataSource(_PointsDataSource.new(primDataSource)),
    _ComputePointsDependenciesDataSource(HdSphereSchema, primPath),
    primDataSource)
}

} // namespace _SphereToMesh

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

// Capsule

namespace _CapsuleToMesh {

// Number of radial segments (about the spine axis)
const numRadial = 10
// Number of axial divisions for each hemispherical cap (along the spine axis)
const numCapAxial = 4

let _meshDataSource: HdContainerDataSource | undefined

/** implicitSurfaceSceneIndex.cpp:861-885 */
function _ComputeMeshDataSource(): HdContainerDataSource {
  return _MeshDataSource(
    GeomUtilCapsuleMeshGenerator.generateTopology(numRadial, numCapAxial),
    HdRetainedTypedSampledDataSource.new<boolean>(false))
}

/** implicitSurfaceSceneIndex.cpp:887-1028 */
class _PointsDataSource extends _PointsDataSourceBase {
  static new(primDataSource: HdContainerDataSource | undefined): _PointsDataSource {
    return new _PointsDataSource(primDataSource)
  }

  getTypedValue(shutterOffset: Time): VtArray<GfVec3f> {
    const basis = _GetBasis(this._getAxis(shutterOffset))
    const numPoints = GeomUtilCapsuleMeshGenerator.computeNumPoints(
      numRadial, numCapAxial)

    const points = _PointsDataSourceBase._points(numPoints)
    GeomUtilCapsuleMeshGenerator.generatePoints(
      GeomUtilPointIter.Vec3f(points),
      numRadial,
      numCapAxial,
      this._getRadiusBottom(shutterOffset),
      this._getRadiusTop(shutterOffset),
      this._getHeight(shutterOffset),
      basis,
    )

    return _PointsDataSourceBase._vtVec3fArray(points)
  }

  GetContributingSampleTimesForInterval(
    startTime: Time, endTime: Time, outSampleTimes: Time[],
  ): boolean {
    // Note contributing sources also include radius source for backward
    // compatibility with cylinder schema with just 1 radius.
    const sources = [
      this._getHeightSource(), this._getRadiusSource(), this._getRadiusBottomSource(),
      this._getRadiusTopSource(), this._getAxisSource()]
    return HdGetMergedContributingSampleTimesForInterval(
      sources, startTime, endTime, outSampleTimes)
  }

  private _getHeightSource(): _DoubleDataSource | undefined {
    return this._getDoubleSource(new HdDataSourceLocator(
      HdCapsuleSchema.getSchemaToken(),
      HdCapsuleSchemaTokens.height))
  }

  private _getHeight(shutterOffset: Time): number {
    return this._getDouble(this._getHeightSource(), shutterOffset, 1.0)
  }

  private _getRadiusSource(): _DoubleDataSource | undefined {
    return this._getDoubleSource(new HdDataSourceLocator(
      HdCapsuleSchema.getSchemaToken(), HdCapsuleSchemaTokens.radius))
  }

  private _getRadiusBottomSource(): _DoubleDataSource | undefined {
    return this._getDoubleSource(new HdDataSourceLocator(
      HdCapsuleSchema.getSchemaToken(),
      HdCapsuleSchemaTokens.radiusBottom))
  }

  private _getRadiusBottom(shutterOffset: Time): number {
    const s = this._getRadiusBottomSource()
    if (s) {
      return Number(s.getTypedValue(shutterOffset))
    }
    // Fallback to old cylinder schema - deprecated
    return this._getDouble(this._getRadiusSource(), shutterOffset, 0.5)
  }

  private _getRadiusTopSource(): _DoubleDataSource | undefined {
    return this._getDoubleSource(new HdDataSourceLocator(
      HdCapsuleSchema.getSchemaToken(),
      HdCapsuleSchemaTokens.radiusTop))
  }

  private _getRadiusTop(shutterOffset: Time): number {
    const s = this._getRadiusTopSource()
    if (s) {
      return Number(s.getTypedValue(shutterOffset))
    }
    // Fallback to old cylinder schema - deprecated
    return this._getDouble(this._getRadiusSource(), shutterOffset, 0.5)
  }

  private _getAxisSource(): _TokenDataSource | undefined {
    return this._getTokenSource(new HdDataSourceLocator(
      HdCapsuleSchema.getSchemaToken(),
      HdCapsuleSchemaTokens.axis))
  }

  private _getAxis(shutterOffset: Time): string {
    const s = this._getAxisSource()
    if (s) {
      return s.getTypedValue(shutterOffset)
    }
    return HdCapsuleSchemaTokens.Z
  }
}

/** implicitSurfaceSceneIndex.cpp:1058-1082 */
export function _ComputePrimDataSource(
  primPath: string,
  primDataSource: HdContainerDataSource | undefined,
): HdContainerDataSource {
  return _ComputeMeshPrimDataSource(
    HdCapsuleSchema.getSchemaToken(),
    _meshDataSource ??= _ComputeMeshDataSource(),
    _ComputePrimvarsDataSource(_PointsDataSource.new(primDataSource)),
    _ComputePointsDependenciesDataSource(HdCapsuleSchema, primPath),
    primDataSource)
}

} // namespace _CapsuleToMesh

/** implicitSurfaceSceneIndex.cpp:1143-1165 and 1239-1261
 *  _GetAdjustmentMatrix: the permutation taking the Z-aligned implicit to
 *  `axis`. */
function _GetAdjustmentMatrix(axis: string): GfMatrix4d {
  if (axis === HdConeSchemaTokens.X) {
    return new GfMatrix4d(0.0, 1.0, 0.0, 0.0,
                          0.0, 0.0, 1.0, 0.0,
                          1.0, 0.0, 0.0, 0.0,
                          0.0, 0.0, 0.0, 1.0)
  }
  if (axis === HdConeSchemaTokens.Y) {
    return new GfMatrix4d(0.0, 0.0, 1.0, 0.0,
                          1.0, 0.0, 0.0, 0.0,
                          0.0, 1.0, 0.0, 0.0,
                          0.0, 0.0, 0.0, 1.0)
  }
  return new GfMatrix4d(1.0)
}

/** A matrix data source of the axisToTransform conversions
 *  (HdMatrixDataSource). */
abstract class _MatrixDataSourceBase extends HdTypedSampledDataSource<GfMatrix4d> {
  constructor(protected readonly _primDataSource: HdContainerDataSource | undefined) {
    super()
  }

  override GetValue(shutterOffset: Time): GfMatrix4d {
    return this.getTypedValue(shutterOffset)
  }

  protected _getMatrixSource(): HdMatrixDataSource | undefined {
    return HdXformSchema.getFromParent(this._primDataSource).getMatrix()
  }

  protected _getMatrix(shutterOffset: Time): GfMatrix4d {
    const src = this._getMatrixSource()
    if (src) {
      return src.getTypedValue(shutterOffset)
    }
    return new GfMatrix4d(1.0)
  }

  protected _getAxisFrom(locator: HdDataSourceLocator, shutterOffset: Time): string {
    const src = _TokenCast(HdContainerDataSource.Get(this._primDataSource, locator))
    if (src) {
      return src.getTypedValue(shutterOffset)
    }
    return ''
  }
}

/** The `_ComputePrimDataSource` of the axisToTransform conversions
 *  (implicitSurfaceSceneIndex.cpp:1168-1189 and 1279-1299). */
function _ComputeTransformedPrimDataSource(
  matrixDataSource: HdMatrixDataSource,
  dependenciesDataSource: HdDataSourceBase,
  primDataSource: HdContainerDataSource | undefined,
): HdContainerDataSource {
  const xformSrc =
    new HdXformSchema.Builder()
      .setMatrix(matrixDataSource)
      .build()

  return HdOverlayContainerDataSource.new(
    HdRetainedContainerDataSource.new(
      [HdXformSchemaTokens.xform, HdDependenciesSchemaTokens.__dependencies],
      [xformSrc, dependenciesDataSource]),
    primDataSource)
}

namespace _CylinderToTransformedCylinder {

const _axisLocator = (): HdDataSourceLocator =>
  new HdDataSourceLocator(HdCylinderSchema.getSchemaToken(), HdCylinderSchemaTokens.axis)

/** implicitSurfaceSceneIndex.cpp:1088-1166 */
class _MatrixDataSource extends _MatrixDataSourceBase {
  static new(primDataSource: HdContainerDataSource | undefined): _MatrixDataSource {
    return new _MatrixDataSource(primDataSource)
  }

  getTypedValue(shutterOffset: Time): GfMatrix4d {
    return _GetAdjustmentMatrix(this._getAxis(shutterOffset))
      .getMultiply(this._getMatrix(shutterOffset))
  }

  GetContributingSampleTimesForInterval(
    startTime: Time, endTime: Time, outSampleTimes: Time[],
  ): boolean {
    const sources: (HdSampledDataSource | undefined)[] = [
      this._getMatrixSource(), this._getAxisSource()]
    return HdGetMergedContributingSampleTimesForInterval(
      sources, startTime, endTime, outSampleTimes)
  }

  private _getAxisSource(): _TokenDataSource | undefined {
    return _TokenCast(HdContainerDataSource.Get(this._primDataSource, _axisLocator()))
  }

  private _getAxis(shutterOffset: Time): string {
    return this._getAxisFrom(_axisLocator(), shutterOffset)
  }
}

/** implicitSurfaceSceneIndex.cpp:1168-1189 */
export function _ComputePrimDataSource(
  primPath: string,
  primDataSource: HdContainerDataSource | undefined,
): HdContainerDataSource {
  return _ComputeTransformedPrimDataSource(
    _MatrixDataSource.new(primDataSource),
    _ComputeMatrixDependenciesDataSource(HdCylinderSchema, primPath),
    primDataSource)
}

} // namespace _CylinderToTransformedCylinder

namespace _ConeToTransformedCone {

const _axisLocator = (): HdDataSourceLocator =>
  new HdDataSourceLocator(HdConeSchemaTokens.cone, HdConeSchemaTokens.axis)
const _heightLocator = (): HdDataSourceLocator =>
  new HdDataSourceLocator(HdConeSchemaTokens.cone, HdConeSchemaTokens.height)

/** implicitSurfaceSceneIndex.cpp:1196-1276 */
class _MatrixDataSource extends _MatrixDataSourceBase {
  static new(primDataSource: HdContainerDataSource | undefined): _MatrixDataSource {
    return new _MatrixDataSource(primDataSource)
  }

  getTypedValue(shutterOffset: Time): GfMatrix4d {
    return this._getHeightOffsetMatrix(shutterOffset)
      .getMultiply(_GetAdjustmentMatrix(this._getAxis(shutterOffset)))
      .getMultiply(this._getMatrix(shutterOffset))
  }

  GetContributingSampleTimesForInterval(
    startTime: Time, endTime: Time, outSampleTimes: Time[],
  ): boolean {
    const sources: (HdSampledDataSource | undefined)[] = [
      this._getMatrixSource(), this._getAxisSource(), this._getHeightSource()]
    return HdGetMergedContributingSampleTimesForInterval(
      sources, startTime, endTime, outSampleTimes)
  }

  private _getAxisSource(): _TokenDataSource | undefined {
    return _TokenCast(HdContainerDataSource.Get(this._primDataSource, _axisLocator()))
  }

  private _getAxis(shutterOffset: Time): string {
    return this._getAxisFrom(_axisLocator(), shutterOffset)
  }

  private _getHeightSource(): _DoubleDataSource | undefined {
    return _DoubleCast(HdContainerDataSource.Get(this._primDataSource, _heightLocator()))
  }

  private _getHeight(shutterOffset: Time): number {
    const s = this._getHeightSource()
    if (s) {
      return Number(s.getTypedValue(shutterOffset))
    }
    return 1.0
  }

  private _getHeightOffsetMatrix(shutterOffset: Time): GfMatrix4d {
    const t = new GfVec3d(0.0, 0.0, -0.5 * this._getHeight(shutterOffset))
    return new GfMatrix4d(1.0).setTranslate(t)
  }
}

/** implicitSurfaceSceneIndex.cpp:1278-1299 */
export function _ComputePrimDataSource(
  primPath: string,
  primDataSource: HdContainerDataSource | undefined,
): HdContainerDataSource {
  return _ComputeTransformedPrimDataSource(
    _MatrixDataSource.new(primDataSource),
    _ComputeMatrixDependenciesDataSource(HdConeSchema, primPath),
    primDataSource)
}

} // namespace _ConeToTransformedCone

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

// Plane

namespace _PlaneToMesh {

/** implicitSurfaceSceneIndex.cpp:1308-1337 */
function _ComputeMeshDataSource(primDataSource: HdContainerDataSource | undefined): HdContainerDataSource {
  const topology =
    GeomUtilPlaneMeshGenerator.generateTopology()

  const doubleSidedLocator =
    HdPlaneSchema.getDefaultLocator().append(
      HdPlaneSchemaTokens.doubleSided)
  const doubleSidedDs =
    _BoolCast(HdContainerDataSource.Get(primDataSource, doubleSidedLocator))

  return _MeshDataSource(topology, doubleSidedDs)
}

/** implicitSurfaceSceneIndex.cpp:1339-1451 */
class _PointsDataSource extends _PointsDataSourceBase {
  static new(primDataSource: HdContainerDataSource | undefined): _PointsDataSource {
    return new _PointsDataSource(primDataSource)
  }

  getTypedValue(shutterOffset: Time): VtArray<GfVec3f> {
    const basis = _GetBasis(this._getAxis(shutterOffset))
    const numPoints =
      GeomUtilPlaneMeshGenerator.computeNumPoints()
    const points = _PointsDataSourceBase._points(numPoints)

    GeomUtilPlaneMeshGenerator.generatePoints(
      GeomUtilPointIter.Vec3f(points),
      this._getWidth(shutterOffset),
      this._getLength(shutterOffset),
      basis,
    )

    return _PointsDataSourceBase._vtVec3fArray(points)
  }

  GetContributingSampleTimesForInterval(
    startTime: Time, endTime: Time, outSampleTimes: Time[],
  ): boolean {
    const sources = [
      this._getWidthSource(), this._getLengthSource(), this._getAxisSource()]
    return HdGetMergedContributingSampleTimesForInterval(
      sources, startTime, endTime, outSampleTimes)
  }

  private _getWidthSource(): _DoubleDataSource | undefined {
    return this._getDoubleSource(
      HdPlaneSchema.getDefaultLocator().append(HdPlaneSchemaTokens.width))
  }

  private _getWidth(shutterOffset: Time): number {
    return this._getDouble(this._getWidthSource(), shutterOffset, 1.0)
  }

  private _getLengthSource(): _DoubleDataSource | undefined {
    return this._getDoubleSource(
      HdPlaneSchema.getDefaultLocator().append(HdPlaneSchemaTokens.length))
  }

  private _getLength(shutterOffset: Time): number {
    return this._getDouble(this._getLengthSource(), shutterOffset, 1.0)
  }

  private _getAxisSource(): _TokenDataSource | undefined {
    return this._getTokenSource(
      HdPlaneSchema.getDefaultLocator().append(HdPlaneSchemaTokens.axis))
  }

  private _getAxis(shutterOffset: Time): string {
    const s = this._getAxisSource()
    if (s) {
      return s.getTypedValue(shutterOffset)
    }
    return HdPlaneSchemaTokens.X
  }
}

/** implicitSurfaceSceneIndex.cpp:1481-1505 */
export function _ComputePrimDataSource(
  primPath: string,
  primDataSource: HdContainerDataSource | undefined,
): HdContainerDataSource {
  return _ComputeMeshPrimDataSource(
    HdPlaneSchema.getSchemaToken(),
    _ComputeMeshDataSource(primDataSource),
    _ComputePrimvarsDataSource(_PointsDataSource.new(primDataSource)),
    _ComputePointsDependenciesDataSource(HdPlaneSchema, primPath),
    primDataSource)
}

} // namespace _PlaneToMesh

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

// Scene index implementation

/** implicitSurfaceSceneIndex.cpp:1514-1529 */
function _GetMode(inputArgs: HdContainerDataSource | undefined, primType: string): string {
  if (!inputArgs) {
    return ''
  }

  const src = _TokenCast(inputArgs.Get(primType))
  if (!src) {
    return ''
  }

  return src.getTypedValue(0.0)
}

/**
 * implicitSurfaceSceneIndex.h:23-70: converts implicit surfaces (capsule,
 * cone, cube, cylinder, plane, sphere) to meshes, or bakes the axis of cones
 * and cylinders into their transform, as configured per prim type by
 * `inputArgs` (a token data source per prim type: toMesh or
 * axisToTransform).
 */
export class HdsiImplicitSurfaceSceneIndex extends HdSingleInputFilteringSceneIndexBase {
  private readonly _capsuleMode: string
  private readonly _coneMode: string
  private readonly _cubeMode: string
  private readonly _cylinderMode: string
  private readonly _planeMode: string
  private readonly _sphereMode: string

  /** implicitSurfaceSceneIndex.cpp:1533-1541 */
  static new(
    inputSceneIndex: HdSceneIndexBase,
    inputArgs: HdContainerDataSource | undefined,
  ): HdsiImplicitSurfaceSceneIndex {
    return new HdsiImplicitSurfaceSceneIndex(inputSceneIndex, inputArgs)
  }

  /** implicitSurfaceSceneIndex.cpp:1543-1556 */
  protected constructor(
    inputSceneIndex: HdSceneIndexBase,
    inputArgs: HdContainerDataSource | undefined,
  ) {
    super(inputSceneIndex)
    this._capsuleMode = _GetMode(inputArgs, HdPrimTypeTokens.capsule)
    this._coneMode = _GetMode(inputArgs, HdPrimTypeTokens.cone)
    this._cubeMode = _GetMode(inputArgs, HdPrimTypeTokens.cube)
    this._cylinderMode = _GetMode(inputArgs, HdPrimTypeTokens.cylinder)
    this._planeMode = _GetMode(inputArgs, HdPrimTypeTokens.plane)
    this._sphereMode = _GetMode(inputArgs, HdPrimTypeTokens.sphere)
  }

  /** implicitSurfaceSceneIndex.cpp:1558-1625 */
  getPrim(primPath: string): HdSceneIndexPrim {
    const prim = this._getInputSceneIndex().getPrim(primPath)
    const T = HdsiImplicitSurfaceSceneIndexTokens
    if (prim.primType === HdPrimTypeTokens.cube) {
      if (this._cubeMode === T.toMesh) {
        return {
          primType: HdPrimTypeTokens.mesh,
          dataSource: _CubeToMesh._ComputePrimDataSource(
            primPath, prim.dataSource) }
      }
    }
    if (prim.primType === HdPrimTypeTokens.cone) {
      if (this._coneMode === T.toMesh) {
        return {
          primType: HdPrimTypeTokens.mesh,
          dataSource: _ConeToMesh._ComputePrimDataSource(
            primPath, prim.dataSource) }
      }
      if (this._coneMode === T.axisToTransform) {
        return {
          primType: prim.primType,
          dataSource: _ConeToTransformedCone._ComputePrimDataSource(
            primPath, prim.dataSource) }
      }
    }
    if (prim.primType === HdPrimTypeTokens.cylinder) {
      if (this._cylinderMode === T.toMesh) {
        return {
          primType: HdPrimTypeTokens.mesh,
          dataSource: _CylinderToMesh._ComputePrimDataSource(
            primPath, prim.dataSource) }
      }
      if (this._cylinderMode === T.axisToTransform) {
        return {
          primType: prim.primType,
          dataSource: _CylinderToTransformedCylinder._ComputePrimDataSource(
            primPath, prim.dataSource) }
      }
    }
    if (prim.primType === HdPrimTypeTokens.sphere) {
      if (this._sphereMode === T.toMesh) {
        return {
          primType: HdPrimTypeTokens.mesh,
          dataSource: _SphereToMesh._ComputePrimDataSource(
            primPath, prim.dataSource) }
      }
    }
    if (prim.primType === HdPrimTypeTokens.capsule) {
      if (this._capsuleMode === T.toMesh) {
        return {
          primType: HdPrimTypeTokens.mesh,
          dataSource: _CapsuleToMesh._ComputePrimDataSource(
            primPath, prim.dataSource) }
      }
    }
    if (prim.primType === HdPrimTypeTokens.plane) {
      if (this._planeMode === T.toMesh) {
        return {
          primType: HdPrimTypeTokens.mesh,
          dataSource: _PlaneToMesh._ComputePrimDataSource(
            primPath, prim.dataSource) }
      }
    }
    return prim
  }

  /** implicitSurfaceSceneIndex.cpp:1627-1631 */
  getChildPrimPaths(primPath: string): string[] {
    return this._getInputSceneIndex().getChildPrimPaths(primPath)
  }

  /** implicitSurfaceSceneIndex.cpp:1633-1680 */
  protected _primsAdded(_sender: HdSceneIndexBase, entries: AddedPrimEntry[]): void {
    if (!this._isObserved()) {
      return
    }

    const T = HdsiImplicitSurfaceSceneIndexTokens
    const indices: number[] = []
    for (let i = 0; i < entries.length; i++) {
      const primType = entries[i]!.primType
      const convertToMesh =
          (primType === HdPrimTypeTokens.cube &&
           this._cubeMode === T.toMesh)
        || (primType === HdPrimTypeTokens.cone &&
            this._coneMode === T.toMesh)
        || (primType === HdPrimTypeTokens.cylinder &&
            this._cylinderMode === T.toMesh)
        || (primType === HdPrimTypeTokens.sphere &&
            this._sphereMode === T.toMesh)
        || (primType === HdPrimTypeTokens.capsule &&
            this._capsuleMode === T.toMesh)
        || (primType === HdPrimTypeTokens.plane &&
            this._planeMode === T.toMesh)

      if (convertToMesh) {
        indices.push(i)
      }
    }

    if (indices.length === 0) {
      this._sendPrimsAdded(entries)
      return
    }

    const newEntries: AddedPrimEntry[] = entries.map((e) => ({ ...e }))
    for (const i of indices) {
      newEntries[i]!.primType = HdPrimTypeTokens.mesh
    }

    this._sendPrimsAdded(newEntries)
  }

  /** implicitSurfaceSceneIndex.cpp:1682-1692 */
  protected _primsRemoved(_sender: HdSceneIndexBase, entries: RemovedPrimEntry[]): void {
    if (!this._isObserved()) {
      return
    }

    this._sendPrimsRemoved(entries)
  }

  /** implicitSurfaceSceneIndex.cpp:1694-1704 */
  protected _primsDirtied(_sender: HdSceneIndexBase, entries: DirtiedPrimEntry[]): void {
    if (!this._isObserved()) {
      return
    }

    this._sendPrimsDirtied(entries)
  }
}

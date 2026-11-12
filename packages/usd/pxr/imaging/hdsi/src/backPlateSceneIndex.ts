// Ported from OpenUSD 26.11.1: pxr/imaging/hdsi/backPlateSceneIndex.cpp,
//  pxr/imaging/hdsi/backPlateSceneIndex.h,
//  pxr/imaging/hdsi/shaders/unlitShader.glslfx
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/imaging/hdsi/backPlateSceneIndex.{h,cpp}.
//
// For each back plate instance of a camera (the camera schema's backPlate
// container), the scene index adds a prim <camera>/<instance> with a mesh
// child (a quad facing the camera at its focus distance) and a material
// child (the UsdUVTexture of the plate's image into hdsi's unlit surface,
// shaders/unlitShader.glslfx, a resource of the hdsi plugin registered by
// shaderResources.ts).
//
// Paths are the string paths this port's Hydra uses; the SdfPathSets and the
// std::map keyed by camera path are iterated in SdfPath::operator< order
// (typescript-usd/sdf/path). The per-camera std::unordered_set of instance
// names (whose iteration order upstream leaves unspecified) is a Set
// iterated in insertion order. The function-local statics are module-level
// lazily initialized values. TRACE_FUNCTION scopes are not ported.

import {
  Matrix4d as GfMatrix4d,
  Vec2f as GfVec2f,
  Vec3f as GfVec3f,
  composeRotations as GfComposeRotations,
  makeRotation as GfMakeRotation,
} from 'typescript-usd/gf'
import { Array as VtArray, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { AssetPath as SdfAssetPath } from 'typescript-usd/sdf'
import { SdfPath } from 'typescript-usd/sdf/path'
import { MakeTokens as TfMakeTokens, Type as TfType } from 'typescript-usd/tf'
import { OpenSubdivTokens as PxOsdOpenSubdivTokens } from 'typescript-usd/pxOsd'
import { Registry as PlugRegistry, PlugFindPluginResource } from 'typescript-usd/plug'
import {
  BackPlateSchema as HdBackPlateSchema,
  CameraSchema as HdCameraSchema,
  CameraSchemaTokens as HdCameraSchemaTokens,
  ContainerDataSource as HdContainerDataSource,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  GetMergedContributingSampleTimesForInterval as HdGetMergedContributingSampleTimesForInterval,
  MaterialBindingSchema as HdMaterialBindingSchema,
  MaterialBindingsSchema as HdMaterialBindingsSchema,
  MaterialBindingsSchemaTokens as HdMaterialBindingsSchemaTokens,
  MaterialConnectionSchema as HdMaterialConnectionSchema,
  MaterialNetworkSchema as HdMaterialNetworkSchema,
  MaterialNodeParameterSchema as HdMaterialNodeParameterSchema,
  MaterialNodeSchema as HdMaterialNodeSchema,
  MaterialSchema as HdMaterialSchema,
  MaterialSchemaTokens as HdMaterialSchemaTokens,
  MaterialTerminalTokens as HdMaterialTerminalTokens,
  MeshSchemaTokens as HdMeshSchemaTokens,
  MeshTopologySchema as HdMeshTopologySchema,
  MeshTopologySchemaTokens as HdMeshTopologySchemaTokens,
  PrimTypeTokens as HdPrimTypeTokens,
  PrimvarSchema as HdPrimvarSchema,
  PrimvarSchemaTokens as HdPrimvarSchemaTokens,
  PrimvarsSchema as HdPrimvarsSchema,
  PrimvarsSchemaTokens as HdPrimvarsSchemaTokens,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedSmallVectorDataSource as HdRetainedSmallVectorDataSource,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  SingleInputFilteringSceneIndexBase as HdSingleInputFilteringSceneIndexBase,
  TypedSampledDataSource as HdTypedSampledDataSource,
  XformSchema as HdXformSchema,
  XformSchemaTokens as HdXformSchemaTokens,
} from 'typescript-usd/hd'
import type {
  AddedPrimEntry,
  DataSourceBase as HdDataSourceBase,
  DirtiedPrimEntry,
  RemovedPrimEntry,
  SampledDataSource as HdSampledDataSource,
  SceneIndexBase as HdSceneIndexBase,
  SceneIndexPrim as HdSceneIndexPrim,
} from 'typescript-usd/hd'
import { Hdsi_RegisterShaderResources } from './shaderResources.ts'

type Time = number

// backPlateSceneIndex.cpp:41-44
const _backPlatePrimsTokens = TfMakeTokens({
  mesh: 'mesh',
  material: 'material',
})

// backPlateSceneIndex.cpp:46-50
const _materialNodeNamesTokens = TfMakeTokens({
  UsdPrimvarReader_float2: 'UsdPrimvarReader_float2',
  UsdUVTexture: 'UsdUVTexture',
  UsdUnlitSurface: 'UsdUnlitSurface',
})

// backPlateSceneIndex.cpp:52-71
const _materialNodeParamsTokens = TfMakeTokens({
  rgb: 'rgb',
  a: 'a',
  slope: 'slope',
  power: 'power',
  offset: 'offset',
  opacity: 'opacity',
  file: 'file',
  st: 'st',
  wrapS: 'wrapS',
  wrapT: 'wrapT',
  clamp: 'clamp',
  implementationSource: 'implementationSource',
  backPlateColor: 'backPlateColor',
  sourceAsset: 'sourceAsset',
  varname: 'varname',
  result: 'result',
  glslfxSourceAsset: 'glslfx:sourceAsset',
  glslfxShader: 'shaders/unlitShader.glslfx',
})

/** SdfPath::operator< */
function _PathCompare(a: string, b: string): number {
  return SdfPath.compare(SdfPath.fromString(a), SdfPath.fromString(b))
}

/** SdfPath::AppendChild */
function _AppendChild(path: string, name: string): string {
  return SdfPath.fromString(path).appendChild(name).pathString
}

/** SdfPath::GetParentPath */
function _GetParentPath(path: string): string {
  return SdfPath.fromString(path).getParentPath().pathString
}

/** SdfPath::GetElementToken */
function _GetElementToken(path: string): string {
  return SdfPath.fromString(path).elementString
}

//////////////////////////// Helper Functions //////////////////////////////////

/** backPlateSceneIndex.cpp:74-80 */
function _BuildBackPlatePrimPath(
  cameraPrimPath: string, instanceName: string, childName: string,
): string {
  return _AppendChild(_AppendChild(cameraPrimPath, instanceName), childName)
}

/** backPlateSceneIndex.cpp:82-89 */
function _GetBackPlateSchema(
  instanceName: string, primDataSource: HdContainerDataSource | undefined,
): HdBackPlateSchema {
  const cam = HdCameraSchema.getFromParent(primDataSource)
  return cam.getBackPlate().Get(instanceName)
}

/** backPlateSceneIndex.cpp:91-102: the value of `dataSource` at
 *  `shutterOffset`, or undefined (false) without a data source. */
function _GetDefaultTypedValue<T>(
  dataSource: HdTypedSampledDataSource<T> | undefined, shutterOffset: Time,
): T | undefined {
  if (!dataSource) {
    return undefined
  }
  return dataSource.getTypedValue(shutterOffset)
}

/** backPlateSceneIndex.cpp:104-160 */
function _ComputeEffectiveDimensions(
  instanceName: string,
  primDataSource: HdContainerDataSource | undefined,
  shutterOffset: Time,
): GfVec2f {
  const camera = HdCameraSchema.getFromParent(primDataSource)
  if (!camera.isDefined()) {
    return new GfVec2f(0.0)
  }

  const projectionType = _GetDefaultTypedValue(camera.GetProjection(), shutterOffset)
  const verticalAperture = _GetDefaultTypedValue(camera.getVerticalAperture(), shutterOffset)
  const horizontalAperture = _GetDefaultTypedValue(camera.GetHorizontalAperture(), shutterOffset)

  if (projectionType === undefined || verticalAperture === undefined ||
      horizontalAperture === undefined) {
    return new GfVec2f(0.0)
  }

  const backPlate = _GetBackPlateSchema(instanceName, primDataSource)
  if (!backPlate.isDefined()) {
    return new GfVec2f(0.0)
  }

  const scale = _GetDefaultTypedValue(backPlate.getScaleTweak(), shutterOffset) ??
    new GfVec2f(1.0)

  // For an orthographic projection, the back plate will by default fit the
  // camera's aperture and sized accordingly by it's scale attribute.
  if (projectionType === HdCameraSchemaTokens.orthographic) {
    return new GfVec2f(horizontalAperture * scale.get(0), verticalAperture * scale.get(1))
  }

  // For a perspective projection, the back plate will by default fit the
  // camera's frustum and scaled further by it's scale attribute.
  const focalLength = _GetDefaultTypedValue(camera.getFocalLength(), shutterOffset)
  const focusDistance = _GetDefaultTypedValue(camera.getFocusDistance(), shutterOffset)

  if (focalLength === undefined || focusDistance === undefined) {
    return new GfVec2f(0.0)
  }

  // Calculate the ratio of the aperture to the focal length and then multiply
  // by the focus distance and scaling factor to get the actual dimension.
  const ratio = Math.fround(focusDistance / focalLength)
  return new GfVec2f(horizontalAperture * scale.get(0) * ratio,
    verticalAperture * scale.get(1) * ratio)
}

/** backPlateSceneIndex.cpp:162-197 */
function _ComputeLocalXform(
  primDataSource: HdContainerDataSource | undefined,
  instanceName: string,
  shutterOffset: Time,
): GfMatrix4d {
  const cam = HdCameraSchema.getFromParent(primDataSource)
  const backPlate = _GetBackPlateSchema(instanceName, primDataSource)

  if (!cam.isDefined() || !backPlate.isDefined()) {
    return new GfMatrix4d(1.0)
  }

  // Translation is applied ontop of a shift to the focus distance from
  // the camera. Refer to the docs for more details.
  const focusDistance = _GetDefaultTypedValue(cam.getFocusDistance(), shutterOffset)
  if (focusDistance === undefined) {
    return new GfMatrix4d(1.0)
  }

  const rotateValue = _GetDefaultTypedValue(backPlate.getRotateXYZTweak(), shutterOffset)
  const translateValue = _GetDefaultTypedValue(backPlate.getTranslateTweak(), shutterOffset)
  const rotate = rotateValue ? [rotateValue.get(0), rotateValue.get(1), rotateValue.get(2)] : [0, 0, 0]
  const translate = translateValue
    ? [translateValue.get(0), translateValue.get(1), translateValue.get(2)] : [0, 0, 0]

  // Camera is Y-up looking down the -Z axis
  translate[2] = translate[2]! - focusDistance

  const rx = GfMakeRotation([1, 0, 0], rotate[0]!)
  const ry = GfMakeRotation([0, 1, 0], rotate[1]!)
  const rz = GfMakeRotation([0, 0, 1], rotate[2]!)

  const local = new GfMatrix4d()
  local.setTransform(GfComposeRotations(GfComposeRotations(rz, ry), rx), translate)
  return local
}

/////////////////////////// Datasource Builders ////////////////////////////////

/** backPlateSceneIndex.cpp:200-245 */
class _PointsValueDataSource extends HdTypedSampledDataSource<VtArray<GfVec3f>> {
  static new(
    instanceName: string, primDataSource: HdContainerDataSource | undefined,
  ): _PointsValueDataSource {
    return new _PointsValueDataSource(instanceName, primDataSource)
  }

  private constructor(
    private readonly _instanceName: string,
    private readonly _primDataSource: HdContainerDataSource | undefined,
  ) {
    super()
  }

  override GetValue(t: Time): VtArray<GfVec3f> {
    return this.getTypedValue(t)
  }

  getTypedValue(t: Time): VtArray<GfVec3f> {
    const dims = _ComputeEffectiveDimensions(
      this._instanceName, this._primDataSource, t)
    const width = dims.get(0)
    const length = dims.get(1)
    return new VtArray<GfVec3f>([
      new GfVec3f(0.5 * width, 0.5 * length, 0.0),
      new GfVec3f(-0.5 * width, 0.5 * length, 0.0),
      new GfVec3f(-0.5 * width, -0.5 * length, 0.0),
      new GfVec3f(0.5 * width, -0.5 * length, 0.0)], VtValueTypes.GfVec3f)
  }

  GetContributingSampleTimesForInterval(
    startTime: Time, endTime: Time, outSampleTimes: Time[],
  ): boolean {
    const cam = HdCameraSchema.getFromParent(this._primDataSource)
    const backPlate = _GetBackPlateSchema(this._instanceName, this._primDataSource)
    const sources: (HdSampledDataSource | undefined)[] = [
      cam.GetHorizontalAperture(),
      cam.getVerticalAperture(),
      cam.getFocalLength(),
      cam.getFocusDistance(),
      cam.GetProjection(),
      backPlate.getScaleTweak(),
    ]
    return HdGetMergedContributingSampleTimesForInterval(
      sources, startTime, endTime, outSampleTimes)
  }
}

/** backPlateSceneIndex.cpp:247-301 */
class _XformMatrixDataSource extends HdTypedSampledDataSource<GfMatrix4d> {
  static new(
    instanceName: string, primDataSource: HdContainerDataSource | undefined,
  ): _XformMatrixDataSource {
    return new _XformMatrixDataSource(instanceName, primDataSource)
  }

  private constructor(
    private readonly _instanceName: string,
    private readonly _primDataSource: HdContainerDataSource | undefined,
  ) {
    super()
  }

  override GetValue(t: Time): GfMatrix4d {
    return this.getTypedValue(t)
  }

  getTypedValue(shutterOffset: Time): GfMatrix4d {
    const camXform = HdXformSchema.getFromParent(this._primDataSource)

    const local = _ComputeLocalXform(
      this._primDataSource, this._instanceName, shutterOffset)
    let camXformMatrix = new GfMatrix4d(1.0)

    if (camXform.isDefined()) {
      camXformMatrix = _GetDefaultTypedValue(camXform.getMatrix(), shutterOffset) ??
        camXformMatrix
    }
    return local.getMultiply(camXformMatrix)
  }

  GetContributingSampleTimesForInterval(
    startTime: Time, endTime: Time, outSampleTimes: Time[],
  ): boolean {
    const cam = HdCameraSchema.getFromParent(this._primDataSource)
    const camXform = HdXformSchema.getFromParent(this._primDataSource)
    const backPlate = _GetBackPlateSchema(this._instanceName, this._primDataSource)
    const sources: (HdSampledDataSource | undefined)[] = [
      cam.getFocusDistance(),
      backPlate.getTranslateTweak(),
      backPlate.getRotateXYZTweak(),
      camXform.getMatrix(),
    ]
    return HdGetMergedContributingSampleTimesForInterval(
      sources, startTime, endTime, outSampleTimes)
  }
}

/** backPlateSceneIndex.cpp:310-351 */
class _AssetPathDataSource extends HdTypedSampledDataSource<SdfAssetPath> {
  static new(
    instanceName: string, primDataSource: HdContainerDataSource | undefined,
  ): _AssetPathDataSource {
    return new _AssetPathDataSource(instanceName, primDataSource)
  }

  private constructor(
    private readonly _instanceName: string,
    private readonly _primDataSource: HdContainerDataSource | undefined,
  ) {
    super()
  }

  override GetValue(t: Time): SdfAssetPath {
    return this.getTypedValue(t)
  }

  getTypedValue(shutterOffset: Time): SdfAssetPath {
    const backPlate = _GetBackPlateSchema(this._instanceName, this._primDataSource)
    return _GetDefaultTypedValue(backPlate.getImage(), shutterOffset) ?? new SdfAssetPath()
  }

  GetContributingSampleTimesForInterval(
    startTime: Time, endTime: Time, outSampleTimes: Time[],
  ): boolean {
    const backPlate = _GetBackPlateSchema(this._instanceName, this._primDataSource)
    const source = backPlate.getImage()
    if (!source) {
      return false
    }
    return source.GetContributingSampleTimesForInterval(
      startTime, endTime, outSampleTimes)
  }
}

/** backPlateSceneIndex.cpp:353-420 */
class _ColorGradingDataSource extends HdTypedSampledDataSource<GfVec3f> {
  static new(
    instanceName: string, type: string, primDataSource: HdContainerDataSource | undefined,
  ): _ColorGradingDataSource {
    return new _ColorGradingDataSource(instanceName, type, primDataSource)
  }

  private constructor(
    private readonly _instanceName: string,
    private readonly _type: string,
    private readonly _primDataSource: HdContainerDataSource | undefined,
  ) {
    super()
  }

  override GetValue(t: Time): GfVec3f {
    return this.getTypedValue(t)
  }

  getTypedValue(shutterOffset: Time): GfVec3f {
    const backPlate = _GetBackPlateSchema(this._instanceName, this._primDataSource)
    let result = new GfVec3f(0.0)
    // if _type is offset we leave the default as (0, 0, 0).
    if (this._type === _materialNodeParamsTokens.slope ||
        this._type === _materialNodeParamsTokens.power) {
      result = new GfVec3f(1.0)
    }

    return _GetDefaultTypedValue(this._getLumaSource(backPlate), shutterOffset) ?? result
  }

  GetContributingSampleTimesForInterval(
    startTime: Time, endTime: Time, outSampleTimes: Time[],
  ): boolean {
    const backPlate = _GetBackPlateSchema(this._instanceName, this._primDataSource)
    const source = this._getLumaSource(backPlate)
    if (!source) {
      return false
    }
    return source.GetContributingSampleTimesForInterval(
      startTime, endTime, outSampleTimes)
  }

  private _getLumaSource(
    backPlate: HdBackPlateSchema,
  ): HdTypedSampledDataSource<GfVec3f> | undefined {
    if (this._type === _materialNodeParamsTokens.offset) {
      return backPlate.getLumaOffset()
    }
    if (this._type === _materialNodeParamsTokens.slope) {
      return backPlate.getLumaSlope()
    }
    if (this._type === _materialNodeParamsTokens.power) {
      return backPlate.getLumaPower()
    }
    return undefined
  }
}

// VtIntArray (HdRetainedTypedSampledDataSource<VtIntArray>,
// backPlateSceneIndex.cpp:430-434).
const _VtIntArrayType = TfType.declare('int[]')
let _meshTopologyDs: HdContainerDataSource | undefined

/** backPlateSceneIndex.cpp:422-439 */
function _BuildMeshTopologyDataSource(): HdContainerDataSource {
  return _meshTopologyDs ??= new HdMeshTopologySchema.Builder()
    .setFaceVertexCounts(
      new HdRetainedTypedSampledDataSource<number[]>([4], _VtIntArrayType))
    .setFaceVertexIndices(
      new HdRetainedTypedSampledDataSource<number[]>([0, 1, 2, 3], _VtIntArrayType))
    .setOrientation(
      HdRetainedTypedSampledDataSource.new<string>(
        HdMeshTopologySchemaTokens.rightHanded))
    .build()
}

/** A one-element vector of the material connection to `upstreamNodePath`'s
 *  `upstreamNodeOutputName` (backPlateSceneIndex.cpp:487-500, 525-552). */
function _ConnectionVector(
  upstreamNodePath: string, upstreamNodeOutputName: string,
): HdRetainedSmallVectorDataSource {
  return HdRetainedSmallVectorDataSource.new([
    new HdMaterialConnectionSchema.Builder()
      .setUpstreamNodePath(
        HdRetainedTypedSampledDataSource.new<string>(upstreamNodePath))
      .setUpstreamNodeOutputName(
        HdRetainedTypedSampledDataSource.new<string>(upstreamNodeOutputName))
      .build(),
  ])
}

/** backPlateSceneIndex.cpp:441-645 */
function _BuildMaterialNetworkDataSource(
  appliedInstanceName: string,
  primDataSource: HdContainerDataSource | undefined,
): HdContainerDataSource {
  // USD Primar Reader Params
  const usdPrimvarReaderParams = new HdMaterialNodeParameterSchema.Builder()
    .setValue(HdRetainedTypedSampledDataSource.new<string>(_materialNodeParamsTokens.st))
    .build()

  // USD Primar Reader Node
  const usdPrimvarReaderNode = new HdMaterialNodeSchema.Builder()
    .setParameters(
      HdRetainedContainerDataSource.new(
        [_materialNodeParamsTokens.varname],
        [usdPrimvarReaderParams]))
    .setNodeIdentifier(
      HdRetainedTypedSampledDataSource.new<string>(
        _materialNodeNamesTokens.UsdPrimvarReader_float2))
    .build()

  /// Usd UVTextureNode Params
  const texParamNames = [
    _materialNodeParamsTokens.file,
    _materialNodeParamsTokens.st,
    _materialNodeParamsTokens.wrapS,
    _materialNodeParamsTokens.wrapT]
  const assetPathDs = _AssetPathDataSource.new(appliedInstanceName, primDataSource)
  const texParams: HdDataSourceBase[] = [
    new HdMaterialNodeParameterSchema.Builder()
      .setValue(assetPathDs)
      .build(),
    new HdMaterialNodeParameterSchema.Builder()
      .setValue(HdRetainedTypedSampledDataSource.new<string>(_materialNodeParamsTokens.st))
      .build(),
    new HdMaterialNodeParameterSchema.Builder()
      .setValue(HdRetainedTypedSampledDataSource.new<string>(_materialNodeParamsTokens.clamp))
      .build(),
    new HdMaterialNodeParameterSchema.Builder()
      .setValue(HdRetainedTypedSampledDataSource.new<string>(_materialNodeParamsTokens.clamp))
      .build()]

  // Usd UVTextureNode Connections
  const texConnectionNames = [_materialNodeParamsTokens.st]
  const texConnections: HdDataSourceBase[] = [
    _ConnectionVector(
      _materialNodeNamesTokens.UsdPrimvarReader_float2,
      _materialNodeParamsTokens.result)]
  // UsdUVTextureNode
  const textureNode = new HdMaterialNodeSchema.Builder()
    .setNodeIdentifier(
      HdRetainedTypedSampledDataSource.new<string>(
        _materialNodeNamesTokens.UsdUVTexture))
    .setInputConnections(
      HdRetainedContainerDataSource.new(texConnectionNames, texConnections))
    .setParameters(
      HdRetainedContainerDataSource.new(texParamNames, texParams))
    .build()

  // USD Unlit Surface Connections
  const usdUnlitSurfaceConnectionNames = [
    _materialNodeParamsTokens.backPlateColor,
    _materialNodeParamsTokens.opacity,
  ]
  const surfaceConnection = _ConnectionVector(
    _materialNodeNamesTokens.UsdUVTexture, _materialNodeParamsTokens.rgb)
  const opacityConnection = _ConnectionVector(
    _materialNodeNamesTokens.UsdUVTexture, _materialNodeParamsTokens.a)
  const usdUnlitSurfaceConnections: HdDataSourceBase[] = [
    surfaceConnection,
    opacityConnection,
  ]

  const usdUnlitSurfaceParamNames = [
    _materialNodeParamsTokens.offset,
    _materialNodeParamsTokens.slope,
    _materialNodeParamsTokens.power,
    _materialNodeParamsTokens.opacity,
  ]
  const usdUnlitSurfaceParams: HdDataSourceBase[] = [
    new HdMaterialNodeParameterSchema.Builder()
      .setValue(_ColorGradingDataSource.new(
        appliedInstanceName, _materialNodeParamsTokens.offset, primDataSource))
      .build(),
    new HdMaterialNodeParameterSchema.Builder()
      .setValue(_ColorGradingDataSource.new(
        appliedInstanceName, _materialNodeParamsTokens.slope, primDataSource))
      .build(),
    new HdMaterialNodeParameterSchema.Builder()
      .setValue(_ColorGradingDataSource.new(
        appliedInstanceName, _materialNodeParamsTokens.power, primDataSource))
      .build(),
    new HdMaterialNodeParameterSchema.Builder()
      .setValue(HdRetainedTypedSampledDataSource.new<number>(1.0))
      .build()]

  // PLUG_THIS_PLUGIN is the hdsi plugin (shaderResources.ts).
  Hdsi_RegisterShaderResources()
  const nodeTypeInfoDs = HdRetainedContainerDataSource.new(
    [_materialNodeParamsTokens.implementationSource,
      _materialNodeParamsTokens.glslfxSourceAsset],
    [HdRetainedTypedSampledDataSource.new<string>(_materialNodeParamsTokens.sourceAsset),
      HdRetainedTypedSampledDataSource.new<SdfAssetPath>(
        new SdfAssetPath(PlugFindPluginResource(
          PlugRegistry.GetInstance().GetPluginWithName('hdsi'),
          _materialNodeParamsTokens.glslfxShader)))])

  // If the asset source contains opacity then we connect that input to the
  // displayed opacity. If not then we default the opacity to 1 via the
  // usdUnlitSurfaceParameters.
  const assetHasOpacity = assetPathDs.getTypedValue(0.0).getAssetPath() !== ''
  const paramNum = assetHasOpacity ? 3 : 4
  const connNum = assetHasOpacity ? 2 : 1

  const usdUnlitSurfaceNode = new HdMaterialNodeSchema.Builder()
    .setNodeTypeInfo(nodeTypeInfoDs)
    .setParameters(
      HdRetainedContainerDataSource.new(
        usdUnlitSurfaceParamNames.slice(0, paramNum),
        usdUnlitSurfaceParams.slice(0, paramNum)))
    .setInputConnections(HdRetainedContainerDataSource.new(
      usdUnlitSurfaceConnectionNames.slice(0, connNum),
      usdUnlitSurfaceConnections.slice(0, connNum)))
    .build()

  // USD Unlit Surface Nodes
  const nodesDs = HdRetainedContainerDataSource.new(
    [_materialNodeNamesTokens.UsdPrimvarReader_float2,
      _materialNodeNamesTokens.UsdUnlitSurface,
      _materialNodeNamesTokens.UsdUVTexture],
    [usdPrimvarReaderNode, usdUnlitSurfaceNode, textureNode])

  // USD Unlit Surface Terminals
  const terminalsDs = HdRetainedContainerDataSource.new(
    [HdMaterialTerminalTokens.surface],
    [new HdMaterialConnectionSchema.Builder()
      .setUpstreamNodePath(
        HdRetainedTypedSampledDataSource.new<string>(
          _materialNodeNamesTokens.UsdUnlitSurface))
      .setUpstreamNodeOutputName(
        HdRetainedTypedSampledDataSource.new<string>(
          HdMaterialTerminalTokens.surface))
      .build()])

  // USD Unlit Surface Material Network
  const materialNetworkDs = new HdMaterialNetworkSchema.Builder()
    .setNodes(nodesDs)
    .setTerminals(terminalsDs)
    .build()

  // USD Unlit Surface Material
  return HdMaterialSchema.buildRetained(
    [HdMaterialSchemaTokens.universalRenderContext],
    [materialNetworkDs])
}

/** backPlateSceneIndex.cpp:647-677 */
class _MaterialDataSource extends HdContainerDataSource {
  static new(
    instanceName: string, primDataSource: HdContainerDataSource | undefined,
  ): _MaterialDataSource {
    return new _MaterialDataSource(instanceName, primDataSource)
  }

  private constructor(
    private readonly _instanceName: string,
    private readonly _primDataSource: HdContainerDataSource | undefined,
  ) {
    super()
  }

  getNames(): string[] {
    return [HdMaterialSchemaTokens.material]
  }

  Get(name: string): HdDataSourceBase | undefined {
    if (name === HdMaterialSchemaTokens.material) {
      return _BuildMaterialNetworkDataSource(this._instanceName, this._primDataSource)
    }
    return undefined
  }
}

let _stPrimvarDs: HdContainerDataSource | undefined

/** backPlateSceneIndex.cpp:679-747 */
class _PrimvarsDataSource extends HdContainerDataSource {
  static new(
    instanceName: string, primDataSource: HdContainerDataSource | undefined,
  ): _PrimvarsDataSource {
    return new _PrimvarsDataSource(instanceName, primDataSource)
  }

  private constructor(
    private readonly _instanceName: string,
    private readonly _primDataSource: HdContainerDataSource | undefined,
  ) {
    super()
  }

  getNames(): string[] {
    return [HdPrimvarsSchemaTokens.points, _materialNodeParamsTokens.st]
  }

  Get(name: string): HdDataSourceBase | undefined {
    if (name === HdPrimvarsSchemaTokens.points) {
      return new HdPrimvarSchema.Builder()
        .setPrimvarValue(
          _PointsValueDataSource.new(this._instanceName, this._primDataSource))
        .setInterpolation(
          HdRetainedTypedSampledDataSource.new<string>(HdPrimvarSchemaTokens.vertex))
        .setRole(
          HdRetainedTypedSampledDataSource.new<string>(HdPrimvarSchemaTokens.point))
        .build()
    }
    if (name === _materialNodeParamsTokens.st) {
      return _stPrimvarDs ??= new HdPrimvarSchema.Builder()
        .setPrimvarValue(
          HdRetainedTypedSampledDataSource.new<VtArray<GfVec2f>>(
            new VtArray<GfVec2f>([
              new GfVec2f(1.0, 1.0),
              new GfVec2f(0.0, 1.0),
              new GfVec2f(0.0, 0.0),
              new GfVec2f(1.0, 0.0)], VtValueTypes.GfVec2f)))
        .setInterpolation(
          HdRetainedTypedSampledDataSource.new<string>(HdPrimvarSchemaTokens.vertex))
        .setRole(
          HdRetainedTypedSampledDataSource.new<string>(''))
        .build()
    }
    return undefined
  }
}

/** backPlateSceneIndex.cpp:749-762 */
function _BuildXformDataSource(
  instanceName: string,
  primDataSource: HdContainerDataSource | undefined,
): HdDataSourceBase {
  return new HdXformSchema.Builder()
    .setMatrix(_XformMatrixDataSource.new(instanceName, primDataSource))
    .setResetXformStack(HdRetainedTypedSampledDataSource.new<boolean>(false))
    .build()
}

/** backPlateSceneIndex.cpp:764-777 */
function _BuildMaterialBindingsDataSource(platePath: string): HdContainerDataSource {
  const materialPath = _AppendChild(platePath, _backPlatePrimsTokens.material)
  const materialBindingDs = new HdMaterialBindingSchema.Builder()
    .setPath(HdRetainedTypedSampledDataSource.new<string>(materialPath))
    .build()
  return HdRetainedContainerDataSource.new(
    [HdMaterialBindingsSchemaTokens.allPurpose],
    [materialBindingDs])
}

/** backPlateSceneIndex.cpp:779-790 */
function _BuildMeshDataSource(): HdContainerDataSource {
  return HdRetainedContainerDataSource.new(
    [HdMeshSchemaTokens.topology,
      HdMeshSchemaTokens.subdivisionScheme,
      HdMeshSchemaTokens.doubleSided],
    [_BuildMeshTopologyDataSource(),
      HdRetainedTypedSampledDataSource.new<string>(PxOsdOpenSubdivTokens.catmullClark),
      HdRetainedTypedSampledDataSource.new<boolean>(false)])
}

/** backPlateSceneIndex.cpp:792-807 */
function _BuildMeshPrimDataSource(
  platePath: string,
  instanceName: string,
  primDataSource: HdContainerDataSource | undefined,
): HdContainerDataSource {
  return HdRetainedContainerDataSource.new(
    [HdMeshSchemaTokens.mesh,
      HdPrimvarsSchema.getSchemaToken(),
      HdXformSchemaTokens.xform,
      HdMaterialBindingsSchema.getSchemaToken()],
    [_BuildMeshDataSource(),
      _PrimvarsDataSource.new(instanceName, primDataSource),
      _BuildXformDataSource(instanceName, primDataSource),
      _BuildMaterialBindingsDataSource(platePath)])
}

/** backPlateSceneIndex.cpp:809-815 */
function _BuildMaterialDataSource(
  instanceName: string,
  primDataSource: HdContainerDataSource | undefined,
): HdContainerDataSource {
  return _MaterialDataSource.new(instanceName, primDataSource)
}

////////////////////////////////////////////////////////////////////////////////

/** backPlateSceneIndex.cpp:833-849 */
function _ToAddedPrimEntries(paths: readonly string[]): AddedPrimEntry[] {
  const entries: AddedPrimEntry[] = []
  for (const path of paths) {
    if (_GetElementToken(path) === _backPlatePrimsTokens.mesh) {
      entries.push({ primPath: path, primType: HdPrimTypeTokens.mesh })
      continue
    }
    if (_GetElementToken(path) === _backPlatePrimsTokens.material) {
      entries.push({ primPath: path, primType: HdPrimTypeTokens.material })
      continue
    }
  }
  return entries
}

/** backPlateSceneIndex.cpp:851-860 */
function _ToRemovedPrimEntries(paths: readonly string[]): RemovedPrimEntry[] {
  return paths.map((primPath) => ({ primPath }))
}

/** An SdfPathSet: unique paths in SdfPath::operator< order. */
function _SortedPathSet(paths: Set<string>): string[] {
  return [...paths].sort(_PathCompare)
}

/** backPlateSceneIndex.h:20-90 */
export class HdsiBackPlateSceneIndex extends HdSingleInputFilteringSceneIndexBase {
  // Maps the camera prim path to all the names of the back plate instances
  // associated with it (backPlateSceneIndex.h:84-88).
  private readonly _cameraToBackPlates = new Map<string, Set<string>>()

  /** backPlateSceneIndex.cpp:819-825 */
  static new(inputSceneIndex: HdSceneIndexBase): HdsiBackPlateSceneIndex {
    return new HdsiBackPlateSceneIndex(inputSceneIndex)
  }

  /** backPlateSceneIndex.cpp:827-831 */
  protected constructor(inputSceneIndex: HdSceneIndexBase) {
    super(inputSceneIndex)
  }

  /** backPlateSceneIndex.cpp:862-881 */
  private _getMeshOrMaterialSiPrim(
    plateInstancePath: string, plateChildType: string,
  ): HdSceneIndexPrim {
    const instanceName = _GetElementToken(plateInstancePath)

    const cameraPrimPath = _GetParentPath(plateInstancePath)
    const cameraDs = this._getInputSceneIndex().getPrim(cameraPrimPath).dataSource
    if (plateChildType === _backPlatePrimsTokens.mesh) {
      return {
        primType: HdPrimTypeTokens.mesh,
        dataSource: _BuildMeshPrimDataSource(plateInstancePath, instanceName, cameraDs),
      }
    }
    if (plateChildType === _backPlatePrimsTokens.material) {
      return {
        primType: HdPrimTypeTokens.material,
        dataSource: _BuildMaterialDataSource(instanceName, cameraDs),
      }
    }
    return { primType: '', dataSource: undefined }
  }

  /** backPlateSceneIndex.cpp:883-894 */
  private _isBackPlateInMap(platePath: string): boolean {
    if (platePath === '' || platePath === '/') {
      return false
    }
    const cameraPath = _GetParentPath(platePath)
    const backPlates = this._cameraToBackPlates.get(cameraPath)
    if (backPlates !== undefined && backPlates.size > 0) {
      return backPlates.has(_GetElementToken(platePath))
    }
    return false
  }

  /** backPlateSceneIndex.cpp:896-920 */
  getPrim(primPath: string): HdSceneIndexPrim {
    if (primPath === '/') {
      return this._getInputSceneIndex().getPrim(primPath)
    }

    // Check if we have back plate prim path and return an empty prim if so.
    if (this._isBackPlateInMap(primPath)) {
      return { primType: '', dataSource: HdRetainedContainerDataSource.new([], []) }
    }

    // Check if we have a back plate child prim path
    const platePath = _GetParentPath(primPath)
    if (this._isBackPlateInMap(platePath)) {
      const prim = this._getMeshOrMaterialSiPrim(platePath, _GetElementToken(primPath))
      if (prim.dataSource) {
        return prim
      }
    }
    return this._getInputSceneIndex().getPrim(primPath)
  }

  /** backPlateSceneIndex.cpp:922-951 */
  getChildPrimPaths(primPath: string): string[] {
    // Case 1: The prim path is the camera prim's path. Return all back plate
    // instances.
    const backPlates = this._cameraToBackPlates.get(primPath)
    if (backPlates !== undefined) {
      const paths = this._getInputSceneIndex().getChildPrimPaths(primPath)
      for (const name of backPlates) {
        paths.push(_AppendChild(primPath, name))
      }
      return paths
    }

    // Case 2: The prim path is a back plate path. Return mesh and material
    // children prims.
    if (this._isBackPlateInMap(primPath)) {
      const meshPath = _AppendChild(primPath, _backPlatePrimsTokens.mesh)
      const materialPath = _AppendChild(primPath, _backPlatePrimsTokens.material)
      return [meshPath, materialPath]
    }

    // Case 3: Any other prim including back plate mesh/material prims
    return this._getInputSceneIndex().getChildPrimPaths(primPath)
  }

  /** backPlateSceneIndex.cpp:953-982 */
  private _addBackPlateChildren(
    cameraPrimPath: string, addedBackPlatePrims: Set<string> | undefined,
  ): void {
    const cameraSchema = HdCameraSchema.getFromParent(
      this._getInputSceneIndex().getPrim(cameraPrimPath).dataSource)
    if (!cameraSchema.isDefined()) {
      return
    }

    const backPlatesSchema = cameraSchema.getBackPlate()
    const names = backPlatesSchema.getNames()

    const backPlates = new Set<string>()
    for (const name of names) {
      if (addedBackPlatePrims) {
        const meshPath = _BuildBackPlatePrimPath(
          cameraPrimPath, name, _backPlatePrimsTokens.mesh)
        const materialPath = _BuildBackPlatePrimPath(
          cameraPrimPath, name, _backPlatePrimsTokens.material)
        addedBackPlatePrims.add(_AppendChild(cameraPrimPath, name))
        addedBackPlatePrims.add(meshPath)
        addedBackPlatePrims.add(materialPath)
      }
      backPlates.add(name)
    }
    // std::map::emplace does not replace an existing entry.
    if (backPlates.size > 0 && !this._cameraToBackPlates.has(cameraPrimPath)) {
      this._cameraToBackPlates.set(cameraPrimPath, backPlates)
    }
  }

  /** backPlateSceneIndex.cpp:984-1022 */
  private _dirtyBackPlateChildren(
    cameraPrimPath: string, dirtiedBackPlatePrims: DirtiedPrimEntry[] | undefined,
  ): void {
    if (!dirtiedBackPlatePrims) {
      return
    }

    const cameraSchema = HdCameraSchema.getFromParent(
      this._getInputSceneIndex().getPrim(cameraPrimPath).dataSource)
    if (!cameraSchema.isDefined()) {
      return
    }

    const backPlatesSchema = cameraSchema.getBackPlate()
    const names = backPlatesSchema.getNames()

    for (const name of names) {
      const meshPath = _BuildBackPlatePrimPath(
        cameraPrimPath, name, _backPlatePrimsTokens.mesh)
      const materialPath = _BuildBackPlatePrimPath(
        cameraPrimPath, name, _backPlatePrimsTokens.material)
      dirtiedBackPlatePrims.push({
        primPath: meshPath,
        dirtyLocators: new HdDataSourceLocatorSet([
          HdMaterialSchema.getDefaultLocator(),
          HdPrimvarsSchema.getDefaultLocator(),
          HdXformSchema.getDefaultLocator()]),
      })
      dirtiedBackPlatePrims.push({
        primPath: materialPath,
        dirtyLocators: new HdDataSourceLocatorSet([
          HdMaterialSchema.getDefaultLocator()]),
      })
    }
  }

  /** backPlateSceneIndex.cpp:1024-1040: erases the entries of the cameras
   *  at or under primPath (std::map::lower_bound + HasPrefix). */
  private _removeBackPlateChildren(
    primPath: string, removedBackPlatePrims: Set<string> | undefined,
  ): void {
    const prefix = SdfPath.fromString(primPath)
    const cameras = [...this._cameraToBackPlates.keys()]
      .filter((cameraPath) => SdfPath.fromString(cameraPath).hasPrefix(prefix))
      .sort(_PathCompare)
    for (const cameraPath of cameras) {
      if (removedBackPlatePrims) {
        for (const name of this._cameraToBackPlates.get(cameraPath)!) {
          removedBackPlatePrims.add(_AppendChild(cameraPath, name))
        }
      }
      this._cameraToBackPlates.delete(cameraPath)
    }
  }

  /** backPlateSceneIndex.cpp:1042-1077 */
  protected _primsAdded(_sender: HdSceneIndexBase, entries: AddedPrimEntry[]): void {
    const isObserved = this._isObserved()

    const addedBackPlatePrims = new Set<string>()
    const removedBackPlatePrims = new Set<string>()

    for (const entry of entries) {
      this._removeBackPlateChildren(
        entry.primPath, isObserved ? removedBackPlatePrims : undefined)
      // Check if camera is entry prim to avoid querying GetPrim() on input
      // scene index.
      if (entry.primType === HdPrimTypeTokens.camera) {
        this._addBackPlateChildren(
          entry.primPath, isObserved ? addedBackPlatePrims : undefined)
      }
    }
    if (!isObserved) {
      return
    }

    this._sendPrimsAdded(entries)

    if (removedBackPlatePrims.size > 0) {
      this._sendPrimsRemoved(_ToRemovedPrimEntries(_SortedPathSet(removedBackPlatePrims)))
    }

    if (addedBackPlatePrims.size > 0) {
      this._sendPrimsAdded(_ToAddedPrimEntries(_SortedPathSet(addedBackPlatePrims)))
    }
  }

  /** backPlateSceneIndex.cpp:1079-1097 */
  protected _primsRemoved(_sender: HdSceneIndexBase, entries: RemovedPrimEntry[]): void {
    if (this._cameraToBackPlates.size > 0) {
      for (const entry of entries) {
        this._removeBackPlateChildren(entry.primPath, undefined)
      }
    }

    if (!this._isObserved()) {
      return
    }

    this._sendPrimsRemoved(entries)
  }

  /** backPlateSceneIndex.cpp:1099-1149 */
  protected _primsDirtied(_sender: HdSceneIndexBase, entries: DirtiedPrimEntry[]): void {
    const isObserved = this._isObserved()

    const dirtiedBackPlatePrims: DirtiedPrimEntry[] = []
    const addedBackPlatePrims = new Set<string>()
    const removedBackPlatePrims = new Set<string>()

    for (const entry of entries) {
      if (entry.dirtyLocators.intersects(HdCameraSchema.getBackPlateLocator())) {
        this._removeBackPlateChildren(
          entry.primPath, isObserved ? removedBackPlatePrims : undefined)
        this._addBackPlateChildren(
          entry.primPath, isObserved ? addedBackPlatePrims : undefined)
      }
      if (this._cameraToBackPlates.size > 0 &&
          (entry.dirtyLocators.intersects(HdCameraSchema.getDefaultLocator()) ||
           entry.dirtyLocators.intersects(HdXformSchema.getDefaultLocator()))) {
        this._dirtyBackPlateChildren(
          entry.primPath, isObserved ? dirtiedBackPlatePrims : undefined)
      }
    }

    if (!isObserved) {
      return
    }

    this._sendPrimsDirtied(entries)

    if (dirtiedBackPlatePrims.length > 0) {
      this._sendPrimsDirtied(dirtiedBackPlatePrims)
    }
    if (removedBackPlatePrims.size > 0) {
      this._sendPrimsRemoved(_ToRemovedPrimEntries(_SortedPathSet(removedBackPlatePrims)))
    }
    if (addedBackPlatePrims.size > 0) {
      this._sendPrimsAdded(_ToAddedPrimEntries(_SortedPathSet(addedBackPlatePrims)))
    }
  }
}

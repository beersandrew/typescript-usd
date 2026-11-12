// Ported from OpenUSD 26.11.1: pxr/imaging/hdx/taskControllerSceneIndex.cpp,
//  pxr/imaging/hdx/taskControllerSceneIndex.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdx/taskControllerSceneIndex.{h,cpp} (OpenUSD
// 26.11.1).
//
// Divergences:
// - The C++ templates over the task type (_TaskPrimName<Task>,
//   _TaskAddEntry<Task>, _GetTaskParamsForTask<Task>, ...) take a _TaskInfo
//   record here: the task class, its params class and its prim name.
// - Task params live in the _LegacyTaskSchemaDataSource of each task prim and
//   are edited in place before dirtying the prim, as upstream does through the
//   pointers _GetTaskParams returns. Comparisons are the params' Equals
//   (operator==); copies are Clone().
// - _SafeAovPrimName (taskControllerSceneIndex.cpp:119-131) appends
//   TfToken::Hash() for AOV names that are not identifiers; a token's hash is
//   process specific upstream, TfHash of the name here.
// - std::optional<CameraUtilConformWindowPolicy> is `policy | undefined`.
// - HDX_MSAA_SAMPLE_COUNT is a TfEnvSetting read from the environment where
//   one exists (the browser has none: its default 4).
// - TfRefPtr / TfCreateRefPtr: New() returns the object.

import { Hash as TfHash, Token as TfToken, Type as TfType, TfEnvSetting, TfGetEnvSetting, isValidIdentifier, makeValidIdentifier } from 'typescript-usd/tf'
import {
  Matrix4d as GfMatrix4d,
  Vec2i as GfVec2i,
  Vec3d as GfVec3d,
  Vec3f as GfVec3f,
  Vec3i as GfVec3i,
  Vec4d as GfVec4d,
  Vec4f as GfVec4f,
  Vec4i as GfVec4i,
} from 'typescript-usd/gf'
import { Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { AssetPath as SdfAssetPath } from 'typescript-usd/sdf'
import {
  AovDescriptor as HdAovDescriptor,
  AovTokens as HdAovTokens,
  ContainerDataSource as HdContainerDataSource,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  Format as HdFormat,
  LegacyTaskSchema as HdLegacyTaskSchema,
  LegacyTaskSchemaTokens as HdLegacyTaskSchemaTokens,
  LightSchema as HdLightSchema,
  LightTokens as HdLightTokens,
  MakeLegacyTaskFactory as HdMakeLegacyTaskFactory,
  MaterialConnectionSchema as HdMaterialConnectionSchema,
  MaterialNetworkSchema as HdMaterialNetworkSchema,
  MaterialNodeParameterSchema as HdMaterialNodeParameterSchema,
  MaterialNodeSchema as HdMaterialNodeSchema,
  MaterialSchema as HdMaterialSchema,
  MaterialSchemaTokens as HdMaterialSchemaTokens,
  MaterialTerminalTokens as HdMaterialTerminalTokens,
  PrimTypeTokens as HdPrimTypeTokens,
  RenderBufferSchema as HdRenderBufferSchema,
  RenderBufferSchemaTokens as HdRenderBufferSchemaTokens,
  RenderPassAovBinding as HdRenderPassAovBinding,
  RenderTagTokens as HdRenderTagTokens,
  ReprSelector as HdReprSelector,
  ReprTokens as HdReprTokens,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedSceneIndex as HdRetainedSceneIndex,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  RprimCollection as HdRprimCollection,
  SceneIndexBase as HdSceneIndexBase,
  Tokens as HdTokens,
  XformSchema as HdXformSchema,
  type AddedPrimEntry as HdAddedPrimEntry,
  type DataSourceBase as HdDataSourceBase,
  type DirtiedPrimEntry as HdDirtiedPrimEntry,
  type LegacyTaskFactory as HdLegacyTaskFactory,
  type RemovedPrimEntry as HdRemovedPrimEntry,
  type RenamedPrimEntry as HdRenamedPrimEntry,
  type RetainedAddedPrimEntry as HdRetainedAddedPrimEntry,
  type RetainedDirtiedPrimEntry as HdRetainedDirtiedPrimEntry,
  type SceneDelegate as HdSceneDelegate,
  type SceneIndexObserver as HdSceneIndexObserver,
  type SceneIndexPrim as HdSceneIndexPrim,
  type Task as HdTask,
} from 'typescript-usd/hd'
import type { Framing as CameraUtilFraming, ConformWindowPolicy as CameraUtilConformWindowPolicy } from 'typescript-usd/cameraUtil'
import { Framing as CameraUtilFramingClass } from 'typescript-usd/cameraUtil'
import type { SimpleLight as GlfSimpleLight, SimpleLightingContext as GlfSimpleLightingContext } from 'typescript-usd/glf'
import { SimpleLightType as GlfSimpleLightType } from 'typescript-usd/glf'
import { MaterialTagTokens as HdStMaterialTagTokens, RenderBufferTokens as HdStRenderBufferTokens } from 'typescript-usd/hdSt'
import { HdxAovInputTask, HdxAovInputTaskParams } from './aovInputTask.ts'
import { HdxBoundingBoxTask, HdxBoundingBoxTaskParams } from './boundingBoxTask.ts'
import { HdxColorizeSelectionTask, HdxColorizeSelectionTaskParams } from './colorizeSelectionTask.ts'
import { HdxColorCorrectionTask, HdxColorCorrectionTaskParams } from './colorCorrectionTask.ts'
import { HdxFreeCameraPrimDataSource } from './freeCameraPrimDataSource.ts'
import { HdxOitRenderTask } from './oitRenderTask.ts'
import { HdxOitResolveTask, HdxOitResolveTaskParams } from './oitResolveTask.ts'
import { HdxOitVolumeRenderTask } from './oitVolumeRenderTask.ts'
import { HdxPackageDefaultDomeLightTexture } from './package.ts'
import { HdxPickTask, HdxPickTaskParams } from './pickTask.ts'
import { HdxPickFromRenderBufferTask, HdxPickFromRenderBufferTaskParams } from './pickFromRenderBufferTask.ts'
import { HdxPresentTask, HdxPresentTaskParams } from './presentTask.ts'
import { HdxRenderTask } from './renderTask.ts'
import { HdxRenderTaskParams } from './renderSetupTask.ts'
import { HdxSelectionTask, HdxSelectionTaskParams } from './selectionTask.ts'
import { HdxSimpleLightTask, HdxSimpleLightTaskParams } from './simpleLightTask.ts'
import { HdxSkydomeTask } from './skydomeTask.ts'
import { HdxShadowTask, HdxShadowTaskParams } from './shadowTask.ts'
import { HdxVisualizeAovTask, HdxVisualizeAovTaskParams } from './visualizeAovTask.ts'
import { HdxColorCorrectionTokens } from './tokens.ts'
import { TF_CODING_ERROR, TF_VERIFY, TF_WARN } from './tfDiagnostic.ts'

/** taskControllerSceneIndex.cpp:45-66 */
const _primNameTokens = {
  camera: 'camera',
  AOVs: 'AOVs',
  lights: 'lights',

  colorizeSelectionTask: 'colorizeSelectionTask',
  pickTask: 'pickTask',
  renderTask: 'renderTask',
  aovInputTask: 'aovInputTask',
  simpleLightTask: 'simpleLightTask',
  shadowTask: 'shadowTask',
  skydomeTask: 'skydomeTask',
  oitResolveTask: 'oitResolveTask',
  presentTask: 'presentTask',
  visualizeAovTask: 'visualizeAovTask',
  colorCorrectionTask: 'colorCorrectionTask',
  selectionTask: 'selectionTask',
  pickFromRenderBufferTask: 'pickFromRenderBufferTask',
  boundingBoxTask: 'boundingBoxTask',
} as const

/** taskControllerSceneIndex.cpp:68-75 */
const _materialTokens = {
  lightShader: 'lightShader',
  PxrDistantLight: 'PxrDistantLight',
  PxrDomeLight: 'PxrDomeLight',
} as const

/** taskControllerSceneIndex.cpp:77-78 */
export const HDX_MSAA_SAMPLE_COUNT = new TfEnvSetting<number>('HDX_MSAA_SAMPLE_COUNT', 4,
  'MSAA sample count. Set to 1 to disable MSAA.')

// taskControllerSceneIndex.cpp:80-82: Distant Light values
const DISTANT_LIGHT_ANGLE = Math.fround(0.53)
const DISTANT_LIGHT_INTENSITY = Math.fround(15000.0)

/** Params classes have Clone() and Equals() (operator==). */
interface _Params {
  Clone(): _Params
  Equals?(rhs: never): boolean
}
type _ParamsCtor<P> = new () => P

/** The task type a C++ template parameter stands for: the task class
 *  (HdMakeLegacyTaskFactory<Task>), its TaskParams and the prim name
 *  (_TaskPrimName<Task>). */
interface _TaskInfo<P> {
  task: new (delegate: HdSceneDelegate, id: string) => HdTask
  params: _ParamsCtor<P>
  primName: string
  factory?: HdLegacyTaskFactory
}

function _Task<P>(task: _TaskInfo<P>['task'], params: _ParamsCtor<P>, primName: string): _TaskInfo<P> {
  return { task, params, primName }
}

// taskControllerSceneIndex.cpp:155-449 (_TaskPrimName<Task>
// specializations).
const _tasks = {
  simpleLight: _Task(HdxSimpleLightTask, HdxSimpleLightTaskParams, _primNameTokens.simpleLightTask),
  shadow: _Task(HdxShadowTask, HdxShadowTaskParams, _primNameTokens.shadowTask),
  skydome: _Task(HdxSkydomeTask, HdxRenderTaskParams, _primNameTokens.skydomeTask),
  render: _Task(HdxRenderTask, HdxRenderTaskParams, _primNameTokens.renderTask),
  oitRender: _Task(HdxOitRenderTask, HdxRenderTaskParams, ''),
  oitVolumeRender: _Task(HdxOitVolumeRenderTask, HdxRenderTaskParams, ''),
  aovInput: _Task(HdxAovInputTask, HdxAovInputTaskParams, _primNameTokens.aovInputTask),
  oitResolve: _Task(HdxOitResolveTask, HdxOitResolveTaskParams, _primNameTokens.oitResolveTask),
  selection: _Task(HdxSelectionTask, HdxSelectionTaskParams, _primNameTokens.selectionTask),
  colorizeSelection: _Task(HdxColorizeSelectionTask, HdxColorizeSelectionTaskParams,
    _primNameTokens.colorizeSelectionTask),
  colorCorrection: _Task(HdxColorCorrectionTask, HdxColorCorrectionTaskParams,
    _primNameTokens.colorCorrectionTask),
  visualizeAov: _Task(HdxVisualizeAovTask, HdxVisualizeAovTaskParams, _primNameTokens.visualizeAovTask),
  present: _Task(HdxPresentTask, HdxPresentTaskParams, _primNameTokens.presentTask),
  pick: _Task(HdxPickTask, HdxPickTaskParams, _primNameTokens.pickTask),
  pickFromRenderBuffer: _Task(HdxPickFromRenderBufferTask, HdxPickFromRenderBufferTaskParams,
    _primNameTokens.pickFromRenderBufferTask),
  boundingBox: _Task(HdxBoundingBoxTask, HdxBoundingBoxTaskParams, _primNameTokens.boundingBoxTask),
}

function _Equals(a: unknown, b: unknown): boolean {
  if (a === b) return true
  const eq = (a as { Equals?: (rhs: unknown) => boolean } | null)?.Equals
  if (typeof eq === 'function') return eq.call(a, b)
  const eq2 = (a as { equals?: (rhs: unknown) => boolean } | null)?.equals
  if (typeof eq2 === 'function') return eq2.call(a, b)
  return false
}

function _ChildPath(parent: string, name: string): string {
  return parent === '/' ? `/${name}` : `${parent}/${name}`
}

/** taskControllerSceneIndex.cpp:93-97 */
function _CameraPath(prefix: string): string {
  return _ChildPath(prefix, _primNameTokens.camera)
}

/** taskControllerSceneIndex.cpp:103-112 */
function _TaskPrimPath<P>(prefix: string, task: _TaskInfo<P>): string {
  return _ChildPath(prefix, task.primName)
}

/** taskControllerSceneIndex.cpp:114-118. Scope for all render buffers (for
 *  AOVs) - so that we can easily find them. */
function _AovScopePath(prefix: string): string {
  return _ChildPath(prefix, _primNameTokens.AOVs)
}

/** taskControllerSceneIndex.cpp:120-132 (see the header). */
function _SafeAovPrimName(name: string): string {
  if (isValidIdentifier(name)) {
    return name
  } else {
    return `${makeValidIdentifier(name)}_Hash${BigInt.asUintN(64, BigInt(TfHash(name)))}`
  }
}

/** taskControllerSceneIndex.cpp:134-138 */
function _AovPath(prefix: string, name: string): string {
  return _ChildPath(_AovScopePath(prefix), _SafeAovPrimName(name))
}

/** taskControllerSceneIndex.cpp:140-146. Scope for all lights managed by
 *  this scene index - so that we can easily find them. */
function _LightScopePath(prefix: string): string {
  return _ChildPath(prefix, _primNameTokens.lights)
}

/** taskControllerSceneIndex.cpp:148-153 */
function _LightPath(prefix: string, i: number): string {
  return _ChildPath(_LightScopePath(prefix), `light_${i}`)
}

/** taskControllerSceneIndex.cpp:163-169 */
function _SimpleLightTaskParams(prefix: string): HdxSimpleLightTaskParams {
  const params = new HdxSimpleLightTaskParams()
  params.cameraPath = _CameraPath(prefix)
  return params
}

/** taskControllerSceneIndex.cpp:189-197 */
function _SkydomeTaskCollection(): HdRprimCollection {
  return new HdRprimCollection(
    HdTokens.geometry,
    new HdReprSelector(HdReprTokens.smoothHull),
    /* forcedRepr = */ false,
    HdStMaterialTagTokens.defaultMaterialTag)
}

/** taskControllerSceneIndex.cpp:207-217 */
function _RenderTaskCollection(materialTag = ''): HdRprimCollection {
  const collection = new HdRprimCollection(
    HdTokens.geometry,
    new HdReprSelector(HdReprTokens.smoothHull),
    /* forcedRepr = */ false,
    materialTag)
  collection.setRootPath('/')
  return collection
}

/** taskControllerSceneIndex.cpp:222-227 */
function _StormRenderTaskPath(prefix: string, materialTag: string): string {
  return _ChildPath(prefix, `renderTask_${materialTag}`)
}

/** taskControllerSceneIndex.cpp:233-242. The default and masked material
 *  tags share the same blend state, but we classify them as separate because
 *  in the general case, masked materials use fragment shader discards while
 *  the defaultMaterialTag should not. */
function _StormRenderTaskParamsDefaultMaterialTagAndMasked(): HdxRenderTaskParams {
  const params = new HdxRenderTaskParams()
  params.blendEnable = false
  params.depthMaskEnable = true
  params.enableAlphaToCoverage = true

  return params
}

/** taskControllerSceneIndex.cpp:244-283 */
function _StormRenderTaskParamsAdditive(): HdxRenderTaskParams {
  const params = new HdxRenderTaskParams()
  // Additive blend -- so no sorting of drawItems is needed
  params.blendEnable = true
  // For color, we are setting all factors to ONE.
  //
  // This means we are expecting pre-multiplied alpha coming out
  // of the shader: vec4(rgb*a, a).  Setting ColorSrc to
  // HdBlendFactorSourceAlpha would give less control on the
  // shader side, since it means we would force a pre-multiplied
  // alpha step on the color coming out of the shader.
  params.blendColorOp = 0 /* HdBlendOpAdd */
  params.blendColorSrcFactor = 1 /* HdBlendFactorOne */
  params.blendColorDstFactor = 1 /* HdBlendFactorOne */

  // For alpha, we set the factors so that the alpha in the
  // framebuffer won't change.  Recall that the geometry in the
  // additive render pass is supposed to be emitting light but
  // be fully transparent, that is alpha = 0, so that the order
  // in which it is drawn doesn't matter.
  params.blendAlphaOp = 0 /* HdBlendOpAdd */
  params.blendAlphaSrcFactor = 0 /* HdBlendFactorZero */
  params.blendAlphaDstFactor = 1 /* HdBlendFactorOne */

  // Translucent objects should not block each other in depth buffer
  params.depthMaskEnable = false

  // Since we are using alpha blending, we disable screen door
  // transparency for this renderpass.
  params.enableAlphaToCoverage = false

  return params
}

/** taskControllerSceneIndex.cpp:285-295 */
function _StormRenderTaskParamsTranslucent(): HdxRenderTaskParams {
  const params = new HdxRenderTaskParams()

  // OIT is using its own buffers which are only per pixel and not per
  // sample. Thus, we resolve the AOVs before starting to render any
  // OIT geometry and only use the resolved AOVs from then on.
  params.useAovMultiSample = false

  return params
}

/** taskControllerSceneIndex.cpp:297-310 */
function _StormRenderTaskParamsVolume(): HdxRenderTaskParams {
  const params = new HdxRenderTaskParams()

  // See above comment about OIT.
  params.useAovMultiSample = false

  // Disable alpha-to-coverage for the volume render task, as nothing
  // (including alpha) gets written to fragments during this task.
  params.enableAlphaToCoverage = false

  return params
}

/** taskControllerSceneIndex.cpp:330-339 */
function _OitResolveTaskParams(): HdxOitResolveTaskParams {
  const params = new HdxOitResolveTaskParams()
  // OIT is using its own buffers which are only per pixel and not per
  // sample. Thus, we resolve the AOVs before starting to render any
  // OIT geometry and only use the resolved AOVs from then on.
  params.useAovMultiSample = false
  return params
}

/** taskControllerSceneIndex.cpp:350-359 */
function _SelectionTaskParams(): HdxSelectionTaskParams {
  const params = new HdxSelectionTaskParams()
  params.enableSelectionHighlight = true
  params.enableLocateHighlight = true
  params.selectionColor = new GfVec4f(1, 1, 0, 1)
  params.locateColor = new GfVec4f(0, 0, 1, 1)
  return params
}

/** taskControllerSceneIndex.cpp:370-379 */
function _ColorizeSelectionTaskParams(): HdxColorizeSelectionTaskParams {
  const params = new HdxColorizeSelectionTaskParams()
  params.enableSelectionHighlight = true
  params.enableLocateHighlight = true
  params.selectionColor = new GfVec4f(0.2, 1.0, 0.4, 1.0)
  params.locateColor = new GfVec4f(0.0, 0.0, 1.0, 1.0)
  return params
}

/** taskControllerSceneIndex.cpp:450-494. Data source for locator "task"
 *  conforming to HdLegacyTaskSchema. */
class _LegacyTaskSchemaDataSource<P> extends HdContainerDataSource {
  constructor(
    public factory: HdLegacyTaskFactory,
    public params: P,
    public collection: HdRprimCollection,
    public renderTags: string[],
  ) {
    super()
  }

  static cast(ds: HdDataSourceBase | undefined): _LegacyTaskSchemaDataSource<unknown> | undefined {
    return ds instanceof _LegacyTaskSchemaDataSource ? ds : undefined
  }

  Get(name: string): HdDataSourceBase | undefined {
    if (name === HdLegacyTaskSchemaTokens.factory) {
      return HdRetainedTypedSampledDataSource.new(this.factory)
    }
    if (name === HdLegacyTaskSchemaTokens.parameters) {
      return HdRetainedTypedSampledDataSource.new(this.params)
    }
    if (name === HdLegacyTaskSchemaTokens.collection) {
      return HdRetainedTypedSampledDataSource.new(this.collection)
    }
    if (name === HdLegacyTaskSchemaTokens.renderTags) {
      return HdRetainedTypedSampledDataSource.new(this.renderTags)
    }
    return undefined
  }

  getNames(): string[] {
    return [
      HdLegacyTaskSchemaTokens.factory,
      HdLegacyTaskSchemaTokens.parameters,
      HdLegacyTaskSchemaTokens.collection,
      HdLegacyTaskSchemaTokens.renderTags,
    ]
  }
}

/** taskControllerSceneIndex.cpp:496-510. Data for a task prim. */
function _TaskPrimDataSource<P>(task: _TaskInfo<P>, params: P,
  collection: HdRprimCollection, renderTags: string[]): HdContainerDataSource {
  task.factory ??= HdMakeLegacyTaskFactory(task.task)

  return HdRetainedContainerDataSource.new(
    [HdLegacyTaskSchema.getSchemaToken()],
    [new _LegacyTaskSchemaDataSource(task.factory, params, collection, renderTags)])
}

/** taskControllerSceneIndex.cpp:512-528. Entry to add task prim to a
 *  retained scene index. Prim path is determined from prefix and task
 *  type. */
function _TaskAddEntry<P>(prefix: string, task: _TaskInfo<P>,
  params: P = new task.params(), collection: HdRprimCollection = new HdRprimCollection(),
  renderTags: string[] = []): HdRetainedAddedPrimEntry {
  return {
    primPath: _TaskPrimPath(prefix, task),
    primType: HdPrimTypeTokens.task,
    dataSource: _TaskPrimDataSource(task, params, collection, renderTags),
  }
}

/** taskControllerSceneIndex.cpp:530-537 */
function _GetTaskSchemaDataSource(primSource: HdContainerDataSource | undefined):
  _LegacyTaskSchemaDataSource<unknown> | undefined {
  return _LegacyTaskSchemaDataSource.cast(
    HdLegacyTaskSchema.getFromParent(primSource).getContainer())
}

/** taskControllerSceneIndex.cpp:539-563. Get task params at a path, if of
 *  the expected type. */
function _GetTaskParamsAtPath<P>(sceneIndex: HdSceneIndexBase, path: string,
  ctor: _ParamsCtor<P>): P | null {
  const prim = sceneIndex.getPrim(path)
  const ds = _GetTaskSchemaDataSource(prim.dataSource)
  if (!ds || !(ds.params instanceof ctor)) {
    return null
  }
  return ds.params as P
}

/** taskControllerSceneIndex.cpp:565-576. Get task params from the retained
 *  scene index. Prim path is determined from prefix and task type. */
function _GetTaskParamsForTask<P>(sceneIndex: HdSceneIndexBase, prefix: string,
  task: _TaskInfo<P>): P | null {
  return _GetTaskParamsAtPath(sceneIndex, _TaskPrimPath(prefix, task), task.params)
}

/** taskControllerSceneIndex.cpp:578-590. Get collection from task data
 *  source. */
function _GetTaskDataSourceAtPath(sceneIndex: HdSceneIndexBase, path: string):
  _LegacyTaskSchemaDataSource<unknown> | undefined {
  const prim = sceneIndex.getPrim(path)
  const ds = _GetTaskSchemaDataSource(prim.dataSource)
  return ds && ds.params instanceof HdxRenderTaskParams ? ds : undefined
}

/** taskControllerSceneIndex.cpp:624-635. Entry to dirty task params in a
 *  retained scene index. */
function _AddDirtyParamsEntry<P>(prefix: string, task: _TaskInfo<P>,
  entries: HdRetainedDirtiedPrimEntry[]): void {
  entries.push({
    primPath: _TaskPrimPath(prefix, task),
    dirtyLocators: new HdDataSourceLocatorSet(HdLegacyTaskSchema.getParametersLocator()),
  })
}

/** taskControllerSceneIndex.cpp:637-647. Dirty task params in retained
 *  scene index. */
function _SendDirtyParamsEntry<P>(retainedSceneIndex: HdRetainedSceneIndex, prefix: string,
  task: _TaskInfo<P>): void {
  const entries: HdRetainedDirtiedPrimEntry[] = []
  _AddDirtyParamsEntry(prefix, task, entries)
  retainedSceneIndex.dirtyPrims(entries)
}

/** taskControllerSceneIndex.cpp:649-663 */
function _StormRenderTaskAddEntry(prefix: string, task: _TaskInfo<HdxRenderTaskParams>,
  materialTag: string, params: HdxRenderTaskParams): HdRetainedAddedPrimEntry {
  return {
    primPath: _StormRenderTaskPath(prefix, materialTag),
    primType: HdPrimTypeTokens.task,
    dataSource: _TaskPrimDataSource(task,
      params,
      _RenderTaskCollection(materialTag),
      [HdRenderTagTokens.geometry]),
  }
}

/** taskControllerSceneIndex.cpp:665-718. Data source conforming to
 *  HdRenderBufferSchema. */
class _RenderBufferSchemaDataSource extends HdContainerDataSource {
  constructor(
    public dimensions: GfVec3i,
    public format: HdFormat,
    public multiSampled: boolean,
    public msaaSampleCount: number,
  ) {
    super()
  }

  static cast(ds: HdDataSourceBase | undefined): _RenderBufferSchemaDataSource | undefined {
    return ds instanceof _RenderBufferSchemaDataSource ? ds : undefined
  }

  Get(name: string): HdDataSourceBase | undefined {
    if (name === HdRenderBufferSchemaTokens.dimensions) {
      return new HdRetainedTypedSampledDataSource(this.dimensions, VtValueTypes.GfVec3i)
    }
    if (name === HdRenderBufferSchemaTokens.format) {
      return HdRetainedTypedSampledDataSource.new(this.format)
    }
    if (name === HdRenderBufferSchemaTokens.multiSampled) {
      return new HdRetainedTypedSampledDataSource(this.multiSampled, VtValueTypes.bool)
    }
    if (name === HdStRenderBufferTokens.stormMsaaSampleCount) {
      return new HdRetainedTypedSampledDataSource(this.msaaSampleCount, VtValueTypes.uint)
    }
    return undefined
  }

  getNames(): string[] {
    return [
      HdRenderBufferSchemaTokens.dimensions,
      HdRenderBufferSchemaTokens.format,
      HdRenderBufferSchemaTokens.multiSampled,
      HdStRenderBufferTokens.stormMsaaSampleCount,
    ]
  }
}

/** taskControllerSceneIndex.cpp:722-735. Data source for a render buffer
 *  prim. */
function _RenderBufferPrimDataSource(dimensions: GfVec3i, format: HdFormat,
  multiSampled: boolean, msaaSampleCount: number): HdContainerDataSource {
  return HdRetainedContainerDataSource.new(
    [HdRenderBufferSchema.getSchemaToken()],
    [new _RenderBufferSchemaDataSource(dimensions, format, multiSampled, msaaSampleCount)])
}

/** taskControllerSceneIndex.cpp:740-751 */
let _defaultDomeLightAssetPath: SdfAssetPath | null = null
function _DomeLightTexture(light: GlfSimpleLight): SdfAssetPath {
  const assetPath = light.getDomeLightTextureFile()
  if (assetPath.equals(new SdfAssetPath())) {
    return (_defaultDomeLightAssetPath ??= new SdfAssetPath(
      HdxPackageDefaultDomeLightTexture(),
      HdxPackageDefaultDomeLightTexture()))
  }
  return assetPath
}

const _SdfAssetPathType = TfType.declare('SdfAssetPath')
const _float = (x: number) => new HdRetainedTypedSampledDataSource(Math.fround(x), VtValueTypes.float)
const _bool = (x: boolean) => new HdRetainedTypedSampledDataSource(x, VtValueTypes.bool)

/** taskControllerSceneIndex.cpp:755-845. Data source for locator "light"
 *  conforming to HdLightSchema. */
class _LightSchemaDataSource extends HdContainerDataSource {
  constructor(public readonly light: { value: GlfSimpleLight }, private readonly _isForStorm: boolean) {
    super()
  }

  Get(name: string): HdDataSourceBase | undefined {
    const light = this.light.value
    if (name === HdLightTokens.intensity) {
      if (!this._isForStorm && !light.isDomeLight()) {
        // Initialize distant light specific parameters
        return _float(DISTANT_LIGHT_INTENSITY)
      } else {
        return _float(1.0)
      }
    }
    if (name === HdLightTokens.exposure) {
      return _float(0.0)
    }
    if (name === HdLightTokens.normalize) {
      return _bool(false)
    }
    if (name === HdLightTokens.color) {
      return new HdRetainedTypedSampledDataSource(new GfVec3f(1, 1, 1), VtValueTypes.GfVec3f)
    }
    if (name === HdLightTokens.angle) {
      if (!this._isForStorm && !light.isDomeLight()) {
        // Initialize distant light specific parameters
        return _float(DISTANT_LIGHT_ANGLE)
      } else {
        return undefined
      }
    }
    if (name === HdLightTokens.shadowEnable) {
      if (light.isDomeLight()) {
        return _bool(true)
      }
      if (!this._isForStorm) {
        // Initialize distant light specific parameters
        return _bool(false)
      }
      return undefined
    }
    if (name === HdLightTokens.params) {
      return new HdRetainedTypedSampledDataSource(light, GlfSimpleLightType)
    }
    if (name === HdLightTokens.textureFile) {
      if (light.isDomeLight()) {
        return new HdRetainedTypedSampledDataSource(_DomeLightTexture(light), _SdfAssetPathType)
      }
      return undefined
    }

    return undefined
  }

  getNames(): string[] {
    return [
      HdLightTokens.intensity,
      HdLightTokens.exposure,
      HdLightTokens.normalize,
      HdLightTokens.color,
      HdLightTokens.shadowEnable,
      HdLightTokens.params,
      HdLightTokens.textureFile,
    ]
  }
}

/** taskControllerSceneIndex.cpp:847-864 */
function _MaterialNodeIdentifier(isDomeLight: boolean): HdDataSourceBase {
  // XXX Using these Pxr**Light tokens works for now since HdPrman is
  // currently the only renderer that supports material networks for lights.
  if (isDomeLight) {
    return new HdRetainedTypedSampledDataSource(_materialTokens.PxrDomeLight, VtValueTypes.token)
  } else {
    return new HdRetainedTypedSampledDataSource(_materialTokens.PxrDistantLight, VtValueTypes.token)
  }
}

/** taskControllerSceneIndex.cpp:866-874 */
function _ToMaterialNodeParameter(value: HdDataSourceBase): HdContainerDataSource {
  return new HdMaterialNodeParameterSchema.Builder()
    .setValue(value as never)
    .build()
}

/** taskControllerSceneIndex.cpp:876-882 */
function _TransformFromPosition(position: GfVec4d | GfVec4f): GfMatrix4d {
  return new GfMatrix4d(1.0)
    .setTranslateOnly(new GfVec3d(position.get(0), position.get(1), position.get(2)))
}

/** taskControllerSceneIndex.cpp:884-941 */
function _MaterialNodeParameters(light: GlfSimpleLight): HdContainerDataSource {
  const names: string[] = []
  const values: HdDataSourceBase[] = []

  names.push(HdLightTokens.exposure)
  values.push(_ToMaterialNodeParameter(_float(0.0)))

  names.push(HdLightTokens.normalize)
  values.push(_ToMaterialNodeParameter(_bool(false)))

  names.push(HdLightTokens.color)
  values.push(_ToMaterialNodeParameter(
    new HdRetainedTypedSampledDataSource(new GfVec3f(1, 1, 1), VtValueTypes.GfVec3f)))

  const matrix = (m: GfMatrix4d) => new HdRetainedTypedSampledDataSource(m, VtValueTypes.GfMatrix4d)
  if (light.isDomeLight()) {
    names.push(HdTokens.transform)
    values.push(_ToMaterialNodeParameter(matrix(light.getTransform())))

    names.push(HdLightTokens.intensity)
    values.push(_ToMaterialNodeParameter(_float(1.0)))

    names.push(HdLightTokens.shadowEnable)
    values.push(_ToMaterialNodeParameter(_bool(true)))

    names.push(HdLightTokens.textureFile)
    values.push(_ToMaterialNodeParameter(
      new HdRetainedTypedSampledDataSource(_DomeLightTexture(light), _SdfAssetPathType)))
  } else {
    // For the camera light, initialize the transform based on the
    // SimpleLight position
    names.push(HdTokens.transform)
    values.push(_ToMaterialNodeParameter(matrix(_TransformFromPosition(light.getPosition()))))

    names.push(HdLightTokens.intensity)
    values.push(_ToMaterialNodeParameter(_float(DISTANT_LIGHT_INTENSITY)))

    names.push(HdLightTokens.angle)
    values.push(_ToMaterialNodeParameter(_float(DISTANT_LIGHT_ANGLE)))

    names.push(HdLightTokens.shadowEnable)
    values.push(_ToMaterialNodeParameter(_bool(false)))

    const pi = Math.fround(Math.PI)

    // We assume that the color specified for these "simple" lights means
    // that it is the expected color a white Lambertian surface would have
    // if one of these colored "simple" lights was pointed directly at it.
    // To achieve this, the light color needs to be scaled appropriately.
    names.push(HdLightTokens.diffuse)
    values.push(_ToMaterialNodeParameter(_float(pi)))

    names.push(HdLightTokens.specular)
    values.push(_ToMaterialNodeParameter(_float(pi)))
  }

  return HdRetainedContainerDataSource.new(names, values)
}

/** taskControllerSceneIndex.cpp:943-951 */
function _MaterialNode(light: GlfSimpleLight): HdContainerDataSource {
  return new HdMaterialNodeSchema.Builder()
    .setNodeIdentifier(_MaterialNodeIdentifier(light.isDomeLight()) as never)
    .setParameters(_MaterialNodeParameters(light))
    .build()
}

/** taskControllerSceneIndex.cpp:953-967 */
function _MaterialNodes(light: GlfSimpleLight): HdContainerDataSource {
  return HdRetainedContainerDataSource.new(
    [_materialTokens.lightShader], [_MaterialNode(light)])
}

/** taskControllerSceneIndex.cpp:969-990 */
function _MaterialTerminals(): HdContainerDataSource {
  return HdRetainedContainerDataSource.new(
    [HdMaterialTerminalTokens.light],
    [new HdMaterialConnectionSchema.Builder()
      .setUpstreamNodePath(new HdRetainedTypedSampledDataSource(
        _materialTokens.lightShader, VtValueTypes.token) as never)
      .setUpstreamNodeOutputName(new HdRetainedTypedSampledDataSource(
        HdMaterialTerminalTokens.light, VtValueTypes.token) as never)
      .build()])
}

/** taskControllerSceneIndex.cpp:992-1000 */
let _materialTerminals: HdContainerDataSource | null = null
function _MaterialNetwork(light: GlfSimpleLight): HdContainerDataSource {
  _materialTerminals ??= _MaterialTerminals()
  return new HdMaterialNetworkSchema.Builder()
    .setNodes(_MaterialNodes(light))
    .setTerminals(_materialTerminals)
    .build()
}

/** taskControllerSceneIndex.cpp:1002-1015 */
function _Material(light: GlfSimpleLight): HdContainerDataSource {
  return HdMaterialSchema.buildRetained(
    [HdMaterialSchemaTokens.universalRenderContext], [_MaterialNetwork(light)])
}

/** taskControllerSceneIndex.cpp:1017-1068. Data source for light prim. */
class _LightPrimDataSource extends HdContainerDataSource {
  /** std::shared_ptr<GlfSimpleLight>: shared with the light schema data
   *  sources handed out, so updates reach them. */
  readonly light: { value: GlfSimpleLight }

  constructor(light: GlfSimpleLight, private readonly _isForStorm: boolean) {
    super()
    this.light = { value: light.Clone() }
  }

  static cast(ds: HdDataSourceBase | undefined): _LightPrimDataSource | undefined {
    return ds instanceof _LightPrimDataSource ? ds : undefined
  }

  Get(name: string): HdDataSourceBase | undefined {
    if (name === HdLightSchema.getSchemaToken()) {
      return new _LightSchemaDataSource(this.light, this._isForStorm)
    }
    if (name === HdMaterialSchema.getSchemaToken()) {
      return _Material(this.light.value)
    }
    if (name === HdXformSchema.getSchemaToken()) {
      return new HdXformSchema.Builder()
        .setMatrix(new HdRetainedTypedSampledDataSource(
          this.light.value.getTransform(), VtValueTypes.GfMatrix4d))
        .build()
    }
    return undefined
  }

  getNames(): string[] {
    return [
      HdLightSchema.getSchemaToken(),
      HdMaterialSchema.getSchemaToken(),
      HdXformSchema.getSchemaToken(),
    ]
  }
}

/** taskControllerSceneIndex.h:62-72 */
export interface HdxTaskControllerSceneIndexParameters {
  readonly prefix: string
  readonly aovDescriptorCallback: ((name: string) => HdAovDescriptor) | null
  isForStorm: boolean
  gpuEnabled: boolean
}

/** taskControllerSceneIndex.cpp:1232-1244 */
function _StormShadowsEnabled(sceneIndex: HdSceneIndexBase, prefix: string): boolean {
  const params = _GetTaskParamsForTask(sceneIndex, prefix, _tasks.simpleLight)
  if (!params) {
    return false
  }
  return params.enableShadows
}

/** taskControllerSceneIndex.cpp:1311-1326 */
function _ColorCorrectionEnabled(sceneIndex: HdSceneIndexBase, prefix: string): boolean {
  const params = _GetTaskParamsForTask(sceneIndex, prefix, _tasks.colorCorrection)
  if (!params) {
    return false
  }
  const mode: string = params.colorCorrectionMode
  if (!mode) {
    return false
  }
  return mode !== HdxColorCorrectionTokens.disabled
}

/** taskControllerSceneIndex.cpp:1369-1438. When we're asked to render
 *  "color", we treat that as final color, complete with depth-compositing
 *  and selection, so we in-line add some extra buffers if they weren't
 *  already requested. */
function _ResolvedRenderOutputs(aovNames: readonly string[], isForStorm: boolean): string[] {
  let hasColor = false
  let hasDepth = false
  let hasPrimId = false
  let hasElementId = false
  let hasInstanceId = false
  let hasNeye = false

  for (const renderOutput of aovNames) {
    if (renderOutput === HdAovTokens.color) {
      hasColor = true
    } else if (renderOutput === HdAovTokens.depth) {
      hasDepth = true
    } else if (renderOutput === HdAovTokens.primId) {
      hasPrimId = true
    } else if (renderOutput === HdAovTokens.elementId) {
      hasElementId = true
    } else if (renderOutput === HdAovTokens.instanceId) {
      hasInstanceId = true
    } else if (renderOutput === HdAovTokens.Neye) {
      hasNeye = true
    }
  }

  let result: string[] = []

  if (isForStorm) {
    // For Storm, we rearrange AOVs to be a certain order to match how we
    // order outputs in the fragment shader. This order is specified via
    // HdSt_RenderPassShaderKey and the render pass shader snippets it
    // gathers.
    if (hasColor) {
      result.push(HdAovTokens.color)
    }
    if (hasPrimId || hasInstanceId) {
      result.push(HdAovTokens.primId)
      result.push(HdAovTokens.instanceId)
    }
    if (hasNeye) {
      result.push(HdAovTokens.Neye)
    }

    // Even if not requested, add depth.
    result.push(HdAovTokens.depth)
  } else {
    result = [...aovNames]

    // For a backend like PrMan/Embree we fill not just the color buffer,
    // but also buffers that are used during picking.
    if (hasColor) {
      if (!hasDepth) {
        result.push(HdAovTokens.depth)
      }
      if (!hasPrimId) {
        result.push(HdAovTokens.primId)
      }
      if (!hasElementId) {
        result.push(HdAovTokens.elementId)
      }
      if (!hasInstanceId) {
        result.push(HdAovTokens.instanceId)
      }
    }
  }

  return result
}

/** taskControllerSceneIndex.cpp:1467-1476. Ignore the viewport offset and
 *  use its size as the aov size. */
function _ViewportToRenderBufferSize(viewport: GfVec4d): GfVec2i {
  // XXX: This is fragile and doesn't handle viewport tricks,
  // such as camera zoom. In the future, we expect to improve the
  // API to better communicate AOV sizing, fill region and camera
  // zoom.
  return new GfVec2i(Math.trunc(viewport.get(2)), Math.trunc(viewport.get(3)))
}

/** taskControllerSceneIndex.cpp:1478-1482 */
function _ToVec3i(v: GfVec2i): GfVec3i {
  return new GfVec3i(v.get(0), v.get(1), 1)
}

/** taskControllerSceneIndex.cpp:2181-2193 */
function _GetPrimType(light: GlfSimpleLight, isForStorm: boolean): string {
  if (light.isDomeLight()) {
    return HdPrimTypeTokens.domeLight
  }
  if (isForStorm) {
    return HdPrimTypeTokens.simpleLight
  } else {
    return HdPrimTypeTokens.distantLight
  }
}

/** taskControllerSceneIndex.cpp:2564-2570 */
function _UsingAovs(sceneIndex: HdSceneIndexBase, prefix: string): boolean {
  const path = _AovScopePath(prefix)
  return sceneIndex.getChildPrimPaths(path).length !== 0
}

/** taskControllerSceneIndex.cpp:2572-2577 */
function _ToVec4i(v: GfVec4d): GfVec4i {
  return new GfVec4i(Math.trunc(v.get(0)), Math.trunc(v.get(1)),
    Math.trunc(v.get(2)), Math.trunc(v.get(3)))
}

function _Vec2iEquals(a: GfVec2i, b: GfVec2i): boolean {
  return a.get(0) === b.get(0) && a.get(1) === b.get(1)
}

/** taskControllerSceneIndex.h:36-332. Manages tasks necessary to render an
 *  image (or perform picking) as well as the related render buffers, lights
 *  and a free camera. Note that the set of necessary tasks is different for
 *  Storm and other renderers. Thus, the c'tor needs to be given the renderer
 *  plugin name.
 *
 *  It is a Hydra 2.0 implementation replacing the HdxTaskController. For
 *  now, the API and behavior is the same as that of the HdxTaskController. */
export class HdxTaskControllerSceneIndex extends HdSceneIndexBase {
  private readonly _params: HdxTaskControllerSceneIndexParameters
  private readonly _retainedSceneIndex: HdRetainedSceneIndex
  // All tasks using HdxRenderTaskParams.
  private _renderTaskPaths: string[] = []
  private _activeCameraId = ''
  // Generated renderbuffers
  private _aovNames: string[] = []
  private _viewportAov = ''
  private _renderBufferSize = new GfVec2i(0, 0)
  private _framing: CameraUtilFraming = new CameraUtilFramingClass()
  private _overrideWindowPolicy: CameraUtilConformWindowPolicy | undefined = undefined
  private _viewport = new GfVec4d(0, 0, 1, 1)
  private readonly _observer: HdSceneIndexObserver

  /** taskControllerSceneIndex.cpp:1074-1078 */
  static new(params: HdxTaskControllerSceneIndexParameters): HdxTaskControllerSceneIndex {
    return new HdxTaskControllerSceneIndex(params)
  }

  /** taskControllerSceneIndex.cpp:1081-1114 */
  private constructor(params: HdxTaskControllerSceneIndexParameters) {
    super()
    this._params = params
    this._retainedSceneIndex = HdRetainedSceneIndex.new()
    // taskControllerSceneIndex.cpp:2667-2705 (_Observer)
    this._observer = {
      primsAdded: (_sender, entries: HdAddedPrimEntry[]) => this._sendPrimsAdded(entries),
      primsRemoved: (_sender, entries: HdRemovedPrimEntry[]) => this._sendPrimsRemoved(entries),
      primsDirtied: (_sender, entries: HdDirtiedPrimEntry[]) => this._sendPrimsDirtied(entries),
      primsRenamed: (_sender, entries: HdRenamedPrimEntry[]) => this._sendPrimsRenamed(entries),
    }
    this._retainedSceneIndex.addObserver(this._observer)

    if (this._isForStorm()) {
      if (!this._params.gpuEnabled) {
        TF_WARN('Trying to use Storm while disabling the GPU.')
      }

      this._createStormTasks()

      // XXX AOVs are OFF by default for Storm TaskController because hybrid
      // rendering in Presto spawns an UsdImagingGLEngine, which creates a
      // task controlller. But the Hydrid rendering setups are not yet AOV
      // ready since it breaks main cam zoom operations expressed via viewport
      // manipulation.
      // App (UsdView) for now calls engine->SetRendererAov(color) to enable.
      // SetRenderOutputs({HdAovTokens->color});
    } else {
      this._createGenericTasks()

      // Initialize the AOV system to render color. Note:
      // SetRenderOutputs special-cases color to include support for
      // depth-compositing and selection highlighting/picking.
      this.setRenderOutputs([HdAovTokens.color])
    }

    this._retainedSceneIndex.addPrims([
      { primPath: _CameraPath(this._params.prefix),
        primType: HdPrimTypeTokens.camera,
        dataSource: HdxFreeCameraPrimDataSource.new() }])
  }

  /** taskControllerSceneIndex.cpp:1116-1120 */
  private _isForStorm(): boolean {
    return this._params.isForStorm
  }

  /** taskControllerSceneIndex.cpp:1122-1126 */
  private _runGpuAovTasks(): boolean {
    return this._params.isForStorm || this._params.gpuEnabled
  }

  /** taskControllerSceneIndex.cpp:1130-1134 */
  getPrim(primPath: string): HdSceneIndexPrim {
    return this._retainedSceneIndex.getPrim(primPath)
  }

  /** taskControllerSceneIndex.cpp:1136-1140 */
  getChildPrimPaths(primPath: string): string[] {
    return this._retainedSceneIndex.getChildPrimPaths(primPath)
  }

  /** taskControllerSceneIndex.cpp:1142-1206 */
  private _createStormTasks(): void {
    const prefix = this._params.prefix
    this._retainedSceneIndex.addPrims([
      _TaskAddEntry(prefix, _tasks.simpleLight, _SimpleLightTaskParams(prefix)),
      _TaskAddEntry(prefix, _tasks.shadow,
        new HdxShadowTaskParams(),
        new HdRprimCollection(),
        [HdRenderTagTokens.geometry]),
    ])

    // All tasks using HdxRenderTaskParams.
    const renderTaskAddEntries: HdRetainedAddedPrimEntry[] = [
      _TaskAddEntry(prefix, _tasks.skydome,
        new HdxRenderTaskParams(),
        _SkydomeTaskCollection()),
      _StormRenderTaskAddEntry(prefix, _tasks.render,
        HdStMaterialTagTokens.defaultMaterialTag,
        _StormRenderTaskParamsDefaultMaterialTagAndMasked()),
      _StormRenderTaskAddEntry(prefix, _tasks.render,
        HdStMaterialTagTokens.masked,
        _StormRenderTaskParamsDefaultMaterialTagAndMasked()),
      _StormRenderTaskAddEntry(prefix, _tasks.render,
        HdStMaterialTagTokens.additive,
        _StormRenderTaskParamsAdditive()),
      _StormRenderTaskAddEntry(prefix, _tasks.oitRender,
        HdStMaterialTagTokens.translucent,
        _StormRenderTaskParamsTranslucent()),
      _StormRenderTaskAddEntry(prefix, _tasks.oitVolumeRender,
        HdStMaterialTagTokens.volume,
        _StormRenderTaskParamsVolume()),
    ]

    for (const entry of renderTaskAddEntries) {
      this._renderTaskPaths.push(entry.primPath)
    }

    this._retainedSceneIndex.addPrims(renderTaskAddEntries)

    this._retainedSceneIndex.addPrims([
      _TaskAddEntry(prefix, _tasks.aovInput),
      _TaskAddEntry(prefix, _tasks.oitResolve, _OitResolveTaskParams()),
      _TaskAddEntry(prefix, _tasks.selection, _SelectionTaskParams()),
      _TaskAddEntry(prefix, _tasks.colorCorrection),
      _TaskAddEntry(prefix, _tasks.visualizeAov),
      _TaskAddEntry(prefix, _tasks.present),
      _TaskAddEntry(prefix, _tasks.pick),
      _TaskAddEntry(prefix, _tasks.boundingBox),
    ])
  }

  /** taskControllerSceneIndex.cpp:1208-1243 */
  private _createGenericTasks(): void {
    const prefix = this._params.prefix
    // All tasks using HdxRenderTaskParams.
    const renderTaskAddEntries: HdRetainedAddedPrimEntry[] = [
      _TaskAddEntry(prefix, _tasks.render,
        new HdxRenderTaskParams(),
        _RenderTaskCollection(),
        [HdRenderTagTokens.geometry])]

    for (const entry of renderTaskAddEntries) {
      this._renderTaskPaths.push(entry.primPath)
    }

    this._retainedSceneIndex.addPrims(renderTaskAddEntries)

    if (this._runGpuAovTasks()) {
      this._retainedSceneIndex.addPrims([
        _TaskAddEntry(prefix, _tasks.aovInput),
        _TaskAddEntry(prefix, _tasks.colorizeSelection, _ColorizeSelectionTaskParams()),
        _TaskAddEntry(prefix, _tasks.colorCorrection),
        _TaskAddEntry(prefix, _tasks.visualizeAov),
        _TaskAddEntry(prefix, _tasks.present),
        _TaskAddEntry(prefix, _tasks.pickFromRenderBuffer),
        _TaskAddEntry(prefix, _tasks.boundingBox),
      ])
    }
  }

  /** taskControllerSceneIndex.cpp:1259-1305 */
  private _getRenderingTaskPathsForStorm(): string[] {
    const prefix = this._params.prefix
    const paths: string[] = []

    paths.push(_TaskPrimPath(prefix, _tasks.simpleLight))

    if (_StormShadowsEnabled(this._retainedSceneIndex, prefix)) {
      // Only enable the shadow task (which renders shadow maps) if shadows
      // are enabled.
      paths.push(_TaskPrimPath(prefix, _tasks.shadow))
    }

    paths.push(_TaskPrimPath(prefix, _tasks.skydome))
    paths.push(_StormRenderTaskPath(prefix, HdStMaterialTagTokens.defaultMaterialTag))
    paths.push(_StormRenderTaskPath(prefix, HdStMaterialTagTokens.masked))
    paths.push(_StormRenderTaskPath(prefix, HdStMaterialTagTokens.additive))
    paths.push(_StormRenderTaskPath(prefix, HdStMaterialTagTokens.translucent))
    // Take the aov results from the render tasks, resolve the multisample
    // images and put the results into gpu textures onto shared context.
    paths.push(_TaskPrimPath(prefix, _tasks.aovInput))
    paths.push(_TaskPrimPath(prefix, _tasks.boundingBox))

    // The volume render pass needs to read the (resolved) depth AOV (with
    // the opaque geometry) and thus runs after the HdxAovInputTask.
    paths.push(_StormRenderTaskPath(prefix, HdStMaterialTagTokens.volume))
    // Resolve OIT data from translucent and volume and merge into color
    // target.
    paths.push(_TaskPrimPath(prefix, _tasks.oitResolve))
    paths.push(_TaskPrimPath(prefix, _tasks.selection))

    return paths
  }

  /** taskControllerSceneIndex.cpp:1307-1325 */
  private _getRenderingTaskPathsForGenericRenderer(): string[] {
    const prefix = this._params.prefix
    const paths: string[] = []

    paths.push(_TaskPrimPath(prefix, _tasks.render))

    if (!this._runGpuAovTasks()) {
      return paths
    }

    paths.push(_TaskPrimPath(prefix, _tasks.aovInput))
    paths.push(_TaskPrimPath(prefix, _tasks.boundingBox))

    if (this._viewportAov === HdAovTokens.color) {
      // Only non-color AOVs need special colorization for viz.
      paths.push(_TaskPrimPath(prefix, _tasks.colorizeSelection))
    }

    return paths
  }

  /** taskControllerSceneIndex.cpp:1344-1371. Obtain paths to the tasks
   *  managed by the task controller, for image generation. The tasks
   *  returned will be different based on current renderer state. */
  getRenderingTaskPaths(): string[] {
    const prefix = this._params.prefix
    let paths: string[]
    if (this._isForStorm()) {
      paths = this._getRenderingTaskPathsForStorm()
    } else {
      paths = this._getRenderingTaskPathsForGenericRenderer()
    }

    if (!this._runGpuAovTasks()) {
      return paths
    }

    if (_ColorCorrectionEnabled(this._retainedSceneIndex, prefix)) {
      // Apply color correction / grading (convert to display colors)
      paths.push(_TaskPrimPath(prefix, _tasks.colorCorrection))
    }

    // Only non-color AOVs need special colorization for viz.
    if (this._viewportAov !== HdAovTokens.color) {
      paths.push(_TaskPrimPath(prefix, _tasks.visualizeAov))
    }

    // Render pixels to screen
    paths.push(_TaskPrimPath(prefix, _tasks.present))

    return paths
  }

  /** taskControllerSceneIndex.cpp:1373-1381. Obtain paths to tasks managed
   *  by the task controller, for picking. */
  getPickingTaskPaths(): string[] {
    if (this._isForStorm()) {
      return [_TaskPrimPath(this._params.prefix, _tasks.pick)]
    } else {
      return [_TaskPrimPath(this._params.prefix, _tasks.pickFromRenderBuffer)]
    }
  }

  /** taskControllerSceneIndex.cpp:1383-1387. Get the path to the buffer for
   *  a rendered output. Note: the caller should call Resolve(), as
   *  HdxTaskController doesn't guarantee the buffer will be resolved. */
  getRenderBufferPath(aovName: string): string {
    return _AovPath(this._params.prefix, aovName)
  }

  /** taskControllerSceneIndex.cpp:1440-1465. Set the list of outputs to be
   *  rendered. If outputs.size() == 1, this will send that output to the
   *  viewport via a colorizer task. Note: names should come from
   *  HdAovTokens. */
  setRenderOutputs(aovNames: readonly string[]): void {
    if (this._aovNames.length === aovNames.length &&
      this._aovNames.every((n, i) => n === aovNames[i])) {
      return
    }
    this._aovNames = [...aovNames]

    this._setRenderOutputs(_ResolvedRenderOutputs(aovNames, this._isForStorm()))

    // For AOV visualization, if only one output was specified, send it
    // to the viewer; otherwise, disable colorization.
    if (aovNames.length === 1) {
      this.setViewportRenderOutput(aovNames[0]!)
    } else {
      this.setViewportRenderOutput('')
    }

    // XXX: The viewport data plumbed to tasks unfortunately depends on whether
    // aovs are being used.
    this._setCameraFramingForTasks()
  }

  /** taskControllerSceneIndex.cpp:1484-1492 */
  private _renderBufferDimensions(): GfVec3i {
    return _ToVec3i(
      !_Vec2iEquals(this._renderBufferSize, new GfVec2i(0, 0))
        ? this._renderBufferSize
        : _ViewportToRenderBufferSize(this._viewport))
  }

  /** taskControllerSceneIndex.cpp:1494-1607 */
  private _setRenderOutputs(aovNames: readonly string[]): void {
    const prefix = this._params.prefix
    this._retainedSceneIndex.removePrims([{ primPath: _AovScopePath(prefix) }])

    const dimensions = this._renderBufferDimensions()

    const msaaSampleCount =
      Math.min(Math.max(TfGetEnvSetting(HDX_MSAA_SAMPLE_COUNT), 1), 16)

    const addedPrimEntries: HdRetainedAddedPrimEntry[] = []
    const aovBindings: HdRenderPassAovBinding[] = []
    let depthAovBindingIndex = -1

    for (const aovName of aovNames) {
      if (!this._params.aovDescriptorCallback) {
        TF_CODING_ERROR(
          'No aovDescriptorCallback given to ' +
          'HdxTaskControllerSceneIndex.')
        break
      }

      // Use callback to get default AOV descriptors from render delegate.
      const desc = this._params.aovDescriptorCallback(aovName)
      if (desc.format === HdFormat.HdFormatInvalid) {
        // The backend doesn't support this AOV, so skip it.
        continue
      }

      const aovPath = _AovPath(prefix, aovName)

      addedPrimEntries.push({
        primPath: aovPath,
        primType: HdPrimTypeTokens.renderBuffer,
        dataSource: _RenderBufferPrimDataSource(
          dimensions,
          desc.format,
          desc.multiSampled && msaaSampleCount > 1,
          msaaSampleCount),
      })

      if (aovName === HdAovTokens.depth) {
        depthAovBindingIndex = aovBindings.length
      }

      const aovBinding = new HdRenderPassAovBinding()
      aovBinding.aovName = aovName
      aovBinding.clearValue = desc.clearValue
      aovBinding.renderBufferId = aovPath
      aovBinding.aovSettings = desc.aovSettings

      aovBindings.push(aovBinding)
    }

    this._retainedSceneIndex.addPrims(addedPrimEntries)

    const volumeId = _StormRenderTaskPath(prefix, HdStMaterialTagTokens.volume)
    const translucentId = _StormRenderTaskPath(prefix, HdStMaterialTagTokens.translucent)

    const dirtiedPrimEntries: HdRetainedDirtiedPrimEntry[] = []

    // Set AOV bindings on render tasks
    for (const taskPath of this._renderTaskPaths) {
      const params = _GetTaskParamsAtPath(this._retainedSceneIndex, taskPath, HdxRenderTaskParams)

      if (!params) {
        continue
      }

      params.aovBindings = aovBindings.map(_CloneBinding)
      // Divergence: upstream gives only the volume task the depth AOV as
      // input (taskControllerSceneIndex.cpp:1587-1592). The legacy
      // HdxTaskController also gives it to the translucent task
      // (taskController.cpp:1166-1172), which HdxOitRenderTask reads on a
      // device that cannot force early fragment tests: it then draws the
      // translucent fragments without the depth attachment and they test
      // against the depth input instead (oitRenderTask.cpp:242-260,
      // mesh.glslfx:1509-1517). Every native Hgi forces them
      // (hgiMetal/capabilities.mm:87, hgiVulkan/capabilities.cpp:400,
      // hgiGL/capabilities.cpp:207), HgiWebGPU cannot, so the translucent
      // task is given the input as the legacy controller does.
      if (taskPath === volumeId || taskPath === translucentId) {
        // The Storm Volume tasks reads the depth AOV.
        if (depthAovBindingIndex >= 0) {
          params.aovInputBindings = [_CloneBinding(aovBindings[depthAovBindingIndex]!)]
        }
      }

      dirtiedPrimEntries.push({ primPath: taskPath,
        dirtyLocators: new HdDataSourceLocatorSet(HdLegacyTaskSchema.getParametersLocator()) })

      // Only the first render task clears the AOVs - so erase the clearValue.
      for (const aovBinding of aovBindings) {
        aovBinding.clearValue = undefined
      }
    }

    if (dirtiedPrimEntries.length !== 0) {
      this._retainedSceneIndex.dirtyPrims(dirtiedPrimEntries)
    }
  }

  /** taskControllerSceneIndex.cpp:1609-1730. Set which output should be
   *  rendered to the viewport. The empty token disables viewport
   *  rendering. */
  setViewportRenderOutput(aovName: string): void {
    if (this._viewportAov === aovName) {
      return
    }
    this._viewportAov = aovName

    const prefix = this._params.prefix
    const si = this._retainedSceneIndex
    const dirtiedPrimEntries: HdRetainedDirtiedPrimEntry[] = []

    {
      const params = _GetTaskParamsForTask(si, prefix, _tasks.aovInput)
      if (params) {
        params.aovBufferPath = ''
        params.depthBufferPath = ''
        if (aovName) {
          params.aovBufferPath = _AovPath(prefix, aovName)
        }
        if (aovName === HdAovTokens.color) {
          params.depthBufferPath = _AovPath(prefix, HdAovTokens.depth)
        }

        _AddDirtyParamsEntry(prefix, _tasks.aovInput, dirtiedPrimEntries)
      }
    }

    {
      const params = _GetTaskParamsForTask(si, prefix, _tasks.colorizeSelection)
      if (params) {
        if (aovName === HdAovTokens.color) {
          // If we're rendering color, make sure the colorize selection
          // task has the proper id buffers...
          params.primIdBufferPath = _AovPath(prefix, HdAovTokens.primId)
          params.instanceIdBufferPath = _AovPath(prefix, HdAovTokens.instanceId)
          params.elementIdBufferPath = _AovPath(prefix, HdAovTokens.elementId)
        } else {
          params.primIdBufferPath = ''
          params.instanceIdBufferPath = ''
          params.elementIdBufferPath = ''
        }

        _AddDirtyParamsEntry(prefix, _tasks.colorizeSelection, dirtiedPrimEntries)
      }
    }

    {
      const params = _GetTaskParamsForTask(si, prefix, _tasks.pickFromRenderBuffer)
      if (params) {
        if (aovName === HdAovTokens.color) {
          // If we're rendering color, make sure the pick task has the
          // proper id & depth buffers...
          params.primIdBufferPath = _AovPath(prefix, HdAovTokens.primId)
          params.instanceIdBufferPath = _AovPath(prefix, HdAovTokens.instanceId)
          params.elementIdBufferPath = _AovPath(prefix, HdAovTokens.elementId)
          params.depthBufferPath = _AovPath(prefix, HdAovTokens.depth)
        } else {
          params.primIdBufferPath = ''
          params.instanceIdBufferPath = ''
          params.elementIdBufferPath = ''
          params.depthBufferPath = ''
        }

        _AddDirtyParamsEntry(prefix, _tasks.pickFromRenderBuffer, dirtiedPrimEntries)
      }
    }

    {
      const params = _GetTaskParamsForTask(si, prefix, _tasks.colorCorrection)
      if (params) {
        params.aovName = TfToken(aovName)

        _AddDirtyParamsEntry(prefix, _tasks.colorCorrection, dirtiedPrimEntries)
      }
    }

    {
      const params = _GetTaskParamsForTask(si, prefix, _tasks.visualizeAov)
      if (params) {
        params.aovName = TfToken(aovName)

        _AddDirtyParamsEntry(prefix, _tasks.visualizeAov, dirtiedPrimEntries)
      }
    }

    {
      const params = _GetTaskParamsForTask(si, prefix, _tasks.boundingBox)
      if (params) {
        params.aovName = TfToken(aovName)

        _AddDirtyParamsEntry(prefix, _tasks.boundingBox, dirtiedPrimEntries)
      }
    }

    if (dirtiedPrimEntries.length !== 0) {
      this._retainedSceneIndex.dirtyPrims(dirtiedPrimEntries)
    }
  }

  /** taskControllerSceneIndex.cpp:1732-1812. Set custom parameters for an
   *  AOV. */
  setRenderOutputSettings(aovName: string, desc: HdAovDescriptor): void {
    // HdAovDescriptor contains data for both the renderbuffer descriptor,
    // and the renderpass aov binding. Update them both.

    // Render buffer descriptor

    const renderBufferPath = _AovPath(this._params.prefix, aovName)

    const prim = this._retainedSceneIndex.getPrim(renderBufferPath)
    const ds = _RenderBufferSchemaDataSource.cast(
      HdRenderBufferSchema.getFromParent(prim.dataSource).getContainer())
    // Check if we're setting a value for a nonexistent AOV.
    if (!ds) {
      TF_WARN(`Render output ${aovName} doesn't exist`)
      return
    }

    const dirtiedPrimEntries: HdRetainedDirtiedPrimEntry[] = []

    {
      const dirtyLocators = new HdDataSourceLocatorSet()

      if (ds.format !== desc.format) {
        ds.format = desc.format
        dirtyLocators.insert(HdRenderBufferSchema.getFormatLocator())
      }
      if (ds.multiSampled !== desc.multiSampled) {
        ds.multiSampled = desc.multiSampled
        dirtyLocators.insert(HdRenderBufferSchema.getMultiSampledLocator())
      }

      if (!dirtyLocators.IsEmpty()) {
        dirtiedPrimEntries.push({ primPath: renderBufferPath, dirtyLocators })
      }
    }

    // Render pass AOV bindings

    let clearValue: unknown = desc.clearValue

    for (const taskPath of this._renderTaskPaths) {
      const params = _GetTaskParamsAtPath(this._retainedSceneIndex, taskPath, HdxRenderTaskParams)

      if (!params) {
        continue
      }

      for (const aovBinding of params.aovBindings) {
        if (aovBinding.renderBufferId !== renderBufferPath) {
          continue
        }
        let changed = false
        if (!_ClearValuesEqual(aovBinding.clearValue, clearValue)) {
          aovBinding.clearValue = clearValue
          changed = true
        }
        if (!_SettingsEqual(aovBinding.aovSettings, desc.aovSettings)) {
          aovBinding.aovSettings = desc.aovSettings
          changed = true
        }
        if (changed) {
          dirtiedPrimEntries.push({ primPath: taskPath,
            dirtyLocators: new HdDataSourceLocatorSet(HdLegacyTaskSchema.getParametersLocator()) })
        }
        break
      }

      // Only the first RenderTask should clear the AOV
      clearValue = undefined
    }

    if (dirtiedPrimEntries.length !== 0) {
      this._retainedSceneIndex.dirtyPrims(dirtiedPrimEntries)
    }
  }

  /** taskControllerSceneIndex.cpp:1814-1855. Get parameters for an AOV. */
  getRenderOutputSettings(aovName: string): HdAovDescriptor {
    const renderBufferPath = _AovPath(this._params.prefix, aovName)

    const prim = this._retainedSceneIndex.getPrim(renderBufferPath)
    const ds = _RenderBufferSchemaDataSource.cast(
      HdRenderBufferSchema.getFromParent(prim.dataSource).getContainer())
    if (!ds) {
      // Check if we're getting a value for a nonexistent AOV.
      return new HdAovDescriptor()
    }

    const desc = new HdAovDescriptor()
    desc.format = ds.format
    desc.multiSampled = ds.multiSampled

    if (this._renderTaskPaths.length === 0) {
      return desc
    }

    const taskPath = this._renderTaskPaths[0]!

    const params = _GetTaskParamsAtPath(this._retainedSceneIndex, taskPath, HdxRenderTaskParams)

    if (!params) {
      return desc
    }

    for (const aovBinding of params.aovBindings) {
      if (aovBinding.renderBufferId !== renderBufferPath) {
        continue
      }
      desc.clearValue = aovBinding.clearValue
      desc.aovSettings = aovBinding.aovSettings
      break
    }

    return desc
  }

  /** taskControllerSceneIndex.cpp:1858-1893. Set the collection to be
   *  rendered. */
  setCollection(collection: HdRprimCollection): void {
    // XXX For now we assume the application calling to set a new
    //     collection does not know or setup the material tags and does not
    //     split up the collection according to material tags.
    //     In order to ignore materialTags when comparing collections we need
    //     to copy the old tag into the new collection. Since the provided
    //     collection is const, we need to make a not-ideal copy.
    const newCollection = collection.Clone()

    const dirtiedPrimEntries: HdRetainedDirtiedPrimEntry[] = []

    for (const taskPath of this._renderTaskPaths) {
      const ds = _GetTaskDataSourceAtPath(this._retainedSceneIndex, taskPath)
      if (!ds) {
        continue
      }
      const taskCollection = ds.collection

      newCollection.setMaterialTag(taskCollection.getMaterialTag())

      if (taskCollection.Equals(newCollection)) {
        continue
      }

      ds.collection = newCollection.Clone()

      dirtiedPrimEntries.push({ primPath: taskPath,
        dirtyLocators: new HdDataSourceLocatorSet(HdLegacyTaskSchema.getCollectionLocator()) })
    }

    if (dirtiedPrimEntries.length !== 0) {
      this._retainedSceneIndex.dirtyPrims(dirtiedPrimEntries)
    }
  }

  /** taskControllerSceneIndex.cpp:1895-1966. Set the render params. Note:
   *  params.viewport will be overwritten, since it comes from
   *  SetRenderViewport. */
  setRenderParams(params: HdxRenderTaskParams): void {
    const dirtiedPrimEntries: HdRetainedDirtiedPrimEntry[] = []

    for (const taskPath of this._renderTaskPaths) {
      const ds = _GetTaskDataSourceAtPath(this._retainedSceneIndex, taskPath)
      const taskParams = ds?.params as HdxRenderTaskParams | undefined
      if (!ds || !taskParams) {
        TF_CODING_ERROR(`Expected task params for task ${taskPath}`)
        continue
      }

      // We explicitly ignore input camera, viewport, aovBindings, and
      // aov multisample settings because these are internally managed.
      const newParams = params.Clone()
      newParams.camera = taskParams.camera
      newParams.viewport = taskParams.viewport
      newParams.framing = taskParams.framing
      newParams.overrideWindowPolicy = taskParams.overrideWindowPolicy
      newParams.aovBindings = taskParams.aovBindings
      newParams.aovInputBindings = taskParams.aovInputBindings
      newParams.useAovMultiSample = taskParams.useAovMultiSample
      newParams.resolveAovMultiSample = taskParams.resolveAovMultiSample

      // We also explicitly manage blend params, set earlier based on the
      // material tag.
      newParams.blendEnable = taskParams.blendEnable
      newParams.depthMaskEnable = taskParams.depthMaskEnable
      newParams.enableAlphaToCoverage = taskParams.enableAlphaToCoverage
      newParams.blendColorOp = taskParams.blendColorOp
      newParams.blendColorSrcFactor = taskParams.blendColorSrcFactor
      newParams.blendColorDstFactor = taskParams.blendColorDstFactor
      newParams.blendAlphaOp = taskParams.blendAlphaOp
      newParams.blendAlphaSrcFactor = taskParams.blendAlphaSrcFactor
      newParams.blendAlphaDstFactor = taskParams.blendAlphaDstFactor
      newParams.depthMaskEnable = taskParams.depthMaskEnable

      if (taskParams.Equals(newParams)) {
        continue
      }

      ds.params = newParams

      dirtiedPrimEntries.push({ primPath: taskPath,
        dirtyLocators: new HdDataSourceLocatorSet(HdLegacyTaskSchema.getParametersLocator()) })
    }

    // Update pick task
    {
      const taskParams = _GetTaskParamsForTask(this._retainedSceneIndex,
        this._params.prefix, _tasks.pick)
      if (taskParams) {
        if (taskParams.cullStyle !== params.cullStyle) {
          taskParams.cullStyle = params.cullStyle
          _AddDirtyParamsEntry(this._params.prefix, _tasks.pick, dirtiedPrimEntries)
        }
      }
    }

    if (dirtiedPrimEntries.length !== 0) {
      this._retainedSceneIndex.dirtyPrims(dirtiedPrimEntries)
    }
  }

  /** taskControllerSceneIndex.cpp:1969-2009. Set the "view" opinion of the
   *  scenes render tags. The opinion is the base opinion for the entire
   *  scene. Individual tasks (such as the shadow task) may have a stronger
   *  opinion and override this opinion. */
  setRenderTags(renderTags: readonly string[]): void {
    const same = (a: readonly string[]) =>
      a.length === renderTags.length && a.every((t, i) => t === renderTags[i])
    const dirtiedPrimEntries: HdRetainedDirtiedPrimEntry[] = []

    for (const taskPath of this._renderTaskPaths) {
      const ds = _GetTaskDataSourceAtPath(this._retainedSceneIndex, taskPath)
      if (!ds) {
        continue
      }
      if (same(ds.renderTags)) {
        continue
      }
      ds.renderTags = [...renderTags]

      dirtiedPrimEntries.push({ primPath: taskPath,
        dirtyLocators: new HdDataSourceLocatorSet(HdLegacyTaskSchema.getRenderTagsLocator()) })
    }

    {
      const taskPath = _TaskPrimPath(this._params.prefix, _tasks.pick)
      const ds = _GetTaskSchemaDataSource(this._retainedSceneIndex.getPrim(taskPath).dataSource)
      if (ds && ds.params instanceof HdxPickTaskParams) {
        if (!same(ds.renderTags)) {
          ds.renderTags = [...renderTags]

          dirtiedPrimEntries.push({ primPath: taskPath,
            dirtyLocators: new HdDataSourceLocatorSet(HdLegacyTaskSchema.getRenderTagsLocator()) })
        }
      }
    }

    if (dirtiedPrimEntries.length !== 0) {
      this._retainedSceneIndex.dirtyPrims(dirtiedPrimEntries)
    }
  }

  /** Replaces the params of `task` with `params` (`*taskParams = params`). */
  private _replaceParams<P>(task: _TaskInfo<P>, params: P): void {
    const ds = _GetTaskSchemaDataSource(this._retainedSceneIndex.getPrim(
      _TaskPrimPath(this._params.prefix, task)).dataSource)
    if (ds) ds.params = params
  }

  /** taskControllerSceneIndex.cpp:2012-2029. Set the shadow params. Note:
   *  params.camera will be overwritten, since it comes from
   *  SetCameraPath/SetCameraState. */
  setShadowParams(params: HdxShadowTaskParams): void {
    const taskParams = _GetTaskParamsForTask(this._retainedSceneIndex,
      this._params.prefix, _tasks.shadow)
    if (!taskParams) {
      return
    }

    if (_Equals(taskParams, params)) {
      return
    }
    this._replaceParams(_tasks.shadow, params.Clone())

    _SendDirtyParamsEntry(this._retainedSceneIndex, this._params.prefix, _tasks.shadow)
  }

  /** taskControllerSceneIndex.cpp:2031-2046. Turns the shadow task on or
   *  off. */
  setEnableShadows(enable: boolean): void {
    const params = _GetTaskParamsForTask(this._retainedSceneIndex,
      this._params.prefix, _tasks.simpleLight)
    if (!params) {
      return
    }
    if (params.enableShadows === enable) {
      return
    }
    params.enableShadows = enable
    _SendDirtyParamsEntry(this._retainedSceneIndex, this._params.prefix, _tasks.simpleLight)
  }

  /** taskControllerSceneIndex.cpp:2048-2085. Turns the selection task on or
   *  off. */
  setEnableSelection(enable: boolean): void {
    const prefix = this._params.prefix
    const dirtiedPrimEntries: HdRetainedDirtiedPrimEntry[] = []

    for (const task of [_tasks.selection, _tasks.colorizeSelection] as const) {
      const params = _GetTaskParamsForTask(this._retainedSceneIndex, prefix,
        task as _TaskInfo<HdxSelectionTaskParams | HdxColorizeSelectionTaskParams>)
      if (params) {
        if (params.enableSelectionHighlight !== enable ||
          params.enableLocateHighlight !== enable) {
          params.enableSelectionHighlight = enable
          params.enableLocateHighlight = enable

          _AddDirtyParamsEntry(prefix, task as _TaskInfo<unknown>, dirtiedPrimEntries)
        }
      }
    }

    if (dirtiedPrimEntries.length !== 0) {
      this._retainedSceneIndex.dirtyPrims(dirtiedPrimEntries)
    }
  }

  /** taskControllerSceneIndex.cpp:2087-2119. Set the selection color. */
  setSelectionColor(color: GfVec4f): void {
    const prefix = this._params.prefix
    const dirtiedPrimEntries: HdRetainedDirtiedPrimEntry[] = []

    for (const task of [_tasks.selection, _tasks.colorizeSelection] as const) {
      const params = _GetTaskParamsForTask(this._retainedSceneIndex, prefix,
        task as _TaskInfo<HdxSelectionTaskParams | HdxColorizeSelectionTaskParams>)
      if (params) {
        if (!params.selectionColor.equals(color)) {
          params.selectionColor = color
          _AddDirtyParamsEntry(prefix, task as _TaskInfo<unknown>, dirtiedPrimEntries)
        }
      }
    }

    if (dirtiedPrimEntries.length !== 0) {
      this._retainedSceneIndex.dirtyPrims(dirtiedPrimEntries)
    }
  }

  /** taskControllerSceneIndex.cpp:2121-2153. Set the selection locate
   *  (over) color. */
  setSelectionLocateColor(color: GfVec4f): void {
    const prefix = this._params.prefix
    const dirtiedPrimEntries: HdRetainedDirtiedPrimEntry[] = []

    for (const task of [_tasks.selection, _tasks.colorizeSelection] as const) {
      const params = _GetTaskParamsForTask(this._retainedSceneIndex, prefix,
        task as _TaskInfo<HdxSelectionTaskParams | HdxColorizeSelectionTaskParams>)
      if (params) {
        if (!params.locateColor.equals(color)) {
          params.locateColor = color
          _AddDirtyParamsEntry(prefix, task as _TaskInfo<unknown>, dirtiedPrimEntries)
        }
      }
    }

    if (dirtiedPrimEntries.length !== 0) {
      this._retainedSceneIndex.dirtyPrims(dirtiedPrimEntries)
    }
  }

  /** taskControllerSceneIndex.cpp:2155-2170. Set if the selection highlight
   *  should be rendered as an outline around the selected objects or as a
   *  solid color overlaid on top of them. */
  setSelectionEnableOutline(enableOutline: boolean): void {
    const params = _GetTaskParamsForTask(this._retainedSceneIndex,
      this._params.prefix, _tasks.colorizeSelection)
    if (!params) {
      return
    }

    if (params.enableOutline === enableOutline) {
      return
    }
    params.enableOutline = enableOutline
    _SendDirtyParamsEntry(this._retainedSceneIndex, this._params.prefix, _tasks.colorizeSelection)
  }

  /** taskControllerSceneIndex.cpp:2172-2188. Set the selection outline
   *  radius (thickness) in pixels. */
  setSelectionOutlineRadius(outlineRadius: number): void {
    const params = _GetTaskParamsForTask(this._retainedSceneIndex,
      this._params.prefix, _tasks.colorizeSelection)
    if (!params) {
      return
    }

    if (params.outlineRadius === outlineRadius) {
      return
    }
    params.outlineRadius = outlineRadius
    _SendDirtyParamsEntry(this._retainedSceneIndex, this._params.prefix, _tasks.colorizeSelection)
  }

  /** taskControllerSceneIndex.cpp:2204-2269 */
  private _setLights(lights: readonly GlfSimpleLight[]): void {
    // HdxTaskController inserts a set of light prims to represent the lights
    // passed in through the simple lighting context (lights vector). These are
    // managed by the task controller scene index, and not by scene description;
    // they represent the application state.

    let i = 0

    const addedPrimEntries: HdRetainedAddedPrimEntry[] = []
    const dirtiedPrimEntries: HdRetainedDirtiedPrimEntry[] = []
    const removedPrimEntries: HdRemovedPrimEntry[] = []

    for (; i < lights.length; ++i) {
      const light = lights[i]!
      const primPath = _LightPath(this._params.prefix, i)
      const primType = _GetPrimType(light, this._params.isForStorm)

      const prim = this._retainedSceneIndex.getPrim(primPath)
      if (prim.primType === primType) {
        const ds = _LightPrimDataSource.cast(prim.dataSource)
        if (!TF_VERIFY(ds)) {
          continue
        }
        if (ds!.light.value.Equals(light)) {
          continue
        }
        ds!.light.value = light.Clone()

        const dirtyLocators = new HdDataSourceLocatorSet([
          HdLightSchema.getDefaultLocator(),
          HdMaterialSchema.getDefaultLocator(),
          HdXformSchema.getDefaultLocator()])
        dirtiedPrimEntries.push({ primPath, dirtyLocators })
      } else {
        addedPrimEntries.push({
          primPath,
          primType,
          dataSource: new _LightPrimDataSource(light, this._isForStorm()),
        })
      }
    }

    while (true) {
      const primPath = _LightPath(this._params.prefix, i)
      const prim = this._retainedSceneIndex.getPrim(primPath)
      if (!prim.dataSource) {
        break
      }
      removedPrimEntries.push({ primPath })
      ++i
    }

    if (addedPrimEntries.length !== 0) {
      this._retainedSceneIndex.addPrims(addedPrimEntries)
    }
    if (dirtiedPrimEntries.length !== 0) {
      this._retainedSceneIndex.dirtyPrims(dirtiedPrimEntries)
    }
    if (removedPrimEntries.length !== 0) {
      this._retainedSceneIndex.removePrims(removedPrimEntries)
    }
  }

  /** taskControllerSceneIndex.cpp:2271-2299 */
  private _setSimpleLightTaskParams(src: GlfSimpleLightingContext): void {
    // If simpleLightTask exists, process the lighting context's material
    // parameters as well. These are passed in through the simple light task's
    // "params" field, so we need to update that field if the material
    // parameters changed.
    //
    // It's unfortunate that the lighting context is split this way.

    const params = _GetTaskParamsForTask(this._retainedSceneIndex,
      this._params.prefix, _tasks.simpleLight)
    if (!params) {
      return
    }

    if (params.sceneAmbient.equals(src.getSceneAmbient()) &&
      params.material.Equals(src.getMaterial())) {
      return
    }

    params.sceneAmbient = src.getSceneAmbient()
    params.material = src.getMaterial().Clone()

    _SendDirtyParamsEntry(this._retainedSceneIndex, this._params.prefix, _tasks.simpleLight)
  }

  /** taskControllerSceneIndex.cpp:2301-2314. Set the lighting state for the
   *  scene. HdxTaskControllerSceneIndex maintains a set of light sprims with
   *  data set from the lights in "src". */
  setLightingState(src: GlfSimpleLightingContext | null): void {
    if (!src) {
      TF_CODING_ERROR('Null lighting context')
      return
    }

    // Process the Built-in lights
    this._setLights(src.getLights())

    this._setSimpleLightTaskParams(src)
  }

  /** taskControllerSceneIndex.cpp:2316-2330. Set the viewport param on
   *  tasks. \deprecated Use SetFraming and SetRenderBufferSize instead. */
  setRenderViewport(viewport: GfVec4d): void {
    if (this._viewport.equals(viewport)) {
      return
    }
    this._viewport = viewport

    // Update the params for tasks that consume viewport info.
    this._setCameraFramingForTasks()

    // Update all of the render buffer sizes as well.
    this._setRenderBufferSize()
  }

  /** taskControllerSceneIndex.cpp:2332-2342. Set the size of the render
   *  buffers backing the AOVs. GUI applications should set this to the size
   *  of the window. */
  setRenderBufferSize(size: GfVec2i): void {
    if (_Vec2iEquals(this._renderBufferSize, size)) {
      return
    }

    this._renderBufferSize = size

    this._setRenderBufferSize()
  }

  /** taskControllerSceneIndex.cpp:2344-2349. Determines how the filmback of
   *  the camera is mapped into the pixels of the render buffer and what
   *  pixels of the render buffer will be rendered into. */
  setFraming(framing: CameraUtilFraming): void {
    this._framing = framing
    this._setCameraFramingForTasks()
  }

  /** taskControllerSceneIndex.cpp:2351-2357. Specifies whether to force a
   *  window policy when conforming the frustum of the camera to match the
   *  display window of the camera framing. */
  setOverrideWindowPolicy(policy: CameraUtilConformWindowPolicy | undefined): void {
    this._overrideWindowPolicy = policy
    this._setCameraFramingForTasks()
  }

  /** taskControllerSceneIndex.cpp:2359-2385. Set the view and projection
   *  matrices for the free camera. Note: The projection matrix must be
   *  pre-adjusted for the window policy. */
  setFreeCameraMatrices(viewMatrix: GfMatrix4d, projectionMatrix: GfMatrix4d): void {
    const primPath = _CameraPath(this._params.prefix)

    const prim = this._retainedSceneIndex.getPrim(primPath)
    const ds = HdxFreeCameraPrimDataSource.cast(prim.dataSource)
    if (!ds) {
      TF_CODING_ERROR(`No camera at ${primPath} in retained scene index.`)
      return
    }

    const locators = new HdDataSourceLocatorSet()
    ds.setViewAndProjectionMatrix(viewMatrix, projectionMatrix, locators)

    if (locators.IsEmpty()) {
      return
    }

    this._retainedSceneIndex.dirtyPrims([{ primPath, dirtyLocators: locators }])

    this.setCameraPath(primPath)
  }

  /** taskControllerSceneIndex.cpp:2387-2410. Set the free camera clip
   *  planes. (Note: Scene cameras use clipping planes authored on the camera
   *  prim) */
  setFreeCameraClipPlanes(clippingPlanes: readonly GfVec4d[]): void {
    const primPath = _CameraPath(this._params.prefix)

    const prim = this._retainedSceneIndex.getPrim(primPath)
    const ds = HdxFreeCameraPrimDataSource.cast(prim.dataSource)
    if (!ds) {
      TF_CODING_ERROR(`No camera at ${primPath} in retained scene index.`)
      return
    }

    const locators = new HdDataSourceLocatorSet()
    // std::vector<GfVec4f>{clippingPlanes.begin(), clippingPlanes.end()}
    ds.setClippingPlanes(clippingPlanes.map(p =>
      new GfVec4f(p.get(0), p.get(1), p.get(2), p.get(3))), locators)

    if (locators.IsEmpty()) {
      return
    }

    this._retainedSceneIndex.dirtyPrims([{ primPath, dirtyLocators: locators }])
  }

  /** taskControllerSceneIndex.cpp:2412-2417. Get the free camera's Hydra
   *  prim path. */
  getFreeCameraPath(): string {
    return _CameraPath(this._params.prefix)
  }

  /** taskControllerSceneIndex.cpp:2419-2438. Configure color correction by
   *  settings params. */
  setColorCorrectionParams(params: HdxColorCorrectionTaskParams): void {
    const taskParams = _GetTaskParamsForTask(this._retainedSceneIndex,
      this._params.prefix, _tasks.colorCorrection)
    if (!taskParams) {
      return
    }

    const newParams = params.Clone() as HdxColorCorrectionTaskParams
    newParams.aovName = taskParams.aovName
    if (_Equals(taskParams, newParams)) {
      return
    }
    this._replaceParams(_tasks.colorCorrection, newParams)

    _SendDirtyParamsEntry(this._retainedSceneIndex, this._params.prefix, _tasks.colorCorrection)
  }

  /** taskControllerSceneIndex.cpp:2440-2464. Set the bounding box params. */
  setBBoxParams(params: HdxBoundingBoxTaskParams): void {
    const taskParams = _GetTaskParamsForTask(this._retainedSceneIndex,
      this._params.prefix, _tasks.boundingBox)
    if (!taskParams) {
      return
    }

    // We only take the params that will be coming from outside this
    // HdxTaskControllerSceneIndex instance.
    const newParams = taskParams.Clone() as HdxBoundingBoxTaskParams
    newParams.bboxes = params.bboxes
    newParams.color = params.color
    newParams.dashSize = params.dashSize

    if (_Equals(taskParams, newParams)) {
      return
    }
    this._replaceParams(_tasks.boundingBox, newParams)

    _SendDirtyParamsEntry(this._retainedSceneIndex, this._params.prefix, _tasks.boundingBox)
  }

  /** taskControllerSceneIndex.cpp:2466-2481. Enable / disable presenting the
   *  render to bound framebuffer. An application may choose to manage the
   *  AOVs that are rendered into itself and skip the task controller's
   *  presentation. */
  setEnablePresentation(enabled: boolean): void {
    const params = _GetTaskParamsForTask(this._retainedSceneIndex,
      this._params.prefix, _tasks.present)
    if (!params) {
      return
    }
    if (params.enabled === enabled) {
      return
    }
    params.enabled = enabled

    _SendDirtyParamsEntry(this._retainedSceneIndex, this._params.prefix, _tasks.present)
  }

  /** taskControllerSceneIndex.cpp:2483-2500. The destination API (e.g.,
   *  OpenGL, see hgiInterop for details) and framebuffer that the AOVs are
   *  presented into. The framebuffer is a VtValue that encoding a
   *  framebuffer in a destination API specific way. */
  setPresentationOutput(api: string, framebuffer: VtValue | unknown): void {
    const params = _GetTaskParamsForTask(this._retainedSceneIndex,
      this._params.prefix, _tasks.present)
    if (!params) {
      return
    }
    if (params.dstApi === api && _ClearValuesEqual(params.dstFramebuffer, framebuffer)) {
      return
    }
    params.dstApi = TfToken(api)
    params.dstFramebuffer = framebuffer as never

    _SendDirtyParamsEntry(this._retainedSceneIndex, this._params.prefix, _tasks.present)
  }

  /** taskControllerSceneIndex.cpp:2502-2550. Set the camera param on tasks
   *  to a USD camera path. */
  setCameraPath(id: string): void {
    if (this._activeCameraId === id) {
      return
    }

    const prefix = this._params.prefix
    const dirtiedPrimEntries: HdRetainedDirtiedPrimEntry[] = []

    this._activeCameraId = id

    // Update tasks that take a camera task param.
    for (const taskPath of this._renderTaskPaths) {
      const params = _GetTaskParamsAtPath(this._retainedSceneIndex, taskPath, HdxRenderTaskParams)
      if (!params) {
        continue
      }
      params.camera = this._activeCameraId

      dirtiedPrimEntries.push({ primPath: taskPath,
        dirtyLocators: new HdDataSourceLocatorSet(HdLegacyTaskSchema.getParametersLocator()) })
    }

    {
      const params = _GetTaskParamsForTask(this._retainedSceneIndex, prefix, _tasks.simpleLight)
      if (params) {
        params.cameraPath = this._activeCameraId
        _AddDirtyParamsEntry(prefix, _tasks.simpleLight, dirtiedPrimEntries)
      }
    }

    {
      const params = _GetTaskParamsForTask(this._retainedSceneIndex, prefix, _tasks.pickFromRenderBuffer)
      if (params) {
        params.cameraId = this._activeCameraId
        _AddDirtyParamsEntry(prefix, _tasks.pickFromRenderBuffer, dirtiedPrimEntries)
      }
    }

    if (dirtiedPrimEntries.length !== 0) {
      this._retainedSceneIndex.dirtyPrims(dirtiedPrimEntries)
    }
  }

  /** taskControllerSceneIndex.cpp:2579-2645 */
  private _setCameraFramingForTasks(): void {
    const prefix = this._params.prefix
    // When aovs are in use, the expectation is that each aov is resized to
    // the non-masked region and we render only the necessary pixels.
    // The composition step (i.e., the present task) uses the viewport
    // offset to update the unmasked region of the bound framebuffer.
    const adjustedViewport =
      _UsingAovs(this._retainedSceneIndex, prefix)
        ? new GfVec4d(0, 0, this._viewport.get(2), this._viewport.get(3))
        : this._viewport

    const dirtiedPrimEntries: HdRetainedDirtiedPrimEntry[] = []

    for (const taskPath of this._renderTaskPaths) {
      const params = _GetTaskParamsAtPath(this._retainedSceneIndex, taskPath, HdxRenderTaskParams)
      if (!params) {
        continue
      }

      if (params.viewport.equals(adjustedViewport) &&
        params.framing.equals(this._framing) &&
        params.overrideWindowPolicy === this._overrideWindowPolicy) {
        continue
      }

      params.viewport = adjustedViewport
      params.framing = this._framing
      params.overrideWindowPolicy = this._overrideWindowPolicy

      dirtiedPrimEntries.push({ primPath: taskPath,
        dirtyLocators: new HdDataSourceLocatorSet(HdLegacyTaskSchema.getParametersLocator()) })
    }

    {
      const params = _GetTaskParamsForTask(this._retainedSceneIndex, prefix, _tasks.pickFromRenderBuffer)
      if (params) {
        if (!params.viewport.equals(adjustedViewport) ||
          !params.framing.equals(this._framing) ||
          params.overrideWindowPolicy !== this._overrideWindowPolicy) {
          params.framing = this._framing
          params.overrideWindowPolicy = this._overrideWindowPolicy
          params.viewport = adjustedViewport

          _AddDirtyParamsEntry(prefix, _tasks.pickFromRenderBuffer, dirtiedPrimEntries)
        }
      }
    }

    {
      const params = _GetTaskParamsForTask(this._retainedSceneIndex, prefix, _tasks.present)
      if (params) {
        // The composition step uses the viewport passed in by the
        // application, which may have a non-zero offset for things like
        // camera masking.
        const dstRegion =
          this._framing.isValid()
            ? new GfVec4i(0, 0, this._renderBufferSize.get(0), this._renderBufferSize.get(1))
            : _ToVec4i(this._viewport)

        if (!params.dstRegion.equals(dstRegion)) {
          params.dstRegion = dstRegion

          _AddDirtyParamsEntry(prefix, _tasks.present, dirtiedPrimEntries)
        }
      }
    }

    if (dirtiedPrimEntries.length !== 0) {
      this._retainedSceneIndex.dirtyPrims(dirtiedPrimEntries)
    }
  }

  /** taskControllerSceneIndex.cpp:2647-2677 */
  private _setRenderBufferSize(): void {
    const dimensions = this._renderBufferDimensions()

    const dirtiedPrimEntries: HdRetainedDirtiedPrimEntry[] = []

    const path = _AovScopePath(this._params.prefix)
    for (const renderBufferPath of this._retainedSceneIndex.getChildPrimPaths(path)) {
      const prim = this._retainedSceneIndex.getPrim(renderBufferPath)
      const ds = _RenderBufferSchemaDataSource.cast(
        HdRenderBufferSchema.getFromParent(prim.dataSource).getContainer())
      if (!ds) {
        continue
      }

      if (ds.dimensions.equals(dimensions)) {
        continue
      }
      ds.dimensions = dimensions

      dirtiedPrimEntries.push({ primPath: renderBufferPath,
        dirtyLocators: new HdDataSourceLocatorSet(HdRenderBufferSchema.getDimensionsLocator()) })
    }
    if (dirtiedPrimEntries.length !== 0) {
      this._retainedSceneIndex.dirtyPrims(dirtiedPrimEntries)
    }
  }
}

function _CloneBinding(binding: HdRenderPassAovBinding): HdRenderPassAovBinding {
  const out = new HdRenderPassAovBinding()
  out.aovName = binding.aovName
  out.renderBuffer = binding.renderBuffer
  out.renderBufferId = binding.renderBufferId
  out.clearValue = binding.clearValue
  out.aovSettings = binding.aovSettings
  return out
}

/** VtValue operator== for clear values (VtValue or undefined, the empty
 *  VtValue). */
function _ClearValuesEqual(a: unknown, b: unknown): boolean {
  const empty = (v: unknown) => v === undefined || v === null || (v instanceof VtValue && v.IsEmpty())
  if (empty(a) || empty(b)) return empty(a) && empty(b)
  if (a instanceof VtValue && b instanceof VtValue) return a.equals(b)
  return _Equals(a, b)
}

/** HdAovSettingsMap (VtDictionary) operator==. */
function _SettingsEqual(a: Map<string, unknown>, b: Map<string, unknown>): boolean {
  if (a.size !== b.size) return false
  for (const [k, v] of a) {
    if (!b.has(k) || !_ClearValuesEqual(v, b.get(k))) return false
  }
  return true
}

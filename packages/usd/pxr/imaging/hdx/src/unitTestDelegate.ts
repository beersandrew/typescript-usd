// Ported from OpenUSD 26.11.1: pxr/imaging/hdx/unitTestDelegate.cpp,
//  pxr/imaging/hdx/unitTestDelegate.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdx/unitTestDelegate.{h,cpp} (OpenUSD 26.11.1):
// Hdx_UnitTestDelegate, the scene delegate of the hdx testenv programs.
//
// Divergences:
// - SdfPath ids are path strings; VtVec3fArray / VtIntArray arguments are
//   GfVec3f[] / number[]. Values handed to Hydra through Get are VtValues
//   holding VtArrays and Gf values of the upstream types.
// - The two AddMesh overloads are one method that selects the overload from
//   its arguments (unitTestDelegate.h:93-119).
// - SetTaskParam marks the task dirty through HdRenderIndex.MarkTaskDirty,
//   which routes to HdChangeTracker::MarkTaskDirty for tasks inserted
//   through scene index emulation (hd/src/renderIndex.ts).
// - WriteRenderBufferToFile (unitTestDelegate.cpp:1137-1184) maps the render
//   buffer asynchronously (WebGPU readback, hdSt/src/renderBuffer.ts MapAsync)
//   and hands HioImage::StorageSpec to the image writer installed with
//   Hdx_UnitTestDelegate.SetImageWriter, which plays HioImage::OpenForWriting
//   + Write (this repo's hio has no image writers); without a writer it is a
//   runtime error as a failed OpenForWriting is.
// - Draw targets (HdStDrawTarget, HdxDrawTargetTask) are not ported:
//   AddDrawTarget, SetDrawTarget and AddDrawTargetTask post a coding error.

import { Token as TfToken, Type as TfType } from 'typescript-usd/tf'
import { Array as VtArray, Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import {
  Camera as GfCamera,
  Frustum as GfFrustum,
  Matrix4d as GfMatrix4d,
  Range1d as GfRange1d,
  Range2d as GfRange2d,
  Range3d as GfRange3d,
  Vec2d as GfVec2d,
  Vec3d as GfVec3d,
  Vec3f as GfVec3f,
  Vec4d as GfVec4d,
  Vec4f as GfVec4f,
  rotateInto as GfRotateInto,
  type Matrix4f as GfMatrix4f,
  Vec2i as GfVec2i,
} from 'typescript-usd/gf'
import {
  OpenSubdivTokens as PxOsdOpenSubdivTokens,
  SubdivTags as PxOsdSubdivTags,
} from 'typescript-usd/pxOsd'
import {
  AovTokens as HdAovTokens,
  Camera as HdCamera,
  CameraTokens as HdCameraTokens,
  ChangeTracker as HdChangeTracker,
  DisplayStyle as HdDisplayStyle,
  InstancerTokens as HdInstancerTokens,
  Interpolation as HdInterpolation,
  LightTokens as HdLightTokens,
  MeshTopology as HdMeshTopology,
  PrimTypeTokens as HdPrimTypeTokens,
  PrimvarDescriptor as HdPrimvarDescriptor,
  PrimvarRoleTokens as HdPrimvarRoleTokens,
  RenderBufferDescriptor as HdRenderBufferDescriptor,
  RenderPassAovBinding as HdRenderPassAovBinding,
  ReprSelector as HdReprSelector,
  RenderTagTokens as HdRenderTagTokens,
  ReprTokens as HdReprTokens,
  RprimCollection as HdRprimCollection,
  SceneDelegate as HdSceneDelegate,
  Tokens as HdTokens,
  type PrimvarDescriptorVector as HdPrimvarDescriptorVector,
  type RenderBuffer as HdRenderBuffer,
  type RenderIndex as HdRenderIndex,
} from 'typescript-usd/hd'
import { Framing as CameraUtilFraming, ConformWindowPolicy as CameraUtilConformWindowPolicy } from 'typescript-usd/cameraUtil'
import { SimpleLight as GlfSimpleLight, SimpleLightType as GlfSimpleLightType } from 'typescript-usd/glf'
import { HioConversions as HdStHioConversions, type RenderBuffer as HdStRenderBuffer } from 'typescript-usd/hdSt'
import { HdxRenderTask } from './renderTask.ts'
import { HdxPickTask, HdxPickTaskParams, HdxPickTaskParamsType } from './pickTask.ts'
import { HdxSelectionTask } from './selectionTask.ts'
import { HdxRenderSetupTask, HdxRenderTaskParams, HdxRenderTaskParamsType } from './renderSetupTask.ts'
import { HdxOitRenderTask } from './oitRenderTask.ts'
import { HdxOitResolveTask, HdxOitResolveTaskParams, HdxOitResolveTaskParamsType } from './oitResolveTask.ts'
import {
  HdxShadowMatrixComputation,
  HdxShadowParams,
  HdxShadowParamsType,
  HdxSimpleLightTask,
  HdxSimpleLightTaskParams,
  HdxSimpleLightTaskParamsType,
} from './simpleLightTask.ts'
import { HdxShadowTask, HdxShadowTaskParams, HdxShadowTaskParamsType } from './shadowTask.ts'
import { TF_CODING_ERROR, TF_RUNTIME_ERROR } from './tfDiagnostic.ts'

/** HioImage::StorageSpec (hio/image.h:84-104), the fields
 *  WriteRenderBufferToFile fills. */
export interface Hdx_UnitTestImageStorage {
  width: number
  height: number
  /** HioFormat */
  format: number
  flipped: boolean
  data: Uint8Array
}

/** HioImage::OpenForWriting(filePath) + Write(storage); see the header. */
export type Hdx_UnitTestImageWriter =
  (filePath: string, storage: Hdx_UnitTestImageStorage) => boolean | Promise<boolean>

/** unitTestDelegate.cpp:56-61 */
const _tokens = {
  renderBufferDescriptor: TfToken('renderBufferDescriptor'),
} as const

const _HdRenderBufferDescriptorType = TfType.declare('HdRenderBufferDescriptor')
const _HdRprimCollectionType = TfType.declare('HdRprimCollection')
const _TfTokenVectorType = TfType.declare('TfTokenVector')
const _GfRange1fType = TfType.declare('GfRange1f')

// material.h:29-30 HdMaterial::DirtyResource is not needed;
// renderBuffer.h:38 HdRenderBuffer::DirtyDescription.
const HdRenderBuffer_DirtyDescription = 1 << 0
// light.h:47-55 (HdLight::DirtyBits)
const HdLight_DirtyTransform = 1 << 0
const HdLight_DirtyParams = 1 << 1
const HdLight_DirtyShadowParams = 1 << 2
const HdLight_DirtyCollection = 1 << 3

function _Vec3fArrayValue(values: readonly GfVec3f[]): VtValue {
  return VtValue.createArray(new VtArray<GfVec3f>([...values], VtValueTypes.GfVec3f))
}
function _Vec4fArrayValue(values: readonly GfVec4f[]): VtValue {
  return VtValue.createArray(new VtArray<GfVec4f>([...values], VtValueTypes.GfVec4f))
}
function _FloatValue(f: number): VtValue {
  return VtValue.create(Math.fround(f), VtValueTypes.float)
}

/** unitTestDelegate.cpp:64-86 */
function _CreateGrid(nx: number, ny: number, points: GfVec3f[],
  numVerts: number[], verts: number[]): void {
  // create a unit plane (-1 ~ 1)
  for (let y = 0; y <= ny; ++y) {
    for (let x = 0; x <= nx; ++x) {
      const p = new GfVec3f(2.0 * x / Math.fround(nx) - 1.0,
        2.0 * y / Math.fround(ny) - 1.0,
        0)
      points.push(p)
    }
  }
  for (let y = 0; y < ny; ++y) {
    for (let x = 0; x < nx; ++x) {
      numVerts.push(4)
      verts.push(y * (nx + 1) + x)
      verts.push(y * (nx + 1) + x + 1)
      verts.push((y + 1) * (nx + 1) + x + 1)
      verts.push((y + 1) * (nx + 1) + x)
    }
  }
}

/** unitTestDelegate.cpp:88-123 */
class ShadowMatrix extends HdxShadowMatrixComputation {
  private _shadowMatrix: GfMatrix4d

  constructor(light: GlfSimpleLight) {
    super()
    const frustum = new GfFrustum()
    frustum.setProjectionType(GfFrustum.Orthographic)
    frustum.setWindow(new GfRange2d(new GfVec2d(-10, -10), new GfVec2d(10, 10)))
    frustum.setNearFar(new GfRange1d(0, 100))
    const pos = light.getPosition()
    frustum.setPosition(new GfVec3d(0, 0, 10))
    frustum.setRotation(GfRotateInto([0, 0, 1],
      [pos.get(0), pos.get(1), pos.get(2)]))

    this._shadowMatrix =
      frustum.computeViewMatrix().getMultiply(frustum.computeProjectionMatrix())
  }

  compute(_viewportOrFraming: GfVec4f | CameraUtilFraming,
    _policy: CameraUtilConformWindowPolicy): GfMatrix4d[] {
    return [this._shadowMatrix]
  }
}

/** unitTestDelegate.h:204-247 _Mesh */
class _Mesh {
  reprName = ''
  constructor(
    public scheme: string,
    public orientation: string,
    public transform: GfMatrix4d,
    public points: GfVec3f[],
    public numVerts: number[],
    public verts: number[],
    public subdivTags: PxOsdSubdivTags,
    public color: VtValue,
    public colorInterpolation: HdInterpolation,
    public opacity: VtValue,
    public opacityInterpolation: HdInterpolation,
    public guide: boolean,
    public doubleSided: boolean,
  ) {}
}

/** unitTestDelegate.h:249-266 _Instancer */
class _Instancer {
  scale: GfVec3f[] = []
  rotate: GfVec4f[] = []
  translate: GfVec3f[] = []
  prototypeIndices: number[] = []
  rootTransform: GfMatrix4f | null = null
  prototypes: string[] = []
}

/** unitTestDelegate.cpp:154-167 */
function _ToHd(projection: number): number {
  switch (projection) {
    case GfCamera.Perspective:
      return HdCamera.Perspective
    case GfCamera.Orthographic:
      return HdCamera.Orthographic
  }
  TF_CODING_ERROR('Bad GfCamera::Projection value')
  return HdCamera.Perspective
}

let _imageWriter: Hdx_UnitTestImageWriter | null = null

/** unitTestDelegate.h:38-274 */
export class Hdx_UnitTestDelegate extends HdSceneDelegate {
  private _meshes = new Map<string, _Mesh>()
  private _instancers = new Map<string, _Instancer>()
  private _materials = new Map<string, VtValue>()
  private _refineLevels = new Map<string, number>()
  private _displayInOverlay = new Map<string, boolean>()
  private _cameraTransforms = new Map<string, GfMatrix4d>()
  private _refineLevel: number
  private _materialBindings = new Map<string, string>()
  private _instancerBindings = new Map<string, string>()
  private _valueCacheMap = new Map<string, Map<string, VtValue>>()
  private _cameraId: string

  /** Installs the HioImage writer WriteRenderBufferToFile uses (see the
   *  header). */
  static setImageWriter(writer: Hdx_UnitTestImageWriter | null): void {
    _imageWriter = writer
  }

  /** unitTestDelegate.cpp:126-137 */
  constructor(renderIndex: HdRenderIndex, delegateId = '/') {
    super(renderIndex, delegateId)
    this._refineLevel = 0
    // add camera
    this._cameraId = '/camera'
    this.getRenderIndex().insertSprim(HdPrimTypeTokens.camera, this, this._cameraId)
    const frustum = new GfFrustum()
    frustum.setPosition(new GfVec3d(0, 0, 3))
    this.setCamera(frustum.computeViewMatrix(), frustum.computeProjectionMatrix())
  }

  // _valueCacheMap[id] (TfHashMap::operator[] default-inserts).
  private _cache(id: string): Map<string, VtValue> {
    let cache = this._valueCacheMap.get(id)
    if (!cache) this._valueCacheMap.set(id, cache = new Map())
    return cache
  }

  // std::map::operator[] on _instancers.
  private _getInstancer(id: string): _Instancer {
    let instancer = this._instancers.get(id)
    if (!instancer) this._instancers.set(id, instancer = new _Instancer())
    return instancer
  }

  /** unitTestDelegate.cpp:139-150 SetRefineLevel(level), and
   *  unitTestDelegate.cpp:922-928 SetRefineLevel(id, level). */
  setRefineLevel(level: number): void
  setRefineLevel(id: string, level: number): void
  setRefineLevel(idOrLevel: string | number, level?: number): void {
    if (typeof idOrLevel === 'string') {
      this._refineLevels.set(idOrLevel, level!)
      this.getRenderIndex().getChangeTracker().markRprimDirty(
        idOrLevel, HdChangeTracker.DirtyDisplayStyle)
      return
    }
    this._refineLevel = idOrLevel
    for (const id of this._meshes.keys()) {
      this.getRenderIndex().getChangeTracker().markRprimDirty(
        id, HdChangeTracker.DirtyDisplayStyle)
    }
    for (const id of this._refineLevels.keys()) {
      this._refineLevels.set(id, idOrLevel)
    }
  }

  /** unitTestDelegate.cpp:152-157 SetCamera(view, proj) and :169-201
   *  SetCamera(id, view, proj). */
  setCamera(viewMatrix: GfMatrix4d, projMatrix: GfMatrix4d): void
  setCamera(cameraId: string, viewMatrix: GfMatrix4d, projMatrix: GfMatrix4d): void
  setCamera(a: string | GfMatrix4d, b: GfMatrix4d, c?: GfMatrix4d): void {
    if (typeof a !== 'string') {
      this.setCamera(this._cameraId, a, b)
      return
    }
    const cameraId = a
    const viewMatrix = b
    const projMatrix = c!
    const cam = new GfCamera()
    cam.setFromViewAndProjectionMatrix(viewMatrix, projMatrix)

    this._cameraTransforms.set(cameraId, cam.getTransform())

    const cache = this._cache(cameraId)
    cache.set(HdCameraTokens.projection,
      VtValue.create(_ToHd(cam.GetProjection()), VtValueTypes.int))
    cache.set(HdCameraTokens.focalLength, _FloatValue(
      cam.getFocalLength() * Math.fround(GfCamera.FOCAL_LENGTH_UNIT)))
    cache.set(HdCameraTokens.horizontalAperture, _FloatValue(
      cam.GetHorizontalAperture() * Math.fround(GfCamera.APERTURE_UNIT)))
    cache.set(HdCameraTokens.verticalAperture, _FloatValue(
      cam.getVerticalAperture() * Math.fround(GfCamera.APERTURE_UNIT)))
    cache.set(HdCameraTokens.horizontalApertureOffset, _FloatValue(
      cam.getHorizontalApertureOffset() * Math.fround(GfCamera.APERTURE_UNIT)))
    cache.set(HdCameraTokens.verticalApertureOffset, _FloatValue(
      cam.getVerticalApertureOffset() * Math.fround(GfCamera.APERTURE_UNIT)))
    cache.set(HdCameraTokens.clippingRange,
      VtValue.create(cam.getClippingRange(), _GfRange1fType))

    cache.set(HdCameraTokens.windowPolicy, VtValue.create(
      CameraUtilConformWindowPolicy.CameraUtilFit, VtValueTypes.int))

    this.getRenderIndex().getChangeTracker().markSprimDirty(cameraId,
      HdCamera.AllDirty)
  }

  /** unitTestDelegate.cpp:203-210 */
  addCamera(id: string): void {
    // add a camera
    this.getRenderIndex().insertSprim(HdPrimTypeTokens.camera, this, id)
    const cache = this._cache(id)
    cache.set(HdCameraTokens.windowPolicy, VtValue.create(
      CameraUtilConformWindowPolicy.CameraUtilFit, VtValueTypes.int))
  }

  /** unitTestDelegate.cpp:212-221 */
  updateCamera(id: string, key: string, value: VtValue): void {
    const cache = this._cache(id)
    cache.set(key, value)
    const tracker = this.getRenderIndex().getChangeTracker()
    tracker.markSprimDirty(id, HdCamera.AllDirty)
  }

  /** unitTestDelegate.cpp:223-242 */
  addLight(id: string, light: GlfSimpleLight): void {
    // add light
    this.getRenderIndex().insertSprim(HdPrimTypeTokens.simpleLight, this, id)
    const cache = this._cache(id)

    const shadowParams = new HdxShadowParams()
    shadowParams.enabled = light.hasShadow()
    shadowParams.resolution = 512
    shadowParams.shadowMatrix = new ShadowMatrix(light)
    shadowParams.bias = -0.001
    shadowParams.blur = 0.1

    cache.set(HdLightTokens.params, VtValue.create(light, GlfSimpleLightType))
    cache.set(HdLightTokens.shadowParams, VtValue.create(shadowParams, HdxShadowParamsType))
    cache.set(HdLightTokens.shadowCollection, VtValue.create(
      new HdRprimCollection(HdTokens.geometry,
        new HdReprSelector(HdReprTokens.refined)), _HdRprimCollectionType))
  }

  /** unitTestDelegate.cpp:244-268 */
  setLight(id: string, key: string, value: VtValue): void {
    const cache = this._cache(id)
    cache.set(key, value)
    if (key === HdLightTokens.params) {
      // update shadow matrix too
      const light = value.Get<GlfSimpleLight>()
      const shadowParams = (cache.get(HdLightTokens.shadowParams)!
        .Get<HdxShadowParams>()).Clone()
      shadowParams.shadowMatrix = new ShadowMatrix(light)

      this.getRenderIndex().getChangeTracker().markSprimDirty(
        id, HdLight_DirtyParams | HdLight_DirtyShadowParams)
      cache.set(HdLightTokens.shadowParams, VtValue.create(shadowParams, HdxShadowParamsType))
    } else if (key === HdTokens.transform) {
      this.getRenderIndex().getChangeTracker().markSprimDirty(
        id, HdLight_DirtyTransform)
    } else if (key === HdLightTokens.shadowCollection) {
      this.getRenderIndex().getChangeTracker().markSprimDirty(
        id, HdLight_DirtyCollection)
    }
  }

  /** unitTestDelegate.cpp:270-276 */
  removeLight(id: string): void {
    // remove light
    this.getRenderIndex().removeSprim(HdPrimTypeTokens.simpleLight, id)
    this._valueCacheMap.delete(id)
  }

  /** unitTestDelegate.cpp:278-292 */
  updateTransform(id: string, mat: GfMatrix4f): void {
    if (this._meshes.has(id)) {
      this._meshes.get(id)!.transform = new GfMatrix4d(mat)
      const tracker = this.getRenderIndex().getChangeTracker()
      tracker.markRprimDirty(id, HdChangeTracker.DirtyTransform)
    }
    if (this._cameraTransforms.has(id)) {
      this._cameraTransforms.set(id, new GfMatrix4d(mat))
      const tracker = this.getRenderIndex().getChangeTracker()
      tracker.markSprimDirty(id, HdChangeTracker.DirtyTransform)
    }
  }

  /** unitTestDelegate.cpp:294-301 */
  addRenderBuffer(id: string, desc: HdRenderBufferDescriptor): void {
    this.getRenderIndex().insertBprim(HdPrimTypeTokens.renderBuffer, this, id)

    const cache = this._cache(id)
    cache.set(_tokens.renderBufferDescriptor, VtValue.create(desc, _HdRenderBufferDescriptorType))
  }

  /** unitTestDelegate.cpp:303-309 */
  updateRenderBuffer(id: string, desc: HdRenderBufferDescriptor): void {
    const cache = this._cache(id)
    cache.set(_tokens.renderBufferDescriptor, VtValue.create(desc, _HdRenderBufferDescriptorType))
    this.getRenderIndex().getChangeTracker().markBprimDirty(id, HdRenderBuffer_DirtyDescription)
  }

  /** unitTestDelegate.cpp:311-366 (see the header). */
  addDrawTarget(_id: string): void {
    TF_CODING_ERROR('Hdx_UnitTestDelegate::AddDrawTarget: HdStDrawTarget is not ported')
  }

  /** unitTestDelegate.cpp:368-401 */
  addAovBindings(resolution: GfVec2i, multiSampled = false): HdRenderPassAovBinding[] {
    const renderDelegate = this.getRenderIndex().getRenderDelegate()
    const delegateId = this.getDelegateID()
    const child = (name: string) => delegateId === '/' ? `/${name}` : `${delegateId}/${name}`
    const aovs: [string, string, VtValue][] = [
      [HdAovTokens.color,
        child('aov_color'),
        VtValue.create(new GfVec4f(0.1, 0.1, 0.1, 1.0), VtValueTypes.GfVec4f)],
      [HdAovTokens.depth,
        child('aov_depth'),
        _FloatValue(1.0)],
    ]

    const aovBindings: HdRenderPassAovBinding[] = []
    for (const aov of aovs) {
      const desc = renderDelegate.getDefaultAovDescriptor(aov[0])
      const bufDesc = new HdRenderBufferDescriptor()
      bufDesc.dimensions = [resolution.get(0), resolution.get(1), 1]
      bufDesc.format = desc.format
      bufDesc.multiSampled = multiSampled
      this.addRenderBuffer(aov[1], bufDesc)
      const binding = new HdRenderPassAovBinding()
      binding.aovName = aov[0]
      binding.renderBufferId = aov[1]
      binding.clearValue = aov[2]
      binding.aovSettings = desc.aovSettings
      aovBindings.push(binding)
    }

    return aovBindings
  }

  /** unitTestDelegate.cpp:403-430 (see the header). */
  setDrawTarget(_id: string, _key: string, _value: VtValue): void {
    TF_CODING_ERROR('Hdx_UnitTestDelegate::SetDrawTarget: HdStDrawTarget is not ported')
  }

  /** unitTestDelegate.cpp:432-444 */
  addRenderTask(id: string): void {
    this.getRenderIndex().insertTask(this, id, HdxRenderTask)
    const cache = this._cache(id)
    cache.set(HdTokens.collection, VtValue.create(
      new HdRprimCollection(HdTokens.geometry,
        new HdReprSelector(HdReprTokens.smoothHull)), _HdRprimCollectionType))

    // Don't filter on render tag.
    // XXX: However, this will mean no prim passes if any stage defines a tag
    cache.set(HdTokens.renderTags, VtValue.create([] as string[], _TfTokenVectorType))
  }

  /** unitTestDelegate.cpp:446-455 */
  addRenderSetupTask(id: string): void {
    this.getRenderIndex().insertTask(this, id, HdxRenderSetupTask)
    const cache = this._cache(id)
    const params = new HdxRenderTaskParams()
    params.camera = this._cameraId
    params.viewport = new GfVec4d(0, 0, 512, 512)
    cache.set(HdTokens.params, VtValue.create(params, HdxRenderTaskParamsType))
  }

  /** unitTestDelegate.cpp:457-474 */
  addOitRenderTask(id: string): void {
    const aovBindings =
      this.addAovBindings(new GfVec2i(256, 256), /*multiSampled = */ false)
    this.getRenderIndex().insertTask(this, id, HdxOitRenderTask)
    const cache = this._cache(id)
    const params = new HdxRenderTaskParams()
    params.camera = this._cameraId
    params.viewport = new GfVec4d(0, 0, 256, 256)
    params.aovBindings = aovBindings
    cache.set(HdTokens.params, VtValue.create(params, HdxRenderTaskParamsType))
    cache.set(HdTokens.collection, VtValue.create(new HdRprimCollection(
      HdTokens.geometry, new HdReprSelector(HdReprTokens.smoothHull)), _HdRprimCollectionType))
    cache.set(HdTokens.renderTags, VtValue.create([HdRenderTagTokens.geometry] as string[],
      _TfTokenVectorType))
  }

  /** unitTestDelegate.cpp:476-482 */
  addOitResolveTask(id: string): void {
    this.getRenderIndex().insertTask(this, id, HdxOitResolveTask)
    const cache = this._cache(id)
    cache.set(HdTokens.params, VtValue.create(new HdxOitResolveTaskParams(),
      HdxOitResolveTaskParamsType))
  }

  /** unitTestDelegate.cpp:484-495 */
  addSimpleLightTask(id: string): void {
    this.getRenderIndex().insertTask(this, id, HdxSimpleLightTask)
    const cache = this._cache(id)
    const params = new HdxSimpleLightTaskParams()
    params.cameraPath = this._cameraId
    params.viewport = new GfVec4f(0, 0, 512, 512)
    params.enableShadows = true

    cache.set(HdTokens.params, VtValue.create(params, HdxSimpleLightTaskParamsType))
  }

  /** unitTestDelegate.cpp:497-504 */
  addShadowTask(id: string): void {
    this.getRenderIndex().insertTask(this, id, HdxShadowTask)
    const cache = this._cache(id)
    const params = new HdxShadowTaskParams()
    cache.set(HdTokens.params, VtValue.create(params, HdxShadowTaskParamsType))
  }

  /** unitTestDelegate.cpp:506-510 */
  addSelectionTask(id: string): void {
    this.getRenderIndex().insertTask(this, id, HdxSelectionTask)
  }

  /** unitTestDelegate.cpp:512-522 (see the header). */
  addDrawTargetTask(_id: string): void {
    TF_CODING_ERROR('Hdx_UnitTestDelegate::AddDrawTargetTask: HdxDrawTargetTask is not ported')
  }

  /** unitTestDelegate.cpp:524-537 */
  addPickTask(id: string): void {
    this.getRenderIndex().insertTask(this, id, HdxPickTask)
    const cache = this._cache(id)

    const params = new HdxPickTaskParams()
    cache.set(HdTokens.params, VtValue.create(params, HdxPickTaskParamsType))

    // Don't filter on render tag.
    // XXX: However, this will mean no prim passes if any stage defines a tag
    cache.set(HdTokens.renderTags, VtValue.create([] as string[], _TfTokenVectorType))
  }

  /** unitTestDelegate.cpp:539-553 */
  setTaskParam(id: string, name: string, val: VtValue): void {
    const cache = this._cache(id)
    cache.set(name, val)

    if (name === HdTokens.collection) {
      this.getRenderIndex().markTaskDirty(id, HdChangeTracker.DirtyCollection)
    } else if (name === HdTokens.params) {
      this.getRenderIndex().markTaskDirty(id, HdChangeTracker.DirtyParams)
    }
  }

  /** unitTestDelegate.cpp:555-559 */
  getTaskParam(id: string, name: string): VtValue {
    return this._cache(id).get(name) ?? VtValue.getEmpty()
  }

  /** unitTestDelegate.cpp:561-577 */
  addInstancer(id: string, parentId = '', rootTransform: GfMatrix4f | null = null): void {
    const index = this.getRenderIndex()
    // add instancer
    index.insertInstancer(this, id)
    const instancer = new _Instancer()
    instancer.rootTransform = rootTransform
    this._instancers.set(id, instancer)

    if (parentId !== '') {
      this._instancerBindings.set(id, parentId)
      this._getInstancer(parentId).prototypes.push(id)
    }
  }

  /** unitTestDelegate.cpp:579-597 */
  setInstancerProperties(id: string, prototypeIndex: readonly number[],
    scale: readonly GfVec3f[], rotate: readonly GfVec4f[], translate: readonly GfVec3f[]): void {
    if (prototypeIndex.length !== scale.length ||
      prototypeIndex.length !== rotate.length ||
      prototypeIndex.length !== translate.length) {
      TF_CODING_ERROR('Hdx_UnitTestDelegate::SetInstancerProperties: mismatched array sizes')
      return
    }

    const instancer = this._getInstancer(id)
    instancer.scale = [...scale]
    instancer.rotate = [...rotate]
    instancer.translate = [...translate]
    instancer.prototypeIndices = [...prototypeIndex]
  }

  /**
   * AddMesh(id, transform, points, numVerts, verts, guide=false,
   * instancerId='', scheme=catmullClark, orientation=rightHanded,
   * doubleSided=false) (unitTestDelegate.cpp:602-626), or AddMesh(id,
   * transform, points, numVerts, verts, subdivTags, color,
   * colorInterpolation, opacity, opacityInterpolation, guide=false,
   * instancerId='', scheme=catmullClark, orientation=rightHanded,
   * doubleSided=false) (unitTestDelegate.cpp:628-654).
   */
  addMesh(id: string, transform: GfMatrix4d, points: readonly GfVec3f[],
    numVerts: readonly number[], verts: readonly number[], ...rest: unknown[]): void {
    let subdivTags = new PxOsdSubdivTags()
    let color = VtValue.create(new GfVec3f(1, 1, 0), VtValueTypes.GfVec3f)
    let colorInterpolation = HdInterpolation.HdInterpolationConstant
    let opacity = _FloatValue(1.0)
    let opacityInterpolation = HdInterpolation.HdInterpolationConstant
    let tail = rest
    if (rest[0] instanceof PxOsdSubdivTags) {
      subdivTags = rest[0]
      color = rest[1] as VtValue
      colorInterpolation = rest[2] as HdInterpolation
      opacity = rest[3] as VtValue
      opacityInterpolation = rest[4] as HdInterpolation
      tail = rest.slice(5)
    }
    const [guide = false, instancerId = '', scheme = PxOsdOpenSubdivTokens.catmullClark,
      orientation = HdTokens.rightHanded, doubleSided = false] =
      tail as [boolean?, string?, string?, string?, boolean?]

    const index = this.getRenderIndex()
    index.insertRprim(HdPrimTypeTokens.mesh, this, id)

    this._meshes.set(id, new _Mesh(scheme, orientation, transform,
      [...points], [...numVerts], [...verts], subdivTags,
      color, colorInterpolation, opacity,
      opacityInterpolation, guide, doubleSided))
    if (instancerId !== '') {
      this._instancerBindings.set(id, instancerId)
      this._getInstancer(instancerId).prototypes.push(id)
    }
  }

  /** unitTestDelegate.cpp:656-736 */
  addCube(id: string, transform: GfMatrix4d, guide = false, instancerId = '',
    scheme: string = PxOsdOpenSubdivTokens.catmullClark,
    color: VtValue = VtValue.create(new GfVec3f(1, 1, 1), VtValueTypes.GfVec3f),
    colorInterpolation: HdInterpolation = HdInterpolation.HdInterpolationConstant,
    opacity: VtValue = _FloatValue(1.0),
    opacityInterpolation: HdInterpolation = HdInterpolation.HdInterpolationConstant): void {
    const points = [
      new GfVec3f(1.0, 1.0, 1.0),
      new GfVec3f(-1.0, 1.0, 1.0),
      new GfVec3f(-1.0, -1.0, 1.0),
      new GfVec3f(1.0, -1.0, 1.0),
      new GfVec3f(-1.0, -1.0, -1.0),
      new GfVec3f(-1.0, 1.0, -1.0),
      new GfVec3f(1.0, 1.0, -1.0),
      new GfVec3f(1.0, -1.0, -1.0),
    ]

    if (scheme === PxOsdOpenSubdivTokens.loop) {
      const numVerts = [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3]
      const verts = [
        0, 1, 2, 0, 2, 3,
        4, 5, 6, 4, 6, 7,
        0, 6, 5, 0, 5, 1,
        4, 7, 3, 4, 3, 2,
        0, 3, 7, 0, 7, 6,
        4, 2, 1, 4, 1, 5,
      ]
      this.addMesh(id, transform, points, numVerts, verts,
        new PxOsdSubdivTags(), color, colorInterpolation, opacity,
        opacityInterpolation, guide, instancerId, scheme)
    } else {
      const numVerts = [4, 4, 4, 4, 4, 4]
      const verts = [
        0, 1, 2, 3,
        4, 5, 6, 7,
        0, 6, 5, 1,
        4, 7, 3, 2,
        0, 3, 7, 6,
        4, 2, 1, 5,
      ]
      this.addMesh(id, transform, points, numVerts, verts,
        new PxOsdSubdivTags(), color, colorInterpolation, opacity,
        opacityInterpolation, guide, instancerId, scheme)
    }
  }

  /** unitTestDelegate.cpp:738-761 */
  addGrid(id: string, transform: GfMatrix4d, guide = false, instancerId = ''): void {
    const points: GfVec3f[] = []
    const numVerts: number[] = []
    const verts: number[] = []
    _CreateGrid(10, 10, points, numVerts, verts)

    this.addMesh(id, transform, points, numVerts, verts,
      new PxOsdSubdivTags(),
      /*color=*/VtValue.create(new GfVec3f(1, 1, 0), VtValueTypes.GfVec3f),
      /*colorInterpolation=*/HdInterpolation.HdInterpolationConstant,
      /*opacity=*/_FloatValue(1.0),
      HdInterpolation.HdInterpolationConstant,
      false,
      instancerId)
    void guide
  }

  /** unitTestDelegate.cpp:763-814 */
  addTet(id: string, transform: GfMatrix4d, guide = false, instancerId = '',
    scheme: string = PxOsdOpenSubdivTokens.catmullClark): void {
    const points = [
      new GfVec3f(-1, -1, -1),
      new GfVec3f(-1, -1, -1),
      new GfVec3f(1, 1, -1),
      new GfVec3f(1, -1, 1),
      new GfVec3f(-1, 1, 1),
      new GfVec3f(-0.3, -0.3, -0.3),
      new GfVec3f(0.3, 0.3, -0.3),
      new GfVec3f(0.3, -0.3, 0.3),
      new GfVec3f(-0.3, 0.3, 0.3),
      new GfVec3f(-0.2, -0.6, -0.6),
      new GfVec3f(0.6, 0.2, -0.6),
      new GfVec3f(0.6, -0.6, 0.2),
      new GfVec3f(-0.6, -0.6, -0.2),
      new GfVec3f(0.2, -0.6, 0.6),
      new GfVec3f(-0.6, 0.2, 0.6),
      new GfVec3f(-0.6, -0.2, -0.6),
      new GfVec3f(-0.6, 0.6, 0.2),
      new GfVec3f(0.2, 0.6, -0.6),
      new GfVec3f(0.6, 0.6, -0.2),
      new GfVec3f(-0.2, 0.6, 0.6),
      new GfVec3f(0.6, -0.2, 0.6)]

    const numVerts = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4,
      4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]
    const verts = [1, 2, 10, 9, 9, 10, 6, 5, 2, 3, 11, 10,
      10, 11, 7, 6, 3, 1, 9, 11, 11, 9, 5, 7,
      1, 3, 13, 12, 12, 13, 7, 5, 3, 4, 14, 13,
      13, 14, 8, 7, 4, 1, 12, 14, 14, 12, 5, 8,
      1, 4, 16, 15, 15, 16, 8, 5, 4, 2, 17, 16,
      16, 17, 6, 8, 2, 1, 15, 17, 17, 15, 5, 6,
      2, 4, 19, 18, 18, 19, 8, 6, 4, 3, 20, 19,
      19, 20, 7, 8, 3, 2, 18, 20, 20, 18, 6, 7]

    this.addMesh(id, transform, points, numVerts, verts,
      new PxOsdSubdivTags(),
      /*color=*/VtValue.create(new GfVec3f(1, 1, 1), VtValueTypes.GfVec3f),
      /*colorInterpolation=*/HdInterpolation.HdInterpolationConstant,
      /*opacity=*/_FloatValue(1.0),
      HdInterpolation.HdInterpolationConstant,
      guide,
      instancerId,
      scheme)
  }

  /** unitTestDelegate.cpp:816-820 */
  remove(id: string): void {
    this.getRenderIndex().removeRprim(id)
  }

  /** unitTestDelegate.cpp:830-837 */
  setDisplayInOverlay(id: string, displayInOverlay: boolean): void {
    this._displayInOverlay.set(id, displayInOverlay)
    this.getRenderIndex().getChangeTracker().markRprimDirty(
      id, HdChangeTracker.DirtyDisplayStyle)
  }

  /** unitTestDelegate.cpp:839-847 */
  override getReprSelector(id: string): HdReprSelector {
    const mesh = this._meshes.get(id)
    if (mesh) {
      return new HdReprSelector(mesh.reprName)
    }

    return new HdReprSelector()
  }

  /** unitTestDelegate.cpp:849-857 */
  setReprName(id: string, reprName: string): void {
    const mesh = this._meshes.get(id)
    if (mesh) {
      mesh.reprName = reprName
      this.getRenderIndex().getChangeTracker().markRprimDirty(
        id, HdChangeTracker.DirtyRepr)
    }
  }

  /** unitTestDelegate.cpp:859-871 */
  override getExtent(id: string): GfRange3d {
    const range = new GfRange3d()
    let points: GfVec3f[] = []
    if (this._meshes.has(id)) {
      points = this._meshes.get(id)!.points
    }
    for (const p of points) {
      range.unionWith(new GfVec3d(p.get(0), p.get(1), p.get(2)))
    }
    return range
  }

  /** unitTestDelegate.cpp:873-883 */
  override getTransform(id: string): GfMatrix4d {
    const mesh = this._meshes.get(id)
    if (mesh) {
      return mesh.transform
    }
    const camera = this._cameraTransforms.get(id)
    if (camera) {
      return camera
    }
    return new GfMatrix4d(1)
  }

  /** unitTestDelegate.cpp:885-889 */
  override getVisible(_id: string): boolean {
    return true
  }

  /** unitTestDelegate.cpp:891-901 (operator[] default-inserts a mesh). */
  override getMeshTopology(id: string): HdMeshTopology {
    const mesh = this._meshes.get(id)
    return new HdMeshTopology(PxOsdOpenSubdivTokens.catmullClark,
      HdTokens.rightHanded,
      mesh?.numVerts ?? [],
      mesh?.verts ?? [])
  }

  /** unitTestDelegate.cpp:903-939 */
  override Get(id: string, key: string): VtValue {
    // tasks
    const vcache = this._valueCacheMap.get(id)
    const ret = vcache?.get(key)
    if (ret !== undefined) {
      return ret
    }

    // prims
    if (key === HdTokens.points) {
      const mesh = this._meshes.get(id)
      if (mesh) {
        return _Vec3fArrayValue(mesh.points)
      }
    } else if (key === HdTokens.displayColor) {
      const mesh = this._meshes.get(id)
      if (mesh) {
        return mesh.color
      }
    } else if (key === HdTokens.displayOpacity) {
      const mesh = this._meshes.get(id)
      if (mesh) {
        return mesh.opacity
      }
    } else if (key === HdInstancerTokens.instanceScales) {
      const instancer = this._instancers.get(id)
      if (instancer) {
        return _Vec3fArrayValue(instancer.scale)
      }
    } else if (key === HdInstancerTokens.instanceRotations) {
      const instancer = this._instancers.get(id)
      if (instancer) {
        return _Vec4fArrayValue(instancer.rotate)
      }
    } else if (key === HdInstancerTokens.instanceTranslations) {
      const instancer = this._instancers.get(id)
      if (instancer) {
        return _Vec3fArrayValue(instancer.translate)
      }
    }
    return VtValue.getEmpty()
  }

  /** unitTestDelegate.cpp:941-967 */
  override getInstanceIndices(instancerId: string, prototypeId: string): number[] {
    const indices: number[] = []
    //
    // XXX: this is very naive implementation for unit test.
    //
    //   transpose prototypeIndices/instances to instanceIndices/prototype
    const instancer = this._instancers.get(instancerId)
    if (instancer) {
      const prototypeIndex = instancer.prototypes.indexOf(prototypeId)
      if (prototypeIndex < 0) return indices

      for (let i = 0; i < instancer.prototypeIndices.length; ++i) {
        if (instancer.prototypeIndices[i] === prototypeIndex) {
          indices.push(i)
        }
      }
    }
    return indices
  }

  /** unitTestDelegate.cpp:969-979 */
  override getInstancerPrototypes(instancerId: string): string[] {
    const instancer = this._instancers.get(instancerId)
    if (instancer) {
      return [...instancer.prototypes]
    }
    return []
  }

  /** unitTestDelegate.cpp:981-990 */
  override getInstancerTransform(instancerId: string): GfMatrix4d {
    const instancer = this._instancers.get(instancerId)
    if (instancer) {
      return instancer.rootTransform ? new GfMatrix4d(instancer.rootTransform) : new GfMatrix4d(1)
    }
    return new GfMatrix4d(1)
  }

  /** unitTestDelegate.cpp:992-1010 */
  override getDisplayStyle(id: string): HdDisplayStyle {
    let refineLevel = this._refineLevel
    if (this._refineLevels.has(id)) {
      refineLevel = this._refineLevels.get(id)!
    }

    let displayInOverlay = false
    if (this._displayInOverlay.has(id)) {
      displayInOverlay = this._displayInOverlay.get(id)!
    }

    return new HdDisplayStyle(refineLevel,
      /*flatShading=*/false,
      /*displacement=*/true,
      displayInOverlay)
  }

  /** unitTestDelegate.cpp:1012-1041 */
  override getPrimvarDescriptors(id: string, interpolation: HdInterpolation): HdPrimvarDescriptorVector {
    const primvars: HdPrimvarDescriptorVector = []
    if (interpolation === HdInterpolation.HdInterpolationVertex) {
      primvars.push(new HdPrimvarDescriptor(HdTokens.points, interpolation,
        HdPrimvarRoleTokens.point))
    }
    const mesh = this._meshes.get(id)
    if (mesh) {
      if (mesh.colorInterpolation === interpolation) {
        primvars.push(new HdPrimvarDescriptor(HdTokens.displayColor, interpolation,
          HdPrimvarRoleTokens.color))
      }
      if (mesh.opacityInterpolation === interpolation) {
        primvars.push(new HdPrimvarDescriptor(HdTokens.displayOpacity, interpolation))
      }
    }
    if (interpolation === HdInterpolation.HdInterpolationInstance &&
      this._instancers.has(id)) {
      primvars.push(new HdPrimvarDescriptor(HdInstancerTokens.instanceScales,
        interpolation))
      primvars.push(new HdPrimvarDescriptor(HdInstancerTokens.instanceRotations,
        interpolation))
      primvars.push(new HdPrimvarDescriptor(HdInstancerTokens.instanceTranslations,
        interpolation))
    }
    return primvars
  }

  /** unitTestDelegate.cpp:1043-1050 */
  addMaterialResource(id: string, materialResource: VtValue): void {
    const index = this.getRenderIndex()
    index.insertSprim(HdPrimTypeTokens.material, this, id)
    this._materials.set(id, materialResource)
  }

  /** unitTestDelegate.cpp:1052-1057 */
  bindMaterial(rprimId: string, materialId: string): void {
    this._materialBindings.set(rprimId, materialId)
  }

  /** unitTestDelegate.cpp:1059-1066 */
  override getMaterialId(rprimId: string): string {
    return this._materialBindings.get(rprimId) ?? ''
  }

  /** unitTestDelegate.cpp:1068-1076 */
  override getMaterialResource(materialId: string): VtValue {
    return this._materials.get(materialId) ?? VtValue.getEmpty()
  }

  /** unitTestDelegate.cpp:1078-1085 */
  override getInstancerId(primId: string): string {
    return this._instancerBindings.get(primId) ?? ''
  }

  /** unitTestDelegate.cpp:1087-1099 */
  override getCameraParamValue(cameraId: string, paramName: string): VtValue {
    const vcache = this._valueCacheMap.get(cameraId)
    const ret = vcache?.get(paramName)
    if (ret !== undefined) {
      return ret
    }

    return VtValue.getEmpty()
  }

  /** unitTestDelegate.cpp:1101-1119 */
  override getRenderBufferDescriptor(id: string): HdRenderBufferDescriptor {
    const vcache = this._valueCacheMap.get(id)
    if (!vcache) {
      return new HdRenderBufferDescriptor()
    }

    const ret = vcache.get(_tokens.renderBufferDescriptor)
    if (!ret) {
      return new HdRenderBufferDescriptor()
    }

    const held = ret.IsEmpty() ? undefined : ret.UncheckedGet<unknown>()
    if (!(held instanceof HdRenderBufferDescriptor)) {
      return new HdRenderBufferDescriptor()
    }

    return held
  }

  /** unitTestDelegate.cpp:1121-1135 */
  override getTaskRenderTags(taskId: string): TfToken[] {
    const it1 = this._valueCacheMap.get(taskId)
    if (!it1) {
      return []
    }

    const it2 = it1.get(HdTokens.renderTags)
    if (!it2) {
      return []
    }

    return [...it2.Get<string[]>()].map(t => TfToken(t))
  }

  /** unitTestDelegate.cpp:1137-1184 (see the header). */
  async writeRenderBufferToFile(id: string, filePath: string): Promise<boolean> {
    const prim = this.getRenderIndex().getBprim(HdPrimTypeTokens.renderBuffer, id)
    const renderBuffer = prim as (HdRenderBuffer & Partial<Pick<HdStRenderBuffer, 'MapAsync'>>) | undefined
    if (!renderBuffer || typeof renderBuffer.getWidth !== 'function') {
      TF_CODING_ERROR(`No HdRenderBuffer prim at path ${id}`)
      return false
    }

    const width = renderBuffer.getWidth()
    const height = renderBuffer.getHeight()
    const format = HdStHioConversions.GetHioFormat(renderBuffer.GetFormat())
    const data = renderBuffer.MapAsync
      ? await renderBuffer.MapAsync()
      : renderBuffer.Map() as Uint8Array | null
    renderBuffer.unmap()

    // HioFormatInvalid is -1.
    if (format === -1) {
      TF_CODING_ERROR(`Render buffer ${id} has format not corresponding to a` +
        'HioFormat')
      return false
    }

    if (!data) {
      TF_CODING_ERROR(`No data for render buffer ${id}`)
      return false
    }

    if (!_imageWriter) {
      TF_RUNTIME_ERROR(`Failed toopen image for writing ${filePath}`)
      return false
    }

    if (!await _imageWriter(filePath, { width, height, format, flipped: true, data })) {
      TF_RUNTIME_ERROR(`Failed to write image to ${filePath}`)
      return false
    }

    return true
  }
}

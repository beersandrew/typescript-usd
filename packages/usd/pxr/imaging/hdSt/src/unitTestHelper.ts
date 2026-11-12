// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/unitTestHelper.cpp,
//  pxr/imaging/hdSt/unitTestHelper.h,
//  pxr/imaging/hdSt/testenv/testHdStDepthBias.cpp
// Copyright 2016, 2017, 2025 Pixar. Tomorrow Open Source Technology License
//  1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/unitTestHelper.{h,cpp} (OpenUSD 26.11.1):
// HdSt_TestDriverBase<HdUnitTestDelegate> and HdSt_DrawTask, the pieces the
// Storm image tests (testHdStDepthBias, ...) are built from.
//
// Divergences:
// - The driver is given its Hgi (upstream: Hgi::CreatePlatformDefaultHgi(),
//   unitTestHelper.h:180), because creating a WebGPU Hgi is asynchronous
//   (hgi/src/hgi.ts header) and Node tests use a GPU-less Hgi.
// - WriteToFile (unitTestHelper.h:401-445) writes the render buffer through
//   HioImage::OpenForWriting; image writing is not part of this repo's hio,
//   so ReadBackAov() performs the same render buffer Map (asynchronously, see
//   renderBuffer.ts) and returns the HioImage::StorageSpec fields upstream
//   fills in; the caller writes or compares the texels.
// - Present (unitTestHelper.h:470-490) blits to an OpenGL framebuffer through
//   HgiInterop; not ported (offscreen tests only).
// - HdSt_TextureTestDriver (unitTestHelper.h:632-700, unitTestHelper.cpp:
//   302-560) is not ported; FAITHFULNESS-DEBT(hdst-unit-test-driver): port
//   it with the first test that uses it.

import {
  Camera as GfCamera,
  Frustum as GfFrustum,
  Matrix4d as GfMatrix4d,
  Matrix4f as GfMatrix4f,
  Rect2i as GfRect2i,
  makeRotation as GfMakeRotation,
  Vec2i as GfVec2i,
  Vec3d as GfVec3d,
  Vec3f as GfVec3f,
  Vec4f as GfVec4f,
  type Vec4d as GfVec4d,
} from 'typescript-usd/gf'
import { Token as TfToken, Type as TfType } from 'typescript-usd/tf'
import { Array as VtArray, Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import {
  AovTokens as HdAovTokens,
  CameraTokens as HdCameraTokens,
  Camera as HdCamera,
  Engine as HdEngine,
  PrimTypeTokens as HdPrimTypeTokens,
  BufferArrayUsageHintBits as HdBufferArrayUsageHintBits,
  CompareFunction as HdCompareFunction,
  RenderIndex as HdRenderIndex,
  RenderTagTokens as HdRenderTagTokens,
  Type as HdType,
  VtBufferSource as HdVtBufferSource,
  type BufferArrayRange as HdBufferArrayRange,
  type BufferSpec as HdBufferSpec,
  RenderPassAovBinding as HdRenderPassAovBinding,
  RenderBufferDescriptor as HdRenderBufferDescriptor,
  ReprSelector as HdReprSelector,
  ReprTokens as HdReprTokens,
  RprimCollection as HdRprimCollection,
  Task as HdTask,
  UnitTestDelegate as HdUnitTestDelegate,
  type CullStyle as HdCullStyle,
  type RenderPass as HdRenderPass,
  type TaskContext as HdTaskContext,
} from 'typescript-usd/hd'
import { Framing as CameraUtilFraming, ConformWindowPolicy as CameraUtilConformWindowPolicy } from 'typescript-usd/cameraUtil'
import { HgiTokens, type Hgi } from 'typescript-usd/hgi'
import { HioGlslfx, HioGlslfxInputStream } from 'typescript-usd/hio'
import { HdStBinding, HdStBindingRequest } from './binding.ts'
import { HdStHioConversions } from './hioConversions.ts'
import { HdStLightingShader } from './lightingShader.ts'
import { HdSt_RenderPass } from './renderPass.ts'
import type { HdStRenderBuffer } from './renderBuffer.ts'
import { HdStRenderDelegate } from './renderDelegate.ts'
import type { HdStRenderPassState } from './renderPassState.ts'
import type { HdSt_ResourceBinder } from './resourceBinder.ts'
import type { HdStResourceRegistry } from './resourceRegistry.ts'
import type { HdStShaderCodeID } from './shaderCode.ts'
import { TF_CODING_ERROR, TF_VERIFY } from './tfDiagnostic.ts'

/** HioImage::StorageSpec fields WriteToFile fills (unitTestHelper.h:416-421). */
export interface HdStTestAovReadback {
  width: number
  height: number
  format: number
  flipped: boolean
  data: Uint8Array
}

/** unitTestHelper.h:285-298 (_ToHd) */
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

/** unitTestHelper.h:362-365 (_aovOutputs) */
const _aovOutputs = [HdAovTokens.color, HdAovTokens.depth]

/** TfMakeValidIdentifier (tf/stringUtils.cpp) for the AOV names used here. */
function _MakeValidIdentifier(s: string): string {
  let out = s.replace(/[^A-Za-z0-9_]/g, '_')
  if (out.length === 0 || /[0-9]/.test(out[0]!)) out = '_' + out.slice(1)
  return out
}

/** The scene delegate members HdSt_TestDriverBase<SceneDelegate> uses
 *  (HdUnitTestDelegate and Hdx_UnitTestDelegate both have them). */
export interface HdSt_TestDriverSceneDelegate {
  getRenderIndex(): HdRenderIndex
  addCamera(id: string): void
  updateCamera(id: string, key: string, value: VtValue): void
  updateTransform(id: string, mat: GfMatrix4f): void
  addRenderBuffer(id: string, desc: HdRenderBufferDescriptor): void
  updateRenderBuffer(id: string, desc: HdRenderBufferDescriptor): void
  getRenderBufferDescriptor(id: string): HdRenderBufferDescriptor
}

/** unitTestHelper.h:46-170: a test driver for Storm with a scene delegate,
 *  render index, render delegate and engine. The template parameter
 *  SceneDelegate is the type parameter D; the delegate is created by
 *  _NewSceneDelegate (`new SceneDelegate(_renderIndex.get())` upstream). */
export class HdSt_TestDriverBase<D extends HdSt_TestDriverSceneDelegate = HdUnitTestDelegate> {
  protected _renderPasses: HdRenderPass[] = []
  protected _renderPassStates: HdStRenderPassState[] = []
  protected _aovBindings: HdRenderPassAovBinding[] = []
  protected _aovBufferIds: string[] = []
  protected _cameraId = ''
  protected _collection = new HdRprimCollection(TfToken('testCollection'), new HdReprSelector())

  // Hgi and HdDriver should be constructed before HdEngine to ensure they
  // are destructed last. Hgi may be used during engine/delegate destruction.
  private readonly _hgi: Hgi
  private readonly _hgiDriver: { name: string, driver: unknown }
  private readonly _renderDelegate = new HdStRenderDelegate()
  private readonly _engine = new HdEngine()
  private _renderIndex: HdRenderIndex | null = null
  private _sceneDelegate: D | null = null
  private _clearColor = new GfVec4f(0, 0, 0, 1)
  private _clearDepth = 1

  /** unitTestHelper.h:174-188 (see the header note on the Hgi). */
  constructor(hgi: Hgi) {
    this._hgi = hgi
    this._hgiDriver = { name: HgiTokens.renderDriver, driver: hgi }
  }

  /** unitTestHelper.h:203-211 */
  protected _setupSceneDelegate(): void {
    // HdRenderIndex::New hands the drivers to the render delegate
    // (hd/renderIndex.cpp:185-186) and, as in OpenUSD 26.11, routes the
    // HdUnitTestDelegate's prims through scene index emulation
    // (hd/renderIndex.cpp:148-252).
    this._renderIndex = HdRenderIndex.new(this._renderDelegate, [this._hgiDriver])
    TF_VERIFY(this._renderIndex !== null)
    this._sceneDelegate = this._newSceneDelegate(this._renderIndex!)
  }

  /** unitTestHelper.h:209-210 (`std::make_unique<SceneDelegate>(...)`). */
  protected _newSceneDelegate(renderIndex: HdRenderIndex): D {
    return new HdUnitTestDelegate(renderIndex, '/') as unknown as D
  }

  /** unitTestHelper.h:213-246 */
  protected _init(reprSelector: HdReprSelector = new HdReprSelector(HdReprTokens.smoothHull)): void {
    this._setupSceneDelegate()

    this._cameraId = '/testCam'
    this._sceneDelegate!.addCamera(this._cameraId)

    let viewMatrix = new GfMatrix4d().setIdentity()
    viewMatrix = viewMatrix.getMultiply(new GfMatrix4d().setTranslate(new GfVec3d(0.0, 1000.0, 0.0)))
    viewMatrix = viewMatrix.getMultiply(new GfMatrix4d().setRotate(
      GfMakeRotation([1.0, 0.0, 0.0], -90.0)))

    const frustum = new GfFrustum()
    frustum.setPerspective(45, true, 1, 1.0, 10000.0)
    const projMatrix = frustum.computeProjectionMatrix()

    this.setCamera(viewMatrix, projMatrix,
      new CameraUtilFraming(new GfRect2i(new GfVec2i(0, 0), 512, 512)))

    // Update collection with repr and add collection to change tracker.
    this._collection.setReprSelector(reprSelector)
    const tracker = this._renderIndex!.getChangeTracker()
    tracker.addCollection(this._collection.getName())
  }

  /** unitTestHelper.h:300-358 */
  setCamera(viewMatrix: GfMatrix4d, projectionMatrix: GfMatrix4d, framing: CameraUtilFraming): void {
    const cam = new GfCamera()
    cam.setFromViewAndProjectionMatrix(viewMatrix, projectionMatrix)
    const delegate = this._sceneDelegate!
    const f = (x: number): VtValue => VtValue.create(Math.fround(x), VtValueTypes.float)
    delegate.updateTransform(this._cameraId, new GfMatrix4f(cam.getTransform()))
    delegate.updateCamera(this._cameraId, HdCameraTokens.projection,
      VtValue.create(_ToHd(cam.GetProjection()), VtValueTypes.int))
    delegate.updateCamera(this._cameraId, HdCameraTokens.focalLength,
      f(cam.getFocalLength() * Math.fround(GfCamera.FOCAL_LENGTH_UNIT)))
    delegate.updateCamera(this._cameraId, HdCameraTokens.horizontalAperture,
      f(cam.GetHorizontalAperture() * Math.fround(GfCamera.APERTURE_UNIT)))
    delegate.updateCamera(this._cameraId, HdCameraTokens.verticalAperture,
      f(cam.getVerticalAperture() * Math.fround(GfCamera.APERTURE_UNIT)))
    delegate.updateCamera(this._cameraId, HdCameraTokens.horizontalApertureOffset,
      f(cam.getHorizontalApertureOffset() * Math.fround(GfCamera.APERTURE_UNIT)))
    delegate.updateCamera(this._cameraId, HdCameraTokens.verticalApertureOffset,
      f(cam.getVerticalApertureOffset() * Math.fround(GfCamera.APERTURE_UNIT)))
    delegate.updateCamera(this._cameraId, HdCameraTokens.clippingRange,
      VtValue.create(cam.getClippingRange(), TfType.declare('GfRange1f')))
    // Baselines for tests were generated without constraining the view
    // frustum based on the viewport aspect ratio.
    delegate.updateCamera(this._cameraId, HdCameraTokens.windowPolicy,
      VtValue.create(CameraUtilConformWindowPolicy.CameraUtilDontConform, VtValueTypes.int))

    const camera = this._renderIndex!.getSprim(HdPrimTypeTokens.camera, this._cameraId) as HdCamera | undefined
    TF_VERIFY(camera)

    for (const renderPassState of this._renderPassStates) {
      renderPassState.setCamera(camera ?? null)
      renderPassState.setFraming(framing)
      renderPassState.setOverrideWindowPolicy(undefined)
    }
  }

  /** unitTestHelper.h:300-306 */
  setCameraClipPlanes(clipPlanes: readonly GfVec4d[]): void {
    this._sceneDelegate!.updateCamera(this._cameraId, HdCameraTokens.clipPlanes,
      VtValue.create([...clipPlanes], VtValueTypes.GfVec4d))
  }

  /** unitTestHelper.h:308-316 */
  setCullStyle(cullStyle: HdCullStyle): void {
    for (const renderPassState of this._renderPassStates) {
      renderPassState.setCullStyle(cullStyle)
    }
  }

  /** unitTestHelper.h:318-326 */
  setWireframeColor(color: GfVec4f): void {
    for (const renderPassState of this._renderPassStates) {
      renderPassState.setWireframeColor(color)
    }
  }

  /** unitTestHelper.h:63 */
  getDelegate(): D { return this._sceneDelegate! }

  /** unitTestHelper.h:328-340 */
  setRepr(reprSelector: HdReprSelector): void {
    this._collection.setReprSelector(reprSelector)

    // Mark changes.
    const tracker = this._renderIndex!.getChangeTracker()
    tracker.markCollectionDirty(this._collection.getName())

    for (const renderPass of this._renderPasses) {
      renderPass.setRprimCollection(this._collection)
    }
  }

  /** unitTestHelper.h:367-375 */
  protected _getAovPath(aov: string): string {
    const identifier = 'aov_' + _MakeValidIdentifier(aov)
    return '/testDriver/' + identifier
  }

  /** unitTestHelper.h:377-424 */
  setupAovs(width: number, height: number, multisampled = false): void {
    if (this._aovBindings.length === 0) {
      // Delete old render buffers.
      for (const id of this._aovBufferIds) {
        this._renderIndex!.removeBprim(HdPrimTypeTokens.renderBuffer, id)
      }
      this._aovBufferIds = []
      this._aovBindings = []

      const dimensions: [number, number, number] = [width, height, 1]

      // Create aov bindings and render buffers.
      for (const aovName of _aovOutputs) {
        const aovId = this._getAovPath(aovName)
        this._aovBufferIds.push(aovId)

        const aovDesc = this._renderDelegate.getDefaultAovDescriptor(aovName)
        const desc = new HdRenderBufferDescriptor(dimensions, aovDesc.format, multisampled)
        this.getDelegate().addRenderBuffer(aovId, desc)

        const binding = new HdRenderPassAovBinding()
        binding.aovName = aovName
        binding.aovSettings = aovDesc.aovSettings
        binding.renderBufferId = aovId
        binding.renderBuffer = this._renderIndex!.getBprim(HdPrimTypeTokens.renderBuffer, aovId)
        if (aovName === HdAovTokens.color) {
          binding.clearValue = VtValue.create(this._clearColor, VtValueTypes.GfVec4f)
        } else if (aovName === HdAovTokens.depth) {
          binding.clearValue = VtValue.create(Math.fround(this._clearDepth), VtValueTypes.float)
        }
        this._aovBindings.push(binding)
      }
    }

    for (const renderPassState of this._renderPassStates) {
      renderPassState.setAovBindings(this._aovBindings)
    }
  }

  /** unitTestHelper.h:401-445 (see the header note). */
  async readBackAov(attachment: string): Promise<HdStTestAovReadback | null> {
    const aovId = this._getAovPath(attachment)
    const renderBuffer = this.getDelegate().getRenderIndex().getBprim(
      HdPrimTypeTokens.renderBuffer, aovId) as HdStRenderBuffer | undefined
    if (!renderBuffer) {
      TF_CODING_ERROR(`No HdRenderBuffer prim at path ${aovId}`)
      return null
    }

    const width = renderBuffer.getWidth()
    const height = renderBuffer.getHeight()
    const format = HdStHioConversions.GetHioFormat(renderBuffer.GetFormat())
    const data = await renderBuffer.MapAsync()
    renderBuffer.unmap()
    if (!data) {
      TF_CODING_ERROR(`No data for render buffer ${aovId}`)
      return null
    }
    return { width, height, format, flipped: true, data }
  }

  /** unitTestHelper.h:447-466 */
  updateAovDimensions(width: number, height: number): void {
    const dimensions: [number, number, number] = [width, height, 1]

    for (const id of this._aovBufferIds) {
      const desc = this.getDelegate().getRenderBufferDescriptor(id)
      if (desc.dimensions.some((d: number, i: number) => d !== dimensions[i])) {
        desc.dimensions = dimensions
        this.getDelegate().updateRenderBuffer(id, desc)
      }
    }
  }

  /** unitTestHelper.h:94-96 */
  setClearColor(clearColor: GfVec4f): void {
    this._clearColor = clearColor
  }

  /** unitTestHelper.h:98-100 */
  setClearDepth(clearDepth: number): void {
    this._clearDepth = clearDepth
  }

  /** unitTestHelper.h:102 */
  getHgi(): Hgi { return this._hgi }

  /** unitTestHelper.h:109 */
  protected _getCollection(): HdRprimCollection { return this._collection }

  /** unitTestHelper.h:111 */
  protected _getRenderDelegate(): HdStRenderDelegate { return this._renderDelegate }

  /** unitTestHelper.h:113 */
  protected _getEngine(): HdEngine { return this._engine }
}

/** unitTestHelper.h:496-535 / unitTestHelper.cpp:36-68. A simple task to
 *  execute a render pass. */
export class HdSt_DrawTask extends HdTask {
  private readonly _renderPass: HdRenderPass
  private readonly _renderPassState: HdStRenderPassState
  private readonly _renderTags: readonly string[]

  /** unitTestHelper.cpp:36-45 */
  constructor(renderPass: HdRenderPass, renderPassState: HdStRenderPassState,
    renderTags: readonly string[]) {
    super('')
    this._renderPass = renderPass
    this._renderPassState = renderPassState
    this._renderTags = renderTags
  }

  /** unitTestHelper.cpp:47-54 */
  sync(_delegate: unknown, _ctx: HdTaskContext, _dirtyBits: unknown): void {
    this._renderPass.sync()
  }

  /** unitTestHelper.cpp:56-62 */
  Prepare(_ctx: HdTaskContext, renderIndex: HdRenderIndex): void {
    this._renderPassState.Prepare(renderIndex.getResourceRegistry())
  }

  /** unitTestHelper.cpp:64-68 */
  Execute(_ctx: HdTaskContext): void {
    this._renderPass.Execute(this._renderPassState, this.getRenderTags())
  }

  /** unitTestHelper.h:516-519 */
  override getRenderTags(): readonly string[] {
    return this._renderTags
  }
}

/** unitTestHelper.cpp:21-33 */
const _tokens = {
  lighting: TfToken('lighting'),
  l0dir: TfToken('l0dir'),
  l0color: TfToken('l0color'),
  l1dir: TfToken('l1dir'),
  l1color: TfToken('l1color'),
  sceneAmbient: TfToken('sceneAmbient'),
  vec3: TfToken('vec3'),

  // Collection names
  testCollection: TfToken('testCollection'),
}

/** unitTestHelper.h:538-573 / unitTestHelper.cpp:78-155. A unit test driver
 *  that exercises the core engine. The constructor takes the driver's Hgi
 *  first (see the header note) and then, as upstream's three constructors
 *  do, nothing, a repr name or a repr selector. */
export class HdSt_TestDriver extends HdSt_TestDriverBase {
  /** unitTestHelper.cpp:78-106 */
  constructor(hgi: Hgi, repr?: TfToken | HdReprSelector) {
    super(hgi)
    this._createRenderPassState()

    // Init sets up the camera in the render pass state and
    // thus needs to be called after render pass state has been setup.
    if (repr === undefined) {
      this._init()
    } else if (repr instanceof HdReprSelector) {
      this._init(repr)
    } else {
      this._init(new HdReprSelector(repr))
    }
  }

  /** unitTestHelper.cpp:108-117 */
  private _createRenderPassState(): void {
    this._renderPassStates = [
      this._getRenderDelegate().createRenderPassState()]
    // set depthfunc to GL default
    this._renderPassStates[0]!.setDepthFunc(HdCompareFunction.HdCmpFuncLess)
    this._renderPassStates[0]!.setAlphaToCoverageEnabled(true)
  }

  /** unitTestHelper.h:563-566 */
  getRenderPassState(): HdStRenderPassState {
    return this._renderPassStates[0]!
  }

  /** unitTestHelper.cpp:119-132 */
  getRenderPass(): HdRenderPass {
    if (this._renderPasses.length === 0) {
      const renderPass = new HdSt_RenderPass(
        this.getDelegate().getRenderIndex(),
        this._getCollection())

      this._renderPasses.push(renderPass)
    }
    return this._renderPasses[0]!
  }

  /** unitTestHelper.cpp:134-155: Draw(withGuides) and
   *  Draw(renderPass, withGuides). */
  draw(withGuides?: boolean): void
  draw(renderPass: HdRenderPass, withGuides: boolean): void
  draw(a: boolean | HdRenderPass = false, b = false): void {
    const renderPass = typeof a === 'boolean' ? this.getRenderPass() : a
    const withGuides = typeof a === 'boolean' ? a : b

    const geometryTags = [HdRenderTagTokens.geometry]
    const geometryAndGuideTags = [
      HdRenderTagTokens.geometry,
      HdRenderTagTokens.guide]

    const tasks: HdTask[] = [
      new HdSt_DrawTask(
        renderPass,
        this._renderPassStates[0]!,
        withGuides ? geometryAndGuideTags : geometryTags)]
    this._getEngine().Execute(this.getDelegate().getRenderIndex(), tasks)
  }
}

/** unitTestHelper.h:617-622 */
interface _Light {
  dir: GfVec3f
  eyeDir: GfVec3f
  color: GfVec3f
}

/** unitTestHelper.cpp:271-282 (_GetBindingRequest) */
function _GetBindingRequest(lightingBar: HdBufferArrayRange | null): HdStBindingRequest {
  return new HdStBindingRequest(HdStBinding.UBO,
    _tokens.lighting,
    lightingBar ?? { bar: null },
    /*interleaved=*/true,
    /*writable=*/false,
    /*arraySize=*/1,
    /*concatenateNames=*/true)
}

/** unitTestHelper.h:576-630 / unitTestHelper.cpp:158-300. A custom lighting
 *  shader for unit tests. */
export class HdSt_TestLightingShader extends HdStLightingShader {
  private readonly _renderIndex: HdRenderIndex
  private readonly _lights: [_Light, _Light]
  private _sceneAmbient: GfVec3f
  private readonly _glslfx: HioGlslfx
  private _lightingBar: HdBufferArrayRange | null = null

  /** unitTestHelper.cpp:158-185 */
  constructor(renderIndex: HdRenderIndex) {
    super()
    this._renderIndex = renderIndex
    const lightingShader =
      '-- glslfx version 0.1                                              \n' +
      '-- configuration                                                   \n' +
      '{"techniques": {"default": {"fragmentShader" : {             \n' +
      ' "source": ["TestLighting.Lighting"]                           \n' +
      '}}}}                                                               \n' +
      '-- glsl TestLighting.Lighting                                      \n' +
      'vec3 FallbackLighting(vec3 Peye, vec3 Neye, vec3 color) {          \n' +
      '    vec3 n = normalize(Neye);                                      \n' +
      '    return HdGet_lighting_sceneAmbient()                           \n' +
      '      + color * HdGet_lighting_l0color()                           \n' +
      '              * max(0.0, dot(n, HdGet_lighting_l0dir()))           \n' +
      '      + color * HdGet_lighting_l1color()                           \n' +
      '              * max(0.0, dot(n, HdGet_lighting_l1dir()));          \n' +
      '}                                                                  \n'

    // eyeDir is value-initialized (unitTestHelper.h:617-622).
    this._lights = [
      { dir: new GfVec3f(0, 0, 1), eyeDir: new GfVec3f(0, 0, 0), color: new GfVec3f(1, 1, 1) },
      { dir: new GfVec3f(0, 0, 1), eyeDir: new GfVec3f(0, 0, 0), color: new GfVec3f(0, 0, 0) },
    ]
    this._sceneAmbient = new GfVec3f(0.04, 0.04, 0.04)

    this._glslfx = new HioGlslfx(new HioGlslfxInputStream(lightingShader))
  }

  /** unitTestHelper.cpp:191-199 */
  override computeHash(): HdStShaderCodeID {
    const hash = this._glslfx.getHash()
    return hash
  }

  /** unitTestHelper.cpp:201-210 */
  override getSource(shaderStageKey: TfToken): string {
    const source = this._glslfx.getSource(shaderStageKey)
    return source
  }

  /** unitTestHelper.cpp:212-233 */
  override setCamera(worldToViewMatrix: GfMatrix4d, _projectionMatrix: GfMatrix4d): void {
    // Update the lighting resource buffers only when necessary
    let lightsChanged = false

    for (let i = 0; i < 2; ++i) {
      const light = this._lights[i]!
      // GfVec3f(GfMatrix4d::TransformDir(GfVec3f)).GetNormalized()
      const eyeDir = new GfVec3f(
        worldToViewMatrix.transformDir(light.dir)).GetNormalized()

      if (!light.eyeDir.equals(eyeDir)) {
        lightsChanged = true
        light.eyeDir = eyeDir
      }
    }

    if (lightsChanged) {
      this.Prepare()
    }
  }

  /** unitTestHelper.cpp:235-269. Prepare lighting resource buffers. */
  Prepare(): void {
    const hdStResourceRegistry =
      this._renderIndex.getResourceRegistry() as unknown as HdStResourceRegistry

    const vec3 = { type: HdType.HdTypeFloatVec3, count: 1 }
    const bufferSpecs: HdBufferSpec[] = [
      { name: _tokens.l0dir, tupleType: vec3 },
      { name: _tokens.l0color, tupleType: vec3 },
      { name: _tokens.l1dir, tupleType: vec3 },
      { name: _tokens.l1color, tupleType: vec3 },
      { name: _tokens.sceneAmbient, tupleType: vec3 },
    ]

    this._lightingBar =
      hdStResourceRegistry.allocateUniformBufferArrayRange(
        _tokens.lighting,
        bufferSpecs,
        HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsUniform)

    const v = (value: GfVec3f): VtValue =>
      VtValue.createArray(new VtArray<GfVec3f>([value], VtValueTypes.GfVec3f))
    const sources = [
      new HdVtBufferSource(_tokens.l0dir, v(this._lights[0].eyeDir)),
      new HdVtBufferSource(_tokens.l0color, v(this._lights[0].color)),
      new HdVtBufferSource(_tokens.l1dir, v(this._lights[1].eyeDir)),
      new HdVtBufferSource(_tokens.l1color, v(this._lights[1].color)),
      new HdVtBufferSource(_tokens.sceneAmbient, v(this._sceneAmbient)),
    ]

    hdStResourceRegistry.addSources(this._lightingBar!, sources)
  }

  /** unitTestHelper.cpp:284-290 */
  override bindResources(_program: number, binder: HdSt_ResourceBinder): void {
    binder.bind(_GetBindingRequest(this._lightingBar))
  }

  /** unitTestHelper.cpp:292-298 */
  override unbindResources(_program: number, binder: HdSt_ResourceBinder): void {
    binder.unbind(_GetBindingRequest(this._lightingBar))
  }

  /** unitTestHelper.cpp:300-305 */
  override addBindings(customBindings: HdStBindingRequest[]): void {
    customBindings.push(_GetBindingRequest(this._lightingBar))
  }

  /** unitTestHelper.cpp:307-311 */
  setSceneAmbient(color: GfVec3f): void {
    this._sceneAmbient = color
  }

  /** unitTestHelper.cpp:313-322 */
  setLight(light: number, dir: GfVec3f, color: GfVec3f): void {
    if (light < 2) {
      this._lights[light]!.dir = dir
      this._lights[light]!.eyeDir = dir
      this._lights[light]!.color = color
    }
  }
}

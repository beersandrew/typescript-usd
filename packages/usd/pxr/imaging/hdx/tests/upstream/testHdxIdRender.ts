// Ported from OpenUSD 26.11.1: pxr/imaging/hdx/testenv/testHdxIdRender.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdx/testenv/testHdxIdRender.cpp (OpenUSD 26.11.1).
// Browser test program (tests/browser/hdx-image/run.mjs); registered twice
// (hdx/CMakeLists.txt:275-282): `--offscreen` and `--offscreen --repr
// refined --refineLevel 2`. Its expectations are the TF_VERIFYs of
// OffscreenTest (the picked prim and instance at five pixels); the native
// run prints OK (fixtures/testenvImages/testHdxIdRender{,_Refined}/
// capture.json).
//
// Divergences: no window (offscreen only; MousePress/Present/DrawTest are
// not ported); Hgi is given; reading an AOV back is asynchronous
// (HdStTextureUtils::HgiTextureReadback, hdSt/src/textureUtils.ts), so
// PickScene and OffscreenTest are async. Returns the exit status and stdout
// instead of exiting.

import { TfErrorMark, Token as TfToken, Type as TfType } from 'typescript-usd/tf'
import {
  Matrix4d as GfMatrix4d,
  Vec2d as GfVec2d,
  Vec3f as GfVec3f,
  Vec4d as GfVec4d,
  Vec4f as GfVec4f,
} from 'typescript-usd/gf'
import { Array as VtArray, Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import {
  AovTokens as HdAovTokens,
  Interpolation as HdInterpolation,
  PrimTypeTokens as HdPrimTypeTokens,
  RenderBufferDescriptor as HdRenderBufferDescriptor,
  RenderPassAovBinding as HdRenderPassAovBinding,
  ReprSelector as HdReprSelector,
  ReprTokens as HdReprTokens,
  RprimCollection as HdRprimCollection,
  Tokens as HdTokens,
  type RenderIndex as HdRenderIndex,
  type Task as HdTask,
} from 'typescript-usd/hd'
import type { Hgi, HgiTextureHandle } from 'typescript-usd/hgi'
import { OpenSubdivTokens as PxOsdOpenSubdivTokens } from 'typescript-usd/pxOsd'
import { _TestDriverBase as HdSt_TestDriverBase } from 'typescript-usd/hdSt'
import { HdStTextureUtils } from '../../../hdSt/src/textureUtils.ts'
import { HdSt_UnitTestGLDrawing } from '../../../hdSt/tests/upstream/unitTestGLDrawing.ts'
import { HdxPickTask } from '../../src/pickTask.ts'
import { HdxRenderTaskParams, HdxRenderTaskParamsType } from '../../src/renderSetupTask.ts'
import { Hdx_UnitTestDelegate } from '../../src/unitTestDelegate.ts'
import { TF_VERIFY } from '../../src/tfDiagnostic.ts'

const _HdRprimCollectionType = TfType.declare('HdRprimCollection')

/** testHdxIdRender.cpp:25-28 */
interface PickParam {
  location: GfVec2d
  viewport: GfVec4d
}

/** testHdxIdRender.cpp:30-51 */
class Hdx_TestDriver extends HdSt_TestDriverBase<Hdx_UnitTestDelegate> {
  private _pickableAovBindings: HdRenderPassAovBinding[] = []
  private _pickableAovBufferIds: string[] = []

  /** testHdxIdRender.cpp:53-56 */
  constructor(hgi: Hgi, reprName: string) {
    super(hgi)
    this._init(new HdReprSelector(reprName))
  }

  protected override _newSceneDelegate(renderIndex: HdRenderIndex): Hdx_UnitTestDelegate {
    return new Hdx_UnitTestDelegate(renderIndex)
  }

  /** testHdxIdRender.cpp:58-77 */
  protected override _init(reprSelector: HdReprSelector): void {
    this._setupSceneDelegate()

    const delegate = this.getDelegate()

    // prepare render task
    const renderSetupTask = '/renderSetupTask'
    const renderTask = '/renderTask'
    delegate.addRenderSetupTask(renderSetupTask)
    delegate.addRenderTask(renderTask)

    // render task parameters.
    const param = delegate.getTaskParam(
      renderSetupTask, HdTokens.params).Get<HdxRenderTaskParams>().Clone()
    param.enableLighting = true // use default lighting
    delegate.setTaskParam(renderSetupTask, HdTokens.params,
      VtValue.create(param, HdxRenderTaskParamsType))
    delegate.setTaskParam(renderTask, HdTokens.collection,
      VtValue.create(new HdRprimCollection(HdTokens.geometry, reprSelector), _HdRprimCollectionType))
  }

  /** testHdxIdRender.cpp:79-96 */
  draw(viewport: GfVec4d, pickParam: PickParam | null): void {
    const delegate = this.getDelegate()

    const tasks: HdTask[] = []
    const renderSetupTask = '/renderSetupTask'
    const renderTask = '/renderTask'
    tasks.push(delegate.getRenderIndex().getTask(renderSetupTask)!)
    tasks.push(delegate.getRenderIndex().getTask(renderTask)!)

    const param = delegate.getTaskParam(
      renderSetupTask, HdTokens.params).Get<HdxRenderTaskParams>().Clone()
    param.viewport = viewport
    param.aovBindings = pickParam ? this._pickableAovBindings : this._aovBindings
    delegate.setTaskParam(renderSetupTask, HdTokens.params,
      VtValue.create(param, HdxRenderTaskParamsType))

    this._getEngine().Execute(delegate.getRenderIndex(), tasks)
  }

  /** testHdxIdRender.cpp:104-139 */
  setupPickableAovs(width: number, height: number): void {
    if (this._pickableAovBindings.length === 0) {
      // Delete old render buffers.
      for (const id of this._pickableAovBufferIds) {
        this.getDelegate().getRenderIndex().removeBprim(HdPrimTypeTokens.renderBuffer, id)
      }

      this._pickableAovBufferIds = []
      this._pickableAovBindings = []

      const dimensions: [number, number, number] = [width, height, 1]

      // Create aov bindings and render buffers.
      for (const aovName of _pickableAovOutputs) {
        const aovId = this._getAovPath(aovName)

        this._pickableAovBufferIds.push(aovId)

        const aovDesc = this._getRenderDelegate().getDefaultAovDescriptor(aovName)

        const desc = new HdRenderBufferDescriptor([...dimensions], aovDesc.format,
          /*multiSampled*/false)
        this.getDelegate().addRenderBuffer(aovId, desc)

        const binding = new HdRenderPassAovBinding()
        binding.aovName = aovName
        binding.aovSettings = aovDesc.aovSettings
        binding.renderBufferId = aovId
        binding.renderBuffer = this.getDelegate().getRenderIndex().getBprim(
          HdPrimTypeTokens.renderBuffer, aovId)
        binding.clearValue = VtValue.create(new GfVec4f(1, 1, 1, 1), VtValueTypes.GfVec4f)
        this._pickableAovBindings.push(binding)
      }
    }
  }

  /** testHdxIdRender.cpp:141-155 */
  private _findAovBuffer(aovName: string) {
    const binding = this._pickableAovBindings.find(b => b.aovName === aovName)

    if (!TF_VERIFY(binding !== undefined)) {
      return null
    }

    return binding!.renderBuffer as { getResource(ms: boolean): HgiTextureHandle | undefined }
  }

  /** testHdxIdRender.cpp:157-175 (see the header). */
  async readAovBuffer(aovName: string): Promise<Uint8Array> {
    const renderBuffer = this._findAovBuffer(aovName)

    const texture = renderBuffer?.getResource(false)
    if (texture && texture.isSet()) {
      return HdStTextureUtils.hgiTextureReadback(this.getHgi(), texture)
    }

    return new Uint8Array(0)
  }

  /** testHdxIdRender.cpp:177-190 */
  updatePickableAovDimensions(width: number, height: number): void {
    const dimensions: [number, number, number] = [width, height, 1]

    for (const id of this._pickableAovBufferIds) {
      const desc = this.getDelegate().getRenderBufferDescriptor(id).Clone()
      if (desc.dimensions.some((d, i) => d !== dimensions[i])) {
        desc.dimensions = dimensions
        this.getDelegate().updateRenderBuffer(id, desc)
      }
    }
  }
}

/** testHdxIdRender.cpp:98-102 */
const _pickableAovOutputs = [
  HdAovTokens.primId,
  HdAovTokens.instanceId,
  HdAovTokens.depth,
]

/** testHdxIdRender.cpp:236-242 */
function _GetTranslate(tx: number, ty: number, tz: number): GfMatrix4d {
  const m = new GfMatrix4d(1.0)
  m.setRow(3, new GfVec4d(tx, ty, tz, 1.0))
  return m
}

/** testHdxIdRender.cpp:194-232 */
class My_TestGLDrawing extends HdSt_UnitTestGLDrawing {
  private _driver: Hdx_TestDriver | null = null
  private _reprName: string = HdReprTokens.hull
  private _refineLevel = 0

  constructor(private readonly _hgi: Hgi) {
    super()
    this.setCameraRotate(0, 0)
    this.setCameraTranslate(new GfVec3f(0, 0, 0))
  }

  /** testHdxIdRender.cpp:244-358 */
  initTest(): void {
    this._driver = new Hdx_TestDriver(this._hgi, this._reprName)

    const delegate = this._driver.getDelegate()

    delegate.setRefineLevel(this._refineLevel)

    // prepare scene
    // To ensure that the non-aggregated element index returned via picking,
    // we need to have at least two cubes with uniform colors.
    const red = new GfVec4f(1, 0, 0, 1), green = new GfVec4f(0, 1, 0, 1), blue = new GfVec4f(0, 0, 1, 1),
      yellow = new GfVec4f(1, 1, 0, 1), magenta = new GfVec4f(1, 0, 1, 1), cyan = new GfVec4f(0, 1, 1, 1),
      white = new GfVec4f(1, 1, 1, 1), black = new GfVec4f(0, 0, 0, 1)

    const faceColors = [red, green, blue, yellow, magenta, cyan]
    const faceColor = VtValue.createArray(new VtArray<GfVec4f>(faceColors, VtValueTypes.GfVec4f))

    const vertColors = [white, blue, green, yellow, black, blue, magenta, red]
    const vertColor = VtValue.createArray(new VtArray<GfVec4f>(vertColors, VtValueTypes.GfVec4f))

    delegate.addCube('/cube0', _GetTranslate(5, 0, 5),
      /*guide=*/false, /*instancerId=*/'',
      /*scheme=*/PxOsdOpenSubdivTokens.catmullClark,
      /*color=*/faceColor,
      /*colorInterpolation=*/HdInterpolation.HdInterpolationUniform)
    delegate.addCube('/cube1', _GetTranslate(-5, 0, 5),
      /*guide=*/false, /*instancerId=*/'',
      /*scheme=*/PxOsdOpenSubdivTokens.catmullClark,
      /*color=*/faceColor,
      /*colorInterpolation=*/HdInterpolation.HdInterpolationUniform)
    delegate.addCube('/cube2', _GetTranslate(-5, 0, -5))
    delegate.addCube('/cube3', _GetTranslate(5, 0, -5),
      /*guide=*/false, /*instancerId=*/'',
      /*scheme=*/PxOsdOpenSubdivTokens.catmullClark,
      /*color=*/vertColor,
      /*colorInterpolation=*/HdInterpolation.HdInterpolationVertex)

    for (const [instancer, proto, z] of [['/instancerTop', '/protoTop', 2], ['/instancerBottom', '/protoBottom', -2]] as const) {
      delegate.addInstancer(instancer)
      delegate.addCube(proto, new GfMatrix4d(1), false, instancer)

      const scale = [new GfVec3f(1, 1, 1), new GfVec3f(1, 1, 1), new GfVec3f(1, 1, 1)]
      const rotate = [new GfVec4f(0, 0, 0, 0), new GfVec4f(0, 0, 0, 0), new GfVec4f(0, 0, 0, 0)]
      const translate = [new GfVec3f(3, 0, z), new GfVec3f(0, 0, z), new GfVec3f(-3, 0, z)]
      const prototypeIndex = [0, 0, 0]

      delegate.setInstancerProperties(instancer, prototypeIndex, scale, rotate, translate)
    }

    this.setCameraTranslate(new GfVec3f(0, 0, -20))

    this._driver.setClearColor(new GfVec4f(0.1, 0.1, 0.1, 1.0))
    this._driver.setClearDepth(1.0)
    this._driver.setupAovs(this.getWidth(), this.getHeight())
    this._driver.setupPickableAovs(this.getWidth(), this.getHeight())
  }

  /** testHdxIdRender.cpp:360-364 */
  drawTest(): void {
    this.drawScene()
  }

  /** testHdxIdRender.cpp:366-386 */
  async offscreenTest(): Promise<void> {
    let r = await this.pickScene(175, 90)
    TF_VERIFY(r.primId === '/cube1' && r.instanceIndex === 0,
      `pick(175, 90): ${r.primId} ${r.instanceIndex}`)

    r = await this.pickScene(470, 90)
    TF_VERIFY(r.primId === '/cube0' && r.instanceIndex === 0,
      `pick(470, 90): ${r.primId} ${r.instanceIndex}`)

    r = await this.pickScene(470, 364)
    TF_VERIFY(r.primId === '/cube3' && r.instanceIndex === 0,
      `pick(470, 364): ${r.primId} ${r.instanceIndex}`)

    r = await this.pickScene(250, 190)
    TF_VERIFY(r.primId === '/protoTop' && r.instanceIndex === 2,
      `pick(250, 190): ${r.primId} ${r.instanceIndex}`)

    r = await this.pickScene(320, 290)
    TF_VERIFY(r.primId === '/protoBottom' && r.instanceIndex === 1,
      `pick(320, 290): ${r.primId} ${r.instanceIndex}`)
  }

  /** testHdxIdRender.cpp:388-411 */
  drawScene(pickParam: PickParam | null = null): void {
    const width = this.getWidth(), height = this.getHeight()

    const viewMatrix = this.getViewMatrix()

    let frustum = this.getFrustum()
    let viewport = new GfVec4d(0, 0, width, height)

    if (pickParam) {
      frustum = frustum.computeNarrowedFrustum(
        new GfVec2d((2.0 * pickParam.location.get(0)) / width - 1.0,
          (2.0 * (height - pickParam.location.get(1))) / height - 1.0),
        new GfVec2d(1.0 / width, 1.0 / height))
      viewport = pickParam.viewport
    }

    const projMatrix = frustum.computeProjectionMatrix()
    this._driver!.getDelegate().setCamera(viewMatrix, projMatrix)

    this._driver!.updateAovDimensions(width, height)
    this._driver!.updatePickableAovDimensions(width, height)

    this._driver!.draw(viewport, pickParam)
  }

  /** testHdxIdRender.cpp:413-456 (see the header). */
  async pickScene(pickX: number, pickY: number): Promise<{ primId: string, instanceIndex: number }> {
    const width = 128
    const height = 128

    const pickParam: PickParam = {
      location: new GfVec2d(pickX, pickY),
      viewport: new GfVec4d(0, 0, width, height),
    }

    this.drawScene(pickParam)

    const primId = await this._driver!.readAovBuffer(HdAovTokens.primId)
    const instanceId = await this._driver!.readAovBuffer(HdAovTokens.instanceId)
    const depthBytes = await this._driver!.readAovBuffer(HdAovTokens.depth)
    const depths = new Float32Array(depthBytes.buffer, depthBytes.byteOffset, depthBytes.byteLength >> 2)

    let zMin = 1.0
    let zMinIndex = -1
    for (let y = 0, i = 0; y < height; y++) {
      for (let x = 0; x < width; x++, i++) {
        if (depths[i]! < zMin) {
          zMin = depths[i]!
          zMinIndex = i
        }
      }
    }

    const didHit = zMin < 1.0

    let result = ''
    let instanceIndex = -1
    if (didHit) {
      const idIndex = zMinIndex * 4

      result = this._driver!.getDelegate().getRenderIndex().getRprimPathFromPrimId(
        HdxPickTask.decodeIDRenderColor(primId, idIndex))
      instanceIndex = HdxPickTask.decodeIDRenderColor(instanceId, idIndex)
    }

    return { primId: result, instanceIndex }
  }

  /** testHdxIdRender.cpp:475-486 */
  override parseArgs(argv: readonly string[]): void {
    for (let i = 0; i < argv.length; ++i) {
      const arg = argv[i]
      if (arg === '--repr') {
        this._reprName = TfToken(argv[++i]!)
      } else if (arg === '--refineLevel') {
        this._refineLevel = parseInt(argv[++i]!, 10)
      }
    }
  }
}

/** testHdxIdRender.cpp:488-509 */
export async function main(hgi: Hgi, argv: readonly string[] = ['--offscreen']): Promise<{ status: number, stdout: string }> {
  const mark = new TfErrorMark()

  // BasicTest: HdSt_UnitTestGLDrawing::RunTest (offscreen).
  const driver = new My_TestGLDrawing(hgi)
  driver.parseArgs(argv)
  driver.initTest()
  await driver.offscreenTest()

  if (mark.isClean()) {
    return { status: 0, stdout: 'OK\n' }
  } else {
    return { status: 1, stdout: 'FAILED\n' }
  }
}

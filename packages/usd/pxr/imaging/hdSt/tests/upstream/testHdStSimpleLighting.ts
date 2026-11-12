// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/testenv/testHdStShaders.cpp,
//  pxr/imaging/hdSt/unitTestGLDrawing.cpp, pxr/imaging/hdx/renderSetupTask.cpp
// Copyright 2016, 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Storm's simple lighting end to end, as the native capture
// tests/fixtures/simpleLighting/testHdStSimpleLighting.cpp runs it: HdStLight
// sprims (a distant light, a sphere light and a simple light) supplied by a
// small scene delegate, gathered by HdxSimpleLightTask into
// HdStSimpleLightingShader's uniform blocks, and testHdStShaders' grids and
// cube (pxr/imaging/hdSt/testenv/testHdStShaders.cpp:255-273, 465-475) drawn
// by HdSt_TestDriver (repr hull, cull style Nothing) with Storm's fallback
// material. The camera is HdSt_UnitTestGLDrawing's
// (hdSt/unitTestGLDrawing.cpp:275-305), rotate (60, 0), translate (0, 0, -10).
//
// The scene delegate, the setup task (which hands the lighting shader to the
// render pass state as HdxRenderSetupTask does, hdx/renderSetupTask.cpp:
// 262-276) and the double execution per image are test scaffolding shared
// with the native capture; see testHdStSimpleLighting.cpp.
//
// Divergences: the driver is given its Hgi (see unitTestHelper.ts), and
// WriteToFile is ReadBackAov. Hgi submission is asynchronous, so
// OffscreenTest is async.

import {
  Frustum as GfFrustum,
  Matrix4d as GfMatrix4d,
  Matrix4f as GfMatrix4f,
  Rect2i as GfRect2i,
  Vec2i as GfVec2i,
  Vec3d as GfVec3d,
  Vec3f as GfVec3f,
  Vec4f as GfVec4f,
  makeRotation as GfMakeRotation,
} from 'typescript-usd/gf'
import type { Token as TfToken } from 'typescript-usd/tf'
import { Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import {
  CullStyle as HdCullStyle,
  Engine as HdEngine,
  Light as HdLight,
  LightTokens as HdLightTokens,
  PrimTypeTokens as HdPrimTypeTokens,
  RenderTagTokens as HdRenderTagTokens,
  ReprTokens as HdReprTokens,
  SceneDelegate as HdSceneDelegate,
  Task as HdTask,
  Tokens as HdTokens,
  type RenderIndex as HdRenderIndex,
  type TaskContext as HdTaskContext,
} from 'typescript-usd/hd'
import { Framing as CameraUtilFraming } from 'typescript-usd/cameraUtil'
import type { Hgi } from 'typescript-usd/hgi'
import { SimpleLight as GlfSimpleLight, SimpleLightType as GlfSimpleLightType } from 'typescript-usd/glf'
import {
  HdxLightingTokens,
  HdxSimpleLightTask,
  HdxSimpleLightTaskParams,
  HdxSimpleLightTaskParamsType,
} from '../../../hdx/src/simpleLightTask.ts'
import type { HdStLightingShader } from '../../src/lightingShader.ts'
import type { HdStRenderPassState } from '../../src/renderPassState.ts'
import { HdSt_DrawTask, HdSt_TestDriver, type HdStTestAovReadback } from '../../src/unitTestHelper.ts'

export const SIMPLE_LIGHTING_IMAGES = [
  'simpleLighting_0', 'simpleLighting_1', 'simpleLighting_2',
] as const

const W = 640, H = 480
const f = (x: number) => VtValue.create(Math.fround(x), VtValueTypes.float)
const v3 = (x: number, y: number, z: number) =>
  VtValue.create(new GfVec3f(x, y, z), VtValueTypes.GfVec3f)

/** The lights and the light task's params (testHdStSimpleLighting.cpp,
 *  LightDelegate). */
class LightDelegate extends HdSceneDelegate {
  readonly params = new Map<string, Map<string, VtValue>>()
  readonly transforms = new Map<string, GfMatrix4d>()

  Set(id: string, key: TfToken | string, value: VtValue): void {
    let p = this.params.get(id)
    if (!p) this.params.set(id, p = new Map())
    p.set(key, value)
  }
  override Get(id: string, key: TfToken | string): VtValue {
    return this.params.get(id)?.get(key) ?? VtValue.getEmpty()
  }
  override getLightParamValue(id: string, paramName: TfToken | string): VtValue {
    return this.Get(id, paramName)
  }
  override getTransform(id: string): GfMatrix4d {
    return this.transforms.get(id) ?? new GfMatrix4d(1)
  }
  override getVisible(_id: string): boolean { return true }
}

/** Hands the lighting shader to the render pass state
 *  (hdx/renderSetupTask.cpp:262-276). */
class LightingSetupTask extends HdTask {
  constructor(private readonly _state: HdStRenderPassState) { super('') }
  sync(): void {}
  Prepare(ctx: HdTaskContext, _renderIndex: HdRenderIndex): void {
    const lightingShader = ctx.get(HdxLightingTokens.lightingShader) as HdStLightingShader | undefined
    if (lightingShader) {
      this._state.setLightingShader(lightingShader)
    }
  }
  Execute(): void {}
}

/** testHdStSimpleLighting.cpp:46-58 */
function _GetViewMatrix(): GfMatrix4d {
  let viewMatrix = new GfMatrix4d().setIdentity()
  viewMatrix = viewMatrix.getMultiply(new GfMatrix4d().setRotate(GfMakeRotation([1, 0, 0], -90)))
  viewMatrix = viewMatrix.getMultiply(new GfMatrix4d().setRotate(GfMakeRotation([0, 1, 0], 0.0)))
  viewMatrix = viewMatrix.getMultiply(new GfMatrix4d().setRotate(GfMakeRotation([1, 0, 0], 60.0)))
  viewMatrix = viewMatrix.getMultiply(new GfMatrix4d().setTranslate(new GfVec3d(0, 0, -10.0)))
  return viewMatrix
}

/** testHdStSimpleLighting.cpp:60-67 */
function _GetProjectionMatrix(): GfMatrix4d {
  const frustum = new GfFrustum()
  frustum.setPerspective(45.0, W / H, 1, 100000.0)
  return frustum.computeProjectionMatrix()
}

export class My_SimpleLightingTest {
  private _driver: HdSt_TestDriver | null = null
  private _lights: LightDelegate | null = null
  private _tasks: HdTask[] = []
  private readonly _engine = new HdEngine()
  private _simple = new GlfSimpleLight()

  constructor(private readonly _hgi: Hgi) {}

  /** testHdStSimpleLighting.cpp:120-205 */
  initTest(): void {
    const driver = this._driver = new HdSt_TestDriver(this._hgi, HdReprTokens.hull)
    const delegate = driver.getDelegate()
    const index = delegate.getRenderIndex()

    const dmat = new GfMatrix4d(1)
    dmat.setTranslate(new GfVec3d(-4.5, 0.0, 0.0))
    delegate.addGrid('/grid1', 10, 10, new GfMatrix4f(dmat))
    dmat.setTranslate(new GfVec3d(-1.5, 0.0, 0.0))
    delegate.addGridWithFaceColor('/grid2', 10, 10, new GfMatrix4f(dmat))
    dmat.setTranslate(new GfVec3d(1.5, 0.0, 0.0))
    delegate.addGridWithVertexColor('/grid3', 10, 10, new GfMatrix4f(dmat))
    dmat.setTranslate(new GfVec3d(4.5, 0.0, 0.0))
    delegate.addGridWithFaceVaryingColor('/grid4', 3, 3, new GfMatrix4f(dmat))
    const cmat = new GfMatrix4d(1)
    cmat.setTranslate(new GfVec3d(0.0, 3.0, 0.0))
    delegate.addCube('/cube1', new GfMatrix4f(cmat))

    const lights = this._lights = new LightDelegate(index, '/lights')

    // A distant light tilted toward +x, warm.
    const key = '/lights/key'
    lights.transforms.set(key,
      new GfMatrix4d().setRotate(GfMakeRotation([0, 1, 0], 30.0)).getMultiply(
        new GfMatrix4d().setRotate(GfMakeRotation([1, 0, 0], -20.0))))
    lights.Set(key, HdLightTokens.color, v3(1.0, 0.9, 0.7))
    lights.Set(key, HdLightTokens.intensity, f(1.0))
    lights.Set(key, HdLightTokens.exposure, f(0.0))
    lights.Set(key, HdLightTokens.normalize, VtValue.create(true, VtValueTypes.bool))
    index.insertSprim(HdPrimTypeTokens.distantLight, lights, key)

    // A sphere light above the cube, blue, colour temperature enabled.
    const fill = '/lights/fill'
    lights.transforms.set(fill, new GfMatrix4d().setTranslate(new GfVec3d(-2.0, 2.0, 2.0)))
    lights.Set(fill, HdLightTokens.color, v3(0.4, 0.6, 1.0))
    lights.Set(fill, HdLightTokens.intensity, f(3.0))
    lights.Set(fill, HdLightTokens.exposure, f(1.0))
    lights.Set(fill, HdLightTokens.radius, f(0.5))
    lights.Set(fill, HdLightTokens.enableColorTemperature, VtValue.create(true, VtValueTypes.bool))
    lights.Set(fill, HdLightTokens.colorTemperature, f(5000.0))
    index.insertSprim(HdPrimTypeTokens.sphereLight, lights, fill)

    // A simple (GlfSimpleLight) spot light.
    const spot = '/lights/spot'
    const simple = this._simple
    simple.setPosition(new GfVec4f(3.0, 2.0, 3.0, 1.0))
    simple.setDiffuse(new GfVec4f(0.3, 0.25, 0.2, 1.0))
    simple.setSpecular(new GfVec4f(0.2, 0.2, 0.2, 1.0))
    simple.setSpotDirection(new GfVec3f(-0.5, -0.4, -0.7))
    simple.setSpotCutoff(40.0)
    simple.setSpotFalloff(2.0)
    lights.Set(spot, HdLightTokens.params, VtValue.create(simple, GlfSimpleLightType))
    index.insertSprim(HdPrimTypeTokens.simpleLight, lights, spot)

    // The light task.
    const taskId = '/lights/simpleLightTask'
    const taskParams = new HdxSimpleLightTaskParams()
    taskParams.cameraPath = '/testCam'
    taskParams.sceneAmbient = new GfVec4f(0.05, 0.05, 0.05, 1.0)
    lights.Set(taskId, HdTokens.params, VtValue.create(taskParams, HdxSimpleLightTaskParamsType))
    index.insertTask(lights, taskId, HdxSimpleLightTask)

    driver.setClearColor(new GfVec4f(0.1, 0.1, 0.1, 1.0))
    driver.setClearDepth(1.0)
    driver.setupAovs(W, H)

    this._tasks = [
      index.getTask(taskId)!,
      new LightingSetupTask(driver.getRenderPassState()),
      new HdSt_DrawTask(driver.getRenderPass(), driver.getRenderPassState(),
        [HdRenderTagTokens.geometry]),
    ]
  }

  /** testHdStSimpleLighting.cpp:221-231 (draw, less WriteToFile) */
  drawTest(): void {
    const driver = this._driver!
    driver.setCullStyle(HdCullStyle.HdCullStyleNothing)
    driver.setCamera(_GetViewMatrix(), _GetProjectionMatrix(),
      new CameraUtilFraming(new GfRect2i(new GfVec2i(0, 0), W, H)))
    driver.updateAovDimensions(W, H)
    const index = driver.getDelegate().getRenderIndex()
    this._engine.Execute(index, this._tasks)
    this._engine.Execute(index, this._tasks)
  }

  /** testHdStSimpleLighting.cpp:235-243: change the distant light's colour
   *  and the spot light's position. */
  changeLights(): void {
    const lights = this._lights!
    const tracker = this._driver!.getDelegate().getRenderIndex().getChangeTracker()
    lights.Set('/lights/key', HdLightTokens.color, v3(0.6, 0.8, 1.0))
    tracker.markSprimDirty('/lights/key', HdLight.DirtyParams)
    const simple = this._simple
    simple.setPosition(new GfVec4f(-3.0, 2.0, 3.0, 1.0))
    simple.setSpotDirection(new GfVec3f(0.5, -0.4, -0.7))
    lights.Set('/lights/spot', HdLightTokens.params, VtValue.create(simple, GlfSimpleLightType))
    tracker.markSprimDirty('/lights/spot', HdLight.DirtyParams)
  }

  /** testHdStSimpleLighting.cpp:245-247: remove the sphere light. */
  removeFill(): void {
    this._driver!.getDelegate().getRenderIndex().removeSprim(HdPrimTypeTokens.sphereLight, '/lights/fill')
  }

  static readonly STEPS: ReadonlyArray<(t: My_SimpleLightingTest) => void> = [
    () => {},
    t => t.changeLights(),
    t => t.removeFill(),
  ]

  async offscreenTest(): Promise<Record<string, HdStTestAovReadback | null>> {
    const images: Record<string, HdStTestAovReadback | null> = {}
    for (let i = 0; i < My_SimpleLightingTest.STEPS.length; i++) {
      My_SimpleLightingTest.STEPS[i]!(this)
      this.drawTest()
      images[SIMPLE_LIGHTING_IMAGES[i]!] = await this._driver!.readBackAov('color')
    }
    return images
  }

  getDriver(): HdSt_TestDriver | null { return this._driver }
}

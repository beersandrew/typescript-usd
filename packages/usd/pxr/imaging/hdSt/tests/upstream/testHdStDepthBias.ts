// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/testenv/testHdStDepthBias.cpp,
//  pxr/imaging/hdSt/unitTestGLDrawing.cpp
// Copyright 2016, 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/testenv/testHdStDepthBias.cpp (OpenUSD
// 26.11.1), with the HdSt_UnitTestGLDrawing camera it inherits
// (hdSt/unitTestGLDrawing.cpp:150-305): a 640x480 offscreen run.
//
// This test draws two almost identical cubes with identical transforms, in
// two different passes. The only difference is that the first cube is white,
// while the second is black. Since both cubes have exactly the same
// vertices, and HdCmpFuncLess is used for depth, the black cube should be
// completely behind the white cube (not even z-fighting). But if we give it
// even the smallest amount of depth bias forward, it should instead
// completely replace the white cube.
//
// Divergences: the driver is given its Hgi (see unitTestHelper.ts), and
// WriteToFile is ReadBackAov (the caller writes or compares the texels).
// Hgi submission is asynchronous, so OffscreenTest is async.

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
import { Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import {
  CompareFunction as HdCompareFunction,
  CullStyle as HdCullStyle,
  RenderTagTokens as HdRenderTagTokens,
  ReprSelector as HdReprSelector,
  ReprTokens as HdReprTokens,
  RprimCollection as HdRprimCollection,
  Tokens as HdTokens,
  type Task as HdTask,
} from 'typescript-usd/hd'
import { Framing as CameraUtilFraming } from 'typescript-usd/cameraUtil'
import type { Hgi } from 'typescript-usd/hgi'
import { OpenSubdivTokens as PxOsdOpenSubdivTokens } from 'typescript-usd/pxOsd'
import { HdSt_RenderPass } from '../../src/renderPass.ts'
import type { HdStRenderPassState } from '../../src/renderPassState.ts'
import { HdSt_DrawTask, HdSt_TestDriverBase, type HdStTestAovReadback } from '../../src/unitTestHelper.ts'

/** testHdStDepthBias.cpp:33-90 */
export class HdSt_MyTestDriver extends HdSt_TestDriverBase {
  constructor(hgi: Hgi) {
    super(hgi)
    this._renderPassStates = [
      this._getRenderDelegate().createRenderPassState(),
      this._getRenderDelegate().createRenderPassState(),
    ]

    this._renderPassStates[0]!.setDepthFunc(HdCompareFunction.HdCmpFuncLess)
    this._renderPassStates[0]!.setCullStyle(HdCullStyle.HdCullStyleNothing)
    this._renderPassStates[0]!.setDepthBiasUseDefault(false)

    this._renderPassStates[1]!.setDepthFunc(HdCompareFunction.HdCmpFuncLess)
    this._renderPassStates[1]!.setCullStyle(HdCullStyle.HdCullStyleNothing)
    this._renderPassStates[1]!.setDepthBiasUseDefault(false)
    this._renderPassStates[1]!.setDepthBias(-1, 0)

    this._init()

    // HdRprimCollection(name, reprSelector, rootPath) (hd/rprimCollection.h);
    // the TS constructor takes the root path through SetRootPath.
    const collections = ['/white', '/black'].map(rootPath => {
      const collection = new HdRprimCollection(HdTokens.geometry,
        new HdReprSelector(HdReprTokens.smoothHull))
      collection.setRootPath(rootPath)
      return collection
    })

    for (const collection of collections) {
      this._renderPasses.push(new HdSt_RenderPass(
        this.getDelegate().getRenderIndex(), collection))
    }
  }

  /** testHdStDepthBias.cpp:64-88 */
  draw(enableDepthBias: boolean): void {
    // The unit test AOV setup sets a clear value, which we need to remove
    // so we can do a second pass on the same contents.
    const aovs = this._renderPassStates[1]!.getAovBindings().map(aov => {
      const copy = Object.assign(Object.create(Object.getPrototypeOf(aov)), aov)
      copy.clearValue = undefined
      return copy
    })
    this._renderPassStates[1]!.setAovBindings(aovs)

    this._renderPassStates[1]!.setDepthBiasEnabled(enableDepthBias)

    const tasks: HdTask[] = []
    for (let i = 0; i < this._renderPassStates.length; i++) {
      tasks.push(new HdSt_DrawTask(this._renderPasses[i]!,
        this._renderPassStates[i]!, [HdRenderTagTokens.geometry]))
    }
    this._getEngine().Execute(this.getDelegate().getRenderIndex(), tasks)
  }

  /** The render pass states (for tests). */
  _getRenderPassStates(): readonly HdStRenderPassState[] {
    return this._renderPassStates
  }
}

/** testHdStDepthBias.cpp:92-118 and hdSt/unitTestGLDrawing.{h,cpp}: the
 *  offscreen GL drawing harness and its camera. */
export class My_TestGLDrawing {
  private _rotate: [number, number] = [0, 0]
  private _translate = new GfVec3f(0, 0, 0)
  private _driver: HdSt_MyTestDriver | null = null

  /** testHdStDepthBias.cpp:95-99 */
  constructor(private readonly _hgi: Hgi,
    private readonly _width = 640, private readonly _height = 480) {
    this.setCameraRotate(60.0, 0.0)
    this.setCameraTranslate(new GfVec3f(0, 0, -20.0))
  }

  /** unitTestGLDrawing.h:69-74 */
  setCameraRotate(rx: number, ry: number): void { this._rotate = [rx, ry] }
  setCameraTranslate(t: GfVec3f): void { this._translate = t }

  /** unitTestGLDrawing.cpp:166-176 (640x480 window, unitTestGLDrawing.cpp:193) */
  getWidth(): number { return this._width }
  getHeight(): number { return this._height }

  /** unitTestGLDrawing.cpp:275-288 */
  getViewMatrix(): GfMatrix4d {
    let viewMatrix = new GfMatrix4d().setIdentity()
    // rotate from z-up to y-up
    viewMatrix = viewMatrix.getMultiply(new GfMatrix4d().setRotate(GfMakeRotation([1.0, 0.0, 0.0], -90.0)))
    viewMatrix = viewMatrix.getMultiply(new GfMatrix4d().setRotate(GfMakeRotation([0, 1, 0], this._rotate[1])))
    viewMatrix = viewMatrix.getMultiply(new GfMatrix4d().setRotate(GfMakeRotation([1, 0, 0], this._rotate[0])))
    viewMatrix = viewMatrix.getMultiply(new GfMatrix4d().setTranslate(new GfVec3d(
      this._translate.get(0), this._translate.get(1), this._translate.get(2))))
    return viewMatrix
  }

  /** unitTestGLDrawing.cpp:290-305 */
  getProjectionMatrix(): GfMatrix4d {
    const aspectRatio = this.getWidth() / this.getHeight()
    const frustum = new GfFrustum()
    frustum.setPerspective(45.0, aspectRatio, 1, 100000.0)
    return frustum.computeProjectionMatrix()
  }

  /** testHdStDepthBias.cpp:122-147 */
  initTest(): void {
    this._driver = new HdSt_MyTestDriver(this._hgi)
    this._driver.setClearColor(new GfVec4f(0.1, 0.1, 0.1, 1.0))
    this._driver.setClearDepth(1.0)
    this._driver.setupAovs(this.getWidth(), this.getHeight())

    const cubeTransform = new GfMatrix4f(1.0).setScale(4.0).getMultiply(
      new GfMatrix4f(1.0).setRotate(GfMakeRotation([0, 0, 1], 45)))

    const delegate = this._driver.getDelegate()
    const whiteCube = '/white/cube'
    delegate.addCube(whiteCube, cubeTransform, false, '', PxOsdOpenSubdivTokens.none)
    delegate.updatePrimvarValue(whiteCube, HdTokens.displayColor,
      VtValue.create(new GfVec3f(1, 1, 1), VtValueTypes.GfVec3f))

    const blackCube = '/black/cube'
    delegate.addCube(blackCube, cubeTransform, false, '', PxOsdOpenSubdivTokens.none)
    delegate.updatePrimvarValue(blackCube, HdTokens.displayColor,
      VtValue.create(new GfVec3f(0, 0, 0), VtValueTypes.GfVec3f))
  }

  /** testHdStDepthBias.cpp:149-161 */
  private _draw(enableDepthBias = false): void {
    const width = this.getWidth()
    const height = this.getHeight()
    const viewMatrix = this.getViewMatrix()
    const projMatrix = this.getProjectionMatrix()

    this._driver!.setCamera(viewMatrix, projMatrix,
      new CameraUtilFraming(new GfRect2i(new GfVec2i(0, 0), width, height)))

    this._driver!.updateAovDimensions(width, height)

    this._driver!.draw(enableDepthBias)
  }

  /** testHdStDepthBias.cpp:169-177. Returns the two color AOV readbacks
   *  upstream writes as testHdStDepthBias_disabled.png / _enabled.png. */
  async offscreenTest(): Promise<{ disabled: HdStTestAovReadback | null, enabled: HdStTestAovReadback | null }> {
    this._draw(/*enableDepthBias=*/false)
    const disabled = await this._driver!.readBackAov('color')

    this._draw(/*enableDepthBias=*/true)
    const enabled = await this._driver!.readBackAov('color')

    return { disabled, enabled }
  }

  /** The driver (for tests). */
  getDriver(): HdSt_MyTestDriver | null { return this._driver }
}


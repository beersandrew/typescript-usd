// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdSt/testenv/testHdStBasicDrawing.cpp,
//  pxr/imaging/hdSt/testenv/testHdStShaders.cpp
// Copyright 2016, 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// testHdStShaders (pxr/imaging/hdSt/testenv/testHdStShaders.cpp, OpenUSD
// 26.11.1) with its scene materials left out, as the native capture
// tests/fixtures/shadersLighting/testHdStShadersLighting.cpp runs it: the
// same HdSt_TestDriver (repr hull, cull style Nothing), grids, cube, camera
// and lighting shaders (two HdSt_TestLightingShader set-ups,
// HdSt_FallbackLightingShader, and the default HdSt_TestLightingShader of
// testHdStBasicDrawing --lighting), drawn with Storm's fallback material,
// whose surface shader calls the lighting shader's FallbackLighting.
//
// The scene materials are left out because they are glslfx source nodes
// resolved through SdrRegistry::GetShaderNodeFromSourceCode and processed by
// HdStMaterialNetwork. They were left out before HdStMaterialNetwork was
// ported (2a66a556, which retired the hdst-material-network debt); this test
// has not been extended to them since.
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
import { CullStyle as HdCullStyle, ReprTokens as HdReprTokens } from 'typescript-usd/hd'
import { Framing as CameraUtilFraming } from 'typescript-usd/cameraUtil'
import type { Hgi } from 'typescript-usd/hgi'
import { HdSt_FallbackLightingShader } from '../../src/fallbackLightingShader.ts'
import type { HdStLightingShader } from '../../src/lightingShader.ts'
import {
  HdSt_TestDriver,
  HdSt_TestLightingShader,
  type HdStTestAovReadback,
} from '../../src/unitTestHelper.ts'

/** The images, in the order the native capture writes them. */
export const SHADERS_LIGHTING_IMAGES = [
  'shadersLighting_0', 'shadersLighting_1', 'shadersLighting_2',
  'shadersLighting_3', 'shadersLighting_4', 'shadersLighting_5',
  'shadersLighting_6',
] as const

/** testHdStShaders.cpp:26-66 and hdSt/unitTestGLDrawing.{h,cpp}: the
 *  offscreen drawing harness and its camera. */
export class My_TestGLDrawing {
  private _rotate: [number, number] = [0, 0]
  private _translate = new GfVec3f(0, 0, 0)
  private _driver: HdSt_TestDriver | null = null
  private readonly _reprName = HdReprTokens.hull
  private readonly _refineLevel = 0
  private readonly _cullStyle = HdCullStyle.HdCullStyleNothing
  private _lightingShaders: HdStLightingShader[] = []

  /** testHdStShaders.cpp:28-37 */
  constructor(private readonly _hgi: Hgi,
    private readonly _width = 640, private readonly _height = 480) {
    this.setCameraRotate(60.0, 0.0)
    this.setCameraTranslate(new GfVec3f(0, 0, -10.0))
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

  /** testHdStShaders.cpp:71-301, less the materials (see the header). */
  initTest(): void {
    this._driver = new HdSt_TestDriver(this._hgi, this._reprName)
    const delegate = this._driver.getDelegate()
    delegate.setRefineLevel(this._refineLevel)

    // grids (testHdStShaders.cpp:255-273)
    const dmat = new GfMatrix4d(1)
    dmat.setTranslate(new GfVec3d(-4.5, 0.0, 0.0))
    delegate.addGrid('/grid1', 10, 10, new GfMatrix4f(dmat))

    dmat.setTranslate(new GfVec3d(-1.5, 0.0, 0.0))
    delegate.addGridWithFaceColor('/grid2', 10, 10, new GfMatrix4f(dmat))

    dmat.setTranslate(new GfVec3d(1.5, 0.0, 0.0))
    delegate.addGridWithVertexColor('/grid3', 10, 10, new GfMatrix4f(dmat))

    dmat.setTranslate(new GfVec3d(4.5, 0.0, 0.0))
    delegate.addGridWithFaceVaryingColor('/grid4', 3, 3, new GfMatrix4f(dmat))

    // setup lights (testHdStShaders.cpp:275-299)
    const renderIndex = delegate.getRenderIndex()
    const lightingShader1 = new HdSt_TestLightingShader(renderIndex)
    const lightingShader2 = new HdSt_TestLightingShader(renderIndex)
    const fallbackShader = new HdSt_FallbackLightingShader()

    lightingShader1.setLight(0, new GfVec3f(1, 0, 1), new GfVec3f(1, 0.2, 0.2))
    lightingShader1.setSceneAmbient(new GfVec3f(0.01, 0.01, 0.01))
    lightingShader1.Prepare()

    lightingShader2.setLight(0, new GfVec3f(1, 0, 1), new GfVec3f(1, 0.2, 0.2))
    lightingShader2.setLight(1, new GfVec3f(0, 1, 1), new GfVec3f(0.2, 1, 0.2))
    lightingShader2.setSceneAmbient(new GfVec3f(0.01, 0.01, 0.01))
    lightingShader2.Prepare()

    // testHdStBasicDrawing.cpp:73-78: the default HdSt_TestLightingShader.
    const defaultShader = new HdSt_TestLightingShader(renderIndex)
    defaultShader.Prepare()

    this._lightingShaders = [lightingShader1, lightingShader2, fallbackShader, defaultShader]
    this._driver.getRenderPassState().setLightingShader(this._lightingShaders[0]!)

    this._driver.setClearColor(new GfVec4f(0.1, 0.1, 0.1, 1.0))
    this._driver.setClearDepth(1.0)
    this._driver.setupAovs(this.getWidth(), this.getHeight())
  }

  /** testHdStShaders.cpp:303-321 */
  drawTest(): void {
    const width = this.getWidth()
    const height = this.getHeight()
    const viewMatrix = this.getViewMatrix()
    const projMatrix = this.getProjectionMatrix()

    this._driver!.setCullStyle(this._cullStyle)

    this._driver!.setCamera(viewMatrix, projMatrix,
      new CameraUtilFraming(new GfRect2i(new GfVec2i(0, 0), width, height)))

    this._driver!.updateAovDimensions(width, height)

    this._driver!.draw()
  }

  /** Selects a lighting shader (testHdStShaders.cpp:411-417, toggleLight,
   *  by index). */
  setLight(index: number): void {
    this._driver!.getRenderPassState().setLightingShader(this._lightingShaders[index]!)
  }

  /** testHdStShaders.cpp:465-475 (addPrim), without the material binding. */
  addPrim(): void {
    const dmat = new GfMatrix4d(1)
    dmat.setTranslate(new GfVec3d(0.0, 3.0, 0.0))
    this._driver!.getDelegate().addCube('/cube1', new GfMatrix4f(dmat))
  }

  /** The sequence of draws, as testHdStShadersLighting.cpp runs it
   *  (testHdStShaders.cpp:323-338 for _0.._3). Each step selects the state;
   *  the caller draws and reads back. */
  static readonly STEPS: ReadonlyArray<(t: My_TestGLDrawing) => void> = [
    () => {},
    t => t.setLight(1),
    t => t.setLight(2),
    t => t.addPrim(),
    t => t.setLight(0),
    t => t.setLight(1),
    t => t.setLight(3),
  ]

  /** Draws every image and reads each back (WriteToFile in the native
   *  capture). */
  async offscreenTest(): Promise<Record<string, HdStTestAovReadback | null>> {
    const images: Record<string, HdStTestAovReadback | null> = {}
    for (let i = 0; i < My_TestGLDrawing.STEPS.length; i++) {
      My_TestGLDrawing.STEPS[i]!(this)
      this.drawTest()
      images[SHADERS_LIGHTING_IMAGES[i]!] = await this._driver!.readBackAov('color')
    }
    return images
  }

  /** The driver (for tests). */
  getDriver(): HdSt_TestDriver | null { return this._driver }
}

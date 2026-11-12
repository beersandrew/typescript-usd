// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdSt/testenv/testHdStBasicDrawing.cpp,
//  pxr/imaging/hdSt/unitTestGLDrawing.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/testenv/testHdStBasicDrawing.cpp (OpenUSD
// 26.11.1), with the HdSt_UnitTestGLDrawing camera it inherits
// (hdSt/unitTestGLDrawing.cpp:150-305): a 640x480 offscreen run of
// HdUnitTestDelegate's basic test set (grids, polygons, cubes with authored
// reprs, curves and points) in one repr, refine level and cull style.
//
// Divergences: the driver is given its Hgi (see unitTestHelper.ts);
// RunTest(argc, argv) is ParseArgs(argv) + InitTest() + OffscreenTest(), and
// WriteToFile is ReadBackAov (the caller writes or compares the texels),
// which is asynchronous because Hgi submission is.

import {
  Frustum as GfFrustum,
  Matrix4d as GfMatrix4d,
  Rect2i as GfRect2i,
  Vec2i as GfVec2i,
  Vec3d as GfVec3d,
  Vec3f as GfVec3f,
  Vec4d as GfVec4d,
  Vec4f as GfVec4f,
  makeRotation as GfMakeRotation,
} from 'typescript-usd/gf'
import { Token as TfToken } from 'typescript-usd/tf'
import { CullStyle as HdCullStyle, ReprTokens as HdReprTokens } from 'typescript-usd/hd'
import { Framing as CameraUtilFraming } from 'typescript-usd/cameraUtil'
import type { Hgi } from 'typescript-usd/hgi'
import { HdSt_TestDriver, HdSt_TestLightingShader, type HdStTestAovReadback } from '../../src/unitTestHelper.ts'

/** testHdStBasicDrawing.cpp:39-75 and hdSt/unitTestGLDrawing.{h,cpp}. */
export class My_TestGLDrawing {
  private _rotate: [number, number] = [0, 0]
  private _translate = new GfVec3f(0, 0, 0)
  private _driver: HdSt_TestDriver | null = null
  private _lightingShader: HdSt_TestLightingShader | null = null
  private _clipPlanes: GfVec4d[] = []

  private _reprName: TfToken = HdReprTokens.hull
  private _refineLevel = 0
  private _cullStyle: HdCullStyle = HdCullStyle.HdCullStyleNothing
  private _testLighting = false
  private _outputFilePath = ''

  /** testHdStBasicDrawing.cpp:41-50 */
  constructor(private readonly _hgi: Hgi,
    private readonly _width = 640, private readonly _height = 480) {
    this.setCameraRotate(60.0, 0.0)
    this.setCameraTranslate(new GfVec3f(0, 0, -20.0 - 1.7320508 * 2.0))
  }

  /** unitTestGLDrawing.h:69-74 */
  setCameraRotate(rx: number, ry: number): void { this._rotate = [rx, ry] }
  setCameraTranslate(t: GfVec3f): void { this._translate = t }
  getCameraTranslate(): GfVec3f { return this._translate }

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

  /** testHdStBasicDrawing.cpp:78-108 */
  initTest(): void {
    this._driver = new HdSt_TestDriver(this._hgi, this._reprName)
    const delegate = this._driver.getDelegate()
    delegate.setRefineLevel(this._refineLevel)

    delegate.populateInvalidPrimsSet()
    const center = delegate.populateBasicTestSet()

    // center camera
    const t = this.getCameraTranslate()
    this.setCameraTranslate(new GfVec3f(t.get(0) - center.get(0), t.get(1) - center.get(1), t.get(2) - center.get(2)))

    if (this._testLighting) {
      this._lightingShader = new HdSt_TestLightingShader(delegate.getRenderIndex())
      this._lightingShader.Prepare()
      this._driver.getRenderPassState().setLightingShader(this._lightingShader)
    }

    this._driver.setCameraClipPlanes(this._clipPlanes)

    this._driver.setClearColor(new GfVec4f(0.1, 0.1, 0.1, 1.0))
    this._driver.setClearDepth(1.0)
    this._driver.setupAovs(this.getWidth(), this.getHeight())
  }

  /** testHdStBasicDrawing.cpp:110-127 */
  drawTest(): void {
    const width = this.getWidth(), height = this.getHeight()
    const viewMatrix = this.getViewMatrix()
    const projMatrix = this.getProjectionMatrix()

    this._driver!.setCullStyle(this._cullStyle)

    this._driver!.setCamera(viewMatrix, projMatrix,
      new CameraUtilFraming(new GfRect2i(new GfVec2i(0, 0), width, height)))

    this._driver!.updateAovDimensions(width, height)

    this._driver!.draw()
  }

  /** testHdStBasicDrawing.cpp:129-137. Returns the color AOV readback
   *  upstream writes to the --write path (null without one). */
  async offscreenTest(): Promise<HdStTestAovReadback | null> {
    this.drawTest()
    if (this._outputFilePath) return this._driver!.readBackAov('color')
    return null
  }

  /** testHdStBasicDrawing.cpp:146-186 */
  parseArgs(argv: readonly string[]): void {
    for (let i = 0; i < argv.length; ++i) {
      const arg = argv[i]!
      if (arg === '--repr') {
        this._reprName = TfToken(argv[++i]!)
      } else if (arg === '--refineLevel') {
        this._refineLevel = parseInt(argv[++i]!, 10)
      } else if (arg === '--cullStyle') {
        const style = argv[++i]!
        if (style === 'Nothing') this._cullStyle = HdCullStyle.HdCullStyleNothing
        else if (style === 'Back') this._cullStyle = HdCullStyle.HdCullStyleBack
        else if (style === 'Front') this._cullStyle = HdCullStyle.HdCullStyleFront
        else if (style === 'BackUnlessDoubleSided') this._cullStyle = HdCullStyle.HdCullStyleBackUnlessDoubleSided
        else if (style === 'FrontUnlessDoubleSided') this._cullStyle = HdCullStyle.HdCullStyleFrontUnlessDoubleSided
        else throw new Error(`Error: Unknown cullstyle = ${style}`)
      } else if (arg === '--lighting') {
        this._testLighting = true
      } else if (arg === '--clipPlane' && i + 4 < argv.length) {
        const c = [Number(argv[++i]), Number(argv[++i]), Number(argv[++i]), Number(argv[++i])] as const
        this._clipPlanes.push(new GfVec4d(c[0], c[1], c[2], c[3]))
      } else if (arg === '--write') {
        this._outputFilePath = argv[++i]!
      }
    }
  }

  /** The --write path (for the caller that writes or compares the image). */
  getOutputFilePath(): string { return this._outputFilePath }

  /** The driver (for tests). */
  getDriver(): HdSt_TestDriver | null { return this._driver }
}

/** testHdStBasicDrawing.cpp:188-205 (BasicTest / main): ParseArgs, InitTest
 *  and the offscreen test of HdSt_UnitTestGLDrawing::RunTest
 *  (unitTestGLDrawing.cpp:196-260). */
export async function BasicTest(hgi: Hgi, argv: readonly string[]): Promise<{ image: HdStTestAovReadback | null, output: string, drawing: My_TestGLDrawing }> {
  const drawing = new My_TestGLDrawing(hgi)
  drawing.parseArgs(argv)
  drawing.initTest()
  const image = await drawing.offscreenTest()
  return { image, output: drawing.getOutputFilePath(), drawing }
}

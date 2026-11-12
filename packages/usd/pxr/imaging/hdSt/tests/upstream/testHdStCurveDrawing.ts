// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdSt/testenv/testHdStCurveDrawing.cpp
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/testenv/testHdStCurveDrawing.cpp (OpenUSD
// 26.11.1): basis curves of every type, basis, wrap and primvar
// interpolation, drawn with HdSt_TestDriver in a 640x480 offscreen run
// (`--offscreen --repr refined --refineLevel 0|1`, hdSt/CMakeLists.txt:
// 2353-2375).
//
// Divergences: the driver is given its Hgi (unitTestHelper.ts header), and
// WriteToFile is ReadBackAov (the caller writes or compares the texels);
// Hgi submission is asynchronous, so OffscreenTest is async.

import {
  Matrix4d as GfMatrix4d,
  Matrix4f as GfMatrix4f,
  Rect2i as GfRect2i,
  Vec2i as GfVec2i,
  Vec3d as GfVec3d,
  Vec3f as GfVec3f,
  Vec4f as GfVec4f,
} from 'typescript-usd/gf'
import { Interpolation as I, ReprTokens as HdReprTokens, Tokens as HdTokens } from 'typescript-usd/hd'
import { Framing as CameraUtilFraming } from 'typescript-usd/cameraUtil'
import type { Hgi } from 'typescript-usd/hgi'
import type { Token as TfToken } from 'typescript-usd/tf'
import { HdSt_TestDriver, type HdStTestAovReadback } from '../../src/unitTestHelper.ts'
import { HdSt_UnitTestGLDrawing } from './unitTestGLDrawing.ts'

/** testHdStCurveDrawing.cpp:21-47 */
export class My_TestGLDrawing extends HdSt_UnitTestGLDrawing {
  private _driver: HdSt_TestDriver | null = null
  private _reprName: string = HdReprTokens.hull
  private _refineLevel = 0
  private _outputFilePath = ''

  /** testHdStCurveDrawing.cpp:23-30 */
  constructor(private readonly _hgi: Hgi) {
    super()
    this.setCameraRotate(60.0, 0.0)
    this.setCameraTranslate(new GfVec3f(0, 0, Math.fround(Math.fround(-15.0) - Math.fround(Math.fround(1.7320508) * 2.0))))
  }

  /** testHdStCurveDrawing.cpp:51-305 */
  initTest(): void {
    this._driver = new HdSt_TestDriver(this._hgi, this._reprName as TfToken)
    const delegate = this._driver.getDelegate()
    delegate.setRefineLevel(this._refineLevel)

    let dmat = new GfMatrix4d(1)

    let xPos = 5
    let yPos = -0.0
    let zPos = 6.0
    let dx = 3.0
    let useNormals = false

    // Segment colors: [blue -> green] [pink -> yellow]

    // First row:
    // Curves with camera-facing normals 
    {
        dmat = new GfMatrix4d(1).setTranslate(new GfVec3d(xPos, yPos, zPos))
        delegate.addCurves('/curve1', HdTokens.linear, '',
                    new GfMatrix4f(dmat),
                    I.HdInterpolationVertex, I.HdInterpolationVertex,
                    useNormals)
        xPos += dx

        dmat = new GfMatrix4d(1).setTranslate(new GfVec3d(xPos, yPos, zPos))
        delegate.addCurves('/curve2', HdTokens.cubic, HdTokens.bezier,
                    new GfMatrix4f(dmat),
                    I.HdInterpolationVertex, I.HdInterpolationVertex,
                    useNormals)
        xPos += dx

        dmat = new GfMatrix4d(1).setTranslate(new GfVec3d(xPos, yPos, zPos))
        delegate.addCurves('/curve3', HdTokens.cubic, HdTokens.bspline,
                    new GfMatrix4f(dmat),
                    I.HdInterpolationVertex, I.HdInterpolationConstant,
                    useNormals)
        xPos += dx

        dmat = new GfMatrix4d(1).setTranslate(new GfVec3d(xPos, yPos, zPos))
        delegate.addCurves('/curve4', HdTokens.cubic, HdTokens.catmullRom,
                    new GfMatrix4f(dmat),
                    I.HdInterpolationVertex, I.HdInterpolationConstant,
                    useNormals)
        xPos += dx

        dmat = new GfMatrix4d(1).setTranslate(new GfVec3d(xPos, yPos, zPos))
        delegate.addCurves('/curve5', HdTokens.cubic, HdTokens.centripetalCatmullRom,
                    new GfMatrix4f(dmat),
                    I.HdInterpolationVertex, I.HdInterpolationConstant,
                    useNormals)
        xPos += dx
    }

    xPos = 4
    yPos = -3.0
    zPos = 6.0
    dx = 3.0
    useNormals = true

    // Second row:
    // Curves with authored normals
    {
        dmat = new GfMatrix4d(1).setTranslate(new GfVec3d(xPos, yPos, zPos))
        delegate.addCurves('/curve1n', HdTokens.linear, '',
                    new GfMatrix4f(dmat),
                    I.HdInterpolationVertex, I.HdInterpolationVertex,
                    useNormals)
        xPos += dx

        dmat = new GfMatrix4d(1).setTranslate(new GfVec3d(xPos, yPos, zPos))
        delegate.addCurves('/curve2n', HdTokens.cubic, HdTokens.bezier,
                    new GfMatrix4f(dmat),
                    I.HdInterpolationVertex, I.HdInterpolationVertex,
                    useNormals)
        xPos += dx

        dmat = new GfMatrix4d(1).setTranslate(new GfVec3d(xPos, yPos, zPos))
        delegate.addCurves('/curve3n', HdTokens.cubic, HdTokens.bspline,
                    new GfMatrix4f(dmat),
                    I.HdInterpolationVertex, I.HdInterpolationConstant,
                    useNormals)
        xPos += dx

        dmat = new GfMatrix4d(1).setTranslate(new GfVec3d(xPos, yPos, zPos))
        delegate.addCurves('/curve4n', HdTokens.cubic, HdTokens.catmullRom,
                    new GfMatrix4f(dmat),
                    I.HdInterpolationVertex, I.HdInterpolationConstant,
                    useNormals)
        xPos += dx

        dmat = new GfMatrix4d(1).setTranslate(new GfVec3d(xPos, yPos, zPos))
        delegate.addCurves('/curve5n', HdTokens.cubic, HdTokens.centripetalCatmullRom,
                    new GfMatrix4f(dmat),
                    I.HdInterpolationVertex, I.HdInterpolationConstant,
                    useNormals)
        xPos += dx
    }

    xPos = 4
    yPos = -6.0
    zPos = 6.0
    dx = 3.0
    useNormals = true

    // Third row:
    // Curves with varying data
    {
        dmat = new GfMatrix4d(1).setTranslate(new GfVec3d(xPos, yPos, zPos))
        delegate.addCurves('/curve1m', HdTokens.linear, '',
                    new GfMatrix4f(dmat),
                    I.HdInterpolationVertex, I.HdInterpolationVarying,
                    useNormals)
        xPos += dx

        dmat = new GfMatrix4d(1).setTranslate(new GfVec3d(xPos, yPos, zPos))
        delegate.addCurves('/curve2m', HdTokens.cubic, HdTokens.bezier,
                    new GfMatrix4f(dmat),
                    I.HdInterpolationVertex, I.HdInterpolationVarying,
                    useNormals)
        xPos += dx

        dmat = new GfMatrix4d(1).setTranslate(new GfVec3d(xPos, yPos, zPos))
        delegate.addCurves('/curve3m', HdTokens.cubic, HdTokens.bspline,
                    new GfMatrix4f(dmat),
                    I.HdInterpolationVertex, I.HdInterpolationVarying,
                    useNormals)
        xPos += dx

        dmat = new GfMatrix4d(1).setTranslate(new GfVec3d(xPos, yPos, zPos))
        delegate.addCurves('/curve4m', HdTokens.cubic, HdTokens.catmullRom,
                    new GfMatrix4f(dmat),
                    I.HdInterpolationVertex, I.HdInterpolationVarying,
                    useNormals)
        xPos += dx

        dmat = new GfMatrix4d(1).setTranslate(new GfVec3d(xPos, yPos, zPos))
        delegate.addCurves('/curve5m', HdTokens.cubic, HdTokens.centripetalCatmullRom,
                    new GfMatrix4f(dmat),
                    I.HdInterpolationVertex, I.HdInterpolationVarying,
                    useNormals)
        xPos += dx
    }

    xPos = 4
    yPos = -9.0
    zPos = 6.0
    dx = 3.0
    useNormals = true

    // Fourth row:
    // Curves with uniform color and various width interp modes
    {
        dmat = new GfMatrix4d(1).setTranslate(new GfVec3d(xPos, yPos, zPos))
        delegate.addCurves('/curve1u', HdTokens.linear, '',
                    new GfMatrix4f(dmat),
                    I.HdInterpolationUniform, I.HdInterpolationConstant,
                    useNormals)
        xPos += dx

        dmat = new GfMatrix4d(1).setTranslate(new GfVec3d(xPos, yPos, zPos))
        delegate.addCurves('/curve2u', HdTokens.cubic, HdTokens.bezier,
                    new GfMatrix4f(dmat),
                    I.HdInterpolationUniform, I.HdInterpolationVertex,
                    useNormals)
        xPos += dx

        dmat = new GfMatrix4d(1).setTranslate(new GfVec3d(xPos, yPos, zPos))
        delegate.addCurves('/curve3u', HdTokens.cubic, HdTokens.bspline,
                    new GfMatrix4f(dmat),
                    I.HdInterpolationUniform, I.HdInterpolationVarying,
                    useNormals)
        xPos += dx

        dmat = new GfMatrix4d(1).setTranslate(new GfVec3d(xPos, yPos, zPos))
        delegate.addCurves('/curve4u', HdTokens.cubic, HdTokens.catmullRom,
                    new GfMatrix4f(dmat),
                    I.HdInterpolationUniform, I.HdInterpolationUniform,
                    useNormals)
        xPos += dx

        dmat = new GfMatrix4d(1).setTranslate(new GfVec3d(xPos, yPos, zPos))
        delegate.addCurves('/curve5u', HdTokens.cubic, HdTokens.centripetalCatmullRom,
                    new GfMatrix4f(dmat),
                    I.HdInterpolationUniform, I.HdInterpolationUniform,
                    useNormals)
        xPos += dx
    }

    xPos = 4
    yPos = -12.0
    zPos = 6.0
    dx = 3.0
    useNormals = false

    // Fifth row:
    // Pinned bspline and catmullRom curves with vertex color and varying width
    // and camera facing normals.
    {
        // "pinned" wrap mode isn't relevant for linear curve type. Still, draw
        // the linear curve to aid comparison.
        dmat = new GfMatrix4d(1).setTranslate(new GfVec3d(xPos, yPos, zPos))
        delegate.addCurves('/curve1p', HdTokens.linear, '',
                    new GfMatrix4f(dmat),
                    I.HdInterpolationVertex, I.HdInterpolationVertex,
                    useNormals)
        xPos += dx
        
        // "pinned" wrap mode isn't relevant for bezier basis. Still, draw the
        // bezier curve to validate the result.
        dmat = new GfMatrix4d(1).setTranslate(new GfVec3d(xPos, yPos, zPos))
        delegate.addCurves('/curve2p', HdTokens.cubic, HdTokens.bezier,
                    new GfMatrix4f(dmat),
                    I.HdInterpolationUniform, I.HdInterpolationVertex,
                    useNormals)
        delegate.setCurveWrapMode('/curve2p', HdTokens.pinned)
        xPos += dx

        dmat = new GfMatrix4d(1).setTranslate(new GfVec3d(xPos, yPos, zPos))
        delegate.addCurves('/curve3p', HdTokens.cubic, HdTokens.bspline,
                    new GfMatrix4f(dmat),
                    I.HdInterpolationVertex, I.HdInterpolationVarying,
                    useNormals)
        delegate.setCurveWrapMode('/curve3p', HdTokens.pinned)
        xPos += dx

        dmat = new GfMatrix4d(1).setTranslate(new GfVec3d(xPos, yPos, zPos))
        delegate.addCurves('/curve4p', HdTokens.cubic, HdTokens.catmullRom,
                    new GfMatrix4f(dmat),
                    I.HdInterpolationVertex, I.HdInterpolationVarying,
                    useNormals)
        delegate.setCurveWrapMode('/curve4p', HdTokens.pinned)
        xPos += dx

        dmat = new GfMatrix4d(1).setTranslate(new GfVec3d(xPos, yPos, zPos))
        delegate.addCurves('/curve5p', HdTokens.cubic, HdTokens.centripetalCatmullRom,
                    new GfMatrix4f(dmat),
                    I.HdInterpolationVertex, I.HdInterpolationVarying,
                    useNormals)
        delegate.setCurveWrapMode('/curve5p', HdTokens.pinned)
        xPos += dx
    }

    // center camera
    this.setCameraTranslate(this.getCameraTranslate().add(new GfVec3f(-xPos / 2, 3.0, -7.0)))

    this._driver.setClearColor(new GfVec4f(0.1, 0.1, 0.1, 1.0))
    this._driver.setClearDepth(1.0)
    this._driver.setupAovs(this.getWidth(), this.getHeight())
  }

  /** testHdStCurveDrawing.cpp:307-324 */
  drawTest(): void {
    const width = this.getWidth(), height = this.getHeight()
    const viewMatrix = this.getViewMatrix()
    const projMatrix = this.getProjectionMatrix()

    this._driver!.setCamera(
      viewMatrix,
      projMatrix,
      new CameraUtilFraming(
        new GfRect2i(new GfVec2i(0, 0), width, height)))

    this._driver!.updateAovDimensions(width, height)

    this._driver!.draw()
  }

  /** testHdStCurveDrawing.cpp:326-334. Returns the color AOV readback
   *  upstream writes to the --write path. */
  async offscreenTest(): Promise<HdStTestAovReadback | null> {
    this.drawTest()
    return this._driver!.readBackAov('color')
  }

  /** testHdStCurveDrawing.cpp:342-356 */
  override parseArgs(argv: readonly string[]): void {
    for (let i = 0; i < argv.length; ++i) {
      if (argv[i] === '--repr') {
        this._reprName = argv[++i]!
      } else if (argv[i] === '--refineLevel') {
        this._refineLevel = parseInt(argv[++i]!, 10)
      } else if (argv[i] === '--write' && i + 1 < argv.length) {
        this._outputFilePath = argv[++i]!
      }
    }
  }

  /** The output path given with --write. */
  getOutputFilePath(): string { return this._outputFilePath }

  /** The driver (for tests). */
  getDriver(): HdSt_TestDriver | null { return this._driver }
}

/** testHdStCurveDrawing.cpp:358-363 BasicTest: RunTest(argc, argv) is
 *  ParseArgs(argv) + InitTest() + OffscreenTest(). */
export async function BasicTest(hgi: Hgi, argv: readonly string[]): Promise<{ image: HdStTestAovReadback | null, output: string, drawing: My_TestGLDrawing }> {
  const drawing = new My_TestGLDrawing(hgi)
  drawing.parseArgs(argv)
  drawing.initTest()
  const image = await drawing.offscreenTest()
  return { image, output: drawing.getOutputFilePath(), drawing }
}

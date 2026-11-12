// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/testenv/testHdStInstancing.cpp
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/testenv/testHdStInstancing.cpp (OpenUSD
// 26.11.1): eight prototypes (grids, a cube, points, curves) drawn through a
// (possibly nested) HdUnitTestDelegate instancer in a 640x480 offscreen run
// (hdSt/CMakeLists.txt registrations testHdStInstancing*).
//
// Divergences: the driver is given its Hgi (unitTestHelper.ts header);
// RunTest(argc, argv) is ParseArgs(argv) + InitTest() + OffscreenTest(), and
// WriteToFile is ReadBackAov (the caller writes or compares the texels),
// which is asynchronous because Hgi submission is. Idle and Present
// (interactive mode, testHdStInstancing.cpp:198-217) are not ported.

import {
  Matrix4f as GfMatrix4f,
  Rect2i as GfRect2i,
  Transform as GfTransform,
  Vec2i as GfVec2i,
  Vec3f as GfVec3f,
  Vec4f as GfVec4f,
  makeRotation as GfMakeRotation,
  rotationToQuat as GfRotationToQuat,
} from 'typescript-usd/gf'
import { Interpolation as I, ReprTokens as HdReprTokens, Tokens as HdTokens } from 'typescript-usd/hd'
import { Framing as CameraUtilFraming } from 'typescript-usd/cameraUtil'
import type { Hgi } from 'typescript-usd/hgi'
import type { Token as TfToken } from 'typescript-usd/tf'
import { HdSt_TestDriver, type HdStTestAovReadback } from '../../src/unitTestHelper.ts'
import { HdSt_UnitTestGLDrawing } from './unitTestGLDrawing.ts'

const f = Math.fround

/** testHdStInstancing.cpp:21-46 */
export class My_TestGLDrawing extends HdSt_UnitTestGLDrawing {
  private _driver: HdSt_TestDriver | null = null
  private _useInstancePrimvars = true
  private _reprName: string = HdReprTokens.hull
  private _refineLevel = 0
  private _instancerLevel = 1
  private _div = 10
  private _animateIndices = false
  private _rootTransform = false
  private _outputFilePath = ''

  /** testHdStInstancing.cpp:50-61 */
  constructor(private readonly _hgi: Hgi) {
    super()
    this.setCameraRotate(0, 0)
    this.setCameraTranslate(new GfVec3f(0, 0, -5))
  }

  /** testHdStInstancing.cpp:63-160 */
  initTest(): void {
    this._driver = new HdSt_TestDriver(this._hgi, this._reprName as TfToken)
    const delegate = this._driver.getDelegate()
    delegate.setRefineLevel(this._refineLevel)

    delegate.setUseInstancePrimvars(this._useInstancePrimvars)

    const transform = new GfMatrix4f(1)

    // create instancer hierarchy
    let instancerId = '/instancer'
    delegate.addInstancer(instancerId)

    // instancer nesting
    for (let i = 0; i < this._instancerLevel - 1; ++i) {
      const parentInstancerId = instancerId
      instancerId = parentInstancerId + '/instancer'

      const rootTransform = new GfTransform()
      if (this._rootTransform) {
        rootTransform.setRotation(GfMakeRotation([0, 0, 1], 45))
      }
      delegate.addInstancer(instancerId, parentInstancerId,
        new GfMatrix4f(rootTransform.getMatrix()))
      const scale: GfVec3f[] = []
      const rotate: GfVec4f[] = []
      const translate: GfVec3f[] = []
      const prototypeIndex: number[] = []
      const nPrototypes = 1

      for (let j = 0; j < this._div; ++j) {
        const p = f(j / f(this._div))
        const s = f(2.0 / this._div)
        const r = 1.0

        // flip scale.z to test isFlipped
        scale.push(new GfVec3f(s, s, j % 2 === 0 ? -s : s))
        rotate.push(new GfVec4f(0, 0, 0, 0))
        // r*cos(p*6.28): float * double, in double (std::cos(double)).
        translate.push(new GfVec3f(r * Math.cos(p * 6.28), 0, r * Math.sin(p * 6.28)))
        prototypeIndex.push(j % nPrototypes)
      }

      delegate.setInstancerProperties(parentInstancerId,
        prototypeIndex, scale, rotate, translate)
    }

    // add prototypes
    delegate.addGridWithFaceColor('/prototype1', 4, 4, transform,
      /*rightHanded=*/true, /*doubleSided=*/false, instancerId)
    delegate.addGridWithVertexColor('/prototype2', 4, 4, transform,
      /*rightHanded=*/true, /*doubleSided=*/false, instancerId)
    delegate.addCube('/prototype3', transform, false, instancerId)
    delegate.addGrid('/prototype4', 1, 1, transform,
      /*rightHanded=*/true, /*doubleSided=*/false, instancerId)
    delegate.addPoints('/prototype5', transform,
      I.HdInterpolationVertex, I.HdInterpolationConstant, instancerId)
    delegate.addCurves('/prototype6', HdTokens.cubic, HdTokens.bspline, transform,
      I.HdInterpolationVertex, I.HdInterpolationVertex,
      /*authoredNormals*/false, instancerId)
    delegate.addCurves('/prototype7', HdTokens.cubic, HdTokens.catmullRom, transform,
      I.HdInterpolationVertex, I.HdInterpolationVertex,
      /*authoredNormals*/false, instancerId)
    delegate.addCurves('/prototype8', HdTokens.cubic, HdTokens.catmullRom, transform,
      I.HdInterpolationVertex, I.HdInterpolationVertex,
      /*authoredNormals*/false, instancerId)

    const nPrototypes = 8
    const scale: GfVec3f[] = []
    const rotate: GfVec4f[] = []
    const translate: GfVec3f[] = []
    const prototypeIndex: number[] = []
    for (let i = 0; i < this._div; ++i) {
      const p = f(i / f(this._div))
      // GfRotation(GfVec3d(1, 0, 0), 90).GetQuaternion(): (real, imaginary)
      const [w, x, y, z] = GfRotationToQuat(GfMakeRotation([1, 0, 0], 90))
      const quat = new GfVec4f(x, y, z, w)
      const s = f(2.0 / this._div)
      const r = 1.0

      // flip scale.x to test isFlipped
      scale.push(new GfVec3f(i % 2 === 0 ? -s : s, s, s))
      rotate.push(quat)
      translate.push(new GfVec3f(r * Math.cos(p * 6.28), 0, r * Math.sin(p * 6.28)))
      prototypeIndex.push(i % nPrototypes)
    }
    delegate.setInstancerProperties(instancerId,
      prototypeIndex, scale, rotate, translate)

    this._driver.setClearColor(new GfVec4f(0.1, 0.1, 0.1, 1.0))
    this._driver.setClearDepth(1.0)
    this._driver.setupAovs(this.getWidth(), this.getHeight())
  }

  /** testHdStInstancing.cpp:162-179 */
  drawTest(): void {
    const width = this.getWidth(), height = this.getHeight()
    const viewMatrix = this.getViewMatrix()
    const projMatrix = this.getProjectionMatrix()

    this._driver!.setCamera(viewMatrix, projMatrix,
      new CameraUtilFraming(new GfRect2i(new GfVec2i(0, 0), width, height)))

    this._driver!.updateAovDimensions(width, height)

    this._driver!.draw()
  }

  /** testHdStInstancing.cpp:181-189. Returns the color AOV readback
   *  upstream writes to the --write path (null without one). */
  async offscreenTest(): Promise<HdStTestAovReadback | null> {
    this.drawTest()
    if (this._outputFilePath) return this._driver!.readBackAov('color')
    return null
  }

  /** testHdStInstancing.cpp:219-243 */
  override parseArgs(argv: readonly string[]): void {
    // note: _driver has not been constructed yet.
    for (let i = 0; i < argv.length; ++i) {
      const arg = argv[i]!
      if (arg === '--repr') {
        this._reprName = argv[++i]!
      } else if (arg === '--refineLevel') {
        this._refineLevel = parseInt(argv[++i]!, 10)
      } else if (arg === '--noprimvars') {
        this._useInstancePrimvars = false
      } else if (arg === '--div') {
        this._div = parseInt(argv[++i]!, 10)
      } else if (arg === '--level') {
        this._instancerLevel = parseInt(argv[++i]!, 10)
      } else if (arg === '--animateIndices') {
        this._animateIndices = true
      } else if (arg === '--rootTransform') {
        this._rootTransform = true
      } else if (arg === '--write') {
        this._outputFilePath = argv[++i]!
      }
    }
  }

  /** The --write path. */
  getOutputFilePath(): string { return this._outputFilePath }
  /** --animateIndices (used by Idle, interactive only). */
  getAnimateIndices(): boolean { return this._animateIndices }
}

/** testHdStInstancing.cpp:245-250 BasicTest. */
export async function BasicTest(hgi: Hgi, argv: readonly string[]): Promise<{ images: { name: string, image: HdStTestAovReadback }[] }> {
  const drawing = new My_TestGLDrawing(hgi)
  drawing.parseArgs(argv)
  drawing.initTest()
  const image = await drawing.offscreenTest()
  return { images: image ? [{ name: drawing.getOutputFilePath(), image }] : [] }
}

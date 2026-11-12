// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdSt/testenv/testHdStCurvePrimvarInterpolation.cpp
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/testenv/testHdStCurvePrimvarInterpolation.cpp
// (OpenUSD 26.11.1): linear, bezier, b-spline and catmull-rom curves with
// constant, varying and vertex color/opacity/width primvars, including
// padded (indexed and invalid) primvar arrays, in a 640x480 offscreen run
// (`--repr refined --refineLevel 0|1|3`).
//
// Divergences: as testHdStCurveDrawing.ts (driver given its Hgi, RunTest is
// ParseArgs + InitTest + OffscreenTest, WriteToFile is ReadBackAov; Present
// not ported). The C++ arrays are JavaScript arrays; _CopyArray is a copy.

import {
  Matrix4d as GfMatrix4d,
  Rect2i as GfRect2i,
  Vec2i as GfVec2i,
  Vec3d as GfVec3d,
  Vec3f as GfVec3f,
  Vec4f as GfVec4f,
} from 'typescript-usd/gf'
import { Interpolation as I, ReprTokens as HdReprTokens, Tokens as HdTokens } from 'typescript-usd/hd'
import { Array as VtArray, Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { Framing as CameraUtilFraming } from 'typescript-usd/cameraUtil'
import type { Hgi } from 'typescript-usd/hgi'
import type { Token as TfToken } from 'typescript-usd/tf'
import { HdSt_TestDriver, type HdStTestAovReadback } from '../../src/unitTestHelper.ts'
import { HdSt_UnitTestGLDrawing } from './unitTestGLDrawing.ts'

const f = Math.fround
const v3 = (x: number, y: number, z: number) => new GfVec3f(x, y, z)

/** VtValue(VtArray<float>) */
const floatArrayValue = (values: readonly number[]) =>
  VtValue.createArray(new VtArray<number>(values.map(f), VtValueTypes.float))
/** VtValue(VtArray<GfVec3f>) */
const vec3fArrayValue = (values: readonly GfVec3f[]) =>
  VtValue.createArray(new VtArray<GfVec3f>([...values], VtValueTypes.GfVec3f))
const vec3fValue = (v: GfVec3f) => VtValue.create(v, VtValueTypes.GfVec3f)
const floatValue = (x: number) => VtValue.create(f(x), VtValueTypes.float)

/** testHdStCurvePrimvarInterpolation.cpp:30-38 */
function _TransformPoints(pointsIn: readonly GfVec3f[], mat: GfMatrix4d): GfVec3f[] {
  return pointsIn.map(p => {
    // GfVec4f(point * mat), with point = (x, y, z, 1)
    const x = p.get(0), y = p.get(1), z = p.get(2)
    const out = [0, 1, 2].map(c => x * mat.getElement(0, c) + y * mat.getElement(1, c) + z * mat.getElement(2, c) + mat.getElement(3, c))
    return v3(out[0]!, out[1]!, out[2]!)
  })
}

/** testHdStCurvePrimvarInterpolation.cpp:40-62 */
export class My_TestGLDrawing extends HdSt_UnitTestGLDrawing {
  private _driver: HdSt_TestDriver | null = null
  private _reprName: string = HdReprTokens.hull
  private _refineLevel = 0
  private _outputFilePath = ''

  /** testHdStCurvePrimvarInterpolation.cpp:42-48 */
  constructor(private readonly _hgi: Hgi) {
    super()
    this.setCameraRotate(60.0, 0.0)
    this.setCameraTranslate(new GfVec3f(0, 0, f(f(-15.0) - f(f(1.7320508) * 2.0))))
  }

  /** testHdStCurvePrimvarInterpolation.cpp:66-563 */
  initTest(): void {
    this._driver = new HdSt_TestDriver(this._hgi, this._reprName as TfToken)
    const delegate = this._driver.getDelegate()
    delegate.setRefineLevel(this._refineLevel)

    let xPos = 0.0
    let yPos = 0.0
    const zPos = 6.0
    const dy = -1.75
    const at = () => new GfMatrix4d(1).setTranslate(new GfVec3d(xPos, yPos, zPos))

    const points3 = [v3(-1, 0, 0), v3(0, 0, 0), v3(1, 0, 0)]
    const points3Padded = [v3(-1, 1, 0), // extra
      v3(-1, 0, 0), v3(0, 0, 0),
      v3(0, 1, 0), // extra
      v3(1, 0, 0),
      v3(1, 1, 0)] // extra
    const indices3Vt = [1, 2, 4]

    const points5 = [v3(-2, 0, 0), v3(-1, 0, 0), v3(0, 0, 0), v3(1, 0, 0), v3(2, 0, 0)]
    const points5Padded = [v3(-2, 1, 0), // extra
      v3(-2, 0, 0), v3(-1, 0, 0), v3(0, 0, 0),
      v3(0, 1, 0), // extra
      v3(1, 0, 0), v3(2, 0, 0),
      v3(2, 1, 0)] // extra
    const indices5Vt = [1, 2, 3, 5, 6]

    const points7 = [v3(-1, 0, 0), v3(-.666, 0, 0), v3(-.333, 0, 0), v3(0, 0, 0),
      v3(.333, 0, 0), v3(.666, 0, 0), v3(1, 0, 0)]
    const points7Padded = [v3(-1, 1, 0), // extra
      v3(-1, 0, 0), v3(-.666, 0, 0), v3(-.333, 0, 0), v3(0, 0, 0),
      v3(0, 1, 0), // extra
      v3(.333, 0, 0), v3(.666, 0, 0), v3(1, 0, 0),
      v3(1, 1, 0)] // extra
    const indices7Vt = [1, 2, 3, 4, 6, 7, 8]

    const widths3Vt = floatArrayValue([0.1, 0.2, 0.3])
    const widths3PaddedVt = floatArrayValue([1.0, 0.1, 0.2, 1.0, 0.3, 1.0])
    const widths5Vt = floatArrayValue([0, 0.1, 0.2, 0.3, 0.4])
    const widths5PaddedVt = floatArrayValue([1.0, 0, 0.1, 0.2, 1.0, 0.3, 0.4, 1.0])
    const widths7Vt = floatArrayValue([0.1, 0.1333, 0.1666, 0.2, 0.2333, 0.2666, 0.3])
    const widths7PaddedVt = floatArrayValue([1.0, 0.1, 0.1333, 0.1666, 0.2, 1.0, 0.2333, 0.2666, 0.3, 1.0])

    const displayColor3Vt = vec3fArrayValue([v3(1, 0, 0), v3(0, 1, 0), v3(0, 0, 1)])
    const displayColor3PaddedVt = vec3fArrayValue([v3(1, 1, 1), v3(1, 0, 0),
      v3(0, 1, 0), v3(1, 1, 1), v3(0, 0, 1), v3(1, 1, 1)])
    const displayColor5Vt = vec3fArrayValue([v3(2, -1, 0), v3(1, 0, 0),
      v3(0, 1, 0), v3(0, 0, 1), v3(0, -1, 2)])
    const displayColor5PaddedVt = vec3fArrayValue([v3(1, 1, 1), v3(2, -1, 0),
      v3(1, 0, 0), v3(0, 1, 0), v3(1, 1, 1), v3(0, 0, 1), v3(0, -1, 2), v3(1, 1, 1)])
    const displayColor7Vt = vec3fArrayValue([v3(1, 0, 0), v3(.666, .333, 0),
      v3(.333, .666, 0), v3(0, 1, 0), v3(0, .666, .333), v3(0, .333, .666), v3(0, 0, 1)])
    const displayColor7PaddedVt = vec3fArrayValue([v3(1, 1, 1), v3(1, 0, 0),
      v3(.666, .333, 0), v3(.333, .666, 0), v3(0, 1, 0), v3(1, 1, 1),
      v3(0, .666, .333), v3(0, .333, .666), v3(0, 0, 1), v3(1, 1, 1)])

    const displayOpacity3Vt = floatArrayValue([0.5, 0.75, 1.0])

    const normals: GfVec3f[] = []
    const none: number[] = []
    const red = vec3fValue(v3(1.0, 0.0, 0.0)), blue = vec3fValue(v3(0.0, 0.0, 1.0))
    const one = floatValue(1.0), width02 = floatValue(0.2)

    // The seven rows every column has (testHdStCurvePrimvarInterpolation.cpp
    // 191-268, 278-357, 367-441, 451-525): constant color/width; varying
    // opacity; vertex color and width; varying color and width; padded points
    // with indices (valid); padded points without indices (invalid: no
    // visible curves); padded varying widths (invalid: fallback width 1).
    const column = (name: string, type: string, basis: string,
      points: GfVec3f[], pointsPadded: GfVec3f[], indices: number[],
      vertexColor: VtValue, vertexWidths: VtValue,
      vertexColorPadded: VtValue, vertexWidthsPadded: VtValue) => {
      const counts = [points.length]
      const add = (row: number, pts: GfVec3f[], curveIndices: number[],
        color: VtValue, colorInterp: I, opacity: VtValue, opacityInterp: I,
        width: VtValue, widthInterp: I) => {
        delegate.addBasisCurves(`/curve${row}${name}`, _TransformPoints(pts, at()),
          counts, curveIndices, normals, type, basis,
          color, colorInterp, opacity, opacityInterp, width, widthInterp)
        yPos += dy
      }
      add(1, points, none, red, I.HdInterpolationConstant, one, I.HdInterpolationConstant, width02, I.HdInterpolationConstant)
      add(2, points, none, blue, I.HdInterpolationConstant, displayOpacity3Vt, I.HdInterpolationVarying, width02, I.HdInterpolationConstant)
      add(3, points, none, vertexColor, I.HdInterpolationVertex, one, I.HdInterpolationConstant, vertexWidths, I.HdInterpolationVertex)
      add(4, points, none, displayColor3Vt, I.HdInterpolationVarying, one, I.HdInterpolationConstant, widths3Vt, I.HdInterpolationVarying)
      // padded with 3 unused extra entries for points vertex primvar,
      // with indices avoiding the extra entries, which is valid.
      add(5, pointsPadded, indices, vertexColorPadded, I.HdInterpolationVertex, one, I.HdInterpolationConstant, vertexWidthsPadded, I.HdInterpolationVertex)
      // padded with 3 unused extra entries for points vertex primvar.
      // This is an invalid case and results in no visible curves.
      add(6, pointsPadded, none, displayColor3Vt, I.HdInterpolationVarying, one, I.HdInterpolationConstant, widths3Vt, I.HdInterpolationVarying)
      // padded with 3 extra entries for widths varying primvar.
      // This is an invalid case and results in fallback width 1 being
      // used instead.
      add(7, points, none, displayColor3Vt, I.HdInterpolationVarying, one, I.HdInterpolationConstant, widths3PaddedVt, I.HdInterpolationVarying)
    }

    // First column: linear curves (basis TfToken())
    column('l', HdTokens.linear, '', points3, points3Padded, indices3Vt,
      displayColor3Vt, widths3Vt, displayColor3PaddedVt, widths3PaddedVt)

    xPos = 3.0
    yPos = 0.0

    // Second column: bezier curves
    column('b', HdTokens.cubic, HdTokens.bezier, points7, points7Padded, indices7Vt,
      displayColor7Vt, widths7Vt, displayColor7PaddedVt, widths7PaddedVt)

    xPos = 7.0
    yPos = 0.0

    // Third column: b-spline curves
    column('bs', HdTokens.cubic, HdTokens.bspline, points5, points5Padded, indices5Vt,
      displayColor5Vt, widths5Vt, displayColor5PaddedVt, widths5PaddedVt)

    xPos = 11.0
    yPos = 0.0

    // Fourth column: catmull-rom curves
    column('cr', HdTokens.cubic, HdTokens.catmullRom, points5, points5Padded, indices5Vt,
      displayColor5Vt, widths5Vt, displayColor5PaddedVt, widths5PaddedVt)

    // center camera
    const t = this.getCameraTranslate()
    this.setCameraTranslate(new GfVec3f(f(t.get(0) + f(-xPos / 2)), f(t.get(1) + 2.0), f(t.get(2) - 5.0)))

    this._driver.setClearColor(new GfVec4f(0.1, 0.1, 0.1, 1.0))
    this._driver.setClearDepth(1.0)
    this._driver.setupAovs(this.getWidth(), this.getHeight())
  }

  /** testHdStCurvePrimvarInterpolation.cpp:565-581 */
  drawTest(): void {
    const width = this.getWidth(), height = this.getHeight()
    this._driver!.setCamera(this.getViewMatrix(), this.getProjectionMatrix(),
      new CameraUtilFraming(new GfRect2i(new GfVec2i(0, 0), width, height)))
    this._driver!.updateAovDimensions(width, height)
    this._driver!.draw()
  }

  /** testHdStCurvePrimvarInterpolation.cpp:583-591 */
  async offscreenTest(): Promise<HdStTestAovReadback | null> {
    this.drawTest()
    if (this._outputFilePath) return this._driver!.readBackAov('color')
    return null
  }

  /** testHdStCurvePrimvarInterpolation.cpp:599-611 */
  override parseArgs(argv: readonly string[]): void {
    for (let i = 0; i < argv.length; ++i) {
      if (argv[i] === '--repr') this._reprName = argv[++i]!
      else if (argv[i] === '--refineLevel') this._refineLevel = parseInt(argv[++i]!, 10)
      else if (argv[i] === '--write' && i + 1 < argv.length) this._outputFilePath = argv[++i]!
    }
  }

  getOutputFilePath(): string { return this._outputFilePath }
}

/** testHdStCurvePrimvarInterpolation.cpp:613-618 BasicTest. */
export async function BasicTest(hgi: Hgi, argv: readonly string[]): Promise<{ images: { name: string, image: HdStTestAovReadback }[] }> {
  const drawing = new My_TestGLDrawing(hgi)
  drawing.parseArgs(argv)
  drawing.initTest()
  const image = await drawing.offscreenTest()
  return { images: image ? [{ name: drawing.getOutputFilePath(), image }] : [] }
}

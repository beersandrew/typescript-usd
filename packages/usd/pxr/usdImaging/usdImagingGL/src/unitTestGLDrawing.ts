// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImagingGL/unitTestGLDrawing.cpp,
//  pxr/usdImaging/usdImagingGL/unitTestGLDrawing.h,
//  pxr/imaging/hio/stbImage.cpp,
//  pxr/usdImaging/usdImagingGL/testenv/testUsdImagingGLBasicDrawing.cpp
// Copyright 2016, 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImagingGL/unitTestGLDrawing.{h,cpp}
// (OpenUSD 26.11.1): UsdImagingGL_UnitTestGLDrawing, the driver of the
// usdImagingGL image tests (testUsdImagingGLBasicDrawing and the programs
// built on it).
//
// Divergences:
// - There is no window: tests run offscreen (as every registered test does,
//   with -offscreen or -complexities). The widget's size is -widgetSize
//   (default 640x480). Running without -offscreen draws offscreen once too.
// - The driver is given its Hgi (upstream: the engine creates the platform
//   default Hgi), because WebGPU device creation is asynchronous; the test
//   hands it to UsdImagingGLEngine through Parameters.driver.
// - The client framebuffer present-output modes (-presentComposite,
//   -presentDisabled; the raw-GL _OffscreenFramebuffer) are not ported:
//   they are a TF_CODING_ERROR and the image comes from the AOV.
// - The usdImaging test plugins (UsdImagingGL_UnitTestHelper_InitPlugins,
//   UsdImagingPlugins/lib/UsdImagingTest.framework) are not registered;
//   -skipTestPlugins is accepted.
// - InitTest/DrawTest/RunTest/WriteToFile are asynchronous (stage opening and
//   texture readback are).
// - WriteAovToFile reads the AOV texture back
//   (HdStTextureUtils::HgiTextureReadback) and hands the 8-bit image
//   Hio_StbImage::Write would write for a .png (quantization,
//   hio/stbImage.cpp:566-575, rows flipped for storage.flipped) to the image
//   writer set with SetImageWriter: image writing is not part of this
//   repository's hio.
// - -traceFile and -perfStatsFile are parsed; no trace or perf file is
//   written.
// - Usage() and parse errors throw instead of exiting the process.

import { Vec2f as GfVec2f, Vec2i as GfVec2i, Vec3f as GfVec3f, Vec4d as GfVec4d, Vec4f as GfVec4f, Range2f as GfRange2f, Rect2i as GfRect2i, _halfBitsToFloat } from 'typescript-usd/gf'
import { ConformWindowPolicy as CameraUtilConformWindowPolicy } from 'typescript-usd/cameraUtil'
import { HgiFormat, type Hgi, type HgiTextureHandle } from 'typescript-usd/hgi'
import { TextureUtils as HdStTextureUtils } from 'typescript-usd/hdSt'
import { UsdImagingGLCullStyle, UsdImagingGLDrawMode, UsdImagingGLRenderParams } from './renderParams.ts'
import type { UsdImagingGLEngine } from './engine.ts'
import { TF_CODING_ERROR, TF_RUNTIME_ERROR, TF_WARN } from './tfDiagnostic.ts'

/** What Hio_StbImage::Write would write for a .png: 8-bit rows, top row
 *  first. `channels` is the AOV texture's component count. */
export interface UsdImagingGL_UnitTestImage {
  filename: string
  width: number
  height: number
  channels: number
  data: Uint8Array
}

export type UsdImagingGL_UnitTestImageWriter = (image: UsdImagingGL_UnitTestImage) => void | Promise<void>

/** hio/stbImage.cpp:566-575 _Quantize, computed in float as upstream. */
function _Quantize(value: number): number {
  const f = Math.fround
  const result = Math.floor(f(f(255 * f(value)) + f(0.499999)))
  return Math.min(255, Math.max(0, result))
}

/** unitTestGLDrawing.cpp:525-556 */
class _Args {
  unresolvedStageFilePath = ''
  offscreen = false
  shading = 'smooth'
  cullStyle = 'nothing'
  clipPlaneCoords: number[] = []
  complexities: number[] = []
  clearColor: [number, number, number, number] = [1.0, 0.5, 0.1, 1.0]
  translate: [number, number, number] = [0.0, -1000.0, -2500.0]
  widgetSize: [number, number] = [640, 480]
  pixelAspectRatio = 1.0
  dataWindow: [number, number, number, number] = [0, 0, 0, 0]
  displayWindow: [number, number, number, number] = [0.0, 0.0, 0.0, 0.0]
  windowPolicy: CameraUtilConformWindowPolicy = CameraUtilConformWindowPolicy.CameraUtilMatchVertically
}

/** unitTestGLDrawing.cpp:576-587 */
function ParseError(pname: string, message: string): never {
  throw new Error(`${pname.split('/').pop()}: ${message}.  Try '${pname.split('/').pop()} -' for help.`)
}

/** unitTestGLDrawing.cpp:681-693 */
function CheckForMissingArguments(i: number, n: number, argv: readonly string[]): void {
  if (i + n >= argv.length) {
    if (n === 1) {
      ParseError(argv[0]!, `missing parameter for '${argv[i]}'`)
    } else {
      ParseError(argv[0]!, `argument '${argv[i]}' requires ${n} values`)
    }
  }
}

/** A cursor over argv, for the C++ helpers that advance `int& i`. */
interface _Cursor { i: number }

/** unitTestGLDrawing.cpp:695-722: strtod with the whole argument consumed. */
function _StrToD(s: string): number | undefined {
  const t = s.trim()
  if (t === '' || t !== s) return undefined
  const v = Number(t)
  return Number.isNaN(v) && t.toLowerCase() !== 'nan' ? undefined : v
}

function ParseDouble(c: _Cursor, argv: readonly string[], invalid?: { value: boolean }): number {
  if (c.i + 1 === argv.length) {
    if (invalid) {
      invalid.value = true
      return 0.0
    }
    ParseError(argv[0]!, `missing parameter for '${argv[c.i]}'`)
  }
  const result = _StrToD(argv[c.i + 1]!)
  if (result === undefined) {
    if (invalid) {
      invalid.value = true
      return 0.0
    }
    ParseError(argv[0]!, `invalid parameter for '${argv[c.i]}': ${argv[c.i + 1]}`)
  }
  ++c.i
  if (invalid) {
    invalid.value = false
  }
  return result
}

/** unitTestGLDrawing.cpp:724-740 (atoi) */
function ParseInt(c: _Cursor, argv: readonly string[]): number {
  if (c.i + 1 === argv.length) {
    ParseError(argv[0]!, `missing parameter for '${argv[c.i]}'`)
  }
  const result = parseInt(argv[c.i + 1]!, 10)
  ++c.i
  return Number.isNaN(result) ? 0 : result
}

/** unitTestGLDrawing.cpp:742-765 */
function ParseShowHide(c: _Cursor, argv: readonly string[]): boolean {
  if (c.i + 1 === argv.length) {
    ParseError(argv[0]!, `missing parameter for '${argv[c.i]}'`)
  }
  let result: boolean
  if (argv[c.i + 1] === 'show') {
    result = true
  } else if (argv[c.i + 1] === 'hide') {
    result = false
  } else {
    ParseError(argv[0]!, `invalid parameter for '${argv[c.i]}': ${argv[c.i + 1]}. Must be either 'show' or 'hide'`)
  }
  ++c.i
  return result
}

/** unitTestGLDrawing.cpp:767-785 */
function ParseString(c: _Cursor, argv: readonly string[]): string {
  if (c.i + 1 === argv.length) {
    ParseError(argv[0]!, `missing parameter for '${argv[c.i]}'`)
  }
  const result = argv[c.i + 1]!
  ++c.i
  return result
}

/** unitTestGLDrawing.cpp:787-803 */
function ParseDoubleVector(c: _Cursor, argv: readonly string[], result: number[]): void {
  const invalid = { value: false }
  while (c.i !== argv.length) {
    const value = ParseDouble(c, argv, invalid)
    if (invalid.value) {
      break
    }
    result.push(value)
  }
}

/** unitTestGLDrawing.cpp:805-825 */
function ParseBool(c: _Cursor, argv: readonly string[]): boolean {
  if (c.i + 1 === argv.length) {
    ParseError(argv[0]!, `missing parameter for '${argv[c.i]}'`)
  }
  let result = false
  if (argv[c.i + 1] === 'true') {
    result = true
  } else if (argv[c.i + 1] === 'false') {
    result = false
  } else {
    ParseError(argv[0]!, `invalid parameter for '${argv[c.i]}': ${argv[c.i + 1]}. Must be either 'true' or 'false'`)
  }
  ++c.i
  return result
}

/** A render setting value with its type (VtValue(float) or VtValue(bool)). */
export interface UsdImagingGL_UnitTestRenderSetting {
  type: 'float' | 'bool'
  value: number | boolean
}

/** unitTestGLDrawing.cpp:827-842 */
function ParseVtValue(c: _Cursor, argv: readonly string[]): UsdImagingGL_UnitTestRenderSetting | undefined {
  const typeString = ParseString(c, argv)
  if (typeString === 'float') {
    CheckForMissingArguments(c.i, 1, argv)
    return { type: 'float', value: Math.fround(ParseDouble(c, argv)) }
  } else if (typeString === 'bool') {
    CheckForMissingArguments(c.i, 1, argv)
    return { type: 'bool', value: ParseBool(c, argv) }
  } else {
    ParseError(argv[0]!, `unknown type '${typeString}'`)
  }
}

/** unitTestGLDrawing.h:27-162: a helper class for unit tests which need to
 *  perform GL drawing. */
export abstract class UsdImagingGL_UnitTestGLDrawing {
  private _widgetSize: [number, number] = [640, 480]
  private _testLighting = false
  private _sceneLights = false
  private _cameraLight = false
  private _cameraPath = ''
  private _pickCameraPath = ''
  private _enableSceneMaterials = true
  private _unloadedAsBounds = false
  private _skipTestPlugins = false

  private _stageFilePath = ''
  private _outputFilePath = ''

  private _complexity = 1.0
  private _renderer = ''

  private _times: number[] = []

  private _clipPlanes: GfVec4d[] = []

  private _drawMode: UsdImagingGLDrawMode = UsdImagingGLDrawMode.DRAW_SHADED_SMOOTH
  private _shouldFrameAll = false
  private _cullStyle: UsdImagingGLCullStyle = UsdImagingGLCullStyle.CULL_STYLE_NOTHING
  private _clearColor = new GfVec4f(0, 0, 0, 0)
  private _translate = new GfVec3f(0, 0, 0)
  private _pixelAspectRatio = 1.0
  private _displayWindow = new GfRange2f()
  private _dataWindow = new GfRect2i()
  private _windowPolicy: CameraUtilConformWindowPolicy = CameraUtilConformWindowPolicy.CameraUtilMatchVertically

  private _renderSettings = new Map<string, UsdImagingGL_UnitTestRenderSetting>()
  private _rendererAov = 'color'
  private _perfStatsFile = ''
  private _traceFile = ''

  private _showGuides = new UsdImagingGLRenderParams().showGuides
  private _showRender = new UsdImagingGLRenderParams().showRender
  private _showProxy = new UsdImagingGLRenderParams().showProxy
  private _presentComposite = false
  private _presentDisabled = false

  private _numErrorsAllowed = 0

  private _imageWriter: UsdImagingGL_UnitTestImageWriter | null = null

  /** unitTestGLDrawing.cpp:368-391 (see the header for the Hgi). */
  constructor(private readonly _hgi: Hgi) {}

  /** The Hgi the test hands to UsdImagingGLEngine (see the header). */
  getHgi(): Hgi { return this._hgi }

  /** Where WriteToFile sends the images (see the header). */
  setImageWriter(writer: UsdImagingGL_UnitTestImageWriter | null): void {
    this._imageWriter = writer
  }

  /** unitTestGLDrawing.cpp:395-405 */
  getWidth(): number { return this._widgetSize[0] }
  getHeight(): number { return this._widgetSize[1] }

  isEnabledTestLighting(): boolean { return this._testLighting }
  isEnabledSceneLights(): boolean { return this._sceneLights }
  isEnabledCameraLight(): boolean { return this._cameraLight }
  isEnabledSceneMaterials(): boolean { return this._enableSceneMaterials }
  isEnabledUnloadedAsBounds(): boolean { return this._unloadedAsBounds }

  isShowGuides(): boolean { return this._showGuides }
  isShowRender(): boolean { return this._showRender }
  isShowProxy(): boolean { return this._showProxy }

  // We use a client created presentation output (framebuffer) when
  // testing present output, otherwise we output AOV images directly.
  presentComposite(): boolean { return this._presentComposite }
  presentDisabled(): boolean { return this._presentDisabled }
  isEnabledTestPresentOutput(): boolean {
    return this.presentComposite() || this.presentDisabled()
  }

  getDrawMode(): UsdImagingGLDrawMode { return this._drawMode }

  getStageFilePath(): string { return this._stageFilePath }
  getOutputFilePath(): string { return this._outputFilePath }

  getCameraPath(): string { return this._cameraPath }
  getPickCameraPath(): string { return this._pickCameraPath }
  getClipPlanes(): readonly GfVec4d[] { return this._clipPlanes }
  getTimes(): readonly number[] { return this._times }
  getClearColor(): GfVec4f { return this._clearColor }
  getTranslate(): GfVec3f { return this._translate }
  getRenderSettings(): ReadonlyMap<string, UsdImagingGL_UnitTestRenderSetting> { return this._renderSettings }
  getRendererAov(): string { return this._rendererAov }
  getPerfStatsFile(): string { return this._perfStatsFile }
  getPixelAspectRatio(): number { return this._pixelAspectRatio }
  getDisplayWindow(): GfRange2f { return this._displayWindow }
  getDataWindow(): GfRect2i { return this._dataWindow }
  getWindowPolicy(): CameraUtilConformWindowPolicy { return this._windowPolicy }
  getCullStyle(): UsdImagingGLCullStyle { return this._cullStyle }
  getNumErrorsAllowed(): number { return this._numErrorsAllowed }

  abstract initTest(): void | Promise<void>
  abstract drawTest(offscreen: boolean): void | Promise<void>
  shutdownTest(): void | Promise<void> {}

  /** unitTestGLDrawing.cpp:977-1003 */
  mousePress(_button: number, _x: number, _y: number, _modKeys: number): void {}
  mouseRelease(_button: number, _x: number, _y: number, _modKeys: number): void {}
  mouseMove(_x: number, _y: number, _modKeys: number): void {}
  keyRelease(_key: number): void {}

  protected _getComplexity(): number { return this._complexity }
  protected _ShouldFrameAll(): boolean { return this._shouldFrameAll }
  protected _getRenderer(): string { return this._renderer }

  /** unitTestGLDrawing.h:117-121 */
  protected _render(engine: UsdImagingGLEngine, params: UsdImagingGLRenderParams): void {
    const roots = ['/']
    engine.RenderBatch(roots, params)
  }

  /** unitTestGLDrawing.cpp:407-422 */
  async writeToFile(engine: UsdImagingGLEngine, aovName: string, filename: string): Promise<boolean> {
    if (this.isEnabledTestPresentOutput()) {
      // Write an image from the specified client drawTarget attachment.
      TF_CODING_ERROR('UsdImagingGL_UnitTestGLDrawing: the present-output '
        + 'test modes (client framebuffer) are not ported')
      return false
    } else {
      // Write an image from the specified engine AOV.
      return UsdImagingGL_UnitTestGLDrawing.writeAovToFile(engine, aovName, filename, this._imageWriter)
    }
  }

  /** unitTestGLDrawing.cpp:424-475 (see the header). */
  static async writeAovToFile(engine: UsdImagingGLEngine, aovName: string, filename: string,
    writer: UsdImagingGL_UnitTestImageWriter | null): Promise<boolean> {
    const hgi = engine.getHgi()
    const texture = engine.getAovTexture(aovName) as HgiTextureHandle | undefined
    const tex = texture?.Get()
    if (!hgi || !texture || !tex) {
      TF_RUNTIME_ERROR(`Failed to write image to ${filename}`)
      return false
    }
    const buffer = await HdStTextureUtils.hgiTextureReadback(hgi, texture)

    const textureDesc = tex.getDescriptor()
    const width = textureDesc.dimensions.get(0)
    const height = textureDesc.dimensions.get(1)

    let channels: number
    let read: (i: number) => number
    if (textureDesc.format === HgiFormat.HgiFormatUNorm8Vec4) {
      channels = 4
      read = i => buffer[i]! / 255
    } else if (textureDesc.format === HgiFormat.HgiFormatFloat16Vec3 ||
      textureDesc.format === HgiFormat.HgiFormatFloat16Vec4) {
      channels = textureDesc.format === HgiFormat.HgiFormatFloat16Vec3 ? 3 : 4
      const halves = new Uint16Array(buffer.buffer, buffer.byteOffset, width * height * channels)
      read = i => _halfBitsToFloat(halves[i]!)
    } else if (textureDesc.format === HgiFormat.HgiFormatFloat32Vec3 ||
      textureDesc.format === HgiFormat.HgiFormatFloat32Vec4) {
      channels = textureDesc.format === HgiFormat.HgiFormatFloat32Vec3 ? 3 : 4
      const floats = new Float32Array(buffer.buffer, buffer.byteOffset, width * height * channels)
      read = i => floats[i]!
    } else {
      TF_CODING_ERROR(`Unsupported texture format: ${filename}`)
      return false
    }

    if (!writer) {
      TF_RUNTIME_ERROR(`Failed to write image to ${filename}`)
      return false
    }
    // storage.flipped = true: the first row written is the last row read.
    const data = new Uint8Array(width * height * channels)
    for (let y = 0; y < height; y++) {
      const src = (height - 1 - y) * width * channels
      for (let x = 0; x < width * channels; x++) {
        // A UNorm8 texture is written as is (no quantization).
        data[y * width * channels + x] = textureDesc.format === HgiFormat.HgiFormatUNorm8Vec4
          ? buffer[src + x]! : _Quantize(read(src + x))
      }
    }
    await writer({ filename, width, height, channels, data })
    return true
  }

  /** unitTestGLDrawing.cpp:844-975 */
  private _parse(argv: readonly string[], args: _Args): void {
    const c: _Cursor = { i: 1 }
    for (; c.i !== argv.length; ++c.i) {
      const arg = argv[c.i]!
      if (arg === '-') {
        throw new Error('usage: see unitTestGLDrawing.cpp:589-679')
      } else if (arg === '-skipTestPlugins') {
        this._skipTestPlugins = true
      } else if (arg === '-frameAll') {
        this._shouldFrameAll = true
      } else if (arg === '-cullStyle') {
        CheckForMissingArguments(c.i, 1, argv)
        args.cullStyle = argv[++c.i]!
      } else if (arg === '-offscreen') {
        args.offscreen = true
      } else if (arg === '-lighting') {
        this._testLighting = true
      } else if (arg === '-sceneLights') {
        this._sceneLights = true
      } else if (arg === '-camlight') {
        this._cameraLight = true
      } else if (arg === '-camera') {
        CheckForMissingArguments(c.i, 1, argv)
        this._cameraPath = argv[++c.i]!
      } else if (arg === '-pickCamera') {
        CheckForMissingArguments(c.i, 1, argv)
        this._pickCameraPath = argv[++c.i]!
      } else if (arg === '-disableSceneMaterials') {
        this._enableSceneMaterials = false
      } else if (arg === '-unloadedAsBounds') {
        this._unloadedAsBounds = true
      } else if (arg === '-stage') {
        CheckForMissingArguments(c.i, 1, argv)
        args.unresolvedStageFilePath = argv[++c.i]!
      } else if (arg === '-write') {
        CheckForMissingArguments(c.i, 1, argv)
        this._outputFilePath = argv[++c.i]!
      } else if (arg === '-shading') {
        CheckForMissingArguments(c.i, 1, argv)
        args.shading = argv[++c.i]!
      } else if (arg === '-complexity') {
        CheckForMissingArguments(c.i, 1, argv)
        this._complexity = ParseDouble(c, argv)
      } else if (arg === '-renderer') {
        CheckForMissingArguments(c.i, 1, argv)
        this._renderer = argv[++c.i]!
      } else if (arg === '-rendererAov') {
        CheckForMissingArguments(c.i, 1, argv)
        this._rendererAov = argv[++c.i]!
      } else if (arg === '-perfStatsFile') {
        CheckForMissingArguments(c.i, 1, argv)
        this._perfStatsFile = argv[++c.i]!
      } else if (arg === '-traceFile') {
        CheckForMissingArguments(c.i, 1, argv)
        this._traceFile = argv[++c.i]!
      } else if (arg === '-clipPlane') {
        CheckForMissingArguments(c.i, 4, argv)
        args.clipPlaneCoords.push(ParseDouble(c, argv))
        args.clipPlaneCoords.push(ParseDouble(c, argv))
        args.clipPlaneCoords.push(ParseDouble(c, argv))
        args.clipPlaneCoords.push(ParseDouble(c, argv))
      } else if (arg === '-complexities') {
        ParseDoubleVector(c, argv, args.complexities)
      } else if (arg === '-times') {
        ParseDoubleVector(c, argv, this._times)
      } else if (arg === '-clear') {
        CheckForMissingArguments(c.i, 4, argv)
        args.clearColor[0] = Math.fround(ParseDouble(c, argv))
        args.clearColor[1] = Math.fround(ParseDouble(c, argv))
        args.clearColor[2] = Math.fround(ParseDouble(c, argv))
        args.clearColor[3] = Math.fround(ParseDouble(c, argv))
      } else if (arg === '-translate') {
        CheckForMissingArguments(c.i, 3, argv)
        args.translate[0] = Math.fround(ParseDouble(c, argv))
        args.translate[1] = Math.fround(ParseDouble(c, argv))
        args.translate[2] = Math.fround(ParseDouble(c, argv))
      } else if (arg === '-widgetSize') {
        CheckForMissingArguments(c.i, 2, argv)
        args.widgetSize[0] = Math.trunc(ParseDouble(c, argv))
        args.widgetSize[1] = Math.trunc(ParseDouble(c, argv))
      } else if (arg === '-pixelAspectRatio') {
        CheckForMissingArguments(c.i, 1, argv)
        args.pixelAspectRatio = Math.fround(ParseDouble(c, argv))
      } else if (arg === '-dataWindow') {
        CheckForMissingArguments(c.i, 4, argv)
        args.dataWindow[0] = Math.trunc(ParseDouble(c, argv))
        args.dataWindow[1] = Math.trunc(ParseDouble(c, argv))
        args.dataWindow[2] = Math.trunc(ParseDouble(c, argv))
        args.dataWindow[3] = Math.trunc(ParseDouble(c, argv))
      } else if (arg === '-displayWindow') {
        CheckForMissingArguments(c.i, 4, argv)
        args.displayWindow[0] = Math.fround(ParseDouble(c, argv))
        args.displayWindow[1] = Math.fround(ParseDouble(c, argv))
        args.displayWindow[2] = Math.fround(ParseDouble(c, argv))
        args.displayWindow[3] = Math.fround(ParseDouble(c, argv))
      } else if (arg === '-windowPolicy') {
        CheckForMissingArguments(c.i, 1, argv)
        const policy = ParseString(c, argv)
        if (policy === 'matchVertically') {
          args.windowPolicy = CameraUtilConformWindowPolicy.CameraUtilMatchVertically
        } else if (policy === 'matchHorizontally') {
          args.windowPolicy = CameraUtilConformWindowPolicy.CameraUtilMatchHorizontally
        } else if (policy === 'fit') {
          args.windowPolicy = CameraUtilConformWindowPolicy.CameraUtilFit
        } else if (policy === 'crop') {
          args.windowPolicy = CameraUtilConformWindowPolicy.CameraUtilCrop
        } else if (policy === 'dontConform') {
          args.windowPolicy = CameraUtilConformWindowPolicy.CameraUtilDontConform
        } else {
          ParseError(argv[0]!, `Unknown window policy '${policy}'`)
        }
      } else if (arg === '-renderSetting') {
        CheckForMissingArguments(c.i, 2, argv)
        const key = ParseString(c, argv)
        this._renderSettings.set(key, ParseVtValue(c, argv)!)
      } else if (arg === '-guidesPurpose') {
        this._showGuides = ParseShowHide(c, argv)
      } else if (arg === '-renderPurpose') {
        this._showRender = ParseShowHide(c, argv)
      } else if (arg === '-proxyPurpose') {
        this._showProxy = ParseShowHide(c, argv)
      } else if (arg === '-presentComposite') {
        this._presentComposite = true
      } else if (arg === '-presentDisabled') {
        this._presentDisabled = true
      } else if (arg === '-numErrorsAllowed') {
        this._numErrorsAllowed = ParseInt(c, argv)
      } else {
        ParseError(argv[0]!, `unknown argument ${arg}`)
      }
    }
  }

  /** unitTestGLDrawing.cpp:1005-1070. `argv[0]` is the program name. */
  async runTest(argv: readonly string[]): Promise<void> {
    const args = new _Args()
    this._parse(argv, args)

    // !_skipTestPlugins: UsdImagingGL_UnitTestHelper_InitPlugins (see the
    // header).

    for (let i = 0; i < Math.floor(args.clipPlaneCoords.length / 4); ++i) {
      this._clipPlanes.push(new GfVec4d(...args.clipPlaneCoords.slice(i * 4, i * 4 + 4)))
    }

    this._clearColor = new GfVec4f(...args.clearColor)
    this._translate = new GfVec3f(...args.translate)

    this._pixelAspectRatio = args.pixelAspectRatio
    this._displayWindow = new GfRange2f(
      new GfVec2f(args.displayWindow[0], args.displayWindow[1]),
      new GfVec2f(args.displayWindow[0] + args.displayWindow[2],
        args.displayWindow[1] + args.displayWindow[3]))
    this._dataWindow = new GfRect2i(
      new GfVec2i(args.dataWindow[0], args.dataWindow[1]),
      args.dataWindow[2], args.dataWindow[3])
    this._windowPolicy = args.windowPolicy

    this._drawMode = UsdImagingGLDrawMode.DRAW_SHADED_SMOOTH
    if (args.shading === 'points') {
      this._drawMode = UsdImagingGLDrawMode.DRAW_POINTS
    } else if (args.shading === 'wire') {
      this._drawMode = UsdImagingGLDrawMode.DRAW_WIREFRAME
    } else if (args.shading === 'wireOnSurface') {
      this._drawMode = UsdImagingGLDrawMode.DRAW_WIREFRAME_ON_SURFACE
    } else if (args.shading === 'flat') {
      this._drawMode = UsdImagingGLDrawMode.DRAW_SHADED_FLAT
    } else if (args.shading === 'smooth') {
      this._drawMode = UsdImagingGLDrawMode.DRAW_SHADED_SMOOTH
    } else {
      TF_WARN(`Shading mode ${args.shading} not supported!`)
    }

    this._cullStyle = UsdImagingGLCullStyle.CULL_STYLE_NOTHING
    if (args.cullStyle === 'nothing') {
      this._cullStyle = UsdImagingGLCullStyle.CULL_STYLE_NOTHING
    } else if (args.cullStyle === 'back') {
      this._cullStyle = UsdImagingGLCullStyle.CULL_STYLE_BACK
    } else if (args.cullStyle === 'front') {
      this._cullStyle = UsdImagingGLCullStyle.CULL_STYLE_FRONT
    } else if (args.cullStyle === 'backUnlessDoubleSided') {
      this._cullStyle = UsdImagingGLCullStyle.CULL_STYLE_BACK_UNLESS_DOUBLE_SIDED
    } else {
      TF_WARN(`Cull style ${args.cullStyle} not supported!`)
    }

    if (args.unresolvedStageFilePath !== '') {
      this._stageFilePath = args.unresolvedStageFilePath
    }

    // _widget = new UsdImagingGL_UnitTestWindow(this, widgetSize) and
    // _widget->Init(), which calls InitTest (OnInitializeGL).
    this._widgetSize = [...args.widgetSize]
    await this.initTest()

    if (this._times.length === 0) {
      this._times.push(-999)
    }

    if (args.complexities.length > 0) {
      const imageFilePath = this.getOutputFilePath()

      for (const complexity of args.complexities) {
        this._complexity = complexity
        if (imageFilePath !== '') {
          // std::stringstream << float: 6 significant digits.
          const suffix = `_${_StreamFloat(this._complexity)}.png`
          this._outputFilePath = imageFilePath.split('.png').join(suffix)
        }
        await this._drawOffscreen()
      }
    } else {
      // Offscreen, or the window's Run(): drawn offscreen once (see the
      // header).
      await this._drawOffscreen()
    }

    // _traceFile: not written (see the header).
    await this.shutdownTest()
  }

  /** unitTestGLDrawing.cpp:289-303 UsdImagingGL_UnitTestWindow::DrawOffscreen */
  private async _drawOffscreen(): Promise<void> {
    if (this.isEnabledTestPresentOutput()) {
      TF_CODING_ERROR('UsdImagingGL_UnitTestGLDrawing: the present-output '
        + 'test modes (client framebuffer) are not ported')
    }
    await this.drawTest(true)
  }
}

/** std::ostream << double with the default precision (6 significant
 *  digits, %g). */
export function _StreamFloat(v: number): string {
  if (v === 0) return '0'
  const exp = Math.floor(Math.log10(Math.abs(v)))
  if (exp < -5 || exp >= 6) {
    const s = v.toExponential(5).replace(/\.?0+e/, 'e')
    return s.replace(/e([+-])(\d)$/, 'e$10$2')
  }
  return String(Number(v.toPrecision(6)))
}

// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/testenv/testHdStInitRepr.cpp
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/testenv/testHdStInitRepr.cpp (OpenUSD
// 26.11.1): two render passes over the same prims with different reprs
// (refined, refinedWireOnSurf); a cube added between frames must get the
// repr of the pass that draws it next. Three 640x480 frames,
// <outputFilePrefix>_{0,1,2}.png.
//
// Divergences: as testHdStInstancing.ts (driver given its Hgi, RunTest is
// ParseArgs + InitTest + OffscreenTest, WriteToFile is ReadBackAov; Present
// not ported). OutputFrame awaits each readback before the next draw,
// as WriteToFile completes before upstream continues. std::cout lines go to
// the returned stdout.

import {
  Matrix4d as GfMatrix4d,
  Matrix4f as GfMatrix4f,
  Rect2i as GfRect2i,
  Vec2i as GfVec2i,
  Vec3d as GfVec3d,
  Vec3f as GfVec3f,
  Vec4f as GfVec4f,
} from 'typescript-usd/gf'
import {
  ReprSelector as HdReprSelector,
  ReprTokens as HdReprTokens,
  RprimCollection as HdRprimCollection,
  Tokens as HdTokens,
  type RenderPass as HdRenderPass,
} from 'typescript-usd/hd'
import { Framing as CameraUtilFraming } from 'typescript-usd/cameraUtil'
import type { Hgi } from 'typescript-usd/hgi'
import type { Token as TfToken } from 'typescript-usd/tf'
import { HdSt_TestDriver, type HdStTestAovReadback } from '../../src/unitTestHelper.ts'
import type { HdUnitTestDelegate } from '../../../hd/src/unitTestDelegate.ts'
import { HdSt_UnitTestGLDrawing } from './unitTestGLDrawing.ts'

/** testHdStInitRepr.cpp:19-42 */
export class My_TestGLDrawing extends HdSt_UnitTestGLDrawing {
  private _driver: HdSt_TestDriver | null = null
  private _delegate: HdUnitTestDelegate | null = null
  private _outputFilePrefix = ''
  private _renderPasses: HdRenderPass[] = []
  readonly stdout: string[] = []
  readonly images: { name: string, image: HdStTestAovReadback }[] = []

  /** testHdStInitRepr.cpp:46-55 */
  constructor(private readonly _hgi: Hgi) {
    super()
    this.setCameraRotate(60.0, 0.0)
    this.setCameraTranslate(new GfVec3f(0, 0, Math.fround(Math.fround(-20.0) - Math.fround(Math.fround(1.7320508) * 2.0))))
  }

  /** testHdStInitRepr.cpp:58-90 */
  initTest(): void {
    this.stdout.push('My_TestGLDrawing::InitTest()')

    this._driver = new HdSt_TestDriver(this._hgi, HdReprTokens.hull as TfToken)
    this._delegate = this._driver.getDelegate()

    const renderIndex = this._delegate.getRenderIndex()
    const renderDelegate = renderIndex.getRenderDelegate()

    const collections = [
      new HdRprimCollection(HdTokens.geometry as TfToken,
        new HdReprSelector(HdReprTokens.refined as TfToken)),
      new HdRprimCollection(HdTokens.geometry as TfToken,
        new HdReprSelector(HdReprTokens.refinedWireOnSurf as TfToken)),
    ]

    this._renderPasses[0] = renderDelegate.createRenderPass(renderIndex, collections[0]!) as HdRenderPass
    this._renderPasses[1] = renderDelegate.createRenderPass(renderIndex, collections[1]!) as HdRenderPass

    this._delegate.addCube('/Cube0', new GfMatrix4f(new GfMatrix4d(1).setTranslate(new GfVec3d(-3.0, 0.0, 0.0))))
    this._delegate.addCube('/Cube1', new GfMatrix4f(new GfMatrix4d(1).setTranslate(new GfVec3d(3.0, 0.0, 0.0))))

    this._driver.setClearColor(new GfVec4f(0.1, 0.1, 0.1, 1.0))
    this._driver.setClearDepth(1.0)
    this._driver.setupAovs(this.getWidth(), this.getHeight())
  }

  /** testHdStInitRepr.cpp:92-115 */
  async drawTest(): Promise<void> {
    const width = this.getWidth(), height = this.getHeight()
    // camera
    this._driver!.setCamera(this.getViewMatrix(), this.getProjectionMatrix(),
      new CameraUtilFraming(new GfRect2i(new GfVec2i(0, 0), width, height)))

    this._driver!.updateAovDimensions(width, height)

    await this.outputFrame(this._renderPasses[0]!, 0)

    const unitCube = new GfMatrix4f(1.0)
    this._delegate!.addCube('/AddedCube', unitCube)

    await this.outputFrame(this._renderPasses[1]!, 1)

    await this.outputFrame(this._renderPasses[0]!, 2)
  }

  /** testHdStInitRepr.cpp:117-121 */
  async offscreenTest(): Promise<void> {
    await this.drawTest()
  }

  /** testHdStInitRepr.cpp:124-136 (HdSt_UnitTestGLDrawing::ParseArgs is
   *  empty, unitTestGLDrawing.cpp:222-226) */
  override parseArgs(argv: readonly string[]): void {
    super.parseArgs(argv)
    for (let i = 0; i < argv.length; ++i) {
      if (argv[i] === '--outputFilePrefix') this._outputFilePrefix = argv[++i]!
    }
  }

  /** testHdStInitRepr.cpp:138-149 */
  async outputFrame(renderPass: HdRenderPass, outputNum: number): Promise<void> {
    const filename = `${this._outputFilePrefix}_${outputNum}.png`

    this._driver!.draw(renderPass, false)

    const image = await this._driver!.readBackAov('color')
    if (image) this.images.push({ name: filename, image })
  }
}

/** testHdStInitRepr.cpp:157-162 BasicTest. */
export async function BasicTest(hgi: Hgi, argv: readonly string[]): Promise<{ images: { name: string, image: HdStTestAovReadback }[], stdout: string }> {
  const drawing = new My_TestGLDrawing(hgi)
  drawing.parseArgs(argv)
  drawing.initTest()
  await drawing.offscreenTest()
  return { images: drawing.images, stdout: drawing.stdout.join('\n') }
}

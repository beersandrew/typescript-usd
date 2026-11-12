// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdSt/testenv/testHdStInstancingUnbalanced.cpp
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/testenv/testHdStInstancingUnbalanced.cpp
// (OpenUSD 26.11.1): a three-level instancer hierarchy whose instancers hold
// different numbers of prototypes and instances, drawn in a 640x480
// offscreen run.
//
// Divergences: as testHdStInstancing.ts (driver given its Hgi, RunTest is
// ParseArgs + InitTest + OffscreenTest, WriteToFile is ReadBackAov; Present
// not ported).

import {
  Matrix4f as GfMatrix4f,
  Rect2i as GfRect2i,
  Vec2i as GfVec2i,
  Vec3f as GfVec3f,
  Vec4f as GfVec4f,
} from 'typescript-usd/gf'
import { ReprTokens as HdReprTokens } from 'typescript-usd/hd'
import { Framing as CameraUtilFraming } from 'typescript-usd/cameraUtil'
import type { Hgi } from 'typescript-usd/hgi'
import type { Token as TfToken } from 'typescript-usd/tf'
import { HdSt_TestDriver, type HdStTestAovReadback } from '../../src/unitTestHelper.ts'
import { HdSt_UnitTestGLDrawing } from './unitTestGLDrawing.ts'

/** testHdStInstancingUnbalanced.cpp:20-39 */
export class My_TestGLDrawing extends HdSt_UnitTestGLDrawing {
  private _driver: HdSt_TestDriver | null = null
  private _reprName: string = HdReprTokens.hull
  private _refineLevel = 0
  private _outputFilePath = ''

  /** testHdStInstancingUnbalanced.cpp:43-49 */
  constructor(private readonly _hgi: Hgi) {
    super()
    this.setCameraRotate(60.0, 45.0)
    this.setCameraTranslate(new GfVec3f(-5, -5, -20))
  }

  /** testHdStInstancingUnbalanced.cpp:51-142 */
  initTest(): void {
    this._driver = new HdSt_TestDriver(this._hgi, this._reprName as TfToken)
    const delegate = this._driver.getDelegate()
    delegate.setRefineLevel(this._refineLevel)

    // create instancer hierarchy
    /*
          /i0
             |
             +--- proto1: cube1
             |
             +--- proto2: i1 (instancer)
                    |
                    +--- proto1: grid1
                    |
                    +--- proto2: i2 (instancer)
                           |
                           +--- proto1: grid2

     */

    const i0 = '/i0'
    const i1 = '/i0/i1'
    const i2 = '/i0/i1/i2'
    const cube = '/i0/cube'
    const grid1 = '/i0/i1/grid1'
    const grid2 = '/i0/i1/i2/grid2'
    delegate.addInstancer(i0)

    const properties = (n: number, translate: (i: number) => GfVec3f, prototype: (i: number) => number) => {
      const scale: GfVec3f[] = [], rotate: GfVec4f[] = [], translateArray: GfVec3f[] = [], prototypeIndex: number[] = []
      for (let i = 0; i < n; ++i) {
        scale.push(new GfVec3f(1, 1, 1))
        rotate.push(new GfVec4f(0, 0, 0, 0))
        translateArray.push(translate(i))
        prototypeIndex.push(prototype(i))
      }
      return [prototypeIndex, scale, rotate, translateArray] as const
    }

    delegate.setInstancerProperties(i0, ...properties(7, i => new GfVec3f(i * 3, 0, 0), i => i % 2)) // 0, 1, 0, 1

    // prototypes
    delegate.addCube(cube, new GfMatrix4f(1), false, i0)
    delegate.addInstancer(i1, i0)

    {
      delegate.setInstancerProperties(i1, ...properties(4, i => new GfVec3f(0, i * 3, 0), i => i % 2))

      // prototypes
      delegate.addGridWithFaceColor(grid1, 4, 4, new GfMatrix4f(1), true, false, i1)
      delegate.addInstancer(i2, i1)

      {
        delegate.setInstancerProperties(i2, ...properties(8, i => new GfVec3f(0, 0, -i), () => 0))

        // prototypes
        delegate.addGridWithVertexColor(grid2, 4, 4, new GfMatrix4f(1), true, false, i2)
      }
    }

    this._driver.setClearColor(new GfVec4f(0.1, 0.1, 0.1, 1.0))
    this._driver.setClearDepth(1.0)
    this._driver.setupAovs(this.getWidth(), this.getHeight())
  }

  /** testHdStInstancingUnbalanced.cpp:144-161 */
  drawTest(): void {
    const width = this.getWidth(), height = this.getHeight()
    this._driver!.setCamera(this.getViewMatrix(), this.getProjectionMatrix(),
      new CameraUtilFraming(new GfRect2i(new GfVec2i(0, 0), width, height)))
    this._driver!.updateAovDimensions(width, height)
    this._driver!.draw()
  }

  /** testHdStInstancingUnbalanced.cpp:163-171 */
  async offscreenTest(): Promise<HdStTestAovReadback | null> {
    this.drawTest()
    if (this._outputFilePath) return this._driver!.readBackAov('color')
    return null
  }

  /** testHdStInstancingUnbalanced.cpp:179-193 */
  override parseArgs(argv: readonly string[]): void {
    for (let i = 0; i < argv.length; ++i) {
      const arg = argv[i]!
      if (arg === '--repr') this._reprName = argv[++i]!
      else if (arg === '--refineLevel') this._refineLevel = parseInt(argv[++i]!, 10)
      else if (arg === '--write') this._outputFilePath = argv[++i]!
    }
  }

  getOutputFilePath(): string { return this._outputFilePath }
}

/** testHdStInstancingUnbalanced.cpp:195-200 BasicTest. */
export async function BasicTest(hgi: Hgi, argv: readonly string[]): Promise<{ images: { name: string, image: HdStTestAovReadback }[] }> {
  const drawing = new My_TestGLDrawing(hgi)
  drawing.parseArgs(argv)
  drawing.initTest()
  const image = await drawing.offscreenTest()
  return { images: image ? [{ name: drawing.getOutputFilePath(), image }] : [] }
}

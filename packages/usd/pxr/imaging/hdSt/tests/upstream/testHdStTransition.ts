// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/testenv/testHdStTransition.cpp
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/testenv/testHdStTransition.cpp (OpenUSD
// 26.11.1): HdUnitTestDelegate's basic test set drawn through a scripted
// sequence of changes (`-c` commands: draw, repr=, refineLevel=, animate=,
// clipPlane=), one image <outputFilePrefix>_<n>.png per draw after the
// first, in a 640x480 offscreen run.
//
// Divergences: as testHdStInstancing.ts (driver given its Hgi, RunTest is
// ParseArgs + InitTest + OffscreenTest, WriteToFile is ReadBackAov, awaited
// before the next command; KeyRelease and Present, interactive only, are
// not ported). std::cout and std::cerr lines go to the returned stdout.
// g_time is a module static upstream (one run per process); it is a member
// here so that several runs in one page each start at 0.

import {
  Rect2i as GfRect2i,
  Vec2i as GfVec2i,
  Vec3f as GfVec3f,
  Vec4d as GfVec4d,
  Vec4f as GfVec4f,
} from 'typescript-usd/gf'
import { ReprSelector as HdReprSelector } from 'typescript-usd/hd'
import { Framing as CameraUtilFraming } from 'typescript-usd/cameraUtil'
import type { Hgi } from 'typescript-usd/hgi'
import type { Token as TfToken } from 'typescript-usd/tf'
import { HdSt_TestDriver, type HdStTestAovReadback } from '../../src/unitTestHelper.ts'
import { HdSt_UnitTestGLDrawing } from './unitTestGLDrawing.ts'

/** testHdStTransition.cpp:32-36: returns true when need to pause/draw. */
type Cmd = (drawing: My_TestGLDrawing, driver: HdSt_TestDriver) => boolean

/** std::ostream << GfVec4d */
const vec4dText = (v: GfVec4d) => `(${[0, 1, 2, 3].map(i => String(v.get(i))).join(', ')})`

/** testHdStTransition.cpp:21-120 */
export class My_TestGLDrawing extends HdSt_UnitTestGLDrawing {
  private _driver: HdSt_TestDriver | null = null
  private _reprName = ''
  private _refineLevel = 0
  private _outputFilePrefix = ''
  private _commands: Cmd[] = []
  private _nextCommand = 0
  private _time = 0.0
  readonly stdout: string[] = []
  readonly images: { name: string, image: HdStTestAovReadback }[] = []

  /** testHdStTransition.cpp:23-26 */
  constructor(private readonly _hgi: Hgi) {
    super()
    this.setCameraRotate(60.0, 0.0)
    this.setCameraTranslate(new GfVec3f(0, 0, Math.fround(Math.fround(-20.0) - Math.fround(Math.fround(1.7320508) * 2.0))))
  }

  /** testHdStTransition.cpp:43-48 DrawCmd */
  static drawCmd(): Cmd { return () => true }

  /** testHdStTransition.cpp:50-60 ChangeReprCmd */
  static changeReprCmd(reprName: string): Cmd {
    return (drawing, driver) => {
      drawing.stdout.push(`Set repr to ${reprName}`)
      driver.setRepr(new HdReprSelector(reprName as TfToken))
      return false
    }
  }

  /** testHdStTransition.cpp:62-72 ChangeRefineLevelCmd */
  static changeRefineLevelCmd(level: number): Cmd {
    return (drawing, driver) => {
      drawing.stdout.push(`Set refine level to ${level}`)
      driver.getDelegate().setRefineLevel(level)
      return false
    }
  }

  /** testHdStTransition.cpp:74-88 AddClipPlaneCmd */
  static addClipPlaneCmd(clipPlane: GfVec4d): Cmd {
    return (drawing, driver) => {
      drawing.stdout.push(`Add clip plane ${vec4dText(clipPlane)}`)
      const clipPlanes = [...driver.getRenderPassState().getClipPlanes()]
      clipPlanes.push(clipPlane)
      driver.setCameraClipPlanes(clipPlanes)
      return false
    }
  }

  /** testHdStTransition.cpp:90-100 AnimateCmd */
  static animateCmd(name: string): Cmd {
    return (drawing, driver) => {
      drawing.stdout.push(`Animate ${name}`)
      driver.getDelegate().updatePositions(name, drawing._time)
      return false
    }
  }

  /** testHdStTransition.cpp:122-139 */
  initTest(): void {
    this.stdout.push('My_TestGLDrawing::InitTest()')

    this._driver = new HdSt_TestDriver(this._hgi, this._reprName as TfToken)
    const delegate = this._driver.getDelegate()
    delegate.setRefineLevel(this._refineLevel)

    const center = delegate.populateBasicTestSet()

    // center camera
    const t = this.getCameraTranslate()
    this.setCameraTranslate(new GfVec3f(t.get(0) - center.get(0), t.get(1) - center.get(1), t.get(2) - center.get(2)))

    this._driver.setClearColor(new GfVec4f(0.1, 0.1, 0.1, 1.0))
    this._driver.setClearDepth(1.0)
    this._driver.setupAovs(this.getWidth(), this.getHeight())
  }

  /** testHdStTransition.cpp:141-157 */
  drawTest(): void {
    const width = this.getWidth(), height = this.getHeight()
    this._driver!.setCamera(this.getViewMatrix(), this.getProjectionMatrix(),
      new CameraUtilFraming(new GfRect2i(new GfVec2i(0, 0), width, height)))
    this._driver!.updateAovDimensions(width, height)
    this._driver!.draw()
  }

  /** testHdStTransition.cpp:159-177 */
  async offscreenTest(): Promise<void> {
    // TF_VERIFY(!_outputFilePrefix.empty())
    if (!this._outputFilePrefix) throw new Error('TF_VERIFY failed: !_outputFilePrefix.empty()')

    this.drawTest()

    let count = 0
    while (this.next()) {
      this.drawTest()

      const filename = `${this._outputFilePrefix}_${count++}.png`
      const image = await this._driver!.readBackAov('color')
      if (image) this.images.push({ name: filename, image })
    }
  }

  /** testHdStTransition.cpp:185-195 */
  private next(): boolean {
    this._time = Math.fround(this._time + 1.0)

    while (this._nextCommand < this._commands.length) {
      if (this._commands[this._nextCommand++]!(this, this._driver!)) return true
    }
    return false
  }

  /** testHdStTransition.cpp:203-261 */
  override parseArgs(argv: readonly string[]): void {
    for (let i = 0; i < argv.length; ++i) {
      const arg = argv[i]!
      if (arg === '--outputFilePrefix') {
        this._outputFilePrefix = argv[++i]!
      } else if (arg === '--repr') {
        this._reprName = argv[++i]!
      } else if (arg === '--refineLevel') {
        this._refineLevel = parseInt(argv[++i]!, 10)
      } else if (arg === '--cmd' || arg === '-c') {
        //
        // csv commands
        //    draw               force draw (or save the image)
        //    repr=<repr>        switch to <repr>
        //    refineLevel=<int>  set global refinement level
        //    animate=<id>       move the positions of <id> mesh
        //    clipPlane=x:y:z:w  add clip plane
        //
        for (const field of argv[++i]!.split(',')) {
          const n = field.indexOf('=')
          const cmd = n < 0 ? field : field.slice(0, n)
          const value = n < 0 ? '' : field.slice(n + 1)
          if (cmd === 'draw') {
            this._commands.push(My_TestGLDrawing.drawCmd())
          } else if (cmd === 'repr') {
            this._commands.push(My_TestGLDrawing.changeReprCmd(value))
          } else if (cmd === 'refineLevel') {
            this._commands.push(My_TestGLDrawing.changeRefineLevelCmd(parseInt(value, 10)))
          } else if (cmd === 'clipPlane') {
            // sscanf "%f:%f:%f:%f", then GfVec4d(GfVec4f(cp))
            const cp = value.split(':').map(v => Math.fround(Number.parseFloat(v)))
            this._commands.push(My_TestGLDrawing.addClipPlaneCmd(new GfVec4d(cp[0]!, cp[1]!, cp[2]!, cp[3]!)))
          } else if (cmd === 'animate') {
            this._commands.push(My_TestGLDrawing.animateCmd(value))
          } else {
            this.stdout.push(`Unknown command : ${cmd}`)
            return
          }
        }
      }
    }
  }
}

/** testHdStTransition.cpp:263-268 BasicTest. */
export async function BasicTest(hgi: Hgi, argv: readonly string[]): Promise<{ images: { name: string, image: HdStTestAovReadback }[], stdout: string }> {
  const drawing = new My_TestGLDrawing(hgi)
  drawing.parseArgs(argv)
  drawing.initTest()
  await drawing.offscreenTest()
  return { images: drawing.images, stdout: drawing.stdout.join('\n') }
}

// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdx/testenv/testHdxUnpickablesAsOccluders.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdx/testenv/testHdxUnpickablesAsOccluders.cpp
// (OpenUSD 26.11.1), registered as `testHdxUnpickablesAsOccluders
// --offscreen` (hdx/CMakeLists.txt:366). Browser test program
// (tests/browser/hdx-image/run.mjs); the native captures of its images are
// hdx/tests/fixtures/testenvImages/testHdxUnpickablesAsOccluders/.
//
// Divergences: no window (HdSt_UnitTestGLDrawing offscreen run of 640x480;
// the Marquee and the mouse handlers of the interactive mode are not
// ported); Hgi is given; the driver's writes are asynchronous. Returns the
// exit status and stdout instead of exiting.

import { Token as TfToken, TfErrorMark, Type as TfType } from 'typescript-usd/tf'
import {
  Matrix4d as GfMatrix4d,
  Vec2i as GfVec2i,
  Vec3f as GfVec3f,
  Vec4d as GfVec4d,
  Vec4f as GfVec4f,
  type Frustum as GfFrustum,
} from 'typescript-usd/gf'
import { Value as VtValue } from 'typescript-usd/vt'
import {
  ReprSelector as HdReprSelector,
  ReprTokens as HdReprTokens,
  RprimCollection as HdRprimCollection,
  SelectionHighlightMode as HdSelectionHighlightMode,
  Tokens as HdTokens,
  type RenderIndex as HdRenderIndex,
  type Selection as HdSelection,
  type Task as HdTask,
} from 'typescript-usd/hd'
import type { Hgi } from 'typescript-usd/hgi'
import { _TestDriverBase as HdSt_TestDriverBase } from 'typescript-usd/hdSt'
import { HdSt_UnitTestGLDrawing } from '../../../hdSt/tests/upstream/unitTestGLDrawing.ts'
import {
  HdxPickTaskContextParams,
  HdxPickTaskContextParamsType,
  HdxPickTokens,
  type HdxPickTask,
  type HdxPickHit,
} from '../../src/pickTask.ts'
import { HdxRenderTaskParams, HdxRenderTaskParamsType } from '../../src/renderSetupTask.ts'
import { HdxSelectionTaskParams, HdxSelectionTaskParamsType } from '../../src/selectionTask.ts'
import { HdxSelectionTracker } from '../../src/selectionTracker.ts'
import { HdxTokens } from '../../src/tokens.ts'
import { Hdx_UnitTestDelegate } from '../../src/unitTestDelegate.ts'
import { HdxUnitTestUtils } from '../../src/unitTestUtils.ts'
import { TF_VERIFY } from '../../src/tfDiagnostic.ts'

const _HdRprimCollectionType = TfType.declare('HdRprimCollection')

/** testHdxUnpickablesAsOccluders.cpp:28-32 */
const _tokens = {
  pickables: TfToken('pickables'),
}

/** testHdxUnpickablesAsOccluders.cpp:34-53 */
class Hdx_TestDriver extends HdSt_TestDriverBase<Hdx_UnitTestDelegate> {
  // std::cout of the program.
  stdout = ''
  private _pickablesCol = new HdRprimCollection()

  /** testHdxUnpickablesAsOccluders.cpp:55-58 */
  constructor(hgi: Hgi) {
    super(hgi)
    this._init(new HdReprSelector(HdReprTokens.hull))
  }

  protected override _newSceneDelegate(renderIndex: HdRenderIndex): Hdx_UnitTestDelegate {
    return new Hdx_UnitTestDelegate(renderIndex)
  }

  /** hdSt/unitTestHelper.h:401-445 (HdSt_TestDriverBase::WriteToFile): the
   *  AOV's render buffer written through HioImage, which is what
   *  Hdx_UnitTestDelegate::WriteRenderBufferToFile does for a render buffer
   *  of its render index (asynchronous here, see unitTestDelegate.ts). */
  writeToFile(attachment: string, imagePath: string): Promise<boolean> {
    return this.getDelegate().writeRenderBufferToFile(this._getAovPath(attachment), imagePath)
  }

  /** testHdxUnpickablesAsOccluders.cpp:60-97 */
  protected override _init(reprSelector: HdReprSelector): void {
    this._setupSceneDelegate()

    const delegate = this.getDelegate()

    // prepare render task
    const renderSetupTask = '/renderSetupTask'
    const renderTask = '/renderTask'
    const selectionTask = '/selectionTask'
    const pickTask = '/pickTask'
    delegate.addRenderSetupTask(renderSetupTask)
    delegate.addRenderTask(renderTask)
    delegate.addSelectionTask(selectionTask)
    delegate.addPickTask(pickTask)

    // render task parameters.
    const vParam = delegate.getTaskParam(renderSetupTask, HdTokens.params)
    const param = vParam.Get<HdxRenderTaskParams>().Clone()
    param.enableLighting = true // use default lighting
    delegate.setTaskParam(renderSetupTask, HdTokens.params,
      VtValue.create(param, HdxRenderTaskParamsType))
    delegate.setTaskParam(renderTask, HdTokens.collection,
      VtValue.create(new HdRprimCollection(HdTokens.geometry, reprSelector),
        _HdRprimCollectionType))

    const selParam = new HdxSelectionTaskParams()
    selParam.enableSelectionHighlight = true
    selParam.selectionColor = new GfVec4f(1, 1, 0, 1)
    selParam.locateColor = new GfVec4f(1, 0, 1, 1)
    delegate.setTaskParam(selectionTask, HdTokens.params,
      VtValue.create(selParam, HdxSelectionTaskParamsType))

    // picking
    this._pickablesCol = new HdRprimCollection(_tokens.pickables, reprSelector)
    // We have to unfortunately explictly add collections besides 'geometry'
    // See HdRenderIndex constructor.
    delegate.getRenderIndex().getChangeTracker().addCollection(
      _tokens.pickables)
  }

  /** testHdxUnpickablesAsOccluders.cpp:99-122 */
  drawWithSelection(viewport: GfVec4d, selTracker: HdxSelectionTracker): void {
    const renderSetupTask = '/renderSetupTask'
    const renderTask = '/renderTask'
    const selectionTask = '/selectionTask'

    const param = this.getDelegate().getTaskParam(
      renderSetupTask, HdTokens.params).Get<HdxRenderTaskParams>().Clone()
    param.viewport = viewport
    param.aovBindings = this._aovBindings
    this.getDelegate().setTaskParam(
      renderSetupTask, HdTokens.params, VtValue.create(param, HdxRenderTaskParamsType))

    const index = this.getDelegate().getRenderIndex()
    const tasks: HdTask[] = []
    tasks.push(index.getTask(renderSetupTask)!)
    tasks.push(index.getTask(renderTask)!)
    tasks.push(index.getTask(selectionTask)!)

    this._getEngine().setTaskContextData(HdxTokens.selectionState, selTracker)
    this._getEngine().Execute(index, tasks)
  }

  /** testHdxUnpickablesAsOccluders.cpp:124-150 */
  async pick(startPos: GfVec2i, endPos: GfVec2i, width: number, height: number,
    frustum: GfFrustum, viewMatrix: GfMatrix4d, doUnpickablesOcclude: boolean): Promise<HdSelection> {
    const allHits: HdxPickHit[] = []
    const p = new HdxPickTaskContextParams()
    p.resolution = HdxUnitTestUtils.calculatePickResolution(
      startPos, endPos, new GfVec2i(4, 4))
    p.resolveMode = HdxPickTokens.resolveUnique
    p.doUnpickablesOcclude = doUnpickablesOcclude
    p.viewMatrix = viewMatrix
    p.projectionMatrix = HdxUnitTestUtils.computePickingProjectionMatrix(
      startPos, endPos, new GfVec2i(width, height), frustum)
    p.collection = this._pickablesCol
    p.outHits = allHits

    const tasks: HdTask[] = []
    const pickTask = this.getDelegate().getRenderIndex().getTask('/pickTask') as HdxPickTask
    tasks.push(pickTask)
    this._getEngine().setTaskContextData(HdxPickTokens.pickParams,
      VtValue.create(p, HdxPickTaskContextParamsType))
    this._getEngine().Execute(this.getDelegate().getRenderIndex(), tasks)
    // The hits are resolved when the ID readback completes (pickTask.ts).
    await pickTask.getPendingResolve()

    return HdxUnitTestUtils.translateHitsToSelection(
      p.pickTarget, HdSelectionHighlightMode.HighlightModeSelect, allHits,
      line => { this.stdout += line + '\n' })
  }

  /** testHdxUnpickablesAsOccluders.cpp:152-156 */
  setUnpickable(excludePaths: readonly string[]): void {
    this._pickablesCol.setExcludePaths([...excludePaths])
  }
}

/** testHdxUnpickablesAsOccluders.cpp:199-205 */
function _GetTranslate(tx: number, ty: number, tz: number): GfMatrix4d {
  const m = new GfMatrix4d(1.0)
  m.setRow(3, new GfVec4d(Math.fround(tx), Math.fround(ty), Math.fround(tz), 1.0))
  return m
}

/** testHdxUnpickablesAsOccluders.cpp:160-195 */
class My_TestGLDrawing extends HdSt_UnitTestGLDrawing {
  private _driver: Hdx_TestDriver | null = null
  private _selTracker: HdxSelectionTracker | null = null
  get stdout(): string { return this._driver?.stdout ?? '' }

  constructor(private readonly _hgi: Hgi) {
    super()
    this.setCameraRotate(0, 0)
    this.setCameraTranslate(new GfVec3f(0, 0, 0))
  }

  /** testHdxUnpickablesAsOccluders.cpp:207-223 */
  initTest(): void {
    this._driver = new Hdx_TestDriver(this._hgi)

    this._selTracker = new HdxSelectionTracker()

    // prepare scene
    this._initScene()
    this.setCameraTranslate(new GfVec3f(0, 0, -20))

    this._driver.setClearColor(new GfVec4f(0.1, 0.1, 0.1, 1.0))
    this._driver.setClearDepth(1.0)
    this._driver.setupAovs(this.getWidth(), this.getHeight())
  }

  /** testHdxUnpickablesAsOccluders.cpp:231-238 */
  private _initScene(): void {
    const delegate = this._driver!.getDelegate()

    delegate.addCube('/cube0', _GetTranslate(0, 0, 0))
    delegate.addCube('/cube1', _GetTranslate(0, 5, 1))
  }

  /** testHdxUnpickablesAsOccluders.cpp:240-246 */
  private _pick(startPos: GfVec2i, endPos: GfVec2i, doUnpickablesOcclude: boolean): Promise<HdSelection> {
    return this._driver!.pick(startPos, endPos, this.getWidth(), this.getHeight(),
      this.getFrustum(), this.getViewMatrix(), doUnpickablesOcclude)
  }

  /** testHdxUnpickablesAsOccluders.cpp:248-253 */
  drawTest(): void {
    this.drawScene()
  }

  /** testHdxUnpickablesAsOccluders.cpp:255-280 */
  async offscreenTest(): Promise<void> {
    const driver = this._driver!
    const selTracker = this._selTracker!
    const write = (file: string) => driver.writeToFile('color', file)

    this.drawScene()
    await write('color1_unselected.png')

    // select cube0
    let selection = await this._pick(new GfVec2i(319, 221), new GfVec2i(320, 222), false)
    selTracker.setSelection(selection)
    this.drawScene()
    await write('color2_cube0_pickable.png')
    const mode = HdSelectionHighlightMode.HighlightModeSelect

    TF_VERIFY(selection.getSelectedPrimPaths(mode).length === 1)
    TF_VERIFY(selection.getSelectedPrimPaths(mode)[0] === '/cube0')

    // make cube0 unpickable; it should not let us pick cube1 since it occludes
    driver.setUnpickable(['/cube0'])

    selection = await this._pick(new GfVec2i(319, 221), new GfVec2i(320, 222), true)
    selTracker.setSelection(selection)
    this.drawScene()
    await write('color3_cube0_unpickable.png')
    TF_VERIFY(selection.getSelectedPrimPaths(mode).length === 0)
  }

  /** testHdxUnpickablesAsOccluders.cpp:282-299 */
  drawScene(): void {
    const width = this.getWidth(), height = this.getHeight()

    const viewMatrix = this.getViewMatrix()
    const frustum = this.getFrustum()

    const viewport = new GfVec4d(0, 0, width, height)

    const projMatrix = frustum.computeProjectionMatrix()
    this._driver!.getDelegate().setCamera(viewMatrix, projMatrix)

    this._driver!.updateAovDimensions(width, height)

    this._driver!.drawWithSelection(viewport, this._selTracker!)
  }
}

/** testHdxUnpickablesAsOccluders.cpp:342-363 (BasicTest, main) with the
 *  registered argv `--offscreen`. */
export async function main(hgi: Hgi, argv: readonly string[] = ['--offscreen'])
  : Promise<{ status: number, stdout: string }> {
  const mark = new TfErrorMark()

  const driver = new My_TestGLDrawing(hgi)
  driver.parseArgs(argv)
  driver.initTest()
  await driver.offscreenTest()

  if (mark.isClean()) {
    return { status: 0, stdout: driver.stdout + 'OK\n' }
  } else {
    return { status: 1, stdout: driver.stdout + 'FAILED\n' }
  }
}

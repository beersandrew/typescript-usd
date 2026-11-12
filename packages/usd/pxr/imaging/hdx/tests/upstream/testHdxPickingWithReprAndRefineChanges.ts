// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdx/testenv/testHdxPickingWithReprAndRefineChanges.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdx/testenv/testHdxPickingWithReprAndRefineChanges.cpp
// (OpenUSD 26.11.1), registered as `testHdxPickingWithReprAndRefineChanges
// --offscreen` (hdx/CMakeLists.txt:331). Browser test program
// (tests/browser/hdx-image/run.mjs); the native captures of its images are
// hdx/tests/fixtures/testenvImages/testHdxPickingWithReprAndRefineChanges/.
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

/** testHdxPickingWithReprAndRefineChanges.cpp:28-32 */
const _tokens = {
  pickables: TfToken('pickables'),
}

/** testHdxPickingWithReprAndRefineChanges.cpp:34-51 */
class Hdx_TestDriver extends HdSt_TestDriverBase<Hdx_UnitTestDelegate> {
  // std::cout of the program.
  stdout = ''
  private _pickablesCol = new HdRprimCollection()

  /** testHdxPickingWithReprAndRefineChanges.cpp:53-56 */
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

  /** testHdxPickingWithReprAndRefineChanges.cpp:58-102 */
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
    // picking related init
    // The collection used for the ID render defaults to including the root path
    // which essentially means that all scene graph prims are pickable.
    //
    // Worth noting that the collection's repr is set to refined (and not
    // hull). When a prim has an authored repr, we'll use that instead, as
    // the collection's forcedRepr defaults to false.
    this._pickablesCol = new HdRprimCollection(_tokens.pickables,
      new HdReprSelector(HdReprTokens.refined))
    // We have to unfortunately explictly add collections besides 'geometry'
    // See HdRenderIndex constructor.
    delegate.getRenderIndex().getChangeTracker().addCollection(
      _tokens.pickables)
  }

  /** testHdxPickingWithReprAndRefineChanges.cpp:104-127 */
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

  /** testHdxPickingWithReprAndRefineChanges.cpp:129-154 */
  async pick(startPos: GfVec2i, endPos: GfVec2i, width: number, height: number,
    frustum: GfFrustum, viewMatrix: GfMatrix4d): Promise<HdSelection> {
    const allHits: HdxPickHit[] = []
    const p = new HdxPickTaskContextParams()
    p.resolution = HdxUnitTestUtils.calculatePickResolution(
      startPos, endPos, new GfVec2i(4, 4))
    p.resolveMode = HdxPickTokens.resolveUnique
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
}

/** testHdxPickingWithReprAndRefineChanges.cpp:195-201 */
function _GetTranslate(tx: number, ty: number, tz: number): GfMatrix4d {
  const m = new GfMatrix4d(1.0)
  m.setRow(3, new GfVec4d(Math.fround(tx), Math.fround(ty), Math.fround(tz), 1.0))
  return m
}

/** testHdxPickingWithReprAndRefineChanges.cpp:158-191 */
class My_TestGLDrawing extends HdSt_UnitTestGLDrawing {
  private _driver: Hdx_TestDriver | null = null
  private _selTracker: HdxSelectionTracker | null = null
  get stdout(): string { return this._driver?.stdout ?? '' }
  set stdout(v: string) { this._driver!.stdout = v }

  constructor(private readonly _hgi: Hgi) {
    super()
    this.setCameraRotate(0, 0)
    this.setCameraTranslate(new GfVec3f(0, 0, 0))
  }

  /** testHdxPickingWithReprAndRefineChanges.cpp:203-219 */
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

  /** testHdxPickingWithReprAndRefineChanges.cpp:227-234 */
  private _initScene(): void {
    const delegate = this._driver!.getDelegate()

    delegate.addCube('/cube1', _GetTranslate(-5, 0, 5))
    delegate.addCube('/cube2', _GetTranslate(-5, 0, -5))
  }

  /** testHdxPickingWithReprAndRefineChanges.cpp:236-241 */
  private _pick(startPos: GfVec2i, endPos: GfVec2i): Promise<HdSelection> {
    return this._driver!.pick(startPos, endPos, this.getWidth(), this.getHeight(),
      this.getFrustum(), this.getViewMatrix())
  }

  /** testHdxPickingWithReprAndRefineChanges.cpp:243-248 */
  drawTest(): void {
    this.drawScene()
  }

  /** testHdxPickingWithReprAndRefineChanges.cpp:250-359 */
  async offscreenTest(): Promise<void> {
    const driver = this._driver!
    const delegate = driver.getDelegate()
    const selTracker = this._selTracker!
    const write = (file: string) => driver.writeToFile('color', file)

    this.drawScene()
    await write('color1_unselected.png')

    // This test uses 2 collections:
    // (i)  geometry
    // (ii) pickables
    // Picking in this test uses the 'refined' repr. See the collection
    // created in Pick(..) for additional notes.
    // (testHdxPickingWithReprAndRefineChanges.cpp:258-283 for the cases.)

    const mode = HdSelectionHighlightMode.HighlightModeSelect
    let selection: HdSelection

    // (a)
    {
      this.stdout += 'Changing refine level of cube1\n'
      delegate.setRefineLevel('/cube1', 2)
      // Since we're not overriding the scene repr, cube1 will still
      // appear unrefined, since it defaults to the hull repr.
      // However, the picking collection will render the refined version, and
      // we won't be able to select cube1 by picking the unrefined version's
      // left top corner.
      selection = await this._pick(new GfVec2i(138, 60), new GfVec2i(138, 60))
      selTracker.setSelection(selection)
      this.drawScene()
      await write('color2_refine_wont_change_cube1.png')
      TF_VERIFY(selection.getSelectedPrimPaths(mode).length === 0)
    }

    // (b)
    {
      this.stdout += 'Changing repr for cube2\n'
      delegate.setReprName('/cube2', HdReprTokens.refinedWireOnSurf)

      selection = await this._pick(new GfVec2i(152, 376), new GfVec2i(152, 376))
      selTracker.setSelection(selection)
      this.drawScene()
      await write('color3_repr_change_cube2.png')
      TF_VERIFY(selection.getSelectedPrimPaths(mode).length === 1)
      TF_VERIFY(selection.getSelectedPrimPaths(mode)[0] === '/cube2')
    }

    // (c)
    {
      this.stdout += 'Changing repr on cube1\n'

      delegate.setReprName('/cube1', HdReprTokens.refinedWire)

      selection = await this._pick(new GfVec2i(176, 96), new GfVec2i(179, 99))
      selTracker.setSelection(selection)
      this.drawScene()
      await write('color4_repr_and_refine_change_cube1.png')
      TF_VERIFY(selection.getSelectedPrimPaths(mode).length === 1)
      TF_VERIFY(selection.getSelectedPrimPaths(mode)[0] === '/cube1')
    }

    // (d)
    {
      this.stdout += '## Changing refine level of cube2 ##\n'
      delegate.setRefineLevel('/cube2', 3)

      selection = await this._pick(new GfVec2i(152, 376), new GfVec2i(152, 376))
      selTracker.setSelection(selection)
      this.drawScene()
      await write('color5_refine_change_cube2.png')
      TF_VERIFY(selection.getSelectedPrimPaths(mode)[0] === '/cube2')
    }

    // deselect
    selection = await this._pick(new GfVec2i(0, 0), new GfVec2i(0, 0))
    selTracker.setSelection(selection)
    this.drawScene()
    await write('color6_unselected.png')
  }

  /** testHdxPickingWithReprAndRefineChanges.cpp:361-377 */
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

/** testHdxPickingWithReprAndRefineChanges.cpp:420-441 (BasicTest, main) with the
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

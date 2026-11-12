// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdx/testenv/testHdxPickResolveMode.cpp
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdx/testenv/testHdxPickResolveMode.cpp (OpenUSD
// 26.11.1). Browser test program (tests/browser/hdx-image/run.mjs).
//
// The program's TF_VERIFYs hard-code GL hit counts; the reference build
// (hgiMetal) prints different ones and exits 1 (the native stdout is
// recorded in fixtures/testenvImages/testHdxPickResolveMode/capture.json).
// The ported program checks the same TF_VERIFYs and prints the same lines,
// so its stdout is compared with the native one, and its exit status with
// the native 1.
//
// Divergences: no window (offscreen only; the Marquee, mouse handlers,
// DrawTest and Present are not ported); Hgi is given; the pick resolve is
// asynchronous (HdxPickTask::GetPendingResolve, pickTask.ts header), so
// Pick and OffscreenTest are async; the stdout lines go to the returned
// stdout. The native run's first lines name the GPU (printed by the GL
// debug window); they are not printed here.

import { TfErrorMark, Token as TfToken, Type as TfType } from 'typescript-usd/tf'
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
  CullStyle as HdCullStyle,
  HdMeshRprim as HdMesh,
  MeshGeomStyle as HdMeshGeomStyle,
  MeshReprDesc as HdMeshReprDesc,
  MeshReprDescTokens as HdMeshReprDescTokens,
  ReprSelector as HdReprSelector,
  ReprTokens as HdReprTokens,
  RprimCollection as HdRprimCollection,
  Selection as HdSelection,
  Tokens as HdTokens,
  type RenderIndex as HdRenderIndex,
  type Task as HdTask,
} from 'typescript-usd/hd'
import { HgiTokens, type Hgi } from 'typescript-usd/hgi'
import { _TestDriverBase as HdSt_TestDriverBase } from 'typescript-usd/hdSt'
import { HdSt_UnitTestGLDrawing } from '../../../hdSt/tests/upstream/unitTestGLDrawing.ts'
import {
  HdxPickTask,
  HdxPickTaskContextParams,
  HdxPickTokens,
  type HdxPickHitVector,
} from '../../src/pickTask.ts'
import { HdxRenderTaskParams, HdxRenderTaskParamsType } from '../../src/renderSetupTask.ts'
import { HdxSelectionTaskParams, HdxSelectionTaskParamsType } from '../../src/selectionTask.ts'
import { HdxSelectionTracker } from '../../src/selectionTracker.ts'
import { HdxTokens } from '../../src/tokens.ts'
import { Hdx_UnitTestDelegate } from '../../src/unitTestDelegate.ts'
import { HdxUnitTestUtils } from '../../src/unitTestUtils.ts'
import { TF_VERIFY } from '../../src/tfDiagnostic.ts'

const _HdRprimCollectionType = TfType.declare('HdRprimCollection')

/** testHdxPickResolveMode.cpp:31-37 */
const _tokens = {
  meshPoints: TfToken('meshPoints'),
  pickables: TfToken('pickables'),
}

/** testHdxPickResolveMode.cpp:39-60 */
class Hdx_TestDriver extends HdSt_TestDriverBase<Hdx_UnitTestDelegate> {
  private _pickablesCol = new HdRprimCollection()

  /** testHdxPickResolveMode.cpp:62-65 */
  constructor(hgi: Hgi, reprName: string) {
    super(hgi)
    this._init(new HdReprSelector(reprName))
  }

  protected override _newSceneDelegate(renderIndex: HdRenderIndex): Hdx_UnitTestDelegate {
    return new Hdx_UnitTestDelegate(renderIndex)
  }

  /** testHdxPickResolveMode.cpp:67-115 */
  protected override _init(_reprSelector: HdReprSelector): void {
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

    // Add a meshPoints repr since it isn't populated in
    // HdRenderIndex::_ConfigureReprs
    HdMesh.configureRepr(_tokens.meshPoints,
      new HdMeshReprDesc(HdMeshGeomStyle.HdMeshGeomStylePoints,
        HdCullStyle.HdCullStyleNothing,
        HdMeshReprDescTokens.pointColor,
        /*flatShadingEnabled=*/true,
        /*blendWireframeColor=*/false))

    // Use wireframe and enable points for edge and point picking.
    const sceneReprSel = new HdReprSelector(HdReprTokens.wireOnSurf,
      HdReprTokens.disabled,
      _tokens.meshPoints)

    // render task parameters.
    const vParam = delegate.getTaskParam(renderSetupTask, HdTokens.params)
    const param = vParam.Get<HdxRenderTaskParams>().Clone()
    param.enableLighting = true // use default lighting
    delegate.setTaskParam(renderSetupTask, HdTokens.params,
      VtValue.create(param, HdxRenderTaskParamsType))
    delegate.setTaskParam(renderTask, HdTokens.collection,
      VtValue.create(new HdRprimCollection(HdTokens.geometry, sceneReprSel), _HdRprimCollectionType))

    const selParam = new HdxSelectionTaskParams()
    selParam.enableSelectionHighlight = true
    selParam.selectionColor = new GfVec4f(1, 1, 0, 1)
    selParam.locateColor = new GfVec4f(1, 0, 1, 1)
    delegate.setTaskParam(selectionTask, HdTokens.params,
      VtValue.create(selParam, HdxSelectionTaskParamsType))

    // picking
    this._pickablesCol = new HdRprimCollection(_tokens.pickables, sceneReprSel)
    // We have to unfortunately explictly add collections besides 'geometry'
    // See HdRenderIndex constructor.
    delegate.getRenderIndex().getChangeTracker().addCollection(_tokens.pickables)
  }

  /** testHdxPickResolveMode.cpp:117-141 */
  drawWithSelection(viewport: GfVec4d, selTracker: HdxSelectionTracker): void {
    const renderSetupTask = '/renderSetupTask'
    const renderTask = '/renderTask'
    const selectionTask = '/selectionTask'

    const param = this.getDelegate().getTaskParam(
      renderSetupTask, HdTokens.params).Get<HdxRenderTaskParams>().Clone()
    param.viewport = viewport
    param.aovBindings = this._aovBindings
    this.getDelegate().setTaskParam(renderSetupTask, HdTokens.params,
      VtValue.create(param, HdxRenderTaskParamsType))

    const index = this.getDelegate().getRenderIndex()
    const tasks: HdTask[] = [
      index.getTask(renderSetupTask)!,
      index.getTask(renderTask)!,
      index.getTask(selectionTask)!,
    ]

    this._getEngine().setTaskContextData(HdxTokens.selectionState, selTracker)
    this._getEngine().Execute(index, tasks)
  }

  /** testHdxPickResolveMode.cpp:143-168 (see the header). */
  async pick(startPos: GfVec2i, endPos: GfVec2i, width: number, height: number,
    frustum: GfFrustum, viewMatrix: GfMatrix4d, pickTarget: string,
    resolveMode: string, allHits: HdxPickHitVector,
    out: (line: string) => void): Promise<HdSelection> {
    const p = new HdxPickTaskContextParams()
    p.resolution = HdxUnitTestUtils.calculatePickResolution(
      startPos, endPos, new GfVec2i(4, 4))
    p.pickTarget = pickTarget as TfToken
    p.resolveMode = resolveMode as TfToken
    p.viewMatrix = viewMatrix
    p.projectionMatrix = HdxUnitTestUtils.computePickingProjectionMatrix(
      startPos, endPos, new GfVec2i(width, height), frustum)
    p.collection = this._pickablesCol
    p.outHits = allHits

    const index = this.getDelegate().getRenderIndex()
    const pickTask = index.getTask('/pickTask')! as HdxPickTask
    const tasks: HdTask[] = [pickTask]
    this._getEngine().setTaskContextData(HdxPickTokens.pickParams, p)
    this._getEngine().Execute(index, tasks)
    await pickTask.getPendingResolve()

    return HdxUnitTestUtils.translateHitsToSelection(
      p.pickTarget, HdSelection.HighlightModeSelect, allHits, out)
  }
}

/** testHdxPickResolveMode.cpp:221-227 */
function _GetTranslate(tx: number, ty: number, tz: number): GfMatrix4d {
  const m = new GfMatrix4d(1.0)
  m.setRow(3, new GfVec4d(tx, ty, tz, 1.0))
  return m
}

/** testHdxPickResolveMode.cpp:172-219 */
class My_TestGLDrawing extends HdSt_UnitTestGLDrawing {
  private _driver: Hdx_TestDriver | null = null
  private _selTracker: HdxSelectionTracker | null = null
  private _reprName: string = HdReprTokens.wireOnSurf
  private _refineLevel = 0
  stdout = ''

  constructor(private readonly _hgi: Hgi) {
    super()
    this.setCameraRotate(0, 0)
    this.setCameraTranslate(new GfVec3f(0, 0, 0))
  }

  private _out = (line: string): void => { this.stdout += line + '\n' }

  /** testHdxPickResolveMode.cpp:229-246 */
  initTest(): void {
    this._driver = new Hdx_TestDriver(this._hgi, this._reprName)

    const delegate = this._driver.getDelegate()

    delegate.setRefineLevel(this._refineLevel)
    this._selTracker = new HdxSelectionTracker()

    // prepare scene
    this._initScene()
    this.setCameraTranslate(new GfVec3f(0, 0, -20))

    this._driver.setClearColor(new GfVec4f(0.1, 0.1, 0.1, 1.0))
    this._driver.setClearDepth(1.0)
    this._driver.setupAovs(this.getWidth(), this.getHeight())
  }

  /** testHdxPickResolveMode.cpp:254-331 */
  private _initScene(): void {
    const delegate = this._driver!.getDelegate()

    delegate.addCube('/cube0', _GetTranslate(5, 0, 5))
    delegate.addCube('/cube1', _GetTranslate(-5, 0, 5))
    delegate.addCube('/cube2', _GetTranslate(-5, 0, -5))
    delegate.addCube('/cube3', _GetTranslate(5, 0, -5))

    const unit = () => [new GfVec3f(1, 1, 1), new GfVec3f(1, 1, 1), new GfVec3f(1, 1, 1)]
    const zero = () => [new GfVec4f(0, 0, 0, 0), new GfVec4f(0, 0, 0, 0), new GfVec4f(0, 0, 0, 0)]
    {
      delegate.addInstancer('/instancerTop')
      delegate.addCube('/protoTop', new GfMatrix4d(1), false, '/instancerTop')

      delegate.setInstancerProperties('/instancerTop', [0, 0, 0], unit(), zero(),
        [new GfVec3f(3, 0, 2), new GfVec3f(0, 0, 2), new GfVec3f(-3, 0, 2)])
    }

    {
      delegate.addInstancer('/instancerBottom')
      delegate.addTet('/protoBottom', new GfMatrix4d(1), false, '/instancerBottom')
      delegate.setRefineLevel('/protoBottom', 2)

      delegate.setInstancerProperties('/instancerBottom', [0, 0, 0], unit(), zero(),
        [new GfVec3f(3, 0, -2), new GfVec3f(0, 0, -2), new GfVec3f(-3, 0, -2)])
    }
  }

  /** testHdxPickResolveMode.cpp:333-346 */
  private _pick(startPos: GfVec2i, endPos: GfVec2i, pickTarget: string,
    resolveMode: string, allHits: HdxPickHitVector): Promise<HdSelection> {
    return this._driver!.pick(startPos, endPos, this.getWidth(), this.getHeight(),
      this.getFrustum(), this.getViewMatrix(), pickTarget, resolveMode, allHits, this._out)
  }

  /** testHdxPickResolveMode.cpp:348-352 */
  drawTest(): void {
    this.drawScene()
  }

  /** testHdxPickResolveMode.cpp:354-439 */
  async offscreenTest(): Promise<void> {
    this.drawScene()

    let allHits: HdxPickHitVector = []
    const mode = HdSelection.HighlightModeSelect
    // Use the same "marquee" style area pick with different resolve modes
    // This picks:
    //      instances 0 and 1 of /protoTop and /protoBottom
    //      cube0 and cube3
    const pickStartPos = new GfVec2i(270, 80)
    const pickEndPos = new GfVec2i(500, 400)

    // 1. Nearest to camera
    {
      const selection = await this._pick(pickStartPos, pickEndPos,
        HdxPickTokens.pickPrimsAndInstances,
        HdxPickTokens.resolveNearestToCamera,
        allHits)
      TF_VERIFY(allHits.length === 1, "allHits.size() == 1")
      TF_VERIFY(selection.getSelectedPrimPaths(mode).length === 1,
        'selection->GetSelectedPrimPaths(mode).size() == 1')
      TF_VERIFY(selection.getSelectedPrimPaths(mode)[0] === '/protoTop',
        'selection->GetSelectedPrimPaths(mode)[0] == SdfPath("/protoTop")')
    }

    // 2. Nearest to center (of pick region)
    {
      allHits = []
      const selection = await this._pick(pickStartPos, pickEndPos,
        HdxPickTokens.pickPrimsAndInstances,
        HdxPickTokens.resolveNearestToCenter,
        allHits)
      TF_VERIFY(allHits.length === 1, 'allHits.size() == 1')
      TF_VERIFY(selection.getSelectedPrimPaths(mode).length === 1,
        'selection->GetSelectedPrimPaths(mode).size() == 1')
      TF_VERIFY(selection.getSelectedPrimPaths(mode)[0] === '/protoBottom',
        'selection->GetSelectedPrimPaths(mode)[0] == SdfPath("/protoBottom")')
    }

    // 3. Unique
    {
      // The pick target influences what a "unique" hit is, so cycle through
      // all the supported pickTarget, and verify that a different number of
      // hits is returned each time.
      const pickTargets = [
        HdxPickTokens.pickPrimsAndInstances,
        HdxPickTokens.pickFaces,
        HdxPickTokens.pickEdges,
        HdxPickTokens.pickPoints,
      ]
      const expectedHitCount = [
        6 /*primsAndInstances*/,
        69 /*faces*/,
        135 /*edges*/,
        39 /*points*/]

      for (let i = 0; i < pickTargets.length; i++) {
        allHits = []
        await this._pick(pickStartPos, pickEndPos,
          pickTargets[i]!,
          HdxPickTokens.resolveUnique,
          allHits)
        this._out(`allHits: ${allHits.length} expectedHitCount:  ${expectedHitCount[i]}`)
        TF_VERIFY(allHits.length === expectedHitCount[i], 'allHits.size() == expectedHitCount[i]')
      }
    }

    // 4. All
    {
      allHits = []
      await this._pick(pickStartPos, pickEndPos,
        HdxPickTokens.pickPrimsAndInstances,
        HdxPickTokens.resolveAll,
        allHits)
      const expectedHitCount =
        this._driver!.getHgi().getAPIName() === HgiTokens.Vulkan ? 22440 : 22438
      this._out(`allHits: ${allHits.length} expectedHitCount:  ${expectedHitCount}`)
      TF_VERIFY(allHits.length === expectedHitCount, 'allHits.size() == expectedHitCount')
    }
  }

  /** testHdxPickResolveMode.cpp:441-455 */
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

  /** testHdxPickResolveMode.cpp:500-511 */
  override parseArgs(argv: readonly string[]): void {
    for (let i = 0; i < argv.length; ++i) {
      const arg = argv[i]
      if (arg === '--repr') {
        this._reprName = TfToken(argv[++i]!)
      } else if (arg === '--refineLevel') {
        this._refineLevel = parseInt(argv[++i]!, 10)
      }
    }
  }
}

/** testHdxPickResolveMode.cpp:513-540 */
export async function main(hgi: Hgi, argv: readonly string[] = ['--offscreen']): Promise<{ status: number, stdout: string }> {
  const mark = new TfErrorMark()

  // BasicTest: HdSt_UnitTestGLDrawing::RunTest (offscreen).
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

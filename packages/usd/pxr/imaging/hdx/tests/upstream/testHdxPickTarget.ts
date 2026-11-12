// Ported from OpenUSD 26.11.1: pxr/imaging/hdx/testenv/testHdxPickTarget.cpp
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdx/testenv/testHdxPickTarget.cpp (OpenUSD
// 26.11.1), registered as `testHdxPickTarget --offscreen`
// (hdx/CMakeLists.txt:310). Browser test program (tests/browser/hdx-image/run.mjs);
// the native captures of its images are hdx/tests/fixtures/testenvImages/
// testHdxPickTarget/.
//
// Divergences: no window (HdSt_UnitTestGLDrawing offscreen run of 640x480;
// the Marquee and the mouse handlers of the interactive mode are not
// ported); Hgi is given; the driver's writes are asynchronous. Returns the
// exit status and stdout instead of exiting.

import { Token as TfToken, TfErrorMark, Type as TfType } from 'typescript-usd/tf'
import {
  Matrix4d as GfMatrix4d,
  Vec2i as GfVec2i,
  Vec3d as GfVec3d,
  Vec3f as GfVec3f,
  Vec4d as GfVec4d,
  Vec4f as GfVec4f,
  makeRotation as GfMakeRotation,
  type Frustum as GfFrustum,
  type Rotation as GfRotation,
} from 'typescript-usd/gf'
import { Value as VtValue } from 'typescript-usd/vt'
import {
  CullStyle as HdCullStyle,
  HdMeshRprim as HdMesh,
  MeshEdgeIndexTable as HdMeshEdgeIndexTable,
  MeshGeomStyle as HdMeshGeomStyle,
  MeshReprDesc as HdMeshReprDesc,
  MeshReprDescTokens as HdMeshReprDescTokens,
  ReprSelector as HdReprSelector,
  ReprTokens as HdReprTokens,
  RprimCollection as HdRprimCollection,
  SelectionHighlightMode as HdSelectionHighlightMode,
  Tokens as HdTokens,
  type MeshTopology as HdMeshTopology,
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

/** testHdxPickTarget.cpp:31-35 */
const _tokens = {
  meshPoints: TfToken('meshPoints'),
  pickables: TfToken('pickables'),
}

/** testHdxPickTarget.cpp:37-68 */
class Hdx_TestDriver extends HdSt_TestDriverBase<Hdx_UnitTestDelegate> {
  // std::cout of the program.
  stdout = ''
  private _pickablesCol = new HdRprimCollection()

  /** testHdxPickTarget.cpp:70-74 */
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

  /** testHdxPickTarget.cpp:49-54 */
  setSceneColReprSelector(reprSelector: HdReprSelector): void {
    this._collection.setReprSelector(reprSelector)
    const renderTask = '/renderTask'
    this.getDelegate().setTaskParam(renderTask, HdTokens.collection,
      VtValue.create(this._collection.Clone(), _HdRprimCollectionType))
  }

  /** testHdxPickTarget.cpp:56-60 */
  setPickablesColReprSelector(reprSelector: HdReprSelector): void {
    this._pickablesCol.setReprSelector(reprSelector)
    // don't need to update the picker's collection param, since it is a
    // ptr to _pickablesCol.
  }

  /** testHdxPickTarget.cpp:75-126 */
  protected override _init(reprSelector: HdReprSelector): void {
    this._setupSceneDelegate()

    const delegate = this.getDelegate()

    // Add a meshPoints repr since it isn't populated in
    // HdRenderIndex::_ConfigureReprs
    HdMesh.configureRepr(_tokens.meshPoints,
      new HdMeshReprDesc(HdMeshGeomStyle.HdMeshGeomStylePoints,
        HdCullStyle.HdCullStyleNothing,
        HdMeshReprDescTokens.pointColor,
        /*flatShadingEnabled=*/true,
        /*blendWireframeColor=*/false))

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

    this._collection = new HdRprimCollection(HdTokens.geometry, reprSelector)
    delegate.setTaskParam(renderTask, HdTokens.collection,
      VtValue.create(this._collection.Clone(), _HdRprimCollectionType))

    const selParam = new HdxSelectionTaskParams()
    selParam.enableSelectionHighlight = true
    selParam.selectionColor = new GfVec4f(1, 1, 0, 1)
    selParam.locateColor = new GfVec4f(1, 0, 1, 1)
    delegate.setTaskParam(selectionTask, HdTokens.params,
      VtValue.create(selParam, HdxSelectionTaskParamsType))

    // picking
    this._pickablesCol = new HdRprimCollection(_tokens.pickables,
      new HdReprSelector(HdReprTokens.refined))
    // We have to unfortunately explictly add collections besides 'geometry'
    // See HdRenderIndex constructor.
    delegate.getRenderIndex().getChangeTracker().addCollection(
      _tokens.pickables)
  }

  /** testHdxPickTarget.cpp:127-151 */
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

  /** testHdxPickTarget.cpp:152-178 */
  async pick(startPos: GfVec2i, endPos: GfVec2i, pickTarget: string, width: number,
    height: number, frustum: GfFrustum, viewMatrix: GfMatrix4d): Promise<HdSelection> {
    const allHits: HdxPickHit[] = []
    const p = new HdxPickTaskContextParams()
    p.resolution = HdxUnitTestUtils.calculatePickResolution(
      startPos, endPos, new GfVec2i(4, 4))
    p.pickTarget = TfToken(pickTarget)
    p.resolveMode = HdxPickTokens.resolveUnique
    p.viewMatrix = viewMatrix
    p.projectionMatrix = HdxUnitTestUtils.computePickingProjectionMatrix(
      startPos, endPos, new GfVec2i(width, height), frustum)
    p.collection = this._pickablesCol.Clone()
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

type MeshEdges = GfVec2i[]

/** testHdxPickTarget.cpp:223-232. Rotate followed by translate. */
function _GetTransform(rot: GfRotation, translate: GfVec3d): GfMatrix4d {
  const xform = new GfMatrix4d()
  xform.setRotate(rot)
  xform.setTranslateOnly(translate)

  return xform
}

/** testHdxPickTarget.cpp:182-220 */
class My_TestGLDrawing extends HdSt_UnitTestGLDrawing {
  private _driver: Hdx_TestDriver | null = null
  private _selTracker: HdxSelectionTracker | null = null
  get stdout(): string { return this._driver?.stdout ?? '' }

  constructor(private readonly _hgi: Hgi) {
    super()
    this.setCameraRotate(0, 0)
    this.setCameraTranslate(new GfVec3f(0, 0, 0))
  }

  /** testHdxPickTarget.cpp:234-251 */
  private _getMeshEdges(meshPath: string, edgeIds: readonly number[]): MeshEdges {
    const rprim = this._driver!.getDelegate().getRenderIndex().getRprim(meshPath)
    const mesh = rprim as unknown as { GetTopology(): HdMeshTopology | null }

    const result: MeshEdges = []

    const edgeIndices = [...edgeIds]

    const edgeIndexTable = new HdMeshEdgeIndexTable(mesh.GetTopology()!)
    edgeIndexTable.getVerticesForEdgeIndices(edgeIndices, result)

    return result
  }

  /** testHdxPickTarget.cpp:253-270 */
  initTest(): void {
    this._driver = new Hdx_TestDriver(this._hgi)

    this._selTracker = new HdxSelectionTracker()

    // prepare scene
    this._initScene()
    this.setCameraTranslate(new GfVec3f(-2.3, -2.3999, -10))
    this.setCameraRotate(-1, 13)

    this._driver.setClearColor(new GfVec4f(0.1, 0.1, 0.1, 1.0))
    this._driver.setClearDepth(1.0)
    this._driver.setupAovs(this.getWidth(), this.getHeight())
  }

  /** testHdxPickTarget.cpp:278-288 */
  private _initScene(): void {
    const delegate = this._driver!.getDelegate()

    const rot = GfMakeRotation(/*axis*/[1, 0, 1], /*angle*/30)
    delegate.addCube('/cube0', _GetTransform(rot, new GfVec3d(0, 0, 0)))
    delegate.addCube('/cube1', _GetTransform(rot, new GfVec3d(5, 0, 0)))
    delegate.addTet('/tet0', _GetTransform(rot, new GfVec3d(0, 0, 5)))
    delegate.addTet('/tet1', _GetTransform(rot, new GfVec3d(5, 0, 5)))
  }

  /** testHdxPickTarget.cpp:290-296 */
  private _pick(startPos: GfVec2i, endPos: GfVec2i, pickTarget: string): Promise<HdSelection> {
    return this._driver!.pick(startPos, endPos, pickTarget, this.getWidth(),
      this.getHeight(), this.getFrustum(), this.getViewMatrix())
  }

  /** testHdxPickTarget.cpp:298-303 */
  drawTest(): void {
    this.drawScene()
  }

  /** testHdxPickTarget.cpp:305-495 */
  async offscreenTest(): Promise<void> {
    const driver = this._driver!
    const selTracker = this._selTracker!
    const write = (file: string) => driver.writeToFile('color', file)

    this.drawScene()
    await write('color1_unselected.png')

    const mode = HdSelectionHighlightMode.HighlightModeSelect

    //-------------------- prim & instance picking -----------------------------
    // select tet1
    {
      const selection = await this._pick(
        new GfVec2i(436, 127), new GfVec2i(452, 139),
        HdxPickTokens.pickPrimsAndInstances)
      selTracker.setSelection(selection)
      this.drawScene()
      await write('color10_tet1_pick_prims.png')
      const selState = selection.getPrimSelectionState(mode, '/tet1')
      TF_VERIFY(selState)
      TF_VERIFY(selState?.fullySelected)
    }

    //---------------------------- face picking --------------------------------
    // select face 3 of cube0
    {
      const selection = await this._pick(
        new GfVec2i(179, 407), new GfVec2i(179, 407), HdxPickTokens.pickFaces)
      selTracker.setSelection(selection)
      this.drawScene()
      await write('color2_cube0_pick_face.png')
      const selState = selection.getPrimSelectionState(mode, '/cube0')
      TF_VERIFY(selState)
      TF_VERIFY(selState?.elementIndices.length === 1)
      const facesSelected = selState?.elementIndices[0] ?? []
      TF_VERIFY(facesSelected.length === 1 && facesSelected[0] === 3)
    }

    // select faces 3 & 5 of tet1.
    // note: this isn't lasso picking. we're simply using a larger viewport.
    {
      const selection = await this._pick(
        new GfVec2i(436, 127), new GfVec2i(452, 139), HdxPickTokens.pickFaces)
      selTracker.setSelection(selection)
      this.drawScene()
      await write('color3_tet1_pick_faces.png')
      const selState = selection.getPrimSelectionState(mode, '/tet1')
      TF_VERIFY(selState)
      TF_VERIFY(selState?.elementIndices.length === 1)
      const facesSelected = selState?.elementIndices[0] ?? []
      TF_VERIFY(facesSelected.length === 2)
    }

    // test wireframe face highlighting
    {
      driver.setSceneColReprSelector(new HdReprSelector(HdReprTokens.wire))
      // note: don't change the pickable collection's repr; picking anywhere
      // on the face should select it.
      const selection = await this._pick(
        new GfVec2i(179, 307), new GfVec2i(179, 407), HdxPickTokens.pickFaces)
      selTracker.setSelection(selection)
      this.drawScene()
      await write('color9_cube0_wire_pick_face.png')
      const selState = selection.getPrimSelectionState(mode, '/cube0')
      TF_VERIFY(selState)
      TF_VERIFY(selState?.elementIndices.length === 1)
      const facesSelected = selState?.elementIndices[0] ?? []
      TF_VERIFY(facesSelected.length === 2)
    }
    //---------------------------- edge picking --------------------------------
    // Picking or highlighting edges requires the GS stage, so use a repr that
    // guarantees the GS is bound (wire* does)
    // We change the repr on the scene collection in addition to the picking
    // collection to validate selection highlighting.
    driver.setSceneColReprSelector(new HdReprSelector(HdReprTokens.wireOnSurf))
    driver.setPickablesColReprSelector(new HdReprSelector(
      HdReprTokens.wireOnSurf))

    // select edge of tet0
    {
      const selection = await this._pick(
        new GfVec2i(158, 122), new GfVec2i(158, 122), HdxPickTokens.pickEdges)
      selTracker.setSelection(selection)
      this.drawScene()
      await write('color4_tet0_pick_edge.png')
      const meshPath = '/tet0'
      const selState = selection.getPrimSelectionState(mode, meshPath)
      TF_VERIFY(selState)
      TF_VERIFY(selState?.edgeIndices.length === 1)
      const edgeIndicesSelected = selState?.edgeIndices[0] ?? []
      const edgesSelected = this._getMeshEdges(meshPath, edgeIndicesSelected)
      TF_VERIFY(edgesSelected.length === 1)
    }

    // select edges of cube1
    // note: this isn't lasso picking. we're simply using a larger viewport.
    {
      const selection = await this._pick(
        new GfVec2i(446, 335), new GfVec2i(462, 427), HdxPickTokens.pickEdges)
      selTracker.setSelection(selection)
      this.drawScene()
      await write('color5_cube1_pick_edges.png')
      const meshPath = '/cube1'
      const selState = selection.getPrimSelectionState(mode, meshPath)
      TF_VERIFY(selState)
      TF_VERIFY(selState?.edgeIndices.length === 1)
      const edgeIndicesSelected = selState?.edgeIndices[0] ?? []
      const edgesSelected = this._getMeshEdges(meshPath, edgeIndicesSelected)
      TF_VERIFY(edgesSelected.length === 2)
    }

    //---------------------------- point picking -------------------------------
    // Similar to edges, we currently support picking and selection
    // highlighting points on prims only when points are rendered.
    driver.setSceneColReprSelector(new HdReprSelector(HdReprTokens.wireOnSurf,
      HdReprTokens.disabled,
      _tokens.meshPoints))
    driver.setPickablesColReprSelector(new HdReprSelector(
      HdReprTokens.wireOnSurf,
      HdReprTokens.disabled,
      _tokens.meshPoints))

    // select points of cube1
    {
      const selection = await this._pick(
        new GfVec2i(346, 215), new GfVec2i(492, 427), HdxPickTokens.pickPoints)
      selTracker.setSelection(selection)
      this.drawScene()
      await write('color6_cube1_pick_points.png')
      const selState = selection.getPrimSelectionState(mode, '/cube1')
      TF_VERIFY(selState)
      TF_VERIFY(selState?.pointIndices.length === 1)
      const pointsSelected = selState?.pointIndices[0] ?? []
      TF_VERIFY(pointsSelected.length === 4)
    }

    {
      // Simulate "pick through" semantics by using wireframe for the picking
      // collection. The scene collection remains as-is (wireOnSurf).
      driver.setPickablesColReprSelector(new HdReprSelector(
        HdReprTokens.wire,
        HdReprTokens.disabled,
        _tokens.meshPoints))
      const selection = await this._pick(
        new GfVec2i(346, 215), new GfVec2i(492, 427), HdxPickTokens.pickPoints)
      selTracker.setSelection(selection)
      this.drawScene()
      await write('color7_cube1_pick_points_pick_through.png')
      const selState = selection.getPrimSelectionState(mode, '/cube1')
      TF_VERIFY(selState)
      TF_VERIFY(selState?.pointIndices.length === 1)
      const pointsSelected = selState?.pointIndices[0] ?? []
      TF_VERIFY(pointsSelected.length === 5)
    }

    // manually verify if specifying a color for a set of points works.
    {
      // Render just the points.
      driver.setSceneColReprSelector(new HdReprSelector(HdReprTokens.disabled,
        HdReprTokens.disabled,
        _tokens.meshPoints))
      // The pick below is only to get a handle to the selection.
      const selection = await this._pick(
        new GfVec2i(0, 0), new GfVec2i(0, 1), HdxPickTokens.pickPoints)
      const pointIndices = [0, 2, 3, 4]
      selection.addPoints(HdSelectionHighlightMode.HighlightModeSelect,
        '/cube0',
        pointIndices,
        [1.0, 0.0, 0.0, 1.0])

      selection.addPoints(HdSelectionHighlightMode.HighlightModeSelect,
        '/tet1',
        pointIndices,
        [1.0, 1.0, 0.0, 1.0])
      selTracker.setSelection(selection)
      this.drawScene()
      await write('color8_points_with_color.png')
    }
  }

  /** testHdxPickTarget.cpp:497-513 */
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

/** testHdxPickTarget.cpp:558-579 (BasicTest, main) with the registered argv
 *  `--offscreen`. */
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

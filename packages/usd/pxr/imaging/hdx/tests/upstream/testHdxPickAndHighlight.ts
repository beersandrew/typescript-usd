// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdx/testenv/testHdxPickAndHighlight.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdx/testenv/testHdxPickAndHighlight.cpp (OpenUSD
// 26.11.1), registered as `testHdxPickAndHighlight --offscreen`
// (hdx/CMakeLists.txt:433). Browser test program (tests/browser/hdx-image/run.mjs);
// the native captures of its images are hdx/tests/fixtures/testenvImages/
// testHdxPickAndHighlight/.
//
// Divergences: no window (HdSt_UnitTestGLDrawing offscreen run of 640x480;
// the Marquee and the mouse handlers of the interactive mode are not
// ported); Hgi is given; the driver's writes and picks are asynchronous.
// Returns the exit status and stdout instead of exiting.

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
  MaterialNetwork as HdMaterialNetwork,
  MaterialNetworkMap as HdMaterialNetworkMap,
  MaterialNode as HdMaterialNode,
  MaterialTerminalTokens as HdMaterialTerminalTokens,
  ReprSelector as HdReprSelector,
  ReprTokens as HdReprTokens,
  RprimCollection as HdRprimCollection,
  Selection as HdSelection,
  SelectionHighlightMode as HdSelectionHighlightMode,
  Tokens as HdTokens,
  type RenderIndex as HdRenderIndex,
  type Task as HdTask,
} from 'typescript-usd/hd'
import type { Hgi } from 'typescript-usd/hgi'
import { HioGlslfxTokens } from 'typescript-usd/hio'
import { Registry as SdrRegistry } from 'typescript-usd/sdr'
import { MaterialTagTokens as HdStMaterialTagTokens, _TestDriverBase as HdSt_TestDriverBase } from 'typescript-usd/hdSt'
import { HdSt_UnitTestGLDrawing } from '../../../hdSt/tests/upstream/unitTestGLDrawing.ts'
import {
  HdxPickTaskContextParams,
  HdxPickTaskContextParamsType,
  HdxPickTokens,
  type HdxPickTask,
  type HdxPickHit,
} from '../../src/pickTask.ts'
import { HdxOitRenderTask } from '../../src/oitRenderTask.ts'
import { HdxOitResolveTask, HdxOitResolveTaskParams, HdxOitResolveTaskParamsType } from '../../src/oitResolveTask.ts'
import { HdxRenderTaskParams, HdxRenderTaskParamsType } from '../../src/renderSetupTask.ts'
import { HdxSelectionTaskParams, HdxSelectionTaskParamsType } from '../../src/selectionTask.ts'
import { HdxSelectionTracker } from '../../src/selectionTracker.ts'
import { HdxTokens } from '../../src/tokens.ts'
import { Hdx_UnitTestDelegate } from '../../src/unitTestDelegate.ts'
import { HdxUnitTestUtils } from '../../src/unitTestUtils.ts'
import { TF_VERIFY } from '../../src/tfDiagnostic.ts'

const _HdRprimCollectionType = TfType.declare('HdRprimCollection')
const _TfTokenVectorType = TfType.declare('TfTokenVector')
const _HdMaterialNetworkMapType = TfType.declare('HdMaterialNetworkMap')

/** testHdxPickAndHighlight.cpp:52-56 */
const _tokens = {
  pickables: TfToken('pickables'),
}

type InstanceMap = Map<string, number[][]>

/** testHdxPickAndHighlight.cpp:63-82. Returns prims with selected instances
 *  in a map. */
function _GetSelectedInstances(sel: HdSelection, mode: HdSelectionHighlightMode): InstanceMap {
  const selInstances: InstanceMap = new Map()
  const selPrimPaths = sel.getSelectedPrimPaths(mode)

  for (const path of selPrimPaths) {
    const primSelState = sel.getPrimSelectionState(mode, path)

    TF_VERIFY(primSelState)
    if (primSelState!.instanceIndices.length > 0) {
      selInstances.set(path, primSelState!.instanceIndices)
    }
  }

  return selInstances
}

/** testHdxPickAndHighlight.cpp:86-103 */
class Hdx_TestDriver extends HdSt_TestDriverBase<Hdx_UnitTestDelegate> {
  // std::cout of the program.
  stdout = ''
  private _pickablesCol = new HdRprimCollection()

  /** testHdxPickAndHighlight.cpp:105-108 */
  constructor(hgi: Hgi, reprName: string) {
    super(hgi)
    this._init(new HdReprSelector(reprName))
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

  /** testHdxPickAndHighlight.cpp:110-174 */
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
    // Scope the pass above to the opaque prims, so that the translucent prim
    // added by _AddTranslucentCube is left to the OIT tasks.
    delegate.setTaskParam(renderTask, HdTokens.collection,
      VtValue.create(new HdRprimCollection(HdTokens.geometry, reprSelector,
        /*forcedRepr*/ false,
        HdStMaterialTagTokens.masked), _HdRprimCollectionType))

    // Translucent prims will get drawn by the OIT tasks. OIT tasks get their
    // own setup task rather than params of their own, both to exercise that
    // method of task setup and so we can drop the AOV clear values..
    const oitSetupTask = '/oitSetupTask'
    const oitRenderTask = '/oitRenderTask'
    const oitResolveTask = '/oitResolveTask'
    const renderIndex = delegate.getRenderIndex()
    delegate.addRenderSetupTask(oitSetupTask)
    renderIndex.insertTask(delegate, oitRenderTask, HdxOitRenderTask)
    renderIndex.insertTask(delegate, oitResolveTask, HdxOitResolveTask)
    delegate.setTaskParam(oitSetupTask, HdTokens.params,
      VtValue.create(param, HdxRenderTaskParamsType))
    delegate.setTaskParam(oitRenderTask, HdTokens.collection,
      VtValue.create(new HdRprimCollection(HdTokens.geometry, reprSelector,
        /*forcedRepr*/ false,
        HdStMaterialTagTokens.translucent), _HdRprimCollectionType))

    delegate.setTaskParam(oitRenderTask, HdTokens.renderTags,
      VtValue.create([] as string[], _TfTokenVectorType))
    delegate.setTaskParam(oitResolveTask, HdTokens.params,
      VtValue.create(new HdxOitResolveTaskParams(), HdxOitResolveTaskParamsType))

    const selParam = new HdxSelectionTaskParams()
    selParam.enableSelectionHighlight = true
    selParam.enableLocateHighlight = true
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

  /** testHdxPickAndHighlight.cpp:176-214 */
  drawWithSelection(viewport: GfVec4d, selTracker: HdxSelectionTracker): void {
    const renderSetupTask = '/renderSetupTask'
    const renderTask = '/renderTask'
    const oitSetupTask = '/oitSetupTask'
    const oitRenderTask = '/oitRenderTask'
    const oitResolveTask = '/oitResolveTask'
    const selectionTask = '/selectionTask'

    const param = this.getDelegate().getTaskParam(
      renderSetupTask, HdTokens.params).Get<HdxRenderTaskParams>().Clone()
    param.viewport = viewport
    param.aovBindings = this._aovBindings
    this.getDelegate().setTaskParam(
      renderSetupTask, HdTokens.params, VtValue.create(param, HdxRenderTaskParamsType))

    // The OIT passes draw into the buffers the previous pass filled, so their
    // setup task drops the clear values.
    const oitParam = param.Clone()
    for (const aovBinding of oitParam.aovBindings) {
      aovBinding.clearValue = undefined
    }
    this.getDelegate().setTaskParam(
      oitSetupTask, HdTokens.params, VtValue.create(oitParam, HdxRenderTaskParamsType))

    const index = this.getDelegate().getRenderIndex()
    const tasks: HdTask[] = []
    tasks.push(index.getTask(renderSetupTask)!)
    tasks.push(index.getTask(renderTask)!)
    tasks.push(index.getTask(oitSetupTask)!)
    tasks.push(index.getTask(oitRenderTask)!)
    tasks.push(index.getTask(oitResolveTask)!)
    tasks.push(index.getTask(selectionTask)!)

    this._getEngine().setTaskContextData(HdxTokens.selectionState, selTracker)
    this._getEngine().Execute(index, tasks)
  }

  /** testHdxPickAndHighlight.cpp:216-241 */
  async pick(startPos: GfVec2i, endPos: GfVec2i, mode: HdSelectionHighlightMode,
    width: number, height: number, frustum: GfFrustum, viewMatrix: GfMatrix4d): Promise<HdSelection> {
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
      p.pickTarget, mode, allHits,
      line => { this.stdout += line + '\n' })
  }
}

/** testHdxPickAndHighlight.cpp:290-296 */
function _GetTranslate(tx: number, ty: number, tz: number): GfMatrix4d {
  const m = new GfMatrix4d(1.0)
  m.setRow(3, new GfVec4d(Math.fround(tx), Math.fround(ty), Math.fround(tz), 1.0))
  return m
}

/** testHdxPickAndHighlight.cpp:245-286 */
class My_TestGLDrawing extends HdSt_UnitTestGLDrawing {
  private _driver: Hdx_TestDriver | null = null
  private _selTracker: HdxSelectionTracker | null = null
  get stdout(): string { return this._driver?.stdout ?? '' }
  private _reprName: string = HdReprTokens.hull
  private _refineLevel = 0

  constructor(private readonly _hgi: Hgi) {
    super()
    this.setCameraRotate(0, 0)
    this.setCameraTranslate(new GfVec3f(0, 0, 0))
  }

  /** testHdxPickAndHighlight.cpp:298-315 */
  initTest(): void {
    this._driver = new Hdx_TestDriver(this._hgi, this._reprName)

    this._driver.getDelegate().setRefineLevel(this._refineLevel)
    this._selTracker = new HdxSelectionTracker()

    // prepare scene
    this._initScene()
    this.setCameraTranslate(new GfVec3f(0, 0, -20))

    this._driver.setClearColor(new GfVec4f(0.1, 0.1, 0.1, 1.0))
    this._driver.setClearDepth(1.0)
    this._driver.setupAovs(this.getWidth(), this.getHeight())
  }

  /** testHdxPickAndHighlight.cpp:323-399 */
  private _initScene(): void {
    const delegate = this._driver!.getDelegate()

    delegate.addCube('/cube0', _GetTranslate(5, 0, 5))
    delegate.addCube('/cube1', _GetTranslate(-5, 0, 5))
    delegate.addCube('/cube2', _GetTranslate(-5, 0, -5))
    delegate.addCube('/cube3', _GetTranslate(5, 0, -5))

    {
      delegate.addInstancer('/instancerTop')
      delegate.addCube('/protoTop', new GfMatrix4d(1), false, '/instancerTop')

      const scale = [new GfVec3f(1, 1, 1), new GfVec3f(1, 1, 1), new GfVec3f(1, 1, 1)]
      const rotate = [new GfVec4f(0, 0, 0, 0), new GfVec4f(0, 0, 0, 0), new GfVec4f(0, 0, 0, 0)]
      const translate = [new GfVec3f(3, 0, 2), new GfVec3f(0, 0, 2), new GfVec3f(-3, 0, 2)]
      const prototypeIndex = [0, 0, 0]

      delegate.setInstancerProperties('/instancerTop',
        prototypeIndex, scale, rotate, translate)
    }

    {
      delegate.addInstancer('/instancerBottom')
      delegate.addTet('/protoBottom', new GfMatrix4d(1), false, '/instancerBottom')
      delegate.setRefineLevel('/protoBottom', 2)

      const scale = [new GfVec3f(1, 1, 1), new GfVec3f(1, 1, 1), new GfVec3f(1, 1, 1)]
      const rotate = [new GfVec4f(0, 0, 0, 0), new GfVec4f(0, 0, 0, 0), new GfVec4f(0, 0, 0, 0)]
      const translate = [new GfVec3f(3, 0, -2), new GfVec3f(0, 0, -2), new GfVec3f(-3, 0, -2)]
      const prototypeIndex = [0, 0, 0]

      delegate.setInstancerProperties('/instancerBottom',
        prototypeIndex, scale, rotate, translate)
    }
  }

  /** testHdxPickAndHighlight.cpp:401-457 */
  private _addTranslucentCube(): void {
    const delegate = this._driver!.getDelegate()

    const source =
      '-- glslfx version 0.1 \n' +
      '-- configuration \n' +
      '{\n' +
      '"techniques": {\n' +
      '    "default": {\n' +
      '        "surfaceShader": {\n' +
      '            "source": [ "testHdxPickAndHighlight.Surface" ]\n' +
      '        }\n' +
      '    }\n' +
      '},\n' +
      '"metadata": {\n' +
      '    "materialTag": "translucent"\n' +
      '}\n' +
      '}\n' +

      '-- glsl testHdxPickAndHighlight.Surface \n\n' +

      'vec4 surfaceShader(vec4 Peye, vec3 Neye, vec4 color, vec4 patchCoord)\n' +
      '{\n' +
      '    const float opacity = 0.5;\n' +
      '    vec3 lit = FallbackLighting(Peye.xyz, Neye, vec3(0.2, 0.6, 1));\n' +
      '    vec4 overridden = ApplyColorOverrides(vec4(lit, opacity));\n' +
      '    return vec4(overridden.rgb * overridden.a, overridden.a);\n' +
      '}\n'

    const shaderReg = SdrRegistry.getInstance()
    const sdrSurfaceNode = shaderReg.getShaderNodeFromSourceCode(
      source,
      HioGlslfxTokens.glslfx,
      {}) // metadata
    if (!TF_VERIFY(sdrSurfaceNode)) {
      return
    }

    const materialId = '/translucentMaterial'
    const material = new HdMaterialNetworkMap()
    const network = new HdMaterialNetwork()
    material.map.set(HdMaterialTerminalTokens.surface, network)
    const terminal = new HdMaterialNode()
    terminal.path = materialId + '/Shader'
    terminal.identifier = sdrSurfaceNode!.getIdentifier()
    material.terminals.push(terminal.path)
    network.nodes.push(terminal)
    delegate.addMaterialResource(materialId, VtValue.create(material, _HdMaterialNetworkMapType))

    const cubeId = '/translucentCube'
    delegate.bindMaterial(cubeId, materialId)
    delegate.addCube(cubeId, _GetTranslate(0, -5, 0))
  }

  /** testHdxPickAndHighlight.cpp:459-465 */
  private _pick(startPos: GfVec2i, endPos: GfVec2i, mode: HdSelectionHighlightMode): Promise<HdSelection> {
    return this._driver!.pick(startPos, endPos, mode, this.getWidth(), this.getHeight(),
      this.getFrustum(), this.getViewMatrix())
  }

  /** testHdxPickAndHighlight.cpp:467-472 */
  drawTest(): void {
    this.drawScene()
  }

  /** testHdxPickAndHighlight.cpp:474-572 */
  async offscreenTest(): Promise<void> {
    const driver = this._driver!
    const selTracker = this._selTracker!
    const write = (file: string) => driver.writeToFile('color', file)

    this.drawScene()
    await write('color1_unselected.png')

    // --------------------- (active) selection --------------------------------
    // select cube2
    let mode = HdSelectionHighlightMode.HighlightModeSelect
    let selection = await this._pick(new GfVec2i(180, 390), new GfVec2i(181, 391), mode)

    selTracker.setSelection(selection)
    this.drawScene()
    await write('color2_select.png')
    TF_VERIFY(selection.getSelectedPrimPaths(mode).length === 1)
    TF_VERIFY(selection.getSelectedPrimPaths(mode)[0] === '/cube2')

    // select cube1, /protoTop:1, /protoTop:2, /protoBottom:1, /protoBottom:2
    selection = await this._pick(new GfVec2i(105, 62), new GfVec2i(328, 288), mode)
    selTracker.setSelection(selection)
    this.drawScene()
    await write('color3_select.png')
    // primPaths expected: {cube1, protoTop, protoBottom}
    TF_VERIFY(selection.getSelectedPrimPaths(mode).length === 3)
    // prims with non-empty instance indices {protoTop, protoBottom}
    let selInstances = _GetSelectedInstances(selection, mode)
    TF_VERIFY(selInstances.size === 2)
    {
      const indices = selInstances.get('/protoTop') ?? []
      TF_VERIFY(indices.length === 2)
      TF_VERIFY(indices[0]?.[0] === 1 || indices[0]?.[0] === 2)
      TF_VERIFY(indices[1]?.[0] === 1 || indices[1]?.[0] === 2)
    }
    {
      const indices = selInstances.get('/protoBottom') ?? []
      TF_VERIFY(indices.length === 2)
      TF_VERIFY(indices[0]?.[0] === 1 || indices[0]?.[0] === 2)
      TF_VERIFY(indices[1]?.[0] === 1 || indices[1]?.[0] === 2)
    }

    // --------------------- locate (rollover) selection -----------------------
    mode = HdSelectionHighlightMode.HighlightModeLocate
    // select cube0
    selection = await this._pick(new GfVec2i(472, 97), new GfVec2i(473, 98), mode)
    selTracker.setSelection(selection)
    this.drawScene()
    await write('color4_locate.png')
    TF_VERIFY(selection.getSelectedPrimPaths(mode).length === 1)
    TF_VERIFY(selection.getSelectedPrimPaths(mode)[0] === '/cube0')

    // select cube3, /protoBottom:0
    selection = await this._pick(new GfVec2i(408, 246), new GfVec2i(546, 420), mode)
    selTracker.setSelection(selection)
    this.drawScene()
    await write('color5_locate.png')
    TF_VERIFY(selection.getSelectedPrimPaths(mode).length === 2)
    selInstances = _GetSelectedInstances(selection, mode)
    TF_VERIFY(selInstances.size === 1)
    {
      const indices = selInstances.get('/protoBottom') ?? []
      TF_VERIFY(indices.length === 1)
      TF_VERIFY(indices[0]?.[0] === 0)
    }

    // deselect
    mode = HdSelectionHighlightMode.HighlightModeSelect
    selection = await this._pick(new GfVec2i(0, 0), new GfVec2i(0, 0), mode)
    selTracker.setSelection(selection)
    this.drawScene()

    // select all instances of protoTop without picking
    // This is to test whether HdSelection::AddInstance allows an empty indices
    // array to encode "all instances".
    selection.addInstance(mode, '/protoTop', [])
    selTracker.setSelection(selection)
    this.drawScene()
    // Expect to see earlier selection as well as all instances of protoTop
    await write('color6_select_all_instances.png')

    // Exercise highlighting of translucent object
    this._addTranslucentCube()
    mode = HdSelectionHighlightMode.HighlightModeLocate
    selection = await this._pick(new GfVec2i(0, 0), new GfVec2i(0, 0), mode)
    selTracker.setSelection(selection)
    this.drawScene()
    await write('color7_translucent_unselected.png')

    selection = await this._pick(new GfVec2i(320, 240), new GfVec2i(321, 241), mode)
    selTracker.setSelection(selection)
    this.drawScene()
    await write('color8_translucent_locate.png')
    TF_VERIFY(selection.getSelectedPrimPaths(mode).length === 1)
    TF_VERIFY(selection.getSelectedPrimPaths(mode)[0] === '/translucentCube')
  }

  /** testHdxPickAndHighlight.cpp:574-590 */
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

  /** testHdxPickAndHighlight.cpp:634-645 */
  override parseArgs(args: readonly string[]): void {
    for (let i = 0; i < args.length; ++i) {
      const arg = args[i]
      if (arg === '--repr') {
        this._reprName = args[++i]!
      } else if (arg === '--refineLevel') {
        this._refineLevel = parseInt(args[++i]!, 10)
      }
    }
  }
}

/** testHdxPickAndHighlight.cpp:647-668 (BasicTest, main) with the
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

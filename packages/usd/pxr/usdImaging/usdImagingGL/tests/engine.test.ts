// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImagingGL/engine.cpp,
//  pxr/usdImaging/usdImagingGL/unitTestGLDrawing.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Controller tests (no GPU) of UsdImagingGLEngine (usdImagingGL/engine.cpp),
// the interim HdxTaskControllerSceneIndex it drives and
// UsdImagingGL_UnitTestGLDrawing's argument handling
// (usdImagingGL/unitTestGLDrawing.cpp), OpenUSD 26.11.1. The image tests run
// in Safari (tests/browser/usdimaging-gl-image/run.mjs) and are listed separately.
//
// Upstream has no registered test of the engine apart from the image tests;
// each expectation cites the upstream code or the native capture that
// determines it. The renderer plugin and render delegate here are
// registration-side doubles (what a plugin library provides upstream); the
// behaviour under test is the ported engine and task controller.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import {
  AovDescriptor as HdAovDescriptor, Bprim as HdBprim, Format as HdFormat, LegacyTaskSchema as HdLegacyTaskSchema,
  RenderDelegate as HdRenderDelegate, RendererCreateArgsSchema as HdRendererCreateArgsSchema,
  RendererPlugin as HdRendererPlugin, RendererPluginRegistry as HdRendererPluginRegistry, Rprim as HdRprim,
  SceneIndexPluginRegistry as HdSceneIndexPluginRegistry, Sprim as HdSprim, XformSchema as HdXformSchema,
  AovTokens as HdAovTokens, PrimTypeTokens as HdPrimTypeTokens, LegacyDisplayStyleSchema as HdLegacyDisplayStyleSchema,
  SceneIndexNameRegistry as HdSceneIndexNameRegistry,
  type RenderSettingsMap as HdRenderSettingsMap,
} from 'typescript-usd/hd'
import { Frustum as GfFrustum, Matrix4d as GfMatrix4d, Vec3d as GfVec3d, Vec4d as GfVec4d, Vec4f as GfVec4f } from 'typescript-usd/gf'
import { SimpleLight as GlfSimpleLight, SimpleMaterial as GlfSimpleMaterial } from 'typescript-usd/glf'
import { Stage as UsdStage, TimeCode as UsdTimeCode } from 'typescript-usd/usd'
import { CullStyle as HdCullStyle } from 'typescript-usd/hd'
import { UsdImagingGLEngine } from '../src/engine.ts'
import { UsdImagingGLCullStyle, UsdImagingGLDrawMode, UsdImagingGLRenderParams } from '../src/renderParams.ts'
import { UsdImagingGL_UnitTestGLDrawing, _StreamFloat } from '../src/unitTestGLDrawing.ts'
import type { RenderTaskParams as HdxRenderTaskParams } from 'typescript-usd/hdx'

class _TestRenderDelegate extends HdRenderDelegate {
  constructor(_settingsMap?: HdRenderSettingsMap) { super() }
  getSupportedRprimTypes(): string[] { return [] }
  getSupportedSprimTypes(): string[] { return [] }
  getSupportedBprimTypes(): string[] { return [] }
  createRprim(): HdRprim { throw new Error('unsupported') }
  destroyRprim(): void {}
  createSprim(): HdSprim { throw new Error('unsupported') }
  destroySprim(): void {}
  createBprim(): HdBprim { throw new Error('unsupported') }
  destroyBprim(): void {}
  CommitResources(): void {}
  // The Storm task graph, as HdStRenderDelegate::RequiresStormTasks.
  override requiresStormTasks(): boolean { return true }
  // HdStRenderDelegate::GetDefaultAovDescriptor (hdSt/renderDelegate.cpp:
  // 361-401) for color and depth.
  override getDefaultAovDescriptor(name: string): HdAovDescriptor {
    if (name === HdAovTokens.color) return new HdAovDescriptor(HdFormat.HdFormatFloat16Vec4, true)
    if (name === HdAovTokens.depth) return new HdAovDescriptor(HdFormat.HdFormatFloat32, true)
    return new HdAovDescriptor()
  }
}

class _TestRendererPlugin extends HdRendererPlugin {
  isSupported(_args: HdRendererCreateArgsSchema): boolean { return true }
  createRenderDelegate(settingsMap?: HdRenderSettingsMap): HdRenderDelegate | null {
    return new _TestRenderDelegate(settingsMap)
  }
  deleteRenderDelegate(): void {}
}

const fixtures = new URL('../../usdImaging/tests/fixtures/', import.meta.url)
let engine: UsdImagingGLEngine | null = null

beforeEach(() => {
  HdRendererPluginRegistry._resetInstance()
  HdSceneIndexPluginRegistry._resetInstance()
  UsdImagingGLEngine._resetAppSceneIndicesRegistration()
  HdRendererPluginRegistry.define('TestPlugin', () => new _TestRendererPlugin(), { displayName: 'Test', priority: 0 })
  engine = new UsdImagingGLEngine({ gpuEnabled: false })
})
afterEach(() => {
  engine?.destroy()
  engine = null
})

function controllerPath(e: UsdImagingGLEngine): string {
  const paths = e._getTerminalSceneIndexForTesting()!.getChildPrimPaths('/')
  return paths.find(p => p.startsWith('/_UsdImaging_'))!
}

describe('UsdImagingGLEngine renderer plugin and scene index chain', () => {
  it('picks the default plugin and puts the task controller under /_UsdImaging_<plugin>_<id> (engine.cpp:1512-1568, 1667-1677)', () => {
    expect(engine!.getCurrentRendererId()).toBe('TestPlugin')
    expect(UsdImagingGLEngine.getRendererPlugins()).toEqual(['TestPlugin'])
    // engine.cpp:1463-1484: other plugins keep their display name.
    expect(UsdImagingGLEngine.getRendererDisplayName('TestPlugin')).toBe('Test')
    expect(controllerPath(engine!)).toMatch(/^\/_UsdImaging_Test_[0-9a-f]+$/)
  })

  it('publishes the Storm task graph prims (taskControllerSceneIndex.cpp:1136-1205) and the free camera (:1102-1106)', () => {
    const si = engine!._getTerminalSceneIndexForTesting()!
    const prefix = controllerPath(engine!)
    expect(si.getPrim(`${prefix}/camera`).primType).toBe(HdPrimTypeTokens.camera)
    for (const task of ['simpleLightTask', 'shadowTask', 'skydomeTask', 'renderTask_defaultMaterialTag', 'renderTask_masked',
      'renderTask_additive', 'renderTask_translucent', 'renderTask_volume', 'aovInputTask', 'oitResolveTask',
      'selectionTask', 'colorCorrectionTask', 'visualizeAovTask', 'presentTask', 'pickTask', 'boundingBoxTask']) {
      const prim = si.getPrim(`${prefix}/${task}`)
      expect(prim.primType, task).toBe(HdPrimTypeTokens.task)
      expect(HdLegacyTaskSchema.getFromParent(prim.dataSource).isDefined(), task).toBe(true)
    }
    // The rendering task order of _GetRenderingTaskPathsForStorm
    // (taskControllerSceneIndex.cpp:1259-1305) and GetRenderingTaskPaths
    // (:1344-1371): shadows and color correction off, no viewport AOV yet
    // (so the AOV visualization task), then presentation.
    const tcsi = engine!._getTaskControllerSceneIndexForTesting()!
    expect(tcsi.getRenderingTaskPaths().map(p => p.slice(prefix.length + 1))).toEqual([
      'simpleLightTask', 'skydomeTask', 'renderTask_defaultMaterialTag', 'renderTask_masked', 'renderTask_additive',
      'renderTask_translucent', 'aovInputTask', 'boundingBoxTask', 'renderTask_volume', 'oitResolveTask',
      'selectionTask', 'visualizeAovTask', 'presentTask'])
  })

  it('creates color and depth render buffers for SetRendererAov(color) (taskControllerSceneIndex.cpp:1392-1464, 1516-1608)', () => {
    engine!.setRenderViewport(new GfVec4d(0, 0, 64, 32))
    engine!.setRendererAov('color')
    const si = engine!._getTerminalSceneIndexForTesting()!
    const prefix = controllerPath(engine!)
    expect(si.getChildPrimPaths(`${prefix}/AOVs`).sort()).toEqual([`${prefix}/AOVs/color`, `${prefix}/AOVs/depth`])
    expect(si.getPrim(`${prefix}/AOVs/color`).primType).toBe(HdPrimTypeTokens.renderBuffer)
    const desc = engine!._getTaskControllerSceneIndexForTesting()!.getRenderOutputSettings('color')
    expect(desc.format).toBe(HdFormat.HdFormatFloat16Vec4)
    expect(desc.multiSampled).toBe(true)
  })

  it('moves the free camera with SetCameraState and makes it the render tasks camera (taskControllerSceneIndex.cpp:2359-2385, 2507-2556)', () => {
    const view = new GfMatrix4d().setTranslate(new GfVec3d(1, 2, -10))
    const frustum = new GfFrustum()
    frustum.setPerspective(60.0, 2.0, 1, 100000.0)
    engine!.setCameraState(view, frustum.computeProjectionMatrix())
    const si = engine!._getTerminalSceneIndexForTesting()!
    const prefix = controllerPath(engine!)
    const xform = HdXformSchema.getFromParent(si.getPrim(`${prefix}/camera`).dataSource).getMatrix()!.getTypedValue(0) as GfMatrix4d
    // GfCamera::SetFromViewAndProjectionMatrix: the transform is the inverse
    // of the view matrix.
    expect(xform.getInverse().equals(view)).toBe(true)
    const ds = HdLegacyTaskSchema.getFromParent(si.getPrim(`${prefix}/renderTask_defaultMaterialTag`).dataSource)
    const params = ds.getParameters()!.GetValue(0) as HdxRenderTaskParams
    expect(params.camera).toBe(`${prefix}/camera`)
  })

  it('adds a simpleLight prim per light of SetLightingState (taskControllerSceneIndex.cpp:2195-2271)', () => {
    const light = new GlfSimpleLight()
    light.setPosition(new GfVec4f(0, -0.5, 0.5, 0))
    engine!.setLightingState([light, new GlfSimpleLight()], new GlfSimpleMaterial(), new GfVec4f(0.2, 0.2, 0.2, 1))
    const si = engine!._getTerminalSceneIndexForTesting()!
    const prefix = controllerPath(engine!)
    expect(si.getChildPrimPaths(`${prefix}/lights`).sort()).toEqual([`${prefix}/lights/light_0`, `${prefix}/lights/light_1`])
    expect(si.getPrim(`${prefix}/lights/light_0`).primType).toBe(HdPrimTypeTokens.simpleLight)
    engine!.setLightingState([light], new GlfSimpleMaterial(), new GfVec4f(0.2, 0.2, 0.2, 1))
    expect(si.getChildPrimPaths(`${prefix}/lights`)).toEqual([`${prefix}/lights/light_0`])
  })

  it('never schedules the shadow task, even for a shadow-casting light (usdview does not render shadows)', () => {
    // HdxSimpleLightTaskParams.enableShadows defaults to false
    // (hdx/simpleLightTask.h:124) and only HdxTaskController(SceneIndex)::
    // SetEnableShadows sets it (taskControllerSceneIndex.cpp:2032-2046, called by no
    // caller in usdImagingGL or usdviewq); the shadow task runs only when it
    // is set (taskControllerSceneIndex.cpp:1247-1272).
    const light = new GlfSimpleLight()
    light.setPosition(new GfVec4f(0, -0.5, 0.5, 0))
    light.setHasShadow(true)
    engine!.setLightingState([light], new GlfSimpleMaterial(), new GfVec4f(0.2, 0.2, 0.2, 1))
    const prefix = controllerPath(engine!)
    const paths = engine!._getTaskControllerSceneIndexForTesting()!.getRenderingTaskPaths()
    expect(paths).toContain(`${prefix}/simpleLightTask`)
    expect(paths).not.toContain(`${prefix}/shadowTask`)
  })

  it('gives a dome light without a texture the packaged default (taskControllerSceneIndex.cpp:727-738; native capture defaultDomeLight)', () => {
    const native = JSON.parse(readFileSync(new URL('fixtures/native/defaultDomeLight/expected.json', import.meta.url), 'utf8'))
    const prefix = controllerPath(engine!)
    const si = engine!._getTerminalSceneIndexForTesting()!
    for (const row of native.payload.rows as { zUp: boolean, cameraLight: boolean, path: string, primType: string, resourceName: string }[]) {
      // usdview's lights (stageView.py:1452-1483): the camera light, then the
      // default dome light, which carries no texture.
      const lights: GlfSimpleLight[] = []
      if (row.cameraLight) lights.push(new GlfSimpleLight())
      const dome = new GlfSimpleLight()
      dome.setIsDomeLight(true)
      lights.push(dome)
      engine!.setLightingState(lights, new GlfSimpleMaterial(), new GfVec4f(0.01, 0.01, 0.01, 1))
      const path = `${prefix}/lights/light_${lights.length - 1}`
      expect(path.slice(prefix.length)).toBe(row.path.slice(row.path.indexOf('/lights/')))
      const prim = si.getPrim(path)
      expect(prim.primType).toBe(row.primType)
      const texture = (prim.dataSource!.Get('light') as { Get(n: string): { GetValue(t: number): { getAssetPath(): string } } }).Get('texture:file').GetValue(0)
      expect(texture.getAssetPath().split('/').pop()).toBe(row.resourceName)
    }
  })

  it('populates the stage under the delegate id and applies the refine level of the complexity (engine.cpp:494-586, 2510-2580)', async () => {
    const stage = (await UsdStage.open(new URL('gprims/mesh.usda', fixtures).pathname))!
    const params = new UsdImagingGLRenderParams()
    params.frame = UsdTimeCode.Default()
    params.complexity = Math.fround(1.2)
    engine!.PrepareBatch(stage.getPrim('/')!, params)
    const si = engine!._getTerminalSceneIndexForTesting()!
    const mesh = si.getPrim('/Mesh')
    expect(mesh.primType).toBe('mesh')
    const style = HdLegacyDisplayStyleSchema.getFromParent(mesh.dataSource)
    expect(style.getRefineLevel()!.getTypedValue(0)).toBe(2)
  })

  it('publishes SetSelected / ClearSelected for HdxSelectionSceneIndexObserver (engine.cpp:1047-1102, selectionSceneIndexObserver.cpp:325-416)', async () => {
    const stage = (await UsdStage.open(new URL('gprims/mesh.usda', fixtures).pathname))!
    const params = new UsdImagingGLRenderParams()
    params.frame = UsdTimeCode.Default()
    engine!.PrepareBatch(stage.getPrim('/')!, params)
    const { SelectionSceneIndexObserver } = await import('typescript-usd/hdx')
    const observer = new SelectionSceneIndexObserver()
    observer.setSceneIndex(engine!._getTerminalSceneIndexForTesting()!)
    expect(observer.getSelection().getAllSelectedPrimPaths()).toEqual([])
    engine!.setSelected(['/Mesh'])
    expect(observer.getSelection().getAllSelectedPrimPaths()).toEqual(['/Mesh'])
    engine!.clearSelected()
    expect(observer.getSelection().getAllSelectedPrimPaths()).toEqual([])
    engine!.addSelected('/DefaultMesh', -1)
    expect(observer.getSelection().getAllSelectedPrimPaths()).toEqual(['/DefaultMesh'])
  })

  it('turns render params into render task params (engine.cpp:2658-2731)', async () => {
    const stage = (await UsdStage.open(new URL('gprims/mesh.usda', fixtures).pathname))!
    const params = new UsdImagingGLRenderParams()
    params.drawMode = UsdImagingGLDrawMode.DRAW_POINTS
    params.cullStyle = UsdImagingGLCullStyle.CULL_STYLE_BACK_UNLESS_DOUBLE_SIDED
    params.showGuides = true
    engine!.setRendererAov('color')
    // RenderBatch up to _Execute (engine.cpp:713-761): the collection and the
    // render params handed to the task controller; executing the tasks needs
    // Storm (the Safari image tests).
    engine!.PrepareBatch(stage.getPrim('/')!, params)
    const e = engine as unknown as { _renderCollection: unknown, _prepareRender(p: unknown): void }
    ;(UsdImagingGLEngine as unknown as { _updateHydraCollection(c: unknown, r: string[], p: unknown): void })
      ._updateHydraCollection(e._renderCollection, ['/'], params)
    engine!._getTaskControllerSceneIndexForTesting()!.setCollection(e._renderCollection as never)
    e._prepareRender(params)
    const si = engine!._getTerminalSceneIndexForTesting()!
    const prefix = controllerPath(engine!)
    const task = HdLegacyTaskSchema.getFromParent(si.getPrim(`${prefix}/renderTask_defaultMaterialTag`).dataSource)
    const taskParams = task.getParameters()!.GetValue(0) as HdxRenderTaskParams
    expect(taskParams.enableLighting).toBe(false)
    expect(taskParams.cullStyle).toBe(HdCullStyle.HdCullStyleBackUnlessDoubleSided)
    expect(taskParams.alphaThreshold).toBe(Math.fround(0.1))
    // The task controller keeps its blend state for the material tag
    // (taskControllerSceneIndex.cpp:235-245).
    expect(taskParams.enableAlphaToCoverage).toBe(true)
    expect(task.getRenderTags()!.getTypedValue(0)).toEqual(['geometry', 'guide', 'proxy'])
    const collection = task.getCollection()!.getTypedValue(0)
    expect(collection.getReprSelector().at(0)).toBe('points')
    expect(collection.getMaterialTag()).toBe('defaultMaterialTag')
  })

  it('registers its terminal scene index by name via emulation (testUsdImagingGLHdGp.cpp:157-178)', () => {
    // sceneIndexAdapterSceneDelegate.cpp:161-167 names it "[Terminal SI] "
    // + HdRenderIndex::GetInstanceName(), which is "Renderer: <display name>"
    // for a render index made without an instance name (renderIndex.cpp:968-986).
    const registry = HdSceneIndexNameRegistry.GetInstance()
    expect(registry.getRegisteredNames()).toContain('[Terminal SI] Renderer: Test')
    expect(registry.getNamedSceneIndex('[Terminal SI] Renderer: Test'))
      .toBe(engine!._getTerminalSceneIndexForTesting())
    expect(registry.getNamedSceneIndex('[Terminal SI] Renderer: Missing')).toBeUndefined()
  })
})

class _ArgsOnlyTest extends UsdImagingGL_UnitTestGLDrawing {
  outputs: string[] = []
  complexities: number[] = []
  constructor() { super(null as never) }
  initTest(): void {}
  drawTest(): void {
    this.outputs.push(this.getOutputFilePath())
    this.complexities.push(this._getComplexity())
  }
}

describe('UsdImagingGL_UnitTestGLDrawing arguments (unitTestGLDrawing.cpp:844-1070)', () => {
  // The registered commands and the image names the native runs wrote
  // (tests/fixtures/testenvImages/<test>/capture.json, FIXTURES.md).
  const fixtureDir = new URL('./fixtures/testenvImages/', import.meta.url)
  const captures = readdirSync(fixtureDir).filter(d => existsSync(new URL(`${d}/capture.json`, fixtureDir)))
    .map(d => JSON.parse(readFileSync(new URL(`${d}/capture.json`, fixtureDir), 'utf8')).payload as
      { test: string, command: string, images: { name: string, written: boolean }[] })
    .filter(p => p.command.split(/\s+/)[0]!.endsWith('/testUsdImagingGLBasicDrawing'))

  it('parses every registered command of the program', async () => {
    expect(captures.length).toBeGreaterThan(50)
    for (const p of captures) {
      const t = new _ArgsOnlyTest()
      await t.runTest(p.command.split(/\s+/))
      expect(t.outputs.length, p.test).toBeGreaterThan(0)
    }
  })

  it('names the -complexities images as the native run wrote them', async () => {
    const p = captures.find(c => c.test === 'testUsdImagingGLComplexityOsd3')!
    const t = new _ArgsOnlyTest()
    await t.runTest(p.command.split(/\s+/))
    expect(t.outputs).toEqual(p.images.map(i => i.name))
    expect(t.complexities).toEqual([1.0, 1.1, 1.2])
  })

  it('reads -widgetSize, -clear, -cullStyle and the purposes', async () => {
    const t = new _ArgsOnlyTest()
    await t.runTest(['testUsdImagingGLBasicDrawing', '-offscreen', '-widgetSize', '320', '240', '-clear', '0', '0', '0', '1',
      '-cullStyle', 'back', '-guidesPurpose', 'show', '-shading', 'wireOnSurface', '-renderSetting', 'volumeRaymarchingStepSize', 'float', '0.05'])
    expect([t.getWidth(), t.getHeight()]).toEqual([320, 240])
    expect(t.getClearColor().equals(new GfVec4f(0, 0, 0, 1))).toBe(true)
    expect(t.getCullStyle()).toBe(UsdImagingGLCullStyle.CULL_STYLE_BACK)
    expect(t.isShowGuides()).toBe(true)
    expect(t.getDrawMode()).toBe(UsdImagingGLDrawMode.DRAW_WIREFRAME_ON_SURFACE)
    expect(t.getRenderSettings().get('volumeRaymarchingStepSize')).toEqual({ type: 'float', value: Math.fround(0.05) })
    // unitTestGLDrawing.cpp:525-556 defaults.
    const d = new _ArgsOnlyTest()
    await d.runTest(['testUsdImagingGLBasicDrawing', '-offscreen'])
    expect([d.getWidth(), d.getHeight()]).toEqual([640, 480])
    expect(d.getClearColor().equals(new GfVec4f(1.0, Math.fround(0.5), Math.fround(0.1), 1.0))).toBe(true)
    expect(d.getTimes()).toEqual([-999])
  })

  it('prints floats as std::ostream does', () => {
    expect(['1', '1.1', '1.2', '0.5', '1e-07'].map(s => _StreamFloat(Number(s)))).toEqual(['1', '1.1', '1.2', '0.5', '1e-07'])
  })
})

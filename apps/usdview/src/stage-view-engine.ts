// Ported from OpenUSD 26.11.1: pxr/imaging/hdx/taskControllerSceneIndex.h,
//  pxr/usdImaging/usdviewq/stageView.py
// Copyright 2016, 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// usdview's use of UsdImagingGLEngine (OpenUSD 26.11.1
// pxr/usdImaging/usdviewq/stageView.py), on typescript-usd/usdImagingGL: one
// engine per stage, given the state StageView hands it each frame
// (_renderTask / paintGL, stageView.py:1395-1525) and the render params of
// renderSinglePass (stageView.py:1146-1195). All imaging (scene indices,
// Hydra, the task controller, Storm on HgiWebGPU) is the engine's.
//
// What usdview does with the GL framebuffer is done here with WebGPU, as
// usdview's own code (not the engine's):
//  - presentation: the viewer manages the AOVs it draws overlays into, so it
//    turns the engine's HdxPresentTask off (SetEnablePresentation(false), the
//    use taskControllerSceneIndex.h:270-274 documents), reads the color and
//    depth AOV render buffers (UsdImagingGLEngine::GetAovRenderBuffer) and
//    presents them itself (viewport-presentation.ts, which also applies the
//    sRGB curve of usdview's colorCorrectionMode sRGB);
//  - Hidden Surface Wireframe (stageView.py:1485-1510): usdview draws
//    DRAW_GEOM_ONLY, clears the framebuffer's color but keeps its depth, then
//    draws DRAW_WIREFRAME, which HgiInterop composites depth tested against
//    that depth. Here the first pass's depth AOV is kept and the second
//    pass's samples behind it are replaced with the clear color
//    (hidden-surface-wireframe.ts). glPolygonOffset(1, 1) on the first pass
//    is a small depth tolerance there.
//
// The rest is the engine API usdview calls (stageView.py): scene cameras by
// path (SetCameraPath), picking (TestIntersection, async here because
// WebGPU reads the id buffers back asynchronously), selection highlighting
// (ClearSelected / AddSelected / SetSelectionColor and the highlight render
// param) and convergence (IsConverged: Storm's texture loads are
// asynchronous here, hdSt/src/renderPass.ts, so a view is drawn again until
// the engine is converged, stageView.py:1543-1548).
import type { Stage, Prim as UsdPrim } from 'typescript-usd/usd'
import { Notice as UsdNotice, TimeCode as UsdTimeCode, TraverseInstanceProxies } from 'typescript-usd/usd'
import { Notice as TfNotice, type NoticeKey as TfNoticeKey } from 'typescript-usd/tf'
import { Imageable as UsdGeomImageable, type PurposeInfo as UsdGeomPurposeInfo } from 'typescript-usd/usdGeom'
import { HgiTokens } from 'typescript-usd/hgi'
import { HgiWebGPU, HgiWebGPUGlslShaderBodyTranslator, type HgiWebGPUTexture } from 'typescript-usd/hgiWebGPU'
import { Vec4f as GfVec4f, Vec2d as GfVec2d, Vec2f as GfVec2f, Vec2i as GfVec2i, Range2f as GfRange2f, Rect2i as GfRect2i, Matrix4d as GfMatrix4d, type Frustum as GfFrustum } from 'typescript-usd/gf'
import { Framing as CameraUtilFraming, ConformWindowPolicy as CameraUtilConformWindowPolicy } from 'typescript-usd/cameraUtil'
import { SimpleLight as GlfSimpleLight, SimpleMaterial as GlfSimpleMaterial } from 'typescript-usd/glf'
import type { RenderBuffer as HdStRenderBuffer } from 'typescript-usd/hdSt'
import { _RegisterShaderResources as Hdx_RegisterShaderResources } from 'typescript-usd/hdx'
import { UsdShaders_RegisterShaderNodesAsync } from 'typescript-usd/usdShaders'
import { UsdHydra_RegisterShaderNodesAsync } from 'typescript-usd/usdHydra'
import { Engine as UsdImagingGLEngine, RenderParams as UsdImagingGLRenderParams, DrawMode as UsdImagingGLDrawMode, CullStyle as UsdImagingGLCullStyle, type IntersectionResult as UsdImagingGLIntersectionResult } from 'typescript-usd/usdImagingGL'
import 'typescript-usd/hdSt'
import 'typescript-usd/hdStorm'
// The plugins upstream loads with UsdImaging: usdSkelImaging (skinning),
// usdVolImaging (OpenVDBAsset and Field3DAsset fields) and hioOpenVDB (.vdb
// field texture data).
import 'typescript-usd/usdSkelImaging'
import 'typescript-usd/usdVolImaging'
import 'typescript-usd/hioOpenVDB'
import { backgroundColors, complexities, displayPurposes, type DisplaySettings } from './display-settings'
import { selectionColors, type RenderMode } from './render-modes'
import type { PrimSelection } from './contracts'
import { HiddenSurfaceWireframe } from './hidden-surface-wireframe'
import { frameRecorderLightingState } from './frame-recorder-lighting'

/** usdviewq/common.py ShadedRenderModes. */
const shadedModes = new Set<RenderMode>(['Smooth Shaded', 'Flat Shaded', 'WireframeOnSurface', 'Geom Smooth', 'Geom Flat'])

/** stageView.py:585-597 (_renderModeDict). */
export const drawModes: Readonly<Record<RenderMode, UsdImagingGLDrawMode>> = {
  'Wireframe': UsdImagingGLDrawMode.DRAW_WIREFRAME,
  'WireframeOnSurface': UsdImagingGLDrawMode.DRAW_WIREFRAME_ON_SURFACE,
  'Smooth Shaded': UsdImagingGLDrawMode.DRAW_SHADED_SMOOTH,
  'Points': UsdImagingGLDrawMode.DRAW_POINTS,
  'Flat Shaded': UsdImagingGLDrawMode.DRAW_SHADED_FLAT,
  'Geom Only': UsdImagingGLDrawMode.DRAW_GEOM_ONLY,
  'Geom Smooth': UsdImagingGLDrawMode.DRAW_GEOM_SMOOTH,
  'Geom Flat': UsdImagingGLDrawMode.DRAW_GEOM_FLAT,
  'Hidden Surface Wireframe': UsdImagingGLDrawMode.DRAW_WIREFRAME,
}

/** One-time registration the engine's plugins do when they load: hdx's
 *  shader resources (plugInfo.json) and the usdShaders and usdHydra Sdr nodes
 *  Storm's material network processing looks up. */
let registration: Promise<void> | undefined
export function prepareStorm(): Promise<void> {
  return registration ??= (async () => {
    Hdx_RegisterShaderResources()
    await UsdShaders_RegisterShaderNodesAsync()
    await UsdHydra_RegisterShaderNodesAsync()
  })().catch(error => { registration = undefined; throw error })
}

/** An HgiWebGPU on the viewer's device, translating Storm's GLSL shader
 *  bodies to WGSL. */
export function createHgi(device: GPUDevice): HgiWebGPU {
  const hgi = new HgiWebGPU(device)
  hgi.setShaderBodyTranslator(HgiWebGPUGlslShaderBodyTranslator)
  return hgi
}

export interface StormCamera {
  /** World to view (GfFrustum::ComputeViewMatrix). */
  view: GfMatrix4d
  /** GfFrustum::ComputeProjectionMatrix (OpenGL clip space, as Hydra takes it). */
  projection: GfMatrix4d
  /** The camera position, for usdview's camera light. */
  eye: readonly [number, number, number]
  /** The active scene camera (stageView.py getActiveSceneCamera), drawn by
   *  path; absent or null for the free camera, drawn from view and projection. */
  scenePath?: string | null
  /** stageView.py:1239-1254 computeWindowPolicy for a scene camera: Fit when
   *  masks or reticles show (_fitCameraInViewport), else MatchVertically. */
  fitWindow?: boolean
}

/** Whose lighting state the engine is given: usdview's (the viewer's, always
 *  by default) or usdrecord's frame recorder (frame-recorder-lighting.ts; for
 *  comparisons with usdrecord images only). */
export type LightingSource = 'usdview' | 'frameRecorder'

/** usdviewq/selectionDataModel.py:18 */
const ALL_INSTANCES = -1

/** stageView.py:1452-1483: the lights usdview hands the engine, in shaded
 *  render modes only: the camera light (ambient 0, at the eye) and the
 *  default dome light (rotated for Z-up stages; its texture is the task
 *  controller's default, taskControllerSceneIndex.cpp:727-738). */
export function usdviewLights(settings: DisplaySettings, camera: StormCamera, zUp: boolean): GlfSimpleLight[] {
  const lights: GlfSimpleLight[] = []
  if (!shadedModes.has(settings.renderMode)) return lights
  if (settings.cameraLightEnabled) {
    const light = new GlfSimpleLight()
    light.setAmbient(new GfVec4f(0, 0, 0, 0))
    light.setPosition(new GfVec4f(camera.eye[0], camera.eye[1], camera.eye[2], 1))
    light.setTransform(camera.view.getInverse())
    lights.push(light)
  }
  if (settings.domeLightEnabled) {
    const light = new GlfSimpleLight()
    light.setIsDomeLight(true)
    if (zUp) light.setTransform(new GfMatrix4d(1).setRotate({ axis: [1, 0, 0], angle: 90 }))
    lights.push(light)
  }
  return lights
}

/** stageView.py:1452-1483: usdview's default material in shaded modes. */
function usdviewMaterial(settings: DisplaySettings): GlfSimpleMaterial {
  const material = new GlfSimpleMaterial()
  if (shadedModes.has(settings.renderMode)) {
    const kA = settings.defaultMaterialAmbient, kS = settings.defaultMaterialSpecular
    material.setAmbient(new GfVec4f(kA, kA, kA, 1.0))
    material.setSpecular(new GfVec4f(kS, kS, kS, 1.0))
    material.setShininess(32.0)
  }
  return material
}

/** stageView.py:320-341 _ComputeCameraFraming */
function computeCameraFraming(viewport: [number, number, number, number], renderBufferSize: [number, number]): CameraUtilFraming {
  const [x, y, w, h] = viewport
  const [renderBufferWidth, renderBufferHeight] = renderBufferSize
  const displayWindow = new GfRange2f(
    new GfVec2f(x, renderBufferHeight - y - h),
    new GfVec2f(x + w, renderBufferHeight - y))
  const renderBufferRect = new GfRect2i(new GfVec2i(0, 0), renderBufferWidth, renderBufferHeight)
  const dataWindow = renderBufferRect.getIntersection(new GfRect2i(new GfVec2i(x, renderBufferHeight - y - h), w, h))
  return new CameraUtilFraming(displayWindow, dataWindow)
}

/** The engine for one stage, driven as usdview's StageView drives it. */
export class StageViewEngine {
  private readonly _engine: UsdImagingGLEngine
  private readonly _params = new UsdImagingGLRenderParams()
  private readonly _root: UsdPrim
  private readonly _device: GPUDevice
  private _settings: DisplaySettings
  private _zUp = false
  private _hiddenSurface: HiddenSurfaceWireframe | undefined
  private _destroyed = false
  /** See LightingSource. */
  lightingSource: LightingSource = 'usdview'
  private _drawableCount: { key: string, count: number } | undefined
  private readonly _stageChanged: TfNoticeKey

  constructor(hgi: HgiWebGPU, private readonly _stage: Stage, time: number, settings: DisplaySettings, _width: number, _height: number) {
    this._device = hgi.getPrimaryDevice()
    this._engine = new UsdImagingGLEngine({ driver: { name: HgiTokens.renderDriver, driver: hgi } })
    // stageView.py:670-673: Storm renders to AOVs once usdview asks for color.
    this._engine.setRendererAov('color')
    // See the header: the viewer presents the AOVs itself.
    this._engine.setEnablePresentation(false)
    this._root = _stage.getPrim('/')!
    this._settings = settings
    this._params.frame = new UsdTimeCode(time)
    this.applySettings(settings, false)
    // Resyncs change which prims are drawable (GetDrawableCount).
    this._stageChanged = TfNotice.Register(UsdNotice.ObjectsChanged, (notice: UsdNotice.ObjectsChanged) => {
      if (!notice.getResyncedPaths().empty()) this._drawableCount = undefined
    }, _stage)
  }

  /** renderSinglePass's frame (stageView.py:1155): the engine sets the
   *  scene time in PrepareBatch (engine.cpp:494-586). */
  SetTime(time: number): void {
    this._params.frame = new UsdTimeCode(time)
    this._engine.PrepareBatch(this._root, this._params)
  }

  /** The render params renderSinglePass sets from the view settings
   *  (stageView.py:1154-1180). */
  applySettings(settings: DisplaySettings, zUp: boolean): void {
    this._settings = settings
    this._zUp = zUp
    const p = this._params
    // usdAppUtils/complexityArgs.py:40-47: complexity 1.0, 1.1, 1.2, 1.3.
    p.complexity = Math.fround(1.0 + complexities[settings.complexity].level / 10)
    const purposes = displayPurposes(settings)
    p.showGuides = purposes.includes('guide')
    p.showProxy = purposes.includes('proxy')
    p.showRender = purposes.includes('render')
    p.cullStyle = settings.cullBackfaces ? UsdImagingGLCullStyle.CULL_STYLE_BACK_UNLESS_DOUBLE_SIDED : UsdImagingGLCullStyle.CULL_STYLE_NOTHING
    p.gammaCorrectColors = false
    // stageView.py:1167 sets the misspelled enableSamlpeAlphaToCoverage, so
    // the param keeps its default, false (usdImagingGL/renderParams.h).
    p.enableSampleAlphaToCoverage = false
    p.enableSceneMaterials = settings.enableSceneMaterials
    p.enableSceneLights = settings.sceneLightsEnabled
    const [r, g, b, a] = backgroundColors[settings.background]
    p.clearColor = new GfVec4f(r, g, b, a)
    // stageView.py:1184-1187
    this._engine.setSelectionColor(new GfVec4f(...selectionColors[settings.highlightColor]))
    this._engine.setRendererSetting('domeLightCameraVisibility', settings.domeLightTexturesVisible)
  }

  /** stageView.py:1086-1114 _processSelection: the LCD prims of the
   *  selection, each with its selected instances or all of them; and
   *  renderSinglePass's highlight param (stageView.py:1168), which
   *  _renderTask sets from the selection highlight mode (:1510-1519). */
  setSelection(lcdSelections: readonly PrimSelection[], highlight: boolean): void {
    this._engine.clearSelected()
    for (const selection of lcdSelections) {
      if (selection.path === '/') continue
      if (selection.instanceIndices) {
        for (const instanceIndex of selection.instanceIndices) this._engine.addSelected(selection.path, instanceIndex)
      } else this._engine.addSelected(selection.path, ALL_INSTANCES)
    }
    this._params.highlight = highlight
  }

  /** stageView.py:1395-1525 (_renderTask) with renderSinglePass. */
  Render(camera: StormCamera, width: number, height: number): void {
    if (this._destroyed) throw new Error('The engine was destroyed.')
    width = Math.max(1, width); height = Math.max(1, height)
    const engine = this._engine
    engine.setRenderBufferSize(new GfVec2i(width, height))
    engine.setFraming(computeCameraFraming([0, 0, width, height], [width, height]))
    if (camera.scenePath) {
      // stageView.py:1424-1430: a scene camera is set by path; Hydra conforms
      // it to the framing with the window policy (stageView.py:1239-1254).
      engine.setOverrideWindowPolicy(camera.fitWindow ? CameraUtilConformWindowPolicy.CameraUtilFit : CameraUtilConformWindowPolicy.CameraUtilMatchVertically)
      engine.setCameraPath(camera.scenePath)
    } else {
      // stageView.py:1431-1435: the free camera's matrices, conformed to the
      // window already (viewer-camera.ts).
      engine.setOverrideWindowPolicy(CameraUtilConformWindowPolicy.CameraUtilMatchVertically)
      engine.setCameraState(camera.view, camera.projection)
    }
    if (this.lightingSource === 'frameRecorder') {
      const { lights, material, sceneAmbient } = frameRecorderLightingState(camera)
      engine.setLightingState(lights, material, sceneAmbient)
    } else engine.setLightingState(usdviewLights(this._settings, camera, this._zUp), usdviewMaterial(this._settings), new GfVec4f(0.01, 0.01, 0.01, 1.0))
    const mode = this._settings.renderMode
    if (mode === 'Hidden Surface Wireframe') {
      this._params.drawMode = UsdImagingGLDrawMode.DRAW_GEOM_ONLY
      engine.Render(this._root, this._params)
      this._hiddenSurface ??= new HiddenSurfaceWireframe(this._device)
      this._hiddenSurface.keepDepth(this._texture('depth', true)!)
      this._params.drawMode = drawModes[mode]
      engine.Render(this._root, this._params)
      const aov = this.GetAovTextures()
      this._hiddenSurface.composite(aov.colorMSAA, aov.depthMSAA, aov.color, this._params.clearColor)
      return
    }
    this._params.drawMode = drawModes[mode]
    engine.Render(this._root, this._params)
  }

  private _texture(aov: 'color' | 'depth', multisampled: boolean): GPUTexture | undefined {
    const buffer = this._engine.getAovRenderBuffer(aov) as HdStRenderBuffer | null
    const texture = buffer?.getResource(multisampled)?.Get() as HgiWebGPUTexture | undefined
    return texture?.getTextureId() ?? undefined
  }

  /** The AOV textures of the last Render: the multisampled color and depth
   *  (overlays draw into these) and the resolved color. */
  GetAovTextures(): { color: GPUTexture, colorMSAA: GPUTexture, depthMSAA: GPUTexture } {
    const color = this._texture('color', false), colorMSAA = this._texture('color', true), depthMSAA = this._texture('depth', true)
    if (!color || !colorMSAA || !depthMSAA) throw new Error('Storm has not allocated its render buffers.')
    return { color, colorMSAA, depthMSAA }
  }

  /** UsdImagingGLEngine::IsConverged (engine.cpp:786-806): false while a
   *  texture is still loading (hdSt/src/renderPass.ts IsConverged); usdview
   *  draws again until converged (stageView.py:1543-1548). */
  isConverged(): boolean { return this._engine.isConverged() }

  /** stageView.py:1989-2015 computePickFrustum and :1933-1987 pick: the
   *  frustum narrowed to the pixel at (x, y) (top-left origin, in render
   *  buffer pixels of a width x height window viewport), intersected with
   *  the current render params (enableSampleAlphaToCoverage off, as the
   *  pick sets it; it is off for drawing too, see ApplySettings) and
   *  resolveNearestToCenter. The nearest hit, or null. */
  async pick(frustum: GfFrustum, x: number, y: number, width: number, height: number): Promise<UsdImagingGLIntersectionResult | null> {
    if (this._destroyed) return null
    const point = new GfVec2d((x / width) * 2.0 - 1.0, -1.0 * ((y / height) * 2.0 - 1.0))
    const size = new GfVec2d(1.0 / width, 1.0 / height)
    const pickFrustum = frustum.computeNarrowedFrustum(point, size)
    this._params.drawMode = drawModes[this._settings.renderMode]
    const results: UsdImagingGLIntersectionResult[] = []
    await this._engine.testIntersection({ resolveMode: 'resolveNearestToCenter' },
      pickFrustum.computeViewMatrix(), pickFrustum.computeProjectionMatrix(), this._root, this._params, results)
    return results[0] ?? null
  }

  /** The Gprims usdImaging draws with the current render tags
   *  (engine.cpp:2711-2730 _ComputeRenderTags; a prim's purpose is its
   *  render tag, usdImaging/gprimAdapter.cpp): the viewer reports a scene
   *  with none. Counted on the stage, as usdview counts its HUD geometry
   *  (appController.py:4795-4850). */
  getDrawableCount(): number {
    const purposes = new Set(displayPurposes(this._settings))
    const key = [...purposes].join()
    if (this._drawableCount?.key === key) return this._drawableCount.count
    const infos = new Map<string, UsdGeomPurposeInfo>()
    let count = 0
    for (const path of this._stage.traverse(TraverseInstanceProxies())) {
      const prim = this._stage.getPrim(path)
      if (!prim) continue
      const parent = path.slice(0, path.lastIndexOf('/')) || '/'
      const info = UsdGeomImageable.computePurposeInfo(prim, infos.get(parent))
      infos.set(path, info)
      if (prim.isA('Gprim') && purposes.has(info.purpose)) count++
    }
    this._drawableCount = { key, count }
    return count
  }

  destroy(): void {
    if (this._destroyed) return
    this._destroyed = true
    this._stageChanged.revoke()
    this._hiddenSurface?.destroy()
    this._engine.destroy()
  }
}

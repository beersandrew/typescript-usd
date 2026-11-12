// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usdImaging/usdviewq/stageView.py,
//  pxr/usdImaging/usdviewq/appController.py, pxr/usd/usd/stage.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import {MaterialBindingAPI} from 'typescript-usd/usdShade'
import './schema-plugins'
import {SubtreeHudInfoCache} from './hud-info'
import {viewerDeviceDescriptor,deviceEnvironmentDefaults,gpuSkinningStorageBuffers} from './gpu-device-settings'
import {startupTimeInfo,normalizeStartupOptions,type StartupOptions} from './startup-options'
import {cameraImageContainsPoint,cameraFitsViewport} from './camera-presentation'
import {ViewportCameraOverlays,cameraOverlayRects} from './viewport-camera'
import { compositionCommands } from './composition-types'
import {PrimSelectionModel,resolvePickSelection,pickModes} from './selection-model'
import {startupCameraPath} from './scene-startup'
import { _interim_createResolverScopedCacheContext } from 'typescript-usd/ar/_internal'
import { exportStage } from './stage-export'
import { CompositionReview } from './composition-review'
import type { CompositionCommand, CompositionResult } from './composition-types'
import { reviewBounds,computeSelectionBounds } from './review-bounds'
import { ViewportBoundingBoxes, ViewportAxes, ViewportOverlayLayer } from './viewport-overlays'
import { ViewportPresentation } from './viewport-presentation'
import { inspectObject } from './inspection'
import { propertyRows } from './property-view'
import { primTree } from './prim-tree'
import { LoadScheduler, carrierLoaded, readLoadSchedule } from './load-schedule'
import { LoadPrefetcher } from './load-prefetch'
import { TfDiagnosticMgr, TfErrorMark, Notice as TfNotice, type NoticeKey as TfNoticeKey } from 'typescript-usd/tf'
import { Stage, StagePopulationMask, TraverseInstanceProxies, Notice as UsdNotice } from 'typescript-usd/usd'
import { BBoxCache, PointInstancer, getStageUpAxis } from 'typescript-usd/usdGeom'
import { backgroundColors, displayPurposes, defaultDisplaySettings, drawsSelectionHighlights, mergeDisplaySettings, type DisplaySettings } from './display-settings'
import type * as Imaging from './imaging'
// HioGlslfx's read ahead of glslfx assets (Core-sized: Ar and Tf only). The
// stage reads ahead the glslfx files a scene ships while it opens, before
// imaging, which builds its shaders from them synchronously, has loaded.
import 'typescript-usd/hio/glslfxPrefetch'
// The cards draw mode's read ahead of its textures (Ar only), for the same
// reason: it reads their metadata synchronously.
import 'typescript-usd/usdImaging/cardTexturePrefetch'
import { stormCoverageWarnings } from './storm-coverage'

// Code splitting: Core (Sdf/Pcp/Usd/Ar and the schemas) is in the entry chunk.
// Imaging/Storm and MaterialX download in parallel from createRuntime; the
// stage opens with Core alone and imaging is awaited only to build Hydra.
let StageViewEngine!: typeof Imaging.StageViewEngine, createHgi!: typeof Imaging.createHgi
let imagingModules: Promise<void> | undefined, materialX: Promise<unknown> | undefined
/** UsdMtlx registers the .mtlx file format and the MaterialX Sdr parser. Layers
 * can reference .mtlx files, so the stage waits for it before opening. */
export function loadMaterialX(): Promise<unknown> {
  return materialX ??= import('typescript-usd/usdMtlx')
    .catch(error => { materialX = undefined; throw error })
}
/** Starts the imaging download once; resolves when imaging is registered. */
export function loadImaging(): Promise<void> {
  // typescript-usd/hdSt/materialx turns on Storm's MaterialX support (the
  // runtime counterpart of PXR_ENABLE_MATERIALX_SUPPORT), before any engine.
  return imagingModules ??= Promise.all([import('./imaging'), import('typescript-usd/hdSt/materialx')]).then(async ([m]) => {
    await m.prepareStorm()
    ;({ StageViewEngine, createHgi } = m)
  }).catch(error => { imagingModules = undefined; throw error })
}
import type { RuntimeFactory, SelectionDetail, SelectionOperation, PickMode, ViewerTimeState, ViewerGeometryState, ViewerDiagnostic } from './contracts'
import { ViewerBusyError } from './contracts'
import { HttpResolver, contextForResolver, registerAssetHost } from './http-resolver'
import { environment, prepareExecSceneIndex } from './exec-scene-index'
import { LoadProgressTracker, countingFetch } from './load-progress'
import { primLoadability } from './composition-review'
import { createLocalFileContext, createLocalFilesContext } from './local-file-resolver'
import type { LocalAssetSet } from './local-assets'
import { animateOrbit } from './orbit'
import { ViewerCameraController } from './viewer-camera'
import { defaultCamera, fitCameraToBounds, tumble, truck, applyZoom, zoomDrag } from './camera'
import { timed, timedAsync } from './load-timing'
import { profileCompatibilityWarnings } from './profile-compatibility'

// Storm's AOVs are multisampled with HDX_MSAA_SAMPLE_COUNT (default 4,
// hdx/taskControllerSceneIndex.cpp:1520-1553); overlays draw into them.
const sampleCount = 4

/** Browser consumer: upstream imaging stays in typescript-usd. */
export const createRuntime: RuntimeFactory = async (canvas, callbacks) => {
  if (!navigator.gpu) throw new Error('This browser does not expose WebGPU. Use a WebGPU-enabled Safari or Chrome on Mac.')
  // Start both downloads now; failures are reported where a scene needs them.
  loadImaging().catch(() => {}); loadMaterialX().catch(() => {})
  const adapter = await navigator.gpu.requestAdapter()
  if (!adapter) throw new Error('No WebGPU adapter is available.')
  const device = await adapter.requestDevice(viewerDeviceDescriptor(adapter))
  // Settings this device needs before any scene opens (gpu-device-settings.ts):
  // CPU skinning where GPU skinning's storage buffers exceed the device limit.
  const deviceDefaults = deviceEnvironmentDefaults(device.limits, environment())
  Object.assign(environment(), deviceDefaults)
  if (deviceDefaults['USDSKELIMAGING_FORCE_CPU_COMPUTE'])
    console.info(`usdview: skinning on the CPU (USDSKELIMAGING_FORCE_CPU_COMPUTE=1): this device allows ${device.limits?.maxStorageBuffersPerShaderStage} storage buffers per shader stage; GPU skinning needs ${gpuSkinningStorageBuffers}.`)
  const context = canvas.getContext('webgpu')
  if (!context) { device.destroy(); throw new Error('Could not create a WebGPU canvas.') }
  const baseFormat = navigator.gpu.getPreferredCanvasFormat()
  const format = `${baseFormat}-srgb` as GPUTextureFormat
  try { context.configure({ device, format: baseFormat, viewFormats: [format], alphaMode: 'opaque' }) }
  catch (error) { device.destroy(); throw error }
  let disposed = false, generation = 0, frame = 0
  let orbit: AbortController | undefined
  let deviceFailure: string | undefined
  let playing = false
  const primSelection=new PrimSelectionModel()
  const hudInfo=new SubtreeHudInfoCache()
  let pickMode:PickMode='prims'
  let selected: string | null = null
  let selectedInstance: { path: string, index: number } | undefined
  let hgi: ReturnType<typeof createHgi> | undefined
  let presentation: ViewportPresentation | undefined
  let axes: ViewportAxes | undefined
  let axesVisible = true
  let cameraOverlays:ViewportCameraOverlays|undefined
  let boxes: ViewportBoundingBoxes | undefined
  let overlayLayer: ViewportOverlayLayer | undefined
  let overlayFormats = ''
  let boundsKey = ''
  let boundsPipeline: unknown
  let boundsVertices = new Float32Array(0)
  const camera = defaultCamera()
  const cameraController = new ViewerCameraController(camera, () => canvas.width / Math.max(canvas.height,1))
  let lastViewContext:ReturnType<ViewerCameraController['copyViewState']>|undefined
  const cameraChanged = () => callbacks.cameraChanged?.(cameraController.state())
  type Pipeline = { archiveScope: ReturnType<typeof _interim_createResolverScopedCacheContext>, stage: Stage, engine: InstanceType<typeof StageViewEngine>,
    releaseHost?: () => void, stageListener?: TfNoticeKey, metadataDirty?: boolean, selectionKey?: string }
  const candidates = new Set<Partial<Pipeline>>()
  const released = new WeakSet<Partial<Pipeline>>()
  let pipeline: Pipeline | undefined
  let committedSource: string | File | LocalAssetSet | undefined
  let committedMountPrefix: string | undefined
  // Display and composition rebuilds replace the pipeline but keep the stage;
  // the load's counters and deferred payloads belong to the committed scene.
  let committedProgress: LoadProgressTracker | undefined
  let committedDeferredPayloads: string[] = []
  // ?loadSchedule=1 (load-schedule.ts): the committed stage's schedule.
  let committedLoadSchedule: { stage: Stage, scheduler: LoadScheduler, prefetcher: LoadPrefetcher } | undefined
  let picking: Promise<void> = Promise.resolve()
  let displaySettings = defaultDisplaySettings()
  let currentTime = 0
  let startupOptions:StartupOptions={}
  let lightingSource: 'usdview' | 'frameRecorder' = 'usdview'
  let review: CompositionReview | undefined
  let compositionUpdate: Promise<CompositionResult> | undefined
  let updatingComposition = false
  let timeUpdate: Promise<ViewerTimeState> | undefined
  let updatingTime = false
  let pendingRedraw = false
  // The canvas's CSS width from the last resize(), for the camera overlays'
  // device pixel ratio without a layout read per frame.
  let cssWidth: number | undefined
  let displayUpdate: Promise<DisplaySettings> | undefined
  let sceneLoadsInProgress = 0
  let viewRevision = 0
  /** How many of viewRevision's bumps were time changes (playback, scrubbing). A
   *  pick survives those, as usdview's does during playback: it reads the frame on
   *  screen, and only a camera, view or scene change since that frame drops it. */
  let timeRevisions = 0
  const pickKey = () => viewRevision - timeRevisions
  let lastFrame: { matrix: Float32Array<ArrayBuffer>, frustum: ReturnType<ViewerCameraController['frame']>['frustum'], width: number, height: number, revision: number, pipeline: Pipeline } | undefined
  /** The last drawn frame for picking: unlike lastFrame, a time change doesn't clear it. */
  let pickFrame: (NonNullable<typeof lastFrame> & { key: number }) | undefined
  let convergence: ReturnType<typeof setTimeout> | undefined
  let presentedPipeline: Pipeline | undefined
  const events = new AbortController()
  const status = (message: string) => { if (!disposed) callbacks.statusChanged(message) }
  let diagnostics: ViewerDiagnostic[] = []
  const unique = (list: readonly ViewerDiagnostic[]) => list.filter((d, i) => list.findIndex(o => o.severity === d.severity && o.message === d.message) === i)
  // usd/stage.cpp:3326 and usdviewq/common.py:208-213 print diagnostics to
  // stderr. Use the browser console, retaining the snapshot API for clients.
  const setDiagnostics = (next: ViewerDiagnostic[], newScene = false) => {
    const previous = new Set(newScene ? [] : diagnostics.map(d => JSON.stringify([d.severity,d.message])))
    diagnostics = unique(next)
    if (disposed) return
    for (const diagnostic of diagnostics) if (!previous.has(JSON.stringify([diagnostic.severity,diagnostic.message]))) {
      if (diagnostic.severity === 'error') console.error(diagnostic.message)
      else console.warn(diagnostic.message)
    }
    callbacks.diagnosticsChanged?.(diagnostics)
  }
  // What the faithful stack does not draw yet for this scene and these
  // settings (storm-coverage.ts); replaced whenever either changes.
  let coverage = new Set<string>()
  const coverageDiagnostics = (stage: Stage, settings: DisplaySettings) => {
    const next = stormCoverageWarnings(stage, settings)
    return {messages: new Set(next), diagnostics: next.map(message => ({severity:'warning' as const, message}))}
  }
  const updateCoverage = (stage: Stage, settings: DisplaySettings) => {
    const next = coverageDiagnostics(stage, settings)
    const kept = diagnostics.filter(d => !coverage.has(d.message))
    coverage = next.messages
    setDiagnostics([...kept, ...next.diagnostics])
  }
  // Library warnings and errors (TF_WARN / TF_CODING_ERROR, e.g. Storm's material and
  // texture fallbacks) arrive through Tf's diagnostic delegates. While a scene builds
  // they belong to that candidate; afterwards (late texture loads, rebuilds) they are
  // appended to the committed scene's list.
  let building: ViewerDiagnostic[] | undefined
  const record = (severity: ViewerDiagnostic['severity'], message: string) => {
    if (building) building.push({severity, message})
    else if (pipeline) setDiagnostics([...diagnostics, {severity, message}])
  }
  const diagnosticDelegate = {
    issueError: (error: {getCommentary(): string}) => record('error', error.getCommentary()),
    issueWarning: (warning: {getCommentary(): string}) => record('warning', warning.getCommentary()),
    issueStatus: () => {},
  }
  TfDiagnosticMgr.GetInstance().addDelegate(diagnosticDelegate)
  // Storm reports what it cannot draw through Tf diagnostics and, for GPU
  // objects WebGPU rejects (a shader the translator cannot express), through
  // WebGPU validation errors. Upstream logs such errors and draws the rest of
  // the scene; so does the viewer, listing each once as an error diagnostic.
  // Only a lost device stops rendering.
  const gpuError = (error: GPUError) => record('error', `WebGPU: ${error.message}`)
  device.addEventListener('uncapturederror', event => gpuError(event.error), { signal: events.signal })
  void device.lost.then(info => {
    if (!disposed) {
      deviceFailure = `GPU device lost: ${info.message || info.reason}. Reload the viewer.`
      status(deviceFailure)
    }
  })

  /** The camera of a frame as the engine takes it: the active scene camera
   *  by path, else the free camera's view and OpenGL projection
   *  (stageView.py:1424-1435). */
  function stormCamera(view: ReturnType<ViewerCameraController['frame']>, controller: ViewerCameraController = cameraController) {
    return {view: view.view, projection: view.projection, eye: view.eye, scenePath: controller.activeCameraPath, fitWindow: cameraFitsViewport(controller.presentation)}
  }
  /** stageView.py:1086-1114 _processSelection, when the selection changed
   *  (_rendererSelectionNeedsUpdate), and the highlight param of the
   *  selection highlight mode (stageView.py:1510-1519). */
  function applySelection(current: Pipeline) {
    const state = primSelection.snapshot(), lcd = new Set(state.lcdPaths)
    const selections = state.selections.filter(entry => lcd.has(entry.path))
    const highlight = drawsSelectionHighlights(displaySettings.selHighlightMode, playing)
    const key = JSON.stringify([selections, highlight])
    if (current.selectionKey === key) return
    current.selectionKey = key
    current.engine.setSelection(selections, highlight)
  }
  function draw(force = false) {
    // The update owning the canvas draws when it finishes, and draws again
    // only if a redraw was requested meanwhile (pendingRedraw).
    if ((updatingTime || updatingComposition || displayUpdate) && !force) { pendingRedraw = true; return }
    if (disposed || !pipeline || canvas.width < 1 || canvas.height < 1) return
    try { present(pipeline) } catch (error) { lastFrame = undefined; status(`Render failed: ${String(error)}`); throw error }
  }
  /** One engine Render of `pipeline` and, once converged, its presentation
   *  with the viewer overlays (draw() without the failure status). */
  function present(pipeline: Pipeline) {
    pendingRedraw = false
    if (deviceFailure) throw new Error(deviceFailure)
    const view = cameraController.frame()
    const { matrix } = view
    const started = performance.now()
    applySelection(pipeline)
    // UsdImagingGLEngine::Render (stage-view-engine.ts): Storm draws into
    // its multisampled color and depth AOVs and resolves the color.
    pipeline.engine.Render(stormCamera(view), canvas.width, canvas.height)
    // Storm draws nothing while textures wait for their load
    // (hdSt/src/renderPass.ts): keep the image presented for this stage
    // (no getCurrentTexture) and draw again shortly (stageView.py:1547-1548).
    if (presentedPipeline === pipeline && !pipeline.engine.isConverged()) {
      // A paused time change settles itself (changeTime, settleImaging).
      if (!playing && !updatingTime && !convergence) convergence = setTimeout(() => { convergence = undefined; schedule() }, 5)
      return
    }
    const outputTexture = context!.getCurrentTexture()
    const aov = pipeline.engine.GetAovTextures()
    const formats = `${aov.colorMSAA.format}/${aov.depthMSAA.format}`
    if (formats !== overlayFormats) { axes?.destroy(); boxes?.destroy(); cameraOverlays?.destroy(); overlayLayer?.destroy(); axes = boxes = cameraOverlays = overlayLayer = undefined; overlayFormats = formats }
    const depthView = aov.depthMSAA.createView()
    // Viewer overlays share Storm's multisampled scene depth, in a layer of
    // their own blended over the resolved color (ViewportOverlayLayer).
    let overlaid = false, overlayView: GPUTextureView | undefined
    const overlay = () => overlayView ??= (overlayLayer ??= new ViewportOverlayLayer(device, aov.colorMSAA.format, sampleCount, aov.color.format)).begin(aov.colorMSAA.width, aov.colorMSAA.height)
    // usdviewq/stageView.py _processBBoxes: default bounds are paused-only.
    if (displaySettings.showBBoxes && (!playing || displaySettings.showBBoxPlayback)) {
      // The frame's time (cameraController.time): a paused time change
      // presents its frame before publishing currentTime.
      const frameTime=cameraController.time
      const key=JSON.stringify([frameTime,primSelection.snapshot().selections,displaySettings])
      if (boundsPipeline !== pipeline || boundsKey !== key) {
        boundsVertices=reviewBounds(pipeline!.stage,frameTime,selectedInstance?.path ?? selected,selectedInstance?.index,displaySettings,primSelection.snapshot().selections)
        boundsPipeline=pipeline;boundsKey=key
      }
      if (boundsVertices.length) {
        boxes ??= new ViewportBoundingBoxes(device,aov.colorMSAA.format,sampleCount,aov.depthMSAA.format)
        boxes.draw(overlay(),depthView,matrix,boundsVertices,canvas.width,canvas.height,backgroundColors[displaySettings.background])
        overlaid = true
      }
    }
    if (axesVisible) { axes ??= new ViewportAxes(device, aov.colorMSAA.format, sampleCount, aov.depthMSAA.format); axes.draw(overlay(), depthView, matrix); overlaid = true }
    const cameraPresentation=cameraController.presentation
    const rectangles=cameraOverlayRects(canvas.width,canvas.height,cameraController.cameraAspect(),cameraPresentation,canvas.width/Math.max(cssWidth ?? canvas.getBoundingClientRect().width,1))
    const guides=cameraPresentation.cameraOracles?cameraController.guides():new Float32Array(0)
    if(rectangles.length||guides.length)cameraOverlays??=new ViewportCameraOverlays(device,aov.colorMSAA.format,sampleCount,aov.depthMSAA.format,baseFormat)
    if(guides.length){cameraOverlays!.drawGuides(overlay(),depthView,matrix,canvas.width,canvas.height,guides);overlaid=true}
    // Over the resolved color, which alone holds Storm's translucent (OIT)
    // and volume passes: never resolve the multisampled color over it.
    if (overlaid) overlayLayer!.composite(aov.color.createView())
    // HdxColorCorrectionTask (sRGB) and HdxPresentTask: the linear color AOV
    // through the canvas's sRGB view, rows flipped once (Hgi raster is Y-up).
    presentation ??= new ViewportPresentation(device,format)
    presentation.draw(aov.color.createView(),outputTexture.createView({format}))
    // Masks and reticles composite in display space on the presented image.
    if(rectangles.length)cameraOverlays!.drawRects(outputTexture.createView({format:baseFormat}),matrix,canvas.width,canvas.height,rectangles)
    const elapsed = performance.now() - started
    // stageView.py:1627-1633: Render FPS is reciprocal render duration;
    // playback cadence is sampled independently by TimelineControls. Browser
    // clocks can quantize this short scope to zero: no reciprocal is measurable.
    callbacks.frameRendered?.({cpuMilliseconds:elapsed,framesPerSecond:elapsed > 0 ? 1000/elapsed : null})
    lastFrame = { matrix, frustum: view.frustum, width: canvas.width, height: canvas.height, revision: viewRevision, pipeline }
    pickFrame = { ...lastFrame, key: pickKey() }
    presentedPipeline = pipeline
    if (pipeline.metadataDirty) { delete pipeline.metadataDirty; cachedGeometry = undefined; geometryChanged() }
    // stageView.py:1547-1548: not converged (textures still loading,
    // hdSt/src/renderPass.ts) and not playing: draw again shortly.
    if (!playing && !updatingTime && !convergence && !pipeline.engine.isConverged()) convergence = setTimeout(() => { convergence = undefined; schedule() }, 5)
  }
  function schedule() {
    if (!disposed && !frame) frame = requestAnimationFrame(() => {
      frame = 0
      try { draw() } catch { /* draw reports error */ }
    })
  }
  /** The engine for a stage (stage-view-engine.ts). As usdview's root data
   *  model (rootDataModel.py:77-102) the stage's ObjectsChanged notices
   *  (payload loads, edits) redraw (appController.py:5495-5500,2493-2509);
   *  the engine applies them in its next Render (engine.cpp:1525). */
  function prepareImaging(current: Partial<Pipeline>, stage: Stage, time: number, settings: DisplaySettings) {
    hgi ??= createHgi(device)
    const width = Math.max(1, canvas.width), height = Math.max(1, canvas.height)
    const engine = current.engine = new StageViewEngine(hgi, stage, time, settings, width, height)
    engine.lightingSource = lightingSource
    engine.applySettings(settings, getStageUpAxis(stage) === 'Z')
    const changed = () => {
      if (disposed || released.has(current)) return
      current.metadataDirty = true
      hudInfo.invalidate()
      // Construction can receive new metadata before publication as well.
      if(pipeline!==current)return
      cachedGeometry = undefined
      boundsKey = ''
      ++viewRevision
      lastFrame = undefined
      schedule()
    }
    current.stageListener = TfNotice.Register(UsdNotice.ObjectsChanged, changed, stage)
    return engine
  }
  /** Draws until the engine is converged (stageView.py:1543-1548): Storm's
   *  texture loads are asynchronous here and Storm draws nothing while a
   *  texture is still loading (hdSt/src/renderPass.ts IsConverged); native
   *  Storm's Commit finishes reading them before it draws, so a view is
   *  accepted once converged. Every await is outside the GPU error scopes
   *  validate() owns. */
  async function settleImaging(current: Partial<Pipeline>, validate: () => Promise<void>, active: () => void) {
    while (!current.engine!.isConverged()) {
      await new Promise(resolve => setTimeout(resolve, 5)); active()
      await validate(); active()
    }
  }
  // Track resources as soon as each constructor succeeds, including failed loads.
  function release(current: Partial<Pipeline> | undefined, preserveStage = false) {
    if (!current || released.has(current)) return
    released.add(current)
    candidates.delete(current)
    const cleanup = [() => current.stageListener?.revoke(), () => current.engine?.destroy(),
      () => { if (!preserveStage) current.releaseHost?.() }, () => { if (!preserveStage) current.stage?.dispose() }, () => { if (!preserveStage) current.archiveScope?.dispose() }]
    for (const disposeResource of cleanup) {
      try { disposeResource() } catch (error) { status(`Resource cleanup failed: ${String(error)}`) }
    }
  }
  let cachedGeometry: {pipeline: Pipeline | undefined, key: string, value: ViewerGeometryState} | undefined
  function geometryState(): ViewerGeometryState {
    const key = JSON.stringify([currentTime,primSelection.snapshot().selections,displaySettings.displayRender,displaySettings.displayProxy,displaySettings.displayGuide,displaySettings.useExtentsHint])
    if (cachedGeometry && cachedGeometry.pipeline === pipeline && cachedGeometry.key === key) return {...cachedGeometry.value}
    const drawableCount = pipeline?.engine.getDrawableCount() ?? 0
    const paths=primSelection.snapshot().lcdPaths
    // Native root-only selection always has the default box on an empty stage.
    const canFrameSelection=!!pipeline&&(paths.length===1&&paths[0]==='/'||!computeSelectionBounds(pipeline.stage,currentTime,primSelection.snapshot().selections,displaySettings).ComputeAlignedRange().IsEmpty())
    const value = {drawableCount, canFrameSelection}
    cachedGeometry = {pipeline,key,value}
    return {...value}
  }
  let previousGeometryState = ''
  function geometryChanged() {
    const next = geometryState(), key = JSON.stringify(next)
    if (key !== previousGeometryState) { previousGeometryState = key; callbacks.geometryChanged?.(next) }
  }
  /** `redraw` false: the caller has just presented a frame with this selection. */
  function refreshSelection(redraw=true):SelectionDetail {
    primSelection.prune(path=>!!pipeline?.stage.getPrim(path))
    const state=primSelection.snapshot(),focus=state.selections[0]!
    selected=state.focusPath==='/'?null:state.focusPath
    selectedInstance=undefined
    if(selected&&focus.instanceIndices?.length===1){
      for(let parent=selected;parent&&parent!=='/';parent=parent.slice(0,parent.lastIndexOf('/'))){
        if(pipeline?.stage.getPrim(parent)?.typeName==='PointInstancer'){selectedInstance={path:parent,index:focus.instanceIndices[0]!};break}
      }
    }
    const properties=pipeline?propertyRows(pipeline.stage,selected??'/',currentTime):[]
    geometryChanged();if(redraw)schedule()
    return {path:selected,properties,selections:state.selections,...(selectedInstance?{instanceIndex:selectedInstance.index,instancerPath:selectedInstance.path}:{})}
  }
  function selection(path:string|null,instanceIndex?:number,operation:SelectionOperation='replace'):SelectionDetail {
    const valid=path&&pipeline?.stage.getPrim(path)?path:null
    primSelection.update(valid,operation,instanceIndex)
    return refreshSelection()
  }
  /** 'bounds' when the camera was framed on scene bounds, 'default' when it
   * framed the default box because nothing had bounds, else 'none'. */
  function fitStage(stage: Stage, targetCamera: typeof camera, selectedPath: string | null, time = currentTime,beforeFit?:()=>void): 'bounds'|'default'|'none' {
    const cache = new BBoxCache(time, displayPurposes(displaySettings), displaySettings.useExtentsHint)
    const paths = selectedPath ? [selectedPath] : stage.getChildPrimPaths('/')
    const min: [number,number,number] = [Infinity,Infinity,Infinity]
    const max: [number,number,number] = [-Infinity,-Infinity,-Infinity]
    for (const path of paths) {
      const prim = stage.getPrim(path)
      if (!prim || (selectedPath&&selectedPath!=='/'&&(!prim.isActive||prim.isInPrototype()))) continue
      const range = cache.computeWorldBound(prim).ComputeAlignedRange()
      if (range.IsEmpty()) continue
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i]!, range.getMin().data[i]!)
        max[i] = Math.max(max[i]!, range.getMax().data[i]!)
      }
    }
    if (Number.isFinite(min[0])) {if(min.every((v,i)=>v===max[i]))return 'none';beforeFit?.();fitCameraToBounds(targetCamera, min, max);return 'bounds'}
    // usdviewq/stageView.py:1019-1026,1119-1124: an empty pseudo-root
    // selection frames the default box; empty individual selections do not.
    else if (!selectedPath || selectedPath === '/') {beforeFit?.();fitCameraToBounds(targetCamera, [-10,-10,-10], [10,10,10]);return 'default'}
    return 'none'
  }
  // usdview loads payloads before its first framing, so it frames the loaded
  // scene. With progressive payload loading the first framing can find no
  // bounds (every prim is still an unloaded payload) and fall back to the
  // default box. Until the camera is moved, frame again when geometry first
  // arrives and when payload loading finishes. Holds the camera as last framed.
  let refit: { camera: string; framed: boolean } | undefined
  function refitAfterPayloads(done: boolean) {
    if (!refit || !pipeline) return
    if (cameraController.activeCameraPath || JSON.stringify(camera) !== refit.camera) { refit = undefined; return }
    if (refit.framed && !done) return
    const fitted = fitStage(pipeline.stage, camera, null)
    refit = done ? undefined : { camera: JSON.stringify(camera), framed: fitted === 'bounds' }
    ++viewRevision; lastFrame = undefined; cameraChanged(); schedule()
  }
  function fit() {
    if (!pipeline || !geometryState().canFrameSelection) return
    cameraController.transaction(() => {
    cameraController.toFree()
    const range=computeSelectionBounds(pipeline!.stage,currentTime,primSelection.snapshot().selections,displaySettings).ComputeAlignedRange()
    if(!range.IsEmpty())fitCameraToBounds(camera,Array.from(range.getMin().data) as [number,number,number],Array.from(range.getMax().data) as [number,number,number])
    })
    ++viewRevision
    cameraChanged()
    schedule()
  }
  let pointer: { id: number, x: number, y: number, distance: number, mode: 'orbit'|'pan'|'zoom' } | undefined
  canvas.addEventListener('pointerdown', event => {
    if (event.button > 2 || updatingComposition) return
    orbit?.abort()
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, distance: 0,
      mode: event.button === 1 || event.shiftKey ? 'pan' : event.button === 2 || event.ctrlKey ? 'zoom' : 'orbit' }
    canvas.setPointerCapture(event.pointerId); canvas.focus(); event.preventDefault()
  }, { signal: events.signal })
  canvas.addEventListener('pointermove', event => {
    if (!pointer || pointer.id !== event.pointerId || updatingComposition) return
    const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y
    if (!dx && !dy) return
    const switched = cameraController.activeCameraPath !== null
    cameraController.toFree()
    if (switched) cameraChanged()
    ++viewRevision
    pointer.x = event.clientX; pointer.y = event.clientY; pointer.distance += Math.hypot(dx,dy)
    if (pointer.mode === 'orbit') tumble(camera, dx, dy)
    else if (pointer.mode === 'zoom') zoomDrag(camera, dx,dy)
    else truck(camera, dx,dy,canvas.clientHeight)
    schedule()
  }, { signal: events.signal })
  canvas.addEventListener('pointerup', event => {
    if (!pointer || pointer.id !== event.pointerId || updatingComposition) return
    const click = event.button === 0 && pointer.distance < 4
    pointer = undefined
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    // A click (left button, no drag) picks. usdview picks on press and keeps
    // Alt-drag for the camera (stageView.py:1788-1824); here a drag moves the
    // camera, so the pick waits for the release.
    if (!click || !pipeline || !pickFrame || pickFrame.pipeline !== pipeline || pickFrame.key !== pickKey()) return
    const current = pipeline, version = generation, snapshot = pickFrame
    const point = framePoint(snapshot, event.clientX, event.clientY)
    if (!point) return
    // appController.py:5025-5100 onPrimSelected: Shift adds, Ctrl (Command
    // on macOS, Qt's ControlModifier) toggles, no modifier replaces.
    const operation: SelectionOperation = event.shiftKey ? 'add' : event.ctrlKey || event.metaKey ? 'toggle' : 'replace'
    // Serialize readbacks; ignore a pick belonging to a superseded view.
    picking = picking.then(async () => {
      const valid = () => !disposed && generation === version && pipeline === current && pickKey() === snapshot.key
      if (!valid()) return
      const hit = await pickAt(current, snapshot, point[0], point[1])
      if (!valid()) return
      if (!hit) {
        // Clicking the background with no modifiers clears the selection.
        if (operation === 'replace') callbacks.selectionChanged(selection(null))
        return
      }
      const [topLevelPath, topLevelIndex] = hit.instancerContext[0] ?? ['', -1]
      const entry = resolvePickSelection(current.stage, hit.hitPrimPath, hit.hitInstanceIndex, topLevelPath, topLevelIndex, pickMode)
      callbacks.selectionChanged(selection(entry.path, entry.instanceIndices?.[0], operation))
    }).catch(error => status(`Selection failed: ${String(error)}`))
  }, { signal: events.signal })
  /** A client point in render buffer pixels of a drawn frame. */
  function framePoint(snapshot: NonNullable<typeof lastFrame>, clientX: number, clientY: number): [number, number] | undefined {
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return undefined
    return [(clientX - rect.left) * snapshot.width / rect.width, (clientY - rect.top) * snapshot.height / rect.height]
  }
  /** stageView.py:2017-2075 pickObject: the nearest hit at a point of a drawn
   *  frame; none outside the camera image (stageView.py:2006-2015, a
   *  deselect). */
  async function pickAt(current: Pipeline, snapshot: NonNullable<typeof lastFrame>, x: number, y: number) {
    if (!cameraImageContainsPoint(x, y, snapshot.width, snapshot.height, cameraController.cameraAspect(), cameraController.presentation)) return null
    return current.engine.pick(snapshot.frustum, x, y, snapshot.width, snapshot.height)
  }
  canvas.addEventListener('pointercancel', () => { pointer = undefined }, { signal: events.signal })
  canvas.addEventListener('wheel', event => { event.preventDefault(); if(updatingComposition)return; orbit?.abort(); cameraController.toFree(); cameraChanged(); ++viewRevision; applyZoom(camera,event.deltaY); schedule() }, { passive: false, signal: events.signal })
  canvas.addEventListener('contextmenu', event => event.preventDefault(), { signal: events.signal })
  canvas.addEventListener('keydown', event => { if (event.key.toLowerCase() === 'f') { if(updatingComposition)return; orbit?.abort(); try { lastViewContext=cameraController.copyViewState(); fit() } catch(error) { status(String(error)) }; event.preventDefault() } }, { signal: events.signal })
  async function openScene(source: string | File | LocalAssetSet, signal?: AbortSignal) {
    ++sceneLoadsInProgress
    try {
      if (compositionUpdate) await compositionUpdate.catch(() => {})
      if (timeUpdate) await timeUpdate.catch(() => {})
      if (displayUpdate) await displayUpdate.catch(() => {})
      return await buildScene(source, signal)
    } finally { --sceneLoadsInProgress }
  }
  // Reload builds an isolated candidate so failed transport/composition/rendering
  // cannot corrupt the visible stage. Preserve native review state, not stage identity.
  async function refreshScene(kind: 'reload' | 'reopen', signal?: AbortSignal) {
    if (disposed || !pipeline || committedSource === undefined) throw new Error('Load a scene before refreshing.')
    if (sceneLoadsInProgress || compositionUpdate || timeUpdate || displayUpdate) throw new Error('Wait for the current scene update before refreshing.')
    playing = false
    ++sceneLoadsInProgress
    try {
      const tree = await buildScene(committedSource, signal, kind)
      return {tree, selection: refreshSelection()}
    } finally { --sceneLoadsInProgress }
  }
  async function buildScene(source: string | File | LocalAssetSet, signal?: AbortSignal, refresh?: 'reload' | 'reopen') {
    const issues: ViewerDiagnostic[] = []
    building = issues
    try { return await buildCandidate(source, issues, signal, refresh) }
    finally { if (building === issues) building = undefined }
  }
  async function buildCandidate(source: string | File | LocalAssetSet, issues: ViewerDiagnostic[], signal?: AbortSignal, refresh?: 'reload' | 'reopen') {
      orbit?.abort()
      const version = ++generation
      const active = () => {
        if (disposed || signal?.aborted || version !== generation) throw new DOMException('Scene load cancelled','AbortError')
        if (deviceFailure) throw new Error(deviceFailure)
      }
      active(); status('Opening USD scene…')
      const progress = new LoadProgressTracker(snapshot => { if (!disposed && version === generation) callbacks.loadProgress?.(snapshot) })
      const fetchFresh: typeof fetch = refresh ? (input, init) => fetch(input, {...init, cache:'reload'}) : (input, init) => fetch(input, init)
      const transport = countingFetch(fetchFresh, progress)
      const local = typeof source === 'string' ? undefined : 'files' in source
        ? await createLocalFilesContext(source, signal, transport, refresh ? committedMountPrefix : undefined) : await createLocalFileContext(source, signal, transport, refresh ? committedMountPrefix : undefined)
      active()
      const sourceUrl = local?.url ?? new URL(source as string, document.baseURI).href
      // One consumer seam for explicit browser async cache ownership. The scope
      // lives with the stage so deferred texture reads share its archive.
      const transportResolver = local ? undefined : new HttpResolver(sourceUrl, signal, transport)
      const archiveScope = _interim_createResolverScopedCacheContext(local?.context ?? contextForResolver(transportResolver!))
      const resolverContext = archiveScope.context
      let stage: Stage
      // Deliberate divergence from usdview (appController.py opens with
      // Usd.Stage.LoadAll unless --unloaded): a new scene opens with payloads
      // unloaded so the first frame commits before payload layers arrive; the
      // viewer then loads every deferred payload, ending in the LoadAll state.
      // ?progressive=0 restores the native single-step open. Refreshes keep
      // the committed load rules instead.
      const deferPayloads = !refresh && startupOptions.progressive !== false
      // ?loadSchedule=1 opens unloaded, as a usdview load-schedule plugin needs
      // --unloaded: only the carriers scheduled at the start frame compose.
      // PLATFORM-DIVERGENCE(usdview-load-schedule-default): unset, a scene
      // that has a schedule plays by it too (usdview applies one only with
      // a load-schedule plugin and --unloaded), because composing and drawing
      // every payload of a large scene stalls the browser's frames. The
      // progressive open already leaves every payload unloaded, so the
      // schedule is read after the open and applied when the root layer has
      // one. ?loadSchedule=0 or ?progressive=0 loads every payload, as
      // usdview does.
      let scheduled = !refresh && startupOptions.loadSchedule === true
      const openOptions = {resolverContext, loadPayloads: !deferPayloads && !scheduled}
      try { await timedAsync('materialx-module', loadMaterialX) } catch (error) { archiveScope.dispose(); throw error }
      active()
      // The OpenExec plugins register before the stage opens, as upstream
      // discovers its plugin path before any stage: each prim's type info
      // resolves its schema type once, when the prim is composed
      // (UsdStage::_ComposePrimTypeInfoImpl, stage.cpp:3513-3536;
      // UsdPrimTypeInfo's constructor, primTypeInfo.cpp:12-38). A stage
      // opened before execIr registers keeps IrFkController and
      // IrSwitchController prims without a schema (no out:space), and exec
      // then computes the driven xformOp:transforms' authored fallbacks.
      // Their libraries load here too, before the first engine compiles a
      // request (exec-scene-index.ts).
      try { await timedAsync('exec-plugins', prepareExecSceneIndex) } catch (error) { archiveScope.dispose(); throw error }
      active()
      // UsdStage::Open returns no stage when the root layer cannot be opened,
      // with the reasons posted as Tf errors; they become the load error.
      const openMark = new TfErrorMark()
      try {
        const opened = await timedAsync('open', () => startupOptions.populationMask===undefined?Stage.open(sourceUrl,openOptions):Stage.openMasked(sourceUrl,new StagePopulationMask(startupOptions.populationMask),openOptions))
        if (!opened) {
          const messages = openMark.getErrors().map(error => error.getCommentary())
          openMark.clear()
          throw new Error(messages.join('\n') || `Failed to open layer @${sourceUrl}@`)
        }
        stage = opened
      }
      catch (error) { archiveScope.dispose(); throw error }
      finally { openMark.dispose() }
      let initialFit: ReturnType<typeof fitStage> = 'none'
      const startup = startupTimeInfo(stage,startupOptions)
      const initialTime = refresh ? Math.max(startup.start, Math.min(startup.end, currentTime)) : startup.current
      if (!refresh && startupOptions.loadSchedule === undefined && deferPayloads) {
        const found = readLoadSchedule(stage)
        if (found.schedule) scheduled = true
      }
      const loadSchedule = scheduled || (refresh && committedLoadSchedule) ? readLoadSchedule(stage) : {warnings: []}
      const carriers = [...loadSchedule.schedule?.carriers.keys() ?? []]
      const underCarrier = (path: string) => carriers.some(carrier => path === carrier || path.startsWith(`${carrier}/`))
      let deferredPayloads = deferPayloads || scheduled ? timed('deferred-payloads', () => stage.findLoadable('/').filter(path => { const prim = stage.getPrim(path); return !!prim && !prim.isInPrototype() && !primLoadability(prim).loaded && !underCarrier(path) })) : []
      const scheduler = loadSchedule.schedule && new LoadScheduler(loadSchedule.schedule, path => carrierLoaded(stage, path),
        change => timedAsync('load-schedule', () => stage.loadAndUnload(change.load, change.unload)))
      if (scheduled) {
        try {
          // The start frame's carriers (and, with ?progressive=0, every
          // payload outside the schedule) in one LoadAndUnload.
          const load = [...scheduler?.change(initialTime)?.load ?? [], ...deferPayloads ? [] : loadSchedule.schedule ? deferredPayloads : ['/']]
          if (load.length) await timedAsync('load-schedule', () => stage.loadAndUnload(load, []))
          if (!deferPayloads) deferredPayloads = []
        } catch (error) { archiveScope.dispose(); throw error }
      }
      const retained = refresh === 'reload' ? pipeline : undefined
      const retainedSelection = retained ? primSelection.snapshot().selections : []
      let pending: Partial<Pipeline> | undefined = { stage, archiveScope }
      candidates.add(pending)
      try {
        active()
        if (retained) {
          if (!stage.getSessionLayer().importFromString(retained.stage.getSessionLayer().exportToString())) throw new Error('Unable to preserve session edits.')
          await stage.flushChanges()
          await stage.setLoadRules(retained.stage.getLoadRules())
          for (const layer of retained.stage.getMutedLayers()) await stage.muteLayer(layer)
          active()
        }
        local?.assertComplete()
        // usd/stage.cpp:3326 (_ReportErrors): composition errors are warnings; the
        // stage opens with whatever composed.
        const candidateWarnings = [...stage.getCompositionErrors().map(error => error.toString()),...startup.warnings,...loadSchedule.warnings]
        if (scheduled && startupOptions.loadSchedule === true && !loadSchedule.schedule) candidateWarnings.push('loadSchedule=1: the scene has no load schedule (root layer customLayerData["tourLoad"]); loading everything.')
        let initialSelection=startupOptions.select??'/'
        if(!stage.getPrim(initialSelection)){candidateWarnings.push(`Could not find prim at path <${initialSelection}> to select. Ignoring...`);initialSelection='/'}
        const requestedCamera=startupOptions.camera
        if(requestedCamera?.startsWith('/')){
          const prim=stage.getPrim(requestedCamera)
          if(!prim)candidateWarnings.push(`WARNING: Camera path Sdf.Path('${requestedCamera}') did not exist in stage`)
          else if(!prim.isA('Camera'))candidateWarnings.push(`WARNING: Camera path Sdf.Path('${requestedCamera}') was not a UsdGeom.Camera`)
        }
        // Features the faithful stack does not draw yet are diagnosed, never
        // drawn wrongly in silence (storm-coverage.ts).
        const candidateCoverage = timed('storm-coverage', () => coverageDiagnostics(stage, displaySettings))
        // Capabilities the scene's ClaimsAPI prims record that this viewer's
        // profile does not cover: the scene still opens, with a warning.
        candidateWarnings.push(...timed('profile-claims', () => profileCompatibilityWarnings(stage)))
        const candidateCamera = { ...defaultCamera(), target: [0,0,0] as [number, number, number], fovY:cameraController.free.fovDegrees*Math.PI/180 }
        delete candidateCamera.roll;delete candidateCamera.orthographicHeight;delete candidateCamera.apertureOffset
        // stageView.py:795-815: a replaced stage gets a new FreeCamera (rotTheta = rotPhi = rotPsi = 0,
        // keeping FOV and clipping settings), Z-up when the stage's upAxis is Z.
        candidateCamera.azimuth = 0; candidateCamera.elevation = 0
        const zUp = candidateCamera.zUp = getStageUpAxis(stage) === 'Z'
        const candidateCameraController = new ViewerCameraController(candidateCamera, () => canvas.width / Math.max(canvas.height,1))
        Object.assign(candidateCameraController.free,cameraController.free)
        candidateCameraController.presentationSettings(cameraController.presentation)
        candidateCameraController.time = initialTime
        candidateCameraController.stage = stage
        if (retained) {
          Object.assign(candidateCamera, camera, {target: [...camera.target], zUp})
          const path = cameraController.activeCameraPath
          candidateCameraController.activeCameraPath = path && stage.getPrim(path)?.typeName === 'Camera' ? path : null
        } else candidateCameraController.activeCameraPath = startupCameraPath(stage,startupOptions.camera??'main_cam')
        await timedAsync('imaging-module', loadImaging)
        active()
        // Reads of this scene's URLs that name no load go to its transport
        // (http-resolver.ts).
        if (local) pending.releaseHost = registerAssetHost({resolver: local.resolver, owns: url => url.startsWith(local.prefix)})
        else if (transportResolver) pending.releaseHost = registerAssetHost({resolver: transportResolver, owns: url => /^https?:/.test(url)})
        const width = Math.max(1, canvas.width), height = Math.max(1, canvas.height)
        let constructionError: unknown
        let constructionFailed = false
        let scopeResult: Promise<GPUError | null>
        if(!retained){
          if(initialSelection!=='/')timed('fit-stage', () => fitStage(stage,candidateCamera,initialSelection,initialTime,()=>candidateCameraController.toFree()))
          else if(!candidateCameraController.activeCameraPath)initialFit=timed('fit-stage', () => fitStage(stage,candidateCamera,null,initialTime))
        }
        // Validate construction AND the first draw without exposing a pending
        // scene on the visible canvas. No await while the error scope is open.
        device.pushErrorScope('validation')
        try {
          const engine = timed('scene-indices', () => prepareImaging(pending!, stage, initialTime, displaySettings))
          timed('validation-render', () => engine.Render(stormCamera(candidateCameraController.frame(),candidateCameraController), width, height))
        } catch (error) { constructionFailed = true; constructionError = error }
        finally { scopeResult = device.popErrorScope() }
        const validationError = await timedAsync('gpu-validation-wait', () => scopeResult)
        active()
        if (constructionFailed) throw constructionError
        if (validationError) gpuError(validationError)
        if(!pending.engine!.isConverged())status('Loading scene textures…')
        const constructed=pending
        const validateConstructed=async()=>{
          let drawError:unknown
          device.pushErrorScope('validation')
          try{ timed('revalidate-render', () => constructed.engine!.Render(stormCamera(candidateCameraController.frame(),candidateCameraController),width,height)) }
          catch(error){drawError=error}
          const validationError=await device.popErrorScope()
          active()
          if(drawError)throw drawError
          if(validationError)gpuError(validationError)
        }
        // usdviewq/appController.py _computeDisplayPredicate can show undefined
        // and abstract prims. Our inspection tree includes them so component
        // opinions remain inspectable; imaging retains its default traversal.
        const hierarchy = timed('prim-tree', () => primTree(stage, initialTime).children)
        await picking
        active()
        await timedAsync('settle', () => settleImaging(constructed,validateConstructed,active))
        local?.assertComplete()
        const previous = pipeline
        pipeline = pending as Pipeline
        candidates.delete(pending!)
        pending = undefined
        primSelection.replace([])
        selected = !retained&&initialSelection!=='/'?initialSelection:null
        if(selected)primSelection.replace([{path:selected}])
        selectedInstance = undefined
        delete camera.roll;delete camera.orthographicHeight;delete camera.apertureOffset
        Object.assign(camera, candidateCamera)
        currentTime = initialTime
        cameraController.time = currentTime
        if(!retained)lastViewContext=undefined
        cameraController.stage = pipeline.stage
        review = new CompositionReview(pipeline.stage, () => currentTime)
        cameraController.activeCameraPath = candidateCameraController.activeCameraPath
        if (retained) {primSelection.replace(retainedSelection);refreshSelection()}
        committedSource = source
        committedMountPrefix = local?.prefix
        committedProgress = progress
        committedDeferredPayloads = deferredPayloads
        committedLoadSchedule?.prefetcher.dispose()
        committedLoadSchedule = scheduler && { stage, scheduler, prefetcher: new LoadPrefetcher(stage, scheduler.schedule) }
        committedLoadSchedule?.prefetcher.update(currentTime)
        cameraChanged()
        refit = initialFit === 'default' && deferredPayloads.length ? { camera: JSON.stringify(camera), framed: false } : undefined
        callbacks.timeChanged?.(timeState()!)
        ++viewRevision
        lastFrame = undefined
        release(previous)
        // Once committed there are no async gaps before the visible draw/result.
        try { timed('first-draw', draw) } catch (error) {
          const failed = pipeline; pipeline = undefined; release(failed)
          throw error
        }
        geometryChanged()
        if (building === issues) building = undefined
        coverage = candidateCoverage.messages
        setDiagnostics([...[...(local?.warnings() ?? []), ...candidateWarnings].map(message => ({severity:'warning' as const, message})), ...issues, ...candidateCoverage.diagnostics], true)
        progress.payloads.requested = deferredPayloads.length
        progress.setPhase(deferredPayloads.length ? 'payloads' : 'done')
        const drawable = geometryState().drawableCount
        const unsupported = coverage.size ? `${coverage.size} unsupported feature(s), see diagnostics` : ''
        status(drawable ? `Loaded · ${drawable} geometry prim(s) · TypeScript Storm / WebGPU${unsupported ? ` · ${unsupported}` : ''}` : `Loaded · No drawable geometry · ${unsupported ? `${unsupported} · ` : ''}Stage available for inspection`)
        return hierarchy
      } catch (error) {
        release(pending)
        throw error
      }
  }
  async function changeDisplaySettings(patch: Partial<DisplaySettings>, forceRebuild = false): Promise<DisplaySettings> {
    const next = mergeDisplaySettings(displaySettings, patch)
    if (disposed) throw new DOMException('Viewer disposed', 'AbortError')
    if (deviceFailure) throw new Error(deviceFailure)
    orbit?.abort()
    const previous = pipeline
    const version = generation
    const active = () => {
      if (disposed || version !== generation || pipeline !== previous) throw new DOMException('Display change cancelled', 'AbortError')
      if (deviceFailure) throw new Error(deviceFailure)
    }
    if (!previous) {
      displaySettings = next
      return {...next}
    }
    const zUp = getStageUpAxis(previous.stage) === 'Z'
    if (!forceRebuild) {
      // UsdImagingGLRenderParams change per frame in usdview (stageView.py:
      // 1150-1185): the engine applies them to the retained render index.
      const previousSettings=displaySettings,previousFrame=lastFrame,previousRevision=viewRevision
      try {
        previous.engine.applySettings(next,zUp)
        await picking
        active()
        // Native Commit finishes resource reads (a new default dome light's
        // texture) before the updated display is accepted.
        await validateRetained(previous,active)
        await settleImaging(previous,()=>validateRetained(previous,active),active)
        active()
        displaySettings=next
        updateCoverage(previous.stage,next)
        geometryChanged()
        ++viewRevision;lastFrame=undefined
        draw(true)
        schedule()
        return {...next}
      } catch(error) {
        if(!disposed&&pipeline===previous&&!released.has(previous)){
          previous.engine.applySettings(previousSettings,zUp)
          displaySettings=previousSettings;lastFrame=previousFrame;viewRevision=previousRevision
          schedule()
        }
        throw error
      }
    }
    // A structural composition change builds an independent engine, sharing
    // only the stage. A failed candidate never mutates the visible pipeline.
    const candidate: Partial<Pipeline> = { archiveScope: previous.archiveScope, ...(previous.releaseHost ? {releaseHost: previous.releaseHost} : {}) }
    candidates.add(candidate)
    const validate = async (build = false) => {
      let failure: unknown
      device.pushErrorScope('out-of-memory')
      device.pushErrorScope('validation')
      try {
        const engine = build ? timed('rebuild:scene-indices', () => prepareImaging(candidate, previous.stage, currentTime, next)) : candidate.engine!
        timed('rebuild:render', () => engine.Render(stormCamera(cameraController.frame()), Math.max(1,canvas.width), Math.max(1,canvas.height)))
      } catch (error) { failure = error }
      const result = device.popErrorScope(), memoryResult = device.popErrorScope()
      const [validationError,memoryError] = await Promise.all([result,memoryResult])
      active()
      if (memoryError) throw new Error(`WebGPU memory allocation: ${memoryError.message}`)
      if (failure) throw failure
      if (validationError) gpuError(validationError)
    }
    try {
      await validate(true)
      await picking
      active()
      await settleImaging(candidate,()=>validate(false),active)
      const previousSettings = displaySettings, previousFrame = lastFrame, previousRevision = viewRevision
      candidate.stage = previous.stage
      pipeline = candidate as Pipeline
      displaySettings = next
      try {
        ++viewRevision
        lastFrame = undefined
        draw(true)
      } catch (error) {
        pipeline = previous
        displaySettings = previousSettings
        lastFrame = previousFrame
        viewRevision = previousRevision
        schedule()
        throw error
      }
      candidates.delete(candidate)
      release(previous, true)
      updateCoverage(previous.stage, next)
      geometryChanged()
      return {...next}
    } catch (error) {
      release(candidate, true)
      throw error
    }
  }
  /** One validated draw of the retained engine (synchronizing the render
   *  index with every scene index change since the last draw). */
  async function validateRetained(current: Pipeline, active: () => void) {
    let failure: unknown
    device.pushErrorScope('out-of-memory')
    device.pushErrorScope('validation')
    try {
      cachedGeometry = undefined
      timed('retained:render', () => current.engine.Render(stormCamera(cameraController.frame()), Math.max(1,canvas.width), Math.max(1,canvas.height)))
    } catch (error) { failure = error }
    const result = device.popErrorScope(), memoryResult = device.popErrorScope()
    const [validationError,memoryError] = await Promise.all([result,memoryResult])
    active()
    if (memoryError) throw new Error(`WebGPU memory allocation: ${memoryError.message}`)
    if (failure) throw failure
    if (validationError) gpuError(validationError)
  }
  /** A time step's single engine Render, presented (stageView.py:1213-1223:
   *  one updateGL per frame), inside WebGPU error scopes. Paused or playing,
   *  nothing waits on the GPU (paintGL, stageView.py:1576-1600, checks no GL
   *  errors): the scopes report when they resolve, a validation error as a
   *  diagnostic and out-of-memory as a device failure, which stops the next
   *  time change. Awaiting them made each paused step wait for the frame's
   *  GPU work (Safari resolves the scopes after it), about 30 ms a step on
   *  CarbonFrameBike (performance-viewer.md, November 9). */
  async function timeStepDraw(current: Pipeline) {
    let failure: unknown
    device.pushErrorScope('out-of-memory')
    device.pushErrorScope('validation')
    try {
      cachedGeometry = undefined
      if (canvas.width < 1 || canvas.height < 1) current.engine.Render(stormCamera(cameraController.frame()), 1, 1)
      else timed('time:render', () => present(current))
    } catch (error) { failure = error; lastFrame = undefined }
    void Promise.all([device.popErrorScope(), device.popErrorScope()]).then(([validationError, memoryError]) => {
      if (validationError) gpuError(validationError)
      if (memoryError && !disposed && pipeline === current && !deviceFailure) {
        deviceFailure = `WebGPU memory allocation while drawing a frame: ${memoryError.message}. Reload the viewer.`
        status(deviceFailure)
      }
    }, error => { if (!disposed && pipeline === current) status(`WebGPU error scope failed: ${String(error)}`) })
    if (failure) throw failure
  }
  /** Draw and settle textures for the retained engine. */
  const syncRetained = (current: Pipeline, active: () => void) => settleImaging(current, () => validateRetained(current, active), active).then(() => validateRetained(current, active))
  async function changeComposition(command: CompositionCommand): Promise<CompositionResult> {
    if (disposed || !pipeline || !review) throw new Error('Load a scene before editing composition.')
    if (deviceFailure) throw new Error(deviceFailure)
    // appController.py:4960-4963: deactivation clears the selection so it cannot
    // hold paths from inactive prims.
    const commands = compositionCommands(command)
    const clearsSelection = commands.some(command => command.kind === 'activation' && !command.active)
    const previous = pipeline, version = generation, previousSelections=primSelection.snapshot().selections

    const previousCamera = cameraController.activeCameraPath
    const visibility = commands.every(command => command.kind === 'visibility' || command.kind === 'resetVisibility' || command.kind === 'removeVisibility')
    const loadsOnly = commands.every(command => command.kind === 'loadAndUnload')
    const previousErrors = new Set(previous.stage.getCompositionErrors().map(error => error.toString()))
    let structural = false, retained = false, validationAttempted = false, applied = false
    let result: CompositionResult | undefined
    const resultForStage = (): CompositionResult => {
      // Native selection uses the proxy scene path, not its compacted instance index.
      primSelection.replace(clearsSelection?[]:previousSelections)
      return {tree:primTree(previous.stage, currentTime).children,selection:refreshSelection()}
    }
    // rootDataModel.py:84-102: a resynced prim path is a structural (RESYNC)
    // prim change; others are info changes.
    const classify = (notice: UsdNotice.ObjectsChanged) => {
      for (const path of notice.getResyncedPaths()) if (!path.includes('.')) structural = true
    }
    const active = () => {
      if (disposed || version !== generation || pipeline !== previous) throw new DOMException('Composition change cancelled','AbortError')
      if (deviceFailure) throw new Error(deviceFailure)
    }
    orbit?.abort()
    updatingComposition = true
    if (pointer && canvas.hasPointerCapture(pointer.id)) canvas.releasePointerCapture(pointer.id)
    pointer = undefined
    ++viewRevision; lastFrame = undefined
    const listener = TfNotice.Register(UsdNotice.ObjectsChanged, classify, previous.stage)
    try {
      await picking
      active()
      await review.apply(command, async () => {
        active()
        validationAttempted = true
        const stage = previous.stage
        // UsdImagingStageSceneIndex turns the stage's change notices into
        // scene index notices, so the retained render index syncs only what
        // changed, as native Hydra change tracking does (structural edits
        // included). A failed validation falls back to a new engine.
        // usd/stage.cpp:3326: new composition errors are warnings, not a rejected edit.
        const errors = stage.getCompositionErrors().map(error => error.toString()).filter(error => !previousErrors.has(error))
        if (errors.length) setDiagnostics([...diagnostics, ...errors.map(message => ({severity:'warning' as const, message}))])
        // A muted/variant-hidden scene camera cannot drive the view.
        if (previousCamera && stage.getPrim(previousCamera)?.typeName !== 'Camera') cameraController.activeCameraPath = null
        try {
          retained = true
          await timedAsync('retained-sync', () => syncRetained(previous, active))
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') throw error
          if (visibility && !structural && !loadsOnly) throw error
          retained = false
          await changeDisplaySettings({}, true)
        }
        if (!loadsOnly) updateCoverage(stage, displaySettings)
        result = resultForStage()
        boundsPipeline = undefined
        if (retained) draw(true)
      })
      applied = true
      result ??= resultForStage() // An empty reset deliberately skips validation.
      callbacks.timeChanged?.(timeState()!)
      cameraChanged()
      geometryChanged()
      return result
    } catch (error) {
      cameraController.activeCameraPath = previousCamera
      // CompositionReview has restored the stage after validation failure.
      // Both retained sync and fallback notices can touch the old render index.
      if (validationAttempted && !applied && !disposed && pipeline === previous && generation === version && !(error instanceof AggregateError)) {
        try {
          await syncRetained(previous, active)
          primSelection.replace(previousSelections);refreshSelection()
          boundsPipeline = undefined
          draw(true)
        } catch (rollback) {
          const failure = new AggregateError([error,rollback], 'Review change failed and renderer rollback failed. Reload the viewer.')
          deviceFailure = failure.message; status(deviceFailure); throw failure
        }
      }
      if (error instanceof AggregateError) { deviceFailure = error.message; status(deviceFailure) }
      throw error
    } finally { listener.revoke(); updatingComposition = false; schedule() }
  }
  function timeState(): ViewerTimeState | null {
    const stage = pipeline?.stage
    if (!stage) return null
    const {warnings:_,...info}=startupTimeInfo(stage,startupOptions)
    return {...info,current:currentTime}
  }
  async function changeTime(time: number): Promise<ViewerTimeState> {
    if (!Number.isFinite(time)) throw new Error('Time must be a finite number.')
    if (disposed || !pipeline) throw new Error('Load a scene before changing time.')
    if (deviceFailure) throw new Error(deviceFailure)
    if (time === currentTime) return timeState()!
    orbit?.abort()
    const current = pipeline, version = generation, previousTime = currentTime
    const active = () => {
      if (disposed || version !== generation || pipeline !== current) throw new DOMException('Time change cancelled','AbortError')
      if (deviceFailure) throw new Error(deviceFailure)
    }
    updatingTime = true
    pendingRedraw = false
    ++viewRevision; ++timeRevisions
    lastFrame = undefined
    let presented = false
    try {
      await picking
      active()
      const playback = playing
      // ?loadSchedule=1: the frame's carriers load before it draws, as a
      // load-schedule plugin's LoadAndUnload runs on usdview's frame change; the
      // stage scene index turns its resync notices into the render index
      // sync of this frame's draw.
      const committed = committedLoadSchedule?.stage === current.stage ? committedLoadSchedule : undefined
      const scheduled = committed?.scheduler
      if (scheduled?.change(time)) {
        // The stage listener (prepareImaging) invalidates the HUD and bounds.
        try { await scheduled.update(time) }
        catch (error) { status(`Load schedule: ${error instanceof Error ? error.message : String(error)}`) }
        active()
      }
      // The layers of the carriers due next are read ahead, in the
      // background (load-prefetch.ts).
      committed?.prefetcher.update(time)
      cameraController.time = time
      // engine.cpp:509-519: UsdImagingStageSceneIndex::SetTime, then one
      // draw that syncs the render index and presents the frame.
      current.engine.SetTime(time)
      await timeStepDraw(current)
      // stageView.py:1547: playback does not wait for convergence.
      if (!playback) await settleImaging(current, () => timeStepDraw(current), active)
      currentTime = time
      presented = true
      // appController.py:3885-3889 _updateOnFrameChange: the property view,
      // HUD geometry counts (appController.py:3868-3876) and camera state
      // refresh only when playback is not running; setPlaybackActive(false)
      // refreshes them as playback stops (appController.py:2121).
      if (!playing) callbacks.selectionChanged(refreshSelection(false))
      callbacks.timeChanged?.(timeState()!)
      if (!playing) { cameraChanged(); geometryChanged() }
      return timeState()!
    } catch (error) {
      if (!disposed && pipeline === current && generation === version) {
        currentTime = previousTime
        cameraController.time = previousTime
        try { current.engine.SetTime(previousTime); cachedGeometry = undefined; draw(true) }
        catch (rollback) { deviceFailure = `Could not restore frame ${previousTime}: ${String(rollback)}. Reload the viewer.`; status(deviceFailure) }
      }
      throw error
    } finally {
      updatingTime = false
      // The frame is presented: draw again only for a request made meanwhile.
      if (!presented || pendingRedraw) schedule()
    }
  }
  return {
    async exportStage(kind, range) {
      if (disposed || !pipeline) throw new Error('Load a scene before exporting.')
      if (playing) throw new Error('Pause playback before exporting.')
      if (sceneLoadsInProgress || timeUpdate || displayUpdate || compositionUpdate) throw new Error('Wait for the current scene update before exporting.')
      return exportStage(pipeline.stage, kind, range)
    },
    getCompositionState(path) {
      if (!review || disposed) throw new Error('Load a scene before inspecting composition.')
      return review.state(path)
    },
    getEditState(path) {
      if (!review || disposed) throw new Error('Load a scene before editing.')
      return review.editState(path)
    },
    getDeferredPayloads() {
      const stage = pipeline?.stage
      if (!stage) return []
      return committedDeferredPayloads.filter(path => { const prim = stage.getPrim(path); return !!prim && primLoadability(prim).loadable && !primLoadability(prim).loaded })
    },
    reportPayloadProgress(update) {
      const progress = committedProgress
      if (!progress || !pipeline) return
      progress.payloads.done += update.loaded ?? 0
      progress.payloads.failed += update.failed ?? 0
      if (update.loaded || update.phase === 'done') refitAfterPayloads(update.phase === 'done')
      if (update.phase === 'cancelled') refit = undefined
      if (update.phase) progress.setPhase(update.phase); else progress.notify()
    },
    applyCompositionCommand(command) {
      if (sceneLoadsInProgress || timeUpdate || displayUpdate || compositionUpdate) return Promise.reject(new ViewerBusyError('Wait for the current scene update before editing composition.'))
      const changing = changeComposition(command)
      compositionUpdate = changing
      void changing.finally(() => { if (compositionUpdate === changing) compositionUpdate = undefined }).catch(() => {})
      return changing
    },
    // Window > USD Validation (usdviewq/validationWidget.py); the validation
    // libraries load on first use.
    async listValidators() { return (await import('./usd-validation')).listValidators() },
    async runValidation(request) {
      if (disposed || !pipeline) throw new Error('Load a scene before running validation.')
      // validationWidget.py:559-564: Run is disabled during playback.
      if (playing) throw new Error('Pause playback before running validation.')
      const stage = pipeline.stage
      return (await import('./usd-validation')).runValidation(stage, request, timeState())
    },
    getTimeState: timeState,
    getGeometryState: geometryState,
    getDiagnostics: () => diagnostics,
    setTime(time) {
      if (sceneLoadsInProgress || displayUpdate || compositionUpdate) return Promise.reject(new Error('Wait for the scene or display update before changing time.'))
      if (timeUpdate) return Promise.reject(new Error('A frame update is already in progress.'))
      const changing = changeTime(time)
      timeUpdate = changing
      void changing.finally(() => { if (timeUpdate === changing) timeUpdate = undefined }).catch(() => {})
      return changing
    },
    // Dome light textures are drawn as the background by HdxSkydomeTask;
    // the engine's domeLightCameraVisibility setting toggles them
    // (stage-view-engine.ts ApplySettings).
    supportsDomeLightTextures:()=>true,
    getBindingRelationship:(path,purpose)=>pipeline?MaterialBindingAPI.computeBoundMaterial(pipeline.stage,path,purpose)?.bindingRelPath??null:null,
    getSubtreeHudInfo:()=>pipeline?hudInfo.get(pipeline.stage,primSelection.snapshot().lcdPaths,currentTime):{},
    /** appController.py:5114-5200 onRollover: the prim under the pointer
     *  (stageView.py:1866-1873 picks on mouse moves with rolloverPicking). */
    async getRolloverInfo(x,y){
      if(!pipeline||!lastFrame||pointer||updatingComposition)return null
      const current=pipeline,snapshot=lastFrame,version=generation
      const valid=()=>!disposed&&generation===version&&pipeline===current&&viewRevision===snapshot.revision
      let result:{path:string,typeName:string}|null=null
      picking=picking.then(async()=>{
        if(!valid())return
        const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return
        const hit=await pickAt(current,snapshot,x*snapshot.width/rect.width,y*snapshot.height/rect.height)
        if(!hit||!valid())return
        result={path:hit.hitPrimPath,typeName:current.stage.getPrim(hit.hitPrimPath)?.typeName??''}
      }).catch(()=>{})
      await picking;return result
    },
    getDisplaySettings: () => ({...displaySettings}),
    setDisplaySettings(patch) {
      if (compositionUpdate) return Promise.reject(new Error('Wait for the composition update before changing display settings.'))
      if (timeUpdate) return Promise.reject(new Error('Wait for the frame update before changing display settings.'))
      if (sceneLoadsInProgress) return Promise.reject(new Error('Wait for the scene load before changing display settings.'))
      if (displayUpdate) return Promise.reject(new Error('A display change is already in progress.'))
      const changing = changeDisplaySettings(patch)
      displayUpdate = changing
      void changing.finally(() => { if (displayUpdate === changing) displayUpdate = undefined }).catch(() => {})
      return changing
    },
    refreshScene,
    setStartupOptions(options){
      if(disposed)throw new Error('Viewer is disposed.')
      if(pipeline||sceneLoadsInProgress)throw new Error('Configure startup options before opening a scene.')
      const parsed=normalizeStartupOptions(options);startupOptions=parsed.options
      displaySettings={...displaySettings,complexity:startupOptions.complexity??'low'}
      return parsed.warnings
    },
    open: openScene,
    openFile: openScene,
    openFiles: openScene,
    select(path,options) {if(updatingComposition)throw new Error('Wait for the composition update before selecting.');return selection(path,options?.instanceIndex,options?.operation)},
    selectPrims(selections){if(updatingComposition)throw new Error('Wait for the composition update before selecting.');primSelection.replace(selections);return refreshSelection()},
    getSelectionState:()=>primSelection.snapshot(),
    getPickMode:()=>pickMode,
    setPickMode(mode){if(!pickModes.includes(mode))throw new Error('Unknown pick mode');pickMode=mode},
    inspect: (path, propertyName, options) => pipeline ? inspectObject(pipeline.stage, path, propertyName, currentTime, options) : null,
    setPlaybackActive(active: boolean) {
      if (playing !== active) {
        playing = active
        // appController.py:2121,3868-3880 _updateGUIForFrameChange once playback
        // stops: the property view, HUD geometry counts and camera state.
        if (!active && pipeline && !disposed) { callbacks.selectionChanged(refreshSelection()); cameraChanged(); geometryChanged() }
        // The selection highlight depends on it (stageView.py:1510-1519):
        // redraw only on a change. A follower is told the play state with
        // every leader frame, and a redraw each time drew every frame twice.
        schedule()
      }
    },
    getPrimTree: options => pipeline ? primTree(pipeline.stage, currentTime,options?.includePrototypes).children : [],
    setAxesVisible(visible: boolean) { axesVisible = visible; schedule() },
    setLightingSource(source) {
      if (source !== 'usdview' && source !== 'frameRecorder') throw new Error(`Unknown lighting source ${String(source)}`)
      lightingSource = source
      if (pipeline) pipeline.engine.lightingSource = source
      schedule()
    },
    frameSelection() { if (disposed) throw new Error('Viewer is disposed.'); if(updatingComposition) throw new Error('Wait for the composition update.'); orbit?.abort(); lastViewContext=cameraController.copyViewState(); fit() },
    getCameraState: () => cameraController.state(),
    setCameraPresentation(patch){
      if(disposed)throw new Error('Viewer is disposed.')
      if(updatingComposition)throw new Error('Wait for the composition update.')
      const state=cameraController.presentationSettings(patch)
      ++viewRevision;cameraChanged();schedule();return state
    },
    toggleFramedView(){
      if(disposed)throw new Error('Viewer is disposed.')
      if(updatingComposition)throw new Error('Wait for the composition update.')
      orbit?.abort()
      if(lastViewContext){const previous=cameraController.copyViewState();cameraController.transaction(()=>cameraController.restoreViewState(lastViewContext!));lastViewContext=previous}
      ++viewRevision;cameraChanged();schedule();return cameraController.state()
    },
    setCameraSettings(patch) {
      if (disposed) throw new Error('Viewer is disposed.')
      if (updatingComposition) throw new Error('Wait for the composition update.')
      orbit?.abort()
      const state = cameraController.settings(patch)
      ++viewRevision; cameraChanged(); schedule(); return state
    },
    setActiveCamera(path) {
      if (disposed) throw new Error('Viewer is disposed.')
      if (updatingComposition) throw new Error('Wait for the composition update.')
      orbit?.abort()
      const state = cameraController.select(path)
      ++viewRevision; cameraChanged(); schedule(); return state
    },
    resetCamera() {
      if (disposed) throw new Error('Viewer is disposed.')
      if (updatingComposition) throw new Error('Wait for the composition update.')
      orbit?.abort()
      cameraController.transaction(() => {
        cameraController.reset()
        if (pipeline) fitStage(pipeline.stage,camera,null)
      })
      ++viewRevision; cameraChanged(); schedule(); return cameraController.state()
    },
    async captureViewerImage() {
      // Native framebuffer capture is atomic with respect to its UI frame. Our
      // animation update awaits WebGPU validation; wait for that in-flight frame
      // rather than rejecting normal Copy/Save actions during playback.
      const version=generation, current=pipeline
      if(timeUpdate)await timeUpdate
      if(version!==generation||current!==pipeline)throw new Error('The scene changed before its viewer image could be captured.')
      if (disposed || !pipeline) return Promise.reject(new Error('Load a scene before capturing the viewer image.'))
      if (sceneLoadsInProgress || updatingTime || updatingComposition || displayUpdate) return Promise.reject(new Error('Wait for the current scene update before capturing the viewer image.'))
      try { draw(true) } catch (error) { return Promise.reject(error) }
      // Encode in the same task as the draw: a WebGPU canvas only holds the frame
      // until it is presented. toBlob copies the bitmap synchronously.
      return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('The viewer image could not be encoded.')), 'image/png'))
    },
    async orbitOnce(signal, durationMs = 4000) {
      if (disposed || !pipeline) throw new Error('Load a scene before starting an orbit.')
      if (compositionUpdate || timeUpdate || displayUpdate) throw new Error('Wait for the scene update before starting an orbit.')
      orbit?.abort()
      primSelection.replace([])
      selected = null
      selectedInstance = undefined
      fit()
      const control = orbit = new AbortController()
      const abort = () => control.abort(signal?.reason)
      signal?.addEventListener('abort', abort, {once: true})
      if (signal?.aborted) abort()
      const version = generation, initial = camera.azimuth
      try {
        await animateOrbit(angle => {
          if (disposed || generation !== version) throw new DOMException('Scene changed', 'AbortError')
          if (deviceFailure) throw new Error(deviceFailure)
          camera.azimuth = initial + angle
          ++viewRevision
          draw()
        }, control.signal, Math.max(250, Math.min(durationMs, 60000)))
        await device.queue.onSubmittedWorkDone()
        control.signal.throwIfAborted()
        if (deviceFailure) throw new Error(deviceFailure)
      } finally {
        signal?.removeEventListener('abort', abort)
        if (orbit === control) orbit = undefined
      }
    },
    resize(width,height,pixelRatio) {
      if (disposed) return
      cssWidth = width
      const nextWidth = Math.max(1,Math.round(width*pixelRatio)), nextHeight = Math.max(1,Math.round(height*pixelRatio))
      if (canvas.width === nextWidth && canvas.height === nextHeight) return
      ++viewRevision
      canvas.width = nextWidth
      canvas.height = nextHeight
      // Redraw now rather than on the next animation frame: resize runs from a
      // ResizeObserver callback (after layout, before paint), so drawing here
      // presents a frame at the new size instead of the browser stretching the
      // previous one, which looked like the scene squashing while resizing.
      if (frame) { cancelAnimationFrame(frame); frame = 0 }
      try { draw() } catch { /* draw reports error */ }
    },
    dispose() {
      if (disposed) return
      TfDiagnosticMgr.GetInstance().removeDelegate(diagnosticDelegate)
      orbit?.abort()
      disposed = true; ++generation
      cameraController.stage=undefined;cameraController.activeCameraPath=null
      events.abort(); cancelAnimationFrame(frame)
      // The next runtime can reconnect to this same canvas before old readbacks
      // finish. Never let delayed cleanup unconfigure that new runtime's context.
      context.unconfigure()
      for (const candidate of candidates) release(candidate)
      const old = pipeline; pipeline = undefined; lastFrame = undefined
      void Promise.allSettled([picking, compositionUpdate, timeUpdate, displayUpdate]).finally(() => { release(old); axes?.destroy(); cameraOverlays?.destroy(); boxes?.destroy(); overlayLayer?.destroy(); hgi?.garbageCollect?.(); device.destroy() })
    },
  }
}

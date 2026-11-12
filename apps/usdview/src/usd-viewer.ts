// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usdImaging/usdviewq/appController.py,
//  pxr/usdImaging/usdviewq/mainWindowUI.ui,
//  pxr/usdImaging/usdviewq/appEventFilter.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import {viewerRoot} from './app-root'
import {displayMenuHtml,rendererMenuHtml,lightsMenuHtml,navigationMenuHtml} from './native-menus'
import type {StartupOptions} from './startup-options'
import {ViewPreferenceStore,defaultViewPreferences,type ViewPreferences,type PreferenceStorage} from './view-preferences'
import {defaultSplitPercentages} from './viewer-layout'
import {defaultPrimTreeSettings,filterPrimTree,removeCategorySelection,primShowMenuHtml,type PrimTreeSettings} from './prim-tree-settings'
import {MaterialControls,materialMenu,materialDialog} from './material-controls'
import {propertyContextMenuItems,targetSelection} from './property-context-menu'
import type {PrimSelection,SelectionOperation,PickMode} from './contracts'
import { ViewerBusyError } from './contracts'
import {PrimSelectionModel,pickModes} from './selection-model'
import { ExportControls } from './export-controls'
import { droppedFiles, selectedFiles, isUsdScenePath } from './local-asset-selection'
import type { LocalAssetFile, LocalAssetSet } from './local-assets'
import { parseInspectionPath } from './inspection-navigation'
import { CompositionControls, compositionMenu, compositionDialog } from './composition-controls'
import { renderInspection, appendTargetNavigation, appendArrayTable, appendCopyButton, type InspectorTab } from './inspector-view'
import type { PrimSummary, RuntimeFactory, SelectionDetail, ViewerRuntime, ViewerGeometryState, ViewerDiagnostic, LoadProgress } from './contracts'
import { payloadBatches, progressLines } from './load-progress'
import { backgroundColors, complexities, defaultDisplaySettings, type DisplaySettings } from './display-settings'
import { viewerStyles } from './viewer-styles'
import { TimelineControls } from './timeline-controls'
import { FollowSeeker, followHudText, followPlaybackText, type FollowComplexity } from './follow'
import { CameraControls, cameraMenu, cameraDialog, viewerImageFilename } from './camera-controls'
import { editActions, editMenuHtml, editMenuItems, editCommand, editStatusMessage, primContextMenuItems, type EditAction, type PrimContextMenuItem } from './edit-menu'
import { isMac, matchesShortcut, shortcutLabel } from './shortcuts'
import { PrimContextMenu, primContextMenuHtml } from './prim-context-menu'
import type { CompositionCommand, EditMenuState, InterpolationType } from './composition-types'
import { WindowControls, windowMenuHtml, preferencesDialog } from './window-menu'
import { HydraSceneDebuggerWindow, hydraSceneDebuggerHtml, hydraSceneDebuggerStyles } from './hydra-scene-debugger-view'
import { DebugFlagsWindow, debugFlagsHtml, debugFlagsStyles } from './debug-flags'
import { ValidationWindow, validationDialog } from './validation-window'
import { shadingModes, shadingModeMenuHtml, selectionHighlightMenuHtml } from './display-menus'
import { initialExpansion, markPrimSelection, pseudoRoot, renderPrimTree, setPrimExpanded } from './prim-tree-view'
import { elideValues, primLegendHtml, propertyLegendHtml, renderPropertyTable } from './property-table-view'
import { propertyColor, rgbText } from './usdview-style'

export interface ViewerScene { label: string; url: string }
type LoadResult = { ok: true } | { ok: false; error: unknown }
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException('Cancelled', 'AbortError'))
    signal.addEventListener('abort', abort, { once: true })
    promise.then(value => { signal.removeEventListener('abort', abort); resolve(value) }, error => { signal.removeEventListener('abort', abort); reject(error) })
    if (signal.aborted) abort()
  })
}

/** Browser presentation only. Inject a real runtime before connecting the element. */
export class UsdViewerElement extends HTMLElement {
  static observedAttributes = ['src']
  runtimeFactory: RuntimeFactory | undefined
  /** Origin-local preferences are opt-in for embedded consumers; the app enables them. */
  startupOptions:StartupOptions={}
  startupWarnings:readonly string[]=[]
  preferencesStorageKey:string|undefined
  preferencesStorage:PreferenceStorage|undefined
  #preferenceStore:ViewPreferenceStore|undefined
  #preferenceSaveQueued=false
  #restoringPreferences=false
  #pendingClipPreferences:Pick<ViewPreferences['camera'],'nearOverride'|'farOverride'>|undefined
  #preferenceWarnings:string[]=[]
  #cameraLoading = false
  #runtime: ViewerRuntime | undefined
  #generation = 0
  #loadGeneration = 0
  #loadAbort: AbortController | undefined
  #observer: ResizeObserver | undefined
  #propertyObserver: ResizeObserver | undefined
  #treeObserver: ResizeObserver | undefined
  #events: AbortController | undefined
  #scenes: ViewerScene[] = []
  #tree: PrimSummary[] = []
  #primTreeSettings=defaultPrimTreeSettings()
  #localFile: File | LocalAssetSet | undefined
  #pendingLocalAssets: LocalAssetFile[] = []
  #assetRead: AbortController | undefined
  #hasScene = false
  #selection: string | null = null
  #treeAnchor:string|undefined
  #detail: SelectionDetail = { path: null, properties: [] }
  #propertyName: string | null = null
  #propertyPaths: string[] = []
  #selectedTargets = new Set<string>()
  #arrayStart = 0
  #arrayObject = ''
  #lastPropertySearch = ''
  #inspectorTab: InspectorTab = 'value'
  /** Prim tree rows expanded by the user or by the initial depth-3 expansion. */
  #expanded = new Set<string>()
  /** Properties whose target/connection rows are shown. */
  #expandedProperties = new Set<string>()
  /** The time the prim tree's Vis column was computed at. */
  #treeTime: number | undefined
  #displayBusy = false
  #displayLoading = false
  #ready = false
  #root = this.attachShadow({ mode: 'open' })
  #exportControls = new ExportControls(this.#root, () => this.#runtime, () => this.#timeline.getRange())
  #compositionBusy = false
  #compositionControls = new CompositionControls(this.#root, () => this.#runtime, () => this.#selection, (result, command) => {
    this.#tree = result.tree; this.#renderTree(); this.#applySelection(result.selection); this.#cameraControls.refresh()
    // appController.py:2596-2601 resets the UI after an interpolation change; its
    // _reloadFixedUI stops playback and restores the stage frame range and step.
    if (command.kind === 'interpolation') this.#timeline.reset()
  }, busy => { this.#compositionBusy = busy; this.#updateBusyControls() })
  #materialControls = new MaterialControls(this.#root,()=>this.#runtime?.getDisplaySettings?.()??defaultDisplaySettings(),patch=>this.#changeDisplay(patch))
  #cameraControls = new CameraControls(this.#root, () => this.#runtime, error => this.#statusMessage(String(error)))
  #windowControls = new WindowControls(this.#root, this,()=>this.#queueViewPreferences())
  #hydraSceneDebugger: HydraSceneDebuggerWindow
  #debugFlags: DebugFlagsWindow
  #validationWindow = new ValidationWindow(this.#root, () => this.#runtime,
    () => (this.#detail.selections ?? [{ path: this.#selection ?? '/' }]).map(entry => entry.path),
    paths => this.#selectPrims(paths.map(path => ({ path }))), () => this.#playbackActive)
  #primMenu = new PrimContextMenu(this.#root, item => this.#runPrimContext(item))
  #timeline = new TimelineControls(this.#root, () => this.#runtime, error => this.#statusMessage(String(error)),
    () => this.#validationWindow.updateRunButtonState())
  /** ?follow= (follow.ts): one seek in flight, the newest leader frame waiting. */
  /** The sync leader's play state while following (followTime). */
  #leaderPlaying = false
  /** usdview's dataModel.playing: this viewer's own playback, or its leader's while following. */
  get #playbackActive(): boolean { return this.#timeline.playing || (this.#timeline.following && this.#leaderPlaying) }
  #follow = new FollowSeeker({
    seek: async time => { await this.#timeline.seek(time); return this.#runtime?.getTimeState?.()?.current },
    complexity: id => this.#runtime?.getDisplaySettings?.().complexity === id ? Promise.resolve() : this.#changeDisplay({ complexity: id }),
    changed: status => { this.#followLagText.textContent = `     Follow: ${followHudText(status)}`; this.#timeline.followTiming = followPlaybackText(status) },
  })
  #canvas: HTMLCanvasElement
  #status: HTMLElement
  // Written on every playback frame; looked up once, as a querySelector would walk the
  // prim tree rows that precede them in the shadow template.
  #renderTiming: HTMLElement
  #followLagText: HTMLElement
  #statusFeedbackTimer: ReturnType<typeof setTimeout> | undefined
  /** Native USD diagnostics go to stderr; the runtime forwards them to the
   * browser console. Preserve the event for embedding consumers. */
  #reportDiagnostics(diagnostics: readonly ViewerDiagnostic[]): void {
    diagnostics=[...this.#preferenceWarnings.map(message=>({severity:'warning' as const,message})),...diagnostics]
    this.dispatchEvent(new CustomEvent('diagnostics-changed', {detail: diagnostics, bubbles: true, composed: true}))
  }
  #overlay: HTMLElement
  /** showWelcome: the scene the note was shown over, and its tour action. */
  #welcomeSource: string | undefined
  #welcomeTour: (() => void | Promise<void>) | undefined
  #welcomeOnDefault = false
  #playWhenReady = false
  #streamAbort: AbortController | undefined
  #progressFrame = 0
  #progress: LoadProgress | undefined
  #treeHost: HTMLElement
  #inspector: HTMLElement
  #openReturnFocus: HTMLElement | null = null
  #sourceInput: HTMLInputElement
  #sceneSelect: HTMLSelectElement
  #frameButton: HTMLButtonElement

  constructor() {
    super()
    const mac = isMac()
    // Layout follows OpenUSD usdviewq/mainWindowUI.ui: prim/stage splitter
    // above property/value splitter, with the native-style timeline below.
    // File inventory: mainWindowUI.ui:1653-1658; browser choices live in Open.
    this.#root.innerHTML = `<style>${viewerStyles}${hydraSceneDebuggerStyles}${debugFlagsStyles}</style>
      <div class="shell" part="shell">
        <div class="menubar" part="toolbar">
          <details class="menu file-menu"><summary>File</summary><div class="menu-popup file-popup">
            <button type="button" class="open-scene">Open<kbd>${shortcutLabel('Ctrl+O', mac)}</kbd></button>
            <button type="button" class="reopen-scene" disabled>Reopen Stage<kbd>${shortcutLabel('Ctrl+Shift+R', mac)}</kbd></button>
            <button type="button" class="reload-scene" disabled>Reload All Layers<kbd>${shortcutLabel('Ctrl+R', mac)}</kbd></button>
            <button type="button" class="close-scene" disabled>Close Stage</button>
            <hr><button type="button" class="save-overrides" disabled>Save Overrides As...</button><button type="button" class="save-flattened" disabled>Save Flattened As...</button>
          </div></details>
          <div hidden>${compositionMenu}</div>${editMenuHtml()}
          ${windowMenuHtml()}
          <a class="licenses-link" href="${new URL('licenses/', viewerRoot()).href}" target="_blank" rel="noopener">Licenses</a>
        </div>
        <form class="path-form" aria-label="Navigate to prim or property"><input class="current-path" aria-label="Current prim or property path" value="/" spellcheck="false"></form>
        <div class="workbench">
          <div class="top-row">
            <section class="panel hierarchy" aria-label="Scene hierarchy" part="hierarchy">
              <div class="panel-menubar">
                ${navigationMenuHtml(mac)}
                <details class="menu"><summary>Show</summary><div class="menu-popup">${primShowMenuHtml(mac)}</div></details>
              </div>
              <div class="tree-columns"><span>Prim Name</span><span>Type</span><span>Vis</span><span>Guides</span><span>Draw Mode</span></div>
              <div class="tree-host"><p class="empty">No stage loaded.</p></div>
              ${primLegendHtml}
              <form class="find-form"><button type="button" class="legend-button" data-legend="prim" title="Prim legend" aria-expanded="false">?</button><input class="prim-search" aria-label="Search for prim by name" placeholder="Search for prim by name"><button type="submit">Find Prim</button></form>
            </section>
            <div class="splitter" data-split="top" role="separator" tabindex="0" aria-label="Prim and viewport width" aria-orientation="vertical"></div>
            <section class="panel render-panel" aria-label="Stage view">
              <div class="panel-menubar render-menus">
                ${rendererMenuHtml(mac)}
                ${displayMenuHtml(mac)}
                <details class="menu select-menu"><summary>Select</summary><div class="menu-popup" role="menu">${pickModes.map(mode=>`<button type="button" role="menuitemradio" aria-checked="${mode==='prims'}" data-pick-mode="${mode}">Select ${mode[0]!.toUpperCase()+mode.slice(1)}</button>`).join('')}</div></details>
                ${cameraMenu}
                ${lightsMenuHtml()}
              </div>
              <div class="viewport" part="viewport"><canvas tabindex="0" aria-label="USD scene viewport. Drag to orbit; click to select prims."></canvas><input class="show-axes" type="checkbox" checked hidden><div class="rollover-info" hidden></div><div class="viewport-hud" aria-label="Viewport information">
                <div class="hud-info" hidden></div><div class="hud-renderer">Hydra: Storm<br>  Hgi: WebGPU</div>
                <div class="hud-performance" title="Render measures CPU draw submission only; excludes animation synchronization and GPU completion, so it is not directly comparable to native render time. Playback measures actual frame cadence including animation work and rate limiting."><span class="render-timing">     Render: N/A</span><br><span class="playback-timing">   Playback: N/A</span><span class="follow-lag" hidden title="Following a sync leader: the leader's newest frame, the frame shown, the difference, and the last frame change's time (seek plus draw)."><br><span class="follow-lag-text"></span></span></div>
                <div class="hud-camera">Camera: <span class="camera-caption">Free</span><br>Complexity: <span class="complexity-caption">Low</span></div>
              </div><div class="overlay" role="status"><strong>No stage loaded</strong><p>Use File to open a scene URL.</p><div class="load-progress"></div><button class="load-cancel" type="button" hidden>Cancel</button></div><div class="welcome" role="note" hidden><p><strong>Drop a USD file</strong> (.usd, .usda, .usdc, .usdz), or <strong>its folder</strong> if it references other files, anywhere on this window to open it.</p><button class="start-tour" type="button" hidden>Start Museum Tour</button><button class="welcome-dismiss" type="button" aria-label="Dismiss" title="Dismiss">✕</button></div></div>

            </section>
          </div>
          <div class="splitter horizontal" data-split="vertical" role="separator" tabindex="0" aria-label="Stage and property height" aria-orientation="horizontal"></div>
          <div class="bottom-row">
            <section class="panel property-panel" aria-label="Prim properties" part="properties"><div class="property-content"></div>${propertyLegendHtml}<form class="find-property-form"><button type="button" class="legend-button" data-legend="property" title="Property legend" aria-expanded="false">?</button><input class="property-search" aria-label="Search for property by name" placeholder="Search for property by name"><button type="submit">Find Prop</button></form></section>
            <div class="splitter" data-split="bottom" role="separator" tabindex="0" aria-label="Property and value width" aria-orientation="vertical"></div>
            <section class="panel inspector" aria-label="Prim inspector" part="inspector">
              <div class="tabs" role="tablist" aria-label="Property details"><button role="tab" data-inspector-tab="value" aria-selected="true">Value</button><button role="tab" data-inspector-tab="metadata" aria-selected="false">Meta Data</button><button role="tab" data-inspector-tab="layers" aria-selected="false">Layer Stack</button><button role="tab" data-inspector-tab="composition" aria-selected="false">Composition</button></div>
              <div class="inspector-content" role="tabpanel"></div>
            </section>
          </div>
        </div>
        <div class="timeline" aria-label="Timeline">
          <div class="playback-range">
            <div class="range-controls">
              <span class="stage-start" title="Stage start frame">0.0</span>
              <input aria-label="Playback start frame" value="" disabled>
              <div class="frame-slider" role="slider" aria-label="Current time" aria-valuemin="0" aria-valuemax="0" aria-valuenow="0" aria-disabled="true"><span class="frame-handle"></span></div>
              <input aria-label="Playback end frame" value="" disabled>
              <span class="stage-end" title="Stage end frame">0.0</span>
            </div>
            <div class="scrub-settings"><label><input type="checkbox" checked disabled> Redraw On Frame Scrub</label><label>Step Size <input value="1.0" disabled aria-label="Frame step"></label></div>
          </div>
          <div class="playback-current"><button disabled title="Animation playback is not implemented">Play</button><label>Frame: <input aria-label="Current frame" value="0.0" disabled></label></div>
        </div>
        <div class="ts-sticker" role="img" aria-label="TypeScript Edition: the TypeScript port, not OpenUSD's usdview" title="The TypeScript port of usdview (typescript-usd), not OpenUSD's usdview"><svg viewBox="0 0 160 80" aria-hidden="true"><polygon points="80.0,2.0 90.7,7.0 104.1,3.9 111.2,10.2 125.8,9.3 128.5,16.4 143.1,17.7 141.2,24.8 154.2,28.3 147.8,34.8 158.0,40.0 147.8,45.2 154.2,51.7 141.2,55.2 143.1,62.3 128.5,63.6 125.8,70.7 111.2,69.8 104.1,76.1 90.7,73.0 80.0,78.0 69.3,73.0 55.9,76.1 48.8,69.8 34.2,70.7 31.5,63.6 16.9,62.3 18.8,55.2 5.8,51.7 12.2,45.2 2.0,40.0 12.2,34.8 5.8,28.3 18.8,24.8 16.9,17.7 31.5,16.4 34.2,9.3 48.8,10.2 55.9,3.9 69.3,7.0"/><text text-anchor="middle"><tspan x="80" y="39">TypeScript</tspan><tspan class="ts-sticker-edition" x="80" y="57">Edition</tspan></text></svg></div>
        <div class="statusbar" part="status"><span class="status" role="status" aria-live="polite">Ready to initialize</span></div>
      </div>${primContextMenuHtml}${cameraDialog}${materialDialog}${compositionDialog}${preferencesDialog}${hydraSceneDebuggerHtml}${debugFlagsHtml}${validationDialog}<dialog class="open-dialog" aria-label="Open USD scene"><h2>Open</h2>            <label class="file-label" for="local-file">Open local USD file</label>
            <input id="local-file" class="local-file" type="file" accept=".usd,.usda,.usdc,.usdz" aria-label="Open local USD file" aria-describedby="local-file-help" disabled>
            <p id="local-file-help">USD or USDZ. External layers and textures must be included using files/folder, or hosted at authored HTTP(S) URLs.</p>
            <label class="file-label" for="local-files">Open files with dependencies</label>
            <input id="local-files" class="local-files" type="file" multiple aria-label="Open files with dependencies" disabled>
            <label class="file-label" for="local-folder">Open folder</label>
            <input id="local-folder" class="local-folder" type="file" webkitdirectory multiple aria-label="Open folder" disabled>
            <form class="local-root-form" hidden><label for="local-root">Root scene</label><select id="local-root" class="local-root" aria-label="Root scene"></select><button type="submit" class="open-local-root" disabled>Open selected scene</button><button type="button" class="cancel-local-root">Cancel</button><p class="local-root-help"></p></form>
            <label class="file-label">Open scene URL</label>
            <form class="url-form"><input class="url" aria-label="Scene URL" placeholder="https://…/scene.usda" spellcheck="false"><button type="submit">Open</button></form>
            <label class="file-label" for="examples">Examples</label><select id="examples" class="scene-select" aria-label="Example scene"><option value="">Choose example…</option></select><footer><button type="button" class="close-open">Cancel</button></footer></dialog><button type="button" class="save-session" hidden disabled>Save Session Edits As…</button><p class="export-status" role="status" aria-live="polite" hidden></p>`
    this.#canvas = this.#get('canvas')
    this.#status = this.#get('.status')
    this.#renderTiming = this.#get('.render-timing')
    this.#followLagText = this.#get('.follow-lag-text')
    this.#overlay = this.#get('.overlay')
    this.#get('.start-tour').addEventListener('click', () => {
      const start = this.#welcomeTour, button = this.#get<HTMLButtonElement>('.start-tour')
      if (!start) return
      button.disabled = true; this.#statusMessage('Starting the tour…')
      void Promise.resolve().then(start).catch(error => { console.warn(error); this.#statusMessage(error instanceof Error ? error.message : String(error)) }).finally(() => { button.disabled = false })
    })
    this.#get('.welcome-dismiss').addEventListener('click', () => this.hideWelcome())
    this.#get('.load-cancel').addEventListener('click', () => {
      if (this.#streamAbort) this.#streamAbort.abort()
      else if (this.#loadAbort && this.#cameraLoading) { this.#loadAbort.abort(); this.#statusMessage('Load cancelled') }
    })
    this.#treeHost = this.#get('.tree-host')
    this.#inspector = this.#get('.inspector-content')
    this.#sourceInput = this.#get('.url')
    this.#sceneSelect = this.#get('.scene-select')
    this.#frameButton = this.#get('.frame')
    this.#hydraSceneDebugger = new HydraSceneDebuggerWindow(this.#root)
    this.#debugFlags = new DebugFlagsWindow(this.#get('.debug-flags-window'))
  }

  #preferenceWarning(message:string){
    if(!this.#preferenceWarnings.includes(message)){this.#preferenceWarnings.push(message);console.warn(message);this.#reportDiagnostics(this.#runtime?.getDiagnostics?.()??[])}
  }
  #queueViewPreferences(){
    if(!this.#preferenceStore||this.#restoringPreferences||this.#preferenceSaveQueued)return
    this.#preferenceSaveQueued=true;queueMicrotask(()=>{this.#preferenceSaveQueued=false;if(this.isConnected)this.#saveViewPreferences()})
  }
  #saveViewPreferences(){
    if(!this.#preferenceStore||this.#restoringPreferences||!this.#ready)return
    const defaults=defaultViewPreferences({...this.getPrimTreeSettings()}),camera=this.#runtime?.getCameraState?.()
    const {complexity:_,...display}=this.#runtime?.getDisplaySettings?.()??{...defaults.display,complexity:'low'}
    const snapshot:ViewPreferences={display,camera:camera?.free??defaults.camera,presentation:camera?.presentation??defaults.presentation,tree:{...this.getPrimTreeSettings()},pickMode:this.#runtime?.getPickMode?.()??defaults.pickMode,ui:{fontSize:this.#windowControls.fontSize,showHUD:this.#get<HTMLInputElement>('.show-hud').checked,axesVisible:this.#get<HTMLInputElement>('.show-axes').checked,viewerMode:this.#windowControls.viewerMode,redrawOnScrub:this.#get<HTMLInputElement>('.scrub-settings input[type=checkbox]').checked,inspectorTab:this.#inspectorTab,splits:{...defaultSplitPercentages}}}
    for(const axis of ['top','bottom','vertical'] as const){const text=this.style.getPropertyValue(`--${axis}-split`);if(text)snapshot.ui.splits[axis]=Number(text.replace('%',''))}
    for(const warning of this.#preferenceStore.save(snapshot))this.#preferenceWarning(warning)
  }
  async #restoreViewPreferences(runtime:ViewerRuntime,generation:number){
    if(!this.preferencesStorageKey)return
    this.#restoringPreferences=true
    const defaults=defaultViewPreferences({...this.getPrimTreeSettings()})
    this.#preferenceStore=new ViewPreferenceStore(()=>this.preferencesStorage??window.localStorage,this.preferencesStorageKey,defaults)
    const {preferences:p,warnings}=this.#preferenceStore.load();for(const warning of warnings)this.#preferenceWarning(warning)
    try{await runtime.setDisplaySettings?.({...p.display,complexity:'low'})}catch(error){this.#preferenceWarning(`Saved display preferences could not be applied: ${String(error)}`)}
    if(generation!==this.#generation||!this.isConnected||this.#runtime!==runtime)return
    try{runtime.setCameraSettings?.({fovDegrees:p.camera.fovDegrees,aspectRatio:p.camera.aspectRatio});this.#pendingClipPreferences={nearOverride:p.camera.nearOverride,farOverride:p.camera.farOverride}}catch(error){this.#preferenceWarning(`Saved free-camera preferences could not be applied: ${String(error)}`)}
    try{runtime.setCameraPresentation?.(p.presentation)}catch(error){this.#preferenceWarning(`Saved camera presentation preferences could not be applied: ${String(error)}`)}
    runtime.setPickMode?.(p.pickMode)
    this.setPrimTreeSettings(p.tree,{removeCategorySelections:false})
    this.#windowControls.setFontSize(p.ui.fontSize);if(this.#windowControls.viewerMode!==p.ui.viewerMode)this.#windowControls.toggleViewerMode()
    this.#get<HTMLInputElement>('.show-hud').checked=p.ui.showHUD;this.#get<HTMLElement>('.viewport-hud').hidden=!p.ui.showHUD
    this.#get<HTMLInputElement>('.show-axes').checked=p.ui.axesVisible
    this.#get<HTMLInputElement>('.scrub-settings input[type=checkbox]').checked=p.ui.redrawOnScrub
    this.#inspectorTab=p.ui.inspectorTab
    for(const axis of ['top','bottom','vertical'] as const)this.#setSplit(axis,p.ui.splits[axis])
    this.#cameraControls.refresh()
  }

  #get<T extends Element>(selector: string): T { return this.#root.querySelector<T>(selector)! }
  get src(): string { return this.getAttribute('src') ?? '' }
  set src(value: string) { this.setAttribute('src', value) }
  get scenes(): ViewerScene[] { return [...this.#scenes] }
  set scenes(value: ViewerScene[]) {
    this.#scenes = value.map(scene => ({ ...scene }))
    this.#sceneSelect.replaceChildren(new Option('Examples', ''))
    for (const scene of value) this.#sceneSelect.add(new Option(scene.label, scene.url))
    this.#sceneSelect.value = this.src
    this.#updateBusyControls()
  }

  connectedCallback(): void {
    const generation = ++this.#generation
    this.#events = new AbortController()
    const options = { signal: this.#events.signal }
    this.#exportControls.bind(this.#events.signal)
    this.#get('.open-scene').addEventListener('click',()=>this.#showOpenDialog(),options)
    this.#get('.close-open').addEventListener('click',()=>this.#closeOpenDialog(true),options)
    const openDialog=this.#get<HTMLDialogElement>('.open-dialog')
    openDialog.addEventListener('cancel',event=>{event.preventDefault();this.#closeOpenDialog(true)},options)
    openDialog.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();this.#closeOpenDialog(true)}
      else if(event.key==='Tab'){
        const controls=[...openDialog.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLButtonElement>('input,select,button')].filter(control=>!control.disabled&&!control.closest('[hidden]'))
        const first=controls[0],last=controls.at(-1),active=this.#root.activeElement
        if(event.shiftKey&&active===first){event.preventDefault();last?.focus()}
        else if(!event.shiftKey&&active===last){event.preventDefault();first?.focus()}
      }
    },options)
    for(const selector of ['.save-overrides','.save-flattened'])this.#get(selector).addEventListener('click',()=>this.#closeMenus(),options)
    // File > Close Stage (not in usdview): the page returns to the welcome scene (main.ts).
    this.#get('.close-scene').addEventListener('click', () => {
      this.#get<HTMLDetailsElement>('.file-menu').open = false
      this.dispatchEvent(new CustomEvent('close-stage', { bubbles: true, composed: true }))
    }, options)
    for (const [selector,kind] of [['.reload-scene','reload'],['.reopen-scene','reopen']] as const) {
      this.#get(selector).addEventListener('click', () => { void this.#refreshScene(kind) }, options)
    }
    this.#compositionControls.bind(this.#events.signal)
    this.#windowControls.bind(this.#events.signal)
    this.#hydraSceneDebugger.bind(this.#events.signal)
    this.#debugFlags.bind(this.#events.signal)
    this.#validationWindow.bind(this.#events.signal)
    this.#primMenu.bind(this.#events.signal)
    document.addEventListener('keydown', event => this.#shortcutKey(event), options)
    // A Space that toggled playback must not also activate a focused button on keyup.
    document.addEventListener('keyup', event => { if (event.code === 'Space' && this.#consumedSpace) { this.#consumedSpace = false; event.preventDefault() } }, options)
    this.#get('.find-prims').addEventListener('click', () => { this.#closeMenus(); this.#get<HTMLInputElement>('.prim-search').focus() }, options)
    this.#treeHost.addEventListener('contextmenu', event => {
      const row = (event.target as Element).closest<HTMLButtonElement>('.prim')
      if (!row?.dataset.path) return
      event.preventDefault(); this.#openPrimMenu(row, event.clientX, event.clientY)
    }, options)
    this.#get('.window-popup').addEventListener('click', event => {
      const target = (event.target as Element).closest<HTMLButtonElement>('button')
      if (!target || target.disabled) return
      this.#closeMenus()
      if (target.dataset.window === 'viewerMode') this.#windowControls.toggleViewerMode()
      else if (target.dataset.window === 'hydraSceneDebugger') void this.#hydraSceneDebugger.show()
      else if (target.dataset.window === 'debugFlags') this.#debugFlags.show()
    }, options)
    this.#get('.edit-menu').addEventListener('toggle', () => { if (this.#get<HTMLDetailsElement>('.edit-menu').open) this.#refreshEditMenu() }, options)
    this.#get('.edit-popup').addEventListener('click', event => {
      const target = (event.target as Element).closest<HTMLButtonElement>('button')
      if (!target || target.disabled) return
      this.#closeMenus()
      if (target.dataset.edit) void this.#runEdit(target.dataset.edit as EditAction)
      else if (target.dataset.interpolation) void this.#runCommand({kind:'interpolation',interpolation:target.dataset.interpolation as InterpolationType})
    }, options)
    this.#cameraControls.bind(this.#events.signal)
    this.#materialControls.bind(this.#events.signal)
    this.#get('.copy-viewer-image').addEventListener('click', () => { this.#closeMenus(); this.#copyViewerImage() }, options)
    this.#get('.save-viewer-image').addEventListener('click', () => { this.#closeMenus(); void this.#saveViewerImage() }, options)
    this.#timeline.bind(this.#events.signal)
    const refreshHud=()=>this.#refreshHudSections()
    for(const input of this.#root.querySelectorAll<HTMLInputElement>('[data-hud]'))input.addEventListener('change',refreshHud,options)
    for(const input of this.#root.querySelectorAll<HTMLInputElement>('[data-tree-column]'))input.addEventListener('change',()=>{
      this.#closeMenus();this.#refreshTreeColumns();this.#renderTree()
    },options)
    this.#refreshTreeColumns()
    this.#get('.navigation-menu').addEventListener('click',event=>{
      const button=(event.target as Element).closest<HTMLButtonElement>('[data-navigation]');if(!button||button.disabled)return
      this.#closeMenus();this.#runNavigation(button.dataset.navigation!)
    },options)
    this.#get('.navigation-menu').addEventListener('toggle',()=>this.#refreshNavigation(),options)
    let rolloverTimer:ReturnType<typeof setTimeout>|undefined,rolloverEpoch=0
    const hideRollover=()=>{clearTimeout(rolloverTimer);rolloverEpoch++;this.#get<HTMLElement>('.rollover-info').hidden=true}
    this.#get('.show-rollover').addEventListener('change',hideRollover,options)
    this.#get('canvas').addEventListener('pointerleave',hideRollover,options)
    this.#get('canvas').addEventListener('pointerdown',hideRollover,options)
    this.#get<HTMLCanvasElement>('canvas').addEventListener('pointermove',event=>{
      hideRollover();if(!this.#get<HTMLInputElement>('.show-rollover').checked||event.buttons||!this.#runtime?.getRolloverInfo)return
      const epoch=rolloverEpoch,runtime=this.#runtime,rect=(event.currentTarget as HTMLElement).getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top
      rolloverTimer=setTimeout(()=>{void runtime.getRolloverInfo!(x,y).then(info=>{
        if(epoch!==rolloverEpoch||runtime!==this.#runtime||!info)return
        const tip=this.#get<HTMLElement>('.rollover-info');tip.textContent=info.typeName+' '+info.path;tip.style.left=Math.min(x+12,Math.max(0,rect.width-240))+'px';tip.style.top=Math.max(0,y+16)+'px';tip.hidden=false
      }).catch(()=>{})},120)
    },options)
    this.#events.signal.addEventListener('abort',hideRollover,{once:true})
    this.#get<HTMLInputElement>('.show-axes').addEventListener('change', event => this.#runtime?.setAxesVisible?.((event.target as HTMLInputElement).checked))
    this.#get<HTMLInputElement>('.show-hud').addEventListener('change', event => { this.#get<HTMLElement>('.viewport-hud').hidden = !(event.target as HTMLInputElement).checked })
    for (const control of this.#root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-display]')) control.addEventListener('change', () => {
      const key = control.dataset.display as keyof DisplaySettings
      const value = control instanceof HTMLInputElement && control.type !== 'radio' ? control.checked : control.value
      this.#closeMenus(); void this.#changeDisplay({[key]:value})
    }, options)
    this.#get('.highlight-menu').addEventListener('click', event => {
      const mode = (event.target as Element).closest<HTMLButtonElement>('[data-highlight-mode]')
      if (!mode || mode.disabled) return
      this.#closeMenus(); void this.#changeDisplay({selHighlightMode: mode.dataset.highlightMode as DisplaySettings['selHighlightMode']})
    }, options)
    this.#get('.select-menu').addEventListener('click',event=>{
      const button=(event.target as Element).closest<HTMLButtonElement>('[data-pick-mode]')
      if(!button||button.disabled||!this.#runtime?.setPickMode)return
      this.#runtime.setPickMode(button.dataset.pickMode as PickMode)
      this.#updatePickControls();this.#closeMenus()
    },options)
    this.#get('.shading-menu').addEventListener('click', event => {
      const mode=(event.target as Element).closest<HTMLButtonElement>('[data-shading-mode]')
      if(!mode||mode.disabled)return
      this.#closeMenus();void this.#changeDisplay({renderMode:mode.dataset.shadingMode as DisplaySettings['renderMode']})
    }, options)
    this.#get('.highlight-color-menu').addEventListener('click', event => {
      const color=(event.target as Element).closest<HTMLButtonElement>('[data-highlight-color]')
      if(!color||color.disabled)return
      this.#closeMenus();void this.#changeDisplay({highlightColor:color.dataset.highlightColor as DisplaySettings['highlightColor']})
    }, options)
    this.#get('.url-form').addEventListener('submit', event => {
      event.preventDefault()
      const source = this.#sourceInput.value.trim()
      if (source) {
        this.#clearPendingLocal(); this.#localFile = undefined
        this.#closeOpenDialog()
        if (this.src === source) void this.#open(source)
        else this.src = source
      }
    }, options)
    for (const selector of ['.local-files','.local-folder']) this.#get<HTMLInputElement>(selector).addEventListener('change', event => {
      const input=event.target as HTMLInputElement, files=selectedFiles(input.files??[]);input.value=''
      this.#clearPendingLocal(); if(files.length)this.#offerLocalAssets(files)
    }, options)
    this.#get('.local-root').addEventListener('change',()=>{this.#get<HTMLButtonElement>('.open-local-root').disabled=!this.#get<HTMLSelectElement>('.local-root').value},options)
    this.#get('.cancel-local-root').addEventListener('click',()=>this.#clearPendingLocal(),options)
    this.#get('.local-root-form').addEventListener('submit',event=>{
      event.preventDefault();const path=this.#get<HTMLSelectElement>('.local-root').value
      if(path && this.#pendingLocalAssets.some(e=>e.path===path))this.#openLocalAssets(this.#pendingLocalAssets,path)
    },options)
    this.addEventListener('dragover',event=>{
      if(!event.dataTransfer?.types.includes('Files'))return
      event.preventDefault();event.dataTransfer.dropEffect='copy';this.setAttribute('data-file-drag','')
    },options)
    this.addEventListener('dragleave',()=>this.removeAttribute('data-file-drag'),options)
    this.addEventListener('drop',event=>{
      if(!event.dataTransfer?.types.includes('Files'))return
      event.preventDefault();event.stopPropagation();this.removeAttribute('data-file-drag')
      this.#clearPendingLocal()
      if(!this.#ready){this.#statusMessage('Wait for the viewer to initialize before dropping files.');return}
      const read=this.#assetRead=new AbortController()
      // Begin collection within the drop handler, before drag data is protected.
      const files=droppedFiles(event.dataTransfer,read.signal)
      this.#statusMessage('Reading dropped files…')
      void files.then(entries=>{if(!read.signal.aborted&&this.isConnected)this.#offerLocalAssets(entries)})
        .catch(error=>{if(!read.signal.aborted)this.#statusMessage(String(error))})
    },options)
    this.#get<HTMLInputElement>('.local-file').addEventListener('change', event => {
      const input = event.target as HTMLInputElement
      const file = input.files?.[0]
      input.value = '' // Allow reopening the same file after editing it on disk.
      if (!file) return
      this.#clearPendingLocal()
      this.#sceneSelect.value = ''
      this.#closeOpenDialog()
      void this.#open(file.name, file)
    }, options)
    this.#sceneSelect.addEventListener('change', () => {
      if (this.#sceneSelect.value) {
        this.#clearPendingLocal(); this.#localFile = undefined
        const source = this.#sceneSelect.value
        if (this.src === source) void this.#open(source)
        else this.src = source
        this.#closeOpenDialog()
      }
    }, options)
    this.#frameButton.addEventListener('click', () => {
      try { this.#runtime?.frameSelection(); this.#frameButton.closest('details')!.open = false } catch (error) { this.#statusMessage(error instanceof Error ? error.message : String(error)) }
    }, options)
    this.#get('.find-form').addEventListener('submit', event => {
      event.preventDefault()
      const text = this.#get<HTMLInputElement>('.prim-search').value.trim().toLowerCase()
      if (!text) return
      const rows = [...this.#treeHost.querySelectorAll<HTMLButtonElement>('.prim')].filter(row => row.dataset.path !== '/')
      const matches = rows.filter(row => row.querySelector('.prim-name')!.textContent!.toLowerCase().includes(text))
      const current = matches.findIndex(row => row.dataset.path === this.#selection)
      const next = matches[(current + 1) % matches.length]
      // appController.py:2311 setCurrentItem expands the tree to the found prim.
      if (next?.dataset.path) { this.#select(next.dataset.path); this.#reveal(next.dataset.path) }
      else this.#statusMessage(`No prim matching “${text}”.`)
    }, options)
    for (const button of this.#root.querySelectorAll<HTMLButtonElement>('[data-expand]')) button.addEventListener('click',()=>this.setPrimViewDepth(button.dataset.expand==='true'?Infinity:0),options)
    for(const button of this.#root.querySelectorAll<HTMLButtonElement>('[data-prim-depth]'))button.addEventListener('click',()=>this.setPrimViewDepth(Number(button.dataset.primDepth)),options)
    for(const button of this.#root.querySelectorAll<HTMLButtonElement>('[data-prim-filter]'))button.addEventListener('click',()=>{const key=button.dataset.primFilter as keyof PrimTreeSettings;this.setPrimTreeSettings({[key]:!this.#primTreeSettings[key]});this.#closeMenus()},options)
    this.#get('.path-form').addEventListener('submit', event => { event.preventDefault(); this.#navigate(this.#get<HTMLInputElement>('.current-path').value) }, options)
    // usdviewq/appController.py:_attrViewFindNext cycles property-name matches.
    this.#get('.find-property-form').addEventListener('submit', event => {
      event.preventDefault()
      const query=this.#get<HTMLInputElement>('.property-search').value.normalize('NFKC').trim().toLowerCase()
      if(!query)return
      const matches=this.#detail.properties.filter(p=>p.name.normalize('NFKC').toLowerCase().includes(query))
      const key=this.#detail.path+'|'+query
      const current=this.#lastPropertySearch===key?matches.findIndex(p=>p.name===this.#propertyName):-1
      this.#lastPropertySearch=key
      const next=matches[(current+1)%matches.length]
      if(!next){this.#statusMessage(`No property matching “${query}”.`);return}
      this.#propertyName=next.name;this.#renderPropertyValue()
      for(const row of this.#root.querySelectorAll<HTMLElement>('[data-property-row]'))if(row.dataset.propertyRow===next.name)row.scrollIntoView?.({block:'nearest'})
    }, options)
    this.#get('.property-content').addEventListener('keydown',event=>{
      const key=event as KeyboardEvent
      if(key.key!=='ContextMenu'&&!(key.shiftKey&&key.key==='F10'))return
      const row=(event.target as Element).closest<HTMLElement>('[data-property-row],[data-target-of]')
      if(row){event.preventDefault();const rect=row.getBoundingClientRect();this.#openPropertyMenu(row,rect.left+16,rect.bottom)}
    },options)
    this.#get('.property-content').addEventListener('contextmenu',event=>{
      const row=(event.target as Element).closest<HTMLElement>('[data-property-row],[data-target-of]')
      if(!row)return
      event.preventDefault();this.#openPropertyMenu(row,(event as MouseEvent).clientX,(event as MouseEvent).clientY)
    },options)
    this.#get('.property-content').addEventListener('click', event => {
      const toggle = (event.target as Element).closest<HTMLButtonElement>('[data-property-toggle]')
      if (toggle) {
        const name = toggle.dataset.propertyToggle!, open = !this.#expandedProperties.has(name)
        if (open) this.#expandedProperties.add(name); else this.#expandedProperties.delete(name)
        toggle.classList.toggle('open', open); toggle.classList.toggle('closed', !open)
        toggle.setAttribute('aria-label', `${open ? 'Collapse' : 'Expand'} ${name}`)
        for (const row of this.#root.querySelectorAll<HTMLElement>('[data-target-of]')) if (row.dataset.targetOf === name) row.hidden = !open
        return
      }
      const target=(event.target as Element).closest<HTMLElement>('[data-target-path]')
      if(target){const path=target.dataset.targetPath!,mouse=event as MouseEvent;if(!mouse.ctrlKey&&!mouse.metaKey)this.#selectedTargets.clear();if(this.#selectedTargets.has(path))this.#selectedTargets.delete(path);else this.#selectedTargets.add(path);for(const row of this.#root.querySelectorAll<HTMLElement>('[data-target-path]'))row.classList.toggle('selected',this.#selectedTargets.has(row.dataset.targetPath!))}
      else this.#selectedTargets.clear()
      const row = (event.target as Element).closest<HTMLButtonElement>('[data-property]')
      if (row?.dataset.property) { this.#propertyName = row.dataset.property; this.#propertyPaths=[(this.#selection??'/')+'.'+this.#propertyName]; this.#renderPropertyValue() }
    }, options)
    // legendUtil.py:20-31 ToggleLegendWithBrowser: "?" shows/hides the legend above the search row.
    for (const button of this.#root.querySelectorAll<HTMLButtonElement>('[data-legend]')) button.addEventListener('click', () => {
      const legend = this.#get<HTMLElement>(`.${button.dataset.legend}-legend`), open = legend.hidden
      legend.hidden = !open; button.setAttribute('aria-expanded', String(open)); button.classList.toggle('selected', open)
    }, options)
    for (const tab of this.#root.querySelectorAll<HTMLButtonElement>('[data-inspector-tab]')) tab.addEventListener('click', () => {
      this.#inspectorTab = tab.dataset.inspectorTab as InspectorTab
      this.#renderPropertyValue()
    }, options)
    this.#inspector.addEventListener('submit', event => {
      if(!(event.target as Element).matches('.array-page-controls'))return
      event.preventDefault();const input=this.#inspector.querySelector<HTMLInputElement>('.array-start')!
      if(!input.checkValidity())return
      this.#arrayStart=Number(input.value);this.#renderPropertyValue()
    }, options)
    this.#inspector.addEventListener('click', event => {
      const element=event.target as Element
      const copy=element.closest<HTMLButtonElement>('[data-copy-value]')
      if(copy){void this.#copy(copy.dataset.copyValue!);return}
      const page=element.closest<HTMLButtonElement>('[data-array-start]')
      if(page&&!page.disabled){this.#arrayStart=Number(page.dataset.arrayStart);this.#renderPropertyValue();return}
      const button=element.closest<HTMLButtonElement>('[data-target-prim]')
      if(!button||button.disabled)return
      this.#navigate(button.dataset.targetPrim!+(button.dataset.targetProperty?'.'+button.dataset.targetProperty:''))
    }, options)
    for(const input of this.#root.querySelectorAll<HTMLInputElement>('.menu-popup input[type=checkbox],.menu-popup input[type=radio]'))input.addEventListener('change',()=>this.#closeMenus(),options)
    this.#root.addEventListener('click', event => {
      if (!(event.target as Element).closest('details'))
        for (const menu of this.#root.querySelectorAll<HTMLDetailsElement>('.menu[open]')) menu.open = false
    }, options)
    this.#root.addEventListener('toggle', event => {
      const opened = event.target as HTMLDetailsElement
      if (opened.matches('.menu') && opened.open)
        for (const menu of this.#root.querySelectorAll<HTMLDetailsElement>('.menu[open]')) if (menu !== opened) menu.open = false
      // One open submenu per popup level; closing a menu closes its submenus.
      if (opened.matches('.submenu') && opened.open)
        for (const sibling of opened.parentElement!.querySelectorAll<HTMLDetailsElement>(':scope > .submenu[open]')) if (sibling !== opened) sibling.open = false
      if (opened.matches('.menu,.submenu') && !opened.open)
        for (const submenu of opened.querySelectorAll<HTMLDetailsElement>('.submenu[open]')) submenu.open = false
    }, { ...options, capture: true })
    // QMenu-style hover and arrow navigation, scoped to this component's menus.
    for(const menu of this.#root.querySelectorAll<HTMLDetailsElement>('details.menu,details.submenu')){
      menu.addEventListener('pointerenter',()=>{
        if(menu.getAttribute('aria-disabled')==='true')return
        if(menu.matches('.submenu')||menu.parentElement?.querySelector(':scope>details.menu[open]')){
          for(const sibling of menu.parentElement!.querySelectorAll<HTMLDetailsElement>(':scope>details'))if(sibling!==menu)sibling.open=false
          menu.open=true
        }
      },options)
    }
    this.#root.addEventListener('keydown',event=>this.#menuKey(event as KeyboardEvent),options)
    this.#root.addEventListener('keydown', event => {
      if (!event.defaultPrevented&&(event as KeyboardEvent).key === 'Escape') { this.#closeMenus(); this.#primMenu.close() }
    }, options)
    for (const splitter of this.#root.querySelectorAll<HTMLElement>('[data-split]')) {
      splitter.addEventListener('pointerdown', event => this.#startSplit(event, splitter), options)
      splitter.addEventListener('keydown', event => this.#splitKey(event, splitter), options)
    }
    this.#treeHost.addEventListener('click', event => this.#treeClick(event), options)
    this.#treeHost.addEventListener('keydown', event => this.#treeKey(event as KeyboardEvent), options)
    // Keep the select in place before Safari's trusted pointer default action.
    // Safari has no HTMLSelectElement.showPicker; creating it in click needs two clicks.
    const activateDrawMode=(event:Event)=>{
      const select=event.target as HTMLElement
      if(!select.matches('[data-draw-mode-select]')||this.#editBusy())return
      this.#drawModeEditors.add(select.dataset.drawModeSelect!)
      select.closest('.draw-mode-editor')?.setAttribute('data-editor-active','')
    }
    this.#treeHost.addEventListener('pointerdown',activateDrawMode,options)
    this.#treeHost.addEventListener('focusin',activateDrawMode,options)
    this.#treeHost.addEventListener('change',event=>{
      const select=event.target as HTMLSelectElement
      if(!select.matches('[data-draw-mode-select]')||this.#editBusy())return
      const path=select.dataset.drawModeSelect!,value=select.value as 'default'|'cards'|'bounds'|'origin'
      const row=select.closest('.prim-row'),old=row?.querySelector<HTMLElement>('[data-draw-mode]')?.textContent
      if(value===old){if(row?.querySelector<HTMLElement>('.draw-mode-clear')?.style.visibility==='hidden'){this.#drawModeEditors.delete(path);select.closest('.draw-mode-editor')?.removeAttribute('data-editor-active')}return}
      void this.#runCommand({kind:'drawMode',path,value},'Updated model draw mode')
    },options)
    this.#treeHost.addEventListener('focusout',event=>{
      const select=event.target as HTMLElement
      if(!select.matches('[data-draw-mode-select]')||this.#editBusy())return
      const row=select.closest('.prim-row')
      if(row?.contains((event as FocusEvent).relatedTarget as Node))return
      if(row?.querySelector<HTMLElement>('.draw-mode-clear')?.style.visibility==='hidden'){
        this.#drawModeEditors.delete(select.dataset.drawModeSelect!);select.closest('.draw-mode-editor')?.removeAttribute('data-editor-active')
      }
    },options)
    this.#observer = new ResizeObserver(() => this.#resize())
    this.#observer.observe(this.#canvas)
    this.#treeObserver=new ResizeObserver(()=>this.#alignTreeHeader())
    this.#treeObserver.observe(this.#treeHost)
    const properties=this.#get<HTMLElement>('.property-content')
    this.#propertyObserver=new ResizeObserver(()=>elideValues(properties))
    this.#propertyObserver.observe(properties)
    window.addEventListener('resize', () => this.#resize(), options)
    window.addEventListener('pagehide',()=>this.#saveViewPreferences(),options)
    for(const event of ['click','change','display-settings-changed','prim-tree-settings-changed'])this.#root.addEventListener(event,()=>this.#queueViewPreferences(),options)
    for(const event of ['prim-tree-settings-changed','display-settings-changed'])this.addEventListener(event,()=>this.#queueViewPreferences(),options)
    this.#sourceInput.value = this.src
    this.#statusMessage('Initializing renderer…')
    void this.#initialize(generation)
  }

  disconnectedCallback(): void {
    clearTimeout(this.#statusFeedbackTimer)
    this.#saveViewPreferences()
    ++this.#generation
    ++this.#loadGeneration
    this.#ready = false
    this.#displayBusy = false
    this.#displayLoading = false
    this.#hasScene = false
    this.#closeOpenDialog(true)
    for(const selector of ['.local-file','.local-files','.local-folder'])this.#get<HTMLInputElement>(selector).disabled=true
    this.#loadAbort?.abort()
    this.#loadAbort = undefined
    this.#streamAbort?.abort()
    this.#observer?.disconnect()
    this.#observer = undefined
    this.#treeObserver?.disconnect();this.#treeObserver=undefined
    this.#propertyObserver?.disconnect()
    this.#propertyObserver=undefined
    this.#events?.abort()
    this.#events = undefined
    this.#runtime?.dispose()
    this.#runtime = undefined
    this.#frameButton.disabled = true
    this.#updateBusyControls()
  }

  attributeChangedCallback(name: string, previous: string | null, next: string | null): void {
    if (name !== 'src' || previous === next) return
    this.#closeOpenDialog()
    this.#clearPendingLocal(); this.#localFile = undefined
    this.#sourceInput.value = next ?? ''
    this.#sceneSelect.value = next ?? ''
    if (this.#ready && next) void this.#open(next)
  }

  async #initialize(generation: number): Promise<void> {
    try {
      if (!this.runtimeFactory) throw new Error('No USD rendering runtime is configured.')
      const runtime = await this.runtimeFactory(this.#canvas, {
        geometryChanged: state => {
          if (generation === this.#generation && this.isConnected) this.#refreshGeometry(state)
        },
        frameRendered: stats => {
          if (generation !== this.#generation || !this.isConnected) return
          const duration = stats.cpuMilliseconds === 0 ? '<1' : stats.cpuMilliseconds.toFixed(2)
          const fps = stats.framesPerSecond === null ? '—' : stats.framesPerSecond.toFixed(2)
          this.#renderTiming.textContent = `     Render: ${duration} ms CPU (${fps} FPS)`
        },
        timeChanged: state => {
          if (generation !== this.#generation || !this.isConnected) return
          this.#timeline.refresh(state)
          // appController.py:3885-3889 _updateOnFrameChange: the slow GUI updates
          // (_updateGUIForFrameChange, appController.py:3868-3883: HUD geometry counts,
          // property view, prim view visibility) run only when not playing; they run
          // once when playback stops (setPlaybackActive(false) -> selectionChanged).
          // A follower plays while its leader does (followTime).
          if (!this.#playbackActive) {
            this.#compositionControls.refresh()
            this.#renderInspector(this.#detail)
            this.#refreshTreeInfo()
            this.#refreshHudSections()
          }
          this.dispatchEvent(new CustomEvent('time-changed', {detail:state,bubbles:true,composed:true}))
        },
        cameraChanged: state => {
          if (generation === this.#generation && this.isConnected){this.#cameraControls.refresh(state);this.#queueViewPreferences()}
        },
        selectionChanged: detail => {
          if (generation === this.#generation && this.isConnected) this.#applySelection(detail)
        },
        statusChanged: message => {
          if (generation === this.#generation && this.isConnected) this.#statusMessage(message)
        },
        diagnosticsChanged: diagnostics => {
          if (generation === this.#generation && this.isConnected) this.#reportDiagnostics(diagnostics)
        },
        loadProgress: progress => {
          if (generation !== this.#generation || !this.isConnected) return
          this.#progress = progress
          this.#progressFrame ||= requestAnimationFrame(() => { this.#progressFrame = 0; this.#renderProgress() })
        },
      })
      if (generation !== this.#generation || !this.isConnected) { runtime.dispose(); return }
      this.#runtime = runtime
      await this.#restoreViewPreferences(runtime,generation)
      if(generation!==this.#generation||!this.isConnected||this.#runtime!==runtime)return
      for(const warning of this.startupWarnings)this.#preferenceWarning(warning)
      if(runtime.setStartupOptions){for(const warning of runtime.setStartupOptions(this.startupOptions))this.#preferenceWarning(warning)}
      else if(Object.keys(this.startupOptions).length)this.#preferenceWarning('Startup options are unavailable in the configured runtime.')
      runtime.setAxesVisible?.(this.#get<HTMLInputElement>('.show-axes').checked)
      this.#ready = true
      this.#updateBusyControls()
      this.#get<HTMLInputElement>('.local-file').disabled = !runtime.openFile
      for(const selector of ['.local-files','.local-folder'])this.#get<HTMLInputElement>(selector).disabled=!runtime.openFiles
      this.#resize()
      if (this.#localFile) await this.#open(this.#localFile instanceof File ? this.#localFile.name : this.#localFile.rootPath, this.#localFile)
      else if (this.src) await this.#open(this.src)
      else this.#statusMessage('Choose an example or enter a scene URL.')
      this.#restoringPreferences=false;this.#saveViewPreferences()
    } catch (error) {
      this.#restoringPreferences=false
      if (generation === this.#generation && this.isConnected) this.#fail(error)
    }
  }

  #showOpenDialog(): void {
    const dialog=this.#get<HTMLDialogElement>('.open-dialog'),active=this.#root.activeElement as HTMLElement|null
    this.#closeMenus()
    if(!dialog.open){
      this.#openReturnFocus=active?.closest('.file-menu')?this.#get<HTMLElement>('.file-menu>summary'):active
      if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','')
    }
    if(!this.#get<HTMLFormElement>('.local-root-form').hidden)this.#get<HTMLSelectElement>('.local-root').focus()
    else if(!this.#get<HTMLInputElement>('.local-file').disabled)this.#get<HTMLInputElement>('.local-file').focus()
    else this.#sourceInput.focus()
  }
  #closeOpenDialog(clearPending=false): void {
    if(clearPending)this.#clearPendingLocal()
    const dialog=this.#get<HTMLDialogElement>('.open-dialog')
    if(!dialog.open)return
    if(dialog.close)dialog.close();else dialog.removeAttribute('open')
    const target=this.#openReturnFocus;this.#openReturnFocus=null
    if(this.isConnected)(target?.isConnected?target:this.#canvas).focus()
  }

  #clearPendingLocal(): void {
    this.#assetRead?.abort();this.#assetRead=undefined
    this.#pendingLocalAssets=[]
    this.#get<HTMLFormElement>('.local-root-form').hidden=true
    this.#get<HTMLSelectElement>('.local-root').replaceChildren()
  }

  #offerLocalAssets(files: LocalAssetFile[]): void {
    this.#loadAbort?.abort()
    try {
      if(!this.#runtime?.openFiles)throw new Error('This renderer does not support local file collections.')
      const names=new Set<string>()
      for(const {path} of files){if(names.has(path))throw new Error(`Duplicate local asset path: ${path}. Select the containing folder to preserve paths.`);names.add(path)}
      const scenes=files.filter(e=>isUsdScenePath(e.path))
      if(!scenes.length)throw new Error('No USD or USDZ scene was found in the selected files.')
      if(scenes.length===1){this.#openLocalAssets(files,scenes[0]!.path);return}
      this.#pendingLocalAssets=files
      const select=this.#get<HTMLSelectElement>('.local-root')
      select.replaceChildren(new Option('Choose the root scene…',''))
      for(const {path} of scenes)select.append(new Option(path,path))
      this.#get<HTMLButtonElement>('.open-local-root').disabled=true
      this.#get('.local-root-help').textContent=`${files.length} files available. Choose which scene to open; the others remain available as dependencies.`
      this.#get<HTMLFormElement>('.local-root-form').hidden=false
      this.#showOpenDialog()
      this.#statusMessage('Choose a root scene in the Open dialog.')
      select.focus()
    }catch(error){this.#statusMessage(error instanceof Error?error.message:String(error))}
  }

  #openLocalAssets(files: readonly LocalAssetFile[], rootPath: string): void {
    const source: LocalAssetSet={rootPath,files}
    this.#clearPendingLocal();this.#sceneSelect.value=''
    this.#closeOpenDialog()
    void this.#open(rootPath,source)
  }

  async #open(source: string, file?: File | LocalAssetSet): Promise<LoadResult> {
    if (!this.#runtime || !this.#ready) return { ok: false, error: new Error('Renderer is not ready') }
    if (file || source !== this.#welcomeSource) this.hideWelcome()
    this.#loadAbort?.abort()
    this.#streamAbort?.abort()
    this.#progress = undefined
    const abort = this.#loadAbort = new AbortController()
    const loadGeneration = ++this.#loadGeneration
    this.#cameraLoading = true
    this.#exportControls.busy(true)
    this.#compositionControls.busy(true)
    this.#cameraControls.busy(true)
    this.#timeline.busy(true)
    this.#displayLoading = true
    this.#updateBusyControls()
    this.#frameButton.disabled = true
    this.#statusMessage('Loading scene…')
    this.#showOverlay('Loading scene', source)
    this.#get<HTMLButtonElement>('.load-cancel').hidden = false
    this.#treeHost.setAttribute('aria-busy', 'true')
    try {
      if (abort.signal.aborted) throw abort.signal.reason
      if (file instanceof File && !this.#runtime.openFile) throw new Error('Local file loading is not supported by this renderer.')
      if (file && !(file instanceof File) && !this.#runtime.openFiles) throw new Error('Local file collections are not supported by this renderer.')
      const loading = file instanceof File ? this.#runtime.openFile!(file, abort.signal) : file ? this.#runtime.openFiles!(file,abort.signal) : this.#runtime.open(source, abort.signal)
      const tree = await abortable(loading, abort.signal)
      if (abort.signal.aborted || loadGeneration !== this.#loadGeneration || !this.isConnected) return { ok: false, error: new DOMException('Cancelled', 'AbortError') }
      this.#localFile = file
      this.#tree = tree
      this.#drawModeEditors.clear()
      this.#hasScene = true
      this.#timeline.reset()
      this.#selection = null
      this.#propertyName = null
      // appController.py:1925-1945: a new stage starts expanded to depth 3 with the
      // pseudo-root selected (its computed properties fill the property view).
      this.#expanded = initialExpansion(pseudoRoot(tree))
      this.#renderTree()
      const focus=this.#runtime.getSelectionState?.().focusPath??'/'
      this.#applySelection(this.#runtime.select(focus==='/'?null:focus))
      if(focus!=='/')this.#reveal(focus)
      if(this.#pendingClipPreferences){
        try{this.#runtime.setCameraSettings?.(this.#pendingClipPreferences)}catch(error){this.#preferenceWarning(`Saved camera clipping preferences could not be applied: ${String(error)}`)}
        this.#pendingClipPreferences=undefined
      }
      this.#frameButton.disabled = false
      this.#statusMessage('Scene loaded')
      if (this.#runtime.getDeferredPayloads?.().length) void this.#streamPayloads(loadGeneration)
      else this.#overlay.hidden = true
      this.dispatchEvent(new CustomEvent('scene-loaded', { detail: { source }, bubbles: true, composed: true }))
      return { ok: true }
    } catch (error) {
      if (!abort.signal.aborted && loadGeneration === this.#loadGeneration && this.isConnected) {
        if (!this.#hasScene) {
          this.#tree = []
          this.#selection = null
          this.#renderTree()
          this.#renderInspector({ path: null, properties: [] })
        }
        this.#frameButton.disabled = !this.#hasScene
        this.#fail(error)
        if (this.#hasScene) this.#overlay.hidden = true
      }
      return { ok: false, error }
    } finally {
      if (loadGeneration === this.#loadGeneration) {
        this.#cameraLoading = false
        this.#compositionControls.busy(!this.#hasScene)
        this.#cameraControls.refresh()
        this.#cameraControls.busy(this.#compositionBusy || !this.#hasScene)
        this.#displayLoading = false
        this.#updateBusyControls()
        this.#treeHost.removeAttribute('aria-busy')
        if (abort.signal.aborted) { this.#overlay.hidden = true; this.#refreshGeometry() }
        if (!this.#streamAbort) this.#get<HTMLButtonElement>('.load-cancel').hidden = true
      }
    }
  }

  async #refreshScene(kind: 'reload' | 'reopen'): Promise<void> {
    if (!this.#runtime?.refreshScene || !this.#hasScene || this.#cameraLoading || this.#compositionBusy || this.#displayBusy || this.#displayLoading) return
    this.#cameraLoading = true; this.#updateBusyControls()
    const generation = ++this.#loadGeneration
    // Let an already submitted frame settle before the runtime refresh guard.
    await this.#timeline.settled()
    if (!this.isConnected || generation !== this.#loadGeneration) return
    this.#streamAbort?.abort()
    const abort = this.#loadAbort = new AbortController()
    this.#get<HTMLDetailsElement>('.file-menu').open = false
    this.#statusMessage(kind === 'reload' ? 'Reloading layers…' : 'Reopening scene…')
    try {
      const result = await this.#runtime.refreshScene(kind, abort.signal)
      if (abort.signal.aborted || generation !== this.#loadGeneration || !this.isConnected) return
      this.#tree = result.tree; this.#renderTree(); this.#applySelection(result.selection)
      this.#timeline.reset(kind === 'reload'); this.#cameraControls.refresh()
      this.#statusMessage(kind === 'reload' ? 'All layers reloaded; session edits retained.' : 'Scene reopened; session edits cleared.')
    } catch(error) {
      if (!abort.signal.aborted && generation === this.#loadGeneration) this.#statusMessage(`Refresh failed; previous scene retained. ${error instanceof Error ? error.message : error}`)
    } finally {
      if (generation === this.#loadGeneration) { this.#cameraLoading = false; this.#updateBusyControls() }
    }
  }

  /** primContextMenu.py: right-click selects the row (as a QTreeWidget press does), then
   * shows primContextMenuItems.py for it. Edits wait while another scene update runs. */
  #openPrimMenu(row: HTMLButtonElement, x: number, y: number): void {
    const path = row.dataset.path!
    this.#closeMenus()
    if(!this.#selectedPaths().includes(path))this.#select(path)
    if(!this.#runtime?.getEditState)return
    let state: EditMenuState
    try { state = this.#runtime.getEditState(path) } catch (error) { this.#statusMessage(String(error)); return }
    const busy = this.#editBusy()
    const items = primContextMenuItems(state, this.#runtime.getCameraState?.().activeCameraPath ?? null).map(item =>
      item !== '---' && busy && (item.run.kind === 'edit' || item.run.kind === 'camera') ? {...item, enabled: false} : item)
    this.#primMenu.open(items, x, y, row)
  }
  #openPropertyMenu(row:HTMLElement,x:number,y:number):void {
    const name=row.dataset.propertyRow??row.dataset.targetOf,property=this.#detail.properties.find(property=>property.name===name)
    if(!property)return
    this.#closeMenus()
    this.#propertyName=property.name
    const target=row.dataset.targetPath
    if(target&&!this.#selectedTargets.has(target)){this.#selectedTargets.clear();this.#selectedTargets.add(target)}
    for(const child of this.#root.querySelectorAll<HTMLElement>('[data-target-path]'))child.classList.toggle('selected',this.#selectedTargets.has(child.dataset.targetPath!))
    this.#renderPropertyValue()
    const copy=this.#runtime?.inspect?.(this.#selection??'/',property.name)?.copyValueText??property.value
    const items=propertyContextMenuItems(property,copy,target?[...this.#selectedTargets]:undefined)
    this.#primMenu.open(items,x,y,row.querySelector('button'),'Property actions')
  }
  #runPrimContext(item: PrimContextMenuItem): void {
    const run = item.run
    if(run.kind==='propertyError')this.#statusMessage(run.message)
    else if(run.kind==='inspectPaths'){
      try{
        if(!this.#runtime)throw new Error('Load a scene before selecting targets.')
        const selection=targetSelection(this.#runtime,run.paths)
        this.#propertyPaths=selection.properties
        this.#propertyName=selection.properties.find(path=>path.startsWith(selection.prims[0]?.path+'.'))?.split('.').slice(1).join('.')??null
        this.#selectPrims(selection.prims)
      }catch(error){this.#statusMessage(String(error))}
    }else if (run.kind === 'select') {
      this.#select(run.path)
      ;[...this.#treeHost.querySelectorAll<HTMLButtonElement>('.prim')].find(row => row.dataset.path === run.path)?.scrollIntoView?.({block:'nearest'})
    } else if (run.kind === 'edit') void this.#runEdit(run.action)
    else if (run.kind === 'copy') void this.#copy(run.text)
    else if (run.kind === 'camera') {
      try { this.#cameraControls.refresh(this.#runtime?.setActiveCamera?.(run.path)) } catch (error) { this.#statusMessage(String(error)) }
    }
  }
  #consumedSpace = false
  /** Native shortcuts (mainWindowUI.ui, appController.py:1094,1320) and the event filter's
   * navigation keys (appEventFilter.py): Left/Right step frames and F frames unless the prim
   * tree has focus. Nothing fires while a text field, list box, dialog or menu has focus, or
   * when another part of the page owns the keyboard. Disabled actions leave the key alone. */
  #shortcuts: readonly (readonly [sequence: string, run: () => boolean, navigation?: boolean])[] = [
    ['Ctrl+O', () => this.#clickEnabled('.open-scene')],
    ['Ctrl+Shift+R', () => this.#clickEnabled('.reopen-scene')],
    ['Ctrl+R', () => this.#clickEnabled('.reload-scene')],
    ...editActions.flatMap(({action, shortcuts}) => shortcuts.map(sequence => [sequence, () => this.#editShortcut(action)] as const)),
    ['F11', () => { this.#windowControls.toggleViewerMode(); return true }],
    // mainWindowUI.ui:2302-2303 (showUsdValidation shortcut V).
    ['V', () => this.#clickEnabled('[data-window="validation"]')],
    ['Ctrl+F', () => { this.#get<HTMLInputElement>('.prim-search').focus(); return true }],
    ...Array.from({length:8},(_,index)=>['Alt+'+(index+1),()=>this.#clickEnabled(`[data-prim-depth="${index+1}"]`)] as const),
    ['Alt+9', () => this.#clickEnabled('[data-expand="true"]')],
    ['Alt+0', () => this.#clickEnabled('[data-expand="false"]')],
    ...shadingModes.map(([mode,key])=>[key,()=>this.#clickEnabled(`[data-shading-mode="${mode}"]`)] as const),
    ['Ctrl+B', () => this.#clickEnabled('[data-display="showBBoxes"]')],
    ['Ctrl+D', () => this.#clickEnabled('.show-hud')],
    ['Shift+I',()=>this.#clickEnabled('.show-rollover')],
    ['|',()=>this.#clickEnabled('[data-navigation="root"]')],
    ['\\',()=>this.#clickEnabled('[data-navigation="model"]')],
    ['Shift+L',()=>this.#clickEnabled('[data-navigation="preview"]')],
    ['F', () => this.#clickEnabled('.frame'), true],
    ['J', () => this.#clickEnabled('.toggle-framed-view'), true],
    ['Space', () => this.#clickEnabled('.playback-current button')],
    ['Left', () => this.#timeline.stepFrame(true), true],
    ['Right', () => this.#timeline.stepFrame(false), true],
  ]
  #clickEnabled(selector: string): boolean {
    const control = this.#get<HTMLButtonElement | HTMLInputElement>(selector)
    if (control.disabled) return false
    control.click(); return true
  }
  #editShortcut(action: EditAction): boolean {
    const state = this.#editState()
    if (!state || !editMenuItems(state,this.#editStates()).find(item => item.action === action)?.enabled) return false
    void this.#runEdit(action); return true
  }
  #shortcutKey(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.isComposing || !this.#events) return
    const active = document.activeElement
    if (active && active !== document.body && active !== this && active !== document.documentElement) return
    if (this.#root.querySelector('dialog[open]') || this.#root.querySelector('.menu[open]') || this.#primMenu.isOpen) return
    const focus = this.#root.activeElement as HTMLElement | null
    // appEventFilter.py JealousFocus: line edits, combo boxes, spin boxes and sliders keep their keys.
    if (focus?.matches('input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=file]),textarea,select,[contenteditable]:not([contenteditable=false]),[role=slider]')) return
    const shortcut = this.#shortcuts.find(([sequence]) => matchesShortcut(event, sequence))
    if (!shortcut) return
    const [sequence, run, navigation] = shortcut
    if (navigation && focus?.closest('.tree-host')) return
    if (event.repeat && !navigation) return
    if (!run()) return
    event.preventDefault()
    if (sequence === 'Space') this.#consumedSpace = true
  }
  #closeMenus(): void { for (const menu of this.#root.querySelectorAll<HTMLDetailsElement>('.menu[open],.submenu[open]')) menu.open = false }
  #editBusy(): boolean { return !this.#hasScene || this.#cameraLoading || this.#displayBusy || this.#displayLoading || !this.#compositionControls.available }
  #editState(): EditMenuState | null {
    if (this.#editBusy() || !this.#runtime?.getEditState) return null
    try { return this.#runtime.getEditState(this.#selection) } catch { return null }
  }
  #editStates(): EditMenuState[] {
    if(this.#editBusy()||!this.#runtime?.getEditState)return []
    return this.#selectedPaths().map(path=>this.#runtime!.getEditState!(path==='/'?null:path)).filter((state): state is EditMenuState=>!!state)
  }
  /** appController.py:4866-4895 _updateEditMenu, refreshed when the menu opens. */
  #refreshEditMenu(state = this.#editState()): void {
    this.#refreshNavigation();this.#refreshHudSections()
    const items = editMenuItems(state,this.#editStates())
    for (const button of this.#root.querySelectorAll<HTMLButtonElement>('[data-edit]')) button.disabled = !items.find(item => item.action === button.dataset.edit)?.enabled
    for (const button of this.#root.querySelectorAll<HTMLButtonElement>('[data-interpolation]')) {
      button.disabled = !state; button.setAttribute('aria-checked', String(state?.interpolation === button.dataset.interpolation))
    }
  }
  async #runEdit(action: EditAction): Promise<void> {
    const states = this.#editStates(), state = states[0]
    if (!state || !editMenuItems(state, states).find(item => item.action === action)?.enabled) return
    const commands: CompositionCommand[] = []
    for(const selected of action==='resetAllSessionVisibility'?[state]:states){
      // Native applies edits to eligible selected prims and skips unsupported rows.
      if((action==='load'||action==='unload')&&!selected.loadable)continue
      if(['makeVisible','makeInvisible','visOnly','removeSessionVisibility'].includes(action)&&!selected.imageable)continue
      const command=editCommand(action,selected)
      if(typeof command==='string')console.warn(command)
      else commands.push(command)
    }
    if(!commands.length){this.#statusMessage(editStatusMessage(action,state));return}
    await this.#runCommand(commands.length===1?commands[0]!:{kind:'batch',commands}, editStatusMessage(action,state))
  }

  async #runCommand(command: CompositionCommand, message?: string): Promise<void> {
    const outcome = await this.#compositionControls.run(command)
    if (!this.isConnected) return
    if (outcome.ok) { if (message) this.#statusMessage(message) }
    else this.#statusMessage(`Edit failed: ${outcome.error instanceof Error ? outcome.error.message : String(outcome.error)}`)
  }
  /** appController.py:2927-2928 _copyViewerImage. The ClipboardItem takes a promise so
   * Safari keeps the click's user activation while the PNG encodes. */
  #copyViewerImage(): void {
    const runtime = this.#runtime
    if (!runtime?.captureViewerImage) return
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('Image clipboard access is unavailable in this browser context.')
      let captureError:unknown
      // Register the promise-backed write in the click handler before drawing,
      // waiting for an animation frame or encoding. WebKit requires activation
      // at write(), not when the representation promise eventually resolves.
      // https://webkit.org/blog/10855/async-clipboard-api/
      const image = Promise.resolve().then(()=>runtime.captureViewerImage!()).catch(error=>{captureError=error;throw error})
      void image.catch(()=>{}) // Also observe failure if the browser rejects before reading data.
      void navigator.clipboard.write([new ClipboardItem({'image/png': image})])
        .then(() => this.#statusMessage('Copied viewer image to clipboard.'), error => {
          // A rejected representation can become a generic NotAllowedError in
          // the clipboard API. Keep the actual capture failure when available.
          const cause=captureError??error
          this.#statusMessage(`Copy failed: ${cause instanceof Error ? cause.message : String(cause)}`)
        })
    } catch (error) { this.#statusMessage(`Copy failed: ${error instanceof Error ? error.message : String(error)}`) }
  }
  /** appController.py:2930-2956 _saveViewerImage, as a PNG download instead of a file dialog. */
  async #saveViewerImage(): Promise<void> {
    const runtime = this.#runtime
    if (!runtime?.captureViewerImage) return
    try {
      const source = this.#localFile instanceof File ? this.#localFile.name : this.#localFile ? this.#localFile.rootPath : this.src
      const name = viewerImageFilename(source, runtime.getCameraState?.().activeCameraPath ?? null, runtime.getTimeState?.()?.current ?? 0)
      const url = URL.createObjectURL(await runtime.captureViewerImage())
      const link = document.createElement('a'); link.href = url; link.download = name; link.hidden = true
      this.#root.append(link); link.click(); link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 0)
      this.#statusMessage(`Saved viewer image as ${name}.`)
    } catch (error) { this.#statusMessage(`Save failed: ${error instanceof Error ? error.message : String(error)}`) }
  }
  #updateDisplayControls(): void {
    const settings = this.#runtime?.getDisplaySettings?.() ?? defaultDisplaySettings()
    this.#materialControls.busy(this.#cameraLoading||this.#compositionBusy||!this.#ready||!this.#runtime?.setDisplaySettings||this.#displayLoading||this.#displayBusy)
    this.#refreshHudSections()
    this.#get('.complexity-caption').textContent = complexities[settings.complexity].label
    for (const control of this.#root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-display]')) {
      const value = settings[control.dataset.display as keyof DisplaySettings]
      if (control instanceof HTMLInputElement) control.checked = control.type==='radio' ? control.value===String(value) : Boolean(value)
      else control.value = String(value)
      control.disabled = this.#cameraLoading || this.#compositionBusy || !this.#ready || !this.#runtime?.setDisplaySettings || this.#displayLoading || this.#displayBusy || (control.dataset.display==='domeLightTexturesVisible'&&!this.#runtime.supportsDomeLightTextures?.())
    }
    for (const [attribute,key] of [['data-shading-mode','renderMode'],['data-highlight-color','highlightColor']] as const) {
      for (const button of this.#root.querySelectorAll<HTMLButtonElement>(`[${attribute}]`)) {
        button.setAttribute('aria-checked',String(settings[key]===button.getAttribute(attribute)))
        button.disabled=this.#cameraLoading||this.#compositionBusy||!this.#ready||!this.#runtime?.setDisplaySettings||this.#displayLoading||this.#displayBusy
      }
    }
    for (const button of this.#root.querySelectorAll<HTMLButtonElement>('[data-highlight-mode]')) {
      button.setAttribute('aria-checked', String(settings.selHighlightMode === button.dataset.highlightMode))
      button.disabled = this.#cameraLoading || this.#compositionBusy || !this.#ready || !this.#runtime?.setDisplaySettings || this.#displayLoading || this.#displayBusy
    }
  }
  async #changeDisplay(patch: Partial<DisplaySettings>): Promise<void> {
    const runtime = this.#runtime, generation = this.#generation
    if (!runtime?.setDisplaySettings || this.#displayBusy || this.#displayLoading) return
    this.#displayBusy = true
    this.#updateBusyControls()
    this.#statusMessage('Updating display…')
    try {
      const settings = await runtime.setDisplaySettings(patch)
      if (generation !== this.#generation || !this.isConnected) return
      this.#statusMessage('Display updated')
      this.dispatchEvent(new CustomEvent('display-settings-changed', {detail:settings,bubbles:true,composed:true}))
    } catch (error) {
      if (generation === this.#generation && this.isConnected) this.#statusMessage(`Display unchanged: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      if (generation === this.#generation) { this.#displayBusy = false; this.#updateBusyControls() }
    }
  }
  #updateBusyControls(): void {
    this.#refreshGeometry()
    this.#get<HTMLButtonElement>('.close-scene').disabled = !this.#hasScene || (this.welcomeShown && this.#welcomeOnDefault)
    for (const selector of ['.reload-scene','.reopen-scene']) this.#get<HTMLButtonElement>(selector).disabled = !this.#runtime?.refreshScene || this.#compositionBusy || !this.#hasScene || this.#cameraLoading || this.#displayBusy || this.#displayLoading
    this.#exportControls.busy(this.#compositionBusy || !this.#hasScene || this.#cameraLoading || this.#displayBusy || this.#displayLoading)
    const timelineBusy = this.#compositionBusy || !this.#hasScene || this.#cameraLoading || this.#displayBusy || this.#displayLoading
    this.#timeline.busy(timelineBusy)
    if (this.#playWhenReady && !timelineBusy) { this.#playWhenReady = false; if (!this.#timeline.playing && !this.#timeline.following) void this.#timeline.play() }
    this.#compositionControls.busy(!this.#hasScene || this.#cameraLoading || this.#displayBusy)
    this.#cameraControls.busy(this.#compositionBusy || !this.#hasScene || this.#cameraLoading)
    this.#updateDisplayControls()
    for(const control of this.#treeHost.querySelectorAll<HTMLSelectElement|HTMLButtonElement>('.draw-mode-select,.draw-mode-clear'))control.disabled=this.#editBusy()
  }

  #refreshGeometry(state: ViewerGeometryState | undefined = this.#runtime?.getGeometryState?.()): void {
    const busy = this.#cameraLoading || this.#compositionBusy || this.#displayBusy || this.#displayLoading
    this.#frameButton.disabled = !this.#hasScene || busy || state?.canFrameSelection === false
    // The streaming overlay owns the viewport notice until deferred payloads finish.
    if (!this.#hasScene || busy || this.#streamAbort) return
    if (state?.drawableCount === 0) {
      this.#showOverlay('No drawable geometry', 'The stage is open. Inspect its prims, properties, layers and composition.')
    } else {
      this.#overlay.hidden = true
    }
  }

  #resize(): void {
    if (!this.#runtime) return
    const rect = this.#canvas.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) {
      try { this.#runtime.resize(rect.width, rect.height, window.devicePixelRatio || 1) }
      catch (error) { this.#fail(error) }
    }
  }

  #statusMessage(message: string): void {
    this.#status.textContent = message
    this.#status.dataset.error = 'false'
    const feedback = this.#status.closest<HTMLElement>('.statusbar')!
    feedback.dataset.feedback = ''
    clearTimeout(this.#statusFeedbackTimer)
    this.#statusFeedbackTimer = setTimeout(() => { delete feedback.dataset.feedback }, 5000)
  }
  /** Loads the payloads the runtime deferred at open in growing batches, through
   * the same serialized composition path as the prim tree's Load command. Each
   * committed batch redraws, so geometry appears while later payloads stream. */
  async #streamPayloads(loadGeneration: number): Promise<void> {
    const runtime = this.#runtime
    if (!runtime?.getDeferredPayloads) return
    const abort = this.#streamAbort = new AbortController()
    const current = () => !abort.signal.aborted && loadGeneration === this.#loadGeneration && this.isConnected && this.#runtime === runtime
    // usdview loads payloads with no notice over the viewport; the status bar
    // shows their progress (#renderProgress) while playback and inspection go on.
    this.#overlay.hidden = true
    this.#statusMessage('Loading payloads')
    let failed = 0
    try {
      for (const batch of payloadBatches(runtime.getDeferredPayloads())) {
        let paths: string[] = [], outcome: Awaited<ReturnType<CompositionControls['run']>> | undefined
        // A frame change (playback, scrub, follower seek) or display change in
        // flight makes the runtime refuse the batch as busy: wait for it and
        // retry, not fail. Playback keeps going while payloads stream in.
        do {
          while (current() && (this.#compositionBusy || this.#displayBusy || this.#displayLoading || this.#cameraLoading))
            await new Promise(resolve => setTimeout(resolve, 50))
          if (!current()) break
          const remaining = new Set(runtime.getDeferredPayloads())
          paths = batch.filter(path => remaining.has(path))
          if (!paths.length) break
          outcome = await this.#compositionControls.run({kind: 'loadAndUnload', load: paths, unload: []})
          if (loadGeneration !== this.#loadGeneration || this.#runtime !== runtime) return
          if (!outcome.ok && outcome.error instanceof ViewerBusyError) { outcome = undefined; await new Promise(resolve => setTimeout(resolve, 50)) }
        } while (!outcome && current())
        if (!current()) break
        // An ancestor's load already loaded these.
        if (paths.length < batch.length) runtime.reportPayloadProgress?.({loaded: batch.length - paths.length})
        if (!outcome) continue
        if (outcome.ok) runtime.reportPayloadProgress?.({loaded: paths.length})
        else {
          failed += paths.length
          runtime.reportPayloadProgress?.({failed: paths.length})
          this.#statusMessage(`Payload load failed: ${outcome.error instanceof Error ? outcome.error.message : String(outcome.error)}`)
        }
      }
    } finally {
      if (this.#streamAbort === abort) this.#streamAbort = undefined
      if (loadGeneration === this.#loadGeneration && this.#runtime === runtime && this.isConnected) {
        const cancelled = abort.signal.aborted
        runtime.reportPayloadProgress?.({phase: cancelled ? 'cancelled' : 'done'})
        this.#refreshGeometry()
        const left = runtime.getDeferredPayloads().length
        if (cancelled) this.#statusMessage(`Payload loading cancelled; ${left} payload(s) remain unloaded`)
        else if (failed) this.#statusMessage(`Scene loaded; ${failed} payload(s) failed to load`)
        else this.#statusMessage('Scene loaded')
      }
    }
  }
  #renderProgress(): void {
    const progress = this.#progress
    this.#get('.load-progress').textContent = progress ? progressLines(progress).join(' · ') : ''
    if (this.#streamAbort && progress) this.#status.textContent = `Loading payloads: ${progressLines(progress).join(' · ')}`
  }
  #showOverlay(title: string, message: string): void {
    this.#get('.load-progress').textContent = ''
    this.#overlay.hidden = false
    this.#overlay.querySelector('strong')!.textContent = title
    this.#overlay.querySelector('p')!.textContent = message
  }
  #fail(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error)
    this.#status.textContent = message
    clearTimeout(this.#statusFeedbackTimer)
    this.#status.dataset.error = 'true'
    this.#showOverlay('Unable to display scene', message)
    this.dispatchEvent(new CustomEvent('viewer-error', { detail: { message }, bubbles: true, composed: true }))
  }

  /** ?follow= (follow.ts): show `time` from a sync leader, without running a clock of
   * this viewer's own; `playing` is the leader's play state (drawing as during playback). */
  followTime(time:number,playing:boolean):void{
    if(this.#timeline.playing)this.#timeline.stop()
    this.#leaderPlaying=playing
    this.#runtime?.setPlaybackActive?.(playing)
    void this.#follow.request(time,playing)
  }
  /** ?follow= (follow.ts): the leader's Display > Complexity, applied between seeks. */
  followComplexity(id:FollowComplexity):void{
    if(this.#runtime?.getDisplaySettings?.().complexity!==id)void this.#follow.setComplexity(id)
  }
  /** ?follow= (follow.ts): while true, a sync leader owns the clock; Play and frame
   * stepping are disabled so this viewer never runs a clock of its own. */
  get following():boolean{return this.#timeline.following}
  set following(value:boolean){
    this.#timeline.following=value;this.#get<HTMLElement>('.follow-lag').hidden=!value
    if(!value){this.#follow.reset();this.#timeline.followTiming='N/A';this.#leaderPlaying=false}
  }
  /** Shows the welcome banner (welcome.ts) across the top of the viewport while the
   * current scene is open: it says a USD file can be dropped onto the window and,
   * given `startTour`, offers a Start Museum Tour button that calls it (a rejection
   * is shown in the status bar). `onDefaultScene` marks the empty start page, where
   * File > Close Stage has nothing to close. Its ✕, opening any other scene or a
   * file hides it. A web addition: usdview has no start page. */
  showWelcome(options:{startTour?:()=>void|Promise<void>,onDefaultScene?:boolean}={}):void{
    this.#welcomeSource=this.src;this.#welcomeTour=options.startTour;this.#welcomeOnDefault=!!options.onDefaultScene
    this.#get<HTMLElement>('.start-tour').hidden=!options.startTour
    this.#get<HTMLElement>('.welcome').hidden=false
    this.#updateBusyControls()
  }
  hideWelcome():void{this.#welcomeSource=undefined;this.#welcomeTour=undefined;this.#welcomeOnDefault=false;this.#get<HTMLElement>('.welcome').hidden=true;this.#updateBusyControls()}
  get welcomeShown():boolean{return !this.#get<HTMLElement>('.welcome').hidden}
  /** Play (the timeline's Play button) as soon as the timeline is available: now,
   * or once the scene being opened is ready (?play=1, welcome.ts). */
  play():void{this.#playWhenReady=true;this.#updateBusyControls()}
  /** Window > Toggle Viewer-Only Mode, set to `on` (?viewerOnly=1). */
  setViewerOnly(on:boolean):void{if(this.#windowControls.viewerMode!==on)this.#windowControls.toggleViewerMode()}
  /** Camera > Camera Masking (?cameraMask=full|partial|none). */
  setCameraMaskMode(mode:'none'|'partial'|'full'):void{
    try{this.#cameraControls.refresh(this.#runtime?.setCameraPresentation?.({cameraMaskMode:mode}))}catch(error){this.#statusMessage(String(error))}
  }
  /** The scene camera being viewed through, or null for the free camera. */
  get activeCameraPath():string|null{return this.#runtime?.getCameraState?.().activeCameraPath??null}
  /** ?follow= (follow.ts): view through the leader's camera (as the Camera menu does). */
  followCamera(path:string):void{
    try{this.#cameraControls.refresh(this.#runtime?.setActiveCamera?.(path))}catch(error){this.#statusMessage(String(error))}
  }
  getPrimTreeSettings():PrimTreeSettings{return {...this.#primTreeSettings}}
  setPrimTreeSettings(patch:Partial<PrimTreeSettings>,options:{removeCategorySelections?:boolean}={}):void {
    const root=pseudoRoot(this.#runtime?.getPrimTree?.({includePrototypes:true})??this.#tree)
    let selections=this.#detail.selections??[{path:this.#selection??'/'}]
    const keys=Object.keys(patch) as (keyof PrimTreeSettings)[]
    for(const key of keys)if(!Object.hasOwn(this.#primTreeSettings,key)||typeof patch[key]!=='boolean')throw new TypeError(`Invalid prim tree setting ${key}`)
    for(const key of keys){
      if(this.#primTreeSettings[key]===patch[key])continue
      this.#primTreeSettings[key]=patch[key]!
      if(options.removeCategorySelections!==false){const retained=removeCategorySelection(root,selections.map(entry=>entry.path),key);selections=selections.filter(entry=>retained.includes(entry.path))}
    }
    this.#tree=root.children
    const previous=this.#selectedPaths()
    if(previous.length!==selections.length||previous.some((path,index)=>path!==selections[index]?.path))this.#selectPrims(selections)
    this.#renderTree()
    for(const button of this.#root.querySelectorAll<HTMLElement>('[data-prim-filter]'))button.setAttribute('aria-checked',String(this.#primTreeSettings[button.dataset.primFilter as keyof PrimTreeSettings]))
    this.dispatchEvent(new CustomEvent('prim-tree-settings-changed',{detail:this.getPrimTreeSettings(),bubbles:true,composed:true}))
  }
  setPrimViewDepth(depth:number):void {
    if(depth!==Infinity&&(!Number.isInteger(depth)||depth<0))throw new RangeError('Prim view depth must be a nonnegative integer or Infinity.')
    this.#expanded=initialExpansion(filterPrimTree(pseudoRoot(this.#tree),this.#primTreeSettings),depth)
    this.#renderTree();this.#closeMenus()
  }
  #alignTreeHeader():void {
    // QTreeView reserves the vertical scrollbar's width beside its header.
    const gutter=Math.max(0,this.#treeHost.offsetWidth-this.#treeHost.clientWidth)
    const header=this.#get<HTMLElement>('.tree-columns'),padding=gutter+'px'
    if(header.style.paddingRight!==padding)header.style.paddingRight=padding
  }
  #drawModeEditors=new Set<string>()
  #renderTree(): void {
    if(this.#hasScene&&this.#primTreeSettings.showAllPrototypePrims&&!this.#tree.some(prim=>prim.prototypeRoot)&&this.#runtime?.getPrimTree)this.#tree=this.#runtime.getPrimTree({includePrototypes:true})
    if (!this.#tree.length && !this.#hasScene) {
      const empty = document.createElement('p')
      empty.className = 'empty'
      empty.textContent = 'No prims to display.'
      this.#treeHost.replaceChildren(empty)
      return
    }
    const scroll = this.#treeHost.scrollTop
    renderPrimTree(this.#treeHost, filterPrimTree(pseudoRoot(this.#tree),this.#primTreeSettings), this.#expanded,this.#primTreeSettings.showPrimDisplayNames,this.#drawModeEditors)
    this.#alignTreeHeader()
    this.#treeHost.scrollTop = scroll
    this.#treeTime = this.#runtime?.getTimeState?.()?.current
    markPrimSelection(this.#treeHost,this.#selectedPaths())
    this.#visibleRows()[0]?.setAttribute('tabindex', '0')
  }
  /** appController.py:1866-1885 _updateGUIForFrameChange refreshes the Vis column. */
  #refreshTreeInfo(): void {
    const time = this.#runtime?.getTimeState?.()?.current
    if (!this.#runtime?.getPrimTree || !this.#hasScene || time === this.#treeTime) return
    this.#tree = this.#runtime.getPrimTree({includePrototypes:true})
    this.#renderTree()
  }
  /** Expand every ancestor of `path` and scroll its row into view. */
  #reveal(path: string): HTMLButtonElement | undefined {
    const button = [...this.#treeHost.querySelectorAll<HTMLButtonElement>('.prim')].find(candidate => candidate.dataset.path === path)
    if (!button) return
    for (let item = button.closest('li')?.parentElement?.closest('li'); item; item = item.parentElement?.closest('li')) this.#toggle(item, true)
    button.scrollIntoView?.({ block: 'nearest' })
    return button
  }

  #treeClick(event: Event): void {
    const target = event.target as Element
    const toggle = target.closest<HTMLButtonElement>('[data-toggle]')
    if (toggle) { this.#toggle(toggle.closest('li')!); return }
    // primTreeWidget.py:355-361: Vis and Guides clicks toggle without selecting.
    const vis = target.closest<HTMLElement>('[data-vis]'), guides = target.closest<HTMLElement>('[data-guides]')
    if (vis || guides) { this.#toggleVisibility(vis ? 'visibility' : 'guides', (vis ?? guides)!.dataset[vis ? 'vis' : 'guides']!); return }
    const clear=target.closest<HTMLElement>('[data-draw-mode-clear]')
    if(clear){if(this.#editBusy())return;this.#drawModeEditors.delete(clear.dataset.drawModeClear!);void this.#runCommand({kind:'drawMode',path:clear.dataset.drawModeClear!,value:null},'Cleared model draw mode');return}
    if(target.closest('.draw-mode-editor'))return
    const draw=target.closest<HTMLElement>('[data-draw-mode]')
    if(draw){
      if(this.#editBusy()||!this.#runtime?.applyCompositionCommand)return
      const path=draw.dataset.drawMode!;this.#drawModeEditors.add(path)
      const select=[...this.#treeHost.querySelectorAll<HTMLSelectElement>('[data-draw-mode-select]')].find(x=>x.dataset.drawModeSelect===path)
      select?.closest('.draw-mode-editor')?.setAttribute('data-editor-active','');select?.focus();return
    }
    const prim = target.closest<HTMLButtonElement>('[data-path]')
    if(prim?.dataset.path){
      const mouse=event as MouseEvent,path=prim.dataset.path
      if(mouse.shiftKey&&this.#runtime?.selectPrims){
        const visible=this.#visibleRows().map(row=>row.dataset.path!),anchor=visible.indexOf(this.#treeAnchor??this.#selection??'/'),index=visible.indexOf(path)
        const model=new PrimSelectionModel(this.#detail.selections??[{path:this.#selection??'/'}])
        model.range(visible.slice(Math.min(Math.max(anchor,0),index),Math.max(anchor,index)+1),mouse.ctrlKey||mouse.metaKey)
        this.#selectPrims(model.snapshot().selections)
      }else{this.#treeAnchor=path;this.#select(path,mouse.ctrlKey||mouse.metaKey?'toggle':'replace')}
    }
  }
  /** appController.py:3779-3809 _itemClicked: a selected Vis/Guides row toggles
   * every eligible selected item; an unselected row edits only itself. */
  #toggleVisibility(kind: 'visibility' | 'guides', path: string): void {
    if (this.#compositionBusy) return
    const paths=this.#selectedPaths().includes(path)?this.#selectedPaths():[path]
    const commands: CompositionCommand[]=paths.filter(path=>{const state=this.#runtime?.getEditState?.(path);return !state||(kind==='guides'?state.camera:state.imageable&&state.active&&!state.inPrototype)}).map(path=>kind==='visibility'?{kind,path,action:'toggle'}:{kind,path})
    if(commands.length)void this.#runCommand(commands.length===1?commands[0]!:{kind:'batch',commands},
      kind === 'visibility' ? 'Updated prim visibility' : 'Updated guide visibility')
  }

  #toggle(item: HTMLLIElement, expanded?: boolean): void {
    const group = item.querySelector<HTMLUListElement>(':scope > ul')
    if (!group) return
    const open = expanded ?? group.hidden
    setPrimExpanded(item, open)
    const path = item.querySelector<HTMLButtonElement>(':scope > .prim-row > .prim')!.dataset.path!
    if (open) this.#expanded.add(path); else this.#expanded.delete(path)
  }

  #visibleRows(): HTMLButtonElement[] {
    return [...this.#treeHost.querySelectorAll<HTMLButtonElement>('.prim')].filter(button => !button.closest('ul[hidden]'))
  }

  #treeKey(event: KeyboardEvent): void {
    const button = (event.target as Element).closest<HTMLButtonElement>('.prim')
    if (!button) return
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      event.preventDefault(); const rect = button.getBoundingClientRect(); this.#openPrimMenu(button, rect.left + 16, rect.bottom); return
    }
    const visible = this.#visibleRows()
    const index = visible.indexOf(button)
    let next: HTMLButtonElement | undefined
    if (event.key === 'ArrowDown') next = visible[Math.min(index + 1, visible.length - 1)]
    else if (event.key === 'ArrowUp') next = visible[Math.max(index - 1, 0)]
    else if (event.key === 'Home') next = visible[0]
    else if (event.key === 'End') next = visible.at(-1)
    else if (event.key === 'ArrowRight') {
      if (button.getAttribute('aria-expanded') === 'false') this.#toggle(button.closest('li')!, true)
      else if (button.hasAttribute('aria-expanded')) next = visible[index + 1]
    } else if (event.key === 'ArrowLeft') {
      if (button.getAttribute('aria-expanded') === 'true') this.#toggle(button.closest('li')!, false)
      else next = button.closest('li')?.parentElement?.closest('li')?.querySelector<HTMLButtonElement>(':scope > .prim-row > .prim') ?? undefined
    } else return
    event.preventDefault()
    if (next) {
      for (const row of visible) row.tabIndex = row === next ? 0 : -1
      next.focus()
      // Native Qt ExtendedSelection: arrows select, Shift extends the range,
      // Ctrl moves the current item without changing the selected set.
      // Capture: usdviewSelection/expected.json keys.
      if(this.#runtime?.selectPrims&&!event.ctrlKey&&!event.metaKey){
        if(event.shiftKey)next.dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey:true}))
        else {this.#treeAnchor=next.dataset.path!;this.#select(next.dataset.path!)}
      }
    }
  }

  async #copy(value: string): Promise<void> {
    try {
      if(!navigator.clipboard?.writeText)throw new Error('Clipboard access is unavailable in this browser context.')
      await navigator.clipboard.writeText(value);this.#statusMessage('Copied to clipboard.')
    }catch(error){this.#statusMessage(`Copy failed: ${String(error)}`)}
  }

  #navigate(text: string): void {
    const input=this.#get<HTMLInputElement>('.current-path')
    try {
      if(text.includes(',')&&this.#runtime?.selectPrims){
        const paths=text.split(',').map(path=>path.trim()).filter(Boolean)
        const entries=paths.map(path=>{const {primPath,propertyName}=parseInspectionPath(path);if(propertyName)throw new Error('Select prim paths before selecting their properties.');if(this.#runtime?.inspect&&!this.#runtime.inspect(primPath))throw new Error(`No USD object at ${path}`);return {path:primPath}})
        this.#propertyName=null;this.#selectPrims(entries);input.removeAttribute('aria-invalid');return
      }
      const {primPath,propertyName}=parseInspectionPath(text)
      if(!this.#runtime)throw new Error('Load a scene before navigating.')
      if(this.#runtime.inspect&&!this.#runtime.inspect(primPath,propertyName))throw new Error(`No USD object at ${text.trim()}`)
      const detail=this.#runtime.select(primPath === '/' ? null : primPath)
      if((detail.path ?? '/')!==primPath)throw new Error(`No prim at ${primPath}`)
      // appController.py:3681-3706 _currentPathChanged: a prim path switches the prim
      // (keeping same-named properties); a property path selects that property.
      if(propertyName)this.#propertyName=propertyName
      this.#applySelection(detail)
      this.#inspectorTab='value';this.#renderPropertyValue();input.removeAttribute('aria-invalid')
    }catch(error){input.setAttribute('aria-invalid','true');this.#statusMessage(String(error))}
  }

  #menuKey(event:KeyboardEvent):void {
    const target=event.target as HTMLElement,menu=target.closest<HTMLDetailsElement>('details.menu,details.submenu')
    if(!menu||target.closest('.context-menu')||!['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Home','End','Escape','Enter'].includes(event.key))return
    const popup=menu.querySelector<HTMLElement>(':scope>.menu-popup'),summary=menu.querySelector<HTMLElement>(':scope>summary')!
    if(!popup)return
    if(menu.getAttribute('aria-disabled')==='true'){event.preventDefault();return}
    const items=()=>[...popup.children].flatMap(child=>{
      if(child.hasAttribute('hidden')||child.getAttribute('aria-disabled')==='true')return []
      const item=child.matches('details')?child.querySelector<HTMLElement>(':scope>summary'):child.matches('label')?child.querySelector<HTMLElement>('input:not([hidden])'):child.matches('button')?child as HTMLElement:null
      return item&&!item.matches(':disabled')&&item.getAttribute('aria-disabled')!=='true'?[item]:[]
    })
    if(event.key==='Escape'){menu.open=false;summary.focus();event.preventDefault();return}
    if(event.key==='ArrowLeft'&&menu.matches('.submenu')){menu.open=false;summary.focus();event.preventDefault();return}
    if(event.key==='ArrowRight'&&target===summary&&menu.matches('.submenu')){if(menu.getAttribute('aria-disabled')!=='true'){menu.open=true;items()[0]?.focus()}event.preventDefault();return}
    if(['ArrowLeft','ArrowRight'].includes(event.key)&&menu.matches('.menu')){
      const list=[...menu.parentElement!.querySelectorAll<HTMLDetailsElement>(':scope>details.menu')],index=list.indexOf(menu),next=list[(index+(event.key==='ArrowRight'?1:list.length-1))%list.length]
      if(next){menu.open=false;next.open=true;next.querySelector<HTMLElement>(':scope>summary')?.focus()}event.preventDefault();return
    }
    if(event.key==='Enter'&&target.matches('input[type=checkbox],input[type=radio]')){target.click();event.preventDefault();return}
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
      menu.open=true;const list=items(),i=list.indexOf(target);if(!list.length)return
      const next=event.key==='Home'?0:event.key==='End'?list.length-1:event.key==='ArrowDown'?(i+1)%list.length:(i<0?list.length-1:(i+list.length-1)%list.length)
      list[next]?.focus();event.preventDefault()
    }
  }
  #refreshTreeColumns():void {
    const widths=['minmax(0,1fr)','80px','29px','47px','116px']
    const inputs=[...this.#root.querySelectorAll<HTMLInputElement>('[data-tree-column]')]
    this.#get<HTMLElement>('.hierarchy').style.setProperty('--prim-columns',inputs.map((x,i)=>x.checked?widths[i]:'0px').join(' '))
    // mainWindowUI.ui:194 headerDefaultSectionSize 150 and appController.py:734-745:
    // the stretched Prim Name column keeps at least that width beside the
    // fixed columns; the panel stops narrowing, as Qt minimum sizes do.
    const fixed=inputs.slice(1).reduce((sum,x,i)=>sum+(x.checked?parseInt(widths[i+1]!):0),0)
    this.#get<HTMLElement>('.shell').style.setProperty('--prim-panel-min',`${150+fixed+24}px`)
    for(let i=0;i<inputs.length;i++)this.#get<HTMLElement>('.hierarchy').toggleAttribute('data-hide-column-'+i,!inputs[i]!.checked)
  }
  #refreshHudSections():void {
    for(const [section,selector] of [['camera','.hud-camera'],['performance','.hud-performance'],['info','.hud-info']] as const){
      const input=this.#get<HTMLInputElement>(`[data-hud="${section}"]`),block=this.#get<HTMLElement>(selector);block.hidden=!input.checked
      if(section==='info'&&input.checked){const values=this.#runtime?.getSubtreeHudInfo?.()??{};block.textContent=Object.entries(values).map(([key,value])=>`${key.padStart(12)}: ${value}`).join('\n')}
    }
  }
  #refreshNavigation():void {
    const states=this.#editStates()
    for(const button of this.#root.querySelectorAll<HTMLButtonElement>('[data-navigation]')){
      const key=button.dataset.navigation
      button.disabled=!this.#ready||this.#editBusy()||(key?.endsWith('Rel')&&!this.#runtime?.getBindingRelationship)||(key==='root'?false:key==='model'?!states.length:!states.some(state=>key?.startsWith('preview')?state.boundPreviewMaterial:state.boundFullMaterial))
    }
  }
  #runNavigation(action:string):void {
    if(action==='root'){this.#select('/');return}
    const states=this.#editStates(),paths=states.map(state=>action==='model'?(state.enclosingModel||state.path):action.endsWith('Rel')?this.#runtime?.getBindingRelationship?.(state.path,action.startsWith('preview')?'preview':'full'):(action.startsWith('preview')?state.boundPreviewMaterial:state.boundFullMaterial)?.path).filter((x):x is string=>!!x)
    if(action.endsWith('Rel')){if(paths.length){this.#selectPrims([...new Set(paths.map(path=>parseInspectionPath(path).primPath))].map(path=>({path})));this.#propertyPaths=[...new Set(paths)];this.#propertyName=parseInspectionPath(paths[0]!).propertyName??null;this.#renderPropertyValue()}}
    else this.#selectPrims([...new Set(paths)].map(path=>({path})))
  }
  #selectedPaths():string[]{return this.#detail.selections?.map(entry=>entry.path)??[this.#selection??'/']}
  #selectPrims(entries:readonly PrimSelection[]):void {
    const detail=this.#runtime?.selectPrims?.(entries)
    if(detail)this.#applySelection(detail)
    else this.#select(entries[0]?.path??'/')
  }
  #updatePickControls():void {
    const mode=this.#runtime?.getPickMode?.()??'prims'
    for(const button of this.#root.querySelectorAll<HTMLButtonElement>('[data-pick-mode]')){
      button.setAttribute('aria-checked',String(button.dataset.pickMode===mode));button.disabled=!this.#runtime?.setPickMode
    }
  }
  #select(path: string,operation:SelectionOperation='replace'): void {
    try {
      // The root row is the pseudo-root: an empty selection (selectionDataModel.py:352).
      const detail = operation==='replace'?this.#runtime?.select(path === '/' ? null : path):this.#runtime?.select(path==='/'?null:path,{operation})
      if (detail) this.#applySelection(detail)
    } catch (error) { this.#fail(error) }
  }

  #applySelection(detail: SelectionDetail): void {
    const changed = JSON.stringify(this.#detail.selections)!==JSON.stringify(detail.selections) || this.#selection !== detail.path || this.#detail.instanceIndex !== detail.instanceIndex || this.#detail.instancerPath !== detail.instancerPath
    this.#selection = detail.path
    this.#compositionControls.refresh()
    this.#get<HTMLInputElement>('.current-path').value = detail.selections&&detail.selections.length>1?detail.selections.map(entry=>entry.path).join(', '):detail.path??'/'
    // appController.py:3744-3752: selection marks rows (and ancestors) but never expands.
    this.#refreshTreeInfo()
    markPrimSelection(this.#treeHost,detail.selections?.map(entry=>entry.path)??[detail.path??'/'])
    if (changed && detail.instanceIndex !== undefined) this.#statusMessage(`Selected instance ${detail.instanceIndex} of ${detail.instancerPath}`)
    this.#renderInspector(detail)
    // appController.py:3637-3639: the HUD prim stats and geometry counts follow the
    // selection (also as playback stops, when the runtime re-sends it).
    this.#refreshHudSections()
    this.#refreshGeometry()
    this.#updatePickControls()
    if (changed) this.dispatchEvent(new CustomEvent<SelectionDetail>('prim-selected', { detail, bubbles: true, composed: true }))
  }

  #renderInspector(detail: SelectionDetail): void {
    if (this.#detail.path !== detail.path) this.#expandedProperties.clear()
    this.#detail = detail
    // selectionDataModel.py:520-555 _switchProps: a selected property stays selected on
    // the new prim when it has one of that name; nothing is selected by default.
    if (!detail.properties.some(property => property.name === this.#propertyName)) this.#propertyName = null
    this.#get<HTMLInputElement>('.current-path').value = detail.selections&&detail.selections.length>1?detail.selections.map(entry=>entry.path).join(', '):detail.path??'/'
    const host = this.#get<HTMLElement>('.property-content')
    if (!this.#hasScene && !detail.properties.length) host.replaceChildren()
    else {
      renderPropertyTable(host, detail, this.#propertyName, this.#expandedProperties)
      elideValues(host)
    }
    this.#renderPropertyValue()
  }

  #renderPropertyValue(): void {
    this.#inspector.replaceChildren()
    for (const row of this.#root.querySelectorAll<HTMLElement>('[data-property-row]'))
      row.classList.toggle('selected', row.dataset.propertyRow === this.#propertyName || this.#propertyPaths.some(path=>path.split('.').slice(1).join('.')===row.dataset.propertyRow))
    for (const tab of this.#root.querySelectorAll<HTMLButtonElement>('[data-inspector-tab]')) {
      tab.setAttribute('aria-selected', String(tab.dataset.inspectorTab === this.#inspectorTab))
      tab.disabled = tab.dataset.inspectorTab !== 'value' && !this.#runtime?.inspect
    }
    const property = this.#detail.properties.find(item => item.name === this.#propertyName)
    const primPath = this.#detail.path ?? '/'
    const object=primPath+(property?'.'+property.name:'')
    if(object!==this.#arrayObject){this.#arrayStart=0;this.#arrayObject=object}
    this.#get<HTMLInputElement>('.current-path').value=this.#detail.selections&&this.#detail.selections.length>1?this.#selectedPaths().join(', '):this.#detail.path?object:'/'
    // appController.py:4126-4146 _getSelectedObject: the selected property, else the prim.
    if (this.#inspectorTab === 'value' && !property) return
    if (!this.#hasScene) return
    let snapshot
    try { snapshot = this.#runtime?.inspect?.(primPath, property?.name, {arrayStart:this.#arrayStart, includeMetadataDetails:this.#inspectorTab==='metadata', includeCompositionTree:this.#inspectorTab==='composition'}) }
    catch (error) { const message = document.createElement('p'); message.textContent = `Inspection failed: ${String(error)}`; this.#inspector.append(message); return }
    if (this.#inspectorTab !== 'value') {
      // Computed properties have no USD object for these tabs (empty, as native).
      if (snapshot && !snapshot.computed) renderInspection(this.#inspector, snapshot, this.#inspectorTab)
      else if (!snapshot) { const message = document.createElement('p'); message.className = 'empty'; message.textContent = 'Inspection is unavailable.'; this.#inspector.append(message) }
      return
    }
    if (!property) return
    // attributeValueEditor.py:94-118: the value text in the property's source colour, or
    // the array view (arrayAttributeView.py "<index>: <value>" rows).
    if (snapshot?.array) { this.#arrayStart=snapshot.array.start; appendArrayTable(this.#inspector,snapshot.array) }
    else {
      const value = document.createElement('pre'); value.className = 'value-text'
      value.textContent = snapshot?.valueText ?? property.value
      value.style.color = rgbText(propertyColor({ ...property, inherited: false }))
      this.#inspector.append(value)
    }
    if (!snapshot?.computed) {
      appendCopyButton(this.#inspector, 'Copy property path', object)
      appendCopyButton(this.#inspector, 'Copy property name', property.name)
    }
    if (snapshot) appendTargetNavigation(this.#inspector, snapshot)
  }

  #startSplit(event: PointerEvent, splitter: HTMLElement): void {
    event.preventDefault()
    const axis = splitter.dataset.split!
    const container = axis === 'vertical' ? this.#get('.workbench') : splitter.parentElement!
    const rect = container.getBoundingClientRect()
    const move = (pointer: PointerEvent) => {
      const ratio = axis === 'vertical' ? (pointer.clientY - rect.top) / rect.height : (pointer.clientX - rect.left) / rect.width
      this.#setSplit(axis, ratio * 100)
    }
    splitter.setPointerCapture(event.pointerId)
    splitter.addEventListener('pointermove', move)
    const stop = () => {
      splitter.removeEventListener('pointermove', move)
      splitter.removeEventListener('pointerup', stop)
      splitter.removeEventListener('pointercancel', stop)
      this.#events?.signal.removeEventListener('abort', stop)
    }
    splitter.addEventListener('pointerup', stop, { once: true })
    splitter.addEventListener('pointercancel', stop, { once: true })
    this.#events?.signal.addEventListener('abort', stop, { once: true })
  }
  #splitKey(event: KeyboardEvent, splitter: HTMLElement): void {
    const direction = ['ArrowRight','ArrowDown'].includes(event.key) ? 1 : ['ArrowLeft','ArrowUp'].includes(event.key) ? -1 : 0
    if (!direction) return
    event.preventDefault()
    const axis = splitter.dataset.split!
    const current = Number(this.style.getPropertyValue(`--${axis}-split`).replace('%','')) || (axis === 'top' ? 46 : axis === 'bottom' ? 60 : 64)
    this.#setSplit(axis, current + direction * 2)
  }
  #setSplit(axis: string, percent: number): void {
    if (!Number.isFinite(percent)) return
    this.style.setProperty(`--${axis}-split`, `${Math.max(20, Math.min(80, percent))}%`)
    this.#queueViewPreferences()
  }

}

export function defineUsdViewer(): void {
  if (!customElements.get('usd-viewer')) customElements.define('usd-viewer', UsdViewerElement)
}

declare global { interface HTMLElementTagNameMap { 'usd-viewer': UsdViewerElement } }

// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usdImaging/usdviewq/common.py,
//  pxr/usdImaging/usdviewq/validationWidget.py,
//  pxr/usdImaging/usdviewq/utils.cpp
// Copyright 2016, 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import type {StartupOptions} from './startup-options'
import type {CameraPresentationSettings} from './camera-presentation'
import type { StageExport, StageExportKind } from './stage-export'
import type { LocalAssetSet } from './local-assets'
import type { CompositionCommand, CompositionState, CompositionResult, EditMenuState } from './composition-types'
import type { InspectionSnapshot, InspectionOptions } from './inspection-types'
export type { InspectionSnapshot } from './inspection-types'
import type { DisplaySettings } from './display-settings'
/** Consumer-owned presentation boundary; USD/GPU details remain in the runtime. */
export interface PrimSummary {
  path: string
  name: string
  typeName: string
  children: PrimSummary[]
  /** A prototype root appended by the native Show > Prototype Prims option. */
  prototypeRoot?: boolean
  /** usdviewq Utils.GetPrimInfo (utils.cpp:42-94) facts the prim tree draws. Absent in
   * minimal adapters; the tree then draws a plain defined prim without Vis/Guides. */
  info?: PrimInfo
}
/** Native computed value, inherited presentation and clear-button availability. */
export interface ModelDrawModeState { value:string; inherited:boolean; sessionOverride:boolean }
/** OpenUSD v26.11.1 usdviewq/utils.cpp:42-94 PrimInfo, as primViewItem.py consumes it. */
export interface PrimInfo {
  /** Native eligible model column; absent for nonmodels and prototype/proxy prims. */
  drawMode?:ModelDrawModeState
  hasArcs: boolean
  active: boolean
  imageable: boolean
  defined: boolean
  abstract: boolean
  /** IsInPrototype() || IsInstanceProxy() */
  inPrototype: boolean
  /** IsPrototype() || IsInPrototype(), excluding ordinary instance proxies. */
  prototype?: boolean
  instance: boolean
  /** Only cameras show guides (utils.cpp:66-68). */
  supportsGuides: boolean
  /** Authored visibility at the current time: false when it is "invisible". */
  visibilityInherited: boolean
  /** UsdGeomVisibilityAPI guideVisibility == visible (primViewItem.py:316-319). */
  guidesVisible: boolean
  displayName: string
}
/** Native property view type roles (common.py:131-139 PropertyViewDataRoles). */
export type PropertyRole = 'attribute' | 'attributeWithConnections' | 'relationship' | 'relationshipWithTargets' | 'computed' | 'computedMaterial'
/** Usd.ResolveInfoSource, which picks the property colour (common.py:398-420). */
export type PropertyValueSource = 'none' | 'fallback' | 'default' | 'timeSamples' | 'valueClips' | 'spline'
export interface PropertySummary {
  name: string
  typeName: string
  /** common.py GetShortStringForValue text. */
  value: string
  role?: PropertyRole
  /** null for relationships and computed values, which native draws red. */
  source?: PropertyValueSource | null
  /** An inheritable primvar from an ancestor: "(i)", 15% darker. */
  inherited?: boolean
  /** Interpolated time-sample/spline value: italic (common.py:347-372). */
  interpolated?: boolean
  /** Relationship targets or attribute connections, shown as child rows. */
  targets?: string[]
}
export type PickMode='prims'|'models'|'instances'|'prototypes'
export type SelectionOperation='replace'|'add'|'remove'|'toggle'
export interface PrimSelection {path:string;instanceIndices?:number[]}
export interface SelectionState {selections:PrimSelection[];focusPath:string;lcdPaths:string[]}
export interface SelectionOptions {operation?:SelectionOperation;instanceIndex?:number}
export interface SelectionDetail {
  /** Authored PointInstancer array index, distinct from a prototype prim path. */
  instanceIndex?: number
  instancerPath?: string
  path: string | null
  properties: PropertySummary[]
  /** Native ordered selected set. path remains the focus prim for legacy consumers. */
  selections?: PrimSelection[]
}
export interface FreeCameraSettings {
  fovDegrees: number
  /** null follows the viewport; a number locks the camera aperture ratio. */
  aspectRatio: number | null
  nearOverride: number | null
  farOverride: number | null
}
export interface ViewerCameraState {
  presentation?: CameraPresentationSettings
  cameras: { path: string, label: string }[]
  activeCameraPath: string | null
  free: FreeCameraSettings
  effectiveNear: number
  effectiveFar: number
}
export interface ViewerTimeState {
  start: number
  end: number
  current: number
  framesPerSecond: number
  timeCodesPerSecond: number
  /** Stage start/end time codes (appController.py:1363-1364 shows these even when unauthored). */
  stageStart?: number
  stageEnd?: number
  /** False when the stage has no authored time code range: native leaves the range fields empty. */
  hasTimeSamples?: boolean
}
export interface ViewerGeometryState {
  drawableCount: number
  canFrameSelection: boolean
}
/** The runtime refused a command because another scene update (a frame, display
 * or composition change) is in flight. The caller may retry once it settles. */
export class ViewerBusyError extends Error { override name = 'ViewerBusyError' }

/** A registered validator or suite (validationWidget.py:32-46). */
export interface ValidatorEntry { pluginName: string; name: string; fullName: string; isSuite: boolean; doc: string }
/** validationWidget.py:326-331 TimeRangeOptions: current frame, playback range or a specific range. */
export interface ValidationTimeRangeOptions {
  mode: 'currentFrame' | 'playbackRange' | 'specificTimeRange'
  startTime?: number
  endTime?: number
  includeDefaultTime: boolean
}
/** What Window > USD Validation runs (validationWidget.py:693-743). */
export interface ValidationRequest {
  validatorNames: readonly string[]
  /** The selected prims to validate; absent or containing '/' validates the stage. */
  primPaths?: readonly string[]
  includeDescendantPrims?: boolean
  timeRange: ValidationTimeRangeOptions
}
/** One validation error, as the results table shows it (validationWidget.py:475-543). */
export interface ValidationResultRow {
  validatorName: string
  errorName: string
  sites: string[]
  primPaths: string[]
  propertyPaths: string[]
  message: string
  type: 'None' | 'Error' | 'Warn' | 'Info'
}
export interface ViewerRuntime {
  listValidators?(): Promise<ValidatorEntry[]>
  runValidation?(request: ValidationRequest): Promise<ValidationResultRow[]>
  /** Current visible drawable targets; valid stages may contain none. */
  getGeometryState?(): ViewerGeometryState
  getSubtreeHudInfo?():Record<string,number>
  getBindingRelationship?(path:string,purpose:'preview'|'full'):string|null
  getRolloverInfo?(x:number,y:number):Promise<{path:string,typeName:string}|null>
  /** Diagnostics for the committed scene. */
  getDiagnostics?(): readonly ViewerDiagnostic[]
  /** Read-only USDA download data; session exports require the original scene. */
  exportStage?(kind: StageExportKind, range?: {start:number,end:number}): Promise<StageExport>
  refreshScene?(kind: 'reload' | 'reopen', signal?: AbortSignal): Promise<CompositionResult>
  getTimeState?(): ViewerTimeState | null
  /** The prim tree with info at the current time (native refreshes the Vis column on frame change). */
  getPrimTree?(options?: {includePrototypes?:boolean}): PrimSummary[]
  setPlaybackActive?(active: boolean): void
  setTime?(time: number): Promise<ViewerTimeState>

  /** Opens a URL; local file support is explicit and may be added separately. */
  setStartupOptions?(options:StartupOptions):readonly string[]
  open(source: string, signal?: AbortSignal): Promise<PrimSummary[]>
  openFile?(file: File, signal?: AbortSignal): Promise<PrimSummary[]>
  openFiles?(source: LocalAssetSet, signal?: AbortSignal): Promise<PrimSummary[]>
  select(path: string | null,options?:SelectionOptions): SelectionDetail
  selectPrims?(selections:readonly PrimSelection[]):SelectionDetail
  getSelectionState?():SelectionState
  getPickMode?():PickMode
  setPickMode?(mode:PickMode):void
  getCompositionState?(path: string | null): CompositionState
  /** Edit menu / prim context menu enablement; null selects the pseudo-root as native does. */
  getEditState?(path: string | null): EditMenuState
  applyCompositionCommand?(command: CompositionCommand): Promise<CompositionResult>
  /** Payload prims the committed scene deferred at open and has not loaded yet. */
  getDeferredPayloads?(): string[]
  /** Records deferred payload progress in the load's counters. */
  reportPayloadProgress?(update: { loaded?: number, failed?: number, phase?: LoadPhase }): void
  inspect?(path: string, propertyName?: string, options?: InspectionOptions): InspectionSnapshot | null
  supportsDomeLightTextures?():boolean
  getDisplaySettings?(): DisplaySettings
  setDisplaySettings?(patch: Partial<DisplaySettings>): Promise<DisplaySettings>
  setAxesVisible?(visible: boolean): void
  /** Whose lighting state the engine is given: 'usdview' (the default; the
   *  viewer follows usdview) or 'frameRecorder', usdrecord's
   *  (usdAppUtils/frameRecorder.cpp:396-454; frame-recorder-lighting.ts).
   *  For comparisons with usdrecord images (the asset acceptance), not a
   *  viewer setting. */
  setLightingSource?(source: 'usdview' | 'frameRecorder'): void
  frameSelection(): void
  setCameraPresentation?(patch:Partial<CameraPresentationSettings>):ViewerCameraState
  toggleFramedView?():ViewerCameraState
  getCameraState?(): ViewerCameraState
  setCameraSettings?(patch: Partial<FreeCameraSettings>): ViewerCameraState
  setActiveCamera?(path: string | null): ViewerCameraState
  resetCamera?(): ViewerCameraState
  /** PNG of the stage view at canvas resolution (appController.py GrabViewportShot); the
   * DOM heads-up display is not part of the WebGPU canvas. */
  captureViewerImage?(): Promise<Blob>
  /** One rendered 360-degree turn; rejects on cancellation or rendering failure. */
  orbitOnce?(signal?: AbortSignal, durationMs?: number): Promise<void>
  resize(width: number, height: number, pixelRatio: number): void
  dispose(): void
}
/** A non-fatal problem reported while composing or imaging the scene (native
 * USD reports these as warnings and keeps going). */
export interface ViewerDiagnostic { severity: 'warning' | 'error', message: string }
export interface RuntimeCallbacks {
  /** The committed scene's diagnostics changed (replaced on each scene load). */
  diagnosticsChanged?(diagnostics: readonly ViewerDiagnostic[]): void
  geometryChanged?(state: ViewerGeometryState): void
  selectionChanged(detail: SelectionDetail): void
  statusChanged(message: string): void
  /** CPU draw submission time and its reciprocal rate (null below timer resolution);
   * excludes animation synchronization and GPU completion. */
  frameRendered?(stats: { cpuMilliseconds: number, framesPerSecond: number | null }): void
  cameraChanged?(state: ViewerCameraState): void
  timeChanged?(state: ViewerTimeState): void
  /** Transfer counters of the scene being opened or streamed. */
  loadProgress?(progress: LoadProgress): void
}
export interface LoadCounts { requested: number, done: number, failed: number }
/** 'layers': composing the stage before the first frame; 'payloads': deferred
 * payloads streaming into the committed stage. */
export type LoadPhase = 'layers' | 'payloads' | 'done' | 'cancelled'
export interface LoadProgress {
  phase: LoadPhase
  /** Asset reads before the first frame (layers and their textures). */
  layers: LoadCounts
  /** Asset reads made while loading deferred payloads. */
  payloadFiles: LoadCounts
  /** Payload prims deferred at open: queued, loaded, failed. */
  payloads: LoadCounts
  bytes: number
}
export type RuntimeFactory = (canvas: HTMLCanvasElement, callbacks: RuntimeCallbacks) => Promise<ViewerRuntime>

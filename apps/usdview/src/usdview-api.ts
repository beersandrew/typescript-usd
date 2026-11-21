// usdviewApi, the object Window > Interpreter seeds its namespace with
// (OpenUSD 26.11.1 usdviewq/usdviewApi.py; pythonInterpreter.py:916-920),
// over the viewer's controller (UsdviewAppController, the appController.py
// counterpart that usd-viewer.ts implements).
//
// Names follow the library's TypeScript idiom: usdviewApi.py's properties
// keep their names; its PascalCase methods are camelCase, as the library
// spells UsdStage::Open `Stage.open` (UpdateGUI is updateGUI, PrintStatus is
// printStatus). Prim paths are strings, as everywhere in the library.
//
// Left out, each with the reason:
// - selectedPoint (usdviewApi.py:63-67): the viewer's picks do not keep the
//   world-space point they hit.
// - selectedValidationErrors (:55-61): the USD Validation results table has
//   no row selection.
// - spec, layer (:90-100): the composition and layer stack inspector tabs do
//   not select a spec or layer.
// - configDir (:127-131): a browser page has no config directory.
// - qMainWindow (:139-143): there is no Qt window to parent widgets to.
// - GetSettings (:199-202): the viewer has no configController settings
//   object; its view preferences are origin-local storage.
// - GrabWindowShot (:211-214): a page cannot capture its own window.
// - _ExportSession (:247-257): private; a page cannot write to a path.
import type { Prim, Stage } from 'typescript-usd/usd'
import { TimeCode } from 'typescript-usd/usd'
import type { GfCamera } from 'typescript-usd/gf/camera'
import type { PrimSelection, SelectionOperation, SelectionState, ValidationResultRow } from './contracts'

/** selectionDataModel.py:18: every instance of a prim. */
export const ALL_INSTANCES = -1

/** What usdviewApi reads and drives: appController.py's members it uses. */
export interface UsdviewAppController {
  /** _dataModel.stage */
  stage(): Stage | null
  /** _dataModel.currentFrame as a time code value. */
  currentFrame(): number
  /** Moves the viewer to a frame (the frame slider's seek). */
  setCurrentFrame(time: number): Promise<void>
  /** _dataModel.playing */
  playing(): boolean
  selectionState(): SelectionState
  /** Changes the prim selection by one path (selectionDataModel.py add/remove/toggle). */
  updatePrimSelection(path: string, operation: SelectionOperation, instance?: number): void
  /** Replaces the prim selection. */
  replacePrimSelection(selections: readonly PrimSelection[]): void
  /** The selected property paths; the focus property is the last. */
  propertyPaths(): string[]
  setPropertyPaths(paths: readonly string[]): void
  /** _dataModel.viewSettings.cameraPrim's path; null for the free camera. */
  cameraPrimPath(): string | null
  /** _stageView.gfCamera */
  gfCamera(): GfCamera | null
  /** _stageView.width(), height() */
  viewportSize(): [number, number]
  isViewerMode(): boolean
  setViewerMode(viewerMode: boolean): void
  updateGUI(): void
  statusMessage(message: string): void
  /** GrabViewportShot, a PNG of the stage view. */
  grabViewportShot(): Promise<Blob>
  updateViewport(): void
  rendererPlugins(): string[]
  currentRendererId(): string | null
  /** _rendererPluginChanged; false when the plugin cannot be set. */
  setRendererPlugin(plugId: string): boolean
  /** _usdValidationWidget.validationErrors, as the results table's rows. */
  validationErrors(): readonly ValidationResultRow[]
}

const primPathOf = (path: string) => { const dot = path.indexOf('.'); return dot < 0 ? path : path.slice(0, dot) }
/** selectionDataModel.py:410-419 _ensureValidPrimPath */
function ensureValidPrimPath(path: string): string {
  const text = String(path)
  if (!text.startsWith('/') || text.includes('.') || text.includes('[') || (text.length > 1 && text.endsWith('/')))
    throw new RangeError(`Path must be a prim path, got: '${text}'`)
  return text
}
/** selectionDataModel.py:421-430 _validateInstanceIndexParameter */
function validateInstance(instance: number): number | undefined {
  if (!Number.isInteger(instance) || (instance < 0 && instance !== ALL_INSTANCES))
    throw new RangeError(`Instance must be a positive int or ALL_INSTANCES, got: ${String(instance)}`)
  return instance === ALL_INSTANCES ? undefined : instance
}

/** usdviewq/selectionDataModel.py:434-1040 Selection, its prim and property parts. */
export class UsdviewSelection {
  constructor(private readonly _app: UsdviewAppController) {}
  #stage(): Stage {
    const stage = this._app.stage()
    if (!stage) throw new Error('No stage is open.')
    return stage
  }
  /** stage.GetPrimAtPath; the library returns undefined where Python returns an invalid prim. */
  #prim(path: string): Prim | undefined { return this.#stage().getPrim(path) }

  /** :559-563 Clear all selections. */
  clear(): void { this.clearPrims(); this.clearProps() }

  // Prim path operations (:576-669).
  /** Clear the prim selection (same as path selection). */
  clearPrims(): void { this._app.replacePrimSelection([]) }
  /** Add a path to the path selection. If an instance is given, only add that instance. */
  addPrimPath(path: string, instance = ALL_INSTANCES): void { this._app.updatePrimSelection(ensureValidPrimPath(path), 'add', validateInstance(instance)) }
  /** Remove a path from the path selection. If an instance is given, only remove that instance. */
  removePrimPath(path: string, instance = ALL_INSTANCES): void { this._app.updatePrimSelection(ensureValidPrimPath(path), 'remove', validateInstance(instance)) }
  /** Toggle a path in the path selection. If an instance is given, only that instance is toggled. */
  togglePrimPath(path: string, instance = ALL_INSTANCES): void { this._app.updatePrimSelection(ensureValidPrimPath(path), 'toggle', validateInstance(instance)) }
  /** Clear the prim selection then add a single prim path back to the selection. */
  setPrimPath(path: string, instance = ALL_INSTANCES): void {
    const index = validateInstance(instance)
    this._app.replacePrimSelection([{ path: ensureValidPrimPath(path), ...(index === undefined ? {} : { instanceIndices: [index] }) }])
  }
  /** Get the path currently in focus. */
  getFocusPrimPath(): string { return this._app.selectionState().focusPath }
  /** Get a list of all selected paths. */
  getPrimPaths(): string[] { return this._app.selectionState().selections.map(entry => entry.path) }
  /** Get the selected paths that have no selected ancestor: the "Least Common Denominator" paths. */
  getLCDPaths(): string[] { return [...this._app.selectionState().lcdPaths] }
  /** Map each selected path to its selected instances, or ALL_INSTANCES when all are selected. */
  getPrimPathInstances(): Map<string, Set<number> | typeof ALL_INSTANCES> {
    return new Map(this._app.selectionState().selections.map(entry =>
      [entry.path, entry.instanceIndices ? new Set(entry.instanceIndices) : ALL_INSTANCES]))
  }
  /** Select only the given prim path; the selected properties move to the
   *  new prim where it has them (the property view keeps a selected name). */
  switchToPrimPath(path: string, instance = ALL_INSTANCES): void { this.setPrimPath(path, instance) }

  // Prim operations (:674-742).
  addPrim(prim: Prim, instance = ALL_INSTANCES): void { this.addPrimPath(prim.path, instance) }
  removePrim(prim: Prim, instance = ALL_INSTANCES): void { this.removePrimPath(prim.path, instance) }
  togglePrim(prim: Prim, instance = ALL_INSTANCES): void { this.togglePrimPath(prim.path, instance) }
  setPrim(prim: Prim, instance = ALL_INSTANCES): void { this.setPrimPath(prim.path, instance) }
  switchToPrim(prim: Prim, instance = ALL_INSTANCES): void { this.switchToPrimPath(prim.path, instance) }
  /** Get the prim whose path is currently in focus. */
  getFocusPrim(): Prim | undefined { return this.#prim(this.getFocusPrimPath()) }
  /** Get a list of all prims whose paths are selected. */
  getPrims(): (Prim | undefined)[] { return this.getPrimPaths().map(path => this.#prim(path)) }
  /** Get the selected prims that have no selected ancestor. */
  getLCDPrims(): (Prim | undefined)[] { return this.getLCDPaths().map(path => this.#prim(path)) }
  /** Map each selected prim to its selected instances, or ALL_INSTANCES when all are selected. */
  getPrimInstances(): Map<Prim | undefined, Set<number> | typeof ALL_INSTANCES> {
    return new Map([...this.getPrimPathInstances()].map(([path, instances]) => [this.#prim(path), instances]))
  }

  // Prim group removal (:744-780).
  removeInactivePrims(): void { for (const prim of this.getPrims()) if (prim && !prim.isActive) this.removePrim(prim) }
  removePrototypePrims(): void { for (const prim of this.getPrims()) if (prim && (prim.isPrototype() || prim.isInPrototype())) this.removePrim(prim) }
  removeAbstractPrims(): void { for (const prim of this.getPrims()) if (prim?.isAbstract) this.removePrim(prim) }
  removeUndefinedPrims(): void { for (const prim of this.getPrims()) if (prim && !prim.isDefined) this.removePrim(prim) }
  /** :768-780: remove prims that are not in the stage's population. */
  removeUnpopulatedPrims(): void {
    const stage = this.#stage()
    for (const path of this.getPrimPaths()) if (!stage.getPrim(path)) this.removePrimPath(path)
  }

  // Property path operations (:782-886). The property view lists the focus
  // prim's properties, so a selected property belongs to a selected prim.
  /** Clear the property selection. */
  clearProps(): void { this._app.setPropertyPaths([]) }
  /** Add a property to the selection. */
  addPropPath(path: string): void {
    const paths = this._app.propertyPaths().filter(p => p !== path)
    this._app.setPropertyPaths([...paths, this.#ensureValidPropPath(path)])
  }
  /** Remove a property from the selection. */
  removePropPath(path: string): void { this._app.setPropertyPaths(this._app.propertyPaths().filter(p => p !== path)) }
  /** Clear the property selection, then add a single property path back to the selection. */
  setPropPath(path: string): void { this._app.setPropertyPaths([this.#ensureValidPropPath(path)]) }
  /** Get the focus property from the property selection. */
  getFocusPropPath(): string | null { return this._app.propertyPaths().at(-1) ?? null }
  /** Get a list of all selected properties. */
  getPropPaths(): string[] { return this._app.propertyPaths() }
  addProp(prop: { getPath(): string }): void { this.addPropPath(prop.getPath()) }
  removeProp(prop: { getPath(): string }): void { this.removePropPath(prop.getPath()) }
  setProp(prop: { getPath(): string }): void { this.setPropPath(prop.getPath()) }
  /** Get the focus property from the property selection. */
  getFocusProp() { const path = this.getFocusPropPath(); return path === null ? null : this.#prop(path) }
  /** Get a list of all selected properties. */
  getProps() { return this.getPropPaths().map(path => this.#prop(path)) }
  #ensureValidPropPath(path: string): string {
    const text = String(path), dot = text.indexOf('.')
    if (dot <= 0 || !text.startsWith('/')) throw new RangeError(`Path must be a property path, got: '${text}'`)
    return text
  }
  /** :533-548 _getPropFromPath */
  #prop(path: string) {
    const prim = this.#prim(primPathOf(path)), name = path.slice(path.indexOf('.') + 1)
    return prim?.getProperty(name)
  }
}

/** usdviewq/viewSettingsDataModel.py, the members usdviewApi reads. */
export class UsdviewViewSettings {
  constructor(private readonly _app: UsdviewAppController) {}
  /** viewSettingsDataModel.py cameraPrim: the scene camera viewed through, or null for the free camera. */
  get cameraPrim(): Prim | null {
    const path = this._app.cameraPrimPath()
    return path ? this._app.stage()?.getPrim(path) ?? null : null
  }
}

/** usdviewq/appController.py:105 UsdviewDataModel (rootDataModel.py RootDataModel). */
export class UsdviewDataModel {
  readonly selection: UsdviewSelection
  readonly viewSettings: UsdviewViewSettings
  #requestedFrame: number | undefined
  constructor(private readonly _app: UsdviewAppController) {
    this.selection = new UsdviewSelection(_app)
    this.viewSettings = new UsdviewViewSettings(_app)
  }
  /** rootDataModel.py:44-48: the current Usd.Stage object. */
  get stage(): Stage | null { return this._app.stage() }
  /** rootDataModel.py:145-150: the Usd.TimeCode of the frame being considered in usdview. */
  get currentFrame(): TimeCode { return new TimeCode(this.#requestedFrame ?? this._app.currentFrame()) }
  /** rootDataModel.py:152-162: sets the current frame. The data model takes
   *  the frame at once; the viewer draws it when its frame update finishes
   *  (frames are drawn asynchronously here). */
  set currentFrame(value: TimeCode | number) {
    if (!(value instanceof TimeCode) && typeof value !== 'number') throw new TypeError(`Expected Usd.TimeCode, got: ${String(value)}`)
    const time = value instanceof TimeCode ? value.GetValue() : value
    if (!Number.isFinite(time)) throw new RangeError('The viewer shows numeric frames, not Usd.TimeCode.Default().')
    if (!this._app.stage()) throw new Error('No stage is open.')
    this.#requestedFrame = time
    const request = this._app.setCurrentFrame(time)
    this.#frameUpdate = request.finally(() => { if (this.#requestedFrame === time) this.#requestedFrame = undefined })
  }
  #frameUpdate: Promise<void> = Promise.resolve()
  /** Resolves when the viewer has drawn the last frame set through currentFrame. */
  frameUpdated(): Promise<void> { return this.#frameUpdate }
  /** rootDataModel.py:164-166 */
  get playing(): boolean { return this._app.playing() }
}

/** usdviewApi.py:14-257 UsdviewApi: access to usdview's context for the
 *  interpreter and other clients. */
export class UsdviewApi {
  readonly #dataModel: UsdviewDataModel
  constructor(private readonly _app: UsdviewAppController) { this.#dataModel = new UsdviewDataModel(_app) }

  /** Usdview's active data model object. */
  get dataModel(): UsdviewDataModel { return this.#dataModel }
  /** The current Usd.Stage. */
  get stage(): Stage | null { return this.#dataModel.stage }
  /** The current frame. */
  get frame(): TimeCode { return this.#dataModel.currentFrame }
  /** The focus prim from the prim selection. */
  get prim(): Prim | null { return this.stage ? this.#dataModel.selection.getFocusPrim() ?? null : null }
  /** The focus property from the property selection. */
  get property() { return this.stage ? this.#dataModel.selection.getFocusProp() : null }
  /** The current list of validation errors. */
  get validationErrors(): readonly ValidationResultRow[] { return this._app.validationErrors() }
  /** A list of all currently selected prims. */
  get selectedPrims(): (Prim | undefined)[] { return this.stage ? this.#dataModel.selection.getPrims() : [] }
  /** A list of the paths of all currently selected prims. */
  get selectedPaths(): string[] { return this.#dataModel.selection.getPrimPaths() }
  /** The current prim instance selection: a map from each selected prim to
   *  the set of its selected instance ids (ALL_INSTANCES when all are). */
  get selectedInstances(): Map<Prim | undefined, Set<number> | typeof ALL_INSTANCES> { return this.stage ? this.#dataModel.selection.getPrimInstances() : new Map() }
  /** The current camera prim. */
  get cameraPrim(): Prim | null { return this.#dataModel.viewSettings.cameraPrim }
  /** A copy of the last computed Gf Camera. */
  get currentGfCamera(): GfCamera | null { return this._app.gfCamera() }
  /** The width and height of the viewport in pixels. */
  get viewportSize(): [number, number] { return this._app.viewportSize() }
  /** The identifier of the open Usd.Stage's root layer. */
  get stageIdentifier(): string | null { return this.stage?.getRootLayer().identifier ?? null }
  /** Whether the app is in viewer mode, with the additional UI around the stage view collapsed. */
  get viewerMode(): boolean { return this._app.isViewerMode() }
  set viewerMode(value: boolean) { this._app.setViewerMode(!!value) }

  /** Returns selected models. This will walk up to find the nearest model.
   *  Note, this may return "group"s if they are selected. */
  computeModelsFromSelection(): Prim[] {
    const models: Prim[] = []
    for (const prim of this.selectedPrims) {
      if (!prim) continue
      // usdviewApi.py:168-177 walks the prim tree items' parents, which are the prims' parents.
      let current: Prim | undefined = prim
      while (current && !current.isModel()) current = current.getParent()
      if (current) models.push(current)
    }
    return models
  }
  /** Returns selected prims of the provided schemaType (TfType or schema type name). */
  computeSelectedPrimsOfType(schemaType: Parameters<Prim['isA']>[0]): Prim[] {
    return this.selectedPrims.filter((prim): prim is Prim => !!prim && prim.isA(schemaType))
  }
  /** Updates the main UI views. */
  updateGUI(): void { this._app.updateGUI() }
  /** Prints a status message. */
  printStatus(msg: string): void { this._app.statusMessage(String(msg)) }
  clearPrimSelection(): void { this.#dataModel.selection.clearPrims() }
  addPrimToSelection(prim: Prim): void { this.#dataModel.selection.addPrim(prim) }
  /** Returns a PNG of the current stage view in usdview.
   *  PLATFORM-DIVERGENCE(usdview-api-async-capture): usdview returns a
   *  QImage at once; a WebGPU readback is asynchronous, so this resolves to a
   *  PNG Blob. */
  grabViewportShot(): Promise<Blob> { return this._app.grabViewportShot() }
  /** Schedules a redraw. */
  updateViewport(): void { this._app.updateViewport() }
  /** Sets the renderer based on the given ID string. The string should be
   *  one of the items in getViewportRendererNames(). */
  setViewportRenderer(plugId: string): void {
    if (!this._app.setRendererPlugin(plugId)) this._app.statusMessage(`Renderer not supported: ${plugId}`)
  }
  /** Returns the list of available renderer plugins that can be passed to setViewportRenderer(). */
  getViewportRendererNames(): string[] { return this._app.rendererPlugins() }
  getViewportCurrentRendererId(): string | null { return this._app.currentRendererId() }
}

/** pythonInterpreter.py:896-897 FREQUENTLY_USED */
export const frequentlyUsed = ['dataModel', 'stage', 'frame', 'prim', 'property'] as const

/** The docstrings help(usdviewApi) shows (usdviewApi.py), by member. */
export const usdviewApiDocs: Readonly<Record<string, string>> = {
  dataModel: "Usdview's active data model object.",
  stage: 'The current Usd.Stage.',
  frame: 'The current frame.',
  prim: 'The focus prim from the prim selection.',
  property: 'The focus property from the property selection.',
  validationErrors: 'The current list of validation errors.',
  selectedPrims: 'A list of all currently selected prims.',
  selectedPaths: 'A list of the paths of all currently selected prims.',
  selectedInstances: 'The current prim instance selection. This is a map where each key is a prim and each value is a set of instance ids selected from that prim.',
  cameraPrim: 'The current camera prim.',
  currentGfCamera: 'A copy of the last computed Gf Camera.',
  viewportSize: 'The width and height of the viewport in pixels.',
  stageIdentifier: "The identifier of the open Usd.Stage's root layer.",
  viewerMode: 'Whether the app is in viewer mode, with the additional UI around the stage view collapsed.',
  computeModelsFromSelection: 'Returns selected models. This will walk up to find the nearest model. Note, this may return "group"s if they are selected.',
  computeSelectedPrimsOfType: 'Returns selected prims of the provided schemaType (TfType).',
  updateGUI: 'Updates the main UI views.',
  printStatus: 'Prints a status message.',
  clearPrimSelection: 'Clears the prim selection.',
  addPrimToSelection: 'Adds a prim to the prim selection.',
  grabViewportShot: 'Returns (a promise of) a PNG Blob of the current stage view in usdview.',
  updateViewport: 'Schedules a redraw.',
  setViewportRenderer: 'Sets the renderer based on the given ID string. The string should be one of the items in getViewportRendererNames().',
  getViewportRendererNames: 'Returns the list of available renderer plugins that can be passed to setViewportRenderer().',
  getViewportCurrentRendererId: 'Returns the id of the current renderer plugin.',
}

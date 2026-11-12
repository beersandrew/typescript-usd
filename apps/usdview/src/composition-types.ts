// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usdImaging/usdviewq/appController.py,
//  pxr/usdImaging/usdviewq/common.py, pxr/usdImaging/usdviewq/primViewItem.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import type { PrimSummary, SelectionDetail } from './contracts'
/** Usd.InterpolationType.allValues display names, in native menu order (appController.py:676-681). */
export const interpolationTypes = ['Held', 'Linear'] as const
export type InterpolationType = typeof interpolationTypes[number]
export const editableDrawModes=['default','cards','bounds','origin'] as const
export type CompositionCommand =
  | { kind: 'batch', commands: readonly CompositionCommand[] }
  | { kind: 'variant', path: string, set: string, selection: string }
  /** 'toggle' is the prim tree Vis column click (primViewItem.py:461-467 toggleVis). */
  | { kind: 'visibility', path: string, action: 'show' | 'hide' | 'isolate' | 'toggle' }
  /** The prim tree Guides column click (primViewItem.py:469-476 toggleGuides). */
  | { kind: 'guides', path: string }
  /** Native DrawModeWidget session default, null clears only that opinion. */
  | { kind:'drawMode',path:string,value:'default'|'cards'|'bounds'|'origin'|null }
  /** appController.py removeVisSelectedPrims: clear the visibility opinion at the session layer. */
  | { kind: 'removeVisibility', path: string }
  | { kind: 'resetVisibility' }
  /** '/' is the pseudo-root, which native holds when nothing is selected. */
  | { kind: 'payload', path: string, loaded: boolean }
  /** UsdStage::LoadAndUnload: one recomposition for a set of prims. The viewer
   * uses it to stream payloads deferred at open. */
  | { kind: 'loadAndUnload', load: readonly string[], unload: readonly string[] }
  /** appController.py _setSelectedPrimsActivation: Sdf-level `active` on the session layer. */
  | { kind: 'activation', path: string, active: boolean }
  /** A stage setting, not a layer edit (UsdStage::SetInterpolationType). */
  | { kind: 'interpolation', interpolation: InterpolationType }
  | { kind: 'layer', identifier: string, muted: boolean }
export interface CompositionState {
  path: string | null
  imageable: boolean
  visibility: string | null
  loadable: boolean
  loaded: boolean
  variants: { name: string, selection: string, choices: string[] }[]
  layers: { identifier: string, muted: boolean, canMute: boolean }[]
}
/** What usdview's Edit menu and prim context menu read from the selection
 * (appController.py:4866-4895, primContextMenuItems.py). */
export interface EditMenuState {
  /** '/' when nothing is selected: native selects the pseudo-root (selectionDataModel.py:352). */
  path: string
  name: string
  interpolation: InterpolationType
  /** common.py GetPrimLoadability: active and (group or authored payloads); loaded = fully loaded. */
  loadable: boolean
  loaded: boolean
  active: boolean
  inPrototype: boolean
  /** prim.IsA(UsdGeom.Imageable) */
  imageable: boolean
  /** ComputeVisibility(currentFrame) == inherited */
  visible: boolean
  /** common.py HasSessionVis: a session prim spec with a visibility attribute spec. */
  sessionVisibility: boolean
  /** common.py GetEnclosingModelPrim. '' is native's invalid (but non-None) prim past the root. */
  enclosingModel: string
  boundPreviewMaterial: { path: string, name: string, generic: boolean } | null
  boundFullMaterial: { path: string, name: string, generic: boolean } | null
  camera: boolean
}
export interface CompositionResult { tree: PrimSummary[], selection: SelectionDetail }

/** Flatten a selected-set edit before a single transactional rebuild. */
export function compositionCommands(command: CompositionCommand): Exclude<CompositionCommand,{kind:"batch"}>[] {
  return command.kind === "batch" ? command.commands.flatMap(compositionCommands) : [command]
}

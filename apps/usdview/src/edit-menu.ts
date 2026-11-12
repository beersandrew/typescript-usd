// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usdImaging/usdviewq/appController.py,
//  pxr/usdImaging/usdviewq/primContextMenuItems.py,
//  pxr/usdImaging/usdviewq/mainWindowUI.ui
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import type { CompositionCommand, EditMenuState } from './composition-types'
import { interpolationTypes } from './composition-types'
import { isMac, shortcutLabel } from './shortcuts'

// OpenUSD v26.11.1 usdviewq/mainWindowUI.ui menuEdit, with behavior from
// appController.py:4866-5002 and the prim context menu from primContextMenuItems.py.
export type EditAction = 'load' | 'unload' | 'activate' | 'deactivate' | 'makeVisible' | 'visOnly'
  | 'makeInvisible' | 'removeSessionVisibility' | 'resetAllSessionVisibility'
export interface EditMenuItem { action: EditAction, label: string, shortcuts: readonly string[], enabled: boolean }
/** Native labels and Qt shortcuts (Make Visible gains Ctrl+Shift+H at appController.py:1094). */
export const editActions: readonly { action: EditAction, label: string, shortcuts: readonly string[], separatorBefore?: boolean }[] = [
  { action: 'load', label: 'Load', shortcuts: [], separatorBefore: true },
  { action: 'unload', label: 'Unload', shortcuts: [] },
  { action: 'activate', label: 'Activate', shortcuts: [], separatorBefore: true },
  { action: 'deactivate', label: 'Deactivate', shortcuts: [] },
  { action: 'makeVisible', label: 'Make Visible', shortcuts: ['Shift+H', 'Ctrl+Shift+H'], separatorBefore: true },
  { action: 'visOnly', label: 'Vis Only', shortcuts: ['Alt+H'] },
  { action: 'makeInvisible', label: 'Make Invisible', shortcuts: ['Ctrl+H'] },
  { action: 'removeSessionVisibility', label: 'Remove Session Visibility', shortcuts: ['Ctrl+U'] },
  { action: 'resetAllSessionVisibility', label: 'Reset All Session Visibility', shortcuts: ['Shift+U'] },
]
export { interpolationTypes }

/** appController.py:4866-4895 _updateEditMenu. Reset All Session Visibility is never disabled. */
export function editMenuItems(state: EditMenuState | null, selected: readonly EditMenuState[] = state ? [state] : []): EditMenuItem[] {
  const enabled: Record<EditAction, boolean> = {
    load: selected.some(state => state.loadable), unload: selected.some(state => state.loadable),
    activate: selected.some(state => !state.active), deactivate: selected.some(state => state.active),
    makeVisible: selected.some(state => state.imageable), visOnly: selected.some(state => state.imageable), makeInvisible: selected.some(state => state.imageable),
    removeSessionVisibility: selected.some(state => state.sessionVisibility), resetAllSessionVisibility: !!state,
  }
  return editActions.map(({ action, label, shortcuts }) => ({ action, label, shortcuts, enabled: enabled[action] }))
}

/** The session-layer command for an action, or native's printed warning when it
 * authors nothing (appController.py:4952-4958). */
export function editCommand(action: EditAction, state: EditMenuState): CompositionCommand | string {
  const path = state.path
  switch (action) {
    case 'load': case 'unload': return { kind: 'payload', path, loaded: action === 'load' }
    case 'activate': case 'deactivate':
      if (path === '/') return 'WARNING: Cannot change activation of pseudoroot.'
      if (state.inPrototype) return `WARNING: The prim <${path}> is in a prototype. Cannot change activation.`
      return { kind: 'activation', path, active: action === 'activate' }
    case 'makeVisible': return { kind: 'visibility', path, action: 'show' }
    case 'makeInvisible': return { kind: 'visibility', path, action: 'hide' }
    case 'visOnly': return { kind: 'visibility', path, action: 'isolate' }
    case 'removeSessionVisibility': return { kind: 'removeVisibility', path }
    case 'resetAllSessionVisibility': return { kind: 'resetVisibility' }
  }
}

/** The editComplete status text native shows (appController.py:4905-5002). Load and
 * Unload format Python's list of item names. */
export function editStatusMessage(action: EditAction, state: EditMenuState): string {
  const changed = state.path !== '/' && !state.inPrototype ? state.name : ''
  switch (action) {
    case 'makeVisible': return 'Made selected prims visible'
    case 'visOnly': return 'Made ONLY selected prims visible'
    case 'makeInvisible': return 'Made selected prims invisible'
    case 'removeSessionVisibility': return "Removed selected prims' visibility opinions"
    case 'resetAllSessionVisibility': return 'Removed ALL session visibility opinions.'
    case 'activate': return `Activated ${changed}.`
    case 'deactivate': return `Deactivated ${changed}.`
    case 'load': return `Loaded ['${state.name}'].`
    case 'unload': return `Unloaded ['${state.name}'].`
  }
}

export type PrimContextAction = {kind:'inspectPaths',paths:string[]} | {kind:'propertyError',message:string} | { kind: 'select', path: string } | { kind: 'edit', action: EditAction }
  | { kind: 'copy', text: string } | { kind: 'camera', path: string } | { kind: 'none' }
export interface PrimContextMenuItem { text: string, enabled: boolean, run: PrimContextAction, unsupported?: string }
/** primContextMenuItems.py:19-37 _GetContextMenuItems, for a single selected prim. */
export function primContextMenuItems(state: EditMenuState, activeCamera: string | null): (PrimContextMenuItem | '---')[] {
  const material = (label: string, bound: EditMenuState['boundPreviewMaterial']): PrimContextMenuItem => ({
    text: bound ? `Select Bound ${label} Material (${bound.name}${bound.generic ? ' from generic binding' : ''})` : `Select Bound ${label} Material (None)`,
    enabled: !!bound, run: bound ? { kind: 'select', path: bound.path } : { kind: 'none' } })
  const model = state.enclosingModel, modelName = model.slice(model.lastIndexOf('/') + 1)
  return [
    // GetEnclosingModelPrim never returns None for a valid prim, so native always enables this.
    { text: 'Jump to Enclosing Model', enabled: true, run: { kind: 'select', path: model || state.path } },
    material('Preview', state.boundPreviewMaterial),
    material('Full', state.boundFullMaterial),
    '---',
    { text: state.visible ? 'Make Invisible' : 'Make Visible', enabled: state.imageable, run: { kind: 'edit', action: state.visible ? 'makeInvisible' : 'makeVisible' } },
    { text: 'Vis Only', enabled: state.imageable, run: { kind: 'edit', action: 'visOnly' } },
    { text: 'Remove Session Visibility', enabled: state.sessionVisibility, run: { kind: 'edit', action: 'removeSessionVisibility' } },
    '---',
    { text: state.loaded ? 'Unload' : 'Load', enabled: state.loadable, run: { kind: 'edit', action: state.loaded ? 'unload' : 'load' } },
    { text: state.active ? 'Deactivate' : 'Activate', enabled: true, run: { kind: 'edit', action: state.active ? 'deactivate' : 'activate' } },
    '---',
    { text: 'Copy Prim Path', enabled: true, run: { kind: 'copy', text: state.path } },
    { text: `Copy Enclosing Model ${model ? `(${modelName})` : ''} Path`, enabled: !!model, run: model ? { kind: 'copy', text: model } : { kind: 'none' } },
    '---',
    { text: 'usdview asset', enabled: false, run: { kind: 'none' }, unsupported: 'Launching a separate usdview on the asset (primContextMenuItems.py IsolateAssetMenuItem) is not available in the browser.' },
    { text: 'Set As Active Camera', enabled: state.camera && state.path !== activeCamera, run: { kind: 'camera', path: state.path } },
    { text: 'Set As Active Render Settings', enabled: false, run: { kind: 'none' }, unsupported: 'Render settings prims are not supported by this Storm/WebGPU viewer.' },
    { text: 'Set As Active Render Pass Prim', enabled: false, run: { kind: 'none' }, unsupported: 'Render pass prims are not supported by this Storm/WebGPU viewer.' },
  ]
}

/** Edit menu markup in mainWindowUI.ui order; Qt menus show an action's primary shortcut. */
export function editMenuHtml(mac = isMac()): string {
  const radios = interpolationTypes.map(type => `<button type="button" role="menuitemradio" data-interpolation="${type}" aria-checked="false" disabled>${type}</button>`).join('')
  const items = editActions.map(({ action, label, shortcuts, separatorBefore }) =>
    `${separatorBefore ? '<hr>' : ''}<button type="button" role="menuitem" data-edit="${action}" disabled>${label}${shortcuts[0] ? `<kbd>${shortcutLabel(shortcuts[0], mac)}</kbd>` : ''}</button>`).join('')
  return `<details class="menu edit-menu"><summary>Edit</summary><div class="menu-popup edit-popup" role="menu">
    <details class="submenu interpolation-menu"><summary role="menuitem">Stage Interpolation</summary><div class="menu-popup submenu-popup" role="menu">${radios}</div></details>${items}</div></details>`
}

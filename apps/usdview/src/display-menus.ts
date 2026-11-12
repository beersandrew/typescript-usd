// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usdImaging/usdviewq/mainWindowUI.ui, pxr/usdImaging/usdviewq/common.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { selectionHighlightModes } from './display-settings'
import { isMac, shortcutLabel } from './shortcuts'

// OpenUSD v26.11.1 usdviewq/mainWindowUI.ui menuShading_Mode and
// menuSelection_Highlighting (common.py RenderModes, HighlightColors).
export const shadingModes = [
  ['Wireframe', 'Ctrl+0'], ['WireframeOnSurface', 'Ctrl+1'], ['Smooth Shaded', 'Ctrl+2'], ['Flat Shaded', 'Ctrl+3'],
  ['Points', 'Ctrl+4'], ['Geom Only', 'Ctrl+6'], ['Geom Smooth', 'Ctrl+7'], ['Geom Flat', 'Ctrl+8'],
  ['Hidden Surface Wireframe', 'Ctrl+9'],
] as const
export const renderedShadingMode = 'Smooth Shaded'
export const highlightColors = ['Yellow', 'White', 'Cyan'] as const

export function shadingModeMenuHtml(mac = isMac()): string {
  return `<details class="submenu shading-menu"><summary role="menuitem">Shading Mode</summary><div class="menu-popup submenu-popup" role="menu">${shadingModes.map(([mode, key]) => {
    const rendered = mode === renderedShadingMode
    return `<button type="button" role="menuitemradio" data-shading-mode="${mode}" aria-checked="${rendered}" disabled>${mode}<kbd>${shortcutLabel(key, mac)}</kbd></button>`
  }).join('')}</div></details>`
}
export function selectionHighlightMenuHtml(): string {
  return `<details class="submenu highlight-menu"><summary role="menuitem">Selection Highlighting</summary><div class="menu-popup submenu-popup" role="menu">${selectionHighlightModes.map(mode =>
    `<button type="button" role="menuitemradio" data-highlight-mode="${mode}" aria-checked="false" disabled>${mode}</button>`).join('')}
    <details class="submenu highlight-color-menu"><summary role="menuitem">Highlight Color</summary><div class="menu-popup submenu-popup" role="menu">${highlightColors.map(color =>
      `<button type="button" role="menuitemradio" aria-checked="false" data-highlight-color="${color}" disabled>${color}</button>`).join('')}</div></details></div></details>`
}

// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdviewq/appController.py,
//  pxr/usdImaging/usdviewq/common.py, pxr/usdImaging/usdviewq/primViewItem.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Native usdview colours, fonts and per-row presentation (OpenUSD v26.11.1):
//  common.py:40-100 UIBaseColors, UIPrimTypeColors, UIPrimTreeColors,
//    UIPropertyValueSourceColors, UIFonts; primViewItem.py:203-334 row data;
//  appController.py:4064-4074 inherited properties drawn QColor.darker(115).
// Expected values: tests/fixtures/usdviewPropertyView/expected.json (colors, primTree).
// Pure presentation: no typescript-usd imports, so the Web Component can use it.
import type { PrimSummary, PropertySummary } from './contracts'
type Rgb = readonly [number, number, number]
/** common.py:44-49 UIPrimTypeColors, and QColor.darker(150) for inactive prims. */
export const primColors = {
  hasArcs: [222, 158, 46], normal: [227, 227, 227], instance: [135, 206, 250], prototype: [118, 136, 217],
} as const
const inactiveColors = Object.fromEntries(Object.entries(primColors).map(([k, c]) => [k, qtDarker(c, 150)])) as Record<keyof typeof primColors, Rgb>
/** QColor.darker(factor) (qcolor.cpp): the 16-bit HSV value becomes v * 100 / factor
 * (integer division) with hue and saturation kept, then converts back to 8-bit RGB. */
export function qtDarker(color: Rgb, factor: number): Rgb {
  const value = Math.max(...color) * 257, darker = Math.floor(value * 100 / factor)
  return color.map(channel => value ? Math.round(channel * darker / value) : 0) as unknown as Rgb
}
export interface PrimRowStyle {
  color: Rgb
  /** 'bold' defined, 'italic' undefined (light italic), 'normal' abstract (common.py:94-96). */
  font: 'bold' | 'italic' | 'normal'
  tooltip: string
  visText: string
  visInherited: boolean
  visColor: Rgb
  guidesText: string
  guidesDimmed: boolean
}
/** primViewItem.py:203-334 for one row; `parentInvisible` is the parent's computed vis. */
export function primRowStyle(prim: PrimSummary, parentInvisible: boolean): PrimRowStyle & { invisible: boolean } {
  const info = prim.info
  if (!info) return { color: primColors.normal, font: 'bold', tooltip: '', visText: '', visInherited: false, visColor: primColors.normal, guidesText: '', guidesDimmed: false, invisible: parentInvisible }
  const kind = info.instance ? 'instance' : info.hasArcs ? 'hasArcs' : info.inPrototype ? 'prototype' : 'normal'
  const color: Rgb = info.active ? primColors[kind] : inactiveColors[kind]
  const visible = info.imageable && info.active
  const ownInvisible = visible && !info.visibilityInherited
  const invisible = ownInvisible || parentInvisible
  const visInherited = visible && !ownInvisible && parentInvisible
  let tooltip = 'Prim'
  if (prim.typeName) tooltip = prim.typeName + ' ' + tooltip
  if (info.inPrototype) tooltip = 'Prototype ' + tooltip
  tooltip = (!info.defined ? 'Undefined ' : info.abstract ? 'Abstract ' : 'Defined ') + tooltip
  if (!info.active) tooltip = 'Inactive ' + tooltip
  else if (info.instance) tooltip = 'Instanced ' + tooltip
  tooltip += '\nName: ' + prim.name
  if (info.displayName) tooltip += '\nDisplay Name: ' + info.displayName
  if (info.hasArcs) tooltip += '\nHas composition arcs'
  const dimGuides = visInherited || ownInvisible
  return {
    color, font: info.abstract ? 'normal' : !info.defined ? 'italic' : 'bold', tooltip,
    visText: visible ? (ownInvisible ? 'I' : 'V') : '', visInherited, visColor: visInherited ? qtDarker(color, 200) : color,
    guidesText: info.supportsGuides ? (info.guidesVisible ? 'V' : 'I') : '', guidesDimmed: dimGuides, invisible,
  }
}
/** primViewItem.py:203-210: display names are shown by default (showPrimDisplayNames). */
export const primLabel = (prim: PrimSummary) => prim.info?.displayName || prim.name

/** common.py:40-43,53-58 property colours by value source; relationships and computed
 * values are UIBaseColors.RED. */
export const propertyColors = {
  fallback: [222, 158, 46], timeSamples: [177, 207, 153], default: [135, 206, 250],
  none: [140, 140, 140], valueClips: [230, 150, 230], spline: [80, 200, 180], red: [230, 132, 131],
} as const
/** common.py:46-51 UIPrimTreeColors (row backgrounds; alpha 50/100 for ancestors). */
export const primTreeColors = {
  selected: 'rgb(189, 155, 84)', selectedHover: 'rgb(227, 186, 101)',
  ancestorOfSelected: 'rgba(189, 155, 84, 0.196)', ancestorOfSelectedHover: 'rgba(189, 155, 84, 0.392)', unselectedHover: 'rgb(70, 70, 70)',
} as const
export function propertyColor(property: PropertySummary): Rgb {
  const base: Rgb = property.source ? propertyColors[property.source] : propertyColors.red
  return property.inherited ? qtDarker(base, 115) : base
}
export const rgbText = (color: Rgb) => `rgb(${color[0]}, ${color[1]}, ${color[2]})`

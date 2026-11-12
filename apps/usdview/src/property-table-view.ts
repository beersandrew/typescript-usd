// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdviewq/appController.py,
//  pxr/usdImaging/usdviewq/legendUtil.py,
//  pxr/usdImaging/usdviewq/mainWindowUI.ui,
//  pxr/usdImaging/usdviewq/primLegend.py,
//  pxr/usdImaging/usdviewq/propertyLegend.py
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Property view DOM and the "?" legends, following native usdview (OpenUSD v26.11.1):
//  mainWindowUI.ui:642-680 property view columns Type, Property Name, Value;
//  appController.py:3988-4110 _updatePropertyViewInternal (icons, "(i)", fonts, colours,
//    target/connection child rows, collapsed); appController.py:3955-3986 selection;
//  primLegend.py/primLegendUI.ui and propertyLegend.py/propertyLegendUI.ui legends;
//  legendUtil.py:9-31 legend toggle and LEGEND_BUTTON_SELECTEDSTYLE.
import type { PropertySummary, SelectionDetail } from './contracts'
import { propertyIcon, propertyIcons } from './usdview-icons'
import { primColors, propertyColor, propertyColors, rgbText } from './usdview-style'

const roleNames = { attribute: 'Attribute', attributeWithConnections: 'Attribute w/Connection(s)', relationship: 'Relationship',
  relationshipWithTargets: 'Relationship w/Target(s)', computed: 'Computed Value', computedMaterial: 'Computed Value' } as const

function icon(url: string, label: string): HTMLSpanElement {
  const span = document.createElement('span')
  span.className = 'property-icon'
  span.setAttribute('role', 'img')
  span.setAttribute('aria-label', label)
  span.title = label
  span.style.backgroundImage = `url("${url}")`
  return span
}

/** `expanded` names properties whose target/connection rows are shown. */
export function renderPropertyTable(host: HTMLElement, detail: SelectionDetail, selected: string | null, expanded: ReadonlySet<string>): void {
  const table = document.createElement('table')
  table.className = 'property-table'
  const head = table.createTHead().insertRow()
  for (const label of ['Type', 'Property Name', 'Value']) { const cell = document.createElement('th'); cell.textContent = label; head.append(cell) }
  const body = table.createTBody()
  for (const property of detail.properties) {
    const row = body.insertRow()
    row.dataset.propertyRow = property.name
    row.classList.toggle('selected', property.name === selected)
    row.style.setProperty('--property-color', rgbText(propertyColor(property)))
    if (property.interpolated) row.dataset.interpolated = ''
    const targets = property.targets ?? []
    const type = row.insertCell()
    type.className = 'property-type'
    if (targets.length) {
      const toggle = document.createElement('button')
      toggle.type = 'button'
      toggle.className = `toggle ${expanded.has(property.name) ? 'open' : 'closed'}`
      toggle.dataset.propertyToggle = property.name
      toggle.setAttribute('aria-label', `${expanded.has(property.name) ? 'Collapse' : 'Expand'} ${property.name}`)
      type.append(toggle)
    }
    type.append(icon(propertyIcon(property.role ?? 'attribute'), roleNames[property.role ?? 'attribute']))
    if (property.inherited) {
      const inherited = document.createElement('span'); inherited.className = 'property-inherited'; inherited.textContent = '(i)'
      inherited.title = 'Inherited Property'; type.append(inherited)
    }
    const name = row.insertCell(), button = document.createElement('button')
    name.className = 'property-name'
    button.type = 'button'; button.dataset.property = property.name; button.textContent = property.name
    name.append(button)
    const value = row.insertCell()
    value.className = 'property-value'
    if (targets.length) value.dataset.targets = ''
    value.textContent = property.value; value.title = property.value
    for (const target of targets) {
      const child = body.insertRow()
      child.className = 'property-target'
      child.dataset.targetOf = property.name
      child.dataset.targetPath = target
      child.hidden = !expanded.has(property.name)
      const kind = property.role === 'attributeWithConnections' ? 'connection' : 'target'
      child.insertCell().append(icon(propertyIcons[kind], kind === 'connection' ? 'Connection' : 'Target'))
      const targetName = child.insertCell(), targetButton = document.createElement('button')
      targetButton.type = 'button'; targetButton.dataset.property = property.name; targetButton.textContent = target
      targetName.append(targetButton)
      child.insertCell()
    }
  }
  host.replaceChildren(table)
}

/** Middle elision (appController.py:3990 setTextElideMode(ElideMiddle)) for value cells. */
export function elideValues(host: HTMLElement): void {
  const canvas = document.createElement('canvas').getContext?.('2d')
  if (!canvas) return
  for (const cell of host.querySelectorAll<HTMLTableCellElement>('.property-value')) {
    const text = cell.title, width = cell.clientWidth - 10
    if (!text || width <= 0) continue
    canvas.font = getComputedStyle(cell).font
    if (canvas.measureText(text).width <= width) { cell.textContent = text; continue }
    let low = 0, high = text.length
    while (low < high) {
      const keep = Math.ceil((low + high) / 2), head = Math.ceil(keep / 2)
      const candidate = text.slice(0, head) + '…' + text.slice(text.length - (keep - head))
      if (canvas.measureText(candidate).width <= width) low = keep; else high = keep - 1
    }
    const head = Math.ceil(low / 2)
    cell.textContent = text.slice(0, head) + '…' + text.slice(text.length - (low - head))
  }
}

// ------------------------------------------------------------------ legends
const swatch = (color: readonly number[]) => `<span class="legend-swatch" style="background:${rgbText(color as [number, number, number])}"></span>`
const colored = (text: string, color: readonly number[]) => `<span style="color:${rgbText(color as [number, number, number])}">${text}</span>`
const iconHtml = (url: string) => `<span class="property-icon" style="background-image:url(&quot;${url}&quot;)"></span>`

/** primLegendUI.ui: colour swatches, then primLegend.py:52-71 font/dimmed descriptions. */
export const primLegendHtml = `<div class="legend prim-legend" hidden aria-label="Prim legend">
  <div class="legend-grid legend-colors">
    <span>${swatch(primColors.hasArcs)}${colored('HasArcs', primColors.hasArcs)}</span>
    <span>${swatch(primColors.instance)}${colored('Instance', primColors.instance)}</span>
    <span>${swatch(primColors.prototype)}${colored('Prototype', primColors.prototype)}</span>
    <span>${swatch(primColors.normal)}${colored('Normal', primColors.normal)}</span>
  </div>
  <p>${colored('Dimmed colors', [148, 105, 30])} ${colored('denote', [78, 91, 145])} ${colored('inactive prims', [151, 151, 151])}</p>
  <p>Normal font indicates abstract prims(class and children)</p>
  <p><i>Italic font indicates undefined prims(declared with over)</i></p>
  <p><b>Bold font indicates defined prims(declared with def)</b></p>
</div>`

/** propertyLegendUI.ui: value-source colours (3x3 grid) and property icons. */
export const propertyLegendHtml = `<div class="legend property-legend" hidden aria-label="Property legend">
  <div class="legend-grid">
    <span>${swatch(propertyColors.none)}${colored('No Value', propertyColors.none)}</span>
    <span>${swatch(propertyColors.default)}${colored('Default', propertyColors.default)}</span>
    <span>${swatch(propertyColors.timeSamples)}${colored('Time Samples (<i>Interpolated</i>) ', propertyColors.timeSamples)}</span>
    <span>${swatch(propertyColors.fallback)}${colored('Fallback', propertyColors.fallback)}</span>
    <span>${swatch(propertyColors.red)}${colored('Custom', propertyColors.red)}</span>
    <span>${swatch(propertyColors.valueClips)}${colored('Value Clips (<i>Interpolated</i>)', propertyColors.valueClips)}</span>
    <span></span><span></span>
    <span>${swatch(propertyColors.spline)}${colored('Spline (<i>Interpolated</i>)', propertyColors.spline)}</span>
  </div>
  <div class="legend-grid legend-icons">
    <span>${iconHtml(propertyIcons.attribute)}Attribute</span>
    <span>${iconHtml(propertyIcons.connection)}Connection</span>
    <span>${iconHtml(propertyIcons.attributeWithConnections)}Attribute w/Connection(s)</span>
    <span>${iconHtml(propertyIcons.relationship)}Relationship</span>
    <span>${iconHtml(propertyIcons.target)}Target</span>
    <span>${iconHtml(propertyIcons.relationshipWithTargets)}Relationship w/Target(s)</span>
    <span>${iconHtml(propertyIcons.computed)}Computed Value</span>
    <span><small><i>(i)</i></small> Inherited Property</span>
  </div>
</div>`

export type { PropertySummary }

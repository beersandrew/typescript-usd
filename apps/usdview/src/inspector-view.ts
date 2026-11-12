// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usdImaging/usdviewq/appController.py,
//  pxr/usdImaging/usdviewq/mainWindowUI.ui
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { renderCompositionTree } from './composition-inspection'
import type { LayerStackPresentation } from './layer-stack-inspection'
import { pyFloat } from './python-format'
import type { InspectionSnapshot, InspectionArray } from './inspection-types'
export type InspectorTab = 'value' | 'metadata' | 'layers' | 'composition'
function table(host: HTMLElement, headings: string[], rows: string[][]) {
  if (!rows.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = 'No authored entries.'; host.append(empty); return }
  const table = document.createElement('table'); table.className = 'property-table inspection-table'
  const header = table.createTHead().insertRow()
  for (const label of headings) { const th = document.createElement('th'); th.textContent = label; header.append(th) }
  const body = table.createTBody()
  for (const values of rows) { const row = body.insertRow(); for (const value of values) row.insertCell().textContent = value }
  host.append(table)
}
export function renderInspection(host: HTMLElement, snapshot: InspectionSnapshot, tab: Exclude<InspectorTab, 'value'>): void {
  if (tab === 'metadata') {
    const details = snapshot.metadataDetails
    table(host, ['Field Name', 'Value'], (details?.rows??snapshot.metadata).map(row=>[row.name,row.value]))
    const grid=host.querySelector('table')
    grid?.classList.add('metadata-table')
    if(details)for(const [i,row] of details.rows.entries()){
      const cell=grid?.tBodies[0]?.rows[i]?.cells[1]
      if(cell)cell.title=row.value
    }
  }
  if (tab === 'layers') renderLayerStack(host, snapshot)
  if (tab === 'composition') {
    if (snapshot.compositionTree) { renderCompositionTree(host,snapshot.compositionTree); return }
    const note = document.createElement('p'); note.textContent = 'Prim composition arcs. This table does not expand the native nested layer tree or provide resolve-target editing.'; host.append(note)
    table(host, ['Arc', 'Target layer', 'Target prim', 'Introducing layer', 'Introducing prim', 'Ancestral', 'Has specs'], snapshot.composition.map(row => [row.arc, row.targetLayer, row.targetPath, row.introducingLayer || '—', row.introducingPath || '—', String(row.ancestral), String(row.hasSpecs)]))
  }
}
/** appController.py:4497-4650 and mainWindowUI.ui:1013-1101: one fixed-row
 * table, dynamically hidden columns and property-value-only source colors. */
function renderLayerStack(host: HTMLElement, snapshot: InspectionSnapshot): void {
  const root = snapshot.objectPath === '/', property = snapshot.objectPath.includes('.')
  const view: LayerStackPresentation = snapshot.layerStackView ?? {
    headers:['Layer','Offset , Scale','Path',property?'Value':'Metadata'],
    hidden:[false,!root&&!snapshot.layers.some(row=>row.offset!==0||row.scale!==1),root,root],
    rows:snapshot.layers.map(row=>({identifier:row.layer,layer:row.layer.split('/').at(-1)??row.layer,
      offset:row.offset===0&&row.scale===1?'':`${pyFloat(row.offset)} , ${pyFloat(row.scale)}`,
      path:row.specPath,value:row.value,depth:0,muted:false,...(property?{valueSource:row.sampleCount?'samples' as const:'default' as const}:{})})),
  }
  const grid=document.createElement('table');grid.className='property-table inspection-table layer-stack-table';grid.setAttribute('aria-label','Layer Stack');grid.dataset.root=String(view.hidden[2]);grid.tabIndex=0
  const header=grid.createTHead().insertRow()
  for(const [index,label] of view.headers.entries()){const th=document.createElement('th');th.scope='col';th.textContent=label;th.hidden=view.hidden[index]!;header.append(th)}
  const body=grid.createTBody()
  let selected:HTMLTableRowElement|undefined
  const select=(row:HTMLTableRowElement,focus=false)=>{selected?.classList.remove('selected');selected?.setAttribute('aria-selected','false');selected=row;row.classList.add('selected');row.setAttribute('aria-selected','true');if(focus)row.focus()}
  for(const entry of view.rows){
    const row=body.insertRow();row.dataset.layer=entry.identifier;row.dataset.depth=String(entry.depth);row.classList.toggle('muted',entry.muted);row.setAttribute('aria-selected','false');row.tabIndex=-1
    for(const [index,value] of [entry.layer,entry.offset,entry.path,entry.value].entries()){
      const cell=row.insertCell();cell.textContent=value;cell.hidden=view.hidden[index]!;cell.title=index===0?entry.identifier:value
      if(index===3&&entry.valueSource)cell.dataset.valueSource=entry.valueSource
    }
    row.addEventListener('click',()=>select(row));row.addEventListener('focus',()=>select(row))
  }
  grid.addEventListener('keydown',event=>{
    const rows=Array.from(body.rows);if(!rows.length)return
    const index=selected?rows.indexOf(selected):-1
    const next=event.key==='ArrowDown'?Math.min(index+1,rows.length-1):event.key==='ArrowUp'?Math.max(0,index-1):event.key==='Home'?0:event.key==='End'?rows.length-1:undefined
    if(next!==undefined){event.preventDefault();select(rows[next]!,true)}
  })
  host.append(grid)
}

export function appendTargetNavigation(host: HTMLElement, snapshot: InspectionSnapshot): void {
  if (!snapshot.targets.length) return
  const label = document.createElement('h3'); label.textContent = 'Targets and connections'; host.append(label)
  for (const target of snapshot.targets) {
    const line = document.createElement('p'), button = document.createElement('button')
    button.type = 'button'; button.textContent = `${target.kind}: ${target.path}${target.exists ? '' : ' (unresolved)'}`
    button.disabled = !target.exists; button.dataset.targetPrim = target.primPath
    if (target.propertyName) button.dataset.targetProperty = target.propertyName
    line.append(button); appendCopyButton(line, 'Copy target path', target.path); host.append(line)
  }
}

export function appendArrayTable(host: HTMLElement, array: InspectionArray): void {
  const controls = document.createElement('form'); controls.className = 'array-page-controls'
  const label = document.createElement('label'); label.textContent = 'Start index '
  const input = document.createElement('input'); input.type = 'number'; input.min = '0'; input.max = String(Math.max(0,array.length-1)); input.step = '1'; input.value = String(array.start); input.className = 'array-start'; input.setAttribute('aria-label','Array start index'); label.append(input)
  const go = document.createElement('button'); go.type = 'submit'; go.textContent = 'Go'
  controls.append(label, go)
  for (const [text,start] of [['Previous',Math.max(0,array.start-100)],['Next',array.start+100]] as const) {
    const button = document.createElement('button'); button.type='button'; button.textContent=text; button.dataset.arrayStart=String(start)
    button.disabled=text==='Previous'?array.start===0:array.start+array.entries.length>=array.length
    controls.append(button)
  }
  host.append(controls)
  const count = document.createElement('p'); count.className='array-count'; count.textContent=array.length ? `${array.start}–${array.start+array.entries.length-1} of ${array.length} elements · ${array.typeName}` : `Empty ${array.typeName}`; host.append(count)
  const grid=document.createElement('table'); grid.className='property-table array-value-table';const header=grid.createTHead().insertRow()
  for(const text of ['Index','Value']){const th=document.createElement('th');th.textContent=text;header.append(th)}
  const body=grid.createTBody();for(const value of array.entries){const row=body.insertRow();row.insertCell().textContent=String(value.index);row.insertCell().textContent=value.value}host.append(grid)
}
export function appendCopyButton(host: HTMLElement, label: string, value: string): void {
  const button=document.createElement('button');button.type='button';button.textContent=label;button.dataset.copyValue=value;host.append(button)
}

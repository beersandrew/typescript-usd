// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdviewq/appController.py,
//  pxr/usdImaging/usdviewq/mainWindowUI.ui,
//  pxr/usdImaging/usdviewq/primTreeWidget.py,
//  pxr/usdImaging/usdviewq/primViewItem.py
// Copyright 2016, 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Prim tree DOM, following native usdview's prim view (OpenUSD v26.11.1):
//  appController.py:3455-3466 _populateRoots: one "root" row for the pseudo-root;
//  mainWindowUI.ui:152-229 + appController.py:140-142: Prim Name, Type, Vis, Guides
//    (Draw Mode is hidden by default);
//  primViewItem.py:203-334 per-column text, font, colour and tool tips;
//  primTreeWidget.py:21-46,488-505 selected/ancestor-of-selected row backgrounds;
//  appController.py:3744-3752 selection never expands the tree; 1925-1945 initial depth.
import {editableDrawModes} from './composition-types'
import type { PrimSummary } from './contracts'
import { primLabel, primRowStyle, rgbText } from './usdview-style'

/** The pseudo-root row (utils.cpp:85-88 names it "root"). */
export function pseudoRoot(children: PrimSummary[]): PrimSummary {
  return { path: '/', name: 'root', typeName: '', children, info: { hasArcs: false, active: true, imageable: false, defined: true, abstract: false,
    inPrototype: false, instance: false, supportsGuides: false, visibilityInherited: true, guidesVisible: false, displayName: '' } }
}

/** appController.py:1928,3325-3341: _expandToDepth(3) calls Qt expandToDepth(2), which
 * expands the items at levels 0-2: the root row, its children and grandchildren. */
export function initialExpansion(root: PrimSummary, depth = 3): Set<string> {
  const expanded = new Set<string>()
  const visit = (node: PrimSummary, level: number) => {
    if (level >= depth || !node.children.length) return
    expanded.add(node.path)
    for (const child of node.children) visit(child, level + 1)
  }
  visit(root, 0)
  return expanded
}

export function renderPrimTree(host: HTMLElement, root: PrimSummary, expanded: ReadonlySet<string>,useDisplayNames=true,editors:ReadonlySet<string>=new Set()): void {
  const list = document.createElement('ul')
  list.className = 'tree'
  list.setAttribute('role', 'tree')
  list.setAttribute('aria-label', 'USD prims')
  list.setAttribute('aria-multiselectable','true')
  appendRow(list, root, 0, expanded, false,useDisplayNames,editors)
  stripePrimRows(list)
  host.replaceChildren(list)
}

function appendRow(list: HTMLUListElement, prim: PrimSummary, depth: number, expanded: ReadonlySet<string>, parentInvisible: boolean,useDisplayNames:boolean,editors:ReadonlySet<string>): void {
  const style = primRowStyle(prim, parentInvisible)
  const open = expanded.has(prim.path)
  const item = document.createElement('li')
  item.setAttribute('role', 'none')
  const row = document.createElement('div')
  row.className = 'prim-row'
  row.style.setProperty('--depth', String(depth))
  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.tabIndex = -1
  toggle.dataset.toggle = prim.path
  const label = useDisplayNames?primLabel(prim):prim.name
  if (prim.children.length) {
    toggle.className = `toggle ${open ? 'open' : 'closed'}`
    toggle.setAttribute('aria-label', `${open ? 'Collapse' : 'Expand'} ${label}`)
  } else toggle.className = 'toggle spacer'
  const button = document.createElement('button')
  button.className = 'prim'
  button.type = 'button'
  button.dataset.path = prim.path
  button.dataset.font = style.font
  button.tabIndex = -1
  button.title = style.tooltip
  button.setAttribute('role', 'treeitem')
  button.setAttribute('aria-level', String(depth + 1))
  button.setAttribute('aria-selected', 'false')
  if (prim.children.length) button.setAttribute('aria-expanded', String(open))
  button.style.setProperty('--prim-color', rgbText(style.color))
  const name = document.createElement('span')
  name.className = 'prim-name'
  name.textContent = label
  const type = document.createElement('span')
  type.className = 'prim-type'
  type.textContent = prim.typeName
  const vis = document.createElement('span')
  vis.className = 'prim-vis'
  vis.textContent = style.visText
  if (style.visText) {
    vis.dataset.vis = prim.path
    vis.title = style.visText === 'I' ? 'Invisible Prim' : 'Visible Prim'
    vis.style.color = rgbText(style.visColor)
    if (style.visInherited) vis.dataset.inherited = ''
  }
  const guides = document.createElement('span')
  guides.className = 'prim-guides'
  guides.textContent = style.guidesText
  if (style.guidesText) {
    guides.dataset.guides = prim.path
    guides.title = style.guidesText === 'V' ? 'Visible Guides' : 'Invisible Guides'
    if (style.guidesDimmed) guides.dataset.inherited = ''
  }
  const drawMode=document.createElement('span')
  drawMode.className='prim-draw-mode'
  const draw=prim.info?.drawMode
  if(draw){
    drawMode.textContent=draw.value;drawMode.dataset.drawMode=prim.path
    if(draw.inherited){drawMode.dataset.inherited='';drawMode.style.color=rgbText(style.color.map(v=>Math.round(v/1.1)) as [number,number,number])}
  }
  button.append(name, type, vis, guides,drawMode)
  row.append(toggle, button)
  if(draw){
    // A sibling overlay keeps interactive controls out of the treeitem button.
    const editor=document.createElement('div');editor.className='draw-mode-editor';editor.toggleAttribute('data-editor-active',editors.has(prim.path))
    const select=document.createElement('select');select.className='draw-mode-select';select.dataset.drawModeSelect=prim.path;select.setAttribute('aria-label','Draw Mode for '+prim.path)
    for(const value of editableDrawModes){const option=document.createElement('option');option.value=value;option.textContent=value;select.append(option)}
    select.value=draw.value
    const clear=document.createElement('button');clear.type='button';clear.className='draw-mode-clear';clear.dataset.drawModeClear=prim.path;clear.textContent='X';clear.setAttribute('aria-label','Clear session draw mode for '+prim.path);clear.style.visibility=draw.sessionOverride?'visible':'hidden'
    editor.append(select,clear);row.append(editor)
  }
  item.append(row)
  if (prim.children.length) {
    const group = document.createElement('ul')
    group.setAttribute('role', 'group')
    group.hidden = !open
    for (const child of prim.children) appendRow(group, child, depth + 1, expanded, style.invisible,useDisplayNames,editors)
    item.append(group)
  }
  list.append(item)
}

/** Selected row plus primTreeWidget.py:488-505 ancestorOfSelected tint on every ancestor. */
export function markPrimSelection(host: HTMLElement, path: string|readonly string[]): void {
  const paths=new Set(typeof path==='string'?[path]:path)
  for (const row of host.querySelectorAll<HTMLElement>('.prim-row.selected,.prim-row.ancestor')) row.classList.remove('selected', 'ancestor')
  for (const button of host.querySelectorAll<HTMLButtonElement>('.prim')) {
    const selected=paths.has(button.dataset.path!)
    button.setAttribute('aria-selected',String(selected))
    if(!selected)continue
    button.closest('.prim-row')!.classList.add('selected')
    for(let item=button.closest('li')?.parentElement?.closest('li');item;item=item.parentElement?.closest('li'))
      item.querySelector(':scope > .prim-row')!.classList.add('ancestor')
  }
}

/** Expand or collapse one item; returns false when it has no children. */
export function setPrimExpanded(item: HTMLLIElement, open: boolean): boolean {
  const group = item.querySelector<HTMLUListElement>(':scope > ul')
  if (!group) return false
  group.hidden = !open
  const button = item.querySelector<HTMLButtonElement>(':scope > .prim-row > .prim')!
  button.setAttribute('aria-expanded', String(open))
  const toggle = item.querySelector<HTMLButtonElement>(':scope > .prim-row > .toggle')!
  toggle.classList.toggle('open', open); toggle.classList.toggle('closed', !open)
  toggle.setAttribute('aria-label', `${open ? 'Collapse' : 'Expand'} ${button.querySelector('.prim-name')!.textContent}`)
  stripePrimRows(item.closest<HTMLElement>('.tree')!)
  return true
}

/** QTreeView alternatingRowColors follows visible rows across hierarchy levels. */
function stripePrimRows(host:HTMLElement):void {
 let index=0
 for(const row of host.querySelectorAll<HTMLElement>('.prim-row')){
  if(row.closest('ul[hidden]'))continue
  row.toggleAttribute('data-alternate',index++%2===1)
 }
}

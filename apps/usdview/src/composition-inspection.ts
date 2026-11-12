// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usdImaging/usdviewq/appController.py,
//  pxr/usdImaging/usdviewq/mainWindowUI.ui
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import type { Stage } from 'typescript-usd/usd'
import { ArcType, type NodeRef } from 'typescript-usd/pcp'

export interface CompositionLayer {
  identifier: string
  label: string
  hasSpec: boolean
  offset: number
  scale: number
  fields: { name: string; value: string }[]
  children: CompositionLayer[]
}
export interface CompositionNode {
  arc: string
  path: string
  introductionPath: string
  canContribute: boolean
  layerTree: CompositionLayer | null
  children: CompositionNode[]
}
export interface CompositionTree { primPath: string; root: CompositionNode | null }
const names: Record<number,string> = {[ArcType.Root]:'root',[ArcType.Inherit]:'inherit',[ArcType.Variant]:'variant',[ArcType.Relocate]:'relocate',[ArcType.Reference]:'reference',[ArcType.Payload]:'payload',[ArcType.Specialize]:'specialize'}
function valueText(value: unknown): string {
  try { return JSON.stringify(value, (_key,item) => {
    if (item?.toArray instanceof Function) return item.toArray()
    if (ArrayBuffer.isView(item)) return Array.from(item as unknown as ArrayLike<number>)
    return item
  }) ?? '—' } catch { return String(value) }
}
/** OpenUSD v26.11.1 usdviewq/appController.py:4427-4504 walks the cached
 * prim index, recursively visiting each node's actual sublayer tree. */
export function inspectCompositionTree(stage: Stage, primPath: string): CompositionTree {
  const prim=stage.getPrim(primPath)
  if (!prim) return {primPath,root:null}
  const index=prim.getPrimIndex()
  if (!index.isValid()) return {primPath,root:null}
  type LayerTreeNode=NonNullable<ReturnType<ReturnType<NodeRef['getLayerStack']>['getLayerTree']>>
  const visitLayer=(tree:LayerTreeNode,path:string):CompositionLayer => {
    const layer=tree.getLayer(),offset=tree.getOffset()
    if (!layer) throw new Error('Composition layer expired; refresh inspection to read the current stage.')
    return {identifier:layer.filePath,label:layer===stage.getSessionLayer()?'~session~':layer.filePath.split('/').at(-1)??layer.filePath,
      hasSpec:layer.hasSpec(path),offset:offset.offset,scale:offset.scale,
      fields:layer.getFieldNames(path).sort().map(name=>({name,value:valueText(layer.getField(path,name))})),
      children:tree.getChildTrees().map(child=>visitLayer(child,path))}
  }
  const visit=(node:NodeRef):CompositionNode => {
    const path=node.getPath().pathString,tree=node.getLayerStack().getLayerTree()
    return {arc:names[node.getArcType()]??String(node.getArcType()),path,introductionPath:node.getPathAtIntroduction().pathString,
      canContribute:node.canContributeSpecs(),layerTree:tree?visitLayer(tree,path):null,children:node.getChildren().map(visit)}
  }
  return {primPath,root:visit(index.getRootNode())}
}

/** Native composition rows: appController.py:4427-4504; headers, alternating
 * rows and 15px indentation: mainWindowUI.ui:1105-1147 (OpenUSD 26.11.1).
 * Selecting a source spec stays local to this tree, never the composed prim.
 */
export function renderCompositionTree(host:HTMLElement,tree:CompositionTree):void {
  const table=document.createElement('table');table.className='composition-tree';table.setAttribute('role','treegrid');table.setAttribute('aria-label','Composition');table.tabIndex=0
  const header=table.createTHead().insertRow()
  for(const label of ['Layer','Arc Type','Arc Path','Has Spec']){const th=document.createElement('th');th.textContent=label;th.scope='col';header.append(th)}
  const body=table.createTBody()
  interface Entry {row:HTMLTableRowElement;parent:Entry|null;children:Entry[];expanded:boolean;toggle:HTMLButtonElement|null}
  const entries:Entry[]=[];let selected:Entry|undefined
  const select=(entry:Entry,focus=true)=>{
    if(selected){selected.row.classList.remove('selected');selected.row.setAttribute('aria-selected','false');selected.row.tabIndex=-1}
    selected=entry;entry.row.classList.add('selected');entry.row.setAttribute('aria-selected','true');entry.row.tabIndex=0;table.tabIndex=-1
    if(focus)entry.row.focus()
  }
  const refresh=()=>{
    let visible=0
    for(const entry of entries){let hidden=false;for(let parent=entry.parent;parent;parent=parent.parent)if(!parent.expanded){hidden=true;break}
      entry.row.hidden=hidden;entry.row.classList.toggle('alternate',!hidden&&visible++%2===1)
      entry.row.dataset.expanded=String(entry.expanded)
      if(entry.children.length){entry.row.setAttribute('aria-expanded',String(entry.expanded));entry.toggle!.classList.toggle('open',entry.expanded);entry.toggle!.classList.toggle('closed',!entry.expanded);entry.toggle!.setAttribute('aria-label',`${entry.expanded?'Collapse':'Expand'} ${entry.row.cells[0]!.textContent}`)}
    }
  }
  const addLayer=(node:CompositionNode,layer:CompositionLayer,parent:Entry|null,depth:number,sublayer:boolean):Entry=>{
    const row=body.insertRow();row.setAttribute('role','row');row.setAttribute('aria-level',String(depth+1));row.setAttribute('aria-selected','false');row.tabIndex=-1
    row.dataset.layer=layer.identifier;if(layer.hasSpec)row.dataset.specPath=node.path;row.dataset.depth=String(depth);row.classList.toggle('dimmed',!layer.hasSpec||!node.canContribute)
    const cell=row.insertCell();cell.title=layer.identifier;cell.style.paddingLeft=`${depth*15}px`
    const toggle=document.createElement('button');toggle.type='button';toggle.className='composition-toggle';toggle.tabIndex=-1;cell.append(toggle,document.createTextNode(layer.label))
    for(const value of [sublayer?'sublayer':node.arc,node.introductionPath,layer.hasSpec?'yes':'no'])row.insertCell().textContent=value
    row.cells[2]!.title=node.introductionPath
    const entry:Entry={row,parent,children:[],expanded:true,toggle};entries.push(entry);parent?.children.push(entry)
    row.addEventListener('click',()=>select(entry));row.addEventListener('dblclick',event=>{if(entry.children.length&&event.target!==toggle){entry.expanded=!entry.expanded;refresh()}})
    toggle.addEventListener('click',event=>{event.stopPropagation();entry.expanded=!entry.expanded;refresh()})
    for(const child of layer.children)addLayer(node,child,entry,depth+1,true)
    return entry
  }
  const addNode=(node:CompositionNode,parent:Entry|null,depth:number)=>{
    if(!node.layerTree)return
    const entry=addLayer(node,node.layerTree,parent,depth,false)
    for(const child of node.children)addNode(child,entry,depth+1)
  }
  if(tree.root)addNode(tree.root,null,0)
  for(const entry of entries)if(!entry.children.length){entry.toggle!.remove();entry.toggle=null;const spacer=document.createElement('span');spacer.className='composition-leaf';entry.row.cells[0]!.prepend(spacer)}
  table.addEventListener('keydown',event=>{
    if(event.altKey||event.metaKey||event.ctrlKey)return
    const visible=entries.filter(entry=>!entry.row.hidden),index=selected?visible.indexOf(selected):-1
    let next:Entry|undefined
    switch(event.key){
      case 'ArrowDown':next=visible[Math.min(index+1,visible.length-1)];break
      case 'ArrowUp':next=visible[Math.max(index-1,0)];break
      case 'Home':next=visible[0];break
      case 'End':next=visible.at(-1);break
      case 'ArrowRight':if(selected?.children.length){if(selected.expanded)next=selected.children[0];else selected.expanded=true}break
      case 'ArrowLeft':if(selected){if(selected.children.length&&selected.expanded)selected.expanded=false;else next=selected.parent??undefined}break
      default:return
    }
    event.preventDefault();event.stopPropagation();refresh();if(next)select(next)
  })
  refresh();host.append(table)
}

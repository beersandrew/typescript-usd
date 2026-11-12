// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdviewq/appController.py,
//  pxr/usdImaging/usdviewq/viewSettingsDataModel.py
// Copyright 2016, 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD 26.11.1 viewSettingsDataModel.py:171-182, appController.py:3455-3496.
import type {PrimSummary} from './contracts'
import {shortcutLabel} from './shortcuts'
export interface PrimTreeSettings {
 showInactivePrims:boolean
 showAllPrototypePrims:boolean
 showUndefinedPrims:boolean
 showAbstractPrims:boolean
 showPrimDisplayNames:boolean
}
export const defaultPrimTreeSettings=():PrimTreeSettings=>({showInactivePrims:true,showAllPrototypePrims:false,showUndefinedPrims:false,showAbstractPrims:false,showPrimDisplayNames:true})
export const primTreeFilters=[['showInactivePrims','Inactive Prims'],['showAllPrototypePrims','Prototype Prims'],['showUndefinedPrims','Undefined Prims (Overs)'],['showAbstractPrims','Abstract Prims (Classes)'],['showPrimDisplayNames','Use Display Name (Prims)']] as const
export function filterPrimTree(root:PrimSummary,settings:PrimTreeSettings):PrimSummary {
 const include=(prim:PrimSummary)=>!(prim.prototypeRoot&&!settings.showAllPrototypePrims)&&(!prim.info||((settings.showInactivePrims||prim.info.active)&&(settings.showUndefinedPrims||prim.info.defined)&&(settings.showAbstractPrims||!prim.info.abstract)))
 const visit=(prim:PrimSummary):PrimSummary=>({...prim,children:prim.children.filter(include).map(visit)})
 return visit(root)
}
/** Category toggles explicitly clear that class of selection, including ON toggles
 * (appController.py:3361-3389; selectionDataModel.py:744-767). */
export function removeCategorySelection(root:PrimSummary,paths:readonly string[],key:keyof PrimTreeSettings):string[]{
 const remove=new Set<string>()
 const visit=(prim:PrimSummary)=>{
  const info=prim.info
  if(info&&(key==='showInactivePrims'&&!info.active||key==='showUndefinedPrims'&&!info.defined||key==='showAbstractPrims'&&info.abstract||key==='showAllPrototypePrims'&&info.prototype))remove.add(prim.path)
  for(const child of prim.children)visit(child)
 }
 visit(root);return paths.filter(path=>!remove.has(path))
}
export function primShowMenuHtml(mac:boolean):string {
 const depths=Array.from({length:8},(_,index)=>`<button type="button" role="menuitem" data-prim-depth="${index+1}">Level ${index+1}<kbd>${shortcutLabel('Alt+'+(index+1),mac)}</kbd></button>`).join('')
 const expand=`<button type="button" data-expand="true">Expand All<kbd>${shortcutLabel('Alt+9',mac)}</kbd></button><button type="button" data-expand="false">Collapse All<kbd>${shortcutLabel('Alt+0',mac)}</kbd></button>`
 return `<details class="submenu prim-depth-menu"><summary role="menuitem">Prim View Depth</summary><div class="menu-popup submenu-popup" role="menu">${depths}<hr>${expand}</div></details><hr>`+primTreeFilters.map(([key,label])=>`<button type="button" role="menuitemcheckbox" data-prim-filter="${key}" aria-checked="${defaultPrimTreeSettings()[key]}">${label}</button>`).join('')+`<hr><details class="submenu columns-menu"><summary role="menuitem">Columns</summary><div class="menu-popup submenu-popup" role="menu">${['Prim Name','Type','Vis','Guides','Draw Mode'].map((label,i)=>`<label><input type="checkbox" data-tree-column="${i}"${i<4?' checked':''}> ${label}</label>`).join('')}</div></details>`
}

// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdviewq/selectionDataModel.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Consumer selection state follows OpenUSD 26.11.1 usdviewq/selectionDataModel.py:
// 56-219 instance sets, 367-386 LCD paths, 623-650 first-path focus.
// Expected states: tests/fixtures/usdviewSelection/expected.json (native capture).
import type {PrimSelection,SelectionOperation,SelectionState,PickMode} from './contracts'
import type {Stage} from 'typescript-usd/usd'
import {Registry as KindRegistry} from 'typescript-usd/kind'
export const pickModes=['prims','models','instances','prototypes'] as const
export class PrimSelectionModel {
 private entries=new Map<string,Set<number>|null>([['/',null]])
 constructor(initial?:readonly PrimSelection[]){if(initial)this.replace(initial)}
 replace(selections:readonly PrimSelection[]):void {
  this.entries.clear()
  for(const selection of selections){
   if(selection.instanceIndices===undefined)this.add(selection.path)
   else for(const instance of selection.instanceIndices)this.add(selection.path,instance)
  }
  this.ensureRoot()
 }
 update(path:string|null,operation:SelectionOperation='replace',instanceIndex?:number):void {
  const target=path??'/'
  if(operation==='replace')this.entries.clear()
  if(operation==='toggle')this.toggle(target,instanceIndex)
  else if(operation==='remove')this.remove(target,instanceIndex)
  else this.add(target,instanceIndex)
  this.ensureRoot()
 }
 range(paths:readonly string[],extend=false):void {
  const targets=new Set(paths)
  if(!extend)for(const path of this.entries.keys())if(!targets.has(path))this.entries.delete(path)
  for(const path of paths)if(!this.entries.has(path))this.add(path)
  this.ensureRoot()
 }
 prune(valid:(path:string)=>boolean):void {
  for(const path of this.entries.keys())if(path!=='/'&&!valid(path))this.entries.delete(path)
  this.ensureRoot()
 }
 snapshot():SelectionState {
  const selections=[...this.entries].map(([path,indices])=>({path,...(indices?{instanceIndices:[...indices].sort((a,b)=>a-b)}:{})}))
  const focusPath=selections[0]!.path
  const paths=selections.map(s=>s.path).filter(path=>selections.length===1||path!=='/').sort()
  const lcdPaths=paths.filter(path=>!paths.some(parent=>parent!==path&&(parent==='/'||path.startsWith(parent+'/'))))
  return {selections,focusPath,lcdPaths}
 }
 private add(path:string,index?:number):void {
  if(index===undefined||index<0){this.entries.set(path,null);return}
  let values=this.entries.get(path)
  if(!values){values=new Set();this.entries.set(path,values)}
  values.add(index)
 }
 private remove(path:string,index?:number):void {
  if(!this.entries.has(path))return
  const values=this.entries.get(path)
  if(index===undefined||index<0||!values){this.entries.delete(path);return}
  values.delete(index);if(!values.size)this.entries.delete(path)
 }
 private toggle(path:string,index?:number):void {
  if(!this.entries.has(path)){this.add(path,index);return}
  const values=this.entries.get(path)
  if(index===undefined||index<0){if(!values)this.entries.delete(path);else this.entries.set(path,null)}
  else if(!values)this.entries.set(path,new Set([index]))
  else if(values.has(index))this.remove(path,index)
  else values.add(index)
 }
 private ensureRoot(){if(!this.entries.size)this.entries.set('/',null)}
}

/** appController.py:5032-5081 (onPrimSelected): the prim and instance a
 * viewport pick selects in a pick mode, from the hit prim path and instance
 * index and the top-level instancer path and instance index (the first
 * entry of the hit's instancer context, stageView.py:2047-2052; '' and -1
 * without one). An instance index of -1 (ALL_INSTANCES) selects the whole
 * prim. */
export function resolvePickSelection(stage:Stage,path:string,instanceIndex:number,topLevelPath:string,topLevelInstanceIndex:number,mode:PickMode):PrimSelection {
 let prim=stage.getPrim(path)
 if(!prim)return {path:'/'}
 const parent=(p:string)=>p.slice(0,p.lastIndexOf('/'))||'/'
 const topLevelPrim=topLevelPath?stage.getPrim(topLevelPath):undefined
 if(mode==='models'){
  // Model picking ignores instancing, but selects the enclosing model of
  // the picked prim (common.py:624-638 GetEnclosingModelPrim).
  if(!prim.isModel()){
   for(let p=parent(path);p!=='/';p=parent(p)){
    const candidate=stage.getPrim(p)
    if(candidate&&KindRegistry.isA(candidate.getKind(),'model')){prim=candidate;break}
   }
  }
  instanceIndex=-1
 }else if(mode==='prims'){
  // The top level boundable: the gprim, the top-level point instancer or
  // the top-level USD instance; the instance index is discarded.
  if(topLevelPrim)prim=topLevelPrim
  while(prim.isInstanceProxy())prim=stage.getPrim(parent(prim.path))!
  instanceIndex=-1
 }else if(mode==='instances'){
  // As prim picking, but a point instancer selects the picked instance.
  if(topLevelPrim){prim=topLevelPrim;instanceIndex=topLevelInstanceIndex}
  if(prim.isInstanceProxy()){
   while(prim.isInstanceProxy())prim=stage.getPrim(parent(prim.path))!
   instanceIndex=-1
  }
 }
 // Prototype picking passes the hit through.
 return {path:prim.path,...(instanceIndex>=0?{instanceIndices:[instanceIndex]}:{})}
}

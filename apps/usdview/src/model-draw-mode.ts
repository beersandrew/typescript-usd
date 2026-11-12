// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdviewq/primTreeWidget.py,
//  pxr/usdImaging/usdviewq/primViewItem.py, pxr/usdImaging/usdviewq/utils.cpp
// Copyright 2016, 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Native usdview utils.cpp:69-72, primViewItem.py:89-110,258-267 and
// primTreeWidget.py:49-201. Model inheritance is delegated to UsdGeomModelAPI.
import type {Prim,Stage} from 'typescript-usd/usd'
import {ModelAPI as GeomModelAPI} from 'typescript-usd/usdGeom'
import type {ModelDrawModeState} from './contracts'
import {editableDrawModes} from './composition-types'
export {editableDrawModes} from './composition-types'
export function supportsModelDrawMode(prim:Prim):boolean {
 return prim.path!=='/'&&prim.isActive&&prim.isDefined&&!prim.isInPrototype()&&!prim.isInstanceProxy()&&prim.isModel()
}
export function modelDrawModeState(stage:Stage,prim:Prim):ModelDrawModeState|undefined {
 if(!supportsModelDrawMode(prim))return undefined
 let inherited=false
 if(!prim.getAttr('model:drawMode')?.hasAuthoredValue()){
  for(let path=prim.path.slice(0,prim.path.lastIndexOf('/'));path;path=path.slice(0,path.lastIndexOf('/'))){
   if(stage.getPrim(path)?.getAttr('model:drawMode')?.hasAuthoredValue()){inherited=true;break}
  }
 }
 return {value:new GeomModelAPI(prim,stage).computeModelDrawMode(),inherited,sessionOverride:stage.getSessionLayer().getAttributeAtPath(prim.path+'.model:drawMode')?.hasDefaultValue()??false}
}
/** Session-only authoring matches DrawModeWidget; clear only its default. */
export function editModelDrawMode(stage:Stage,prim:Prim,value:string|null):void {
 if(!supportsModelDrawMode(prim))throw new Error(`The prim <${prim.path}> does not support draw mode.`)
 const api=new GeomModelAPI(prim,stage)
 if(value===null){
  const spec=stage.getSessionLayer().getAttributeAtPath(prim.path+'.model:drawMode')
  if(spec){spec.clearDefaultValue();stage.getSessionLayer().scheduleRemoveIfInert(spec)}
 }else{
  if(!editableDrawModes.includes(value as typeof editableDrawModes[number]))throw new Error(`Unknown draw mode: ${value}`)
  if(api.computeModelDrawMode()===value)return
  prim.applyAPI('GeomModelAPI');api.createModelDrawModeAttr().set(value)
 }
}

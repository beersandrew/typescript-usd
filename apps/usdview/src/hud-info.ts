// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usdImaging/usdviewq/appController.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import 'typescript-usd/usdGeom'
import {PrimDefaultPredicate,type Stage as CoreStage} from 'typescript-usd/usd'
import {Stage,type Prim} from 'typescript-usd'

type GeomCounts={CVs:number,Verts:number,Faces:number}

/** usdviewq/appController.py:3402-3418,4725-4750 _tallyPrimStats/_updateHUDPrimStats:
 * prim and per-type counts of the active LCD prims' subtrees, independent of time. */
export function subtreePrimStats(coreStage:CoreStage,paths:readonly string[]):Record<string,number>{
 const stage=Stage.fromCore(coreStage)
 const types:Record<string,number>={};let prims=0
 for(const path of paths){
  const root=stage.prim(path);if(!root?.isActive)continue
  // Walk the public GetChildren result directly. PrimRange iterator gaps are
  // recorded in docs/usdview-menu-gaps.md; this app does not patch the library.
  const tally=(prim:Prim)=>{
   if(prim.typeName||path!=='/'){prims++;const type=prim.typeName||'Typeless';types[type]=(types[type]??0)+1}
   for(const child of prim.children)tally(child)
  }
  if(path==='/')for(const child of root.children)tally(child)
  else if(PrimDefaultPredicate.evaluate(root.core))tally(root)
 }
 return {Prims:prims,...types}
}

/** usdviewq/appController.py:4752-4828 _updateHUDGeomCounts/_calculateGeomCounts: authored
 * curve CVs, mesh vertices and faces of the LCD prims' subtrees at `time`, independently of
 * render visibility and tessellation. */
export function subtreeGeomCounts(coreStage:CoreStage,paths:readonly string[],time:number):GeomCounts{
 const stage=Stage.fromCore(coreStage)
 const counts={CVs:0,Verts:0,Faces:0}
 for(const path of paths){
  const root=stage.prim(path);if(!root?.isActive)continue
  const visit=(prim:Prim)=>{
   if(prim.isA('Curves')){const value=prim.attribute('curveVertexCounts')?.get(time);if(value&&Symbol.iterator in Object(value))counts.CVs+=Array.from(value as Iterable<number>).reduce((a,b)=>a+b,0)}
   else if(prim.isA('Mesh')){const faces=prim.attribute('faceVertexCounts')?.get(time),indices=prim.attribute('faceVertexIndices')?.get(time);if(faces&&indices){counts.Faces+=(faces as {length:number}).length;counts.Verts+=new Set(indices as Iterable<number>).size}}
   for(const child of prim.children)visit(child)
  };visit(root)
 }
 return counts
}

/** usdviewq/appController.py:4717-4723 _getHUDStatKeys order: Prims, the types, then the counts. */
export function subtreeHudInfo(coreStage:CoreStage,paths:readonly string[],time:number):Record<string,number>{
 return {...subtreePrimStats(coreStage,paths),...subtreeGeomCounts(coreStage,paths,time)}
}

/** The HUD subtree info as usdview keeps it: prim stats are tallied when the selection
 * changes (appController.py:3637-3639) and not on frame changes; geometry counts are kept
 * per frame (appController.py:4781-4786 _getGeomCounts caches by (prim, frame)) and are
 * read on paused frame changes (appController.py:3868-3876). Playback does not read them
 * (appController.py:3885-3889). `invalidate` is called on stage changes: usdview resets
 * its caches only when the stage reopens (appController.py:1391,1428), so it can show
 * stale counts after an edit; here an edit recounts. */
export class SubtreeHudInfoCache {
 #stage:CoreStage|undefined
 #key=''
 #primStats:Record<string,number>|undefined
 #geomCounts=new Map<number,GeomCounts>()
 invalidate():void{this.#stage=undefined}
 get(stage:CoreStage,paths:readonly string[],time:number):Record<string,number>{
  const key=JSON.stringify(paths)
  if(this.#stage!==stage||this.#key!==key){this.#stage=stage;this.#key=key;this.#primStats=undefined;this.#geomCounts.clear()}
  this.#primStats??=subtreePrimStats(stage,paths)
  let geom=this.#geomCounts.get(time)
  if(!geom)this.#geomCounts.set(time,geom=subtreeGeomCounts(stage,paths,time))
  return {...this.#primStats,...geom}
 }
}

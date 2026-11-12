// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdviewq/__init__.py,
//  pxr/usdImaging/usdviewq/appController.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD 26.11.1 usdviewq/__init__.py:339-347 and
// appController.py:1333-1404,3032-3081. Native expectations: usdviewStartup fixture.
import type {Stage} from 'typescript-usd/usd'
import {Camera} from 'typescript-usd/usdGeom'
import {pyFloat} from './python-format'

/** UsdUtils.GetPrimaryCameraName() default. Camera choice is an application
 * convention, not stage metadata and not the first arbitrary scene camera. */
export function startupCameraPath(stage:Stage,name='main_cam'):string|null {
 if(name.startsWith('/')){const prim=stage.getPrim(name);return prim?.isActive&&prim.isA(Camera.typeName)?name:null}
 for(const path of stage.traverse()){
  if(path.slice(path.lastIndexOf('/')+1)===name&&stage.getPrim(path)?.isA(Camera.typeName))return path
 }
 return null
}
interface StageTimeMetadata {
 readonly startTimeCode?:number|undefined
 readonly endTimeCode?:number|undefined
 readonly timeCodesPerSecond?:number|undefined
 getFramesPerSecond?():number
}
export function stageTimeInfo(stage:StageTimeMetadata){
 const stageStart=Number.isFinite(stage.startTimeCode)?stage.startTimeCode!:0
 const stageEnd=Number.isFinite(stage.endTimeCode)?stage.endTimeCode!:0
 const authored=Number.isFinite(stage.startTimeCode)&&Number.isFinite(stage.endTimeCode)
 const hasTimeSamples=authored&&stageStart<=stageEnd
 const fps=stage.getFramesPerSecond?.()??24
 const framesPerSecond=Number.isFinite(fps)&&fps>0?fps:24
 const tps=stage.timeCodesPerSecond??framesPerSecond
 const validRate=Number.isFinite(tps)&&tps>0
 const warnings:string[]=[]
 if(authored&&stageStart>stageEnd)warnings.push(`Warning: Invalid frame range (${pyFloat(stageStart)}, ${pyFloat(stageEnd)})`)
 // Native Drange loops indefinitely for a zero/negative step. Preserve the
 // stage's authored metadata; use a safe viewer-only playback clock and say so.
 if(!validRate)warnings.push(`Invalid timeCodesPerSecond (${tps}). Using framesPerSecond (${framesPerSecond}) for viewer playback; authored metadata is unchanged.`)
 return {start:hasTimeSamples?stageStart:0,end:hasTimeSamples?stageEnd:0,stageStart,stageEnd,
  hasTimeSamples,framesPerSecond,timeCodesPerSecond:validRate?tps:framesPerSecond,warnings}
}

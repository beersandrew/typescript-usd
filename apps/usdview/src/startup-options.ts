// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usdImaging/usdviewq/__init__.py,
//  pxr/usdImaging/usdviewq/appController.py, pxr/usdImaging/usdviewq/common.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import {SdfPath as Path} from 'typescript-usd/sdf/path'
import {complexities} from './display-settings'
import {stageTimeInfo} from './scene-startup'
import {pyFloat} from './python-format'
export interface StartupOptions {
 camera?:string
 select?:string
 complexity?:keyof typeof complexities
 firstFrame?:number
 lastFrame?:number
 currentFrame?:number
 populationMask?:string[]
 /** false opens with every payload loaded before the first frame, as usdview does. */
 progressive?:boolean
 /** ?loadSchedule=1: apply the scene's payload load schedule (root layer
  * customLayerData["tourLoad"], load-schedule.ts), as usdview does with a
  * load-schedule plugin and --unloaded: the stage opens with only the carriers
  * scheduled at the start frame loaded, and each frame change loads the
  * carriers whose window holds it and unloads the rest. Unset, a scene that
  * has a schedule plays by it (PLATFORM-DIVERGENCE(usdview-load-schedule-default),
  * runtime.ts); ?loadSchedule=0, or a scene without a schedule, loads every
  * payload as usual. */
 loadSchedule?:boolean
}
/** URL equivalents of usdviewq/__init__.py:133-159,246-259,312-368.
 * Invalid browser options produce diagnostics and leave defaults usable. */
export function parseStartupOptions(search:string|URLSearchParams):{options:StartupOptions;warnings:string[]}{
 const params=typeof search==='string'?new URLSearchParams(search):search,options:StartupOptions={},warnings:string[]=[]
 const last=(key:string)=>params.getAll(key).at(-1)
 const camera=last('camera')
 if(camera){
  const path=Path.fromString(camera)
  if(!path.isPrimPath()||path.containsPrimVariantSelection())warnings.push(`Invalid startup camera path: ${camera}.`)
  else if(!path.isAbsolutePath()&&path.pathElementCount>1){options.camera=path.makeAbsolutePath(Path.absoluteRootPath).toString();warnings.push(`WARNING: camera path '${camera}' was not absolute, prepending '/' to make it absolute`)}
  else options.camera=path.toString()
 }
 const select=last('select')
 if(select!==undefined){const path=Path.fromString(select);if((path.isAbsoluteRootPath()||path.isPrimPath())&&path.isAbsolutePath()&&!path.containsPrimVariantSelection())options.select=path.toString();else warnings.push(`Invalid startup selection path: ${select}.`)}
 const complexity=last('complexity')
 if(complexity!==undefined){if(Object.hasOwn(complexities,complexity))options.complexity=complexity as keyof typeof complexities;else warnings.push(`Invalid startup complexity: ${complexity}. Using low.`)}
 for(const [key,field]of [['ff','firstFrame'],['lf','lastFrame'],['cf','currentFrame']] as const){const value=last(key);if(value!==undefined){const text=value.trim(),n=Number(text);if(/^[+-]?\d+$/.test(text)&&Number.isSafeInteger(n))options[field]=n;else warnings.push(`Invalid startup ${key}: ${value}. Expected an integer frame.`)}}
 const mask=last('mask')
 if(mask!==undefined){
  const paths=mask.replaceAll(',',' ').split(/\s+/).filter(Boolean)
  if(paths.every(value=>{const p=Path.fromString(value);return p.isAbsolutePath()&&(p.isAbsoluteRootPath()||p.isPrimPath())&&!p.containsPrimVariantSelection()}))options.populationMask=paths
  else warnings.push(`Invalid startup population mask: ${mask}. Expected absolute prim paths.`)
 }
 const progressive=last('progressive')
 if(progressive!==undefined){if(progressive==='0'||progressive==='1')options.progressive=progressive==='1';else warnings.push(`Invalid startup progressive: ${progressive}. Expected 0 or 1.`)}
 const loadSchedule=last('loadSchedule')
 if(loadSchedule!==undefined){if(loadSchedule==='0'||loadSchedule==='1')options.loadSchedule=loadSchedule==='1';else warnings.push(`Invalid startup loadSchedule: ${loadSchedule}. Expected 0 or 1.`)}
 return {options,warnings}
}
/** appController.py:1323-1408 and common.py:784-794. Current frame 0 is
 * ignored by native's `if cf`; preserve that observed behavior. */
export function startupTimeInfo(stage:Parameters<typeof stageTimeInfo>[0],options:StartupOptions){
 const native=stageTimeInfo(stage),warnings=native.warnings.filter(w=>!w.startsWith('Warning: Invalid frame range'))
 const ff=options.firstFrame,lf=options.lastFrame
 const authored=Number.isFinite(stage.startTimeCode)&&Number.isFinite(stage.endTimeCode)
 const hasRange=ff!==undefined||lf!==undefined||authored
 const start=ff??native.stageStart,end=lf??native.stageEnd
 const hasTimeSamples=hasRange&&start<=end
 if(hasRange&&start>end)warnings.push(`Warning: Invalid frame range (${ff===undefined?pyFloat(start):start}, ${lf===undefined?pyFloat(end):end})`)
 const rawStep=native.timeCodesPerSecond/native.framesPerSecond
 let step=rawStep
 if(!Number.isFinite(step)||step<=0){warnings.push('The stage playback step cannot be represented safely; using one time code per frame. Authored metadata is unchanged.');step=1}
 let last=start
 if(hasTimeSamples){
  // Native enumerates start+n*step. Determine only its final value without
  // allocating an array proportional to an untrusted URL frame range.
  let n=Math.floor((end-start)/step)
  if(Number.isSafeInteger(n)){
   while(n>0&&start+n*step>end)n--
   while(start+(n+1)*step<=end&&Number.isSafeInteger(n+1))n++
   last=start+n*step
  }else{warnings.push('The animation range exceeds safe playback-step precision; using its end frame without enumerating samples.');last=end}
 }
 let current=hasTimeSamples?start:0
 if(options.currentFrame){
  if(!hasRange)warnings.push(`Startup current frame ${options.currentFrame} has no frame range; using 0.`)
  else if(options.currentFrame<start||options.currentFrame>end)warnings.push(`Warning: Invalid current frame specified (${options.currentFrame})`)
  else current=hasTimeSamples?Math.max(start,Math.min(last,options.currentFrame)):0
 }
 return {...native,timeCodesPerSecond:!Number.isFinite(rawStep)||rawStep<=0?native.framesPerSecond:native.timeCodesPerSecond,start:hasTimeSamples?start:0,end:hasTimeSamples?last:0,current,hasTimeSamples,warnings}
}
/** Validate the consumer configuration through the same URL/CLI-equivalent seam. */
export function normalizeStartupOptions(options:StartupOptions){
 const params=new URLSearchParams()
 for(const [field,key]of [['camera','camera'],['select','select'],['complexity','complexity'],['firstFrame','ff'],['lastFrame','lf'],['currentFrame','cf']] as const)if(options[field]!==undefined)params.set(key,String(options[field]))
 if(options.populationMask!==undefined)params.set('mask',options.populationMask.join(' '))
 if(options.progressive!==undefined)params.set('progressive',options.progressive?'1':'0')
 if(options.loadSchedule!==undefined)params.set('loadSchedule',options.loadSchedule?'1':'0')
 return parseStartupOptions(params)
}

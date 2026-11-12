// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usdImaging/usdviewq/viewSettingsDataModel.py,
//  pxr/usdImaging/usdviewq/settings.py
// Copyright 2017, 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import {defaultSplitPercentages} from './viewer-layout'
import {defaultDisplaySettings,mergeDisplaySettings,type DisplaySettings} from './display-settings'
import {defaultCameraPresentation,mergeCameraPresentation,type CameraPresentationSettings} from './camera-presentation'
import {defaultFontSize,minFontSize,maxFontSize} from './window-menu'
import type {FreeCameraSettings,PickMode} from './contracts'
import {pickModes} from './selection-model'
export interface ViewPreferences {
 display:Omit<DisplaySettings,'complexity'>
 camera:FreeCameraSettings
 presentation:CameraPresentationSettings
 tree:Record<string,boolean>
 pickMode:PickMode
 ui:{fontSize:number;showHUD:boolean;axesVisible:boolean;viewerMode:boolean;redrawOnScrub:boolean;inspectorTab:'value'|'metadata'|'layers'|'composition';splits:{top:number;bottom:number;vertical:number}}
}
export const preferenceStorageKey='typescript-usdview.preferences'
const version='1'
/** Native viewSettingsDataModel.py:124-263 omits scene camera, orbit, selections,
 * current time and complexity. Browser axes/split percentages are consumer preferences. */
export function defaultViewPreferences(tree:Record<string,boolean>):ViewPreferences {
 const {complexity:_,...display}=defaultDisplaySettings()
 return {display,camera:{fovDegrees:60,aspectRatio:null,nearOverride:null,farOverride:null},presentation:defaultCameraPresentation(),tree:{...tree},pickMode:'prims',ui:{fontSize:defaultFontSize,showHUD:true,axesVisible:true,viewerMode:false,redrawOnScrub:true,inspectorTab:'value',splits:{...defaultSplitPercentages}}}
}
const object=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v)
/** StateSource.stateProperty/settings.py:118-211: validate each known property;
 * a bad property uses its default without discarding the remaining valid state. */
export function readViewPreferences(value:unknown,defaults:ViewPreferences):{preferences:ViewPreferences;warnings:string[]} {
 const preferences=structuredClone(defaults),warnings:string[]=[]
 if(!object(value))return {preferences,warnings}
 const invalid=(key:string)=>warnings.push(`Saved viewer preference ${key} is invalid; using its default.`)
 const section=(name:string,read:(key:string,value:unknown)=>void)=>{
  const values=value[name];if(values===undefined)return
  if(!object(values)){invalid(name);return}
  for(const [key,v]of Object.entries(values))read(key,v)
 }
 section('display',(key,v)=>{
  if(!Object.hasOwn(defaults.display,key))return
  try{const next=mergeDisplaySettings({...defaultDisplaySettings(),...preferences.display},{[key]:v});(preferences.display as unknown as Record<string,unknown>)[key]=next[key as keyof DisplaySettings]}catch{invalid(`display.${key}`)}
 })
 section('presentation',(key,v)=>{
  if(!Object.hasOwn(defaults.presentation,key))return
  try{preferences.presentation=mergeCameraPresentation(preferences.presentation,{[key]:v})}catch{invalid(`presentation.${key}`)}
 })
 section('tree',(key,v)=>{if(Object.hasOwn(defaults.tree,key)){if(typeof v==='boolean')preferences.tree[key]=v;else invalid(`tree.${key}`)}})
 section('camera',(key,v)=>{
  if(!Object.hasOwn(defaults.camera,key))return
  const valid=key==='fovDegrees'?typeof v==='number'&&Number.isFinite(v)&&v>0&&v<180:v===null||typeof v==='number'&&Number.isFinite(v)&&v>0
  if(valid)(preferences.camera as unknown as Record<string,unknown>)[key]=v;else invalid(`camera.${key}`)
 })
 const c=preferences.camera
 if(c.nearOverride!==null&&c.farOverride!==null&&c.nearOverride>=c.farOverride){invalid('camera.clipping');c.nearOverride=defaults.camera.nearOverride;c.farOverride=defaults.camera.farOverride}
 if(value.pickMode!==undefined){if(pickModes.includes(value.pickMode as PickMode))preferences.pickMode=value.pickMode as PickMode;else invalid('pickMode')}
 section('ui',(key,v)=>{
  if(!Object.hasOwn(defaults.ui,key))return
  if(key==='splits'){
   if(!object(v)){invalid('ui.splits');return}
   for(const axis of ['top','bottom','vertical'] as const)if(v[axis]!==undefined){const n=v[axis];if(typeof n==='number'&&Number.isFinite(n)&&n>=20&&n<=80)preferences.ui.splits[axis]=n;else invalid(`ui.splits.${axis}`)}
  }else if(key==='fontSize'){
   if(typeof v==='number'&&Number.isInteger(v)&&v>=minFontSize&&v<=maxFontSize)preferences.ui.fontSize=v;else invalid('ui.fontSize')
  }else if(key==='inspectorTab'){
   if(typeof v==='string'&&['value','metadata','layers','composition'].includes(v))preferences.ui.inspectorTab=v as ViewPreferences['ui']['inspectorTab'];else invalid('ui.inspectorTab')
  }else if(typeof v==='boolean')(preferences.ui as unknown as Record<string,unknown>)[key]=v
  else invalid(`ui.${key}`)
 })
 return {preferences,warnings}
}
export interface PreferenceStorage {getItem(key:string):string|null;setItem(key:string,value:string):void}
/** Settings._loadState/save (settings.py:220-291), adapted to origin-local storage.
 * Malformed JSON is ephemeral, so defaults do not overwrite the unreadable state. */
export class ViewPreferenceStore {
 private root:Record<string,unknown>={}
 private writable=true
 private lastSaved:string|undefined
 constructor(private storage:()=>PreferenceStorage|undefined,private key:string,private defaults:ViewPreferences){}
 load(){
  const warnings:string[]=[];let raw:string|null|undefined
  try{raw=this.storage()?.getItem(this.key)}catch(error){this.writable=false;warnings.push(`Viewer preferences could not be read: ${String(error)}`)}
  if(raw){try{const parsed:unknown=JSON.parse(raw);this.root=object(parsed)?parsed:{}}catch{this.writable=false;warnings.push('Saved viewer preferences contain invalid JSON. Defaults will be used and this session will not overwrite them.')}}
  const loaded=readViewPreferences(this.root[version],this.defaults)
  return {preferences:loaded.preferences,warnings:[...warnings,...loaded.warnings]}
 }
 save(value:unknown):string[]{
  if(!this.writable)return []
  const snapshot=readViewPreferences(value,this.defaults).preferences
  const json=JSON.stringify({...this.root,[version]:snapshot})
  if(json===this.lastSaved)return []
  try{const storage=this.storage();if(!storage)return [];storage.setItem(this.key,json);this.lastSaved=json;return []}catch(error){this.writable=false;return [`Viewer preferences could not be saved: ${String(error)}`]}
 }
}

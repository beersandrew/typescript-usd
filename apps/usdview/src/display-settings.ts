// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usdImaging/usdviewq/stageView.py,
//  pxr/usdImaging/usdviewq/viewSettingsDataModel.py,
//  pxr/usdImaging/usdAppUtils/complexityArgs.py
// Copyright 2016, 2018, 2019 Pixar. Tomorrow Open Source Technology License
//  1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import {renderModes,selectionColors,type RenderMode} from './render-modes'
/** Consumer view settings follow OpenUSD v26.11.1 usdviewq/viewSettingsDataModel.py:24-29,156-159. */
export const backgroundColors = {
 'Black': [0,0,0,1], 'Grey (Dark)': [0.07074,0.07074,0.07074,1],
 'Grey (Light)': [0.45626,0.45626,0.45626,1], 'White': [1,1,1,1],
} as const
// usdAppUtils/complexityArgs.py:44-47 and usdImagingGL/engine.cpp:2510-2530.
export const complexities = { low: {label:'Low',level:0}, medium: {label:'Medium',level:1}, high: {label:'High',level:2}, veryhigh: {label:'Very High',level:3} } as const
/** common.py:170-174 SelectionHighlightModes, in the menu's order; viewSettingsDataModel.py:151 default. */
export const selectionHighlightModes = ['Never', 'Only when paused', 'Always'] as const
export type SelectionHighlightMode = typeof selectionHighlightModes[number]
/** stageView.py:1510-1519: playback draws highlights only in Always; paused, anything but Never. */
export function drawsSelectionHighlights(mode: SelectionHighlightMode, playing: boolean): boolean {
 return playing ? mode === 'Always' : mode !== 'Never'
}
export interface DisplaySettings {
 renderMode: RenderMode
 highlightColor: keyof typeof selectionColors
 background: keyof typeof backgroundColors
 enableSceneMaterials: boolean
 cullBackfaces: boolean
 defaultMaterialAmbient: number
 defaultMaterialSpecular: number
 cameraLightEnabled: boolean
 sceneLightsEnabled: boolean
 domeLightEnabled: boolean
 domeLightTexturesVisible: boolean
 useExtentsHint: boolean
 showBBoxPlayback: boolean
 showBBoxes: boolean
 showAABBox: boolean
 showOBBox: boolean
 displayRender: boolean
 displayProxy: boolean
 displayGuide: boolean
 complexity: keyof typeof complexities
 selHighlightMode: SelectionHighlightMode
}
export const defaultDisplaySettings = (): DisplaySettings => ({renderMode:'Smooth Shaded',highlightColor:'Yellow',background:'Grey (Dark)',cameraLightEnabled:true,sceneLightsEnabled:true,domeLightEnabled:false,domeLightTexturesVisible:true,enableSceneMaterials:true,cullBackfaces:false,defaultMaterialAmbient:0.2,defaultMaterialSpecular:0.1,complexity:'low',useExtentsHint:true,showBBoxes:true,showBBoxPlayback:false,showAABBox:true,showOBBox:true,displayRender:false,displayProxy:true,displayGuide:false,selHighlightMode:'Only when paused'})
export function mergeDisplaySettings(current: DisplaySettings, patch: Partial<DisplaySettings>): DisplaySettings {
 const next = {...current,...patch}
 if (!renderModes.includes(next.renderMode)) throw new Error('Unknown shading mode')
 if (!Object.hasOwn(selectionColors,next.highlightColor)) throw new Error('Unknown highlight color')
 if (!Object.hasOwn(backgroundColors,next.background)) throw new Error('Unknown background preset')
 if (!Object.hasOwn(complexities,next.complexity)) throw new Error('Unknown subdivision complexity')
 if (!selectionHighlightModes.includes(next.selHighlightMode)) throw new Error('Unknown selection highlight mode')
 if (typeof next.cameraLightEnabled !== 'boolean' || typeof next.sceneLightsEnabled !== 'boolean') throw new Error('Light toggles must be boolean')
 for(const key of ['defaultMaterialAmbient','defaultMaterialSpecular'] as const) if(!Number.isFinite(next[key])||next[key]<0||next[key]>1)throw new Error(`${key} must be between 0 and 1`)
 for (const key of ['domeLightEnabled','useExtentsHint','domeLightTexturesVisible','enableSceneMaterials','cullBackfaces','showBBoxes','showBBoxPlayback','showAABBox','showOBBox','displayRender','displayProxy','displayGuide'] as const) if (typeof next[key] !== 'boolean') throw new Error(`${key} must be boolean`)
 return next
}
export function applyDisplayLighting(delegate: {setDisplayPurposes(purposes:readonly string[]):void;setClearColor(color:{r:number,g:number,b:number,a:number}):void;setCameraLightEnabled(value:boolean):void;setSceneLightsEnabled(value:boolean):void;setSceneMaterialsEnabled(value:boolean):void;setBackfaceCullingEnabled(value:boolean):void;setDefaultMaterial(ambient:number,specular:number):void;getRenderSetting?(key:string):unknown;setRenderSetting?(key:string,value:unknown):void}, settings:DisplaySettings) {
 const [r,g,b,a] = backgroundColors[settings.background]
 delegate.setDisplayPurposes(displayPurposes(settings).filter(purpose => purpose !== 'default'))
 delegate.setClearColor({r,g,b,a})
 delegate.setCameraLightEnabled(settings.cameraLightEnabled)
 delegate.setSceneLightsEnabled(settings.sceneLightsEnabled)
 if(supportsDomeLightTextures(delegate))delegate.setRenderSetting!('domeLightCameraVisibility',settings.domeLightTexturesVisible)
 // stageView.py:1476-1477,1965-1969.
 delegate.setSceneMaterialsEnabled(settings.enableSceneMaterials)
 delegate.setBackfaceCullingEnabled(settings.cullBackfaces)
 delegate.setDefaultMaterial(settings.defaultMaterialAmbient,settings.defaultMaterialSpecular)
}

/** usdviewq/stageView.py updateBboxPurposes: default always participates. */
export function displayPurposes(settings:DisplaySettings): string[] {
 return ['default', ...(settings.displayRender ? ['render'] : []), ...(settings.displayProxy ? ['proxy'] : []), ...(settings.displayGuide ? ['guide'] : [])]
}

/** hdSt/renderDelegate.cpp:245-250; older library packages do not expose this setting. */
export function supportsDomeLightTextures(delegate:unknown):boolean{
 const d=delegate as {getRenderSetting?:(key:string)=>unknown,setRenderSetting?:(key:string,value:unknown)=>void}|undefined
 return typeof d?.getRenderSetting==='function'&&typeof d.setRenderSetting==='function'&&typeof d.getRenderSetting('domeLightCameraVisibility')==='boolean'
}

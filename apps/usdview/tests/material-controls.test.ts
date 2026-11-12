// @vitest-environment jsdom
import {expect,it,vi} from 'vitest'
import native from './fixtures/materialControls/expected.json' with {type:'json'}
import {defaultDisplaySettings,mergeDisplaySettings,applyDisplayLighting} from '../src/display-settings'
import {MaterialControls,materialDialog,materialMenu} from '../src/material-controls'
it('uses captured native material defaults and updates the render delegate',()=>{
 const s=defaultDisplaySettings();for(const [key,value] of Object.entries(native.defaults))expect(s[key as keyof typeof s]).toBe(value)
 const d={setDisplayPurposes:vi.fn(),setClearColor:vi.fn(),setCameraLightEnabled:vi.fn(),setSceneLightsEnabled:vi.fn(),setSceneMaterialsEnabled:vi.fn(),setBackfaceCullingEnabled:vi.fn(),setDefaultMaterial:vi.fn()}
 applyDisplayLighting(d,mergeDisplaySettings(s,{...native.changed,enableSceneMaterials:false,cullBackfaces:true}))
 expect(d.setSceneMaterialsEnabled).toHaveBeenCalledWith(false)
 expect(d.setBackfaceCullingEnabled).toHaveBeenCalledWith(true)
 expect(d.setDefaultMaterial).toHaveBeenCalledWith(native.changed.defaultMaterialAmbient,native.changed.defaultMaterialSpecular)
 for(const key of ['defaultMaterialAmbient','defaultMaterialSpecular'] as const)for(const value of [-.1,1.1,NaN,Infinity])expect(()=>mergeDisplaySettings(s,{[key]:value})).toThrow('between 0 and 1')
})
it('provides native immediate edits, limits and Reset without changing scene data',async()=>{
 const root=document.createElement('div').attachShadow({mode:'open'});root.innerHTML=materialMenu+materialDialog
 let s=defaultDisplaySettings();const change=vi.fn(async patch=>{s=mergeDisplaySettings(s,patch);controls.refresh()})
 const controls=new MaterialControls(root,()=>s,change),abort=new AbortController();controls.bind(abort.signal);controls.busy(false)
 for(const [name,range]of Object.entries({defaultMaterialAmbient:native.ambient,defaultMaterialSpecular:native.specular})){
  const input=root.querySelector<HTMLInputElement>(`[name=${name}]`)!
  expect(Number(input.min)).toBe(range.min);expect(Number(input.max)).toBe(range.max);expect(Number(input.step)).toBe(range.step)
  input.value=String(native.changed[name as keyof typeof native.changed]);input.dispatchEvent(new Event('change'));await Promise.resolve()
 }
 expect(s.defaultMaterialAmbient).toBe(native.changed.defaultMaterialAmbient);expect(s.defaultMaterialSpecular).toBe(native.changed.defaultMaterialSpecular)
 root.querySelector<HTMLButtonElement>('.material-reset')!.click();await Promise.resolve()
 expect(s.defaultMaterialAmbient).toBe(native.reset.defaultMaterialAmbient);expect(s.defaultMaterialSpecular).toBe(native.reset.defaultMaterialSpecular)
 controls.busy(true);expect(root.querySelector<HTMLInputElement>('[name=defaultMaterialAmbient]')!.disabled).toBe(true)
 abort.abort();root.querySelector('.material-reset')!.dispatchEvent(new Event('click'));expect(change).toHaveBeenCalledTimes(3)
})

import {supportsDomeLightTextures} from '../src/display-settings'
it('forwards native dome camera visibility only when the renderer supports it',()=>{
 const d={setDisplayPurposes(){},setClearColor(){},setCameraLightEnabled(){},setSceneLightsEnabled(){},setSceneMaterialsEnabled(){},setBackfaceCullingEnabled(){},setDefaultMaterial(){},getRenderSetting:vi.fn(()=>true),setRenderSetting:vi.fn()}
 expect(supportsDomeLightTextures(d)).toBe(true)
 applyDisplayLighting(d,{...defaultDisplaySettings(),domeLightTexturesVisible:false})
 expect(d.setRenderSetting).toHaveBeenCalledWith('domeLightCameraVisibility',false)
 expect(supportsDomeLightTextures({})).toBe(false)
})

it('retains native one-decimal manual material input instead of rejecting the whole edit',async()=>{
 const root=document.createElement('div').attachShadow({mode:'open'});root.innerHTML=materialMenu+materialDialog
 let settings=defaultDisplaySettings();const controls=new MaterialControls(root,()=>settings,async patch=>{settings=mergeDisplaySettings(settings,patch);controls.refresh()})
 controls.bind(new AbortController().signal);controls.busy(false)
 const input=root.querySelector<HTMLInputElement>('[name=defaultMaterialAmbient]')!
 for(const capture of native.typed){
  settings={...settings,defaultMaterialAmbient:.2};controls.refresh()
  input.value=capture.input;input.dispatchEvent(new Event('input'));input.dispatchEvent(new Event('change'));await Promise.resolve()
  expect(input.valueAsNumber).toBe(capture.value);expect(settings.defaultMaterialAmbient).toBe(capture.ambient)
 }
})

// @vitest-environment jsdom
// usdviewq/appController.py:3083-3177 (OpenUSD 26.11.1): Camera > Select Camera
// lists the first cameraListMaxLen (20) scene cameras, then a separator and
// More Cameras..., whose dialog lists every camera with a name search.
import {describe,it,expect,vi} from 'vitest'
import {CameraControls,cameraMenu,cameraDialog,cameraListMaxLen} from '../src/camera-controls'
import type {ViewerCameraState,ViewerRuntime} from '../src/contracts'

function setup(count:number,chosen:(path:string)=>void=()=>{}){
 const root=document.createElement('div').attachShadow({mode:'open'})
 root.innerHTML=cameraMenu+'<span class="camera-caption"></span>'+cameraDialog
 const state:ViewerCameraState={cameras:Array.from({length:count},(_,i)=>({path:`/World/Rig${i}/Cam${i}`,label:`Cam${i}`})),activeCameraPath:null,free:{fovDegrees:60,aspectRatio:null,nearOverride:null,farOverride:null},effectiveNear:1,effectiveFar:100}
 const runtime={getCameraState:()=>state,setActiveCamera:vi.fn((path:string|null)=>{state.activeCameraPath=path;return state})} as unknown as ViewerRuntime
 const controls=new CameraControls(root,()=>runtime,vi.fn(),chosen),abort=new AbortController()
 controls.bind(abort.signal);controls.refresh();controls.busy(false)
 const popup=root.querySelector<HTMLElement>('.camera-select')!,dialog=root.querySelector<HTMLDialogElement>('.camera-more-dialog')!
 const items=()=>[...root.querySelectorAll<HTMLButtonElement>('.camera-more-list>[data-camera-path]')]
 const search=root.querySelector<HTMLInputElement>('.camera-more-search')!
 return {root,runtime,state,controls,popup,dialog,items,search}
}
const rows=(popup:HTMLElement)=>[...popup.children].map(x=>x.tagName==='HR'?'---':x.textContent)

describe('Select Camera menu cap (appController.py:3092-3107)',()=>{
 it('caps the menu at 20 cameras, then a separator and More Cameras...',()=>{
  expect(cameraListMaxLen).toBe(20)
  const {popup}=setup(25)
  expect(rows(popup)).toEqual([...Array.from({length:20},(_,i)=>`Cam${i}`),'---','More Cameras...'])
  const first=popup.querySelector<HTMLButtonElement>('[data-camera-path]')!
  expect(first.title).toBe('/World/Rig0/Cam0')
  expect(first.getAttribute('role')).toBe('menuitemcheckbox')
  const more=popup.querySelector<HTMLButtonElement>('.camera-more')!
  expect(more.title).toBe('View All Cameras')
  expect(more.disabled).toBe(false)
 })
 it.each([1,19,20])('lists %i cameras without More Cameras...',count=>{
  const {popup}=setup(count)
  expect(rows(popup)).toEqual(Array.from({length:count},(_,i)=>`Cam${i}`))
  expect(popup.querySelector('.camera-more,hr')).toBeNull()
 })
 it('checks only the current camera',()=>{
  const {popup,state,controls}=setup(25)
  state.activeCameraPath='/World/Rig3/Cam3';controls.refresh()
  expect([...popup.querySelectorAll('[aria-checked=true]')].map(x=>x.textContent)).toEqual(['Cam3'])
 })
 it('disables More Cameras... with the rest of the menu while busy',()=>{
  const {popup,controls}=setup(25)
  controls.busy(true)
  expect(popup.querySelector<HTMLButtonElement>('.camera-more')!.disabled).toBe(true)
 })
})

describe('More Cameras dialog (appController.py:3110-3177)',()=>{
 it('lists all 25 cameras by name, with no current item and an empty search',()=>{
  const {popup,dialog,items,search}=setup(25)
  popup.querySelector<HTMLButtonElement>('.camera-more')!.click()
  expect(dialog.open).toBe(true)
  expect(dialog.getAttribute('aria-label')).toBe('Select Camera')
  expect(items().map(x=>x.textContent)).toEqual(Array.from({length:25},(_,i)=>`Cam${i}`))
  expect(items().map(x=>x.dataset.cameraPath)).toEqual(Array.from({length:25},(_,i)=>`/World/Rig${i}/Cam${i}`))
  expect(items().some(x=>x.getAttribute('aria-selected')==='true')).toBe(false)
  expect(search.value).toBe('');expect(search.placeholder).toBe('Search for camera by name')
 })
 it('choosing a camera selects it and keeps the dialog open until Ok',()=>{
  const {root,popup,dialog,items,runtime}=setup(25)
  popup.querySelector<HTMLButtonElement>('.camera-more')!.click()
  items()[23]!.click()
  expect(runtime.setActiveCamera).toHaveBeenCalledWith('/World/Rig23/Cam23')
  expect(items()[23]!.getAttribute('aria-selected')).toBe('true')
  expect(dialog.open).toBe(true)
  // currentItemChanged: choosing the current item again does nothing.
  items()[23]!.click();expect(runtime.setActiveCamera).toHaveBeenCalledTimes(1)
  // The menu's first 20 entries do not include it, so none is checked.
  expect(popup.querySelector('[aria-checked=true]')).toBeNull()
  items()[2]!.click()
  expect(runtime.setActiveCamera).toHaveBeenLastCalledWith('/World/Rig2/Cam2')
  expect(popup.querySelector('[aria-checked=true]')!.textContent).toBe('Cam2')
  root.querySelector<HTMLButtonElement>('.camera-more-ok')!.click()
  expect(dialog.open).toBe(false)
 })
 it('filters by case-insensitive name and finishing the search selects the first shown camera',()=>{
  const {popup,items,search,runtime}=setup(25)
  popup.querySelector<HTMLButtonElement>('.camera-more')!.click()
  search.value='cAm2';search.dispatchEvent(new Event('input'))
  expect(items().filter(x=>!x.hidden).map(x=>x.textContent)).toEqual(['Cam2','Cam20','Cam21','Cam22','Cam23','Cam24'])
  search.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}))
  expect(runtime.setActiveCamera).toHaveBeenCalledWith('/World/Rig2/Cam2')
  search.value='';search.dispatchEvent(new Event('input'))
  expect(items().every(x=>!x.hidden)).toBe(true)
 })
 it('reopening recreates the dialog without the previous search or current item',()=>{
  const {root,popup,items,search}=setup(25)
  popup.querySelector<HTMLButtonElement>('.camera-more')!.click()
  search.value='Cam1';search.dispatchEvent(new Event('input'));items()[1]!.click()
  root.querySelector<HTMLButtonElement>('.camera-more-ok')!.click()
  popup.querySelector<HTMLButtonElement>('.camera-more')!.click()
  expect(search.value).toBe('')
  expect(items().every(x=>!x.hidden&&x.getAttribute('aria-selected')==='false')).toBe(true)
 })
})

describe('a chosen camera is reported (for cameraLoadFrame, a web addition)',()=>{
 it('reports the camera picked from the menu or the More Cameras dialog',()=>{
  const chosen=vi.fn(),{popup,items}=setup(25,chosen)
  popup.querySelector<HTMLButtonElement>('[data-camera-path="/World/Rig2/Cam2"]')!.click()
  expect(chosen).toHaveBeenLastCalledWith('/World/Rig2/Cam2')
  popup.querySelector<HTMLButtonElement>('.camera-more')!.click()
  items()[22]!.click()
  expect(chosen).toHaveBeenLastCalledWith('/World/Rig22/Cam22')
 })
})

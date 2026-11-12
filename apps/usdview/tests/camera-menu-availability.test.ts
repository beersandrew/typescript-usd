// @vitest-environment jsdom
import {it,expect,vi} from 'vitest'
import {CameraControls,cameraMenu,cameraDialog} from '../src/camera-controls'
import type {ViewerCameraState,ViewerRuntime} from '../src/contracts'
import native from './fixtures/camera-menu/expected.json'
it('keeps Select Camera disabled without native scene cameras, including after busy transitions',()=>{
 const root=document.createElement('div').attachShadow({mode:'open'});root.innerHTML=cameraMenu+cameraDialog+'<span class="camera-caption"></span>'
 let state:ViewerCameraState={cameras:[],activeCameraPath:null,free:{fovDegrees:60,aspectRatio:null,nearOverride:null,farOverride:null},effectiveNear:1,effectiveFar:2000000}
 const runtime={getCameraState:()=>state,setActiveCamera:vi.fn()} as unknown as ViewerRuntime
 const controls=new CameraControls(root,()=>runtime,vi.fn()),select=root.querySelector<HTMLElement>('.camera-choice')!
 for(const row of [...native.rows].reverse()){
  state={...state,cameras:Array.from({length:row.cameraCount},(_,i)=>({path:`/Camera${i}`,label:`Camera${i}`}))}
  controls.refresh(state);controls.busy(false);expect(select.getAttribute('aria-disabled')).toBe(String(!row.enabled))
  controls.busy(true);controls.refresh(state);expect(select.getAttribute('aria-disabled')).toBe('true')
  controls.busy(false);expect(select.getAttribute('aria-disabled')).toBe(String(!row.enabled))
 }
})

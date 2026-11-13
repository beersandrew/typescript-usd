// @vitest-environment jsdom
import { describe,it,expect,vi } from 'vitest'
import { CameraControls,cameraMenu,cameraDialog } from '../src/camera-controls'
import type { ViewerRuntime,ViewerCameraState } from '../src/contracts'
function setup(){
 const host=document.createElement('div'),root=host.attachShadow({mode:'open'})
 root.innerHTML=cameraMenu+'<span class="camera-caption"></span>'+cameraDialog
 const state:ViewerCameraState={cameras:[{path:'/World/Camera',label:'Camera'}],activeCameraPath:null,free:{fovDegrees:60,aspectRatio:null,nearOverride:null,farOverride:null},effectiveNear:.1,effectiveFar:100}
 const runtime={getCameraState:()=>state,setCameraSettings:vi.fn(patch=>{Object.assign(state.free,patch);return state}),setActiveCamera:vi.fn(path=>{state.activeCameraPath=path;return state}),resetCamera:vi.fn(()=>state)} as unknown as ViewerRuntime
 const error=vi.fn(),controls=new CameraControls(root,()=>runtime,error),abort=new AbortController()
 controls.bind(abort.signal);controls.refresh();controls.busy(false)
 return{root,runtime,state,controls,error,abort}
}
describe('camera control wiring',()=>{
 it('selects authored cameras and applies free settings through the runtime',()=>{
  const {root,runtime}=setup()
  root.querySelector<HTMLButtonElement>('[data-camera-path="/World/Camera"]')!.click()
  expect(runtime.setActiveCamera).toHaveBeenCalledWith('/World/Camera')
  const fov=root.querySelector<HTMLInputElement>('[name=fov]')!;fov.value='45'
  root.querySelector('form')!.dispatchEvent(new Event('submit',{cancelable:true}))
  expect(runtime.setCameraSettings).toHaveBeenCalledWith({fovDegrees:45,aspectRatio:null,nearOverride:null,farOverride:null})
 })
 it('keeps errors in the dialog and prevents settings during pending work',()=>{
  const {root,runtime,controls,error}=setup()
  vi.mocked(runtime.setCameraSettings!).mockImplementation(()=>{throw new Error('Clipping requires 0 < near < far.')})
  root.querySelector('form')!.dispatchEvent(new Event('submit',{cancelable:true}))
  expect(root.querySelector('.camera-error')!.textContent).toContain('near < far')
  expect(error).not.toHaveBeenCalled()
  controls.busy(true)
  root.querySelector('form')!.dispatchEvent(new Event('submit',{cancelable:true}))
  expect(runtime.setCameraSettings).toHaveBeenCalledTimes(1)
  expect(root.querySelector('.camera-choice')!.getAttribute('aria-disabled')).toBe('true')
 })
 it('removes listeners on disconnection',()=>{
  const {root,runtime,abort}=setup();abort.abort()
  root.querySelector('.camera-reset')!.dispatchEvent(new Event('click'))
  expect(runtime.resetCamera).not.toHaveBeenCalled()
 })
})

it('wires camera guides, masking, reticle colors and framed-view swap through runtime',()=>{
 const {root,runtime,state,controls}=setup()
 runtime.setCameraPresentation=vi.fn(patch=>{state.presentation={cameraOracles:false,cameraMaskMode:'none',cameraMaskOutline:false,cameraMaskColor:[.1,.1,.1,1],cameraReticlesInside:false,cameraReticlesOutside:false,cameraReticlesColor:[0,.7,1,1],...state.presentation,...patch};return state})
 runtime.toggleFramedView=vi.fn(()=>state);controls.busy(false)
 const outline=root.querySelector<HTMLInputElement>('[data-camera-presentation=cameraMaskOutline]')!;outline.checked=true;outline.dispatchEvent(new Event('change'))
 expect(runtime.setCameraPresentation).toHaveBeenLastCalledWith({cameraMaskOutline:true})
 const partial=root.querySelector<HTMLInputElement>('[value=partial]')!;partial.checked=true;partial.dispatchEvent(new Event('change'))
 expect(runtime.setCameraPresentation).toHaveBeenLastCalledWith({cameraMaskMode:'partial'})
 const color=root.querySelector<HTMLInputElement>('[data-camera-presentation=cameraReticlesColor]')!;color.value='#ff0080';color.dispatchEvent(new Event('change'))
 expect(runtime.setCameraPresentation).toHaveBeenLastCalledWith({cameraReticlesColor:[1,0,128/255,1]})
 root.querySelector<HTMLButtonElement>('.toggle-framed-view')!.click();expect(runtime.toggleFramedView).toHaveBeenCalledOnce()
 controls.busy(true);root.querySelector<HTMLInputElement>('[value=full]')!.dispatchEvent(new Event('change'));expect(runtime.setCameraPresentation).toHaveBeenCalledTimes(3)
})

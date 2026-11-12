// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usdImaging/usdviewq/appController.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import {defaultCameraPresentation,type CameraPresentationSettings} from './camera-presentation'
import type { ViewerCameraState, ViewerRuntime } from './contracts'

/** appController.py:2930-2935 _saveViewerImage: "<file prefix>_<camera name>_<frame:04d>.png",
 * where the prefix is the stage file without its extension, or "new_file". */
export function viewerImageFilename(source: string, cameraPath: string | null, frame: number): string {
  const file = source.split(/[?#]/)[0]!.split('/').pop() ?? ''
  const prefix = file ? (file.includes('.') ? file.slice(0, file.lastIndexOf('.')) : file) : 'new_file'
  const whole = Math.trunc(frame), digits = String(Math.abs(whole)).padStart(whole < 0 ? 3 : 4, '0')
  return `${prefix}_${cameraPath ? `${cameraPath.slice(cameraPath.lastIndexOf('/') + 1)}_` : ''}${whole < 0 ? '-' : ''}${digits}.png`
}

export const cameraMenu = `<details class="menu camera-menu"><summary>Camera</summary><div class="menu-popup">
<details class="submenu"><summary>Camera Guides</summary><div class="menu-popup submenu-popup"><label><input type="checkbox" data-camera-presentation="cameraMaskOutline" disabled> Camera Frame</label><label><input type="checkbox" data-camera-presentation="cameraOracles" disabled> Camera Oracles</label></div></details>
<details class="submenu"><summary>Camera Masking</summary><div class="menu-popup submenu-popup">${(['full','partial','none'] as const).map(value=>`<label><input type="radio" name="cameraMaskMode" data-camera-presentation="cameraMaskMode" value="${value}" disabled> ${({full:'Full Mask',partial:'Partial Mask',none:'No Mask'})[value]}</label>`).join('')}<hr><button type="button" data-camera-color="cameraMaskColor" disabled>Select Color...</button><input type="color" data-camera-presentation="cameraMaskColor" aria-label="Camera mask color" hidden disabled></div></details>
<details class="submenu"><summary>Camera Reticles</summary><div class="menu-popup submenu-popup"><label><input type="checkbox" data-camera-presentation="cameraReticlesInside" disabled> Camera Reticles Inside</label><label><input type="checkbox" data-camera-presentation="cameraReticlesOutside" disabled> Camera Reticles Outside</label><hr><button type="button" data-camera-color="cameraReticlesColor" disabled>Select Color...</button><input type="color" data-camera-presentation="cameraReticlesColor" aria-label="Camera reticles color" hidden disabled></div></details>
<details class="submenu camera-choice" aria-disabled="true"><summary role="menuitem" aria-disabled="true">Select Camera</summary><div class="menu-popup submenu-popup camera-select" role="menu"></div></details>
<hr><button class="frame" type="button" disabled>Frame Selected <kbd>F</kbd></button>
<button class="toggle-framed-view" type="button" disabled>Toggle Framed View <kbd>J</kbd></button>
<button class="camera-reset" type="button" disabled>Reset View</button>
<hr><button class="copy-viewer-image" type="button" disabled>Copy Viewer Image</button>
<button class="save-viewer-image" type="button" disabled>Save Viewer Image...</button><hr>
<label title="Full automatic clipping is not implemented; use Free Camera Settings for near/far overrides."><input type="checkbox" disabled> Auto Compute Clipping Planes<kbd>C</kbd></label><button class="camera-settings" type="button" disabled>Free Camera Settings...</button>
</div></details>`
export const cameraDialog = `<style>
.camera-dialog{background:#383838;color:#ddd;border:1px solid #888;padding:20px;min-width:320px;box-shadow:0 8px 30px #0008}
.camera-dialog::backdrop{background:#0005}.camera-dialog h2{font-size:16px;margin-top:0}.camera-dialog label,.camera-setting-row{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:12px 0}.camera-setting-row label{margin:0}.camera-dialog input[type=number]{width:105px}.camera-dialog footer{display:flex;gap:10px;justify-content:flex-end;margin-top:20px}.camera-error{color:#ffbd9c;max-width:350px}.camera-dialog p{font-size:12px;max-width:350px}.camera-select{max-width:280px}
</style><dialog class="camera-dialog" aria-label="Free Camera Settings"><form class="camera-form">
<h2>Free Camera Settings</h2><p>Changes affect the free camera only. Scene cameras remain read-only.</p>
<label>Vertical field of view (degrees) <input name="fov" type="number" min="0.01" max="179.99" step="any" required></label>
<div class="camera-setting-row"><label><input name="lockAspect" type="checkbox"> Lock aspect ratio</label><input name="aspect" aria-label="Camera aspect ratio" type="number" min="0.001" step="any" required></div>
<div class="camera-setting-row"><label><input name="overrideNear" type="checkbox"> Override near clipping</label><input name="near" aria-label="Camera near clipping" type="number" min="0.000001" step="any" required></div>
<div class="camera-setting-row"><label><input name="overrideFar" type="checkbox"> Override far clipping</label><input name="far" aria-label="Camera far clipping" type="number" min="0.000001" step="any" required></div>
<p class="camera-error" role="alert"></p><footer><button class="camera-close" type="button">Close</button><button class="camera-apply" type="submit">Apply</button></footer>
</form></dialog>`
export class CameraControls {
  #hasSceneCameras=false
  #busy=false
  constructor(private root: ShadowRoot,private runtime:()=>ViewerRuntime|undefined,private error:(error:unknown)=>void) {}
  private get<T extends Element>(selector:string):T{return this.root.querySelector<T>(selector)!}
  bind(signal:AbortSignal) {
    const options={signal}, dialog=this.get<HTMLDialogElement>('.camera-dialog'),form=this.get<HTMLFormElement>('.camera-form')
    const close=()=>{ if(dialog.close)dialog.close();else dialog.removeAttribute('open') }
    this.get('.camera-close').addEventListener('click',close,options)
    this.get('.camera-select').addEventListener('click',event=>{
      const button=(event.target as Element).closest<HTMLButtonElement>('[data-camera-path]')
      if(!button||button.disabled)return
      try{this.refresh(this.runtime()?.setActiveCamera?.(button.dataset.cameraPath||null));for(const menu of this.root.querySelectorAll<HTMLDetailsElement>('details.menu,details.submenu'))menu.open=false}catch(error){this.refresh();this.error(error)}
    },options)
    this.get('.camera-choice>summary').addEventListener('click',event=>{if(this.#busy||!this.#hasSceneCameras)event.preventDefault()},options)
    for(const button of this.root.querySelectorAll<HTMLButtonElement>('[data-camera-color]'))button.addEventListener('click',()=>this.get<HTMLInputElement>(`[data-camera-presentation="${button.dataset.cameraColor}"]`).click(),options)
    this.get('.toggle-framed-view').addEventListener('click',()=>{try{this.refresh(this.runtime()?.toggleFramedView?.())}catch(error){this.error(error)}},options)
    for(const input of this.root.querySelectorAll<HTMLInputElement>('[data-camera-presentation]'))input.addEventListener('change',()=>{
      if(input.disabled)return
      const key=input.dataset.cameraPresentation as keyof CameraPresentationSettings
      let value:unknown=input.type==='checkbox'?input.checked:input.value
      if(input.type==='color')value=[1,3,5].map(offset=>parseInt(input.value.slice(offset,offset+2),16)/255).concat((this.runtime()?.getCameraState?.().presentation??defaultCameraPresentation())[key as 'cameraMaskColor'|'cameraReticlesColor'][3])
      try{this.refresh(this.runtime()?.setCameraPresentation?.({[key]:value}))}catch(error){this.refresh();this.error(error)}
    },options)
    this.get('.camera-reset').addEventListener('click',()=>{try{this.refresh(this.runtime()?.resetCamera?.())}catch(error){this.error(error)}},options)
    this.get('.camera-settings').addEventListener('click',()=>{
      this.refresh();this.get('.camera-error').textContent=''
      if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','')
    },options)
    const enabled=()=>{
      for(const [check,name] of [['lockAspect','aspect'],['overrideNear','near'],['overrideFar','far']]) this.input(name!).disabled=!this.input(check!).checked
    }
    form.addEventListener('change',enabled,options)
    form.addEventListener('submit',event=>{
      event.preventDefault()
      if(this.get<HTMLButtonElement>('.camera-apply').disabled)return
      try {
        const state=this.runtime()?.setCameraSettings?.({fovDegrees:this.input('fov').valueAsNumber,aspectRatio:this.input('lockAspect').checked?this.input('aspect').valueAsNumber:null,nearOverride:this.input('overrideNear').checked?this.input('near').valueAsNumber:null,farOverride:this.input('overrideFar').checked?this.input('far').valueAsNumber:null})
        this.refresh(state);this.get('.camera-error').textContent=''
      } catch(error){this.get('.camera-error').textContent=error instanceof Error?error.message:String(error)}
    },options)
  }
  private input(name:string){return this.get<HTMLInputElement>(`.camera-form input[name="${name}"]`)}
  refresh(state=this.runtime()?.getCameraState?.()) {
    if(!state)return
    const presentation=state.presentation??defaultCameraPresentation()
    for(const input of this.root.querySelectorAll<HTMLInputElement>('[data-camera-presentation]')){
      const value=presentation[input.dataset.cameraPresentation as keyof CameraPresentationSettings]
      if(input.type==='checkbox')input.checked=Boolean(value)
      else if(input.type==='radio')input.checked=input.value===value
      else input.value='#'+(value as number[]).slice(0,3).map(v=>Math.round(v*255).toString(16).padStart(2,'0')).join('')
    }
    this.#hasSceneCameras=state.cameras.length>0
    const select=this.get<HTMLElement>('.camera-select');select.replaceChildren()
    if(this.#hasSceneCameras)for(const camera of [{label:'Free Camera',path:''},...state.cameras]){
      const button=document.createElement('button');button.type='button';button.dataset.cameraPath=camera.path;button.textContent=camera.label;button.setAttribute('role','menuitemradio');button.setAttribute('aria-checked',String(camera.path===(state.activeCameraPath??'')));button.disabled=this.#busy||!this.runtime()?.setActiveCamera;select.append(button)
    }
    this.cameraAvailability()
    this.get('.camera-caption').textContent=state.activeCameraPath?.split('/').pop()??'Free'
    this.input('fov').value=String(state.free.fovDegrees)
    this.input('lockAspect').checked=state.free.aspectRatio!==null
    this.input('aspect').value=String(state.free.aspectRatio??1.5)
    this.input('overrideNear').checked=state.free.nearOverride!==null
    this.input('near').value=String(state.free.nearOverride??state.effectiveNear)
    this.input('overrideFar').checked=state.free.farOverride!==null
    this.input('far').value=String(state.free.farOverride??state.effectiveFar)
    for(const [check,name] of [['lockAspect','aspect'],['overrideNear','near'],['overrideFar','far']])this.input(name!).disabled=!this.input(check!).checked
  }
  private cameraAvailability(){
    const disabled=this.#busy||!this.runtime()?.setActiveCamera||!this.#hasSceneCameras
    this.get('.camera-choice').setAttribute('aria-disabled',String(disabled));this.get('.camera-choice>summary').setAttribute('aria-disabled',String(disabled));this.get('.camera-choice>summary').setAttribute('tabindex',disabled?'-1':'0');if(disabled)this.get<HTMLDetailsElement>('.camera-choice').open=false
    for(const button of this.root.querySelectorAll<HTMLButtonElement>('[data-camera-path]'))button.disabled=disabled
  }
  busy(value:boolean){
    this.#busy=value
    const runtime=this.runtime()
    this.get<HTMLButtonElement>('.toggle-framed-view').disabled=value||!runtime?.toggleFramedView
    for(const control of this.root.querySelectorAll<HTMLInputElement>('[data-camera-presentation]'))control.disabled=value||!runtime?.setCameraPresentation
    this.cameraAvailability()
    for(const button of this.root.querySelectorAll<HTMLButtonElement>('[data-camera-color]'))button.disabled=value||!runtime?.setCameraPresentation
    this.get<HTMLButtonElement>('.camera-reset').disabled=value||!runtime?.resetCamera
    this.get<HTMLButtonElement>('.camera-settings').disabled=value||!runtime?.setCameraSettings
    for(const selector of ['.copy-viewer-image','.save-viewer-image'])this.get<HTMLButtonElement>(selector).disabled=value||!runtime?.captureViewerImage
    this.get<HTMLButtonElement>('.camera-apply').disabled=value||!runtime?.setCameraSettings
  }
}

// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usdImaging/usdviewq/adjustDefaultMaterial.py,
//  pxr/usdImaging/usdviewq/adjustDefaultMaterialUI.ui
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import {defaultDisplaySettings,type DisplaySettings} from './display-settings'
/** usdviewq/adjustDefaultMaterial.py:11-68: immediate edits, Reset and Done. */
export const materialMenu=`<label><input type="checkbox" data-display="enableSceneMaterials" disabled> Enable Scene Materials</label><button class="material-settings" type="button" disabled>Default Material Settings...</button>`
export const materialDialog=`<style>.material-dialog{background:#383838;color:#ddd;border:1px solid #888;padding:20px;box-shadow:0 8px 30px #0008}.material-dialog::backdrop{background:#0005}.material-dialog h2{font-size:16px;margin-top:0}.material-dialog label{display:flex;justify-content:space-between;gap:20px;margin:12px 0}.material-dialog input{width:90px}.material-dialog footer{display:flex;justify-content:flex-end;gap:10px;margin-top:16px}</style><dialog class="material-dialog" aria-label="Adjust Default Material"><h2>Adjust Default Material</h2><label>Ambient Intensity <input type="number" name="defaultMaterialAmbient" min="0" max="1" step="0.1" required></label><label>Specular Intensity <input type="number" name="defaultMaterialSpecular" min="0" max="1" step="0.1" required></label><footer><button class="material-reset" type="button">Reset</button><button class="material-done" type="button">Done</button></footer></dialog>`
export class MaterialControls {
 constructor(private root:ShadowRoot,private settings:()=>DisplaySettings,private change:(patch:Partial<DisplaySettings>)=>Promise<void>){}
 private get<T extends Element>(selector:string):T{return this.root.querySelector<T>(selector)!}
 bind(signal:AbortSignal){
  const options={signal},dialog=this.get<HTMLDialogElement>('.material-dialog')
  this.get('.material-settings').addEventListener('click',()=>{this.refresh();if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','')},options)
  this.get('.material-done').addEventListener('click',()=>{if(dialog.close)dialog.close();else dialog.removeAttribute('open')},options)
  this.get('.material-reset').addEventListener('click',()=>{const d=defaultDisplaySettings();void this.change({defaultMaterialAmbient:d.defaultMaterialAmbient,defaultMaterialSpecular:d.defaultMaterialSpecular})},options)
  for(const input of this.root.querySelectorAll<HTMLInputElement>('.material-dialog input')){
   // adjustDefaultMaterialUI.ui:60-67,113-120: QDoubleSpinBox decimals=1
   // rejects additional typed fractional digits; singleStep only sets arrows.
   input.addEventListener('input',()=>{const precision=input.value.match(/^(\d*\.\d)\d+$/);if(precision)input.value=precision[1]!},options)
   input.addEventListener('change',()=>{
   if(input.disabled||!input.checkValidity()){this.refresh();return}
   void this.change({[input.name]:input.valueAsNumber})
   },options)
  }
 }
 refresh(){const settings=this.settings();for(const name of ['defaultMaterialAmbient','defaultMaterialSpecular'] as const)this.get<HTMLInputElement>(`[name="${name}"]`).value=String(settings[name])}
 busy(value:boolean){for(const control of this.root.querySelectorAll<HTMLInputElement|HTMLButtonElement>('.material-settings,.material-dialog input,.material-reset'))control.disabled=value;this.refresh()}
}

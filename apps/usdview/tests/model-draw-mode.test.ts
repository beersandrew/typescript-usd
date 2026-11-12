// @vitest-environment jsdom
// Native data/DOM/session behavior; this does not exercise GPU rendering.
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {describe,it,expect,vi} from 'vitest'
import {defineUsdViewer,UsdViewerElement} from '../src/usd-viewer'
import type {ViewerRuntime} from '../src/contracts'
import column from './fixtures/usdviewDrawMode/column.json'
import {Stage} from 'typescript-usd/usd'
import {Layer} from 'typescript-usd/sdf'
import {CompositionReview} from '../src/composition-review'
import {primTree} from '../src/prim-tree'
import {modelDrawModeState,editableDrawModes} from '../src/model-draw-mode'
import {renderPrimTree} from '../src/prim-tree-view'
import native from './fixtures/usdviewDrawMode/expected.json'
async function open(){return Stage.open(Layer.createInMemory('draw-mode.usda',readFileSync(resolve('tests/fixtures/usdviewDrawMode/scene.usda'),'utf8')))}
describe('native draw-mode column/editor',()=>{
 it('opens the enabled hidden-by-default column without selecting and preserves the session editor',async()=>{
  defineUsdViewer();vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}})
  const stage=await open(),review=new CompositionReview(stage,()=>0),viewer=document.createElement('usd-viewer') as UsdViewerElement
  const snapshot=()=>primTree(stage,0).children,selection={path:null,properties:[]}
  const runtime:ViewerRuntime={open:async()=>snapshot(),select:vi.fn(()=>selection),resize(){},frameSelection(){},dispose(){},getCompositionState:path=>review.state(path),getEditState:path=>review.editState(path),applyCompositionCommand:async command=>{await review.apply(command,async()=>{});return {tree:snapshot(),selection}}}
  viewer.runtimeFactory=async()=>runtime;viewer.src='draw-mode.usda';document.body.append(viewer)
  const tick=async()=>{for(let i=0;i<20;i++)await Promise.resolve()}
  try{
   await tick();const root=viewer.shadowRoot!,toggle=root.querySelector<HTMLInputElement>('[data-tree-column="4"]')!
   expect(toggle.disabled).toBe(false);expect(toggle.checked).toBe(!column.hiddenByDefault);toggle.click()
   const before=vi.mocked(runtime.select).mock.calls.length
   const stable=root.querySelector<HTMLSelectElement>('[data-draw-mode-select="/World/Group/Model"]')!
   stable.dispatchEvent(new Event('pointerdown',{bubbles:true}))
   expect(root.querySelector('[data-draw-mode-select="/World/Group/Model"]')).toBe(stable)
   expect(stable.closest('.draw-mode-editor')?.hasAttribute('data-editor-active')).toBe(true)
   expect(vi.mocked(runtime.select).mock.calls.length).toBe(before)
   let select=root.querySelector<HTMLSelectElement>('[data-draw-mode-select="/World/Group/Model"]')!
   expect(select.value).toBe(native.before.computed)
   select.value='cards';select.dispatchEvent(new Event('change',{bubbles:true}));await tick()
   select=root.querySelector<HTMLSelectElement>('[data-draw-mode-select="/World/Group/Model"]')!
   expect(select.value).toBe(native.after.computed)
   expect(root.querySelector<HTMLElement>('[data-draw-mode-clear="/World/Group/Model"]')!.style.visibility).toBe('visible')
   root.querySelector<HTMLButtonElement>('[data-draw-mode-clear="/World/Group/Model"]')!.click();await tick()
   expect(root.querySelector('[data-draw-mode-select="/World/Group/Model"]')?.closest('.draw-mode-editor')?.hasAttribute('data-editor-active')).toBe(false)
   expect(root.querySelector('[data-draw-mode="/World/Group/Model"]')?.textContent).toBe(native.cleared.computed)
  }finally{viewer.remove();stage.dispose();vi.unstubAllGlobals()}
 })
 it('matches native eligibility, computed values, authored inheritance styling and editor choices',async()=>{
  const stage=await open()
  try{
   expect([...editableDrawModes]).toEqual(native.choices)
   for(const row of native.rows){
    const state=modelDrawModeState(stage,stage.getPrim(row.path)!)
    expect(!!state,row.path).toBe(row.supports)
    if(state){expect(state.value).toBe(row.computed);expect(state.inherited).toBe(row.inherited)}
   }
   const host=document.createElement('div');renderPrimTree(host,primTree(stage,0),new Set(['/','/World','/World/Group']),true,new Set(['/World/Group/Model']))
   expect(host.querySelector('[data-draw-mode="/World/Group/Model"]')?.textContent).toBe(native.before.computed)
   expect(host.querySelector('[data-draw-mode="/World/Group/Model"]')?.hasAttribute('data-inherited')).toBe(true)
   expect([...host.querySelectorAll('[data-draw-mode-select="/World/Group/Model"] option')].map(x=>x.textContent)).toEqual(native.choices)
   expect(host.querySelector('.draw-mode-clear')?.getAttribute('style')).toContain('hidden')
   expect(host.querySelector('button.prim select')).toBeNull()
  }finally{stage.dispose()}
 })
 it('keeps same-value selection unauthored and edits/clears only the session default',async()=>{
  const stage=await open(),root=stage.getRootLayer().exportToString(),review=new CompositionReview(stage,()=>0),path='/World/Group/Model'
  const target=stage.getEditTarget()
  try{
   await review.apply({kind:'drawMode',path,value:'bounds'},async()=>{})
   expect(!!stage.getSessionLayer().getAttributeAtPath(path+'.model:drawMode')).toBe(native.sameValue.authored)
   await review.apply({kind:'drawMode',path,value:'cards'},async()=>{})
   expect(modelDrawModeState(stage,stage.getPrim(path)!)).toEqual({value:native.after.computed,inherited:false,sessionOverride:true})
   expect(stage.getSessionLayer().getAttributeAtPath(path+'.model:drawMode')?.getDefaultValue()).toBe(native.after.sessionValue)
   await review.apply({kind:'drawMode',path,value:null},async()=>{})
   expect(modelDrawModeState(stage,stage.getPrim(path)!)).toEqual({value:native.cleared.computed,inherited:true,sessionOverride:false})
   expect(stage.getRootLayer().exportToString()).toBe(root);expect(stage.getEditTarget()).toBe(target)
  }finally{stage.dispose()}
 })
 it('rolls back a draw-mode edit if the renderer rejects its rebuild',async()=>{
  const stage=await open(),review=new CompositionReview(stage,()=>0),before=stage.getSessionLayer().exportToString()
  try{
   await expect(review.apply({kind:'drawMode',path:'/World/Group/Model',value:'origin'},async()=>{throw new Error('rebuild failed')})).rejects.toThrow('rebuild failed')
   expect(stage.getSessionLayer().exportToString()).toBe(before)
  }finally{stage.dispose()}
 })
})

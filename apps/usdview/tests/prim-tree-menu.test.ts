// @vitest-environment jsdom
// DOM/controller checks; expected filters and Qt depths are actual pinned native captures.
import {beforeAll,afterAll,afterEach,it,expect,vi} from 'vitest'
import {resolve} from 'node:path'
import {Stage} from 'typescript-usd/usd'
import {primTree} from '../src/prim-tree'
import {PrimSelectionModel} from '../src/selection-model'
import {UsdViewerElement,defineUsdViewer} from '../src/usd-viewer'
import type {PrimSummary,RuntimeCallbacks,ViewerRuntime} from '../src/contracts'
import native from './fixtures/usdviewPrimTree/expected.json'
let stage:Stage
const tick=async()=>{for(let i=0;i<10;i++)await Promise.resolve()}
beforeAll(async()=>{
 defineUsdViewer();vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}})
 vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null)
 stage=(await Stage.open(resolve('tests/fixtures/usdviewPrimTree/stage.usda')))!
})
afterAll(()=>stage.dispose())
afterEach(()=>document.body.replaceChildren())
async function setup(tree=primTree(stage,0).children){
 const model=new PrimSelectionModel();let callbacks!:RuntimeCallbacks
 const detail=()=>{const state=model.snapshot();return {path:state.focusPath==='/'?null:state.focusPath,properties:[],selections:state.selections}}
 const runtime:ViewerRuntime={open:async()=>tree,select:(path,options)=>{model.update(path,options?.operation,options?.instanceIndex);return detail()},selectPrims:entries=>{model.replace(entries);return detail()},getPrimTree:options=>primTree(stage,0,options?.includePrototypes).children,frameSelection(){},resize(){},dispose(){}}
 const viewer=document.createElement('usd-viewer') as UsdViewerElement
 viewer.runtimeFactory=async(_canvas,cb)=>{callbacks=cb;return runtime};viewer.src='/fixture.usda';document.body.append(viewer);await tick()
 return {viewer,root:viewer.shadowRoot!,runtime,model,setSelection:(paths:string[])=>{model.replace(paths.map(path=>({path})));callbacks.selectionChanged(detail())}}
}
it('filters rows, switches display names, and keeps native selected-set cleanup separate from prefs restore',async()=>{
 const {viewer,root,model,setSelection}=await setup()
 const paths=()=>[...root.querySelectorAll<HTMLElement>('.prim')].map(row=>row.dataset.path)
 expect(paths()).toEqual(native.cases[0]!.rows.map(row=>row.path))
 expect(root.querySelector('[data-path="/World/Active"] .prim-name')!.textContent).toBe('Friendly prim')
 const changes=vi.fn();viewer.addEventListener('prim-tree-settings-changed',changes)
 const display=root.querySelector<HTMLButtonElement>('[data-prim-filter="showPrimDisplayNames"]')!
 display.click();expect(root.querySelector('[data-path="/World/Active"] .prim-name')!.textContent).toBe('Active')
 expect(display.getAttribute('aria-checked')).toBe('false');expect(changes).toHaveBeenCalledTimes(1)
 for(const row of native.removals){
  viewer.setPrimTreeSettings({[row.key]:!row.checked},{removeCategorySelections:false})
  setSelection(row.initial)
  root.querySelector<HTMLButtonElement>(`[data-prim-filter="${row.key}"]`)!.click()
  expect(model.snapshot().selections.map(entry=>entry.path)).toEqual(row.selected)
 }
 setSelection(['/World/Undefined','/World/Active'])
 viewer.setPrimTreeSettings({showUndefinedPrims:false},{removeCategorySelections:false})
 expect(model.snapshot().selections.map(entry=>entry.path)).toEqual(['/World/Undefined','/World/Active'])
 expect(root.querySelector('[data-path="/World/Undefined"]')).toBeNull()
 expect(root.querySelector<HTMLInputElement>('.current-path')!.value).toContain('/World/Undefined')
})
it('uses native level1–8, expand/collapse, and Alt depth shortcuts without changing selection',async()=>{
 const hierarchy:PrimSummary={path:'/',name:'root',typeName:'',children:[]};let parent=hierarchy
 for(let level=1;level<=10;level++){const node:PrimSummary={path:parent.path.replace(/\/$/,'')+'/L'+level,name:'L'+level,typeName:'Scope',children:[]};parent.children.push(node);parent=node}
 const {viewer,root,runtime,model}=await setup(hierarchy.children)
 runtime.getPrimTree=()=>hierarchy.children
 for(const row of native.depths){
  viewer.setPrimViewDepth(row.depth)
  expect([...root.querySelectorAll<HTMLElement>('.prim[aria-expanded="true"]')].map(row=>row.dataset.path)).toEqual(row.expanded)
  expect([...root.querySelectorAll<HTMLElement>('.prim')].filter(row=>!row.closest('ul[hidden]')).map(row=>row.dataset.path)).toEqual(row.visible)
 }
 root.querySelector<HTMLButtonElement>('[data-prim-depth="4"]')!.click()
 expect([...root.querySelectorAll<HTMLElement>('.prim[aria-expanded="true"]')].map(row=>row.dataset.path)).toEqual(native.depths.find(row=>row.depth===4)!.expanded)
 const event=new KeyboardEvent('keydown',{key:'8',code:'Digit8',altKey:true,bubbles:true,cancelable:true})
 document.dispatchEvent(event)
 expect(event.defaultPrevented).toBe(true)
 expect([...root.querySelectorAll<HTMLElement>('.prim[aria-expanded="true"]')].map(row=>row.dataset.path)).toEqual(native.depths.find(row=>row.depth===8)!.expanded)
 expect(model.snapshot().selections).toEqual([{path:'/'}])
})

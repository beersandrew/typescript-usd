// Native expectations are captured from the real usdview SelectionDataModel,
// AppController.onPrimSelected and QTreeWidget ExtendedSelection.
import {describe,it,expect,beforeAll,afterAll} from 'vitest'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {Stage} from 'typescript-usd/usd'
import {PrimSelectionModel,resolvePickSelection} from '../src/selection-model'
import type {PickMode} from '../src/contracts'
const native=JSON.parse(readFileSync(new URL('./fixtures/usdviewSelection/expected.json',import.meta.url),'utf8'))
function normalized(model:PrimSelectionModel){const state=model.snapshot();return {paths:state.selections.map(s=>s.path),focus:state.focusPath,lcd:state.lcdPaths,instances:Object.fromEntries(state.selections.map(s=>[s.path,s.instanceIndices??-1]))}}
describe('native ordered prim/instance selection',()=>{
 for(const [index,rows] of native.sequences.entries())it(`sequence ${index}`,()=>{
  const model=new PrimSelectionModel()
  for(const row of rows){if(row.action==='clear')model.replace([]);else if(row.action!=='initial')model.update(row.path,row.action==='set'?'replace':row.action,row.index<0?undefined:row.index);expect(normalized(model)).toEqual(row.state)}
 })
 it('keeps Qt range order, focus and Ctrl toggles',()=>{
  const model=new PrimSelectionModel()
  const visible=['/','/World','/World/A','/World/B','/World/C'];let anchor='/'
  for(const row of native.gestures){
   if(row.modifier==='shift'){const a=visible.indexOf(anchor),b=visible.indexOf(row.path);model.range(visible.slice(Math.min(a,b),Math.max(a,b)+1))}
   else {anchor=row.path;model.update(row.path,row.modifier==='ctrl'?'toggle':'replace')}
   expect(normalized(model)).toEqual(row.state)
  }
 })
})
let stage:Stage
beforeAll(async()=>{stage=(await Stage.open(fileURLToPath(new URL('./fixtures/usdviewSelection/stage.usda',import.meta.url))))!})
afterAll(()=>stage.dispose())
describe('native viewport pick modes',()=>{
 const modes:Record<string,PickMode>={'Select Prims':'prims','Select Models':'models','Select Instances':'instances','Select Prototypes':'prototypes'}
 for(const row of native.picks)it(`${row.mode}: ${row.path}`,()=>{
  const entry=resolvePickSelection(stage,row.path,row.index,row.top,row.topIndex,modes[row.mode]!)
  expect(normalized(new PrimSelectionModel([entry]))).toEqual(row.state)
 })
})

import {defaultDisplaySettings} from '../src/display-settings'
import {computeSelectionBounds} from '../src/review-bounds'
import {CompositionReview} from '../src/composition-review'
it('unions native LCD selection bounds and ignores selected instance indices',()=>{
 for(const row of native.bounds){
  const bound=computeSelectionBounds(stage,0,row.paths.map((path:string)=>({path})),defaultDisplaySettings()).ComputeAlignedRange()
  expect([Array.from(bound.getMin().data),Array.from(bound.getMax().data)]).toEqual(row.range)
 }
})
it('authors selected-set session visibility once and rolls back the whole edit',async()=>{
 const review=new CompositionReview(stage,()=>undefined)
 const actions:Record<string,'hide'|'show'|'isolate'|'remove'>={invisSelectedPrims:'hide',visSelectedPrims:'show',visOnlySelectedPrims:'isolate',removeVisSelectedPrims:'remove'}
 try{
  for(const row of native.edits){
   const action=actions[row.method]
   await review.apply({kind:'batch',commands:['/World/A','/World/B'].map(path=>action==='remove'?{kind:'removeVisibility',path}:{kind:'visibility',path,action:action!})},async()=>{})
   expect(Object.fromEntries(Object.keys(row.visibility).map(path=>[path,review.state(path).visibility]))).toEqual(row.visibility)
  }
  const before=stage.getSessionLayer().exportToString()
  await expect(review.apply({kind:'batch',commands:['/World/A','/World/B'].map(path=>({kind:'visibility',path,action:'hide'}))},async()=>{throw new Error('candidate rejected')})).rejects.toThrow('candidate rejected')
  expect(stage.getSessionLayer().exportToString()).toBe(before)
 }finally{await review.apply({kind:'resetVisibility'},async()=>{})}
})

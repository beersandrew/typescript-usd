import {readFile} from 'node:fs/promises'
import {it,expect} from 'vitest'
import {Stage} from 'typescript-usd/usd'
import {Layer} from 'typescript-usd/sdf'
import {reviewBounds,computeSelectionBounds} from '../src/review-bounds'
import {defaultDisplaySettings,displayPurposes,applyDisplayLighting} from '../src/display-settings'
import expected from './fixtures/reviewBounds/expected.json'

it('uses native usdview defaults and Hydra purpose tokens',()=>{
 const settings=defaultDisplaySettings()
 expect(Object.fromEntries(Object.keys(expected.defaults).map(key=>[key,settings[key as keyof typeof settings]]))).toEqual(expected.defaults)
 expect(displayPurposes(settings)).toEqual(['default','proxy'])
 let purposes:readonly string[]=[]
 applyDisplayLighting({setDisplayPurposes:p=>{purposes=p},setClearColor(){},setCameraLightEnabled(){},setSceneLightsEnabled(){},setSceneMaterialsEnabled(){},setBackfaceCullingEnabled(){},setDefaultMaterial(){}},settings)
 expect(purposes).toEqual(['proxy'])
})
it('matches native oriented/aligned bounds for rotation, visibility and all purposes',async()=>{
 const stage=await Stage.open(Layer.createInMemory('reviewBounds.usda',await readFile(new URL('./fixtures/reviewBounds/scene.usda',import.meta.url),'utf8')))
 for(const sample of expected.cases) for(const kind of ['oriented','aligned'] as const){
  const settings={...defaultDisplaySettings(),displayProxy:sample.purposes.includes('proxy'),displayRender:sample.purposes.includes('render'),displayGuide:sample.purposes.includes('guide'),showAABBox:kind==='aligned',showOBBox:kind==='oriented'}
  const vertices=reviewBounds(stage,0,sample.path,undefined,settings)
  const wanted=sample[kind]
  expect(vertices.length,`${sample.path} ${sample.purposes} ${kind}`).toBe(wanted.length ? 144 : 0)
  for(const corner of wanted) expect(Array.from({length:vertices.length/6},(_,i)=>Array.from(vertices.slice(i*6,i*6+3))).some(actual=>corner.every((v,i)=>Math.abs(v-actual[i]!)<1e-5))).toBe(true)
  // Every actual endpoint must be one of the eight native-captured corners.
  for(let offset=0;offset<vertices.length;offset+=6){
   const actual=Array.from(vertices.slice(offset,offset+3))
   expect(wanted.some(corner=>corner.every((value,i)=>Math.abs(value-actual[i]!)<1e-5)),`${sample.path} ${kind}: ${actual}`).toBe(true)
  }
 }
})

import startupNative from './fixtures/usdviewStartup/expected.json'
it('uses the captured default box only for an empty root-only selection',async()=>{
 const stage=await Stage.open(Layer.createInMemory('empty-root.usda','#usda 1.0\ndef Scope "Empty" {}'))
 try{
  const range=computeSelectionBounds(stage,0,[{path:'/'}],defaultDisplaySettings()).ComputeAlignedRange()
  const native=startupNative.frames.find(frame=>frame.name==='empty')!
  expect(Array.from(range.getMin().data)).toEqual(native.selectedMin)
  expect(Array.from(range.getMax().data)).toEqual(native.selectedMax)
  expect(computeSelectionBounds(stage,0,[{path:'/Empty'}],defaultDisplaySettings()).ComputeAlignedRange().IsEmpty()).toBe(true)
 }finally{stage.dispose()}
})

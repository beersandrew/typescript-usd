// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdviewq/rootDataModel.py,
//  pxr/usdImaging/usdviewq/stageView.py
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Native usdview RootDataModel + StageView selection bounds, including its
// useExtentsHint default (rootDataModel.py:38-39, stageView.py:1137-1143).
import {readFile} from 'node:fs/promises'
import {it,expect} from 'vitest'
import {Stage} from 'typescript-usd/usd'
import {Layer} from 'typescript-usd/sdf'
import {BBoxCache} from 'typescript-usd/usdGeom'
import {BBox3d} from 'typescript-usd/gf'
import {reviewBounds,computeSelectionBounds} from '../src/review-bounds'
import {defaultDisplaySettings,displayPurposes} from '../src/display-settings'
import {PrimSelectionModel} from '../src/selection-model'
import native from './fixtures/usdviewModelBounds/expected.json'
const fixture=new URL('./fixtures/usdviewModelBounds/stage.usda',import.meta.url)
for(const row of native.cases)it(`native model bounds hints=${row.useExtentsHint} selection=${row.paths}`,async()=>{
 const stage=await Stage.open(Layer.createInMemory('model-review-bounds.usda',await readFile(fixture,'utf8')))
 try{
  const settings=defaultDisplaySettings(),selections=row.paths.map(path=>({path}))
  expect(new PrimSelectionModel(selections).snapshot().lcdPaths).toEqual(row.lcdPaths)
  // Both captured policies establish that the hint differs from the child
  // bound. The viewer below uses the captured native usdview default.
  const cache=new BBoxCache(0,displayPurposes(settings),row.useExtentsHint)
  let box=new BBox3d()
  for(const path of row.lcdPaths)box=BBox3d.combine(box,cache.computeWorldBound(stage.getPrim(path)!))
  const range=box.ComputeAlignedRange()
  expect([Array.from(range.getMin().data),Array.from(range.getMax().data)]).toEqual(row.range)
  if(row.useExtentsHint!==native.defaultUseExtentsHint)return
  const selected=computeSelectionBounds(stage,0,selections,settings).ComputeAlignedRange()
  expect([Array.from(selected.getMin().data),Array.from(selected.getMax().data)]).toEqual(row.range)
  for(const kind of ['oriented','aligned'] as const){
   const display={...settings,showAABBox:kind==='aligned',showOBBox:kind==='oriented'}
   for(const useSelectionSet of [false,true]){
    // The single-path and selected-set review paths each construct a cache.
    if(!useSelectionSet&&row.paths.length!==1)continue
    const vertices=reviewBounds(stage,0,row.paths[0]!,undefined,display,useSelectionSet?selections:undefined)
    const actual=Array.from({length:vertices.length/6},(_,i)=>Array.from(vertices.slice(i*6,i*6+3)))
    expect(actual.length).toBeGreaterThan(0)
    for(const corner of row[kind])expect(actual).toContainEqual(corner)
    for(const corner of actual)expect(row[kind]).toContainEqual(corner)
   }
  }
 }finally{stage.dispose()}
})

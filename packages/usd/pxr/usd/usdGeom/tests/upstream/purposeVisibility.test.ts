// Ported from OpenUSD 26.11.1: pxr/usd/usdGeom/imageable.cpp,
//  pxr/usd/usdGeom/visibilityAPI.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Native imageable.cpp:179-280 and visibilityAPI.cpp:185-210, pinned 26.11.1.
import {readFileSync} from 'node:fs'
import {expect,it} from 'vitest'
import {Stage} from 'typescript-usd/usd'
import {Layer} from 'typescript-usd/sdf'
import {Imageable} from 'typescript-usd/usdGeom'
const native=JSON.parse(readFileSync(new URL('./fixtures/purposeVisibility/expected.json',import.meta.url),'utf8')) as {cases:{name:string,source:string,path:string,attributes:Record<string,string|null>,rows:{time:number|null,visibility:string,effective:Record<string,string>}[]}[]}
for(const n of native.cases)it(n.name,async()=>{
 const stage=await Stage.open(Layer.createInMemory('purpose-visibility.usda','#usda 1.0\n'+n.source)),imageable=new Imageable(stage.getPrim(n.path),stage)
 const rootBefore=stage.getRootLayer().exportToString(),sessionBefore=stage.getSessionLayer().exportToString()
 for(const [purpose,name]of Object.entries(n.attributes))expect(imageable.getPurposeVisibilityAttr(purpose)?.name??null).toBe(name)
 for(const row of n.rows){
  expect(Imageable.computeVisibility(stage,n.path,row.time??undefined)).toBe(row.visibility)
  for(const [purpose,value]of Object.entries(row.effective))expect(imageable.computeEffectiveVisibility(purpose,row.time??undefined)).toBe(value)
 }
 expect(stage.getRootLayer().exportToString()).toBe(rootBefore);expect(stage.getSessionLayer().exportToString()).toBe(sessionBefore)
 stage.dispose()
})

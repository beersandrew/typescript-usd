// Ported from OpenUSD 26.11.1: pxr/usd/usdGeom/pointInstancer.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Native oracle: pointInstancer.cpp:1128-1312,1425-1461 (26.11.1).
import {readFileSync} from 'node:fs'
import {describe,expect,it} from 'vitest'
import {Stage} from 'typescript-usd/usd'
import {Layer} from 'typescript-usd/sdf'
import {BBoxCache,Boundable} from 'typescript-usd/usdGeom'
import type {BBox3d} from 'typescript-usd/gf'
const oracle=JSON.parse(readFileSync(new URL('./fixtures/pointInstancerExtent/expected.json',import.meta.url),'utf8')) as {cases:{name:string,source:string,extent:(number|string)[][]|null,world:number[][]|null,instancer:number[][]|null}[]}
function check(box:BBox3d,expected:number[][]|null){
 const range=box.ComputeAlignedRange()
 expect(range.IsEmpty()).toBe(expected===null)
 if(expected)for(let i=0;i<3;i++){
  expect(range.getMin().data[i]).toBeCloseTo(expected[0]![i]!,5)
  expect(range.getMax().data[i]).toBeCloseTo(expected[1]![i]!,5)
 }
}
describe('PointInstancer registered extent plugin',()=>{
 for(const n of oracle.cases)it(n.name,async()=>{
  const stage=await Stage.open(Layer.createInMemory('point-instancer.usda','#usda 1.0\n'+n.source))
  const pi=stage.getPrim('/World/PI')!
  const extent=Boundable.computeExtent(pi)
  expect(extent===null).toBe(n.extent===null)
  if(n.extent)for(let b=0;b<2;b++)for(let i=0;i<3;i++){
   const value=n.extent[b]![i]!
   if(typeof value==='string')expect(extent![b]![i]).toBe(value==='inf'?Infinity:-Infinity)
   else expect(extent![b]![i]).toBeCloseTo(value,5)
  }
  const cache=new BBoxCache(undefined,['default','proxy'])
  check(cache.computeWorldBound(pi),n.instancer)
  check(cache.computeWorldBound(stage.getPrim('/')!),n.world)
 })
})

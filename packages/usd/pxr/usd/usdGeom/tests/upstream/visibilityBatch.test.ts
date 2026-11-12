// Ported from OpenUSD 26.11.1: pxr/usd/usdGeom/testenv/testUsdGeomImageable.py
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD v26.11.1 testUsdGeomImageable.py / AllInvisible.usda.
// Values captured from native OpenUSD 26.11.1, not hand-derived.
import {readFileSync} from 'node:fs'
import {expect,it} from 'vitest'
import {Layer} from 'typescript-usd/sdf'
import {Stage,Notice as UsdNotice} from 'typescript-usd/usd'
import {Notice as TfNotice} from 'typescript-usd/tf'
import {Imageable} from '../../src/index.ts'
import expectedFixture from '../fixtures/visibilityBatch/expected.json' with { type: 'json' }
import { oraclePayload } from '../../../../testing/oracleFixture.ts'
const expected = oraclePayload(expectedFixture)
const source=readFileSync(new URL('../fixtures/visibilityBatch/AllInvisible.usda',import.meta.url),'utf8')
it('makes the native target visible with one final change notification',async()=>{
 const stage=await Stage.open(Layer.createInMemory('visibility.usda',source))
 const rootText=stage.getRootLayer().exportToString()
 stage.setEditTarget(stage.getSessionLayer())
 const snapshot=()=>expected.rows.map(row=>({path:row.path,local:Imageable.getVisibility(stage.getPrim(row.path)!),computed:Imageable.computeVisibility(stage,row.path)}))
 const observations: ReturnType<typeof snapshot>[]=[]
 const key=TfNotice.Register(UsdNotice.ObjectsChanged,()=>observations.push(snapshot()),stage)
 try {
  new Imageable(stage.getPrim('/foo/bar1/thing1')!,stage).makeVisible()
  await stage.flushChanges()
  for(const row of expected.rows){
   expect(Imageable.getVisibility(stage.getPrim(row.path)!),row.path).toBe(row.local)
   expect(Imageable.computeVisibility(stage,row.path),row.path).toBe(row.computed)
  }
  expect(observations).toEqual([expected.rows])
  new Imageable(stage.getPrim('/foo/bar1/thing1')!,stage).makeVisible()
  await stage.flushChanges()
  expect(observations).toEqual([expected.rows])
  expect(stage.getRootLayer().exportToString()).toBe(rootText)
 }finally{key.revoke();stage.dispose()}
})

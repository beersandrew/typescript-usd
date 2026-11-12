// Ported from OpenUSD 26.11.1: pxr/usd/usdGeom/modelAPI.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Native modelAPI.cpp:504-533; fixtures/modelDrawMode (FIXTURES.md).
import {readFileSync} from 'node:fs'
import {it,expect} from 'vitest'
import {Layer} from 'typescript-usd/sdf'
import {Stage} from 'typescript-usd/usd'
import {ModelAPI as GeomModelAPI} from 'typescript-usd/usdGeom'
import expected from './fixtures/modelDrawMode/expected.json' with {type:'json'}
it('computes native model draw-mode inheritance and the parent shortcut',async()=>{
 const stage=await Stage.open(Layer.createInMemory('draw-mode.usda',readFileSync(new URL('./fixtures/modelDrawMode/scene.usda',import.meta.url),'utf8')))
 try{
  for(const row of expected.rows)expect(new GeomModelAPI(stage.getPrim(row.path)!,stage).computeModelDrawMode()).toBe(row.computed)
  expect(new GeomModelAPI(stage.getPrim('/')!,stage).computeModelDrawMode()).toBe(expected.root)
  expect(new GeomModelAPI(stage.getPrim('/World/Group/Model')!,stage).computeModelDrawMode('origin')).toBe(expected.parentShortcut)
 }finally{stage.dispose()}
})
it('creates native uniform noncustom draw-mode values at the session edit target',async()=>{
 const stage=await Stage.open(Layer.createInMemory('draw-mode.usda',readFileSync(new URL('./fixtures/modelDrawMode/scene.usda',import.meta.url),'utf8')))
 try{
  const prim=stage.getPrim('/World/Group/Model')!,api=new GeomModelAPI(prim,stage)
  stage.setEditTarget(stage.getSessionLayer());prim.applyAPI('GeomModelAPI')
  const attr=api.createModelDrawModeAttr(expected.after.sessionValue);await stage.flushChanges()
  expect(api.computeModelDrawMode()).toBe(expected.after.computed)
  expect(api.getModelDrawModeAttr()?.getValue()).toBe(expected.after.sessionValue)
  expect(attr.isCustom()).toBe(false);expect(attr.typeName).toBe('token')
  stage.getSessionLayer().getAttributeAtPath(prim.path+'.model:drawMode')!.clearDefaultValue();await stage.flushChanges()
  expect(api.computeModelDrawMode()).toBe(expected.cleared.computed)
 }finally{stage.dispose()}
})

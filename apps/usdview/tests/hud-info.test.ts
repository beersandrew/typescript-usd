import {it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {Layer} from 'typescript-usd/sdf'
import {Stage} from 'typescript-usd/usd'
import {subtreeHudInfo,SubtreeHudInfoCache} from '../src/hud-info'
import native from './fixtures/menu-parity/native/hud.json' with {type:'json'}
it('matches actual native subtree HUD counts, including root/typeless and authored geometry',async()=>{
 const stage=await Stage.open(Layer.createInMemory('hud.usda',readFileSync('tests/fixtures/menu-parity/native/scene.usda','utf8')))
 try{for(const row of native)expect(subtreeHudInfo(stage,[row.path],0)).toEqual(row.values)}finally{stage.dispose()}
})
it('keeps the native subtree HUD counts through the per-selection, per-frame cache',async()=>{
 const stage=await Stage.open(Layer.createInMemory('hud.usda',readFileSync('tests/fixtures/menu-parity/native/scene.usda','utf8')))
 const cache=new SubtreeHudInfoCache()
 try{for(const row of native){expect(cache.get(stage,[row.path],0)).toEqual(row.values);expect(cache.get(stage,[row.path],0)).toEqual(row.values);cache.invalidate();expect(cache.get(stage,[row.path],0)).toEqual(row.values)}}finally{stage.dispose()}
})

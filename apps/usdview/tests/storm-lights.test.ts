// Ported from OpenUSD 26.11.1: pxr/imaging/hdx/taskControllerSceneIndex.cpp,
//  pxr/usdImaging/usdviewq/stageView.py
// Copyright 2016, 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// usdview's lighting state as the viewer hands it to UsdImagingGLEngine
// (src/stage-view-engine.ts usdviewLights). Native capture:
// packages/usd/pxr/usdImaging/usdImagingGL/tests/fixtures/native/defaultDomeLight (FIXTURES.md)
// (usdviewq/stageView.py:1453-1483, hdx/taskControllerSceneIndex.cpp:729-738,2208-2314).
// Controller checks, not GPU acceptance.
import {expect,it} from 'vitest'
import {Matrix4d as GfMatrix4d} from 'typescript-usd/gf'
import native from './fixtures/defaultDomeLight/expected.json' with {type:'json'}
import {usdviewLights} from '../src/stage-view-engine'
import {defaultDisplaySettings,mergeDisplaySettings} from '../src/display-settings'
import {defaultViewPreferences,readViewPreferences} from '../src/view-preferences'
const camera={view:new GfMatrix4d(1),projection:new GfMatrix4d(1),eye:[0,0,5] as const}
it('uses native default light flags and typed persisted dome preference',()=>{
 const defaults=defaultDisplaySettings()
 expect(defaults.domeLightEnabled).toBe(native.payload.defaults.domeLightEnabled)
 expect(defaults.cameraLightEnabled).toBe(native.payload.defaults.cameraLightEnabled)
 expect(defaults.sceneLightsEnabled).toBe(native.payload.defaults.sceneLightsEnabled)
 expect(()=>mergeDisplaySettings(defaults,{domeLightEnabled:'yes' as never})).toThrow('boolean')
 const preferences=defaultViewPreferences({})
 expect(readViewPreferences({display:{domeLightEnabled:true}},preferences).preferences.display.domeLightEnabled).toBe(true)
 const bad=readViewPreferences({display:{domeLightEnabled:'true'}},preferences)
 expect(bad.preferences.display.domeLightEnabled).toBe(false)
})
for(const row of native.payload.rows)it(`matches native app-light order and transform Zup=${row.zUp},camera=${row.cameraLight}`,()=>{
 const lights=usdviewLights({...defaultDisplaySettings(),domeLightEnabled:true,cameraLightEnabled:row.cameraLight,sceneLightsEnabled:false},camera,row.zUp)
 const index=lights.findIndex(light=>light.isDomeLight())
 // The task controller names light i light_<i> (taskControllerSceneIndex.cpp:2208-2271).
 expect(row.path.endsWith(`/lights/light_${index}`)).toBe(true)
 expect(lights.length).toBe(row.cameraLight?2:1)
 // usdview sets no texture: the task controller's default is StinsonBeach.hdr
 // (packages/usd/pxr/usdImaging/usdImagingGL/tests/engine.test.ts).
 expect(lights[index]!.getDomeLightTextureFile().getAssetPath()).toBe('')
 expect(row.resourceName).toBe('StinsonBeach.hdr')
 const worldToLight=lights[index]!.getTransform().getInverse().GetArray()
 for(let i=0;i<16;i++)expect(worldToLight[i]).toBeCloseTo(row.worldToLight[i]!,6)
 if(row.cameraLight){const cam=lights[0]!;expect(cam.isDomeLight()).toBe(false);expect([...cam.getPosition().data]).toEqual([0,0,5,1]);expect([...cam.getAmbient().data]).toEqual([0,0,0,0])}
})
it('lights only native shaded render modes while preserving the enabled preference',()=>{
 const settings={...defaultDisplaySettings(),domeLightEnabled:true}
 for(const renderMode of ['Wireframe','Points','Geom Only','Hidden Surface Wireframe'] as const)expect(usdviewLights({...settings,renderMode},camera,false)).toEqual([])
 expect(usdviewLights(settings,camera,false).map(light=>light.isDomeLight())).toEqual([false,true])
 expect(settings.domeLightEnabled).toBe(true)
})

import {expect,it} from 'vitest'
import native from './fixtures/cameraPresentation/expected.json' with {type:'json'}
import {defaultCameraPresentation,cameraViewport,cameraReticles,cameraMask,mergeCameraPresentation} from '../src/camera-presentation'
it('uses native defaults and rejects invalid values without mutating state',()=>{
 const s=defaultCameraPresentation();expect(s).toEqual(native.defaults)
 expect(()=>mergeCameraPresentation(s,{cameraMaskMode:'bad' as never})).toThrow()
 expect(()=>mergeCameraPresentation(s,{cameraMaskColor:[1,2,3,1]})).toThrow()
 expect(()=>mergeCameraPresentation(s,{cameraMaskOutline:1 as never})).toThrow()
 expect(s).toEqual(native.defaults)
})
for(const n of native.rows)it(`native mask and reticles ${n.width}x${n.height} aspect${n.aspect} dpr${n.dpr}`,()=>{
 const rect=cameraViewport(n.width,n.height,n.aspect,n.dpr)
 expect(rect).toEqual(n.rect)
 expect(cameraMask(n.width/n.dpr,n.height/n.dpr,rect)).toEqual(n.mask)
 for(const ticks of n.reticles)expect(cameraReticles(rect,ticks.inside,ticks.outside)).toEqual(ticks.rects)
})

import {Stage} from 'typescript-usd/usd'
import {VisibilityAPI} from 'typescript-usd/usdGeom'
import {readFile} from 'node:fs/promises'
import {defaultCamera} from '../src/camera'
import {ViewerCameraController} from '../src/viewer-camera'
import {createHttpResolverContext} from '../src/http-resolver'
for(const n of native.cameras)it(`native resolveCamera ${n.path} aspect${n.aspect} fit${n.fit}`,async()=>{
 const source='https://camera.example/scene.usda'
 const stage=(await Stage.open(source,{resolverContext:createHttpResolverContext(source,undefined,async()=>new Response(await readFile(new URL('../public/assets/cameraControls/scene.usda',import.meta.url),'utf8')))}))!
 const c=new ViewerCameraController(defaultCamera(),()=>n.aspect);c.stage=stage;c.select(n.path);c.presentation.cameraMaskOutline=n.fit
 c.frame().matrix.forEach((v,i)=>expect(v).toBeCloseTo(n.matrix[i]!,5));stage.dispose()
})
it('camera oracles match native frustum edges and omit the active camera',async()=>{
 const source='https://camera.example/scene.usda'
 const stage=(await Stage.open(source,{resolverContext:createHttpResolverContext(source,undefined,async()=>new Response(await readFile(new URL('../public/assets/cameraControls/scene.usda',import.meta.url),'utf8')))}))!
 const c=new ViewerCameraController(defaultCamera(),()=>1.5);c.stage=stage
 expect(native.guideDefaults.every(row=>row.visibility==='invisible')).toBe(true)
 expect(c.guides()).toHaveLength(0)
 for(const n of native.guides)VisibilityAPI.apply(stage.getPrim(n.path)!).getGuideVisibilityAttr().set('visible')
 await stage.flushChanges()
 for(const n of native.guides){c.select(native.guides.find(g=>g.path!==n.path)!.path);const actual=c.guides();expect(actual.length).toBe(n.vertices.length);actual.forEach((v,i)=>expect(v).toBeCloseTo(Math.fround(n.vertices[i]!),4))}
 stage.dispose()
})
it('copies camera view state deeply while leaving time and presentation settings current',()=>{
 const c=new ViewerCameraController(defaultCamera(),()=>1.5),before=c.copyViewState()
 c.orbit.target[0]=20;c.free.fovDegrees=45;c.time=10;c.presentation.cameraMaskMode='partial'
 const framed=c.copyViewState();c.restoreViewState(before)
 expect(c.orbit.target[0]).toBe(0);expect(c.free.fovDegrees).toBe(60)
 expect(c.time).toBe(10);expect(c.presentation.cameraMaskMode).toBe('partial')
 c.restoreViewState(framed);expect(c.orbit.target[0]).toBe(20);expect(c.free.fovDegrees).toBe(45)
})

import {cameraOverlayRects} from '../src/viewport-camera'
it('applies native mask and reticle alpha/color conversion to captured geometry',()=>{
 const s=defaultCameraPresentation();s.cameraMaskMode='partial';s.cameraReticlesInside=true
 const n=native.rows[0]!,actual=cameraOverlayRects(n.width,n.height,n.aspect,s,n.dpr)
 expect(actual.map(item=>item.rect)).toEqual([...n.mask,...n.reticles[0]!.rects])
 for(const item of actual.slice(0,n.mask.length))expect(item.color).toEqual(native.partialMaskColor)
 for(const item of actual.slice(n.mask.length))expect(item.color).toEqual(native.reticlesColor)
 expect(cameraOverlayRects(n.width,n.height,null,s)).toEqual([])
})

import {cameraImageContainsPoint} from '../src/camera-presentation'
for(const n of native.pickBounds)it(`native ${n.mode} image pick bounds (${n.x},${n.y})`,()=>{
 const s=defaultCameraPresentation();s.cameraMaskMode=n.mode as typeof s.cameraMaskMode
 expect(cameraImageContainsPoint(n.x,n.y,n.width,n.height,n.aspect,s)).toBe(n.inside)
})

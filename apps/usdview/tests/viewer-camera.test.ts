import { readFile } from 'node:fs/promises'
import { describe,expect,it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { defaultCamera } from '../src/camera'
import { ViewerCameraController } from '../src/viewer-camera'
import { createHttpResolverContext } from '../src/http-resolver'
import oracle from './fixtures/cameraControls/expected.json'
async function scene(){
 const source='https://camera.example/scene.usda'
 return (await Stage.open(source,{resolverContext:createHttpResolverContext(source,undefined,async()=>new Response(await readFile(new URL('../public/assets/cameraControls/scene.usda',import.meta.url),'utf8')))}))!
}
describe('native camera matrices (OpenUSD 26.11.1, CameraUtil Fit)',()=>{
 for(const row of oracle.rows)it(`${row.path} at aspect ${row.aspect}`,async()=>{
  const stage=await scene(), controller=new ViewerCameraController(defaultCamera(),()=>row.aspect)
  try{
   controller.stage=stage;controller.presentation.cameraMaskOutline=true;controller.select(row.path)
   const frame=controller.frame()
   frame.matrix.forEach((value,i)=>expect(value).toBeCloseTo(row.matrix[i]!,5))
   frame.eye.forEach((value,i)=>expect(value).toBeCloseTo(row.eye[i]!,5))
   frame.forward.forEach((value,i)=>expect(value).toBeCloseTo(row.forward[i]!,5))
   controller.select(null)
   controller.frame().matrix.forEach((value,i)=>expect(value).toBeCloseTo(row.freeMatrix[i]!,5))
   expect(controller.state().effectiveNear).toBe(row.freeClip[0]);expect(controller.state().effectiveFar).toBe(row.freeClip[1]);expect(controller.state().free.aspectRatio).toBeNull()
  }finally{stage.dispose()}
 })
 it('rejects invalid settings and camera paths without changing the view',async()=>{
  const stage=await scene(), controller=new ViewerCameraController(defaultCamera(),()=>1.5)
  try{
   controller.stage=stage;controller.select('/World/Orthographic')
   const before=controller.state()
   expect(()=>controller.settings({fovDegrees:180})).toThrow()
   expect(()=>controller.settings({nearOverride:10,farOverride:1})).toThrow()
   expect(()=>controller.select('/World/Cube')).toThrow()
   expect(controller.state()).toEqual(before)
  }finally{stage.dispose()}
 })
})

describe('camera transactions',()=>{
 it('retains the last view when framing makes a clipping override invalid',()=>{
  const orbit=defaultCamera(),controller=new ViewerCameraController(orbit,()=>1.5)
  controller.settings({farOverride:2})
  const before=controller.state(),matrix=Array.from(controller.frame().matrix),target=[...orbit.target]
  expect(()=>controller.transaction(()=>{orbit.near=10;orbit.target=[100,200,300]})).toThrow('near < far')
  expect(controller.state()).toEqual(before)
  expect(Array.from(controller.frame().matrix)).toEqual(matrix)
  expect(orbit.target).toEqual(target)
 })
})

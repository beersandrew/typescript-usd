import { readFile } from 'node:fs/promises'
import { describe,expect,it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { BBoxCache } from 'typescript-usd/usdGeom'
import { defaultCamera } from '../src/camera'
import { ViewerCameraController } from '../src/viewer-camera'
import { createHttpResolverContext } from '../src/http-resolver'
import oracle from './fixtures/timeReview/expected.json'
describe('sampled review camera and bounds, native26.08 oracle',()=>{
 for(const row of oracle.rows)it(`evaluates at ${row.time}`,async()=>{
  const url='https://review.example/scene.usda'
  const stage=(await Stage.open(url,{resolverContext:createHttpResolverContext(url,undefined,async()=>new Response(await readFile(new URL('../public/assets/timeReview/scene.usda',import.meta.url),'utf8')))}))!
  try {
   const camera=new ViewerCameraController(defaultCamera(),()=>1.5)
   camera.stage=stage;camera.time=row.time;camera.select('/World/Rig/Camera')
   const frame=camera.frame()
   frame.matrix.forEach((v,i)=>expect(v).toBeCloseTo(row.matrix[i]!,5))
   frame.eye.forEach((v,i)=>expect(v).toBeCloseTo(row.eye[i]!,5))
   expect(camera.state().effectiveNear).toBeCloseTo(row.clip[0]!,5)
   const range=new BBoxCache(row.time,['default','proxy']).computeWorldBound(stage.getPrim('/World/Cube')!).ComputeAlignedRange()
   range.getMin().data.forEach((v,i)=>expect(v).toBeCloseTo(row.min[i]!,5))
   range.getMax().data.forEach((v,i)=>expect(v).toBeCloseTo(row.max[i]!,5))
  } finally {stage.dispose()}
 })
})

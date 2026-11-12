// Expectations execute the actual pinned native usdview startup methods;
// tests consume the committed capture and never invoke native USD.
import {describe,it,expect} from 'vitest'
import {Stage} from 'typescript-usd/usd'
import {Layer} from 'typescript-usd/sdf'
import {startupCameraPath,stageTimeInfo} from '../src/scene-startup'
import native from './fixtures/usdviewStartup/expected.json' with {type:'json'}
async function stage(text:string){return Stage.open(Layer.createInMemory('startup.usda','#usda 1.0\n'+text))}
describe('native startup camera selection',()=>{
 for(const row of native.cameras)it(row.name,async()=>{
  const s=await stage(row.source);try{expect(startupCameraPath(s)).toBe(row.selected)}finally{s.dispose()}
 })
})
describe('native startup frame range',()=>{
 for(const row of native.times)it(row.name,async()=>{
  const s=await stage(`(${row.sourceMetadata})\ndef Cube "Cube" {}`);try{
   const info=stageTimeInfo(s)
   expect({start:info.start,end:info.end,stageStart:info.stageStart,stageEnd:info.stageEnd,hasTimeSamples:info.hasTimeSamples})
    .toEqual({start:row.rangeStart,end:row.rangeEnd,stageStart:row.stageStart,stageEnd:row.stageEnd,hasTimeSamples:row.hasTimeSamples})
   expect(info.start).toBe(row.current)
   expect(info.warnings).toEqual(row.warning?[row.warning]:[])
  }finally{s.dispose()}
 })
 for(const row of native.invalidRates)it(`diagnoses invalid timeCodesPerSecond ${row.timeCodesPerSecond} without changing metadata`,async()=>{
  const s=await stage(`(${row.sourceMetadata})\ndef Cube "Cube" {}`);try{
   const before=s.getRootLayer().exportToString(),info=stageTimeInfo(s)
   expect(s.timeCodesPerSecond).toBe(row.timeCodesPerSecond)
   expect(info.framesPerSecond).toBe(row.framesPerSecond)
   expect(info.timeCodesPerSecond).toBe(row.framesPerSecond)
   expect(info.warnings).toHaveLength(1)
   expect(info.warnings[0]).toContain(`Invalid timeCodesPerSecond (${row.timeCodesPerSecond})`)
   expect(info.warnings[0]).toContain('authored metadata is unchanged')
   expect(s.getRootLayer().exportToString()).toBe(before)
  }finally{s.dispose()}
 })
})

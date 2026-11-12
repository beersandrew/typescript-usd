import {expect,it} from 'vitest'
import native from './fixtures/startupOptions/expected.json' with {type:'json'}
import {parseStartupOptions,startupTimeInfo} from '../src/startup-options'
import {Stage,StagePopulationMask} from 'typescript-usd/usd'
import {Layer} from 'typescript-usd/sdf'
for(const n of native.cli)it(`native CLI equivalents ${n.args.join(' ')||'defaults'}`,()=>{
 const query=new URLSearchParams();for(let i=0;i<n.args.length;i+=2)query.append(n.args[i]!.slice(2),n.args[i+1]!)
 const actual=parseStartupOptions(query)
 if(n.parsed){
  expect(actual.options.camera??'main_cam').toBe(n.parsed.camera);expect(actual.options.select??'/').toBe(n.parsed.select);expect(actual.options.complexity??'low').toBe(n.parsed.complexity)
  expect(actual.options.firstFrame??null).toBe(n.parsed.ff);expect(actual.options.lastFrame??null).toBe(n.parsed.lf);expect(actual.options.currentFrame??null).toBe(n.parsed.cf)
  expect(actual.options.populationMask??null).toEqual(n.parsed.mask===''?[]:n.parsed.mask)
  expect(actual.warnings.join('\n')).toBe(n.warning)
 }else expect(actual.warnings.length).toBeGreaterThan(0)
})
for(const n of native.times)it(`native startup range ${JSON.stringify(n.options)}`,()=>{
 const actual=startupTimeInfo({startTimeCode:2,endTimeCode:10,timeCodesPerSecond:24,getFramesPerSecond:()=>24},{...('ff'in n.options?{firstFrame:n.options.ff}:{}),...('lf'in n.options?{lastFrame:n.options.lf}:{}),...('cf'in n.options?{currentFrame:n.options.cf}:{})})
 expect(actual.current).toBe(n.current);expect(actual.start).toBe(n.start);expect(actual.end).toBe(n.end);expect(actual.hasTimeSamples).toBe(n.hasSamples);expect(actual.warnings.join('\n')).toBe(n.warning)
})
for(const n of native.masks)it(`native OpenMasked population ${n.paths.join(',')||'empty'}`,async()=>{
 const stage=await Stage.openMasked(Layer.createInMemory('population.usda',native.populationSource),new StagePopulationMask(n.paths))
 expect([...stage.traverse()]).toEqual(n.populated);expect(stage.getPopulationMask().getPaths()).toEqual(n.mask);stage.dispose()
})
it('keeps unsafe playback-step arithmetic finite without enumerating samples',()=>{
 for(const rate of [Number.MIN_VALUE,1e-300]){
  const info=startupTimeInfo({startTimeCode:0,endTimeCode:10,timeCodesPerSecond:rate,getFramesPerSecond:()=>24},{})
  expect(Number.isFinite(info.end)).toBe(true);expect(info.warnings.length).toBeGreaterThan(0)
 }
})

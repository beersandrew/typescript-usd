import {it,expect} from 'vitest'
import {fileURLToPath} from 'node:url'
import {Stage} from 'typescript-usd/usd'
import 'typescript-usd/usdGeom'
import 'typescript-usd/usdShade'
import {inspectMetadata} from '../src/metadata-inspection'
import expected from './fixtures/metadata-inspection/expected.json'
const open=()=>Stage.open(fileURLToPath(new URL('./fixtures/metadata-inspection/root.usda',import.meta.url))).then(value => value!)
it('matches native authored attribute/relationship metadata and identity without changing the stage',async()=>{
 const stage=await open(),root=stage.getRootLayer().exportToString(),session=stage.getSessionLayer().exportToString()
 try {
  for(const name of ['weight','target']){
   const native=expected.rows.find(r=>r.property===name)!,result=inspectMetadata(stage,'/World',name)!
   const values=Object.fromEntries(result.rows.map(r=>[r.name,r.value]))
   expect(values['[object type]']).toBe(native.objectType);expect(values['[path]']).toBe(native.path)
   expect(Object.fromEntries(result.rows.filter(r=>r.source!=='derived').map(r=>[r.name,r.value]))).toEqual(native.metadata)
   expect(result.rows.filter(r=>r.source==='authored').map(r=>r.name).sort()).toEqual(native.authoredKeys)
  }
  expect(stage.getRootLayer().exportToString()).toBe(root);expect(stage.getSessionLayer().exportToString()).toBe(session)
  expect(inspectMetadata(stage,'/Missing')).toBeNull();expect(inspectMetadata(stage,'/World','missing')).toBeNull()
 }finally{stage.dispose()}
})
it('adds native identity, applied APIs, setless variants and composed reference opinions',async()=>{
 const stage=await open()
 try {
  const native=expected.rows[0]!,result=inspectMetadata(stage,'/World')!,values=Object.fromEntries(result.rows.map(r=>[r.name,r.value]))
  expect(values['[object type]']).toBe(native.objectType);expect(values['[path]']).toBe(native.path);expect(values['[applied API schemas]']).toEqual(native.appliedSchemas)
  expect(values['look variant']).toBe(native.variantSelections!.look);expect(values['orphan variant (no defined set)']).toBe(native.variantSelections!.orphan)
  for(const key of ['assetInfo','kind','documentation','specifier','typeName'])expect(values[key]).toEqual((native.metadata as Record<string,unknown>)[key])
  const refs=values.references as {prependedItems:{assetPath:string,primPath:string,layerOffset:{offset:number,scale:number}}[]}
  expect(refs.prependedItems.map(({assetPath,primPath,layerOffset})=>({assetPath,primPath,...layerOffset}))).toEqual(native.metadata.references)
  const data=values.customData as Record<string,unknown>;for(const key of ['strong','weak','referenced'])expect(data[key]).toEqual((native.metadata.customData as Record<string,unknown>)[key])
  expect(values).not.toHaveProperty('properties');expect(values).not.toHaveProperty('variantSetChildren')
  expect(values.inherits).toEqual(native.directInherits)
  expect(data).toEqual(native.metadata.customData)
  expect(result.limitations).toEqual([])
 }finally{stage.dispose()}
})
it('matches native schema fallback metadata and field provenance directly',async()=>{
 const stage=await open()
 try {
  const native=expected.rows.find(r=>r.property==='size')!,result=inspectMetadata(stage,'/World','size')!
  expect(result.rows.filter(r=>r.source==='authored').map(r=>r.name).sort()).toEqual(native.authoredKeys)
  expect(Object.fromEntries(result.rows.filter(r=>r.source!=='derived').map(r=>[r.name,r.value]))).toEqual(native.metadata)
  expect(result.rows.find(r=>r.name==='default')!.source).toBe('fallback')
  expect(result.limitations).toEqual([])
 }finally{stage.dispose()}
})

it('preserves authored builtin default metadata independently of time-sampled values',async()=>{
 const stage=await open()
 try {
  const native=expected.rows.find(r=>r.path==='/Authored.size')!,result=inspectMetadata(stage,'/Authored','size')!
  const metadata=Object.fromEntries(result.rows.filter(r=>r.source!=='derived').map(r=>[r.name,r.value]))
  expect(metadata).toEqual(native.metadata)
  expect(metadata.default).toBe(10)
  expect(result.rows.find(r=>r.name==='default')!.source).toBe('authored')
  for(const [time,value] of Object.entries(native.sampleValues!))expect(stage.getPrim('/Authored')!.getAttr('size')!.getValueAtTime(Number(time))).toBe(value)
 }finally{stage.dispose()}
})

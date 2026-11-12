import fs from 'node:fs'
import os from 'node:os'
import pathModule from 'node:path'
import {it,expect} from 'vitest'
import {fileURLToPath} from 'node:url'
import {Duration} from 'typescript-usd/gf'
import {Layer,ValueTypeNames} from 'typescript-usd/sdf'
import native from '../fixtures/duration/expected.json' with {type:'json'}
const path=(file:string)=>fileURLToPath(new URL(`../fixtures/duration/${file}`,import.meta.url))
it.each(native.scalars)('matches native GfDuration scalar/operator text for $value',row=>{
 const d=new Duration(row.value)
 expect(d.GetValue()).toBe(row.value);expect(d.toString()).toBe(row.text);expect(d.repr()).toBe(row.repr)
 expect(Number(d.add(2))).toBe(row.add);expect(Number(d.subtract(2))).toBe(row.subtract)
 expect(Number(d.multiply(2))).toBe(row.multiply);expect(Number(d.divide(2))).toBe(row.divide)
 expect(d.divide(new Duration(2))).toBe(row.ratio);expect(Number(d.getNegated())===row.negated).toBe(true);expect(d.getNegated().toString()).toBe(row.negatedText)
})
it.each(['root.usda','root.usdc'])('reads native duration scalars, arrays and typed splines from %s',async file=>{
 const layer=(await Layer.findOrOpen(path(file)))!
 expect(ValueTypeNames.Duration.name).toBe(native.types.scalar);expect(ValueTypeNames.DurationArray.name).toBe(native.types.array)
 expect(ValueTypeNames.Duration.cppTypeName).toBe(native.types.cppType)
 const scalar=layer.getField('/Test.relative','default') as Duration
 expect(scalar).toBeInstanceOf(Duration);expect(scalar.GetValue()).toBe(native.layer.scalar)
 const array=layer.getField('/Test.offsets','default') as {toArray():Duration[],getElementType():{getTypeName():string}}
 expect(array.getElementType().getTypeName()).toBe(native.types.tfType)
 expect(array.toArray().map(v=>v.GetValue())).toEqual(native.layer.array)
 const spline=layer.getField('/Test.motion','spline') as import('typescript-usd/ts').Spline
 expect(spline.GetValueTypeName()).toBe(native.spline.typeName);expect(spline.isTimeValued()).toBe(native.spline.timeValued)
 expect(spline.getKnots()[0]!.GetValueTypeName()).toBe(native.spline.typeName)
 expect(native.spline.samples.map(([t])=>[t,spline.eval(t!)])).toEqual(native.spline.samples)
 const scaled=spline.getTimeScaled(2,5)
 expect(native.spline.scaled.map(([t])=>[t,scaled.eval(t!)])).toEqual(native.spline.scaled)
 expect(layer.exportToString()).toBe(native.layer.export)
})

it('retains native duration dictionary identity and crate version in authored round trips',async()=>{
 const dictionary=Layer.createAnonymous();dictionary.setField('/','customLayerData',{relative:new Duration(2.5)})
 expect(dictionary.exportToString()).toBe(native.dictionaryExport)
 const source=(await Layer.findOrOpen(path('root.usda')))!,dir=fs.mkdtempSync(pathModule.join(os.tmpdir(),'duration-roundtrip-'))
 try{
  const file=pathModule.join(dir,'roundtrip.usdc');expect(await source.export(file)).toBe(true)
  expect([...fs.readFileSync(file).subarray(8,11)]).toEqual(native.layer.crateVersion)
  const reread=(await Layer.findOrOpen(file))!
  expect(reread.exportToString()).toBe(native.layer.export)
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
})

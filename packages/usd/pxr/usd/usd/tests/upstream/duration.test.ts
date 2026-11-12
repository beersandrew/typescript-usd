import {expect,it} from 'vitest'
import {Duration} from 'typescript-usd/gf'
import {Array as VtArray} from 'typescript-usd/vt'
import {Stage,AttributeQuery,InterpolationType} from 'typescript-usd/usd'
import {Layer} from 'typescript-usd/sdf'
import {Ts_BinaryDataAccess} from 'typescript-usd/ts'
import {usdTransformSpline} from '../../src/interpolators.ts'
import {readOracleFixture} from '../../../../testing/oracleFixture.ts'
const base=new URL('../fixtures/duration/',import.meta.url),native=readOracleFixture(new URL('expected.json',base))
function plain(value:unknown):unknown{
 if(value===undefined)return null
 if(value instanceof Duration)return value.GetValue()
 if(value instanceof VtArray)return value.toArray().map(plain)
 if(Array.isArray(value))return value.map(plain)
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,plain(item)]))
 return value
}
for(const name of ['local','composed'])it(`matches native typed Duration reads, interpolation and metadata through ${name} offsets`,async()=>{
 const stage=(await Stage.open(new URL(name==='local'?'leaf.usda':'root.usda',base).pathname))!
 try{
  const prim=stage.getPrim('/A')!,row=native[name]
  for(const [attr,value]of Object.entries(row.defaults))expect(plain(prim.getAttr(attr)!.getValue())).toEqual(value)
  for(const [name,samples]of Object.entries(row.samples) as Array<[string,Array<[number,unknown]>]>){
   const attr=prim.getAttr(name)!,query=new AttributeQuery(attr)
   for(const [time,value]of samples){expect(plain(attr.getValueAtTime(time))).toEqual(value);expect(plain(query.get(time))).toEqual(value)}
   if(name in row.typed)expect(attr.getValueAtTime(samples[0]![0]) instanceof Duration).toBe(row.typed[name])
  }
  expect(plain(prim.getMetadata('customData'))).toEqual(row.customData)
  stage.setInterpolationType(InterpolationType.Held)
  for(const [name,value]of Object.entries(row.held))expect(plain(prim.getAttr(name)!.getValueAtTime(row.samples[name][1][0]))).toEqual(value)
  const spline=prim.getAttr('curve')!.getSpline()!,expected=row.spline
  expect(spline.GetValueTypeName()).toBe(expected.type);expect(spline.isTimeValued()).toBe(expected.timeValued)
  expect(spline.getKnots().map(k=>({time:k.getTime(),value:k.GetValue(),preValue:k.getPreValue(),preWidth:k.getPreTanWidth(),postWidth:k.getPostTanWidth(),preSlope:k.getPreTanSlope(),postSlope:k.getPostTanSlope()}))).toEqual(expected.knots)
  expect(spline.getPreExtrapolation().slope).toBe(expected.pre.slope);expect(spline.getPostExtrapolation().loopBoundaryTime).toBe(expected.post.boundary)
 }finally{stage.dispose()}
})
it('matches native relative-duration authoring into an offset local layer',async()=>{
 const stage=(await Stage.open(new URL('root.usda',base).pathname))!,leaf=(await Layer.findOrOpen(new URL('leaf.usda',base).pathname))!
 const before=leaf.exportToString()
 try{
  stage.setEditTarget(stage.getEditTargetForLocalLayer(leaf));const prim=stage.getPrim('/A')!
  prim.getAttr('relative')!.set(new Duration(12));prim.getAttr('relativeArray')!.set([new Duration(12),new Duration(24)]);prim.getAttr('sample')!.setTimeSample(106,new Duration(18))
  prim.setMetadata('customData',{relative:new Duration(12)})
  prim.getAttr('curve')!.setSpline(prim.getAttr('curve')!.getSpline()!)
  await stage.flushChanges()
  expect(plain(leaf.getField('/A.relative','default'))).toBe(native.authoring.localDefault)
  expect(plain(leaf.getField('/A.relativeArray','default'))).toEqual(native.authoring.localArray)
  expect(plain(leaf.queryTimeSample('/A.sample',2))).toBe(native.authoring.localSample)
  expect(plain(leaf.getField('/A','customData'))).toEqual(native.authoring.localCustomData)
  const localSpline=leaf.getField('/A.curve','spline') as import('typescript-usd/ts').Spline
  expect(localSpline.getKnots().map(k=>({time:k.getTime(),value:k.GetValue(),preValue:k.getPreValue(),preWidth:k.getPreTanWidth(),postWidth:k.getPostTanWidth(),preSlope:k.getPreTanSlope(),postSlope:k.getPostTanSlope()}))).toEqual(native.authoring.localSpline.knots)
 }finally{leaf.importFromString(before);await stage.flushChanges();stage.dispose()}
})
it('keeps native Duration spline identity copies and binary round trips equal',async()=>{
 const stage=(await Stage.open(new URL('leaf.usda',base).pathname))!
 try{
  const source=stage.getPrim('/A')!.getAttr('curve')!.getSpline()!,copy=usdTransformSpline(source)!
  expect(source.equals(copy)).toBe(native.identity.copyEqual)
  // A legacy flag must not change the identity of an intrinsically typed duration.
  copy.setTimeValued(true)
  const binary=Ts_BinaryDataAccess.getBinaryData(copy),restored=Ts_BinaryDataAccess.createSplineFromBinaryData(binary.data,binary.customData)
  expect(copy.equals(restored)).toBe(native.identity.binaryEqual)
  expect(source.equals(restored)).toBe(native.identity.binaryEqual)
 }finally{stage.dispose()}
})

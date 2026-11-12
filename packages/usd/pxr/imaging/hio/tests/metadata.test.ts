// Native Hio metadata queries (fixtures/metadata: HioImage::
// OpenForReading and GetMetadata of OpenUSD 26.11.1) through HioImage's
// synchronous open (header only) and its asynchronous open.
import {it,expect} from 'vitest'
import {fileURLToPath} from 'node:url'
import {readFileSync} from 'node:fs'
import {HioImage} from '../src/index.ts'
import {Matrix4d,Matrix4f} from 'typescript-usd/gf'
import {GetResolver as ArGetResolver,ResolvedPath as ArResolvedPath} from 'typescript-usd/ar'
import {ArInMemoryResolver,_ArOpenAssetAhead,_resolverContextForResolver} from 'typescript-usd/ar/_internal'
import {createUsdzPackage} from 'typescript-usd/sdf'
import {TfDiagnosticMgr} from 'typescript-usd/tf'
import {readOracleFixture} from '../../../testing/oracleFixture.ts'
const base=new URL('./fixtures/metadata/',import.meta.url)
const native=readOracleFixture(new URL('expected.json',base))
const matrixValues=(text:string)=>text.match(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g)!.map(Number)
function expectQueries(image:HioImage,queries:Record<string,any>){
 for(const [key,expected]of Object.entries(queries)){
  if(expected?.unstableNativeValue){
   // Captured native result is int from FLOAT_VECTOR fallthrough; its pointer-
   // derived number is undefined. Preserve an explicit metadata limitation.
   expect(expected.type).toBe('int')
   expect(()=>image.getMetadata(key)).toThrow('undefined native integer result');continue
  }
  const value=image.getMetadata(key)
  if(expected===null){expect(value).toBeNull();continue}
  expect(value!.getTypeName()).toBe(expected.type)
  if(expected.type==='GfMatrix4d'||expected.type==='GfMatrix4f'){
   const held=value!.Get<Matrix4d|Matrix4f>()
   expect(held).toBeInstanceOf(expected.type==='GfMatrix4d'?Matrix4d:Matrix4f)
   expect(held.GetArray()).toEqual(matrixValues(expected.value))
  }else expect(value!.Get()).toBe(expected.value)
 }
}
for(const row of native)it(`native Hio metadata queries for ${row.file}`,()=>{
 const image=HioImage.openForReading(fileURLToPath(new URL(row.file,base)))
 expect(image).not.toBeNull()
 expectQueries(image!,row.queries)
})

// The asynchronous open (which also decodes the pixels) runs the same
// header open.
it('reads the same metadata through the asynchronous open',async()=>{
 for(const row of native){
  const image=await HioImage.openForReadingAsync(fileURLToPath(new URL(row.file,base)))
  expect(image).not.toBeNull()
  expectQueries(image!,row.queries)
 }
})

it('reads native metadata of a USDZ member read ahead through Ar',async()=>{
 const packed=createUsdzPackage([
  {name:'root.usda',data:new TextEncoder().encode('#usda 1.0\ndef "Root" {}')},
  {name:'matrix.exr',data:readFileSync(new URL('0-worldtoscreen.exr',base))},
 ])
 const context=_resolverContextForResolver(new ArInMemoryResolver({'metadata.usdz':packed}))
 const resolver=ArGetResolver()
 const resolved=await resolver.resolve('metadata.usdz[matrix.exr]',context)
 await _ArOpenAssetAhead(resolved,{resolve:p=>resolver.resolve(p,context),openAsset:p=>resolver.openAsset(p,context)})
 const image=HioImage.openForReading(resolved.toString())
 expect(image).not.toBeNull()
 expect(image!.getMetadata('worldtoscreen')!.Get<Matrix4d>().GetArray()).toEqual(matrixValues(native[0].queries.worldtoscreen.value))
})

it('diagnoses an asset nothing read ahead instead of taking it for a missing image',()=>{
 const warnings:string[]=[]
 const mgr=TfDiagnosticMgr.GetInstance()
 const delegate={issueError(){},issueFatalError(){},issueStatus(){},issueWarning(w:{getCommentary():string}){warnings.push(w.getCommentary())}}
 mgr.addDelegate(delegate as never)
 try{
  expect(HioImage.openForReading(new ArResolvedPath('https://example.invalid/never-read.exr').toString())).toBeNull()
 }finally{mgr.removeDelegate(delegate as never)}
 expect(warnings.some(w=>w.includes('was not read ahead'))).toBe(true)
})

it('does not open an invalid image header',async()=>{
 const context=_resolverContextForResolver(new ArInMemoryResolver({'invalid.png':new TextEncoder().encode('not an image header')}))
 const resolver=ArGetResolver()
 const resolved=await resolver.resolve('invalid.png',context)
 await _ArOpenAssetAhead(resolved,{resolve:p=>resolver.resolve(p,context),openAsset:p=>resolver.openAsset(p,context)})
 expect(HioImage.openForReading(resolved.toString())).toBeNull()
})

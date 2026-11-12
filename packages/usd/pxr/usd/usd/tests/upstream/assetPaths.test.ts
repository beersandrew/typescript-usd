// Ported from OpenUSD 26.11.1: pxr/usd/usd/stage.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Native expectations: ../fixtures/assetPaths (FIXTURES.md); usd/stage.cpp:804-847.
import {it,expect} from 'vitest'
import {fileURLToPath} from 'node:url'
import {Stage} from '../../src/index.ts'
import {AssetPath} from 'typescript-usd/sdf'
import {readFileSync} from 'node:fs'
const expected=JSON.parse(readFileSync(new URL('../fixtures/assetPaths/expected.json',import.meta.url),'utf8'))
it('returns typed authored/evaluated/resolved scalar and array asset values',async()=>{
 const here=fileURLToPath(new URL('../fixtures/assetPaths/',import.meta.url)).replace(/\/$/,'')
 const stage=(await Stage.open(here+'/stage.usda'))!
 const fields=(path:AssetPath)=>({authored:path.getAuthoredPath(),evaluated:path.getEvaluatedPath(),resolved:path.getResolvedPath().replaceAll(here,'$FIXTURE')})
 try{
  for(const row of expected.cases){
   const value=stage.getPrim('/Asset')!.getAttr(row.name)!.getValueAtTime(row.time)
   if('elements'in row){
    const values=Array.from(value as Iterable<AssetPath>)
    expect(values.every(value=>value instanceof AssetPath)).toBe(true)
    expect(values.map(fields)).toEqual(row.elements)
   }else{
    expect(value).toBeInstanceOf(AssetPath)
    expect(fields(value as AssetPath)).toEqual({authored:row.authored,evaluated:row.evaluated,resolved:row.resolved})
   }
  }
 }finally{stage.dispose()}
})
it('awaits newly authored asset resolution at flushChanges',async()=>{
 const here=fileURLToPath(new URL('../fixtures/assetPaths/',import.meta.url)).replace(/\/$/,'')
 const stage=(await Stage.open(here+'/stage.usda'))!
 try{
  const attr=stage.getPrim('/Asset')!.getAttr('missing')!
  attr.set(new AssetPath('./authored.txt'))
  expect((attr.getValue() as AssetPath).getResolvedPath()).toBe('')
  await stage.flushChanges()
  const value=attr.getValue() as AssetPath
  expect({authored:value.getAuthoredPath(),evaluated:value.getEvaluatedPath(),resolved:value.getResolvedPath().replaceAll(here,'$FIXTURE')}).toEqual(expected.authoredAfterEdit)
 }finally{stage.dispose()}
})

import {DefaultResolver,Resolver,ResolvedPath,InMemoryAsset} from 'typescript-usd/ar'
import {_resolverContextForResolver} from 'typescript-usd/ar/_internal'
it('keeps host context identities private while preserving layer and clip asset anchors',async()=>{
 const here=fileURLToPath(new URL('../fixtures/assetPaths/',import.meta.url)).replace(/\/$/,'')
 const stage=(await Stage.open(here+'/stage.usda',{resolverContext:_resolverContextForResolver(new DefaultResolver())}))!
 try{
  expect(stage.getRootLayer().resolvedPath).toContain('typescript-usd-host-context:')
  for(const name of ['found','weak','clipped']){
   const row=expected.cases.find((row:{name:string})=>row.name===name)
   const value=stage.getPrim('/Asset')!.getAttr(name)!.getValueAtTime(1) as AssetPath
   expect(value.getResolvedPath().replaceAll(here,'$FIXTURE')).toBe(row.resolved)
  }
 }finally{stage.dispose()}
})
it('preserves a host resolver genuine opaque resolved URI',async()=>{
 class OpaqueResolver extends Resolver{
  override createIdentifier(path:string):string{return path}
  async resolve(path:string){return new ResolvedPath(path==='root.usda'?'opaque-resolved://stage.usda':'opaque-resolved://texture')}
  async openAsset(){return new InMemoryAsset(new TextEncoder().encode('#usda 1.0\ndef "Asset" {\n asset file = @image.png@\n}'))}
 }
 const stage=(await Stage.open('root.usda',{resolverContext:_resolverContextForResolver(new OpaqueResolver())}))!
 try{expect((stage.getPrim('/Asset')!.getAttr('file')!.getValue() as AssetPath).getResolvedPath()).toBe('opaque-resolved://texture')}
 finally{stage.dispose()}
})

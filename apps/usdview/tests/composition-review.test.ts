import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { Stage, Notice as UsdNotice } from 'typescript-usd/usd'
import { Notice as TfNotice } from 'typescript-usd/tf'
import { CompositionReview } from '../src/composition-review'
import { createHttpResolverContext } from '../src/http-resolver'
import expected from './fixtures/composition/expected.json'
async function open() {
  const base='https://composition.example/root.usda', root=new URL('./fixtures/composition/assets/',import.meta.url)
  const fetcher: typeof fetch = async input => { try {return new Response(await readFile(new URL(new URL(String(input)).pathname.slice(1),root),'utf8'))}catch{return new Response('',{status:404})} }
  return (await Stage.open(base,{resolverContext:createHttpResolverContext(base,undefined,fetcher)}))!
}
const rebuild=async()=>{}
describe('native26.08 review oracle / v26.11.1 usdview algorithms',()=>{
  it('authors session variants and visibility, isolates and resets without losing variants',async()=>{
    const stage=await open(), review=new CompositionReview(stage,()=>undefined), source=stage.getRootLayer().exportToString(), target=stage.getEditTarget()
    const vis=()=>Object.fromEntries(Object.keys(expected.hidden).map(path=>[path,review.state(path).visibility]))
    try {
      await review.apply({kind:'variant',path:'/World',set:'shape',selection:'sphere'},rebuild)
      expect(stage.getPrim('/World/Shape')?.typeName).toBe(expected.variantType)
      await review.apply({kind:'visibility',path:'/World',action:'hide'},rebuild);expect(vis()).toEqual(expected.hidden)
      await review.apply({kind:'visibility',path:'/World/Shape',action:'show'},rebuild);expect(vis()).toEqual(expected.shown)
      await review.apply({kind:'visibility',path:'/World/Shape',action:'isolate'},rebuild);expect(vis()).toEqual(expected.isolated)
      await review.apply({kind:'resetVisibility'},rebuild);expect(vis()).toEqual(expected.reset)
      expect(stage.getPrim('/World/Shape')?.typeName).toBe(expected.variantType)
      expect(stage.getRootLayer().exportToString()).toBe(source);expect(stage.getEditTarget()).toBe(target)
    }finally{stage.dispose()}
  })
  it('loadAndUnload loads a deferred set in one stage change and rolls back with the load rules',async()=>{
    const stage=await open(),review=new CompositionReview(stage,()=>undefined)
    try{
      await stage.unload('/World/Payload')
      expect(!!stage.getPrim('/World/Payload/Mesh')).toBe(expected.unloadedChild)
      await expect(review.apply({kind:'loadAndUnload',load:['/World/Payload'],unload:[]},async()=>{throw new Error('GPU rejected')})).rejects.toThrow('GPU rejected')
      expect(!!stage.getPrim('/World/Payload/Mesh')).toBe(expected.unloadedChild)
      let changes=0
      const key=TfNotice.Register(UsdNotice.ObjectsChanged,()=>{++changes})
      try{await review.apply({kind:'loadAndUnload',load:['/World/Payload'],unload:[]},rebuild)}finally{TfNotice.revoke(key)}
      expect(!!stage.getPrim('/World/Payload/Mesh')).toBe(expected.loadedChild)
      expect(changes).toBe(1)
      await expect(review.apply({kind:'loadAndUnload',load:['/Missing'],unload:[]},rebuild)).rejects.toThrow('Prim is no longer available: /Missing')
    }finally{stage.dispose()}
  })
  it('unloads/reloads payloads and restores state if candidate rebuild fails',async()=>{
    const stage=await open(),review=new CompositionReview(stage,()=>undefined)
    try{
      await review.apply({kind:'payload',path:'/World/Payload',loaded:false},rebuild)
      expect(!!stage.getPrim('/World/Payload/Mesh')).toBe(expected.unloadedChild)
      await review.apply({kind:'payload',path:'/World/Payload',loaded:true},rebuild)
      expect(!!stage.getPrim('/World/Payload/Mesh')).toBe(expected.loadedChild)
      const session=stage.getSessionLayer().exportToString()
      await expect(review.apply({kind:'visibility',path:'/World',action:'hide'},async()=>{throw new Error('GPU rejected')})).rejects.toThrow('GPU rejected')
      expect(stage.getSessionLayer().exportToString()).toBe(session)
      expect(review.state('/World').visibility).toBe('inherited')
      await expect(review.apply({kind:'payload',path:'/World/Payload',loaded:false},async()=>{throw new Error('GPU rejected')})).rejects.toThrow('GPU rejected')
      expect(!!stage.getPrim('/World/Payload/Mesh')).toBe(expected.loadedChild)
    }finally{stage.dispose()}
  })
  it('batches visibility reset and exposes only the native final state to observers',async()=>{
    const stage=await open(), review=new CompositionReview(stage,()=>undefined)
    try {
      await review.apply({kind:'visibility',path:'/World/Shape',action:'isolate'},rebuild)
      const snapshots: Record<string,string|null>[]=[]
      const key=TfNotice.Register(UsdNotice.ObjectsChanged,()=>{
        snapshots.push(Object.fromEntries(Object.keys(expected.reset).map(path=>[path,review.state(path).visibility])))
      },stage)
      try {
        await review.apply({kind:'resetVisibility'},rebuild)
        expect(snapshots).toEqual([expected.reset])
      } finally {key.revoke()}
    } finally {stage.dispose()}
  })
  it('does no authoring or renderer validation when resetting an empty session visibility set',async()=>{
    const stage=await open(),review=new CompositionReview(stage,()=>undefined)
    let rebuilds=0,notices=0
    const key=TfNotice.Register(UsdNotice.ObjectsChanged,()=>{notices++},stage)
    try {
      const text=stage.getSessionLayer().exportToString(),target=stage.getEditTarget()
      await review.apply({kind:'resetVisibility'},async()=>{rebuilds++})
      expect(rebuilds).toBe(0);expect(notices).toBe(0)
      expect(stage.getSessionLayer().exportToString()).toBe(text)
      expect(stage.getEditTarget()).toBe(target)
    } finally {key.revoke();stage.dispose()}
  })
  it('retains muted layers in the UI and protects root/session layers',async()=>{
    const stage=await open(),review=new CompositionReview(stage,()=>undefined)
    try{
      const id=review.state(null).layers.find(l=>l.identifier.endsWith('/colors.usda'))!.identifier
      await review.apply({kind:'layer',identifier:id,muted:true},rebuild)
      expect(review.state(null).layers.find(l=>l.identifier===id)?.muted).toBe(true)
      await review.apply({kind:'layer',identifier:id,muted:false},rebuild)
      expect(stage.isLayerMuted(id)).toBe(false)
      await expect(review.apply({kind:'layer',identifier:stage.getRootLayer().identifier,muted:true},rebuild)).rejects.toThrow('cannot be muted')
    }finally{stage.dispose()}
  })
})

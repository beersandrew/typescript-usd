// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/ar/defaultResolver.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { Stage } from 'typescript-usd/usd'
import { GetResolver, ResolvedPath, ResolverContextBinder } from 'typescript-usd/ar'
import { createLocalFileContext, createLocalFilesContext } from '../src/local-file-resolver'
import expected from './fixtures/local-assets/expected.json'
const fixture = new URL('./fixtures/local-assets/', import.meta.url)
async function fixtureFile(path: string) { return new File([new Uint8Array(await readFile(new URL(path, fixture)))], path.split('/').at(-1)!) }
async function mount() { return {rootPath:'root.usda',files:await Promise.all(['root.usda','layers/geometry.usda','textures/checker.png'].map(async path=>({path,file:await fixtureFile(path)})))} }
const assetText=async(context:Awaited<ReturnType<typeof createLocalFilesContext>>, path:string, anchor=context.url)=>new ResolverContextBinder(context.context).run(async()=>{
 const resolver=GetResolver(), identifier=resolver.createIdentifier(path,new ResolvedPath(anchor)); const resolved=await resolver.resolve(identifier);const asset=await resolver.openAsset(resolved);return new TextDecoder().decode(await asset!.getBuffer())
})

describe('local user asset mounts', () => {
  it('opens file bytes without fetching and isolates equal filenames', async () => {
    const contexts = await Promise.all(['A', 'B'].map(name => createLocalFileContext(new File([`#usda 1.0\ndef "${name}" {}\n`], 'scene.usda'))))
    expect(contexts[0]!.url).not.toBe(contexts[1]!.url)
    const stages = await Promise.all(contexts.map(({url, context}) => Stage.open(url, {resolverContext: context}).then(value => value!)))
    expect(stages.map(stage => [...stage.traverse()])).toEqual([['/A'], ['/B']])
    stages.forEach(stage => stage.dispose())
  })
  it.each(['root.usda','scene.usdz'] as const)('opens native layered fixture %s using the same USD package/composition path', async name=>{
    const context = name==='root.usda' ? await createLocalFilesContext(await mount()) : await createLocalFileContext(await fixtureFile(name))
    const stage=(await Stage.open(context.url,{resolverContext:context.context}))!
    try {
      context.assertComplete();expect(stage.getCompositionErrors()).toEqual([])
      expect([...stage.traverse()]).toEqual(expected.sources[name].prims)
      expect(stage.get('/World/Cube.size')!.getValue()).toBe(expected.sources[name].size)
    } finally {stage.dispose()}
  })
  it('reads package textures and nested packages with the existing Ar package resolver',async()=>{
    const context=await createLocalFileContext(await fixtureFile('scene.usdz'))
    for(const name of ['scene.usdz[textures/checker.png]','scene.usdz[nested.usdz[geometry.usda]]'] as const){
      const bytes=await new ResolverContextBinder(context.context).run(async()=>{
        const resolver=GetResolver(),url=context.url+name.slice('scene.usdz'.length)
        return (await resolver.openAsset(await resolver.resolve(url)))!.getBuffer()
      })
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(expected.sources[name].sha256)
    }
  })
  it('anchors nested local dependencies, preserving paths and literal filename punctuation',async()=>{
    const context=await createLocalFilesContext({rootPath:'folder/root.usda',files:[
      {path:'folder/root.usda',file:new File(['root'],'root.usda')},
      {path:'folder/nested/child.usda',file:new File(['child'],'child.usda')},
      {path:'folder/texture #?%20.png',file:new File(['correct'],'texture #?%20.png')},
      {path:'elsewhere/texture #?%20.png',file:new File(['wrong'],'texture #?%20.png')},
    ]})
    const anchor=new URL('nested/child.usda',context.url).href
    expect(await assetText(context,'../texture #?%20.png',anchor)).toBe('correct')
  })
  it('delegates authored HTTP dependencies and remote-relative children, never missing local files',async()=>{
    const sources:Record<string,string>={
      'https://remote.example/layers/child.usda':'#usda 1.0\n(subLayers=[@nested.usda@])\ndef "Remote" {}',
      'https://remote.example/layers/nested.usda':'#usda 1.0\ndef "Nested" {}',
    }
    const fetchAsset=vi.fn<typeof fetch>(async url=>new Response(sources[String(url)],{status:sources[String(url)]?200:404}))
    const context=await createLocalFileContext(new File(['#usda 1.0\n(subLayers=[@https://remote.example/layers/child.usda@])\ndef "Local" {}'],'root.usda'),undefined,fetchAsset)
    const stage=(await Stage.open(context.url,{resolverContext:context.context}))!
    try {context.assertComplete();expect(stage.getCompositionErrors()).toEqual([]);expect([...stage.traverse()]).toEqual(['/Nested','/Remote','/Local']);expect(fetchAsset.mock.calls.map(call=>call[0])).toEqual(Object.keys(sources))}finally{stage.dispose()}
    const count=fetchAsset.mock.calls.length
    // ArDefaultResolver resolves a missing file to an empty path (ar/defaultResolver.cpp:192,220).
    expect(await new ResolverContextBinder(context.context).run(async()=>{const r=GetResolver();return (await r.resolve(r.createIdentifier('missing.png',new ResolvedPath(context.url)))).valid})).toBe(false)
    expect(context.warnings()).toEqual([expect.stringContaining('Local file dependency is unavailable: missing.png')])
    expect(fetchAsset).toHaveBeenCalledTimes(count)
  })
  it('retains HTTP failures and propagates cancellation for remote dependencies of local scenes',async()=>{
    const file=new File(['#usda 1.0'],'root.usda')
    const missing=await createLocalFileContext(file,undefined,async()=>new Response('',{status:404,statusText:'Not Found'}))
    await expect(assetText(missing,'https://remote.example/missing.png')).rejects.toThrow('404 Not Found')
    expect(missing.assertComplete).not.toThrow()
    expect(missing.warnings()).toEqual([expect.stringContaining('404 Not Found')])
    const abort=new AbortController()
    let requested!:()=>void
    const started=new Promise<void>(resolve=>requested=resolve)
    const fetchAsset=vi.fn<typeof fetch>(async(_url,options)=>{
      expect(options?.signal).toBe(abort.signal);requested()
      return new Promise<Response>((_resolve,reject)=>options!.signal!.addEventListener('abort',()=>reject(options!.signal!.reason),{once:true}))
    })
    const context=await createLocalFileContext(file,abort.signal,fetchAsset)
    const pending=expect(assetText(context,'https://remote.example/texture.png')).rejects.toMatchObject({name:'AbortError'})
    await started;abort.abort();await pending
    expect(context.assertComplete).not.toThrow()
    expect(context.warnings()).toEqual([])
  })
  it('reports a missing sublayer as a composition error and a warning, as native does', async () => {
    const {url, context, assertComplete, warnings} = await createLocalFileContext(new File(['#usda 1.0\n(subLayers = [@child.usda@])\ndef "Root" {}\n'], 'root.usda'))
    const stage = (await Stage.open(url, {resolverContext: context}))!
    expect(assertComplete).not.toThrow()
    expect(warnings()).toEqual([expect.stringContaining('Local file dependency is unavailable: child.usda')])
    expect(stage.getCompositionErrors().map(String)).toEqual([expect.stringContaining('child.usda')])
    expect([...stage.traverse()]).toEqual(['/Root'])
    stage.dispose()
  })
  it('rejects duplicate/escaping mount paths and roots outside the supplied files',async()=>{
    const file=new File([''],'root.usda')
    for(const path of ['../root.usda','/root.usda','a/../root.usda','a\\root.usda'])await expect(createLocalFilesContext({rootPath:'root.usda',files:[{path,file}]})).rejects.toThrow('Invalid local asset path')
    await expect(createLocalFilesContext({rootPath:'root.usda',files:[{path:'root.usda',file},{path:'root.usda',file}]})).rejects.toThrow('Duplicate local asset path')
    await expect(createLocalFilesContext({rootPath:'root.usda',files:[]})).rejects.toThrow('Root scene is not among')
  })
  it('rejects dependency mount escape, absolute filesystem and unsupported schemes without fetching',async()=>{
    const fetchAsset=vi.fn<typeof fetch>(),context=await createLocalFileContext(new File([''],'root.usda'),undefined,fetchAsset)
    for(const path of ['../escape.usda','/tmp/asset.usda','file:///tmp/a.usda','//remote.example/a.usda','https://local-file.invalid/another/root.usda'])await expect(assetText(context,path)).rejects.toThrow()
    expect(fetchAsset).not.toHaveBeenCalled()
  })
  it('cancels pending local reads and rejects unsupported root types',async()=>{
    const abort=new AbortController(),file=new File(['#usda 1.0'],'root.usda')
    let complete!:(value:ArrayBuffer)=>void
    vi.spyOn(file,'arrayBuffer').mockReturnValue(new Promise(resolve=>complete=resolve))
    const context=await createLocalFileContext(file,abort.signal)
    const request=assetText(context,context.url);await new Promise(resolve=>setTimeout(resolve,0));abort.abort();complete(new ArrayBuffer(0))
    await expect(request).rejects.toMatchObject({name:'AbortError'})
    await expect(createLocalFileContext(file,abort.signal)).rejects.toMatchObject({name:'AbortError'})
    await expect(createLocalFileContext(new File([''],'a.txt'))).rejects.toThrow('root scene')
  })
})

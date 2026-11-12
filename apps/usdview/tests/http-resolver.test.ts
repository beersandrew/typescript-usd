// Portions ported from OpenUSD 26.11.1, including:
//  pxr/imaging/hio/stbImage.cpp
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { describe, expect, it, vi } from 'vitest'
import { GetAvailableResolvers, GetRegisteredURISchemes, GetResolver, GetUnderlyingResolver, DefaultResolver, ResolvedPath } from 'typescript-usd/ar'
import { Registry as PlugRegistry } from 'typescript-usd/plug'
import { Type as TfType } from 'typescript-usd/tf'
import { Stage } from 'typescript-usd/usd'
import { createHttpResolverContext, HttpResolver, UsdviewHttpResolver } from '../src/http-resolver.ts'

const root = 'https://assets.example/scenes/root.usda'
const bytes = '#usda 1.0\ndef "World" {}\n'

describe('HTTP resolver transport', () => {
  it('anchors relative dependencies to their owning layer and normalizes fragments', () => {
    const resolver = new HttpResolver(root)
    expect(resolver.createIdentifier('./child.usda')).toBe('https://assets.example/scenes/child.usda')
    expect(resolver.createIdentifier('../shared.usda', new ResolvedPath('https://assets.example/scenes/nested/ref.usda')))
      .toBe('https://assets.example/scenes/shared.usda')
    expect(resolver.createIdentifier('/models/a.usda#camera')).toBe('https://assets.example/models/a.usda')
    expect(resolver.createIdentifier('https://other.example/a.usda?version=1')).toBe('https://other.example/a.usda?version=1')
    expect(resolver.createIdentifier('')).toBe('')
    expect(() => resolver.createIdentifier('file:///tmp/a.usda')).toThrow('does not support file:')
  })

  it('returns downloaded bytes as an Ar asset', async () => {
    const fetchAsset = vi.fn<typeof fetch>().mockResolvedValue(new Response(bytes))
    const resolver = new HttpResolver(root, undefined, fetchAsset)
    const asset = await resolver.openAsset(await resolver.resolve(root))
    expect(new TextDecoder().decode(await asset!.getBuffer())).toBe(bytes)
    expect(fetchAsset).toHaveBeenCalledWith(root, {})
  })

  it('downloads an asset opened again while its bytes are held only once', async () => {
    const fetchAsset = vi.fn<typeof fetch>(async () => new Response(bytes))
    const resolver = new HttpResolver(root, undefined, fetchAsset)
    const path = await resolver.resolve(root)
    // Concurrent opens share the download in flight.
    const [a, b] = await Promise.all([resolver.openAsset(path), resolver.openAsset(path)])
    expect(fetchAsset).toHaveBeenCalledTimes(1)
    const held = await a!.getBuffer()
    expect(await b!.getBuffer()).toBe(held)
    // A later open finds the bytes a reader still holds.
    const c = await resolver.openAsset(path)
    expect(await c!.getBuffer()).toBe(held)
    expect(fetchAsset).toHaveBeenCalledTimes(1)
    expect(new TextDecoder().decode(held)).toBe(bytes)
  })

  it('does not keep a failed download for later opens', async () => {
    const fetchAsset = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 503, statusText: 'Service Unavailable' }))
      .mockResolvedValueOnce(new Response(bytes))
    const resolver = new HttpResolver(root, undefined, fetchAsset)
    await expect(resolver.openAsset(new ResolvedPath(root))).rejects.toThrow('503')
    const asset = await resolver.openAsset(new ResolvedPath(root))
    expect(new TextDecoder().decode(await asset!.getBuffer())).toBe(bytes)
    expect(fetchAsset).toHaveBeenCalledTimes(2)
  })

  it('reports HTTP failures and preserves network errors', async () => {
    const missing = new HttpResolver(root, undefined, vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 404, statusText: 'Not Found' })))
    await expect(missing.openAsset(new ResolvedPath(root))).rejects.toThrow('404 Not Found')
    const failure = new TypeError('Network unavailable')
    const offline = new HttpResolver(root, undefined, vi.fn<typeof fetch>().mockRejectedValue(failure))
    await expect(offline.openAsset(new ResolvedPath(root))).rejects.toBe(failure)
  })

  it('rejects already-aborted work without fetching', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetchAsset = vi.fn<typeof fetch>()
    const resolver = new HttpResolver(root, controller.signal, fetchAsset)
    await expect(resolver.resolve(root)).rejects.toMatchObject({ name: 'AbortError' })
    await expect(resolver.openAsset(new ResolvedPath(root))).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchAsset).not.toHaveBeenCalled()
  })

  it('forwards cancellation during a request', async () => {
    const controller = new AbortController()
    const fetchAsset = vi.fn<typeof fetch>((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal!.reason), { once: true })
    }))
    const resolver = new HttpResolver(root, controller.signal, fetchAsset)
    const request = resolver.openAsset(new ResolvedPath(root))
    controller.abort()
    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('per-load Ar contexts', () => {
  it('composes relative sublayers through the HTTP resolver', async () => {
    const sources: Record<string, string> = {
      [root]: '#usda 1.0\n(subLayers = [@./nested/child.usda@])\ndef "Root" {}\n',
      'https://assets.example/scenes/nested/child.usda': '#usda 1.0\n(subLayers = [@../shared.usda@])\ndef "Child" {}\n',
      'https://assets.example/scenes/shared.usda': '#usda 1.0\ndef "Shared" {}\n',
    }
    const fetchAsset = vi.fn<typeof fetch>(async url => new Response(sources[String(url)] ?? '', { status: sources[String(url)] ? 200 : 404 }))
    const stage = (await Stage.open(root, { resolverContext: createHttpResolverContext(root, undefined, fetchAsset) }))!
    expect([...stage.traverse()]).toEqual(['/Shared', '/Child', '/Root'])
    expect(fetchAsset).toHaveBeenCalledTimes(3)
  })

  it('isolates two simultaneous viewers and an aborted prior load without global replacement', async () => {
    const globalResolver = GetResolver()
    const cancelled = new AbortController()
    cancelled.abort()
    await expect(Stage.open(root, { resolverContext: createHttpResolverContext(root, cancelled.signal) })).rejects.toMatchObject({ name: 'AbortError' })
    const contextA = createHttpResolverContext(root, undefined, vi.fn<typeof fetch>().mockResolvedValue(new Response('#usda 1.0\ndef "A" {}\n')))
    const contextB = createHttpResolverContext(root, undefined, vi.fn<typeof fetch>().mockResolvedValue(new Response('#usda 1.0\ndef "B" {}\n')))
    expect(contextA.equals(contextB)).toBe(false)
    const [a, b] = await Promise.all([Stage.open(root, { resolverContext: contextA }).then(value => value!), Stage.open(root, { resolverContext: contextB }).then(value => value!)])
    expect([...a.traverse()]).toEqual(['/A'])
    expect([...b.traverse()]).toEqual(['/B'])
    expect(GetResolver()).toBe(globalResolver)
  })
})

describe('the viewer\'s Ar resolver plugin', () => {
  it('is a URI resolver plugin for http and https, not the primary resolver', () => {
    const type = TfType.findByName('UsdviewHttpResolver')
    expect(type.isA(TfType.findByName('ArResolver'))).toBe(true)
    expect(PlugRegistry.GetInstance().getPluginForType(type)?.getName()).toBe('usdview')
    expect(GetRegisteredURISchemes()).toEqual(expect.arrayContaining(['http', 'https', 'usdview-load']))
    expect(GetAvailableResolvers()).not.toContain(type)
    expect(GetUnderlyingResolver()).toBeInstanceOf(DefaultResolver)
  })

  it('resolves each load to resolved paths of its own, which open without a context', async () => {
    const texture = 'https://assets.example/scenes/texture.png'
    const fetchA = vi.fn<typeof fetch>(async () => new Response('A'))
    const fetchB = vi.fn<typeof fetch>(async () => new Response('B'))
    const contextA = createHttpResolverContext(root, undefined, fetchA)
    const contextB = createHttpResolverContext(root, undefined, fetchB)
    const resolver = GetResolver()
    const identifier = resolver.createIdentifier('./texture.png', new ResolvedPath(root))
    expect(identifier).toBe(texture)
    expect(resolver.isContextDependentPath(identifier)).toBe(true)
    const [a, b] = [await resolver.resolve(identifier, contextA), await resolver.resolve(identifier, contextB)]
    expect(a.toString()).toMatch(/^usdview-load:\d+:https:\/\/assets\.example\/scenes\/texture\.png$/)
    expect(a.toString()).not.toBe(b.toString())
    // Storm opens textures by resolved path alone (hio/stbImage.cpp:373-379).
    const read = async (path: ResolvedPath) => new TextDecoder().decode(await (await resolver.openAsset(path))!.getBuffer())
    expect([await read(a), await read(b)]).toEqual(['A', 'B'])
    expect(fetchA).toHaveBeenCalledWith(texture, {})
    expect(fetchB).toHaveBeenCalledWith(texture, {})
    // Paths relative to a load's resolved path anchor to its URL.
    expect(resolver.createIdentifier('../other.usda', a)).toBe('https://assets.example/other.usda')
    expect(GetResolver()).not.toBeInstanceOf(UsdviewHttpResolver)
  })
})

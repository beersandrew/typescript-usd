// Ported from OpenUSD 26.11.1: pxr/usd/ar/defaultResolver.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// The browser adaptations of Ar's filesystem and synchronous access
// (platformFilesystem.ts, prefetchedAssets.ts): plugin resource files resolve
// and open through the default resolver as installed files do upstream
// (defaultResolver.cpp:189-225,242-247), and assets read ahead are resolved
// and opened synchronously afterwards without further I/O.
import { afterEach, describe, expect, it } from 'vitest'
import { GetResolver as ArGetResolver, ResolvedPath as ArResolvedPath } from 'typescript-usd/ar'
import {
  _ArClearPrefetchedAssetsForTest,
  _ArOpenAssetSync,
  _ArPrefetchAsset,
  _ArReadAhead,
  _ArRegisterAssetPrefetcher,
  _ArResolveSync,
  _pathExists,
  _readFileSync,
  type _ArAssetReader,
} from 'typescript-usd/ar/_internal'
import { Registry as PlugRegistry } from 'typescript-usd/plug'

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
PlugRegistry.GetInstance().RegisterPlugins({
  Plugins: [{ Name: 'arTestResources', Type: 'resource', ResourcePath: '/usd/arTestResources/resources', Info: {} }],
}, { arTestResources: { 'textures/image.png': png, 'shaders/a.glslfx': 'text', 'lazy.txt': async () => 'lazy' } })

afterEach(() => _ArClearPrefetchedAssetsForTest())

describe('plugin resource files', () => {
  it('resolve and open through ArGetResolver as files', async () => {
    const resolver = ArGetResolver()
    const resolved = await resolver.resolve('/usd/arTestResources/resources/textures/image.png')
    expect(resolved.toString()).toBe('/usd/arTestResources/resources/textures/image.png')
    expect(await (await resolver.openAsset(resolved))!.getBuffer()).toEqual(png)
    const text = await resolver.openAsset(new ArResolvedPath('/usd/arTestResources/resources/shaders/a.glslfx'))
    expect(new TextDecoder().decode(await text!.getBuffer())).toBe('text')
    const lazy = await resolver.openAsset(new ArResolvedPath('/usd/arTestResources/resources/lazy.txt'))
    expect(new TextDecoder().decode(await lazy!.getBuffer())).toBe('lazy')
    expect((await resolver.resolve('/usd/arTestResources/resources/missing.png')).valid).toBe(false)
  })

  it('exist and read synchronously, except async loaders', () => {
    expect(_pathExists('/usd/arTestResources/resources/textures/image.png')).toBe(true)
    expect(_readFileSync('/usd/arTestResources/resources/textures/image.png')).toEqual(png)
    expect(_readFileSync('/usd/arTestResources/resources/lazy.txt')).toBeUndefined()
    expect(_ArResolveSync('/usd/arTestResources/resources/shaders/a.glslfx').toString())
      .toBe('/usd/arTestResources/resources/shaders/a.glslfx')
  })
})

describe('assets read ahead', () => {
  const assets = new Map([['https://host.example/a.prefetchtest', 'A'], ['https://host.example/b.prefetchtest', 'B']])
  let opens = 0
  const reader: _ArAssetReader = {
    resolve: async path => new ArResolvedPath(assets.has(path) ? path : ''),
    openAsset: async path => {
      opens++
      const text = assets.get(path.toString())
      return text === undefined ? undefined : { getSize: () => text.length, getBuffer: async () => new TextEncoder().encode(text), read: async () => new Uint8Array(), getDetachedAsset: async () => { throw new Error() } }
    },
  }

  it('resolve and open synchronously after _ArReadAhead', async () => {
    expect(_ArResolveSync('https://host.example/a.prefetchtest').valid).toBe(false)
    const read = await _ArReadAhead('https://host.example/a.prefetchtest', reader)
    expect(read!.resolvedPath.toString()).toBe('https://host.example/a.prefetchtest')
    expect(_ArResolveSync('https://host.example/a.prefetchtest').toString()).toBe('https://host.example/a.prefetchtest')
    const asset = _ArOpenAssetSync(new ArResolvedPath('https://host.example/a.prefetchtest'))
    expect(new TextDecoder().decode(asset!.getBuffer())).toBe('A')
    expect(await _ArReadAhead('https://host.example/missing.prefetchtest', reader)).toBeUndefined()
  })

  it('runs the prefetcher registered for the extension, once per concurrent request', async () => {
    const seen: string[] = []
    _ArRegisterAssetPrefetcher(['PrefetchTest'], async (resolvedPath, r) => {
      seen.push(resolvedPath.toString())
      await _ArReadAhead(resolvedPath.toString(), r)
    })
    opens = 0
    const b = new ArResolvedPath('https://host.example/b.prefetchtest')
    await Promise.all([_ArPrefetchAsset(b, reader), _ArPrefetchAsset(b, reader)])
    await _ArPrefetchAsset(new ArResolvedPath('https://host.example/b.other'), reader)
    expect(seen).toEqual(['https://host.example/b.prefetchtest'])
    expect(opens).toBe(1)
    expect(new TextDecoder().decode(_ArOpenAssetSync(b)!.getBuffer())).toBe('B')
  })
})

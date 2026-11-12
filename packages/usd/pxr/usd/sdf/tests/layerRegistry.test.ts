// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/sdf/usdaFileFormat.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _sdfFindOrOpenLayer } from 'typescript-usd/sdf/_internal'
import { describe, expect, it } from 'vitest'
import { Asset as ArAsset, InMemoryAsset as ArInMemoryAsset, ResolvedPath as ArResolvedPath, Resolver as ArResolver, ResolverContext as ArResolverContext } from 'typescript-usd/ar'
import { Layer, createUsdzPackage } from 'typescript-usd/sdf'
import { TfErrorMark } from 'typescript-usd/tf'

const USDA = new TextEncoder().encode('#usda 1.0\n\ndef "Root" {}\n')
let sequence = 0

class TestContext { constructor(readonly root: string) {} }

class TestResolver extends ArResolver {
  opens = 0
  failNext = false
  constructor(private readonly aliases = new Map<string, string>()) { super() }
  isContextDependentPath(path: string): boolean { return path.startsWith('context-') }

  async resolve(path: string, context?: ArResolverContext): Promise<ArResolvedPath> {
    const root = context?.get(TestContext)?.root ?? '/assets'
    return new ArResolvedPath(this.aliases.get(path) ?? `${root}/${path}`)
  }

  async openAsset(): Promise<ArAsset | undefined> {
    this.opens++
    await Promise.resolve()
    if (this.failNext) { this.failNext = false; return undefined }
    return new ArInMemoryAsset(USDA)
  }
}

function id(name: string): string { return `${name}-${++sequence}.usda` }

describe('Sdf layer identity registry', () => {
  it('converges sequential and concurrent opens and reads once', async () => {
    const resolver = new TestResolver()
    const path = id('concurrent')
    const [first, second] = await Promise.all([
      _sdfFindOrOpenLayer(path, resolver).then(value => value!),
      _sdfFindOrOpenLayer(path, resolver).then(value => value!),
    ])
    expect(first).toBe(second)
    expect(await _sdfFindOrOpenLayer(path, resolver)).toBe(first)
    expect(resolver.opens).toBe(1)
  })

  it('converges identifier aliases through their resolved path', async () => {
    const suffix = ++sequence
    const aliases = new Map([
      [`alias-a-${suffix}.usda`, `/real/shared-${suffix}.usda`],
      [`alias-b-${suffix}.usda`, `/real/shared-${suffix}.usda`],
    ])
    const resolver = new TestResolver(aliases)
    const first = (await _sdfFindOrOpenLayer(`alias-a-${suffix}.usda`, resolver))!
    const second = (await _sdfFindOrOpenLayer(`alias-b-${suffix}.usda`, resolver))!
    expect(second).toBe(first)
    expect(resolver.opens).toBe(1)
  })

  it('uses resolution results, rather than resolver contexts, as identity', async () => {
    const resolver = new TestResolver()
    const path = id('context')
    const sameA = (await _sdfFindOrOpenLayer(path, resolver, new ArResolverContext(new TestContext('/same'))))!
    const sameB = (await _sdfFindOrOpenLayer(path, resolver, new ArResolverContext(new TestContext('/same'))))!
    const different = (await _sdfFindOrOpenLayer(path, resolver, new ArResolverContext(new TestContext('/different'))))!
    expect(sameB).toBe(sameA)
    expect(different).not.toBe(sameA)
  })

  it('trusts a context-independent identifier even with a non-empty context', async () => {
    const resolver = new TestResolver()
    const path = id('independent')
    const first = (await _sdfFindOrOpenLayer(path, resolver, new ArResolverContext(new TestContext('/one'))))!
    const second = (await _sdfFindOrOpenLayer(path, resolver, new ArResolverContext(new TestContext('/two'))))!
    expect(second).toBe(first)
    expect(resolver.opens).toBe(1)
  })

  it('canonicalizes file-format arguments and includes them in identity', async () => {
    const resolver = new TestResolver()
    const path = id('args')
    const first = (await _sdfFindOrOpenLayer(`${path}:SDF_FORMAT_ARGS:z=2&a=1`, resolver))!
    const reordered = (await _sdfFindOrOpenLayer(`${path}:SDF_FORMAT_ARGS:a=1&z=2`, resolver))!
    const different = (await _sdfFindOrOpenLayer(`${path}:SDF_FORMAT_ARGS:a=other&z=2`, resolver))!
    expect(reordered).toBe(first)
    expect(different).not.toBe(first)
  })

  it('keeps anonymous layers with the same display tag distinct', () => {
    const first = Layer.createAnonymous('session')
    const second = Layer.createAnonymous('session')
    expect(second).not.toBe(first)
    expect(second.filePath).not.toBe(first.filePath)
    expect(first.filePath).toContain(':session')
    expect(first.getDisplayName()).toBe('session')
    expect(second.getDisplayName()).toBe('session')
  })

  it('removes a failed open from the in-flight table', async () => {
    const resolver = new TestResolver()
    resolver.failNext = true
    const path = id('retry')
    // An asset Ar cannot open fails the format's Read without an error
    // (usdaFileFormat.cpp:300-305): no layer.
    const mark = new TfErrorMark()
    expect(await _sdfFindOrOpenLayer(path, resolver)).toBeUndefined()
    expect(mark.isClean()).toBe(true)
    mark.dispose()
    const layer = (await _sdfFindOrOpenLayer(path, resolver))!
    expect(layer.getField('/Root', 'specifier')).toBe('def')
    expect(resolver.opens).toBe(2)
  })

  it('opens a package-inner layer directly with stable identity', async () => {
    const suffix = ++sequence
    const packageName = `direct-${suffix}.usdz`
    const packageBytes = createUsdzPackage([{ name: 'layers/root.usda', data: USDA }])
    const resolver = new (class extends ArResolver {
      opens = 0
      async resolve(path: string): Promise<ArResolvedPath> {
        return new ArResolvedPath(path === packageName ? `/resolved/${packageName}` : '')
      }
      async openAsset(): Promise<ArAsset> {
        this.opens++
        return new ArInMemoryAsset(packageBytes)
      }
    })()
    const path = `${packageName}[layers/root.usda]`
    const first = (await _sdfFindOrOpenLayer(path, resolver))!
    const second = (await _sdfFindOrOpenLayer(path, resolver))!
    expect(second).toBe(first)
    expect(first.filePath).toBe(path)
    expect(first.getField('/Root', 'specifier')).toBe('def')
    expect(resolver.opens).toBe(1)
  })

  it('opens a layer through nested packages with stable identity', async () => {
    const suffix = ++sequence
    const packageName = `outer-${suffix}.usdz`
    const nested = createUsdzPackage([{ name: 'root.usda', data: USDA }])
    const outer = createUsdzPackage([{ name: 'nested.usdz', data: nested }])
    const resolver = new (class extends ArResolver {
      opens = 0
      async resolve(path: string): Promise<ArResolvedPath> {
        return new ArResolvedPath(path === packageName ? `/resolved/${packageName}` : '')
      }
      async openAsset(): Promise<ArAsset> {
        this.opens++
        return new ArInMemoryAsset(outer)
      }
    })()
    const path = `${packageName}[nested.usdz[root.usda]]`
    const [first, second] = await Promise.all([
      _sdfFindOrOpenLayer(path, resolver).then(value => value!),
      _sdfFindOrOpenLayer(path, resolver).then(value => value!),
    ])
    expect(second).toBe(first)
    expect(first.filePath).toBe(path)
    expect(first.getField('/Root', 'specifier')).toBe('def')
    expect(resolver.opens).toBe(1)
  })
})

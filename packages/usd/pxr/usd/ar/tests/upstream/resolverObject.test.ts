import { describe, expect, it } from 'vitest'
import {
  Asset as ArAsset, DefaultResolver as ArDefaultResolver, DefaultResolverContext as ArDefaultResolverContext, InMemoryAsset as ArInMemoryAsset,
  ResolvedPath as ArResolvedPath, Resolver as ArResolver, ResolverContext as ArResolverContext,
} from '../../src/index.ts'
import { ArInMemoryResolver } from '../../src/internal.ts'

class NamespaceContext { constructor(readonly namespace: string) {} }
class ContextResolver extends ArResolver {
  isContextDependentPath(path: string): boolean { return path.endsWith('.usda') }
  async resolve(path: string, context?: ArResolverContext): Promise<ArResolvedPath> {
    const namespace = context?.get(NamespaceContext)?.namespace
    return new ArResolvedPath(namespace ? `${namespace}/${path}` : '')
  }
  async openAsset(path: ArResolvedPath): Promise<ArAsset | undefined> {
    return new ArInMemoryAsset(new TextEncoder().encode(path.toString()))
  }
}

describe('ArResolver objects', () => {
  it('resolves and opens an ArAsset instead of returning raw bytes', async () => {
    const resolver = new ArInMemoryResolver({ 'root.usda': new TextEncoder().encode('#usda 1.0\n') })
    const resolved = await resolver.resolve('root.usda')
    const asset = await resolver.openAsset(resolved)
    expect(resolved).toEqual(new ArResolvedPath('root.usda'))
    expect(asset).toBeInstanceOf(ArAsset)
    expect(new TextDecoder().decode(await asset!.getBuffer())).toBe('#usda 1.0\n')
  })

  it('passes explicit resolver context into resolution', async () => {
    const resolver = new ContextResolver()
    const context = new ArResolverContext(new NamespaceContext('shot-010'))
    const resolved = await resolver.resolve('root.usda', context)
    expect(resolved.toString()).toBe('shot-010/root.usda')
    expect(resolver.isContextDependentPath('root.usda')).toBe(true)
    expect(resolver.isContextDependentPath('texture.png')).toBe(false)
  })

  it('provides the registered advanced lifecycle defaults', async () => {
    const resolver = new ArDefaultResolver()
    expect(resolver.getExtension('archive.usdz[layer/model.usdc]')).toBe('usdc')
    expect(resolver.getExtension('asset')).toBe('')
    expect(resolver.createIdentifierForNewAsset(
      '../asset.usda', new ArResolvedPath('/show/layers/root.usda')))
      .toBe('/show/asset.usda')
    expect((await resolver.resolveForNewAsset('/tmp/new.usda')).toString())
      .toBe('/tmp/new.usda')
    expect(resolver.canWriteAssetToPath(new ArResolvedPath('/tmp/new.usda'))).toBe(true)
  })

  it('compares resolver context objects by their value semantics', () => {
    const first = new ArResolverContext(new ArDefaultResolverContext(['/show']))
    const second = new ArResolverContext(new ArDefaultResolverContext(['/show']))
    expect(first).not.toBe(second)
    expect(first.equals(second)).toBe(true)
    expect(first.equals(new ArResolverContext(
      new ArDefaultResolverContext(['/other'])))).toBe(false)
  })
})

// PLATFORM-DIVERGENCE(ar-resolver-late-registration) (ar/src/resolver.ts):
// URI and package resolver plugins registered after ArGetResolver() created
// the dispatching resolver are found when next used, and a type its plugin
// declares before its module defines it is manufactured once it is defined.
// The primary resolver stays the one chosen first.
import { describe, expect, it } from 'vitest'
import {
  type Asset as ArAsset,
  DefaultResolver as ArDefaultResolver,
  DefinePackageResolver as ArDefinePackageResolver,
  DefineResolver as ArDefineResolver,
  GetRegisteredURISchemes as ArGetRegisteredURISchemes,
  GetResolver as ArGetResolver,
  GetUnderlyingResolver as ArGetUnderlyingResolver,
  InMemoryAsset as ArInMemoryAsset,
  PackageResolver as ArPackageResolver,
  ResolvedPath as ArResolvedPath,
  Resolver as ArResolver,
} from '../../src/index.ts'
import { _resetResolverForTest } from '../../src/internal.ts'
import { Registry as PlugRegistry } from 'typescript-usd/plug'

class LateResolver extends ArResolver {
  override createIdentifier(assetPath: string): string { return assetPath }
  async resolve(assetPath: string): Promise<ArResolvedPath> { return new ArResolvedPath(assetPath) }
  async openAsset(): Promise<ArAsset | undefined> { return new ArInMemoryAsset(new TextEncoder().encode('late')) }
}

class EarlyDeclaredResolver extends LateResolver {
  override async resolve(assetPath: string): Promise<ArResolvedPath> { return new ArResolvedPath(`${assetPath}?defined`) }
}

class LatePackageResolver extends ArPackageResolver {
  async resolve(_packagePath: string, packagedPath: string): Promise<string> { return packagedPath }
  async openAsset(): Promise<ArAsset | undefined> { return undefined }
  beginCacheScope(data?: unknown): unknown { return data }
  endCacheScope(): void {}
}

describe('resolver plugins registered after ArGetResolver()', () => {
  it('dispatches to URI and package resolvers registered later', async () => {
    _resetResolverForTest()
    const resolver = ArGetResolver()
    expect(ArGetRegisteredURISchemes()).not.toContain('late')

    ArDefineResolver('_LateResolver', LateResolver)
    ArDefinePackageResolver('_LatePackageResolver', LatePackageResolver)
    PlugRegistry.GetInstance().RegisterPlugins({ Plugins: [{
      Type: 'library',
      Name: 'LateResolverPlugin',
      Info: {
        Types: {
          _LateResolver: { bases: ['ArResolver'], uriSchemes: ['late'] },
          _LatePackageResolver: { bases: ['ArPackageResolver'], extensions: ['latepkg'] },
        },
      },
    }] })

    expect(ArGetRegisteredURISchemes()).toContain('late')
    expect((await resolver.resolve('late:a')).toString()).toBe('late:a')
    expect((await resolver.resolve('late:a.latepkg[inner.usda]')).toString()).toBe('late:a.latepkg[inner.usda]')
    // The primary resolver is the one chosen first.
    expect(ArGetUnderlyingResolver()).toBeInstanceOf(ArDefaultResolver)
  })

  it('manufactures a declared type once its module defines it', async () => {
    _resetResolverForTest()
    PlugRegistry.GetInstance().RegisterPlugins({ Plugins: [{
      Type: 'library',
      Name: 'EarlyDeclaredResolverPlugin',
      Info: { Types: { _EarlyDeclaredResolver: { bases: ['ArResolver'], uriSchemes: ['early'] } } },
    }] })
    const resolver = ArGetResolver()
    expect(ArGetRegisteredURISchemes()).toContain('early')
    // Not defined yet: the primary resolver handles the path.
    expect((await resolver.resolve('early:a')).toString()).toBe('')

    ArDefineResolver('_EarlyDeclaredResolver', EarlyDeclaredResolver)
    expect((await resolver.resolve('early:a')).toString()).toBe('early:a?defined')
  })
})

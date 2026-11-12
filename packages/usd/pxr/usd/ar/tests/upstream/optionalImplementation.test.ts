// Ported from OpenUSD 26.11.1:
//  pxr/usd/ar/testenv/TestArOptionalImplementation_plugin.cpp,
//  pxr/usd/ar/testenv/testArOptionalImplementation.py
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ports pxr/usd/ar/testenv/testArOptionalImplementation.py, registered
// (pxr/usd/ar/CMakeLists.txt:118-156) as testArOptionalImplementation_1,
// testArOptionalImplementation_2, testArOptionalImplementation_3,
// testArOptionalImplementation_4 and testArOptionalImplementation_5 with the
// TestArOptionalImplementation_plugin.cpp resolvers and their plugInfo.json
// metadata. Each registered test runs one preferred resolver in a fresh
// process and diffs the printed hook names against
// testArOptionalImplementation/baseline/*.txt.

import { beforeAll, describe, expect, it } from 'vitest'
import {
  type Asset as ArAsset,
  GetResolver as ArGetResolver,
  ResolvedPath as ArResolvedPath,
  Resolver as ArResolver,
  ResolverContext as ArResolverContext,
  ResolverContextBinder as ArResolverContextBinder,
  ResolverScopedCache as ArResolverScopedCache,
  DefineResolver as ArDefineResolver,
  SetPreferredResolver as ArSetPreferredResolver,
} from '../../src/index.ts'
import { _resetResolverForTest } from '../../src/internal.ts'
import { Registry as PlugRegistry } from 'typescript-usd/plug'

const printed: string[] = []

// _TestResolver (TestArOptionalImplementation_plugin.cpp:18-109).
class _TestResolver extends ArResolver {
  private printFunctionName(name: string): void { printed.push(name) }

  override bindContext(): void { this.printFunctionName('_BindContext') }
  override unbindContext(): void { this.printFunctionName('_UnbindContext') }
  override createDefaultContext(): ArResolverContext {
    this.printFunctionName('_CreateDefaultContext')
    return new ArResolverContext()
  }
  override createDefaultContextForAsset(): ArResolverContext {
    this.printFunctionName('_CreateDefaultContextForAsset')
    return new ArResolverContext()
  }
  override createContextFromString(contextStr: string): ArResolverContext
  override createContextFromString(uriScheme: string, contextStr: string): ArResolverContext
  override createContextFromString(first: string, second?: string): ArResolverContext {
    if (second !== undefined) return super.createContextFromString(first, second)
    this.printFunctionName('_CreateContextFromString')
    return new ArResolverContext()
  }
  override refreshContext(): void { this.printFunctionName('_RefreshContext') }
  override getCurrentContext(): ArResolverContext {
    this.printFunctionName('_GetCurrentContext')
    return new ArResolverContext()
  }
  override isContextDependentPath(): boolean {
    this.printFunctionName('_IsContextDependentPath')
    return false
  }
  override beginCacheScope(cacheScopeData?: unknown): unknown {
    this.printFunctionName('_BeginCacheScope')
    return cacheScopeData
  }
  override endCacheScope(): void { this.printFunctionName('_EndCacheScope') }

  // Dummy implementations of pure virtuals that aren't called in this test.
  override createIdentifier(): string { return '' }
  override createIdentifierForNewAsset(): string { return '' }
  async resolve(): Promise<ArResolvedPath> { return new ArResolvedPath() }
  override async resolveForNewAsset(): Promise<ArResolvedPath> { return new ArResolvedPath() }
  async openAsset(): Promise<ArAsset | undefined> { return undefined }
}

class _TestResolverWithContextMethods extends _TestResolver {}
class _TestDerivedResolverWithContextMethods extends _TestResolverWithContextMethods {}
class _TestResolverWithCacheMethods extends _TestResolver {}
class _TestDerivedResolverWithCacheMethods extends _TestResolverWithCacheMethods {}

beforeAll(() => {
  // TestArOptionalImplementation_plugin.cpp:111-146 (AR_DEFINE_RESOLVER).
  ArDefineResolver('_TestResolver', _TestResolver, ['ArResolver'])
  ArDefineResolver('_TestResolverWithContextMethods', _TestResolverWithContextMethods, ['_TestResolver'])
  ArDefineResolver('_TestDerivedResolverWithContextMethods', _TestDerivedResolverWithContextMethods,
    ['_TestResolverWithContextMethods'])
  ArDefineResolver('_TestResolverWithCacheMethods', _TestResolverWithCacheMethods, ['_TestResolver'])
  ArDefineResolver('_TestDerivedResolverWithCacheMethods', _TestDerivedResolverWithCacheMethods,
    ['_TestResolverWithCacheMethods'])
  // TestArOptionalImplementation_plugInfo.json, a plugin of this test (nothing
  // to load).
  PlugRegistry.GetInstance().RegisterPlugins({ Plugins: [{
    Type: 'library',
    Name: 'TestArOptionalImplementation',
    Info: {
      Types: {
        _TestResolver: { bases: ['ArResolver'] },
        _TestResolverWithContextMethods: { bases: ['_TestResolver'], implementsContexts: true },
        _TestDerivedResolverWithContextMethods: { bases: ['_TestResolverWithContextMethods'] },
        _TestResolverWithCacheMethods: { bases: ['_TestResolver'], implementsScopedCaches: true },
        _TestDerivedResolverWithCacheMethods: { bases: ['_TestResolverWithCacheMethods'] },
      },
    },
  }] })
})

// testArOptionalImplementation.py:33-55.
function runTest(resolverName: string): string[] {
  _resetResolverForTest()
  printed.length = 0
  ArSetPreferredResolver(resolverName)
  const r = ArGetResolver()

  new ArResolverContextBinder(new ArResolverContext()).run(() => undefined)

  r.createDefaultContext()
  r.createDefaultContextForAsset('foo')
  r.createContextFromString('foo')
  r.refreshContext(new ArResolverContext())
  r.getCurrentContext()
  r.isContextDependentPath('foo')

  new ArResolverScopedCache().run(() => undefined)
  return [...printed]
}

const CONTEXT_METHODS = [
  '_BindContext',
  '_UnbindContext',
  '_CreateDefaultContext',
  '_CreateDefaultContextForAsset',
  '_CreateContextFromString',
  '_RefreshContext',
  '_GetCurrentContext',
  '_IsContextDependentPath',
]

const CACHE_METHODS = ['_BeginCacheScope', '_EndCacheScope']

describe('testArOptionalImplementation', () => {
  it('testArOptionalImplementation_1: _TestResolver (base.txt)', () => {
    expect(runTest('_TestResolver')).toEqual([])
  })

  it('testArOptionalImplementation_2: _TestResolverWithContextMethods', () => {
    expect(runTest('_TestResolverWithContextMethods')).toEqual(CONTEXT_METHODS)
  })

  it('testArOptionalImplementation_3: _TestDerivedResolverWithContextMethods', () => {
    expect(runTest('_TestDerivedResolverWithContextMethods')).toEqual(CONTEXT_METHODS)
  })

  it('testArOptionalImplementation_4: _TestResolverWithCacheMethods', () => {
    expect(runTest('_TestResolverWithCacheMethods')).toEqual(CACHE_METHODS)
  })

  it('testArOptionalImplementation_5: _TestDerivedResolverWithCacheMethods', () => {
    expect(runTest('_TestDerivedResolverWithCacheMethods')).toEqual(CACHE_METHODS)
  })
})

// Ported from OpenUSD 26.11.1:
//  pxr/usd/ar/testenv/TestArPackageResolver_plugin.cpp,
//  pxr/usd/ar/testenv/TestArURIResolver_plugin.cpp,
//  pxr/usd/ar/testenv/testArURIResolver.cpp,
//  pxr/usd/ar/testenv/testArURIResolver.py
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ports pxr/usd/ar/testenv/testArURIResolver.py (testArURIResolver) and
// testArURIResolver.cpp (testArURIResolver_CPP), with the test plugins
// TestArURIResolver_plugin.cpp / TestArPackageResolver_plugin.cpp and their
// plugInfo.json registered with PlugRegistry.RegisterPlugins and their
// AR_DEFINE_RESOLVER / AR_DEFINE_PACKAGE_RESOLVER calls ported as ArDefineResolver
// / ArDefinePackageResolver.

import { beforeAll, describe, expect, it } from 'vitest'
import { delimiter, join, resolve as absPath } from 'node:path'
import {
  type Asset as ArAsset,
  DefaultResolverContext as ArDefaultResolverContext,
  GetRegisteredURISchemes as ArGetRegisteredURISchemes,
  GetResolver as ArGetResolver,
  PackageResolver as ArPackageResolver,
  ResolvedPath as ArResolvedPath,
  Resolver as ArResolver,
  ResolverContext as ArResolverContext,
  ResolverContextBinder as ArResolverContextBinder,
  SetPreferredResolver as ArSetPreferredResolver,
  DefinePackageResolver as ArDefinePackageResolver,
  DefineResolver as ArDefineResolver,
  type WritableAsset as ArWritableAsset,
} from '../../src/index.ts'
import { _resetResolverForTest } from '../../src/internal.ts'
import { Registry as PlugRegistry } from 'typescript-usd/plug'
import { Type as TfType } from 'typescript-usd/tf'

function toLowerAscii(value: string): string {
  return value.replace(/[A-Z]/g, character => character.toLowerCase())
}

function axiom(condition: boolean): void {
  if (!condition) throw new Error('TF_AXIOM failed')
}

// _TestURIResolverContext (TestArURIResolver_plugin.h:15-31).
class _TestURIResolverContext {
  constructor(readonly data = '') {}
  lessThan(rhs: _TestURIResolverContext): boolean { return this.data < rhs.data }
  equals(rhs: _TestURIResolverContext): boolean { return this.data === rhs.data }
  hash(): number {
    let hash = 0x811c9dc5
    for (let index = 0; index < this.data.length; index++) {
      hash = Math.imul(hash ^ this.data.charCodeAt(index), 0x01000193) >>> 0
    }
    return hash
  }
}

// _TestURIResolverBase (TestArURIResolver_plugin.cpp:27-122).
class _TestURIResolverBase extends ArResolver {
  private readonly uriScheme: string
  constructor(uriScheme: string) {
    super()
    this.uriScheme = `${uriScheme}:`
  }

  private handles(path: string): boolean { return toLowerAscii(path).startsWith(this.uriScheme) }

  override createIdentifier(assetPath: string, anchor = new ArResolvedPath()): string {
    axiom(this.handles(assetPath) || this.handles(anchor.toString()))
    return assetPath
  }

  override createIdentifierForNewAsset(assetPath: string, anchor = new ArResolvedPath()): string {
    axiom(this.handles(assetPath) || this.handles(anchor.toString()))
    return assetPath
  }

  async resolve(assetPath: string, context = this.getCurrentContext()): Promise<ArResolvedPath> {
    axiom(this.handles(assetPath))
    const uriContext = context.get(_TestURIResolverContext)
    if (uriContext && uriContext.data !== '') {
      return new ArResolvedPath(`${assetPath}?${uriContext.data}`)
    }
    return new ArResolvedPath(assetPath)
  }

  override resolveForNewAsset(
    assetPath: string,
    context = this.getCurrentContext(),
  ): Promise<ArResolvedPath> {
    return this.resolve(assetPath, context)
  }

  override createDefaultContext(): ArResolverContext {
    return new ArResolverContext(new _TestURIResolverContext('CreateDefaultContext'))
  }

  override createDefaultContextForAsset(assetPath: string): ArResolverContext {
    return new ArResolverContext(new _TestURIResolverContext(absPath(assetPath)))
  }

  async openAsset(resolvedPath: ArResolvedPath): Promise<ArAsset | undefined> {
    axiom(this.handles(resolvedPath.toString()))
    return undefined
  }

  override createContextFromString(contextStr: string): ArResolverContext
  override createContextFromString(uriScheme: string, contextStr: string): ArResolverContext
  override createContextFromString(first: string, second?: string): ArResolverContext {
    if (second !== undefined) return super.createContextFromString(first, second)
    return new ArResolverContext(new _TestURIResolverContext(first))
  }

  override async openAssetForWrite(resolvedPath: ArResolvedPath): Promise<ArWritableAsset | undefined> {
    axiom(this.handles(resolvedPath.toString()))
    return undefined
  }
}

// _TestPackageResolver (TestArPackageResolver_plugin.cpp:19-50).
class _TestPackageResolver extends ArPackageResolver {
  async resolve(resolvedPackagePath: string, packagedPath: string): Promise<string> {
    axiom(toLowerAscii(resolvedPackagePath.slice(resolvedPackagePath.lastIndexOf('.') + 1)) === 'package')
    return packagedPath
  }
  async openAsset(): Promise<ArAsset | undefined> { return undefined }
  beginCacheScope(cacheScopeData?: unknown): unknown { return cacheScopeData }
  endCacheScope(): void {}
}

function sameContext(lhs: ArResolverContext, rhs: ArResolverContext): void {
  expect(lhs.equals(rhs)).toBe(true)
}

// TestArURIResolver_plugin.cpp:124-190: one class per URI scheme.
class _TestURIResolver extends _TestURIResolverBase { constructor() { super('test') } }
class _TestOtherURIResolver extends _TestURIResolverBase { constructor() { super('test-other') } }
class _TestInvalidUnderbarURIResolver extends _TestURIResolverBase { constructor() { super('test_other') } }
class _TestInvalidColonURIResolver extends _TestURIResolverBase { constructor() { super('other:test') } }
class _TestInvalidNonAsciiURIResolver extends _TestURIResolverBase { constructor() { super('test-π-utf8') } }
class _TestInvalidNumericPrefixResolver extends _TestURIResolverBase { constructor() { super('113-test') } }

beforeAll(() => {
  // TestArURIResolver_plugin.cpp:192-205: TfType::Define for the abstract
  // base, AR_DEFINE_RESOLVER for the rest.
  TfType.define('_TestURIResolverBase', [TfType.findByName('ArResolver')])
  for (const [typeName, resolverClass] of [
    ['_TestURIResolver', _TestURIResolver],
    ['_TestOtherURIResolver', _TestOtherURIResolver],
    ['_TestInvalidUnderbarURIResolver', _TestInvalidUnderbarURIResolver],
    ['_TestInvalidColonURIResolver', _TestInvalidColonURIResolver],
    ['_TestInvalidNonAsciiURIResolver', _TestInvalidNonAsciiURIResolver],
    ['_TestInvalidNumericPrefixResolver', _TestInvalidNumericPrefixResolver],
  ] as const) ArDefineResolver(typeName, resolverClass, ['_TestURIResolverBase'])
  // TestArPackageResolver_plugin.cpp:52.
  ArDefinePackageResolver('_TestPackageResolver', _TestPackageResolver, ['ArPackageResolver'])
  // TestArURIResolver_plugInfo.json and TestArPackageResolver_plugInfo.json,
  // plugins of this test (nothing to load).
  PlugRegistry.GetInstance().RegisterPlugins({ Plugins: [{
    Type: 'library',
    Name: 'TestArURIResolver',
    Info: {
      Types: {
        _TestURIResolverBase: { bases: ['ArResolver'], implementsContexts: true },
        _TestURIResolver: { bases: ['_TestURIResolverBase'], uriSchemes: ['test'] },
        _TestOtherURIResolver: { bases: ['_TestURIResolverBase'], uriSchemes: ['test-other'] },
        _TestInvalidUnderbarURIResolver: { bases: ['_TestURIResolverBase'], uriSchemes: ['test_other'] },
        _TestInvalidColonURIResolver: { bases: ['_TestURIResolverBase'], uriSchemes: ['other:test'] },
        _TestInvalidNonAsciiURIResolver: { bases: ['_TestURIResolverBase'], uriSchemes: ['test-π-utf8'] },
        _TestInvalidNumericPrefixResolver: { bases: ['_TestURIResolverBase'], uriSchemes: ['113-test'] },
      },
    },
  }, {
    Type: 'library',
    Name: 'TestArPackageResolver',
    Info: { Types: { _TestPackageResolver: { bases: ['ArPackageResolver'], extensions: ['package'] } } },
  }] })

  // Force ArDefaultResolver as the primary resolver.
  _resetResolverForTest()
  ArSetPreferredResolver('ArDefaultResolver')
})

describe('testArURIResolver', () => {
  it('test_Resolve', async () => {
    const resolver = ArGetResolver()
    expect((await resolver.resolve('doesnotexist')).toString()).toBe('')
    expect((await resolver.resolve('doesnotexist.package[foo.file]')).toString()).toBe('')

    for (const path of [
      'test://foo',
      'test://foo.package[bar.file]',
      'test-other://foo',
      'test-other://foo.package[bar.file]',
      'TEST://foo',
      'TEST://foo.package[bar.file]',
      'TEST-OTHER://foo',
      'TEST-OTHER://foo.package[bar.file]',
    ]) {
      expect((await resolver.resolve(path)).toString()).toBe(path)
    }
  })

  it('test_InvalidScheme', async () => {
    const resolver = ArGetResolver()
    for (const path of [
      'test_other:/abc.xyz',
      'test-π-utf8:/abc.xyz',
      '113-test:/abc.xyz',
      'other:test:/abc.xyz',
    ]) {
      expect((await resolver.resolve(path)).valid).toBe(false)
    }
  })

  it('testGetRegisteredURISchemes', () => {
    const actualUriSchemes = ArGetRegisteredURISchemes()
    for (const expectedUriScheme of ['test', 'test-other']) {
      expect(actualUriSchemes).toContain(expectedUriScheme)
    }
  })

  it('test_ResolveForNewAsset', async () => {
    const resolver = ArGetResolver()
    expect((await resolver.resolveForNewAsset('doesnotexist')).toString()).not.toBe('')
    expect((await resolver.resolveForNewAsset('doesnotexist.package[foo.file]')).toString())
      .not.toBe('')
    for (const path of [
      'test://foo',
      'test://foo.package[bar.file]',
      'TEST://foo',
      'TEST://foo.package[bar.file]',
    ]) {
      expect((await resolver.resolveForNewAsset(path)).toString()).toBe(path)
    }
  })

  it('test_CreateContextFromString', () => {
    const resolver = ArGetResolver()
    const searchPaths = ['/a', '/b'].join(delimiter)
    sameContext(
      resolver.createContextFromString(searchPaths),
      resolver.createContextFromString('', searchPaths))
    sameContext(
      new ArResolverContext([
        resolver.createContextFromString('test', 'context str'),
        resolver.createContextFromString('', searchPaths),
      ]),
      resolver.createContextFromStrings([
        ['', searchPaths],
        ['test', 'context str'],
      ]))
  })
})

describe('testArURIResolver_CPP', () => {
  it('TestResolveWithContext', async () => {
    const resolver = ArGetResolver()
    const ctx = new ArResolverContext(new _TestURIResolverContext('context'))
    await new ArResolverContextBinder(ctx).run(async () => {
      expect((await resolver.resolve('test://foo')).toString()).toBe('test://foo?context')

      const ctx2 = new ArResolverContext(new _TestURIResolverContext('context2'))
      await new ArResolverContextBinder(ctx2).run(async () => {
        expect((await resolver.resolve('test://foo')).toString()).toBe('test://foo?context2')
      })
      expect((await resolver.resolve('test://foo')).toString()).toBe('test://foo?context')

      // Binding an unrelated context blocks the previously-bound context.
      const ctx3 = new ArResolverContext(new ArDefaultResolverContext())
      await new ArResolverContextBinder(ctx3).run(async () => {
        expect((await resolver.resolve('test://foo')).toString()).toBe('test://foo')
      })
      expect((await resolver.resolve('test://foo')).toString()).toBe('test://foo?context')
    })
  })

  it('TestCreateContextFromString', () => {
    const resolver = ArGetResolver()
    const searchPaths = ['/a', '/b']
    const searchPathStr = searchPaths.join(delimiter)

    sameContext(
      resolver.createContextFromString('', searchPathStr),
      new ArResolverContext(new ArDefaultResolverContext(searchPaths)))
    sameContext(
      resolver.createContextFromString('', searchPathStr),
      resolver.createContextFromString(searchPathStr))
    sameContext(
      resolver.createContextFromString('bogus', 'context string'),
      new ArResolverContext())
    sameContext(
      resolver.createContextFromString('test', 'context string'),
      new ArResolverContext(new _TestURIResolverContext('context string')))
    sameContext(
      resolver.createContextFromStrings([['test', 'context string']]),
      new ArResolverContext(new _TestURIResolverContext('context string')))
    sameContext(
      resolver.createContextFromStrings([
        ['', searchPathStr],
        ['test', 'context string'],
        ['bogus', 'context string'],
      ]),
      new ArResolverContext(
        new ArDefaultResolverContext(searchPaths),
        new _TestURIResolverContext('context string')))
  })

  it('TestCreateDefaultContext', () => {
    const defaultContext = ArGetResolver().createDefaultContext()
    const uriCtx = defaultContext.get(_TestURIResolverContext)
    expect(uriCtx).toBeDefined()
    expect(uriCtx!.data).toBe('CreateDefaultContext')
  })

  it('TestCreateDefaultContextForAsset', () => {
    const runTest = (assetPath: string) => {
      const defaultContext = ArGetResolver().createDefaultContextForAsset(assetPath)

      const defaultCtx = defaultContext.get(ArDefaultResolverContext)
      expect(defaultCtx).toBeDefined()
      // TfGetPathName(TfAbsPath("test/test.file")): the outer package path's
      // directory.
      expect(defaultCtx!.equals(new ArDefaultResolverContext([join(process.cwd(), 'test')])))
        .toBe(true)

      const uriCtx = defaultContext.get(_TestURIResolverContext)
      expect(uriCtx).toBeDefined()
      expect(uriCtx!.equals(new _TestURIResolverContext(absPath('test/test.file')))).toBe(true)
    }

    runTest('test/test.file')
    // A package-relative path considers only the outermost package path.
    runTest('test/test.file[in_package]')
  })
})

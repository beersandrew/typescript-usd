// Ported from OpenUSD 26.11.1:
//  pxr/usd/ar/testenv/TestArPackageResolver_plugin.cpp,
//  pxr/usd/ar/testenv/testArPackageResolver.py
// Copyright 2020, 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ports pxr/usd/ar/testenv/testArPackageResolver.py with the
// TestArPackageResolver_plugin.cpp package resolver and its plugInfo.json
// "extensions": ["package"] metadata.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, normalize } from 'node:path'
import {
  type Asset as ArAsset,
  GetResolver as ArGetResolver,
  JoinPackageRelativePath as ArJoinPackageRelativePath,
  DefinePackageResolver as ArDefinePackageResolver,
  PackageResolver as ArPackageResolver,
  SetPreferredResolver as ArSetPreferredResolver,
} from '../../src/index.ts'
import { _resetResolverForTest } from '../../src/internal.ts'
import { Registry as PlugRegistry } from 'typescript-usd/plug'

// _TestPackageResolver (TestArPackageResolver_plugin.cpp:19-50): returns the
// packaged path as is.
class _TestPackageResolver extends ArPackageResolver {
  async resolve(resolvedPackagePath: string, packagedPath: string): Promise<string> {
    const suffix = resolvedPackagePath.slice(resolvedPackagePath.lastIndexOf('.') + 1)
    if (suffix.toLowerCase() !== 'package') throw new Error('TF_AXIOM failed')
    return packagedPath
  }
  async openAsset(): Promise<ArAsset | undefined> { return undefined }
  beginCacheScope(cacheScopeData?: unknown): unknown { return cacheScopeData }
  endCacheScope(): void {}
}

let root = ''

beforeAll(() => {
  // TestArPackageResolver_plugin.cpp:52 (AR_DEFINE_PACKAGE_RESOLVER) and
  // TestArPackageResolver_plugInfo.json, a plugin of this test.
  ArDefinePackageResolver('_TestPackageResolver', _TestPackageResolver, ['ArPackageResolver'])
  PlugRegistry.GetInstance().RegisterPlugins({ Plugins: [{
    Type: 'library',
    Name: 'TestArPackageResolver',
    Info: { Types: { _TestPackageResolver: { bases: ['ArPackageResolver'], extensions: ['package'] } } },
  }] })
  // PXR_AR_DISABLE_PLUGIN_RESOLVER: ArDefaultResolver is the primary resolver.
  _resetResolverForTest()
  ArSetPreferredResolver('ArDefaultResolver')
  root = mkdtempSync(join(tmpdir(), 'typescript-usd-ar-package-'))
})

afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('testArPackageResolver', () => {
  it('test_Resolver', async () => {
    const test = async (packageFileName: string) => {
      // Create an empty package file; the packaged filename doesn't matter.
      const packagePath = join(root, packageFileName)
      writeFileSync(packagePath, '')
      const testPackagedFilePath = ArJoinPackageRelativePath([packagePath, 'packaged_file'])
      const resolved = await ArGetResolver().resolve(testPackagedFilePath)
      expect(normalize(resolved.toString())).toBe(normalize(testPackagedFilePath))
    }

    await test('test.package')
    // Ar is case-insensitive when checking for a package resolver.
    await test('test.PACKAGE')
  })
})

// Ported from OpenUSD 26.11.1: pxr/usd/ar/defaultResolver.cpp,
//  pxr/usd/usdUtils/testenv/TestUsdUtilsDependenciesCustomResolver_plugin.cpp,
//  pxr/usd/usdUtils/testenv/testUsdUtilsDependenciesCustomResolver.py
// Copyright 2016, 2020, 2023 Pixar. Tomorrow Open Source Technology License
//  1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1
// pxr/usd/usdUtils/testenv/testUsdUtilsDependenciesCustomResolver.py
// (registered as testUsdUtilsDependenciesCustomResolver,
// pxr/usd/usdUtils/CMakeLists.txt:423-428). The testenv directory
// testUsdUtilsDependenciesCustomResolver is copied unmodified into
// fixtures/testUsdUtilsDependenciesCustomResolver (Copyright Pixar, Modified
// Apache 2.0, https://openusd.org/license); the registration runs the script
// in a copy of it, so the tests here run in one temporary copy that is the
// working directory. The test resolver plugin it registers,
// TestUsdUtilsDependenciesCustomResolver
// (TestUsdUtilsDependenciesCustomResolver_plugin.cpp and its plugInfo.json,
// copied unmodified into fixtures/), is ported below: its plugInfo.json is
// registered as is and its AR_DEFINE_RESOLVER call is ArDefineResolver.
//
// The script's class defines test_ComputeAllDependencies twice; Python keeps
// the second definition, so the first never runs and is not ported. The cases
// run in name order, as unittest runs them.
//
// API mapping: UsdUtils.ComputeAllDependencies returning (layers, assets,
// unresolved) is UsdUtilsComputeAllDependencies filling the arrays, and
// UsdUtils.LocalizeAsset is UsdUtilsLocalizeAsset (Promises). layer.identifier
// and layer.resolvedPath are the same-named properties. Python list equality
// of layers is identity of the Layer objects, in order. os.path.abspath is
// path.resolve; os.walk is a recursive readdir.
// ArFilesystemWritableAsset::Create, which the plugin's _OpenAssetForWrite
// calls, is not public here; ArDefaultResolver's openAssetForWrite, which
// is ArFilesystemWritableAsset::Create (defaultResolver.cpp:248-253), stands
// in for it.

import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import {
  type Asset as ArAsset, DefaultResolver as ArDefaultResolver, DefineResolver as ArDefineResolver,
  FilesystemAsset as ArFilesystemAsset, GetResolver as ArGetResolver, ResolvedPath as ArResolvedPath,
  Resolver as ArResolver, type ResolverWriteMode as ArResolverWriteMode, type WritableAsset as ArWritableAsset,
} from 'typescript-usd/ar'
import { _resetResolverForTest } from 'typescript-usd/ar/_internal'
import { Registry as PlugRegistry, type Info as PlugInfo } from 'typescript-usd/plug'
import { TfGetPathName, TfStringCatPaths } from 'typescript-usd/tf'
import { Stage } from 'typescript-usd/usd'
import { UsdUtilsComputeAllDependencies, UsdUtilsLocalizeAsset } from 'typescript-usd/usdUtils'

const FIXTURES = path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures')
const TESTENV = path.join(FIXTURES, 'testUsdUtilsDependenciesCustomResolver')

const filesystemResolver = new ArDefaultResolver()

// CustomResolver (TestUsdUtilsDependenciesCustomResolver_plugin.cpp:20-132):
// this test resolver is setup in order to exercise various aspects of
// UsdUtils with custom "Non-Filesystem based resolvers". This is simulated
// by prefixing filesystem paths and removing the URI before operating on the
// paths. It is intentionally configured to use two separate URI's for
// identifier creation and asset resolution. Identifiers are in form of
// test:path; resolved paths are in form testresolved:path.
class CustomResolver extends ArResolver {
  readonly identifierUri = 'test:'
  readonly resolvedPathUri = 'testresolved:'

  override createIdentifier(assetPath: string, anchorAssetPath = new ArResolvedPath()): string {
    if (!anchorAssetPath.valid) return assetPath

    const anchorDir = TfGetPathName(this.#removeUri(anchorAssetPath.toString()))

    return this.identifierUri + TfStringCatPaths(anchorDir, this.#removeUri(assetPath))
  }

  override createIdentifierForNewAsset(assetPath: string, anchorAssetPath = new ArResolvedPath()): string {
    return this.createIdentifier(assetPath, anchorAssetPath)
  }

  async resolve(assetPath: string): Promise<ArResolvedPath> {
    const rawPath = this.#removeUri(assetPath)

    // After removing the URI, we will defer to filesystem path resolver
    const resolved = await ArGetResolver().resolve(rawPath)

    if (!resolved.valid) return resolved

    return new ArResolvedPath(this.resolvedPathUri + resolved.toString())
  }

  override resolveForNewAsset(assetPath: string): Promise<ArResolvedPath> {
    return this.resolve(assetPath)
  }

  async openAsset(resolvedPath: ArResolvedPath): Promise<ArAsset | undefined> {
    if (!resolvedPath.valid) return undefined

    const filesystemPath = this.#removeUri(resolvedPath.toString())

    return ArFilesystemAsset.open(new ArResolvedPath(filesystemPath))
  }

  override async openAssetForWrite(
    resolvedPath: ArResolvedPath, writeMode: ArResolverWriteMode,
  ): Promise<ArWritableAsset | undefined> {
    if (!resolvedPath.valid) return undefined

    const filesystemPath = this.#removeUri(resolvedPath.toString())

    return filesystemResolver.openAssetForWrite(new ArResolvedPath(filesystemPath), writeMode)
  }

  #removeUri(path: string): string {
    const index = path.indexOf(':')
    return index >= 0 ? path.slice(index + 1) : path
  }
}

const _ResolvedPath = (relativePath: string): string => 'testresolved:' + path.resolve(relativePath)

let dir = ''
let cwd = ''
beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'testUsdUtilsDependenciesCustomResolver'))
  cpSync(TESTENV, dir, { recursive: true })
  cwd = process.cwd()
  process.chdir(dir)

  // Register test resolver plugins
  const text = readFileSync(path.join(FIXTURES, 'TestUsdUtilsDependenciesCustomResolver_plugInfo.json'), 'utf8')
    .replace(/@TEST_PLUG_INFO_[A-Z_]+@/g, '')
  PlugRegistry.GetInstance().RegisterPlugins(JSON.parse(text) as PlugInfo)
  // AR_DEFINE_RESOLVER(CustomResolver, ArResolver) (plugin.cpp:134)
  ArDefineResolver('CustomResolver', CustomResolver)
})
beforeEach(() => {
  // Python releases each case's layers; replacing the resolver clears the
  // layer registry to the same effect.
  _resetResolverForTest()
})
afterAll(() => {
  process.chdir(cwd)
  rmSync(dir, { recursive: true, force: true })
  _resetResolverForTest()
})

function _GetFileList(localizedAssetDir: string): string[] {
  const contents: string[] = []
  const walk = (dirPath: string): void => {
    for (const name of readdirSync(dirPath)) {
      const localizedPath = path.join(dirPath, name)
      if (statSync(localizedPath).isDirectory()) walk(localizedPath)
      else contents.push(path.relative(localizedAssetDir, localizedPath).replace(/\\/g, '/'))
    }
  }
  walk(localizedAssetDir)
  contents.sort()
  return contents
}

// Flip backslashes to forward slashes and make sure path case doesn't cause
// test failures to accommodate platform differences (os.path.normcase is the
// identity on POSIX).
const assertPathsEqual = (path1: string, path2: string): void => expect(String(path1)).toBe(String(path2))

describe('TestUsdUtilsDependenciesCustomResolver', () => {
  it('test_ComputeAllDependencies', async () => {
    // Tests that ComputeAllDependencies works with the custom resolver
    const assetPathStr = 'test:localize/root.usd'

    const layers: Layer[] = [], assets: string[] = [], unresolved: string[] = []
    await UsdUtilsComputeAllDependencies(assetPathStr, layers, assets, unresolved)

    // Sdf.Layer.Find resolves the identifier to find an open layer by its
    // resolved path (SdfLayer::Find, layer.cpp:1204-1240, through
    // _ComputeInfoToFindOrOpenLayer). Layer.find is synchronous and cannot
    // call this asynchronous resolver
    // (PLATFORM-DIVERGENCE(sdf-find-async-resolver), sdf/src/layer.ts), so
    // the layers opened through the anchored identifiers
    // (test:/<dir>/localize/clip1.usda, ...) are looked up with
    // Layer.findOrOpen, which awaits the resolver and returns the open layer
    // from the registry (layer.cpp:852-914); `layers` keeps them open, and
    // the identity checks below show none is opened anew.
    const expected = await Promise.all([
      'test:localize/root.usd',
      'test:localize/clip1.usda',
      'test:localize/clip2.usda',
      'test:localize/ref_a.usd',
      'test:localize/ref_b.usd'].map(l => Layer.findOrOpen(l)))
    for (const layer of expected) expect(layer).toBeDefined()
    expect(layers.length).toBe(expected.length)
    layers.forEach((layer, i) => expect(layer).toBe(expected[i]))

    expect(assets.length).toBe(1)
    assertPathsEqual(assets[0]!, _ResolvedPath('localize/asset.txt'))

    expect(unresolved).toEqual([])
  })

  it('test_FindOrOpenLayer', async () => {
    const mainIdentifier = 'test:basic/main.usda'
    const expectedMainResolvedPath = _ResolvedPath('basic/main.usda')
    const dependencyIdentifier = 'test:basic/dependency.usda'
    const expectedDependencyResolvedPath = _ResolvedPath('basic/dependency.usda')

    await UsdUtilsComputeAllDependencies(mainIdentifier)
    // Python releases the layers ComputeAllDependencies opened (the result
    // is discarded), so the FindOrOpen calls below open the identifiers
    // anew; replacing the resolver clears the layer registry to the same
    // effect.
    _resetResolverForTest()

    let layer = await Layer.findOrOpen(mainIdentifier)
    expect(layer!.identifier).toBe(mainIdentifier)
    assertPathsEqual(layer!.resolvedPath, expectedMainResolvedPath)

    layer = await Layer.findOrOpen(dependencyIdentifier)
    expect(layer!.identifier).toBe(dependencyIdentifier)
    assertPathsEqual(layer!.resolvedPath, expectedDependencyResolvedPath)
  })

  it('test_LocalizeAsset', async () => {
    // Tests that asset localization works on assets that do not
    // use filesystem paths

    const assetPathStr = 'test:localize/root.usd'
    const localizationDir = 'root_localized'
    const localizedAsset = path.join(localizationDir, 'root.usd')

    if (existsSync(localizationDir)) rmSync(localizationDir, { recursive: true, force: true })
    mkdirSync(localizationDir)

    expect(await UsdUtilsLocalizeAsset(assetPathStr, localizationDir)).toBe(true)

    // Validate that the localized file can be opened on a stage.
    const stage = await Stage.open(localizedAsset)
    expect(stage).toBeDefined()

    const localizedFiles = _GetFileList(localizationDir)

    const expectedFiles = ['0/asset.txt', '0/clip1.usda', '0/clip2.usda',
      '0/ref_a.usd', '0/ref_b.usd', 'root.usd']

    expect(localizedFiles).toEqual(expectedFiles)
  })

})

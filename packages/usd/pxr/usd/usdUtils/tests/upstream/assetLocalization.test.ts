// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdUtils/testenv/TestUsdUtilsCustomFilesystemResolver_plugin.cpp,
//  pxr/usd/usdUtils/testenv/testUsdUtilsAssetLocalization.py
// Copyright 2025, 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1
// pxr/usd/usdUtils/testenv/testUsdUtilsAssetLocalization.py (registered as
// testUsdUtilsAssetLocalization, pxr/usd/usdUtils/CMakeLists.txt:168-173).
// The testenv directory testUsdUtilsAssetLocalization is copied unmodified
// into fixtures/testUsdUtilsAssetLocalization (Copyright Pixar, Modified
// Apache 2.0, https://openusd.org/license); the registration runs the script
// in a copy of it, so the tests here run in one temporary copy that is the
// working directory. Of the test plugins it registers,
// TestUsdUtilsLocalizeExternalAssetDependencies is
// externalAssetFileFormatPlugin.ts, and TestUsdUtilsCustomFilesystemResolver
// (TestUsdUtilsCustomFilesystemResolver_plugin.cpp and its plugInfo.json,
// copied unmodified into fixtures/) is ported below: its plugInfo.json is
// registered as is and its AR_DEFINE_RESOLVER call is ArDefineResolver.
//
// API mapping: Ar.SetPreferredResolver is SetPreferredResolver, before the
// resolver is first created. Ar.GetResolver().CreateDefaultContextForAsset
// and Ar.ResolverContextBinder are createDefaultContextForAsset and
// ResolverContextBinder.run over the block. UsdUtils.LocalizeAsset and
// UsdUtils.CreateNewUsdzPackage are the Promise-returning
// UsdUtilsLocalizeAsset and UsdUtilsCreateNewUsdzPackage (keyword arguments
// are positional). Tf.DiagnosticTrap is TfDiagnosticTrap, dismissed after
// the block. Sdf.ZipFile.Open(path).GetFileNames() is UsdZipFile.fromBytes(
// file bytes).getFileNames(). prim.referenceList.GetAddedOrExplicitItems()
// is getReferenceList().getAddedOrExplicitItems(); Sdf.Reference equality is
// compared through asset path, prim path and layer offset.
// layer.expressionVariables is getExpressionVariables().

import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Layer, Reference as SdfReference, UsdZipFile as SdfZipFile } from 'typescript-usd/sdf'
import {
  DefaultResolver as ArDefaultResolver, DefineResolver as ArDefineResolver, GetResolver as ArGetResolver,
  JoinPackageRelativePath as ArJoinPackageRelativePath, ResolvedPath as ArResolvedPath,
  type ResolverContext as ArResolverContext, ResolverContextBinder as ArResolverContextBinder,
  SetPreferredResolver as ArSetPreferredResolver,
} from 'typescript-usd/ar'
import { _resetResolverForTest } from 'typescript-usd/ar/_internal'
import { Registry as PlugRegistry, type Info as PlugInfo } from 'typescript-usd/plug'
import { TfDiagnosticTrap } from 'typescript-usd/tf'
import { Stage } from 'typescript-usd/usd'
import { UsdUtilsCreateNewUsdzPackage, UsdUtilsLocalizeAsset } from 'typescript-usd/usdUtils'
import { registerExternalAssetFileFormatPlugin } from './externalAssetFileFormatPlugin.ts'

const FIXTURES = path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures')
const TESTENV = path.join(FIXTURES, 'testUsdUtilsAssetLocalization')

// CustomFilesystemResolver (TestUsdUtilsCustomFilesystemResolver_plugin.cpp:14-71):
// identifiers that begin with '///' have the prefix stripped and are made
// absolute. In all other cases this resolver defers to ArDefaultResolver.
class CustomFilesystemResolver extends ArDefaultResolver {
  override resolve(assetPath: string, context?: ArResolverContext): Promise<ArResolvedPath> {
    return super.resolve(CustomFilesystemResolver.#removePrefix(assetPath), context)
  }

  override resolveForNewAsset(assetPath: string, context?: ArResolverContext): Promise<ArResolvedPath> {
    return super.resolveForNewAsset(CustomFilesystemResolver.#removePrefix(assetPath), context)
  }

  override createIdentifier(assetPath: string, anchor = new ArResolvedPath()): string {
    return CustomFilesystemResolver.#isCustomPath(assetPath) ? assetPath : super.createIdentifier(assetPath, anchor)
  }

  override isContextDependentPath(assetPath: string): boolean {
    return CustomFilesystemResolver.#isCustomPath(assetPath) ? true : super.isContextDependentPath(assetPath)
  }

  static #isCustomPath(path: string): boolean { return path.startsWith('///') }

  static #removePrefix(path: string): string {
    return CustomFilesystemResolver.#isCustomPath(path) ? path.slice(3) : path
  }
}

function _RemoveExistingDir(dirPath: string): void {
  if (existsSync(dirPath)) rmSync(dirPath, { recursive: true, force: true })
}

const zipFileNames = (archivePath: string): string[] =>
  SdfZipFile.fromBytes(new Uint8Array(readFileSync(archivePath))).getFileNames()

const references = (items: readonly SdfReference[]) =>
  items.map(r => ({ assetPath: r.assetPath, primPath: String(r.primPath), layerOffset: { ...r.layerOffset } }))

async function withContext<T>(assetPath: string, fn: () => Promise<T>): Promise<T> {
  const context = ArGetResolver().createDefaultContextForAsset(assetPath)
  return new ArResolverContextBinder(context).run(fn)
}

async function withTrap<T>(fn: (trap: TfDiagnosticTrap) => Promise<T>): Promise<T> {
  const trap = new TfDiagnosticTrap()
  try {
    return await fn(trap)
  } finally {
    trap.dismiss()
  }
}

let dir = ''
let cwd = ''
beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'testUsdUtilsAssetLocalization'))
  cpSync(TESTENV, dir, { recursive: true })
  cwd = process.cwd()
  process.chdir(dir)

  // Register test file format plugin
  registerExternalAssetFileFormatPlugin()

  // Register custom filesystem path resolver
  const text = readFileSync(path.join(FIXTURES, 'TestUsdUtilsCustomFilesystemResolver_plugInfo.json'), 'utf8')
    .replace(/@TEST_PLUG_INFO_[A-Z_]+@/g, '')
  PlugRegistry.GetInstance().RegisterPlugins(JSON.parse(text) as PlugInfo)
  ArDefineResolver('CustomFilesystemResolver', CustomFilesystemResolver, ['ArDefaultResolver'])

})
beforeEach(() => {
  // Python releases each case's layers, edited in place or not, when the
  // case ends; replacing the resolver clears the layer registry to the same
  // effect, and the preferred resolver is chosen again for the new one.
  _resetResolverForTest()

  // This is used to test custom filesystem paths paths below ('///). This
  // particular resolver will defer to the default resolver in all other
  // cases.
  ArSetPreferredResolver('CustomFilesystemResolver')
})
afterAll(() => {
  process.chdir(cwd)
  rmSync(dir, { recursive: true, force: true })
  _resetResolverForTest()
})

describe('TestUsdUtilsAssetLocalization', () => {
  it('test_RemappedReferencePathsAppearInLocalizedLayers', async () => {
    const localizationDir = 'remapRef_localized'

    _RemoveExistingDir(localizationDir)
    expect(await UsdUtilsLocalizeAsset('remapRef/root.usda', localizationDir, /* editLayersInPlace */ true))
      .toBe(true)

    const localizedSubPath = path.join(localizationDir, '0', 'sub.usda')
    const sub = await Layer.findOrOpen(localizedSubPath)
    expect(sub).toBeDefined()

    const world = sub!.getPrimAtPath('/World')
    expect(world).toBeDefined()

    expect(references(world!.getReferenceList().getAddedOrExplicitItems()))
      .toEqual(references([new SdfReference('1/ref.usda')]))
  })

  it('test_RemappedReferencePathsAppearInUsdzPackages', async () => {
    const assetPath = 'remapRef/root.usda'
    const archivePath = 'remapRef.usdz'

    await withContext(assetPath, async () => {
      expect(await UsdUtilsCreateNewUsdzPackage(assetPath, archivePath, '', /* editLayersInPlace */ true))
        .toBe(true)
    })

    const subPath = ArJoinPackageRelativePath([archivePath, '0/sub.usda'])
    const sub = await Layer.findOrOpen(subPath)
    expect(sub).toBeDefined()

    const world = sub!.getPrimAtPath('/World')
    expect(world).toBeDefined()

    expect(references(world!.getReferenceList().getAddedOrExplicitItems()))
      .toEqual(references([new SdfReference('1/ref.usda')]))
  })

  it('test_ExternalAssetsAppearInUsdzPackage', async () => {
    const assetPath = 'externalAssets/root.usda'
    const archivePath = 'externalAssets.usdz'
    await withContext(assetPath, async () => {
      expect(await UsdUtilsCreateNewUsdzPackage(assetPath, archivePath, '', /* editLayersInPlace */ true))
        .toBe(true)
    })

    const expectedAssets = [
      'root.usda',
      'asset/asset',
      'asset/file1.external',
      'asset/subdir/file2.external',
      'asset/asset.testformat',
    ]
    expect(zipFileNames(archivePath)).toEqual(expectedAssets)
  })

  it('test_ExternalAssetsAppearInUsdzPackageContextDep', async () => {
    const assetPath = 'externalAssets/rootContextDep.usda'
    const archivePath = 'externalAssetsContextDep.usdz'
    await withContext(assetPath, async () => {
      expect(await UsdUtilsCreateNewUsdzPackage(assetPath, archivePath, '', /* editLayersInPlace */ true))
        .toBe(true)
    })

    const expectedAssets = [
      'rootContextDep.usda',
      '0/asset',
      '0/file1.external',
      '0/subdir/file2.external',
      '0/asset.testformat',
    ]

    expect(zipFileNames(archivePath)).toEqual(expectedAssets)
  })

  it('test_ExternalAssetsAppearInLocalizedPackage', async () => {
    const assetPath = 'externalAssets/root.usda'
    const localizationDir = 'externalAssets_localized'
    _RemoveExistingDir(localizationDir)

    expect(await UsdUtilsLocalizeAsset(assetPath, localizationDir)).toBe(true)

    const expectedAssets = [
      'root.usda',
      'asset/asset',
      'asset/file1.external',
      'asset/subdir/file2.external',
      'asset/asset.testformat',
    ]

    for (const expectedAsset of expectedAssets) {
      expect(existsSync(path.join(localizationDir, expectedAsset)), expectedAsset).toBe(true)
    }
  })

  it('test_ExternalAssetsAppearInLocalizedPackageContextDep', async () => {
    const assetPath = 'externalAssets/rootContextDep.usda'
    const localizationDir = 'externalAssetsContextDep_localized'
    _RemoveExistingDir(localizationDir)

    expect(await UsdUtilsLocalizeAsset(assetPath, localizationDir)).toBe(true)

    const expectedAssets = [
      'rootContextDep.usda',
      '0/asset',
      '0/file1.external',
      '0/subdir/file2.external',
      '0/asset.testformat',
    ]

    for (const expectedAsset of expectedAssets) {
      expect(existsSync(path.join(localizationDir, expectedAsset)), expectedAsset).toBe(true)
    }
  })

  it('test_ExternalAssetsAboveRootTriggerWarningInUsdz', async () => {
    const assetPath = 'externalAssetOutsideRoot/root.usda'
    const archivePath = 'externalAssetOutsideRoot.usdz'

    await withTrap(async trap => {
      await withContext(assetPath, async () => {
        expect(await UsdUtilsCreateNewUsdzPackage(assetPath, archivePath, '', /* editLayersInPlace */ true))
          .toBe(true)
      })

      expect(trap.hasWarnings()).toBe(true)
      const commentaryStr = 'Could not determine package relative path.'
      expect(trap.getWarnings().some(s => s.getCommentary().includes(commentaryStr))).toBe(true)
    })

    const expectedAssets = [
      'root.usda',
      'asset/file1.external',
      'asset/asset.testformat',
    ]
    expect(zipFileNames(archivePath)).toEqual(expectedAssets)
  })

  it('test_ExternalAssetsAboveRootTriggerWarningInLocalizedPackage', async () => {
    const assetPath = 'externalAssetOutsideRoot/root.usda'
    const localizationDir = 'externalAssetOutsideRoot_localized'
    _RemoveExistingDir(localizationDir)

    await withTrap(async trap => {
      expect(await UsdUtilsLocalizeAsset(assetPath, localizationDir)).toBe(true)

      expect(trap.hasWarnings()).toBe(true)
      const commentaryStr = 'Could not determine package relative path.'
      expect(trap.getWarnings().some(s => s.getCommentary().includes(commentaryStr))).toBe(true)
    })

    const expectedAssets = [
      'root.usda',
      'asset/file1.external',
      'asset/asset.testformat',
    ]

    for (const expectedAsset of expectedAssets) {
      expect(existsSync(path.join(localizationDir, expectedAsset)), expectedAsset).toBe(true)
    }
  })

  it('test_CustomFilesystemPathsInUsdz', async () => {
    const assetPath = 'customFilesystem/root.usda'
    const archivePath = 'customFilesystem.usdz'

    await withContext(assetPath, async () => {
      expect(await UsdUtilsCreateNewUsdzPackage(assetPath, archivePath)).toBe(true)
    })

    const expectedAssets = [
      'root.usda',
      '0/sub.usda',
    ]
    expect(zipFileNames(archivePath)).toEqual(expectedAssets)
  })

  it('test_CustomFilesystemPathsInInLocalizedPackage', async () => {
    const assetPath = 'customFilesystem/root.usda'
    const localizationDir = 'customFilesystem_localized'
    _RemoveExistingDir(localizationDir)

    expect(await UsdUtilsLocalizeAsset(assetPath, localizationDir)).toBe(true)

    const expectedAssets = [
      'root.usda',
      '0/sub.usda',
    ]

    for (const expectedAsset of expectedAssets) {
      expect(existsSync(path.join(localizationDir, expectedAsset)), expectedAsset).toBe(true)
    }
  })

  it('test_RemappedAssetPathsDoNotTriggerWarning', async () => {
    const assetPath = 'warnings/root_remaped.usda'
    const archivePath = 'warnings.usdz'

    await withContext(assetPath, async () => {
      await withTrap(async trap => {
        expect(await UsdUtilsCreateNewUsdzPackage(assetPath, archivePath, '', /* editLayersInPlace */ true))
          .toBe(true)

        expect(trap.hasWarnings()).toBe(false)
      })
    })

    const expectedAssets = [
      'root_remaped.usda',
      '0/sub.usda',
    ]
    expect(zipFileNames(archivePath)).toEqual(expectedAssets)
  })

  it('test_WarningsAreGeneratedForFilesThatCouldNotBeResolved', async () => {
    const assetPath = 'warnings/root_unresolved.usda'
    const archivePath = 'unresolved.usdz'

    await withContext(assetPath, async () => {
      await withTrap(async trap => {
        expect(await UsdUtilsCreateNewUsdzPackage(assetPath, archivePath, '', /* editLayersInPlace */ true))
          .toBe(true)

        // Note: there is one warning for failing to enqueue the
        // unresolvable asset, and one warning for failing to open
        // the asset for writing.
        expect(trap.getWarnings().length).toBe(2)

        expect(trap.getWarnings()[0]!.getCommentary()
          .includes('Failed to resolve reference @unresolvable.usda@')).toBe(true)
        expect(trap.getWarnings()[1]!.getCommentary()
          .includes('Skipping export of dependency @/unresolvable.usda@')).toBe(true)
      })
    })
  })

  it('test_LocalizeExpressionVariables', async () => {
    const assetPath = 'variableExpressions/root.usda'
    const archivePath = 'variableExpressions.usdz'

    await withContext(assetPath, async () => {
      expect(await UsdUtilsCreateNewUsdzPackage(assetPath, archivePath, '', /* editLayersInPlace */ true))
        .toBe(true)
    })

    const expectedAssets = [
      'root.usda',
      '0/attr.usda',
      '0/attr_arr.usda',
      '0/meta.usda',
      '0/meta_arr.usda',
      '0/pay.usda',
      '0/ref.usda',
      '0/sub.usda',
    ]

    expect(zipFileNames(archivePath)).toEqual(expectedAssets)

    // ensure that the expression variable paths have been remapped and
    // saved in the asset's layers correctly.
    const stage = await Stage.open(archivePath)
    expect(stage).toBeDefined()

    // Assert that the the expression variables themselves have not been
    // altered. This is important for preserving possible variant
    // selections.
    const expectedExpressionVariables = {
      ATTR: 'attr.usda',
      ATTR_ARR: 'attr_arr.usda',
      FILTER: true,
      META: 'meta.usda',
      META_ARR: 'meta_arr.usda',
      PAY: 'pay.usda',
      REF: 'ref.usda',
      SUBLAYER: 'sub.usda',
    }
    expect(stage!.getRootLayer().getExpressionVariables()).toEqual(expectedExpressionVariables)
  })
})

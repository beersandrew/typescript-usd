// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdUtils/testenv/testUsdUtilsCreateNewUsdzPackage.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1
// pxr/usd/usdUtils/testenv/testUsdUtilsCreateNewUsdzPackage.py, run once per
// registration (pxr/usd/usdUtils/CMakeLists.txt:354-414):
// testUsdUtilsCreateNewARKitUsdzPackage,
// testUsdUtilsCreateNewARKitUsdzPackageInPlace,
// testUsdUtilsCreateNewUsdzPackage, testUsdUtilsCreateNewUsdzPackageContextDep,
// testUsdUtilsCreateNewUsdzPackageFilterMetadataKeys,
// testUsdUtilsCreateNewUsdzPackageUdim,
// testUsdUtilsCreateNewUsdzPackageRemapClipsDir and
// testUsdUtilsCreateNewUsdzPackageEditInPlace. The testenv directory
// testUsdUtilsCreateNewUsdzPackage is copied unmodified into
// fixtures/testUsdUtilsCreateNewUsdzPackage (Copyright Pixar, TOST 1.0
// , https://openusd.org/license). Each registration runs the script with
// its COMMAND arguments in a copy of the testenv and, where it names one,
// DIFF_COMPAREs the contents list the script writes with the one in
// baseline/; each case here does the same in a temporary copy that is the
// working directory. The two ARKit registrations name no DIFF_COMPARE, so
// their contents lists are not compared.
//
// API mapping: Ar.GetResolver().CreateDefaultContextForAsset and
// Ar.ResolverContextBinder are createDefaultContextForAsset and
// ResolverContextBinder.run over the block. UsdUtils.CreateNewUsdzPackage,
// UsdUtils.CreateNewARKitUsdzPackage and UsdUtils.ComputeAllDependencies are
// the Promise-returning UsdUtilsCreateNewUsdzPackage,
// UsdUtilsCreateNewARKitUsdzPackage and UsdUtilsComputeAllDependencies;
// layer.dirty is isDirty(). Sdf.ZipFile.Open(path).GetFileNames() is
// UsdZipFile.fromBytes(file bytes).getFileNames(); Usd.Stage.Open is
// Stage.open.

import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AssetPath as SdfAssetPath, Layer, UsdZipFile as SdfZipFile } from 'typescript-usd/sdf'
import { GetResolver as ArGetResolver, ResolverContextBinder as ArResolverContextBinder } from 'typescript-usd/ar'
import { _resetResolverForTest } from 'typescript-usd/ar/_internal'
import { Stage } from 'typescript-usd/usd'
import {
  UsdUtilsComputeAllDependencies, UsdUtilsCreateNewARKitUsdzPackage, UsdUtilsCreateNewUsdzPackage,
} from 'typescript-usd/usdUtils'

const TESTENV = path.join(fileURLToPath(new URL('.', import.meta.url)),
  'fixtures/testUsdUtilsCreateNewUsdzPackage')

let dir = ''
let cwd = ''
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'testUsdUtilsCreateNewUsdzPackage'))
  cpSync(TESTENV, dir, { recursive: true })
  cwd = process.cwd()
  process.chdir(dir)
  // Each registration is its own process, with its own layer registry.
  _resetResolverForTest()
})
afterEach(() => {
  process.chdir(cwd)
  rmSync(dir, { recursive: true, force: true })
})

// The script's __main__ (testUsdUtilsCreateNewUsdzPackage.py:21-79); the
// contents list it writes to outfile.
async function run(args: {
  usdzFile: string, assetPath: string, rename?: string, arkit?: boolean,
  editLayersInPlace?: boolean, expectedDirtyLayers?: string,
}): Promise<string> {
  const context = ArGetResolver().createDefaultContextForAsset(args.assetPath)
  await new ArResolverContextBinder(context).run(async () => {
    const assetPath = new SdfAssetPath(args.assetPath)
    const layers: Layer[] = []
    await UsdUtilsComputeAllDependencies(assetPath, layers)

    const expectedDirtyLayers: Layer[] = []
    if (args.expectedDirtyLayers) {
      for (const expectedDirtyLayer of args.expectedDirtyLayers.split(',')) {
        const layer = await Layer.findOrOpen(expectedDirtyLayer.trim())
        expect(layer).toBeDefined()
        expect(layers.includes(layer!)).toBe(true)
        expectedDirtyLayers.push(layer!)
      }
    }

    if (!args.arkit) {
      expect(await UsdUtilsCreateNewUsdzPackage(assetPath,
        args.usdzFile, args.rename ?? '', args.editLayersInPlace ?? false)).toBe(true)
    } else {
      expect(await UsdUtilsCreateNewARKitUsdzPackage(assetPath,
        args.usdzFile, args.rename ?? '', args.editLayersInPlace ?? false)).toBe(true)
    }

    for (const layer of layers) {
      const layerShouldBeDirty = expectedDirtyLayers.includes(layer)
      expect(layer.isDirty()).toBe(layerShouldBeDirty)
    }
  })

  const zipFile = SdfZipFile.fromBytes(new Uint8Array(readFileSync(args.usdzFile)))
  expect(zipFile).toBeDefined()

  const contents = zipFile.getFileNames().map(fileName => `${fileName}\n`).join('')

  // Validate that the usdz file can be opened on a stage.
  const stage = await Stage.open(args.usdzFile)
  expect(stage).toBeDefined()

  return contents
}

const baseline = (name: string): string => readFileSync(path.join(TESTENV, 'baseline', name), 'utf8')

describe('testUsdUtilsCreateNewUsdzPackage', () => {
  it('testUsdUtilsCreateNewARKitUsdzPackage: --arkit -l contents_arkit.txt package.usdz root.usd', async () => {
    await run({ usdzFile: 'package.usdz', assetPath: 'root.usd', arkit: true })
  })

  it('testUsdUtilsCreateNewARKitUsdzPackageInPlace: --editLayersInPlace --expectedDirtyLayers flat.usda ' +
     '--arkit package_flat.usdz flat.usda -l contents_arkit_flat_in_place.txt', async () => {
    await run({
      usdzFile: 'package_flat.usdz', assetPath: 'flat.usda', arkit: true,
      editLayersInPlace: true, expectedDirtyLayers: 'flat.usda',
    })
  })

  it('testUsdUtilsCreateNewUsdzPackage: -l contents.txt package.usdz root.usd', async () => {
    expect(await run({ usdzFile: 'package.usdz', assetPath: 'root.usd' })).toBe(baseline('contents.txt'))
  })

  it('testUsdUtilsCreateNewUsdzPackageContextDep: -l contents_usdz_context_dep_assets.txt ' +
     'usdzContextDepAssets.usdz usdzContextDepAssets/usdzContextDepAssets.usda', async () => {
    expect(await run({
      usdzFile: 'usdzContextDepAssets.usdz', assetPath: 'usdzContextDepAssets/usdzContextDepAssets.usda',
    })).toBe(baseline('contents_usdz_context_dep_assets.txt'))
  })

  it('testUsdUtilsCreateNewUsdzPackageFilterMetadataKeys: -l contents_filter_metadata_keys.txt ' +
     'filter_metadata_keys.usdz filterMetadataKeys/filter_metadata_keys.usda', async () => {
    expect(await run({
      usdzFile: 'filter_metadata_keys.usdz', assetPath: 'filterMetadataKeys/filter_metadata_keys.usda',
    })).toBe(baseline('contents_filter_metadata_keys.txt'))
  })

  it('testUsdUtilsCreateNewUsdzPackageUdim: -l contents_udim.txt udim.usdz udim/root.usda', async () => {
    expect(await run({ usdzFile: 'udim.usdz', assetPath: 'udim/root.usda' })).toBe(baseline('contents_udim.txt'))
  })

  it('testUsdUtilsCreateNewUsdzPackageRemapClipsDir: remapClipsDir.usdz remapClipsDir/root.usda ' +
     '-l contents_remap_clips_dir.txt', async () => {
    expect(await run({ usdzFile: 'remapClipsDir.usdz', assetPath: 'remapClipsDir/root.usda' }))
      .toBe(baseline('contents_remap_clips_dir.txt'))
  })

  it('testUsdUtilsCreateNewUsdzPackageEditInPlace: --editLayersInPlace --expectedDirtyLayers ' +
     'nestedUsdz/combined.usda combined.usdz nestedUsdz/combined.usda -l contents_nested_in_place.txt', async () => {
    expect(await run({
      usdzFile: 'combined.usdz', assetPath: 'nestedUsdz/combined.usda',
      editLayersInPlace: true, expectedDirtyLayers: 'nestedUsdz/combined.usda',
    })).toBe(baseline('contents_nested_in_place.txt'))
  })
})

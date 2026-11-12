// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdUtils/testenv/testUsdUtilsLocalizeAsset.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usdUtils/testenv/testUsdUtilsLocalizeAsset.py
// (registered as testUsdUtilsLocalizeAsset and testUsdUtilsLocalizeAssetUdims,
// pxr/usd/usdUtils/CMakeLists.txt:500-514). The testenv directory
// testUsdUtilsLocalizeAsset is copied unmodified into
// fixtures/testUsdUtilsLocalizeAsset (Copyright Pixar, TOST 1.0,
// https://openusd.org/license). Each registration runs the script with its
// COMMAND arguments in a copy of the testenv and DIFF_COMPAREs the contents
// list it writes with the one in baseline/; each case here does the same in a
// temporary copy that is the working directory.
//
// API mapping: Ar.GetResolver().CreateDefaultContextForAsset and
// Ar.ResolverContextBinder are createDefaultContextForAsset and
// ResolverContextBinder.run over the block. UsdUtils.LocalizeAsset is
// UsdUtilsLocalizeAsset and UsdUtils.ComputeAllDependencies is
// UsdUtilsComputeAllDependencies (Promises); layer.dirty is isDirty();
// Usd.Stage.Open is Stage.open. os.walk is a recursive readdir.

import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AssetPath as SdfAssetPath, Layer } from 'typescript-usd/sdf'
import { GetResolver as ArGetResolver, ResolverContextBinder as ArResolverContextBinder } from 'typescript-usd/ar'
import { _resetResolverForTest } from 'typescript-usd/ar/_internal'
import { Stage } from 'typescript-usd/usd'
import { UsdUtilsComputeAllDependencies, UsdUtilsLocalizeAsset } from 'typescript-usd/usdUtils'

const TESTENV = path.join(fileURLToPath(new URL('.', import.meta.url)),
  'fixtures/testUsdUtilsLocalizeAsset')

let dir = ''
let cwd = ''
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'testUsdUtilsLocalizeAsset'))
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

// WriteFileList (testUsdUtilsLocalizeAsset.py:60-75): the sorted files under
// localizedAssetDir, relative to it, one per line.
function fileList(localizedAssetDir: string): string {
  const contents: string[] = []
  const walk = (dirPath: string): void => {
    for (const name of readdirSync(dirPath)) {
      const localizedPath = path.join(dirPath, name)
      if (statSync(localizedPath).isDirectory()) walk(localizedPath)
      else contents.push(path.relative(localizedAssetDir, localizedPath).replace(/\\/g, '/') + '\n')
    }
  }
  walk(localizedAssetDir)
  contents.sort()
  return contents.join('')
}

// test() (testUsdUtilsLocalizeAsset.py:12-58).
async function test(args: {
  assetPath: string, localizationDir: string, outfile?: string,
  editLayersInPlace?: boolean, expectedDirtyLayers?: string,
}): Promise<void> {
  if (existsSync(args.localizationDir)) rmSync(args.localizationDir, { recursive: true, force: true })

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

    expect(await UsdUtilsLocalizeAsset(assetPath, args.localizationDir, args.editLayersInPlace ?? false))
      .toBe(true)

    for (const layer of layers) {
      const layerShouldBeDirty = expectedDirtyLayers.includes(layer)
      expect(layer.isDirty()).toBe(layerShouldBeDirty)
    }
  })

  const localizedAssetRoot = path.join(args.localizationDir, path.basename(args.assetPath))

  // Validate that the localized asset can be opened on a stage
  const stage = await Stage.open(localizedAssetRoot)
  expect(stage).toBeDefined()

  if (args.outfile) {
    expect(fileList(args.localizationDir))
      .toBe(readFileSync(path.join(TESTENV, 'baseline', args.outfile), 'utf8'))
  }
}

describe('testUsdUtilsLocalizeAsset', () => {
  it('testUsdUtilsLocalizeAsset: default/root.usda default_localized -l contents_default.txt', async () => {
    await test({ assetPath: 'default/root.usda', localizationDir: 'default_localized', outfile: 'contents_default.txt' })
  })

  it('testUsdUtilsLocalizeAssetUdims: udim/root.usda udim_localized -l contents_udim.txt', async () => {
    await test({ assetPath: 'udim/root.usda', localizationDir: 'udim_localized', outfile: 'contents_udim.txt' })
  })
})

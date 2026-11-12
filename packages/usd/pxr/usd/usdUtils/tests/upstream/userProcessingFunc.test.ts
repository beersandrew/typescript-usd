// Ported from OpenUSD 26.11.1: pxr/usd/sdf/layer.cpp,
//  pxr/usd/usdUtils/testenv/testUsdUtilsUserProcessingFunc.py
// Copyright 2016, 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1
// pxr/usd/usdUtils/testenv/testUsdUtilsUserProcessingFunc.py (registered as
// testUsdUtilsUserProcessingFunc, pxr/usd/usdUtils/CMakeLists.txt:601-606).
// The testenv directory testUsdUtilsUserProcessingFunc is copied unmodified
// into fixtures/testUsdUtilsUserProcessingFunc (Copyright Pixar, Modified
// Apache 2.0, https://openusd.org/license); the registration runs the script
// in a copy of it, so the tests here run in a temporary copy that is the
// working directory.
//
// API mapping: UsdUtils.LocalizeAsset(rootPath, dir, processingFunc=f) is
// UsdUtilsLocalizeAsset(rootPath, dir, false, f) and
// UsdUtils.ComputeAllDependencies(path, f) is UsdUtilsComputeAllDependencies
// (path, undefined, undefined, undefined, f) (Promises).
// UsdUtils.DependencyInfo is DependencyInfo with its assetPath,
// dependencies, rawAssetPath and expressionVariables properties.
// Sdf.Layer.FindOrOpenRelativeToLayer(layer, path) is Layer.findOrOpen of
// SdfComputeAssetPathRelativeToLayer(layer, path) (layer.cpp:917-939 anchors
// the path to the layer the same way). Sdf.ComputeAssetPathRelativeToLayer is
// SdfComputeAssetPathRelativeToLayer; Sdf.VariableExpression.IsExpression is
// sdfIsVariableExpression; Ar.IsPackageRelativePath is IsPackageRelativePath.
// assertRaises(Tf.ErrorException) is a coding error posted during the call.
// tempfile.TemporaryDirectory is a temporary directory removed afterwards;
// os.walk is a recursive readdir.

import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Layer, SdfComputeAssetPathRelativeToLayer, sdfIsVariableExpression } from 'typescript-usd/sdf'
import { IsPackageRelativePath as ArIsPackageRelativePath } from 'typescript-usd/ar'
import { _resetResolverForTest } from 'typescript-usd/ar/_internal'
import { Stage } from 'typescript-usd/usd'
import {
  DependencyInfo, UsdUtilsComputeAllDependencies, UsdUtilsLocalizeAsset, type UsdUtilsProcessingFunc,
} from 'typescript-usd/usdUtils'
import { postedErrors } from '../../../../testing/postedErrors.ts'

const TESTENV = path.join(fileURLToPath(new URL('.', import.meta.url)),
  'fixtures/testUsdUtilsUserProcessingFunc')

let dir = ''
let cwd = ''
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'testUsdUtilsUserProcessingFunc'))
  cpSync(TESTENV, dir, { recursive: true })
  cwd = process.cwd()
  process.chdir(dir)
  // Python releases each case's layers; replacing the resolver clears the
  // layer registry to the same effect.
  _resetResolverForTest()
})
afterEach(() => {
  process.chdir(cwd)
  rmSync(dir, { recursive: true, force: true })
})

async function _Localize(rootPath: string, localizationDir: string, userFunc: UsdUtilsProcessingFunc): Promise<void> {
  if (existsSync(localizationDir) && statSync(localizationDir).isDirectory()) {
    rmSync(localizationDir, { recursive: true, force: true })
  }

  const result = await UsdUtilsLocalizeAsset(rootPath, localizationDir, false, userFunc)

  expect(result).toBe(true)
}

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

function _CheckLocalizedPackageContents(packagePath: string, expectedFiles: string[]): void {
  expect(_GetFileList(packagePath)).toEqual(expectedFiles)
}

describe('TestUsdUtilsUserProcessFunc', () => {
  it('test_TransientDependencies', async () => {
    // Tests that transient dependencies that result from invocation of the
    // user processing function are included in the package

    const TestUserFunc: UsdUtilsProcessingFunc = (_layer, depInfo) => {
      const validPath = depInfo.assetPath.replaceAll('test_', '')
      return new DependencyInfo(validPath)
    }

    const rootPath = 'transientDeps/root.usda'
    const localizationDir = 'transientDeps_localized'
    const localizedRoot = path.join(localizationDir, 'root.usda')
    await _Localize(rootPath, localizationDir, TestUserFunc)
    expect(await Stage.open(localizedRoot)).toBeDefined()

    const expectedFiles = [
      'dep_metadata.usda',
      'dep_payload.usda',
      'dep_prop.usda',
      'dep_prop_metadata.usda',
      'dep_reference.usda',
      'dep_sublayer.usda',
      'dep_timesample.usda',
      'metadata.usda',
      'payload.usda',
      'prop.usda',
      'prop_metadata.usda',
      'reference.usda',
      'root.usda',
      'sublayer.usda',
      'timesample.usda',
    ]

    _CheckLocalizedPackageContents(localizationDir, expectedFiles)
  })

  it('test_TransientDependenciesTemplateAssetPath', async () => {
    // Tests that transient dependencies of clips template asset paths
    // that are modified by user processing functions are included

    const TestUserFunc: UsdUtilsProcessingFunc = (_layer, depInfo) => {
      const validPath = depInfo.assetPath.replaceAll('test_', '')
      const validDeps = depInfo.dependencies.map(x => x.replaceAll('test_', ''))
      return new DependencyInfo(validPath, validDeps)
    }

    const rootPath = 'transientDepsTemplateAssetPath/root.usda'
    const localizationDir = 'transientDepsTemplateAssetPath_localized'
    const localizedRoot = path.join(localizationDir, 'root.usda')

    await _Localize(rootPath, localizationDir, TestUserFunc)
    expect(await Stage.open(localizedRoot)).toBeDefined()

    const expectedFiles = [
      'clip.001.usda',
      'dep_clip.001.usda',
      'root.usda',
    ]

    _CheckLocalizedPackageContents(localizationDir, expectedFiles)
  })

  it('test_UserProcessingFuncRemove', async () => {
    // Tests that dependencies can be removed with the user
    // processing func
    const TestUserFunc: UsdUtilsProcessingFunc = () => new DependencyInfo()

    const rootPath = 'transientDeps/root.usda'
    const localizationDir = 'transientDeps_remove_localized'
    const localizedRoot = path.join(localizationDir, 'root.usda')

    await _Localize(rootPath, localizationDir, TestUserFunc)
    expect(await Stage.open(localizedRoot)).toBeDefined()

    const expectedFiles = [
      'root.usda',
    ]

    _CheckLocalizedPackageContents(localizationDir, expectedFiles)
  })

  it('test_FileFormatConversion', async () => {
    // Tests converting a layer to a crate file in a temp path and
    // ensuring the resulting localized package can be loaded correctly

    const tempDir = mkdtempSync(path.join(tmpdir(), 'testUsdUtilsUserProcessingFuncTemp'))
    try {
      const TestUserFunc: UsdUtilsProcessingFunc = async (layer, depInfo) => {
        const ext = path.extname(depInfo.assetPath)
        const root = depInfo.assetPath.slice(0, depInfo.assetPath.length - ext.length)
        if (ext !== '.usda') return depInfo

        const sourceDepLayer = await Layer.findOrOpen(
          SdfComputeAssetPathRelativeToLayer(layer, depInfo.assetPath))
        const crateFileName = root + '.usdc'
        const cratePath = path.join(tempDir, crateFileName)
        await sourceDepLayer!.export(cratePath)
        return new DependencyInfo(cratePath)
      }

      const rootPath = 'fileFormatConversion/root.usda'
      const localizationDir = 'fileFormatConversion_localized'
      const localizedRoot = path.join(localizationDir, 'root.usda')

      await _Localize(rootPath, localizationDir, TestUserFunc)
      expect(await Stage.open(localizedRoot)).toBeDefined()

      const expectedFiles = [
        '0/sublayer.usdc',
        'root.usda',
      ]

      _CheckLocalizedPackageContents(localizationDir, expectedFiles)
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('test_CachedProcessingFuncValues', async () => {
    // Tests that the system caches processed asset path values and only
    // invokes the callback once for each layer / path pair

    const processedPaths = new Set<string>()
    const TestUserFunc: UsdUtilsProcessingFunc = (_layer, depInfo) => {
      expect(processedPaths.has(depInfo.assetPath)).toBe(false)
      processedPaths.add(depInfo.assetPath)

      const name = path.basename(depInfo.assetPath, path.extname(depInfo.assetPath))

      if (name.startsWith('modify')) return new DependencyInfo('./modified.usda')
      else if (name.startsWith('remove')) return new DependencyInfo()
      return depInfo
    }

    const rootPath = 'duplicatePaths/root.usda'
    const localizationDir = 'duplicatePaths_localized'
    const localizedRoot = path.join(localizationDir, 'root.usda')

    await _Localize(rootPath, localizationDir, TestUserFunc)
    expect(await Stage.open(localizedRoot)).toBeDefined()

    expect(processedPaths).toEqual(new Set(['./default.usda', './modify.usda', './remove.usda']))

    const expectedFiles = [
      'default.usda',
      'modified.usda',
      'root.usda',
    ]

    _CheckLocalizedPackageContents(localizationDir, expectedFiles)
  })

  it('test_FilesystemAbsolutePaths', async () => {
    // Tests that localization works correctly with absolute filesystem
    // paths

    const TestUserFunc: UsdUtilsProcessingFunc = (layer, depInfo) => {
      const absPath = path.resolve(SdfComputeAssetPathRelativeToLayer(layer, depInfo.assetPath))
      return new DependencyInfo(absPath)
    }

    const rootPath = path.resolve('fileFormatConversion/root.usda')
    const localizationDir = path.resolve('abspath_localized')
    const localizedRoot = path.join(localizationDir, 'root.usda')

    await _Localize(rootPath, localizationDir, TestUserFunc)
    expect(await Stage.open(localizedRoot)).toBeDefined()

    const expectedFiles = [
      '0/sublayer.usda',
      'root.usda',
    ]

    _CheckLocalizedPackageContents(localizationDir, expectedFiles)
  })

  it('test_CodingErrorPackageLayer', async () => {
    // Tests that a coding error is issued when trying to modify an asset
    // path in a layer that is a package
    const ModifyPackageLayer: UsdUtilsProcessingFunc = (layer, depInfo) =>
      layer.getFileFormat()?.isPackage() ? new DependencyInfo('foo') : depInfo

    const { errors } = await postedErrors(() =>
      UsdUtilsLocalizeAsset('package/package.usdz', 'package_localized1', false, ModifyPackageLayer))
    expect(errors.length).toBeGreaterThan(0)
  })

  it('test_CodingErrorLayerContainedInPackage', async () => {
    // Tests that a coding error is issued when trying to modify an asset
    // path of a layer that is contained in a package
    const ModifyLayerInPackage: UsdUtilsProcessingFunc = (layer, depInfo) =>
      ArIsPackageRelativePath(layer.identifier) ? new DependencyInfo('foo') : depInfo

    const { errors } = await postedErrors(() =>
      UsdUtilsLocalizeAsset('package/package.usdz', 'package_localized2', false, ModifyLayerInPackage))
    expect(errors.length).toBeGreaterThan(0)
  })

  it('test_UpdateExpressionVariables', async () => {
    // Tests that if expression variables are updated in the callback func
    // the new paths are resolved and recursively searched for deps

    const UpdateExprVariable: UsdUtilsProcessingFunc = (_layer, depInfo) =>
      sdfIsVariableExpression(depInfo.rawAssetPath) ? new DependencyInfo('`"${UPDATED}"`') : depInfo

    const localizationDir = 'localize_updateExpVar'
    await _Localize('variableExpressions/root_update.usda', localizationDir, UpdateExprVariable)

    const expectedFiles = [
      'pay.usda',
      'ref.usda',
      'root_update.usda',
    ]

    _CheckLocalizedPackageContents(localizationDir, expectedFiles)
  })

  it('test_ExpressionVariables', async () => {
    // Tests that user processing function receives the correct paths
    // when expressionVariables are present
    let results: [string, string, Readonly<Record<string, unknown>>][] = []

    const RecordDepInfo: UsdUtilsProcessingFunc = (_layer, depInfo) => {
      results.push([depInfo.assetPath, depInfo.rawAssetPath, depInfo.expressionVariables])
      return depInfo
    }

    const expectedExpressionVars = {
      ATTR: './attr.usda',
      ATTR_ARR: './attr_arr.usda',
      META: './meta.usda',
      META_ARR: './meta_arr.usda',
      PAYLOAD: './pay.usda',
      REFERENCE: './ref.usda',
      SUBLAYER: './sub.usda',
    }

    const expectedResults = [
      ['./sub.usda', '`"${SUBLAYER}"`', expectedExpressionVars],
      ['./meta.usda', '`"${META}"`', expectedExpressionVars],
      ['./meta_arr.usda', '`"${META_ARR}"`', expectedExpressionVars],
      ['./pay.usda', '`"${PAYLOAD}"`', expectedExpressionVars],
      ['./attr.usda', '`"${ATTR}"`', expectedExpressionVars],
      ['./attr_arr.usda', '`"${ATTR_ARR}"`', expectedExpressionVars],
      ['./ref.usda', '`"${REFERENCE}"`', expectedExpressionVars],
    ]

    // ensure writable delegates correctly populate callback func args
    // for cases with expression variables
    await _Localize('variableExpressions/root.usda', 'localize_ExpVar', RecordDepInfo)

    expect(results).toEqual(expectedResults)

    results = []

    // ensure that read only delegates populate callback func args
    // for cases with expression variables
    await UsdUtilsComputeAllDependencies('variableExpressions/root.usda',
      undefined, undefined, undefined, RecordDepInfo)

    expect(results).toEqual(expectedResults)
  })
})

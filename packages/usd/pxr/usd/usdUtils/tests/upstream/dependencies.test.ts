// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdUtils/testenv/testUsdUtilsDependencies.py
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usdUtils/testenv/testUsdUtilsDependencies.py
// (registered as testUsdUtilsDependencies,
// pxr/usd/usdUtils/CMakeLists.txt:416-421). The testenv directory
// testUsdUtilsDependencies is copied unmodified into
// fixtures/testUsdUtilsDependencies (Copyright Pixar, TOST 1.0,
// https://openusd.org/license); the registration runs the script in a copy of
// it, so the tests here run in a temporary copy that is the working
// directory. The test file format plugin it registers is
// externalAssetFileFormatPlugin.ts.
//
// API mapping: UsdUtils.ComputeAllDependencies(assetPath, processingFunc)
// returning (layers, assets, unresolved) is UsdUtilsComputeAllDependencies
// (assetPath, layers, assets, unresolved, processingFunc) filling the arrays
// (a Promise). UsdUtils.DependencyInfo(assetPath, dependencies) is
// DependencyInfo; its assetPath property is getAssetPath(). Usd.Stage.CreateNew
// (path) is Stage.open(await Layer.createNew(path)); Sdf.Layer.CreateNew is
// Layer.createNew. prim.CreateAttribute(name, Sdf.ValueTypeNames.Asset) is
// createAttribute(name, 'asset'). Path(p).touch() writes an empty file. os.path.abspath is
// path.resolve; os.path.normcase is the identity on POSIX. Python list
// equality of layers is identity of the Layer objects, in order; set
// equality, the same set of objects.

import { cpSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import { JoinPackageRelativePath as ArJoinPackageRelativePath } from 'typescript-usd/ar'
import { _resetResolverForTest } from 'typescript-usd/ar/_internal'
import { ClipsAPI, Stage } from 'typescript-usd/usd'
import {
  CoalescingDiagnosticDelegate, DependencyInfo, UsdUtilsComputeAllDependencies,
  type UsdUtilsProcessingFunc,
} from 'typescript-usd/usdUtils'
import { registerExternalAssetFileFormatPlugin } from './externalAssetFileFormatPlugin.ts'

const TESTENV = path.join(fileURLToPath(new URL('.', import.meta.url)),
  'fixtures/testUsdUtilsDependencies')

let dir = ''
let cwd = ''
beforeAll(() => {
  // Register test file format plugin
  registerExternalAssetFileFormatPlugin()
})
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'testUsdUtilsDependencies'))
  cpSync(TESTENV, dir, { recursive: true })
  cwd = process.cwd()
  process.chdir(dir)
  // Python drops each case's layers; replacing the resolver clears the layer
  // registry to the same effect.
  _resetResolverForTest()
})
afterEach(() => {
  process.chdir(cwd)
  rmSync(dir, { recursive: true, force: true })
})

async function computeAllDependencies(assetPath: string, processingFunc?: UsdUtilsProcessingFunc) {
  const layers: Layer[] = [], assets: string[] = [], unresolved: string[] = []
  await UsdUtilsComputeAllDependencies(assetPath, layers, assets, unresolved, processingFunc)
  return { layers, assets, unresolved }
}

// assertEqual(set(layers), set(expected)).
function expectSameLayerSet(layers: readonly Layer[], expected: readonly (Layer | undefined)[]): void {
  for (const layer of expected) expect(layer).toBeDefined()
  expect(new Set(layers).size).toBe(new Set(expected).size)
  for (const layer of expected) expect(layers.includes(layer!)).toBe(true)
}

// assertEqual(layers, expected).
function expectSameLayers(layers: readonly Layer[], expected: readonly (Layer | undefined)[]): void {
  expect(layers.map(layer => layer.identifier)).toEqual(expected.map(layer => layer?.identifier))
  layers.forEach((layer, i) => expect(layer).toBe(expected[i]))
}

const touch = (file: string): void => writeFileSync(file, '')

async function createNewStage(stagePath: string): Promise<Stage> {
  const layer = await Layer.createNew(stagePath)
  return Stage.open(layer!)
}

describe('TestUsdUtilsDependencies', () => {
  it('test_ComputeAllDependencies', async () => {
    // Basic test for UsdUtils.ComputeAllDependencies

    const testLayer = async (rootLayer: string, processingFunc?: UsdUtilsProcessingFunc) => {
      const { layers, assets, unresolved } = await computeAllDependencies(rootLayer, processingFunc)

      expectSameLayerSet(layers, [Layer.find(rootLayer),
        ...['base_a.usd', 'sub_a.usd', 'meta_a.usd', 'meta_b.usd', 'payload_a.usd', 'attr_b.usd',
          'ref_a.usd', 'v_meta_a.usd', 'v_meta_b.usd', 'v_ref_a.usd', 'v_attr_b.usd',
          'clip.1.usd', 'clip.010.usd'].map(l => Layer.find('computeAllDependencies/' + l))])

      // Canonicalize all paths being compared with os.path.normcase
      // to avoid issues on Windows.

      expect(new Set(assets)).toEqual(new Set(
        ['attr_a.txt', 'v_attr_a.txt'].map(f => path.resolve('computeAllDependencies/' + f))))

      expect(new Set(unresolved)).toEqual(new Set(
        ['base_nonexist.usd', 'sub_nonexist.usd', 'meta_a_nonexist.usd', 'meta_nonexist.usd',
          'payload_nonexist.usd', 'attr_a_nonexist.txt', 'attr_nonexist.usd', 'ref_nonexist.usd',
          'v_meta_a_nonexist.usd', 'v_meta_nonexist.usd', 'v_attr_a_nonexist.txt',
          'v_attr_nonexist.usd'].map(f => path.resolve('computeAllDependencies/' + f))))
    }

    const test = async (rootLayer: string, processingFunc?: UsdUtilsProcessingFunc) => {
      await testLayer(rootLayer, processingFunc)

      const layer = await Layer.findOrOpen(rootLayer)
      layer!.setPermissionToEdit(false)
      await testLayer(rootLayer, processingFunc)
    }

    await test('computeAllDependencies/ascii.usda')
    await test('computeAllDependencies/ascii.usd')
    await test('computeAllDependencies/crate.usdc')
    await test('computeAllDependencies/crate.usd')

    // test identity processing func
    await test('computeAllDependencies/ascii.usda', (_, info) => info)
  })

  it('test_ComputeAllDependenciesInvalidClipTemplate', async () => {
    // Test that an invalid clip template asset path does not
    // cause an exception in UsdUtils.ComputeAllDependencies.
    const stage = await createNewStage('testInvalidClipTemplate.usda')
    const prim = stage.definePrim('/clip')
    new ClipsAPI(prim).setClipTemplateAssetPath('bogus')
    await stage.save()
    await UsdUtilsComputeAllDependencies(stage.getRootLayer().identifier)
  })

  it('test_ComputeAllDependenciesUdims', async () => {
    // Test for catching UDIMs with UsdUtils.ComputeAllDependencies.
    // Not included in the main test to keep it cleaner.

    const rootLayer = 'computeAllDependenciesUdims/layer.usda'
    const { layers, assets, unresolved } = await computeAllDependencies(rootLayer)

    expectSameLayerSet(layers, [Layer.find(rootLayer)])

    expect(new Set(assets)).toEqual(new Set(['image_a.1001.exr', 'image_b.1002.exr', 'image_c.1003.exr']
      .map(f => path.resolve('computeAllDependenciesUdims/' + f))))

    expect(new Set(unresolved)).toEqual(new Set(['image_d.<UDIM>.exr', 'image_e.<UDIM>.exr']
      .map(f => path.resolve('computeAllDependenciesUdims/' + f))))
  })

  it('test_ComputeAllDependenciesSdfFormatArgs', async () => {
    // Test that SDF_FORMAT_ARGS are stripped before resolving assets.

    const rootLayer = 'computeAllDependenciesFormatArgs/root.usda'
    const { layers, assets, unresolved } = await computeAllDependencies(rootLayer)

    expectSameLayerSet(layers, [Layer.find(rootLayer)])

    const expectedAsset = path.resolve('computeAllDependenciesFormatArgs/material.sbsar')
    expect(new Set(assets)).toEqual(new Set([expectedAsset]))

    expect(unresolved).toEqual([])
  })

  it('test_ComputeAllDependenciesAnonymousLayer', async () => {
    // Test for resolving dependencies of anonymous layers
    const layer = Layer.createAnonymous('.usda')
    expect(await Layer.createAnonymous('.usda').export('anon_sublayer.usda')).toBe(true)

    layer.insertSubLayerPath('anon_sublayer.usda')
    layer.insertSubLayerPath('unresolved.usda')

    const { layers, unresolved } = await computeAllDependencies(layer.identifier)
    expectSameLayers(layers, [Layer.find(layer.identifier), Layer.find('anon_sublayer.usda')])
    expect(unresolved).toEqual(['unresolved.usda'])
  })

  it('test_ComputeAllDependenciesMultipleReferences', async () => {
    // Tests that identical paths only appear once in result arrays

    const testDir = 'computeAllDependenciesMultipleReferences'
    const TestDirPath = (p: string) => path.resolve(path.join(testDir, p))

    const rootLayer = TestDirPath('root.usda')
    const { layers, assets, unresolved } = await computeAllDependencies(rootLayer)

    expect(layers.length).toBe(3)
    expectSameLayerSet(layers, [
      Layer.find(TestDirPath('common.usda')),
      Layer.find(TestDirPath('reference.usda')),
      Layer.find(rootLayer)])

    expect(assets).toEqual([TestDirPath('asset.txt')])

    expect(unresolved).toEqual([TestDirPath('missing.usda')])
  })

  it('test_ComputeAllDependenciesUserFuncFilterPaths', async () => {
    // Tests paths that are filtered by the processing func
    // do not appear in results

    const stagePath = 'test_filter.usda'
    const assetDirPath = './asset_dep_dir'
    const assetFilePath = './non_dir_dep.usda'

    mkdirSync(assetDirPath, { recursive: true })
    const assetDepLayer = await Layer.createNew(assetFilePath)
    await assetDepLayer!.save()

    const stage = await createNewStage(stagePath)
    const prim = stage.definePrim('/test')
    const dirAttr = prim.createAttribute('dirAsset', 'asset')
    dirAttr.set(assetDirPath)
    const nonDirAttr = prim.createAttribute('depAsset', 'asset')
    nonDirAttr.set(assetFilePath)
    await stage.getRootLayer().save()

    const FilterDirectories: UsdUtilsProcessingFunc = (_layer, depInfo) => {
      let isDir = false
      try { isDir = statSync(depInfo.assetPath).isDirectory() } catch { /* missing */ }
      return isDir ? new DependencyInfo() : depInfo
    }

    const { layers, assets: references, unresolved } =
      await computeAllDependencies(stagePath, FilterDirectories)

    expectSameLayers(layers, [stage.getRootLayer(), assetDepLayer])
    expect(references).toEqual([])
    expect(unresolved).toEqual([])
  })

  it('test_ComputeAllDependenciesUserFuncAdditionalPaths', async () => {
    // Tests additional paths that are specified by the user processing func
    // appear in results

    const stagePath = 'test_additional_deps.usda'
    const assetPath = 'additional_dep.txt'
    const assetPathDep = 'additional_dep.txt2'
    touch(assetPath)
    touch(assetPathDep)
    const stage = await createNewStage(stagePath)
    const prim = stage.definePrim('/test')
    const attr = prim.createAttribute('depAsset', 'asset')
    attr.set(assetPath)
    await stage.getRootLayer().save()

    const AddAdditionalDeps: UsdUtilsProcessingFunc = (_layer, depInfo) =>
      new DependencyInfo(depInfo.assetPath, [depInfo.assetPath + '2'])

    const { layers, assets: references, unresolved } =
      await computeAllDependencies(stagePath, AddAdditionalDeps)

    expectSameLayers(layers, [stage.getRootLayer()])
    expect(references).toEqual([path.resolve(assetPath), path.resolve(assetPathDep)])
    expect(unresolved).toEqual([])
  })

  it('test_ComputeAllDependenciesUserFuncModifyPaths', async () => {
    // Tests assets paths which are modified by the processing func
    // appear correctly in returned vectors

    const stagePath = 'test_modified_deps.usda'
    const assetPath = 'modified_dep.txt'
    touch(assetPath)
    const stage = await createNewStage(stagePath)
    const prim = stage.definePrim('/test')
    const attr = prim.createAttribute('depAsset', 'asset')
    attr.set('dep.txt')
    await stage.getRootLayer().save()

    const ModifyDeps: UsdUtilsProcessingFunc = (_layer, depInfo) =>
      new DependencyInfo('modified_' + depInfo.assetPath)

    const { layers, assets: references, unresolved } = await computeAllDependencies(stagePath, ModifyDeps)

    expectSameLayers(layers, [stage.getRootLayer()])
    expect(references).toEqual([path.resolve(assetPath)])
    expect(unresolved).toEqual([])
  })

  it('test_ComputeAllDependenciesParseAdditionalLayers', async () => {
    // Tests that layers that are specified as additional dependencies are
    // themselves processed for additional assets

    const CreateStageWithDep = async (stagePath: string, depPath: string | undefined) => {
      const stage = await createNewStage(stagePath)
      const prim = stage.definePrim('/test')
      if (depPath !== undefined) {
        const attr = prim.createAttribute('depAsset', 'asset')
        attr.set(depPath)
      }
      await stage.getRootLayer().save()
      return stage
    }

    const stagePath = 'test_process_deps.usda'
    const asset = await CreateStageWithDep(stagePath, 'dep.usda')
    const dep = await CreateStageWithDep('dep.usda', undefined)
    const extra = await CreateStageWithDep('extra_dep.usda', 'file.txt')
    touch('file.txt')

    const AddExtra: UsdUtilsProcessingFunc = (_layer, depInfo) => {
      if (depInfo.assetPath.startsWith('dep')) {
        return new DependencyInfo(depInfo.assetPath, ['extra_' + depInfo.assetPath])
      }
      return depInfo
    }

    const { layers, assets: references, unresolved } = await computeAllDependencies(stagePath, AddExtra)

    expectSameLayers(layers, [asset.getRootLayer(), dep.getRootLayer(), extra.getRootLayer()])
    expect(references).toEqual([path.resolve('file.txt')])
    expect(unresolved).toEqual([])
  })

  it('test_ComputeAllDependenciesMissingExternalDep', async () => {
    // Tests detecting missing external dependencies from package files
    const packageFile = 'computeAllDependenciesUsdz/package_missing_external.usdz'
    const { layers, assets: references, unresolved } = await computeAllDependencies(packageFile)

    const expectedLayers = [
      [packageFile],
      [packageFile, 'missing_in_package.usdz'],
      [packageFile, 'missing_in_reference.usda'],
    ].map(p => ArJoinPackageRelativePath(p))

    const opened: (Layer | undefined)[] = []
    for (const l of expectedLayers) opened.push(await Layer.findOrOpen(l))
    expectSameLayers(layers, opened)
    expect(references.length).toBe(0)
    expect(unresolved).toEqual(['missing.png', 'missing_in_package.png', 'missing_in_reference.png'])
  })

  it('test_ComputeAllDependenciesInvalidPayload', async () => {
    // Tests that invalid payloads are detected and reported

    const testDir = 'computeAllDependenciesInvalidPayload'
    const TestDirPath = (p: string) => path.resolve(path.join(testDir, p))
    const stagePath = 'root.usda'

    const delegate = new CoalescingDiagnosticDelegate()
    try {
      const { layers, assets: references, unresolved } = await computeAllDependencies(TestDirPath(stagePath))
      expect(layers.length).toBe(1)
      expect(layers[0]!.identifier).toBe(TestDirPath(stagePath))
      expect(references.length).toBe(0)
      expect(unresolved.length).toBe(0)

      const unfiltered = delegate.takeUncoalescedDiagnostics()
      expect(unfiltered.length).toBe(1)
      expect(unfiltered[0]!.getCommentary().startsWith('Failed to open dependency layer: ./invalid.usd ')).toBe(true)
    } finally {
      delegate.dispose()
    }
  })

  it('test_ComputeAllDependenciesExternalAssets', async () => {
    // Tests that external asset dependencies are included in the output
    const testFolder = 'computeAllDependenciesExternalAssets'

    const { layers, assets, unresolved } = await computeAllDependencies(`${testFolder}/root.usda`)

    const expectedLayers = [
      await Layer.findOrOpen(path.join(testFolder, 'root.usda')),
      await Layer.findOrOpen(path.join(testFolder, 'asset', 'asset.testformat'))]
    expectSameLayers(layers, expectedLayers)

    const expectedAssets = [
      path.resolve(path.join(testFolder, 'aboveAssetRoot.external')),
      path.resolve(path.join(testFolder, 'asset', 'file1.external')),
      path.resolve(path.join(testFolder, 'asset', 'subdir', 'file2.external')),
    ]

    expect(assets).toEqual(expectedAssets)
    expect(unresolved).toEqual([])
  })

  it('test_ComputeAllDependenciesVariableExpressions', async () => {
    // Tests that external asset dependencies are included in the output
    const testFolder = 'computeAllDependenciesVariableExpressions'

    const { layers, assets, unresolved } = await computeAllDependencies(`${testFolder}/root.usda`)

    const expectedLayers: (Layer | undefined)[] = []
    for (const name of ['root.usda', 'compose_pay.usda', 'compose_ref.usda', 'payload.usda', 'ref.usda', 'sub.usda']) {
      expectedLayers.push(await Layer.findOrOpen(path.join(testFolder, name)))
    }
    expectSameLayers(layers, expectedLayers)

    const expectedAssets = [
      path.join(testFolder, 'attr.txt'),
      path.join(testFolder, 'metadata.txt'),
      path.join(testFolder, 'metadata_arr.txt'),
    ]

    expect(new Set(assets)).toEqual(new Set(expectedAssets.map(f => path.resolve(f))))

    const expectedUnresolved: string[] = []

    expect(unresolved).toEqual(expectedUnresolved)
  })
})

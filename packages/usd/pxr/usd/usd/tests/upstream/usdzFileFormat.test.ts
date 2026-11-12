// Ported from OpenUSD 26.11.1: pxr/usd/usd/stage.cpp,
//  pxr/usd/usd/testenv/testUsdUsdzFileFormat.py
// Copyright 2016, 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usd/testenv/testUsdUsdzFileFormat.py, run
// once per registration that shares it: testUsdUsdzFileFormat,
// testUsdUsdzFileFormat_asset (USDC_USE_ASSET=1) and
// testUsdUsdzFileFormat_pread (USDC_USE_PREAD=1). Those environment settings
// choose how the crate reader accesses the file (mmap, ArAsset or pread);
// typescript-usd always reads crate bytes from the ArAsset buffer, so the
// three runs execute the same code here. The testenv
// pxr/usd/usd/testenv/testUsdUsdzFileFormat is copied unmodified into
// fixtures/testUsdUsdzFileFormat (Copyright 2018 Pixar, TOST 1.0,
// https://openusd.org/license). The test runs with the testenv as the
// working directory, so relative identifiers name the fixtures.
//
// API mapping: Usd.Stage.ExportToString(addSourceFileComment) is
// Stage.flatten(addSourceFileComment).exportToString() (UsdStage::
// ExportToString, stage.cpp). Tf.ErrorException is a thrown error or a
// rejected promise.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { postedErrors } from '../../../../testing/postedErrors.ts'
import {
  FormatSupportsEditing, FormatSupportsReading, FormatSupportsWriting, Layer,
} from 'typescript-usd/sdf'
import { GetResolver as ArGetResolver } from 'typescript-usd/ar'
import { Stage } from 'typescript-usd/usd'
import { _setResolverForTest } from 'typescript-usd/usd/_internal'

const TESTENV = path.join(fileURLToPath(new URL('.', import.meta.url)),
  'fixtures/testUsdUsdzFileFormat')

describe.each([
  'testUsdUsdzFileFormat', 'testUsdUsdzFileFormat_asset', 'testUsdUsdzFileFormat_pread',
])('%s', () => {
  let cwd: string
  beforeAll(() => {
    cwd = process.cwd()
    process.chdir(TESTENV)
  })
  afterAll(() => { process.chdir(cwd) })
  beforeEach(() => {
    // Python drops each case's stages and layers; replacing the resolver
    // clears the layer registry to the same effect.
    _setResolverForTest(ArGetResolver())
  })

  // test_CannotCreateNewUsdzStage: Usd.Stage.CreateNew("test.usdz") and
  // Usd.Stage.CreateInMemory("test.usdz") must raise. typescript-usd has no
  // UsdStage::CreateNew(identifier), and Stage.createNew takes no identifier
  // (no UsdStage::CreateInMemory(identifier)), so the case is not ported.

  it('test_CannotSaveToUsdzFile', async () => {
    // Test that changes cannot be saved to a .usdz layer.
    // Users can make scene description changes to .usdz layers and other
    // layers within the .usdz file, but cannot save them.
    const stage = (await Stage.open('single_usd.usdz'))!
    expect(stage.getPrim('/Root_USD')).toBeDefined()
    expect(stage.definePrim('/Root_New')).toBeTruthy()
    await expect(stage.save()).rejects.toThrow()
  })

  it('test_FirstFileNotUsd', async () => {
    // Test that opening a .usdz file where the first file is not a loadable
    // layer is an error.
    // The open yields no stage and posts errors (Tf.ErrorException natively).
    const { result: stage, errors } = await postedErrors(() => Stage.open('first_file_not_usd.usdz'))
    expect(stage).toBeUndefined()
    expect(errors.length).toBeGreaterThan(0)
  })

  it('test_UsdzSublayers', async () => {
    // Test using .usdz files as sublayers
    const stage = (await Stage.open('sublayers.usda'))!
    const expected = ['sublayers.usda', 'single_usd.usdz', 'single_usda.usdz', 'single_usdc.usdz']
      .map(l => Layer.find(l))
    expect(expected.every(l => l !== undefined)).toBe(true)
    expect(stage.getLayerStack(false)).toEqual(expected)
  })

  it('test_UsdzReferences', async () => {
    // Test using .usdz files in references
    const stage = (await Stage.open('refs.usda'))!
    const expected = ([
      ['refs.usda', '/Refs'],
      ['single_usd.usdz', '/Root_USD'],
      ['single_usda.usdz', '/Root_USDA'],
      ['single_usdc.usdz', '/Root_USDC'],
    ] as const).map(([l, p]) => {
      const layer = Layer.find(l)
      expect(layer?.getPrimAtPath(p)).toBeDefined()
      return `@${layer?.identifier}@<${p}>`
    })
    expect(stage.getPrimStack('/Refs').map(e => `@${e.layerIdentifier}@<${e.specPath}>`))
      .toEqual(expected)
  })

  // test_RelativeReferences: each stage is its own it() so one gap does not
  // hide the others.
  const testExpectedLayer = (stage: Stage, layerId: string): void => {
    const layer = Layer.find(layerId)
    expect.soft(layer, layerId).toBeTruthy()
    expect.soft(layer !== undefined && stage.getUsedLayers().includes(layer), layerId).toBe(true)
  }

  // Verify that all expected layers are opened and used on the stage.
  const relativeReferenceCases: Array<[string, string[]]> = [
    // Test anchored relative references of the form "./<dir>/<layer>"
    ['anchored_refs.usdz', [
      'anchored_refs.usdz',
      'anchored_refs.usdz[ref.usd]',
      'anchored_refs.usdz[sub/ref.usda]',
      'anchored_refs.usdz[sub/ref.usdc]']],
    // Repeat the test, but for the case where the first layer in the .usdz
    // file is in a subdirectory to ensure relative paths are anchored to the
    // first layer in the .usdz file and not just the root of the .usdz file.
    ['anchored_refs_sub.usdz', [
      'anchored_refs_sub.usdz',
      'anchored_refs_sub.usdz[anchored_refs/ref.usd]',
      'anchored_refs_sub.usdz[anchored_refs/sub/ref.usda]',
      'anchored_refs_sub.usdz[anchored_refs/sub/ref.usdc]']],
    // Repeat these tests, but with the .usdz file nested within another
    // .usdz file.
    ['nested_anchored_refs.usdz', [
      'nested_anchored_refs.usdz',
      'nested_anchored_refs.usdz[anchored_refs.usdz[ref.usd]]',
      'nested_anchored_refs.usdz[anchored_refs.usdz[sub/ref.usda]]',
      'nested_anchored_refs.usdz[anchored_refs.usdz[sub/ref.usdc]]']],
    ['nested_anchored_refs_sub.usdz', [
      'nested_anchored_refs_sub.usdz',
      'nested_anchored_refs_sub.usdz[anchored_refs_sub.usdz[anchored_refs/ref.usd]]',
      'nested_anchored_refs_sub.usdz[anchored_refs_sub.usdz[anchored_refs/sub/ref.usda]]',
      'nested_anchored_refs_sub.usdz[anchored_refs_sub.usdz[anchored_refs/sub/ref.usdc]]']],
    // Test search relative references of the form "<dir>/<layer>". These
    // are expected to resolve relative to the layer they are authored in,
    // then relative to the root layer of the .usdz file if not found.
    ['search_refs.usdz', [
      'search_refs.usdz',
      'search_refs.usdz[refs/ref.usd]',
      'search_refs.usdz[refs/sub/ref_in_subdir.usd]',
      'search_refs.usdz[refs/sub/ref_in_both.usd]',
      'search_refs.usdz[sub/ref_in_root.usd]']],
    // Repeat the test, but for the case where the first layer in the .usdz
    // file is in a subdirectory.
    ['search_refs_sub.usdz', [
      'search_refs_sub.usdz',
      'search_refs_sub.usdz[search_refs/refs/ref.usd]',
      'search_refs_sub.usdz[search_refs/refs/sub/ref_in_subdir.usd]',
      'search_refs_sub.usdz[search_refs/refs/sub/ref_in_both.usd]',
      'search_refs_sub.usdz[search_refs/sub/ref_in_root.usd]']],
    // Repeat these tests, but with the .usdz file nested within another
    // .usdz file.
    ['nested_search_refs.usdz', [
      'nested_search_refs.usdz',
      'nested_search_refs.usdz[search_refs.usdz[refs/ref.usd]]',
      'nested_search_refs.usdz[search_refs.usdz[refs/sub/ref_in_subdir.usd]]',
      'nested_search_refs.usdz[search_refs.usdz[refs/sub/ref_in_both.usd]]',
      'nested_search_refs.usdz[search_refs.usdz[sub/ref_in_root.usd]]']],
    ['nested_search_refs_sub.usdz', [
      'nested_search_refs_sub.usdz',
      'nested_search_refs_sub.usdz[search_refs_sub.usdz[search_refs/refs/ref.usd]]',
      'nested_search_refs_sub.usdz[search_refs_sub.usdz[search_refs/refs/sub/ref_in_subdir.usd]]',
      'nested_search_refs_sub.usdz[search_refs_sub.usdz[search_refs/refs/sub/ref_in_both.usd]]',
      'nested_search_refs_sub.usdz[search_refs_sub.usdz[search_refs/sub/ref_in_root.usd]]']],
  ]
  for (const [rootLayer, layerIds] of relativeReferenceCases) {
    it(`test_RelativeReferences: ${rootLayer}`, async () => {
      const stage = (await Stage.open(rootLayer))!
      for (const layerId of layerIds) testExpectedLayer(stage, layerId)
    })
  }

  // test_ComposedStage: Test results of opening .usdz files on Usd.Stage by
  // comparing flattened stage to the result of opening and flattening the
  // original source layer(s). Each pair is its own it().
  const composedStageCases: Array<[string, string]> = [
    ['single_usd.usdz', 'single/test.usd'],
    ['single_usda.usdz', 'single/test.usda'],
    ['single_usdc.usdz', 'single/test.usdc'],
    ['anchored_refs.usdz', 'anchored_refs/root.usd'],
    ['anchored_refs_sub.usdz', 'anchored_refs/root.usd'],
    ['nested_anchored_refs.usdz', 'anchored_refs/root.usd'],
    ['nested_anchored_refs_sub.usdz', 'anchored_refs/root.usd'],
    ['search_refs.usdz', 'search_refs/root.usd'],
    ['search_refs_sub.usdz', 'search_refs/root.usd'],
    ['nested_search_refs.usdz', 'search_refs/root.usd'],
    ['nested_search_refs_sub.usdz', 'search_refs/root.usd'],
    // Test ability to open specific layers in .usdz files.
    ['anchored_refs.usdz[root.usd]', 'anchored_refs/root.usd'],
    ['anchored_refs.usdz[sub/ref.usda]', 'anchored_refs/sub/ref.usda'],
    ['nested_anchored_refs.usdz[anchored_refs.usdz]', 'anchored_refs/root.usd'],
    ['nested_anchored_refs.usdz[anchored_refs.usdz[root.usd]]', 'anchored_refs/root.usd'],
  ]
  for (const [usdzFile, srcRootLayer] of composedStageCases) {
    it(`test_ComposedStage: ${usdzFile}`, async () => {
      const usdzStage = (await Stage.open(usdzFile))!
      const srcStage = (await Stage.open(srcRootLayer))!
      expect(usdzStage.flatten(false).exportToString())
        .toBe(srcStage.flatten(false).exportToString())
    })
  }

  it('test_Capabilities', () => {
    expect(FormatSupportsReading('.usdz')).toBe(true)
    expect(FormatSupportsWriting('.usdz')).toBe(false)
    expect(FormatSupportsEditing('.usdz')).toBe(false)
  })
})

// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdUtils/testenv/testUsdUtilsModifyAssetPaths.py
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1
// pxr/usd/usdUtils/testenv/testUsdUtilsModifyAssetPaths.py (registered as
// testUsdUtilsModifyAssetPaths, pxr/usd/usdUtils/CMakeLists.txt:516-524).
// The testenv directory testUsdUtilsModifyAssetPaths is copied unmodified
// into fixtures/testUsdUtilsModifyAssetPaths (Copyright Pixar, Modified
// Apache 2.0, https://openusd.org/license). The registration runs the script
// in a copy of the testenv and DIFF_COMPAREs the layers it exports with the
// ones in baseline/; each case here does the same in a temporary copy that is
// the working directory.
//
// API mapping: UsdUtils.ModifyAssetPaths(layer, fn, keepEmptyPathsInArrays)
// is UsdUtilsModifyAssetPaths (a Promise); layer.Export(path) is
// layer.export(path).

import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import { UsdUtilsModifyAssetPaths } from 'typescript-usd/usdUtils'

const TESTENV = path.join(fileURLToPath(new URL('.', import.meta.url)),
  'fixtures/testUsdUtilsModifyAssetPaths')

// The script runs its cases in one process, in order.
let dir = ''
let cwd = ''
beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'testUsdUtilsModifyAssetPaths'))
  cpSync(TESTENV, dir, { recursive: true })
  cwd = process.cwd()
  process.chdir(dir)
})
afterAll(() => {
  process.chdir(cwd)
  rmSync(dir, { recursive: true, force: true })
})

async function Test(
  usdFile: string, outFile: string, fn: (s: string) => string, keepEmptyPathsInArrays = false,
): Promise<void> {
  const layer = await Layer.findOrOpen(usdFile)
  await UsdUtilsModifyAssetPaths(layer!, fn, keepEmptyPathsInArrays)
  expect(await layer!.export(outFile)).toBe(true)
  // Python releases the layer when Test returns, so the next FindOrOpen of
  // usdFile reads the file again. A JavaScript layer leaves the registry
  // only when it is garbage collected, so its edits are discarded here.
  await layer!.reload(/* force */ true)
}

// DIFF_COMPARE: the exported file matches the baseline.
const diffCompare = (name: string): void => {
  expect(readFileSync(path.join(dir, name), 'utf8'))
    .toBe(readFileSync(path.join(TESTENV, 'baseline', name), 'utf8'))
}

describe('testUsdUtilsModifyAssetPaths', () => {
  it('TestBasic', async () => {
    // Test basic substitution
    await Test('layer.usda', 'modified.usda', s => 'SUCCESS_' + s)
    diffCompare('modified.usda')
  })

  it('TestDuplicates', async () => {
    // Test behavior when modify callback yields duplicate
    // asset paths.
    await Test('layer.usda', 'duplicates.usda', () => 'baz.usd')
    diffCompare('duplicates.usda')
  })

  it('TestRemoval', async () => {
    // Tests behavior when modify callback returns empty asset
    // paths.
    await Test('layer.usda', 'removal.usda', () => '')
    diffCompare('removal.usda')
  })

  it('TestRemovalPreserveLength', async () => {
    // Tests behavior when modify callback returns empty asset
    // paths and preserve array length is enabled.
    await Test('layer.usda', 'removal_preserve_length.usda', () => '', /* keepEmptyPathsInArrays */ true)
    diffCompare('removal_preserve_length.usda')
  })

  it('TestDoesNotRecurseDeps', async () => {
    // Tests reference paths are not traversed during asset path modification
    const refLayer = await Layer.findOrOpen('ref.usda')
    await Test('ref_layer.usda', 'ref_layer_mod.usda', s => 'MOD_' + s)
    expect(await refLayer!.export('ref_unmodified.usda')).toBe(true)
    diffCompare('ref_layer_mod.usda')
    diffCompare('ref_unmodified.usda')
  })

  it('TestDoesNotStripMetadata', async () => {
    // Ensure that metadata is retained.
    await Test('metadata.usda', 'preserve_metadata.usda', s => s)
    diffCompare('preserve_metadata.usda')
  })
})

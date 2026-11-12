// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdUtils/testenv/testUsdUtilsIntrospection.py,
//  pxr/usd/usdUtils/wrapIntrospection.cpp
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usdUtils/testenv/testUsdUtilsIntrospection.py
// (registered as testUsdUtilsIntrospection with TESTENV
// testUsdUtilsIntrospection). The testenv directory (stageStats.usda) is
// copied unmodified into fixtures/testUsdUtilsIntrospection (Copyright 2017
// Pixar, TOST 1.0, https://openusd.org/license). Upstream runs in
// a copy of that directory, so the test copies the fixtures into a temporary
// directory and opens stageStats.usda there.
//
// API mapping: UsdUtils.ComputeUsdStageStats(rootLayerPath) returns the stats
// dictionary (wrapIntrospection.cpp:24-29); here
// UsdUtilsComputeUsdStageStats(rootLayerPath, stats) fills `stats` and
// resolves to the opened stage. The VtDictionary is a plain object.
import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { UsdUtilsComputeUsdStageStats, type UsdUtilsUsdStageStats } from 'typescript-usd/usdUtils'

const TESTENV = path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures/testUsdUtilsIntrospection')

let dir = ''
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'testUsdUtilsIntrospection'))
  cpSync(TESTENV, dir, { recursive: true })
})
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

describe('TestUsdUtilsIntrospection', () => {
  // testUsdUtilsIntrospection.py:12-33
  it('test_UsdUtilsComputeStageStats', async () => {
    const expectedStageStats = {
      'prototypes': {
        'primCountsByType': { 'untyped': 3, 'Mesh': 7, 'Xform': 2 },
        'primCounts': { 'activePrimCount': 12, 'inactivePrimCount': 0,
          'instanceCount': 2, 'pureOverCount': 0,
          'totalPrimCount': 12 } },
      'usedLayerCount': 1,
      'primary': {
        'primCountsByType': { 'untyped': 3, 'Scope': 2, 'Mesh': 16, 'Xform': 13 },
        'primCounts': { 'activePrimCount': 32, 'inactivePrimCount': 2,
          'instanceCount': 6, 'pureOverCount': 1,
          'totalPrimCount': 34 } },
      'modelCount': 8,
      'instancedModelCount': 1,
      'totalPrimCount': 46,
      'totalInstanceCount': 8,
      'prototypeCount': 3,
      'assetCount': 1 }

    const stats: UsdUtilsUsdStageStats = {}
    const stage = await UsdUtilsComputeUsdStageStats(path.join(dir, 'stageStats.usda'), stats)
    expect(stage).toBeTruthy()
    expect(stats).toEqual(expectedStageStats)
  })
})

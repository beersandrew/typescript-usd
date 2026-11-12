// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdUtils/testenv/testUsdUtilsStageCache.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usdUtils/testenv/testUsdUtilsStageCache.py
// (registered as testUsdUtilsStageCache; no testenv directory).
//
// API mapping: UsdUtils.StageCache.Get() is StageCache.Get() from
// typescript-usd/usdUtils; `with Usd.StageCacheContext(x):` is
// new StageCacheContext(x) ... close(); Sdf.Layer.CreateAnonymous() is
// Layer.createAnonymous(); Usd.Stage.Open(layer) is Stage.open(layer).
//
// Upstream checks that the singleton does not crash at interpreter teardown;
// JavaScript has no static destruction, so the port checks the stage lands
// in the singleton cache through the context, which is what the test drives.
import { describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import { Stage, StageCacheContext } from 'typescript-usd/usd'
import { StageCache } from 'typescript-usd/usdUtils'

describe('TestUsdUtilsStageCache', () => {
  // testUsdUtilsStageCache.py:12-17
  it('test_Basic', async () => {
    // Verify that the UsdUtils.StageCache singleton
    // does not crash upon system teardown.
    const lyr = Layer.createAnonymous()
    const ctx = new StageCacheContext(StageCache.Get())
    let stage: Stage
    try {
      stage = await Stage.open(lyr)
    } finally {
      ctx.close()
    }
    expect(StageCache.Get().contains(stage)).toBe(true)
    expect(StageCache.Get()).toBe(StageCache.Get())
  })
})

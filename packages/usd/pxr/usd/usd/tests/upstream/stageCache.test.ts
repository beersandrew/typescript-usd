// Ported from OpenUSD 26.11.1: pxr/usd/usd/testenv/testUsdStageCache.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usd/testenv/testUsdStageCache.py
// (registered as testUsdStageCache; no testenv directory).
//
// API mapping:
//   - Usd.Stage.CreateInMemory() is Stage.createNew();
//     Usd.Stage.Open(rootLayer[, sessionLayer][, pathResolverContext]) is
//     Stage.open(rootLayer, { sessionLayer, resolverContext }), with
//     sessionLayer=None as sessionLayer: null.
//   - `with Usd.StageCacheContext(x):` is new StageCacheContext(x) ...
//     close(). Stage.open reads the bound contexts when it is called.
//   - A Tf.ErrorException raised for a TF_CODING_ERROR is an error posted to
//     a TfErrorMark; Python None arguments are null.
//   - Stage identity (`is`, `==`) is object identity.
//
// Out of scope: test_CacheContextLifetime checks Python weakref lifetimes of
// the cache, UseButDoNotPopulateCache wrapper and StageCacheContext objects
// (boost.python holder ownership); JavaScript has no observable equivalent.
import { describe, expect, it } from 'vitest'
import { GetResolver as ArGetResolver } from 'typescript-usd/ar'
import { Layer } from 'typescript-usd/sdf'
import { Mark as TfErrorMark } from 'typescript-usd/tf'
import {
  BlockStageCachePopulation, BlockStageCaches, Stage, StageCache, StageCacheContext, StageCacheId,
  UseButDoNotPopulateCache,
} from 'typescript-usd/usd'

// testUsdStageCache.py:11-42
function checkEmptyCache(cache: StageCache): void {
  expect(cache.IsEmpty() && cache.size() === 0).toBe(true)
  expect(cache.find(StageCacheId.fromLongInt(1))).toBeFalsy()
  expect(cache.getAllStages()).toHaveLength(0)
  expect(cache.findOneMatching(Layer.createAnonymous())).toBeFalsy()
  expect(cache.findOneMatching(Layer.createAnonymous(), Layer.createAnonymous())).toBeFalsy()

  const context = ArGetResolver().createDefaultContext()
  expect(cache.findOneMatching(Layer.createAnonymous(), context)).toBeFalsy()
  expect(cache.findOneMatching(Layer.createAnonymous(), Layer.createAnonymous(), context)).toBeFalsy()

  expect(cache.findAllMatching(Layer.createAnonymous())).toHaveLength(0)
  expect(cache.findAllMatching(Layer.createAnonymous(), Layer.createAnonymous())).toHaveLength(0)
  expect(cache.findAllMatching(Layer.createAnonymous(), context)).toHaveLength(0)
  expect(cache.findAllMatching(Layer.createAnonymous(), Layer.createAnonymous(), context)).toHaveLength(0)

  expect(cache.getId(null).isValid()).toBe(false)
  expect(cache.erase(StageCacheId.invalid())).toBe(false)
  expect(cache.erase(null)).toBe(false)
  expect(cache.eraseAll(Layer.createAnonymous())).toBe(0)
  expect(cache.eraseAll(Layer.createAnonymous(), Layer.createAnonymous())).toBe(0)
  expect(cache.eraseAll(Layer.createAnonymous(), Layer.createAnonymous(), context)).toBe(0)
}

// The stages of test_FindByPartialKey / test_StageIds
// (testUsdStageCache.py:106-125, 158-177).
async function partialKeyStages() {
  // sameRoot1 and sameRoot2 share root layers.
  const sameRoot1 = Stage.createNew()
  const sameRoot2 = await Stage.open(sameRoot1.getRootLayer())

  // same1 and same2 share both root and session layers and have null path
  // resolver contexts
  const same1 = Stage.createNew()
  const same2 = await Stage.open(same1.getRootLayer(), { sessionLayer: same1.getSessionLayer() })

  // prDiff1 and prDiff2 share root and session layers, but have different
  // path resolver contexts.
  const prDiff1 = Stage.createNew()
  const assetFile = 'testUsdStageCache/asset.usd'
  const prDiff2 = await Stage.open(prDiff1.getRootLayer(), {
    sessionLayer: prDiff1.getSessionLayer(),
    resolverContext: ArGetResolver().createDefaultContextForAsset(assetFile),
  })
  return { sameRoot1, sameRoot2, same1, same2, prDiff1, prDiff2 }
}

describe('testUsdStageCache', () => {
  // testUsdStageCache.py:46-102
  it('test_Basic', () => {
    const cache = new StageCache()

    checkEmptyCache(cache)

    const mark = new TfErrorMark()
    cache.insert(null)
    expect(mark.isClean()).toBe(false)
    mark.clear()
    mark.dispose()

    checkEmptyCache(cache)

    // Insert a single stage.
    let stage = Stage.createNew()
    const stageId = cache.insert(stage)
    expect(stageId.isValid()).toBe(true)
    expect(!cache.IsEmpty() && cache.size() === 1).toBe(true)
    expect(cache.getAllStages()).toHaveLength(1)
    expect(cache.getAllStages()[0]).toBe(stage)
    expect(cache.find(stageId)).toBe(stage)
    expect(cache.findOneMatching(stage.getRootLayer(), stage.getSessionLayer(),
      stage.getPathResolverContext())).toBe(stage)
    expect(cache.findOneMatching(stage.getRootLayer())).toBe(stage)
    expect(cache.findOneMatching(stage.getRootLayer(), stage.getSessionLayer())).toBe(stage)
    expect(cache.findOneMatching(stage.getRootLayer(), stage.getPathResolverContext())).toBe(stage)

    expect(cache.findAllMatching(stage.getRootLayer(), stage.getSessionLayer(),
      stage.getPathResolverContext())).toEqual([stage])
    expect(cache.findAllMatching(stage.getRootLayer())).toEqual([stage])
    expect(cache.findAllMatching(stage.getRootLayer(), stage.getSessionLayer())).toEqual([stage])
    expect(cache.findAllMatching(stage.getRootLayer(), stage.getPathResolverContext())).toEqual([stage])

    expect(cache.getId(stage).equals(stageId)).toBe(true)

    expect(cache.erase(stageId)).toBe(true)
    stage = Stage.createNew()
    cache.insert(stage)
    expect(cache.erase(stage)).toBe(true)
    stage = Stage.createNew()
    cache.insert(stage)
    expect(cache.eraseAll(stage.getRootLayer())).toBe(1)
    stage = Stage.createNew()
    cache.insert(stage)
    expect(cache.eraseAll(stage.getRootLayer(), stage.getSessionLayer())).toBe(1)
    stage = Stage.createNew()
    cache.insert(stage)
    expect(cache.eraseAll(stage.getRootLayer(), stage.getSessionLayer(),
      stage.getPathResolverContext())).toBe(1)
    stage = Stage.createNew()
    cache.insert(stage)
    cache.clear()
    expect(cache.IsEmpty() && cache.size() === 0).toBe(true)
  })

  // testUsdStageCache.py:104-154
  it('test_FindByPartialKey', async () => {
    const { sameRoot1, sameRoot2, same1, same2, prDiff1, prDiff2 } = await partialKeyStages()

    const allStages = [sameRoot1, sameRoot2, same1, same2, prDiff1, prDiff2]

    const cache = new StageCache()
    expect(allStages.every(stage => cache.insert(stage).isValid())).toBe(true)

    // Check finding them by partial key.
    // Python's FindAllMatching(*args) / FindOneMatching(*args).
    const checkMatching = (args: unknown[], expected: Stage[]) => {
      const findAll = cache.findAllMatching.bind(cache) as (...a: unknown[]) => Stage[]
      const findOne = cache.findOneMatching.bind(cache) as (...a: unknown[]) => Stage | undefined
      expect(new Set(findAll(...args))).toEqual(new Set(expected))
      expect(expected).toContain(findOne(...args))
    }

    checkMatching([sameRoot1.getRootLayer()], [sameRoot1, sameRoot2])
    checkMatching([sameRoot1.getRootLayer(), sameRoot1.getSessionLayer()], [sameRoot1])
    checkMatching([sameRoot1.getRootLayer(), sameRoot1.getPathResolverContext()], [sameRoot1, sameRoot2])

    checkMatching([same1.getRootLayer()], [same1, same2])
    checkMatching([same1.getRootLayer(), same1.getSessionLayer()], [same1, same2])
    checkMatching([same1.getRootLayer(), same1.getPathResolverContext()], [same1, same2])

    checkMatching([prDiff1.getRootLayer()], [prDiff1, prDiff2])
    checkMatching([prDiff1.getRootLayer(), prDiff1.getSessionLayer()], [prDiff1, prDiff2])
    checkMatching([prDiff1.getRootLayer(), prDiff1.getPathResolverContext()], [prDiff1])
  })

  // testUsdStageCache.py:156-195
  it('test_StageIds', async () => {
    const { sameRoot1, sameRoot2, same1, same2, prDiff1, prDiff2 } = await partialKeyStages()
    const allStages = [sameRoot1, sameRoot2, same1, same2, prDiff1, prDiff2]

    const cache = new StageCache()

    const ids = allStages.map(stage => cache.insert(stage))
    expect(ids.every(id => id.isValid())).toBe(true)

    allStages.forEach((stage, index) => {
      const i = ids[index]!
      expect(cache.getId(stage).equals(i)).toBe(true)
      expect(cache.find(i)).toBe(stage)
      // round trip from/to string and int.
      expect(cache.find(StageCacheId.fromLongInt(i.toLongInt()))).toBe(stage)
      expect(cache.find(StageCacheId.fromString(i.ToString()))).toBe(stage)
    })

    expect(ids.every(id => cache.erase(id))).toBe(true)
    expect(cache.IsEmpty() && cache.size() === 0).toBe(true)
  })

  // testUsdStageCache.py:197-283
  it('test_CacheContext', async () => {
    const layer1 = Layer.createAnonymous()
    const layer2 = Layer.createAnonymous()

    const cache1 = new StageCache()

    // Populate cache1 with a stage, by binding a context and using the
    // Stage.Open API.
    let ctx = new StageCacheContext(cache1)
    let stage = await Stage.open(layer1)
    ctx.close()

    expect(cache1.size()).toBe(1)
    expect(cache1.contains(stage)).toBe(true)
    expect(cache1.findOneMatching(layer1)).toBe(stage)

    // Read the stage from the read-only cache, assert a different opened
    // stage doesn't populate the cache.
    ctx = new StageCacheContext(UseButDoNotPopulateCache(cache1))
    const stageAgain = await Stage.open(layer1)
    let newStage = await Stage.open(layer2)
    ctx.close()

    expect(stageAgain).toBe(stage)
    expect(newStage).toBeTruthy()
    expect(cache1.contains(newStage)).toBe(false)

    // Create a new cache, make a context for both, and check that a newly
    // created stage publishes to both caches.
    cache1.clear()
    const cache2 = new StageCache()
    const outer = new StageCacheContext(cache1)
    const inner = new StageCacheContext(cache2)
    newStage = await Stage.open(layer2)
    inner.close()
    outer.close()

    expect(cache1.contains(newStage)).toBe(true)
    expect(cache2.contains(newStage)).toBe(true)

    // Publish a stage with a specific session layer to a cache, then check
    // that a call to Stage.Open() that doesn't specify a session layer finds
    // that layer in the cache, but that a call to Stage.Open() that demands
    // no session layer finds no layer in the cache.
    cache1.clear()
    ctx = new StageCacheContext(cache1)
    newStage = await Stage.open(layer1, { sessionLayer: layer2 })
    const newStage2 = await Stage.open(layer1)
    expect(newStage).toBe(newStage2)
    const newStage3 = await Stage.open(layer1, { sessionLayer: null })
    expect(newStage3).not.toBe(newStage)
    ctx.close()

    // Verify that blocking caches works as expected.
    cache1.clear()
    ctx = new StageCacheContext(cache1)
    {
      // Populate a stage into the cache.
      newStage = await Stage.open(layer1)
      expect(cache1.contains(newStage)).toBe(true)
      const block = new StageCacheContext(BlockStageCaches)
      // Open() should create a new stage, since cache is blocked.
      const blockedStage2 = await Stage.open(layer1)
      expect(blockedStage2).not.toBe(newStage)
      expect(cache1.size()).toBe(1)
      // Opening a different stage should not populate the cache.
      const blockedStage3 = await Stage.open(layer2)
      expect(cache1.contains(blockedStage3)).toBe(false)
      expect(cache1.size()).toBe(1)
      block.close()
    }
    ctx.close()

    // Try blocking cache writes only.
    cache1.clear()
    ctx = new StageCacheContext(cache1)
    {
      // Populate a stage into the cache.
      newStage = await Stage.open(layer1)
      expect(cache1.contains(newStage)).toBe(true)
      const block = new StageCacheContext(BlockStageCachePopulation)
      // Open() should read the stage from the cache.
      const readStage2 = await Stage.open(layer1)
      expect(readStage2).toBe(newStage)
      // Opening a different stage should not populate the cache.
      const readStage3 = await Stage.open(layer2)
      expect(cache1.contains(readStage3)).toBe(false)
      expect(cache1.size()).toBe(1)
      block.close()
    }
    ctx.close()
  })

  // testUsdStageCache.py:336-368
  it('test_ImplicitSessionLayer', async () => {
    const cache = new StageCache()
    const layer1 = Layer.createAnonymous()
    const sess = Layer.createAnonymous()

    // Opening a stage that is not already present in the cache, specifying
    // no session layer should actually produce a stage with no session
    // layer.
    const ctx = new StageCacheContext(cache)
    const implicitSession = await Stage.open(layer1)
    const noSession = await Stage.open(layer1, { sessionLayer: null })
    const explicitSession = await Stage.open(layer1, { sessionLayer: sess })
    const dontCareSession = await Stage.open(layer1)
    ctx.close()

    // The implicitSession stage should have a usd-generated session layer,
    // and should not match explicitSession's session layer.
    expect(implicitSession.hasSessionLayer()).toBe(true)
    expect(implicitSession.getSessionLayer()).not.toBe(explicitSession.getSessionLayer())

    // The noSession stage should have no session layer, and should not be
    // the same stage as either explicitSession or implicitSession.
    expect(noSession.hasSessionLayer()).toBe(false)
    expect([explicitSession, implicitSession]).not.toContain(noSession)

    // The explicitSession stage should have the session layer we specified,
    // and should not be the same as noSession or implicitSession.
    expect(explicitSession.getSessionLayer()).toBe(sess)
    expect([noSession, implicitSession]).not.toContain(explicitSession)

    // The dontCareSession should be either noSession or explicitSession or
    // implicitSession, since it didn't specify a sessionLayer argument.
    expect([noSession, explicitSession, implicitSession]).toContain(dontCareSession)
  })
})

// Ported from OpenUSD 26.11.1:
//  pxr/usd/usd/testenv/testUsdLoadUnloadDeepNestedInstancing.py
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1
// pxr/usd/usd/testenv/testUsdLoadUnloadDeepNestedInstancing.py (registered as
// testUsdLoadUnloadDeepNestedInstancing). The testenv directory
// testUsdLoadUnloadDeepNestedInstancing.testenv (Earth.usd, Mountain.usd,
// Rocks.usd, Pebble.usd) is copied unmodified into
// fixtures/testUsdLoadUnloadDeepNestedInstancing (Copyright Pixar, Modified
// Apache 2.0, https://openusd.org/license); upstream runs with that
// directory as the working directory.
//
// API mapping: UsdStage::Unload() is unload('/'); UsdPrim::_GetSourcePrimIndex
// is Prim._getSourcePrimIndex.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'

const TESTENV = path.join(fileURLToPath(new URL('.', import.meta.url)),
  'fixtures/testUsdLoadUnloadDeepNestedInstancing')

describe('testUsdLoadUnloadDeepNestedInstancing', () => {
  // 1. Tests a scenario where normal prim and prototypes for an instance
  // under this normal prim are present in subtreesToLoad in parallel
  it('test_PrototypeIsDescendant', async () => {
    const stage = (await Stage.open(path.join(TESTENV, 'Mountain.usd')))!
    expect(stage.getPrototypes().length).toBe(60)

    const parentToInstances = '/Mountain'
    const pathsToLoad = ['/Mountain/Rocks1']
    const pathsToUnload = [1, 2, 3, 4, 5].map(n => `/Mountain/Rocks${n}`)

    // unload everything
    await stage.unload('/')
    expect(stage.getPrototypes().length).toBe(0)

    await stage.loadAndUnload([parentToInstances], [])
    expect(stage.getPrototypes().length).toBe(60)

    // Following should not cause a crash
    await stage.loadAndUnload(pathsToLoad, pathsToUnload)
    expect(stage.getPrototypes().length).toBe(60)
  })

  // Test the scenario where an instance under a prototype have the same
  // sourcePath as another prototype's sourcePath.
  // Tests the scenario where 2 prototypes' sourcePath have an
  // ancestor/descendant relationship.
  it('test_PrototypeAndNestedPrototypePath', async () => {
    const stage = (await Stage.open(path.join(TESTENV, 'Earth.usd')))!
    expect(stage.getPrototypes().length).toBe(61)

    let pathToUnload: string | undefined
    // find a nested instance (representing a source for a prototype) to
    // unload
    for (const m of stage.getPrototypes()) {
      const rootPath = m._getSourcePrimIndex().getRootNode().path.pathString
      if (rootPath.includes('Pebble')) {
        pathToUnload = rootPath
        break
      }
    }
    expect(pathToUnload).toBeDefined()

    await stage.loadAndUnload([], [pathToUnload!])
    expect(stage.getPrototypes().length).toBe(62)
  })
})

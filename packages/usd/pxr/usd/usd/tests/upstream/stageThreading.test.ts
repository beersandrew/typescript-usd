// Ported from OpenUSD 26.11.1: pxr/usd/usd/testenv/testUsdStageThreading.cpp
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usd/testenv/testUsdStageThreading.cpp
// (registered as testUsdStageThreading). The testenv directory
// testUsdStageThreading/ (a-e) is copied unmodified into
// fixtures/testUsdStageThreading (Copyright Pixar, TOST 1.0,
// https://openusd.org/license).
//
// Upstream computes a digest of each asset's composed stage on the main
// thread (_AddTestCase), then has numThreads workers recompose random test
// cases for --msec milliseconds and verify every digest matches. JavaScript
// has no shared-memory threads for stage composition; the meaningful
// counterpart is many asynchronous Stage.open calls in flight at once
// (asset I/O and payload loads interleave on the event loop), each of which
// must reproduce the setup-phase digest. A fixed number of rounds replaces
// the wall-clock loop, and cases are visited in order instead of by mt19937.
//
// The setup-phase digests are also compared with the pinned build's
// (fixtures/testUsdStageThreading, FIXTURES.md), which upstream does not do.
// Not ported: the SdfLayer::GetLoadedLayers() leak checks
// (testUsdStageThreading.cpp:166-169, 210-213) - layer lifetime here follows
// JavaScript garbage collection, so released layers are not dropped
// deterministically.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import 'typescript-usd/usdGeom'
import { Stage } from 'typescript-usd/usd'

const TESTENV = path.join(fileURLToPath(new URL('.', import.meta.url)),
  'fixtures/testUsdStageThreading')
const native = JSON.parse(readFileSync(path.join(TESTENV, 'expected.json'), 'utf8'))
  .payload as Record<string, Result>

const testPaths = ['a/test.usda', 'b/test.usda', 'c/test.usda', 'd/test.usda', 'e/test.usda']

interface Result { didLoad: boolean, digest: string }

// _DumpResults (testUsdStageThreading.cpp:46-89).
async function dumpResults(stage: Stage, primPath: string, result: string[]): Promise<void> {
  // UsdStage::Load returns the prim at the loaded path.
  await stage.load(primPath)
  const prim = stage.getPrim(primPath)
  if (!prim) return
  result.push(`${primPath}: ${prim.typeName}\n`)

  // Variants
  if (primPath !== '/') {
    const vsets = stage.getVariantSets(primPath)
    for (const vsetName of vsets.getNames()) {
      result.push(`\tVariantSet: ${vsetName}\n`)
      const vset = vsets.getVariantSet(vsetName)
      for (const varName of vset.getVariantNames()) {
        result.push(`\t\tvariant: ${varName}\n`)
      }
      // Upstream's format string has a literal backslash-t here.
      result.push(`\\tselection: ${vset.getVariantSelection()}\n`)
    }
  }

  // Properties
  for (const propName of prim.getPropertyNames()) {
    result.push(`\tproperty: ${propName}\n`)
  }

  // Children
  for (const child of prim.getChildren()) {
    await dumpResults(stage, child.path, result)
  }
}

// _ComputeResult (testUsdStageThreading.cpp:91-103).
async function computeResult(inputAssetPath: string): Promise<Result> {
  const stage = await Stage.open(path.join(TESTENV, inputAssetPath))
  const digest: string[] = []
  if (stage) await dumpResults(stage, '/', digest)
  return { didLoad: !!stage, digest: digest.join('') }
}

describe('testUsdStageThreading', () => {
  it('recomposes every test case concurrently with identical digests', async () => {
    // SETUP PHASE
    const testCases: [string, Result][] = []
    for (const assetPath of testPaths) {
      testCases.push([assetPath, await computeResult(assetPath)])
    }
    expect(testCases.some(([, r]) => r.didLoad),
      'Expected at least one asset to load successfully.').toBe(true)
    for (const [assetPath, result] of testCases) {
      expect(result, assetPath).toEqual(native[assetPath])
    }

    // Concurrent recomposition: numTasks tasks, each composing every case
    // rounds times.
    const numTasks = 8
    const rounds = 3
    let nIters = 0
    await Promise.all(Array.from({ length: numTasks }, async (_, task) => {
      for (let n = 0; n < rounds * testCases.length; n++) {
        const [assetPath, expected] = testCases[(n + task) % testCases.length]!
        const actual = await computeResult(assetPath)
        expect(actual.didLoad).toBe(expected.didLoad)
        expect(actual.digest).toBe(expected.digest)
        nIters++
      }
    }))
    expect(nIters).toBe(numTasks * rounds * testCases.length)
  })
})

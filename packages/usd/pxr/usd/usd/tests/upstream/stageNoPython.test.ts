// Ported from OpenUSD 26.11.1: pxr/usd/usd/testenv/testUsdStageNoPython.cpp
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usd/testenv/testUsdStageNoPython.cpp
// (registered as testUsdStageNoPython). Upstream checks that a C++ program
// opens and exports a stage without initializing Python; the
// Py_IsInitialized() axioms have no counterpart here. What is ported is
// _OpenAndExport (testUsdStageNoPython.cpp:22-38) on the testenv's
// ascii.usd and binary.usd, copied unmodified into
// fixtures/testUsdStageNoPython (Copyright 2017 Pixar, TOST 1.0,
// https://openusd.org/license). Upstream only asserts that the export
// succeeds; the exported text is compared with the pinned build's output
// (fixtures/testUsdStageNoPython, FIXTURES.md), with the testenv directory
// prefix of the flatten comment replaced by <testenv>.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'

const TESTENV = path.join(fileURLToPath(new URL('.', import.meta.url)),
  'fixtures/testUsdStageNoPython')
const expected = JSON.parse(readFileSync(path.join(TESTENV, 'expected.json'), 'utf8'))
  .payload as Record<string, string>

async function openAndExport(assetPath: string): Promise<string> {
  const stage = await Stage.open(path.join(TESTENV, assetPath))
  expect(stage).toBeTruthy()
  // UsdStage::ExportToString (stage.cpp): Flatten, then export the layer.
  return stage!.flatten().exportToString().split(TESTENV + '/').join('<testenv>/')
}

describe('testUsdStageNoPython', () => {
  it('creates an in-memory stage', () => {
    expect(Stage.createNew()).toBeTruthy()
  })

  for (const name of ['ascii.usd', 'binary.usd']) {
    it(`opens and exports ${name}`, async () => {
      expect(await openAndExport(name)).toBe(expected[name])
    })
  }
})

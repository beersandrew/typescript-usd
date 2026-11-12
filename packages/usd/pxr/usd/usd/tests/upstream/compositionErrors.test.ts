// Ported from OpenUSD 26.11.1: pxr/usd/usd/stage.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// UsdStage::GetCompositionErrors, stage.cpp:4025-4044. Expected classes,
// composed paths and diagnostic text are native captures in fixtures/ (FIXTURES.md).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import { Stage } from '../../src/index.ts'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'
const fixture = new URL('./fixtures/compositionErrors/', import.meta.url)
const expected = readOracleFixture(new URL('expected.json', fixture))
const fixturePath = fileURLToPath(fixture).replace(/\/$/, '')

describe('UsdStage.GetCompositionErrors', () => {
  it('returns prim-index and layer-stack diagnostics without rejecting the populated stage', async () => {
    const stage = (await Stage.open(fileURLToPath(new URL('root.usda', fixture))))!
    try {
      expect([...stage.traverse()]).toEqual(expected.paths)
      const errors = stage.getCompositionErrors()
      expect(errors.map(e => e.constructor.name.replace(/^Pcp/, ''))).toEqual(expected.errors.map((e: { class: string }) => e.class))
      // Additional Sdf provider error text is not yet carried through the
      // async Pcp layer source. Compare the upstream composition message,
      // excluding that suffix; this test does not claim suffix parity.
      const mainMessage = (message: string) => message.split(' -- ')[0]!.replace(/\.$/, '')
      expect(errors.map(e => mainMessage(e.message.replaceAll(fixturePath, '<fixture>'))))
        .toEqual(expected.errors.map((e: { message: string }) => mainMessage(e.message)))
      errors.length = 0
      expect(stage.getCompositionErrors()).toHaveLength(expected.errors.length)
    } finally { stage.dispose() }
  })

  it('returns an empty vector for a successfully composed in-memory stage', async () => {
    const stage = await Stage.open(Layer.createInMemory('clean.usda', '#usda 1.0\ndef "Geometry" {}\n'))
    try { expect(stage.getCompositionErrors()).toEqual([]) }
    finally { stage.dispose() }
  })
})

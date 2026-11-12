// Ported from OpenUSD 26.11.1: pxr/usd/usd/clipCache.cpp,
//  pxr/usd/usd/clipSetDefinition.cpp
// Copyright 2016, 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Native expectations: ../fixtures/ancestralClipSets (FIXTURES.md). A prim's
// own clip sets compose and order from its own sites
// (usd/clipSetDefinition.cpp:406-676); the clip sets of its nearest ancestor
// with clips follow, weaker, in the order composed at that ancestor
// (Usd_ClipCache::PopulateClipsForPrim, usd/clipCache.cpp:191-240).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Stage } from '../../src/index.ts'

const fixture = fileURLToPath(new URL('../fixtures/ancestralClipSets/', import.meta.url))
const expected = JSON.parse(readFileSync(fixture + 'expected.json', 'utf8')).payload as Record<string, {
  timeSamples: number[]
  values: [number, number | null][]
}>

describe('clip sets authored on namespace ancestors', () => {
  for (const [name, row] of Object.entries(expected)) {
    it(`${name}: time samples and values match OpenUSD`, async () => {
      const stage = (await Stage.open(`${fixture}${name}/root.usda`))!
      const attr = stage.get('/Model/Child/Leaf.value')!
      expect(attr.getTimeSampleKeys()).toEqual(row.timeSamples)
      for (const [time, value] of row.values) {
        if (value === null) expect(attr.getValueAtTime(time), `t=${time}`).toBeUndefined()
        else expect(Number(attr.getValueAtTime(time)), `t=${time}`).toBeCloseTo(value, 9)
      }
    })
  }
})

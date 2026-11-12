// Ported from OpenUSD 26.11.1: pxr/usd/usd/clipSet.cpp
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Native expectations: ../fixtures/clipTimesUnsorted (FIXTURES.md). Usd_ClipSet
// stable-sorts the authored clip `times` by stage time before detecting jump
// discontinuities (usd/clipSet.cpp:440-456).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Stage, TimeCode as UsdTimeCode } from '../../src/index.ts'

const fixture = fileURLToPath(new URL('../fixtures/clipTimesUnsorted/', import.meta.url))
const expected = JSON.parse(readFileSync(fixture + 'expected.json', 'utf8')).payload as Record<string, {
  timeSamples: number[]
  values: [number, number][]
  preTimeValues: [number, number][]
}>

describe('value clips with unsorted authored times', () => {
  for (const [name, row] of Object.entries(expected)) {
    it(`${name}: time samples and values match OpenUSD`, async () => {
      const stage = (await Stage.open(fixture + 'root.usda'))!
      try {
        const attr = stage.get(`/${name}.size`)!
        const keys = attr.getTimeSampleKeys()
        expect(keys.length).toBe(row.timeSamples.length)
        keys.forEach((key, i) => expect(key).toBeCloseTo(row.timeSamples[i]!, 12))
        for (const [time, value] of row.values) {
          expect(attr.getValueAtTime(time) as number, `t=${time}`).toBeCloseTo(value, 5)
        }
        for (const [time, value] of row.preTimeValues) {
          expect(attr.getValueAtTime(UsdTimeCode.PreTime(time)) as number, `pre ${time}`)
            .toBeCloseTo(value, 5)
        }
      } finally {
        stage.dispose()
      }
    })
  }
})

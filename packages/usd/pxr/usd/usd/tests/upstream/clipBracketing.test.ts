// Ported from OpenUSD 26.11.1: pxr/usd/usd/clip.cpp, pxr/usd/usd/clipSet.cpp,
//  pxr/usd/usd/stage.cpp
// Copyright 2016, 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Native expectations: ../fixtures/clipBracketing (FIXTURES.md). Value clip
// resolution brackets samples per clip over each clip's active range and
// interpolates from a clip's last sample toward the next contributing clip's
// start (usd/clipSet.cpp:690-776, usd/clip.cpp:277-583,
// usd/stage.cpp:7447-7509).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { InterpolationTypeHeld, Stage, TimeCode as UsdTimeCode } from '../../src/index.ts'

const fixture = fileURLToPath(new URL('../fixtures/clipBracketing/', import.meta.url))
const expected = JSON.parse(readFileSync(fixture + 'expected.json', 'utf8')).payload as Record<string, {
  timeSamples: number[]
  linear: [number, number | null][]
  preTime: [number, number | null][]
  held: [number, number | null][]
}>

const num = (value: unknown): number | null =>
  value === undefined || value === null ? null : Number(value)

function expectValue(actual: unknown, value: number | null, label: string): void {
  if (value === null) expect(actual, label).toBeUndefined()
  else expect(num(actual), label).toBeCloseTo(value, 6)
}

describe('value clips bracketing across clip boundaries', () => {
  for (const [name, row] of Object.entries(expected)) {
    it(`${name}: time samples and values match OpenUSD`, async () => {
      const stage = (await Stage.open(`${fixture}${name}/root.usda`))!
      try {
        const attr = stage.get('/Model.value')!
        const keys = attr.getTimeSampleKeys()
        expect(keys.length).toBe(row.timeSamples.length)
        keys.forEach((key, i) => expect(key).toBeCloseTo(row.timeSamples[i]!, 12))
        for (const [time, value] of row.linear) expectValue(attr.getValueAtTime(time), value, `t=${time}`)
        for (const [time, value] of row.preTime) {
          expectValue(attr.getValueAtTime(UsdTimeCode.PreTime(time)), value, `pre ${time}`)
        }
        stage.setInterpolationType(InterpolationTypeHeld)
        for (const [time, value] of row.held) expectValue(attr.getValueAtTime(time), value, `held t=${time}`)
      } finally {
        stage.dispose()
      }
    })
  }
})

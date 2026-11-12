// Ported from OpenUSD 26.11.1: pxr/base/ts/spline.cpp, pxr/base/ts/types.h,
//  pxr/usd/sdf/textFileFormatParser.cpp
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Spline inner-loop counts at the usda/usdc boundary: Ts_LoopParams stores
// int32 counts (ts/types.h:226-227), the usda parser rejects non-integers
// (textFileFormatParser.cpp:2651-2663) and TsSpline ignores negative counts
// (ts/spline.cpp:256-264). Expected values are native captures from
// ./fixtures/splineLoopCounts (FIXTURES.md).

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
// Importing typescript-usd/usd registers the crate (.usdc) file format.
import 'typescript-usd/usd'
import { Layer } from 'typescript-usd/sdf'

interface LoopCase {
  count: string
  text: string
  parsed: boolean
  error?: string
  usda?: string[]
  usdc?: string[]
}

const cases = (JSON.parse(readFileSync(
  new URL('./fixtures/splineLoopCounts/expected.json', import.meta.url), 'utf8',
)).payload as { cases: LoopCase[] }).cases

const loopLines = (layer: Layer) =>
  layer.toUsda().split('\n').map(line => line.trim()).filter(line => line.includes('loop'))

describe('spline inner-loop counts', () => {
  for (const c of cases) {
    it(`loop count ${c.count}`, () => {
      if (!c.parsed) {
        expect(() => Layer.createInMemory('loop.usda', c.text)).toThrow(c.error)
        return
      }
      const layer = Layer.createInMemory('loop.usda', c.text)
      expect(loopLines(layer)).toEqual(c.usda)
      expect(loopLines(Layer.fromBytes(layer.toUsdc(), 'loop.usdc'))).toEqual(c.usdc)
    })
  }
})

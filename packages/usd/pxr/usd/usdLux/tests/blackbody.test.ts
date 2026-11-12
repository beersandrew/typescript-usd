// Ported from OpenUSD 26.11.1: pxr/usd/usdLux/blackbody.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// typescript-usd's own check of UsdLuxBlackbodyTemperatureAsRgb
// (pxr/usd/usdLux/blackbody.cpp:71-114) against values captured from the
// pinned OpenUSD build: tests/fixtures/blackbody (FIXTURES.md).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { BlackbodyTemperatureAsRgb } from '../src/blackbody.ts'

const fixture = JSON.parse(readFileSync(
  path.join(import.meta.dirname, 'fixtures/blackbody/expected.json'), 'utf8'))
const cases = fixture.payload.cases as Array<[number, number, number, number]>

describe('UsdLuxBlackbodyTemperatureAsRgb', () => {
  it.each(cases)('matches OpenUSD at %d K', (temp, r, g, b) => {
    expect([...BlackbodyTemperatureAsRgb(temp).data]).toEqual([r, g, b])
  })
})

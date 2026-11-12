// Ported from OpenUSD 26.11.1: pxr/usd/usdShade/utils.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Captured with native USD 26.11.1; algorithm ported from v26.11.1 utils.cpp.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { getValueProducingAttributes } from '../../src/index.ts'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'
const base = new URL('./fixtures/valueProducers/', import.meta.url)
const expected = readOracleFixture(new URL('expected.json', base))
it('resolves only legal value producers, with local fallback and ordered multiple sources', async () => {
  const stage = (await Stage.open(fileURLToPath(new URL('stage.usda', base))))!
  for (const row of expected.cases) {
    expect(getValueProducingAttributes(stage, row.path).map(a => a.getPath()), row.name).toEqual(row.all)
    expect(getValueProducingAttributes(stage, row.path, true).map(a => a.getPath()), row.name).toEqual(row.shaderOnly)
  }
})

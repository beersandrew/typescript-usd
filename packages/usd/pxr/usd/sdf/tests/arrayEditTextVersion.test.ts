// Ported from OpenUSD 26.11.1: pxr/usd/sdf/fileIO.cpp,
//  pxr/usd/sdf/fileIO_Common.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Native 26.11.1 captures: fileIO_Common.cpp:196-243,1122-1151; fileIO.cpp:80-104.
import { describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import expectedFixture from './fixtures/arrayEditTextVersion/expected.json' with { type: 'json' }
import { oraclePayload } from '../../../testing/oracleFixture.ts'
const expected = oraclePayload(expectedFixture)

describe('Sdf usda header version for array-edit values', () => {
  for (const row of expected.cases) it(row.name, () => {
    const layer = Layer.createInMemory(`${row.name}.usda`, row.text)
    expect(layer.exportToString().split('\n')[0]).toBe(row.header)
  })
})

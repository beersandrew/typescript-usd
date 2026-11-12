// Ported from OpenUSD 26.11.1: pxr/usd/sdf/parserHelpers.cpp,
//  pxr/usd/sdf/parserHelpers.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Native 26.11.1 captures: parserHelpers.h:157-190; parserHelpers.cpp:651-677.
import { describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import { Array as VtArray } from 'typescript-usd/vt'
import expectedFixture from './fixtures/boolLiterals/expected.json' with { type: 'json' }
import { oraclePayload } from '../../../testing/oracleFixture.ts'
const expected = oraclePayload(expectedFixture)

describe('Sdf usda bool literal spellings', () => {
  for (const row of expected.cases) it(`${row.shape} ${row.literal}`, () => {
    if (!row.accepted) {
      expect(() => Layer.createInMemory('bool.usda', row.text)).toThrow()
      return
    }
    const layer = Layer.createInMemory('bool.usda', row.text)
    const value = layer.getAttributeAtPath('/P.a')!.getDefaultValue()
    expect(value instanceof VtArray ? value.toArray() : value).toEqual(row.value)
  })
})

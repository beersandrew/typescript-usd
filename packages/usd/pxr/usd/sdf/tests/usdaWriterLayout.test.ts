// Ported from OpenUSD 26.11.1: pxr/usd/sdf/fileIO_Common.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Native 26.11.1 captures: fixtures/usdaWriterLayout (FIXTURES.md).
// Sdf_WritePrimBody (fileIO_Common.h:606-620) writes properties, a blank
// line only between properties and name children, the children, then the
// variant sets with no blank line before them. Variant selections are
// written from a VtDictionary, sorted by name, and an empty selection map
// still opens the metadata parens (fileIO_Common.h:486-496).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import fieldsFixture from './fixtures/usdaWriterLayout/variantSetsWithoutNames.fields.json' with { type: 'json' }
import { oraclePayload } from '../../../testing/oracleFixture.ts'

const fixture = (name: string) => readFileSync(new URL(`./fixtures/usdaWriterLayout/${name}`, import.meta.url), 'utf8')
const roundTrip = (name: string) => Layer.createInMemory(`${name}.usda`, fixture(`${name}.usda`)).exportToString()

describe('USDA prim body layout', () => {
  it('writes variant sets directly after properties and children', () => {
    expect(roundTrip('variantSetLayout')).toBe(fixture('variantSetLayout.expected.usda'))
  })

  it('writes variant selections sorted, and keeps an empty selection map', () => {
    expect(roundTrip('variantSelections')).toBe(fixture('variantSelections.expected.usda'))
  })

  it('authors no variant set names for variant set blocks alone', () => {
    const name = 'variantSetsWithoutNames'
    const layer = Layer.createInMemory(`${name}.usda`, fixture(`${name}.usda`))
    const hasNames = oraclePayload(fieldsFixture) as Record<string, boolean>
    for (const [path, expected] of Object.entries(hasNames)) {
      expect(layer.listFields(path).includes('variantSetNames')).toBe(expected)
    }
    expect(layer.exportToString()).toBe(fixture(`${name}.expected.usda`))
  })
})

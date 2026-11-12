// Ported from OpenUSD 26.11.1: pxr/usd/sdf/crateData.cpp,
//  pxr/usd/sdf/crateFile.cpp, pxr/usd/sdf/schema.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Native 26.11.1 captures: fixtures/crateMetadataValues (FIXTURES.md).
// allowedTokens is a VtTokenArray field and displayGroupOrder a VtStringArray
// field (schema.cpp:735,766), stored in USDC as token and string arrays; every
// field is unpacked on open (crateData.cpp:830-850), and dictionary values
// keep their held type, here SdfPathExpression (crateFile.cpp:1260-1267).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Layer, sdfGetDictionaryValueTypes } from 'typescript-usd/sdf'
import expectedFixture from './fixtures/crateMetadataValues/expected.json' with { type: 'json' }
import { oraclePayload } from '../../../testing/oracleFixture.ts'

const expected = oraclePayload(expectedFixture)
const fixture = (name: string) => readFileSync(new URL(`./fixtures/crateMetadataValues/${name}`, import.meta.url))

describe('Token/string-array metadata and pathExpression dictionary values in USDC', () => {
  const native = Layer.fromBytes(new Uint8Array(fixture('metadata.usdc')), 'metadata.usdc')
  const written = Layer.fromBytes(
    Layer.createInMemory('metadata.usda', fixture('metadata.usda').toString('utf8')).toUsdc(), 'written.usdc')

  for (const [label, layer] of [['native', native], ['typescript-usd-written', written]] as const) {
    it(`${label} USDC: reads as OpenUSD reads the native file`, () => {
      expect(layer.exportToString()).toBe(expected.reopened)
    })

    it(`${label} USDC: allowedTokens, displayGroupOrder and the customData pathExpression`, () => {
      expect(layer.getAttributeAtPath('/P.c')!.getAllowedTokens()).toEqual(expected.allowedTokens)
      expect(layer.getField('/P', 'displayGroupOrder')).toEqual(expected.displayGroupOrder)
      const customData = layer.getField('/P', 'customData') as Record<string, unknown>
      expect(String(customData['e'])).toBe(expected.customDataExpression.text)
      expect(expected.customDataExpression.type).toBe('PathExpression')
      expect(sdfGetDictionaryValueTypes(customData)?.get('e')).toBe('pathExpression')
    })
  }
})

// Ported from OpenUSD 26.11.1: pxr/usd/sdf/textParserHelpers.cpp
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Native 26.11.1 captures: fixtures/rootMetadata (FIXTURES.md).
// Unknown fields survive loading/saving per textParserHelpers.cpp:209-258.
import { describe, expect, it } from 'vitest'
import { Layer, sdfNormalizeListOp } from 'typescript-usd/sdf'
import expectedFixture from './fixtures/rootMetadata/expected.json' with { type: 'json' }
import { oraclePayload } from '../../../testing/oracleFixture.ts'
const expected = oraclePayload(expectedFixture)
import metadataFixture from './fixtures/metadataPlugInfo/expected.json' with { type: 'json' }
const nativeListOp = oraclePayload(metadataFixture).unregistered.listOp

describe('Unregistered pseudo-root metadata preservation', () => {
  for (const row of expected.cases) {
    it(`${row.name}: preserves native source representation through export/reimport`, () => {
      // Native accepts an unregistered path but records no text for it, so
      // it exports `customThing = `, which neither reader accepts again.
      // Unregistered list edits retain the native raw bucket interiors.
      if (!row.accepted) {
        expect(() => Layer.createInMemory(`${row.name}.usda`, row.text)).toThrow()
        return
      }
      const layer = Layer.createInMemory(`${row.name}.usda`, row.text)
      expect(layer.getFieldNames('/')).toContain('customThing')
      if (row.name === 'list-edit') expect(sdfNormalizeListOp(layer.getField('/', 'customThing'))).toEqual(nativeListOp)
      else if (row.nativeValue !== null) expect(layer.getField('/', 'customThing')).toBe(row.nativeValue)
      expect(layer.exportToString().trim()).toBe(row.exported!.trim())
      if (!row.reopenAccepted) {
        expect(() => Layer.createInMemory(`${row.name}-reopen.usda`, layer.exportToString())).toThrow()
        return
      }
      const reopened = Layer.createInMemory(`${row.name}-reopen.usda`, layer.exportToString())
      expect(reopened.exportToString().trim()).toBe(row.exported!.trim())
    })
  }
})

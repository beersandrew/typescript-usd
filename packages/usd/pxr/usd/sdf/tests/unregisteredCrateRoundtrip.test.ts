// Ported from OpenUSD 26.11.1: pxr/usd/sdf/crateData.cpp,
//  pxr/usd/sdf/crateFile.cpp, pxr/usd/sdf/textParserHelpers.cpp
// Copyright 2016, 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Native 26.11.1 captures: fixtures/unregisteredCrate (FIXTURES.md).
// Unknown fields are stored as SdfUnregisteredValue (textParserHelpers.cpp:
// 209-292), written and read back by the crate as such (crateFile.cpp:
// 1274-1288,1543), and every field of every spec is unpacked on open
// (crateData.cpp:830-850), so unknown layer and prim metadata survive USDC.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Layer, sdfNormalizeListOp } from 'typescript-usd/sdf'
import expectedFixture from './fixtures/unregisteredCrate/expected.json' with { type: 'json' }
import { oraclePayload } from '../../../testing/oracleFixture.ts'

const expected = oraclePayload(expectedFixture)
const nativeUsdc = (name: string): Uint8Array =>
  readFileSync(new URL(`./fixtures/unregisteredCrate/${name}.usdc`, import.meta.url))

describe('Unregistered metadata through USDC', () => {
  for (const row of expected.cases) {
    it(`${row.name}: survives a USDC write and reopen`, () => {
      const layer = Layer.createInMemory(`${row.name}.usda`, row.text)
      expect(layer.exportToString()).toBe(row.exported)
      const reopened = Layer.fromBytes(layer.toUsdc(), `${row.name}.usdc`)
      expect(reopened.exportToString()).toBe(row.reopenedFromUsdc)
      // An SdfUnregisteredValueListOp compares as a list op (empty item
      // lists are absent in one representation and empty in the other).
      const field = (l: Layer, path: string, name: string): unknown =>
        row.name === 'list-edit' ? sdfNormalizeListOp(l.getField(path, name) as never) : l.getField(path, name)
      expect(field(reopened, '/', 'customThing')).toEqual(field(layer, '/', 'customThing'))
      expect(field(reopened, '/P', 'primThing')).toEqual(field(layer, '/P', 'primThing'))
    })

    it(`${row.name}: is read from a native USDC file`, () => {
      const layer = Layer.fromBytes(nativeUsdc(row.name), `${row.name}.usdc`)
      expect(layer.exportToString()).toBe(row.reopenedFromUsdc)
    })
  }

  for (const format of ['usda', 'usdc'] as const) {
    it(`unmodified unknown layer fields survive an edit elsewhere (${format})`, () => {
      const layer = Layer.createInMemory('edited.usda', expected.edited.text)
      layer.setField('/P.edited', 'default', 2)
      const bytes = format === 'usdc' ? layer.toUsdc() : new TextEncoder().encode(layer.toUsda())
      const reopened = Layer.fromBytes(bytes, `edited.${format}`)
      expect(reopened.exportToString()).toBe(expected.edited.reopened[format])
    })
  }
})

// Ported from OpenUSD 26.11.1: pxr/usd/sdf/crateData.cpp, pxr/usd/sdf/path.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Native 26.11.1 captures: fixtures/crateUtf8Children (FIXTURES.md).
// The crate data checks each primChildren entry with
// SdfPath::IsValidIdentifier (crateData.cpp:960-980), which accepts UTF-8
// XID identifiers (path.cpp:1818-1863), so prims with UTF-8 names open.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import expectedFixture from './fixtures/crateUtf8Children/expected.json' with { type: 'json' }
import { oraclePayload } from '../../../testing/oracleFixture.ts'

const expected = oraclePayload(expectedFixture)
const fixture = (name: string) => readFileSync(new URL(`./fixtures/crateUtf8Children/${name}`, import.meta.url))

describe('UTF-8 prim names in USDC', () => {
  it('a native USDC file opens and reads as OpenUSD reads it', () => {
    const layer = Layer.fromBytes(new Uint8Array(fixture('utf8.usdc')), 'utf8.usdc')
    expect(layer.exportToString()).toBe(expected.reopened)
  })

  it('a typescript-usd-written USDC file opens and reads the same', () => {
    const source = Layer.createInMemory('utf8.usda', fixture('utf8.usda').toString('utf8'))
    expect(Layer.fromBytes(source.toUsdc(), 'written.usdc').exportToString()).toBe(expected.reopened)
  })
})

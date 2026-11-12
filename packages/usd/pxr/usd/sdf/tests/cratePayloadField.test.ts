// Ported from OpenUSD 26.11.1: pxr/usd/sdf/crateData.cpp,
//  pxr/usd/sdf/crateFile.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Native 26.11.1 captures: fixtures/cratePayloadField (FIXTURES.md).
// OpenUSD stores a single explicit payload as an SdfPayload value
// (crateData.cpp:563-569,1100-1124; crateFile.cpp:1309-1325) and converts it
// back to an explicit SdfPayloadListOp when the payload field is read
// (crateData.cpp:400-404,1075-1098).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import expectedFixture from './fixtures/cratePayloadField/expected.json' with { type: 'json' }
import { oraclePayload } from '../../../testing/oracleFixture.ts'

const expected = oraclePayload(expectedFixture)
const nativeUsdc = readFileSync(new URL('./fixtures/cratePayloadField/payload.usdc', import.meta.url))

describe('Payload field in a native USDC file', () => {
  const layer = Layer.fromBytes(new Uint8Array(nativeUsdc), 'payload.usdc')

  it('keeps the explicit and the prepended payload', () => {
    expect(layer.exportToString()).toBe(expected.reopened)
  })

  for (const [path, op] of Object.entries(expected.prims)) {
    it(`${path}: reads the payload list op`, () => {
      const list = layer.getPrimAtPath(path)!.getPayloadList()
      const items = (proxy: { toArray(): { assetPath: string, primPath: string, layerOffset: { offset: number, scale: number } }[] }) =>
        proxy.toArray().map(p => ({ assetPath: p.assetPath, primPath: p.primPath, layerOffset: { ...p.layerOffset } }))
      expect(list.isExplicit()).toBe(op.isExplicit)
      expect(items(list.getExplicitItems())).toEqual(op.explicitItems)
      expect(items(list.getAddedItems())).toEqual(op.addedItems)
      expect(items(list.getPrependedItems())).toEqual(op.prependedItems)
      expect(items(list.getAppendedItems())).toEqual(op.appendedItems)
      expect(items(list.getDeletedItems())).toEqual(op.deletedItems)
      expect(items(list.getOrderedItems())).toEqual(op.orderedItems)
    })
  }
})

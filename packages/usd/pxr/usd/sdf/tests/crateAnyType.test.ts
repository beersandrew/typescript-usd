// Ported from OpenUSD 26.11.1: pxr/usd/sdf/tokens.h, pxr/usd/usd/stage.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// SdfTokens->AnyTypeToken ("__AnyType__", OpenUSD v26.08
// pxr/usd/sdf/tokens.h:18) is an ordinary authored typeName value to Sdf; only
// UsdStage skips it when composing a prim's type (pxr/usd/usd/stage.cpp:3341).
// Expected values captured from OpenUSD v26.08: Sdf.PrimSpec.typeName reads
// '__AnyType__' from the text layer and from its crate round trip.
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Layer } from '../src/index.ts'

const fixture = fileURLToPath(new URL(
  '../../pcp/tests/upstream/fixtures/compositionResults/testPcpMuseum_TrickyVariantWeakerSelection3.testenv/TrickyVariantWeakerSelection3/root.usda',
  import.meta.url,
))

describe('__AnyType__ prim typeName', () => {
  it('is an authored Sdf typeName in text and crate layers', async () => {
    const layer = (await Layer.open(fixture))!
    expect(layer.getField('/Model', 'typeName')).toBe('__AnyType__')
    const crate = Layer.fromBytes(layer.toUsdc(), 'anyType.usdc')
    expect(crate.getField('/Model', 'typeName')).toBe('__AnyType__')
  })
})

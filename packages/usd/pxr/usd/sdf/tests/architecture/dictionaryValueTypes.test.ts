// Ported from OpenUSD 26.11.1: pxr/base/vt/dictionary.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// A dictionary value keeps its exact value type (a VtValue holds a typed
// value; OpenUSD v26.08 pxr/base/vt/dictionary.h), so typed customData
// entries survive a text or crate round trip. Roles are not part of a VtValue's
// type: a point3f[] entry comes back as float3[]. Expected text captured from
// OpenUSD v26.08 (Sdf.Layer ImportFromString / ExportToString, and Export to
// .usdc then reopen).
import { describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import { serializeUsdc } from '../../src/crateFile.ts'

const SOURCE = `#usda 1.0
def "P" (
    customData = {
        float3 f = (1, 2, 3)
        int3 i = (1, 2, 3)
        half h = 0.1
        float x = 0.1
        int n = 1
        double d = 1
        point3f[] pts = [(0, 1, 2), (3, 4, 5)]
        matrix4d m = ((1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 1, 0), (1, 2, 3, 1))
        quatf q = (1, 0, 0, 0)
        half2 hv = (0.1, 0.2)
        uchar u = 7
        uint64 big = 18446744073709551615
    }
)
{
}
`

const EXPECTED = `#usda 1.0

def "P" (
    customData = {
        uint64 big = 18446744073709551615
        double d = 1
        float3 f = (1, 2, 3)
        half h = 0.0999756
        half2 hv = (0.0999756, 0.199951)
        int3 i = (1, 2, 3)
        matrix4d m = ( (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 1, 0), (1, 2, 3, 1) )
        int n = 1
        float3[] pts = [(0, 1, 2), (3, 4, 5)]
        quatf q = (1, 0, 0, 0)
        uchar u = 7
        float x = 0.1
    }
)
{
}

`

describe('typed dictionary values', () => {
  it('survive a text round trip', () => {
    expect(Layer.createInMemory('a.usda', SOURCE).toUsda()).toBe(EXPECTED)
  })

  it('survive a crate round trip', () => {
    const text = Layer.createInMemory('a.usda', SOURCE)
    expect(Layer.fromBytes(serializeUsdc(text), 'b.usdc').toUsda()).toBe(EXPECTED)
  })
})

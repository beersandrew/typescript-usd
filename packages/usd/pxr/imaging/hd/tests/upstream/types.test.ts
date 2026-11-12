// Ported from OpenUSD 26.11.1: pxr/imaging/hd/testenv/testHdTypes.cpp
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/testenv/testHdTypes.cpp.
//
// Round-trips two 3-vectors through the packed HdVec4f_2_10_10_10_REV encoding
// (Vec3 -> packed -> Vec3) and asserts each component survives within eps=0.01.
// Upstream uses GfVec3f; the packing math only needs three floats, so we model
// the vector as a plain tuple and avoid a typescript-usd/gf dependency.

import { describe, it, expect } from 'vitest'
import { HdVec4f_2_10_10_10_REV } from '../../src/types.ts'

describe('HdVec4f_2_10_10_10_REV', () => {
  it('round-trips Vec3 -> packed -> Vec3 within eps', () => {
    const a: [number, number, number] = [
      -0.1617791586913686, -0.2533272416818153, 0.9537572083266245,
    ]
    const b: [number, number, number] = [
      0.12954827567352645, -0.8348099306719063, 0.5350790819323653,
    ]

    const aRt = new HdVec4f_2_10_10_10_REV(a).getAsVec()
    const bRt = new HdVec4f_2_10_10_10_REV(b).getAsVec()

    const eps = 0.01
    const closeAll = (l: [number, number, number], r: [number, number, number]): void => {
      expect(Math.abs(l[0] - r[0])).toBeLessThan(eps)
      expect(Math.abs(l[1] - r[1])).toBeLessThan(eps)
      expect(Math.abs(l[2] - r[2])).toBeLessThan(eps)
    }
    closeAll(a, aRt)
    closeAll(b, bRt)
  })

  it('packs to and from a 32-bit int', () => {
    const v: [number, number, number] = [
      -0.1617791586913686, -0.2533272416818153, 0.9537572083266245,
    ]
    const packed = new HdVec4f_2_10_10_10_REV(v)
    const restored = HdVec4f_2_10_10_10_REV.fromInt(packed.getAsInt())

    expect(restored.x).toBe(packed.x)
    expect(restored.y).toBe(packed.y)
    expect(restored.z).toBe(packed.z)
    expect(restored.w).toBe(packed.w)
  })
})

// Portions ported from OpenUSD 26.11.1, including: pxr/usd/sdf/layerOffset.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { describe, expect, it } from 'vitest'
import {
  SDF_LAYER_OFFSET_IDENTITY,
  type SdfLayerOffset,
  sdfLayerOffsetApply,
  sdfLayerOffsetCompose,
  sdfLayerOffsetEquals,
  sdfLayerOffsetInverse,
  sdfLayerOffsetIsIdentity,
} from '../../src/index.ts'

describe('SdfLayerOffset', () => {
  it('applies scale then offset', () => {
    expect(sdfLayerOffsetApply({ offset: 10, scale: 2 }, 5)).toBe(20)
    expect(sdfLayerOffsetApply(SDF_LAYER_OFFSET_IDENTITY, 7)).toBe(7)
  })

  it('composes so (a*b).apply(t) == a.apply(b.apply(t))', () => {
    const a: SdfLayerOffset = { offset: 3, scale: 2 }
    const b: SdfLayerOffset = { offset: 5, scale: 4 }
    const ab = sdfLayerOffsetCompose(a, b)
    for (const t of [0, 1, -2.5, 100]) {
      expect(sdfLayerOffsetApply(ab, t)).toBeCloseTo(
        sdfLayerOffsetApply(a, sdfLayerOffsetApply(b, t)),
      )
    }
    // matches sdf/layerOffset.cpp operator*
    expect(ab).toEqual({ offset: 3 + 2 * 5, scale: 2 * 4 })
  })

  it('identity composes as a no-op on both sides', () => {
    const a: SdfLayerOffset = { offset: 3, scale: 2 }
    expect(sdfLayerOffsetCompose(a, SDF_LAYER_OFFSET_IDENTITY)).toEqual(a)
    expect(sdfLayerOffsetCompose(SDF_LAYER_OFFSET_IDENTITY, a)).toEqual(a)
  })

  it('inverts, and round-trips through compose to identity', () => {
    const a: SdfLayerOffset = { offset: 3, scale: 2 }
    const inv = sdfLayerOffsetInverse(a)!
    expect(inv).not.toBeNull()
    const round = sdfLayerOffsetCompose(a, inv)
    expect(round.scale).toBeCloseTo(1)
    expect(round.offset).toBeCloseTo(0)
    expect(sdfLayerOffsetInverse({ offset: 1, scale: 0 })).toBeNull()
  })

  it('recognizes identity and equality', () => {
    expect(sdfLayerOffsetIsIdentity(SDF_LAYER_OFFSET_IDENTITY)).toBe(true)
    expect(sdfLayerOffsetIsIdentity({ offset: 0, scale: 2 })).toBe(false)
    expect(sdfLayerOffsetEquals({ offset: 1, scale: 2 }, { offset: 1, scale: 2 })).toBe(true)
    expect(sdfLayerOffsetEquals({ offset: 1, scale: 2 }, { offset: 1, scale: 3 })).toBe(false)
  })
})

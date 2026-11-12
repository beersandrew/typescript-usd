// Ported from OpenUSD 26.11.1: pxr/usd/sdf/layerOffset.cpp,
//  pxr/usd/sdf/testenv/testSdfLayerOffset.py
// Copyright 2016, 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/sdf/testenv/testSdfLayerOffset.py
// (registered as testSdfLayerOffset).
//
// API mapping: Python's `layerOffset * x` is SdfLayerOffset::operator*
// (layerOffset.cpp:59-76), spelled sdfLayerOffsetApply(layerOffset, x).
import { describe, expect, it } from 'vitest'
import { Duration, TimeCode } from 'typescript-usd/gf'
import { sdfLayerOffsetApply as mul } from 'typescript-usd/sdf'

describe('testSdfLayerOffset', () => {
  it('test_LayerOffset', () => {
    // Test the multiplying of layer offsets with time codes.
    const layerOffset1 = { offset: 3.0, scale: 1 }
    const layerOffset2 = { offset: 0, scale: 2.0 }
    const layerOffset3 = { offset: 3.0, scale: 2.0 }

    const float1 = 0.0
    const float2 = 3.0
    const float3 = -2.5

    const timeCode1 = new TimeCode(0)
    const timeCode2 = new TimeCode(3.0)
    const timeCode3 = new TimeCode(-2.5)

    const duration1 = new Duration(0)
    const duration2 = new Duration(3.0)
    const duration3 = new Duration(-2.5)

    // Sanity check that multiplying a layer offset by a time code returns
    // a time code while multiplying by a float returns a float.
    expect(typeof mul(layerOffset1, float2)).toBe('number')
    expect(mul(layerOffset1, timeCode2)).toBeInstanceOf(TimeCode)
    expect(mul(layerOffset1, duration2)).toBeInstanceOf(Duration)

    const tc = (value: TimeCode) => value.GetValue()
    const du = (value: Duration) => value.GetValue()

    // layerOffset1 - offset only, no scale
    expect(mul(layerOffset1, float1)).toBe(3.0)
    expect(tc(mul(layerOffset1, timeCode1))).toBe(3.0)
    expect(du(mul(layerOffset1, duration1))).toBe(0.0)

    expect(mul(layerOffset1, float2)).toBe(6.0)
    expect(tc(mul(layerOffset1, timeCode2))).toBe(6.0)
    expect(du(mul(layerOffset1, duration2))).toBe(3.0)

    expect(mul(layerOffset1, float3)).toBe(0.5)
    expect(tc(mul(layerOffset1, timeCode3))).toBe(0.5)
    expect(du(mul(layerOffset1, duration3))).toBe(-2.5)

    // layerOffset2 - scale only, no offset
    expect(mul(layerOffset2, float1)).toBe(0.0)
    expect(tc(mul(layerOffset2, timeCode1))).toBe(0.0)
    expect(du(mul(layerOffset2, duration1))).toBe(0.0)

    expect(mul(layerOffset2, float2)).toBe(6.0)
    expect(tc(mul(layerOffset2, timeCode2))).toBe(6.0)
    expect(du(mul(layerOffset2, duration2))).toBe(6.0)

    expect(mul(layerOffset2, float3)).toBe(-5.0)
    expect(tc(mul(layerOffset2, timeCode3))).toBe(-5.0)
    expect(du(mul(layerOffset2, duration3))).toBe(-5.0)

    // layerOffset 3 - scale and offset
    expect(mul(layerOffset3, float1)).toBe(3.0)
    expect(tc(mul(layerOffset3, timeCode1))).toBe(3.0)
    expect(du(mul(layerOffset3, duration1))).toBe(0.0)

    expect(mul(layerOffset3, float2)).toBe(9.0)
    expect(tc(mul(layerOffset3, timeCode2))).toBe(9.0)
    expect(du(mul(layerOffset3, duration2))).toBe(6.0)

    expect(mul(layerOffset3, float3)).toBe(-2.0)
    expect(tc(mul(layerOffset3, timeCode3))).toBe(-2.0)
    expect(du(mul(layerOffset3, duration3))).toBe(-5.0)
  })
})

// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdSkel/testenv/testUsdSkelBlendShape.py
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usdSkel/testenv/testUsdSkelBlendShape.py
// (registered as testUsdSkelBlendShape).
//
// API mapping: GetWeight / GetOffsets / GetNormalOffsets return the value
// (undefined where Python's falsy result is), and an inbetween's truth value
// is isDefined().
import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { Array as VtArray, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { Vec3f } from 'typescript-usd/gf'
import { BlendShape } from '../../src/index.ts'

const vec3fArray = (rows: [number, number, number][]): VtArray<unknown> =>
  new VtArray(rows.map(([x, y, z]) => new Vec3f(x, y, z)), VtValueTypes.GfVec3f)

describe('TestUsdSkelBlendShape', () => {
  it('test_BlendShape', () => {
    const stage = Stage.createNew()

    const shape = BlendShape.define(stage, '/shape')

    expect(shape.getInbetweens()).toEqual([])
    expect(shape.getAuthoredInbetweens()).toEqual([])
  })

  it('test_BlendShapeWithInbetweens', () => {
    const stage = Stage.createNew()

    const shape = BlendShape.define(stage, '/shape')
    expect(shape.getAuthoredInbetweens()).toEqual([])

    const subShape = shape.createInbetween('subShape')
    expect(subShape.isDefined()).toBe(true)
    expect(subShape.equals(shape.getInbetween('subShape'))).toBe(true)

    expect(shape.getInbetweens().map(s => s.equals(subShape))).toEqual([true])

    expect(subShape.hasAuthoredWeight()).toBe(false)
    expect(subShape.setWeight(0.5)).toBe(true)
    expect(subShape.getWeight()).toBe(0.5)
    expect(subShape.hasAuthoredWeight()).toBe(true)

    const offsets = vec3fArray([[1, 1, 1]])
    expect(subShape.setOffsets(offsets)).toBe(true)
    expect(subShape.getOffsets()).toEqual(offsets)

    expect(subShape.getNormalOffsetsAttr()!.isValid()).toBe(false)
    expect(subShape.getNormalOffsets()).toBeUndefined()

    const normalOffsets = vec3fArray([[1, 2, 3]])
    expect(subShape.setNormalOffsets(normalOffsets)).toBe(true)
    expect(subShape.getNormalOffsets()).toEqual(normalOffsets)

    expect(shape.getInbetweens().map(s => s.equals(subShape))).toEqual([true])
  })
})

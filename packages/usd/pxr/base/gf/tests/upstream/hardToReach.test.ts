// Ported from OpenUSD 26.11.1: pxr/base/gf/testenv/testGfHardToReach.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of the runtime-observable cases in registered
// pxr/base/gf/testenv/testGfHardToReach.cpp (testGfHardToReach).
// Pointer layout, C++ triviality traits, and vendored half storage are
// substrate-only. The source oracle's native executable prints OK at v26.05.

import { describe, expect, it } from 'vitest'
import {
  Matrix2d as GfMatrix2d,
  Matrix2f as GfMatrix2f,
  Matrix3d as GfMatrix3d,
  Matrix3f as GfMatrix3f,
  Matrix4d as GfMatrix4d,
  Matrix4f as GfMatrix4f,
  NumericCast as GfNumericCast,
  NumericCastFailure as GfNumericCastFailure,
  Size2 as GfSize2,
  Size3 as GfSize3,
  Vec2f as GfVec2f,
  Vec2i as GfVec2i,
  Vec3f as GfVec3f,
  Vec3i as GfVec3i,
  Vec4f as GfVec4f,
  Vec4i as GfVec4i,
} from '../../src/index.ts'

describe('testGfHardToReach', () => {
  it('array-form value construction and Set preserve registered values', () => {
    expect(new GfVec2f([1, 2]).data).toEqual([1, 2])
    const v2i = new GfVec2i([1, 2])
    v2i.Set(0, 1)
    expect(v2i.data).toEqual([0, 1])
    expect(new GfVec3f([1, 2, 3]).data).toEqual([1, 2, 3])
    const v3i = new GfVec3i([1, 2, 3])
    v3i.Set(0, 1, 2)
    expect(v3i.data).toEqual([0, 1, 2])
    expect(new GfVec4f([1, 2, 3, 4]).data).toEqual([1, 2, 3, 4])
    const v4i = new GfVec4i([1, 2, 3, 4])
    v4i.Set(0, 1, 2, 3)
    expect(v4i.data).toEqual([0, 1, 2, 3])
    expect(new GfSize2([1, 2]).toArray()).toEqual([1, 2])
    expect(new GfSize3([1, 2, 3]).toArray()).toEqual([1, 2, 3])
  })

  it('matrix flat storage preserves identity order for every registered type', () => {
    const specs = [
      [GfMatrix2d, 2], [GfMatrix2f, 2],
      [GfMatrix3d, 3], [GfMatrix3f, 3],
      [GfMatrix4d, 4], [GfMatrix4f, 4],
    ] as const
    for (const [Ctor, size] of specs) {
      const identity = Array.from({ length: size * size }, (_, index) =>
        index % (size + 1) === 0 ? 1 : 0)
      const matrix = new Ctor(...identity)
      expect(matrix.GetArray()).toEqual(identity)
    }
  })

  it('numeric casts classify truncation, overflow, infinity, and NaN', () => {
    expect(GfNumericCast(12.99, 'int16')).toEqual({
      value: 12, failure: GfNumericCastFailure.None,
    })
    expect(GfNumericCast(-12.99, 'int16')).toEqual({
      value: -12, failure: GfNumericCastFailure.None,
    })
    expect(GfNumericCast(-1, 'uint16').failure)
      .toBe(GfNumericCastFailure.NegativeOverflow)
    expect(GfNumericCast(100000, 'int16').failure)
      .toBe(GfNumericCastFailure.PositiveOverflow)
    expect(GfNumericCast(Infinity, 'int32').failure)
      .toBe(GfNumericCastFailure.PositiveOverflow)
    expect(GfNumericCast(-Infinity, 'int32').failure)
      .toBe(GfNumericCastFailure.NegativeOverflow)
    expect(GfNumericCast(NaN, 'int32').failure).toBe(GfNumericCastFailure.NaN)
    expect(GfNumericCast(true, 'int32').value).toBe(1)
    expect(GfNumericCast(-1, 'bool').value).toBe(true)
  })
})

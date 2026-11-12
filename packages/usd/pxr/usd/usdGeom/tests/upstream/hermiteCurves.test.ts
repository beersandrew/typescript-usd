// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdGeom/testenv/testUsdGeomHermiteCurves.py
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/usd/usdGeom/testenv/testUsdGeomHermiteCurves.py — the
// PointAndTangentArrays value type (construction, Interleave, Separate,
// equality). Structural assertions; no numeric Pixar fixture needed.

import { describe, expect, it } from 'vitest'
import { HermiteCurves } from 'typescript-usd/usdGeom'

const { PointAndTangentArrays } = HermiteCurves

describe('UsdGeomHermiteCurves.PointAndTangentArrays', () => {
  it('rejects mismatched point/tangent lengths', () => {
    expect(() => new PointAndTangentArrays([[1, 2, 3]], [[1, 2, 3], [4, 5, 6]])).toThrow()
  })

  it('empty arrays are empty and falsy', () => {
    const empty = new PointAndTangentArrays()
    expect(empty.getPoints()).toEqual([])
    expect(empty.getTangents()).toEqual([])
    expect(empty.isEmpty()).toBe(true)
    expect(empty.valid).toBe(false)
  })

  it('populated arrays round-trip points and tangents', () => {
    const pt = new PointAndTangentArrays([[1, 0, 0], [-1, 0, 0]], [[1, 2, 3], [4, 5, 6]])
    expect(pt.valid).toBe(true)
    expect(pt.isEmpty()).toBe(false)
    expect(pt.getPoints()).toEqual([[1, 0, 0], [-1, 0, 0]])
    expect(pt.getTangents()).toEqual([[1, 2, 3], [4, 5, 6]])
  })

  it('equality compares both arrays element-wise', () => {
    expect(new PointAndTangentArrays().equals(new PointAndTangentArrays())).toBe(true)
    expect(
      new PointAndTangentArrays([[2, 0, 0]], [[1, 0, 0]])
        .equals(new PointAndTangentArrays([[2, 0, 0]], [[1, 0, 0]])),
    ).toBe(true)
    expect(
      new PointAndTangentArrays().equals(new PointAndTangentArrays([[2, 0, 0]], [[1, 0, 0]])),
    ).toBe(false)
  })

  it('Interleave packs [p0, t0, p1, t1, ...]', () => {
    const interleaved = new PointAndTangentArrays(
      [[0, 0, 0], [2, 0, 0]], [[1, 0, 0], [0, 1, 0]],
    ).interleave()
    expect(interleaved).toEqual([[0, 0, 0], [1, 0, 0], [2, 0, 0], [0, 1, 0]])
    expect(new PointAndTangentArrays().interleave()).toEqual([])
  })

  it('Separate is the inverse of Interleave', () => {
    expect(() => PointAndTangentArrays.separate([[0, 0, 0], [1, 0, 0], [2, 0, 0]])).toThrow()

    const separated = PointAndTangentArrays.separate([[0, 0, 0], [1, 0, 0], [2, 0, 0], [0, 1, 0]])
    expect(separated.equals(new PointAndTangentArrays(
      [[0, 0, 0], [2, 0, 0]], [[1, 0, 0], [0, 1, 0]],
    ))).toBe(true)

    expect(PointAndTangentArrays.separate([]).isEmpty()).toBe(true)
  })
})

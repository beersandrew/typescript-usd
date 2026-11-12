// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdGeom/testenv/testUsdGeomBasisCurves.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/usd/usdGeom/testenv/testUsdGeomBasisCurves.py.
import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { BasisCurves, type CurveBasis, type CurveType, type CurveWrap } from 'typescript-usd/usdGeom'

function curves(
  counts: number[], type: CurveType = 'cubic', basis: CurveBasis = 'bezier',
  wrap: CurveWrap = 'nonperiodic',
) {
  const stage = Stage.createNew()
  const value = BasisCurves.define(stage, '/Curves')
  value.getCurveVertexCountsAttr().set(counts)
  value.getTypeAttr().set(type)
  value.getBasisAttr().set(basis)
  value.getWrapAttr().set(wrap)
  return value
}

describe('UsdGeomBasisCurves', () => {
  it('computes interpolation data sizes', () => {
    const value = curves([4, 6])
    expect(value.computeUniformDataSize()).toBe(2)
    expect(value.computeVaryingDataSize()).toBe(4)
    expect(value.computeVertexDataSize()).toBe(10)
    expect(value.computeInterpolationForSize(1)).toBe('constant')
    expect(value.computeInterpolationForSize(2)).toBe('uniform')
    expect(value.computeInterpolationForSize(4)).toBe('varying')
    expect(value.computeInterpolationForSize(10)).toBe('vertex')
    expect(value.computeInterpolationForSize(100)).toBe('')
    expect(value.computeInterpolationForSize(0)).toBe('')
  })

  it('computes curve count', () => {
    expect(curves([]).computeCurveCount()).toBe(0)
    expect(curves([4, 7, 9]).computeCurveCount()).toBe(3)
  })

  it('computes segment counts for every type, basis, and wrap case', () => {
    const cases: Array<[number[], CurveType, CurveBasis, CurveWrap, number[]]> = [
      [[2, 3, 2, 5], 'linear', 'bezier', 'nonperiodic', [1, 2, 1, 4]],
      [[3, 7], 'linear', 'bezier', 'periodic', [3, 7]],
      [[4, 7, 10, 4, 7], 'cubic', 'bezier', 'nonperiodic', [1, 2, 3, 1, 2]],
      [[6, 9, 6], 'cubic', 'bezier', 'periodic', [2, 3, 2]],
      [[5, 4, 6, 7], 'cubic', 'bspline', 'nonperiodic', [2, 1, 3, 4]],
      [[6, 9, 6], 'cubic', 'bspline', 'periodic', [6, 9, 6]],
      [[2, 3, 2, 5], 'cubic', 'catmullRom', 'pinned', [1, 2, 1, 4]],
    ]
    for (const [counts, type, basis, wrap, expected] of cases) {
      expect([...curves(counts, type, basis, wrap).computeSegmentCounts()]).toEqual(expected)
    }
  })
})

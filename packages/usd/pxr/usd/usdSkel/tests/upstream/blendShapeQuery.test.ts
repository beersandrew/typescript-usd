// UsdSkelBlendShapeQuery — inbetween-interpolation acceptance test.
//
// Ground-truth values were generated from the Pixar reference build
// (the v26.05 reference build) via the real UsdSkel.BlendShapeQuery:
//
//   mesh with one point at the origin; one BlendShape "shape" with primary
//   offset (10,0,0) @ weight 1.0 and an inbetween (3,0,0) @ weight 0.5;
//   ComputeSubShapeWeights(w) -> ComputeDeformedPoints applied to the point:
//
//     w        0.0   0.25   0.5   0.75   1.0
//     deformedX 0.0   1.5    3.0   6.5   10.0
//
// i.e. 0<w<0.5 interpolates null->inbetween, 0.5<w<1 interpolates
// inbetween->primary. These are the Pixar outputs, not hand-derived.

import { describe, expect, it } from 'vitest'
import { UsdSkelBlendShapeQuery, type ResolvedBlendShape } from '../../src/blendShapeQuery.ts'

describe('UsdSkelBlendShapeQuery — inbetween interpolation (Pixar oracle)', () => {
  const shapes: ResolvedBlendShape[] = [{
    offsets: [[10, 0, 0]],
    pointIndices: [0],
    inbetweens: [{ weight: 0.5, offsets: [[3, 0, 0]] }],
  }]
  const q = new UsdSkelBlendShapeQuery(shapes)
  const bspi = q.computeBlendShapePointIndices()
  const sspo = q.computeSubShapePointOffsets()

  const cases: ReadonlyArray<readonly [number, number]> = [
    [0.0, 0.0], [0.25, 1.5], [0.5, 3.0], [0.75, 6.5], [1.0, 10.0],
  ]

  for (const [w, expected] of cases) {
    it(`weight ${w} deforms X to ${expected}`, () => {
      const res = q.computeSubShapeWeights([w])
      expect(res).not.toBeNull()
      const pts = new Float32Array([0, 0, 0])
      const ok = q.computeDeformedPoints(
        res!.subShapeWeights, res!.blendShapeIndices, res!.subShapeIndices, bspi, sspo, pts)
      expect(ok).toBe(true)
      expect(pts[0]).toBeCloseTo(expected, 5)
      expect(pts[1]).toBeCloseTo(0, 5)
      expect(pts[2]).toBeCloseTo(0, 5)
    })
  }

  it('rejects a weights array whose length != number of blend shapes', () => {
    expect(q.computeSubShapeWeights([0.5, 0.5])).toBeNull()
  })
})

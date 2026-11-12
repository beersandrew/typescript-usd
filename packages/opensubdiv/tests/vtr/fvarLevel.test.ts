// Base-level face-varying topology analysis (FVarLevel.completeTopologyFromFaceValues).
//
// Verifies seam detection: where two faces assign different fvar values to a
// shared vertex (a UV seam), that vertex gets multiple "sibling" values and the
// seam edge is tagged mismatched. Driven through the far factory so base-level
// VTags (boundary/manifold) are computed first.

import { describe, it, expect } from 'vitest'
import { TopologyRefinerFactory } from '../../src/far/index.ts'
import { SchemeType, Options, FVarLinearInterpolation } from '../../src/sdc/index.ts'

// Two quads sharing edge (1,4):
//   3---4---5
//   | f0| f1|
//   0---1---2
const GRID_VERTS_PER_FACE = [4, 4]
const GRID_VERT_INDICES = [0, 1, 4, 3, 1, 2, 5, 4]

function buildWithFVar(valueIndices: number[], numValues: number, fvarInterp: FVarLinearInterpolation) {
  const opts = new Options()
  opts.setFVarLinearInterpolation(fvarInterp)
  const refiner = TopologyRefinerFactory.create(
    {
      numVertices: 6,
      vertsPerFace: GRID_VERTS_PER_FACE,
      vertIndicesPerFace: GRID_VERT_INDICES,
      fvarChannels: [{ numValues, valueIndices }],
    },
    { schemeType: SchemeType.CATMARK, schemeOptions: opts },
  )
  return refiner
}

describe('FVarLevel base topology — UV seam', () => {
  // f0 corners (0,1,4,3) -> values 0,1,2,3 ; f1 corners (1,2,5,4) -> 4,5,6,7.
  // Vertices 1 and 4 are shared but get different values across edge (1,4): seam.
  const refiner = buildWithFVar([0, 1, 2, 3, 4, 5, 6, 7], 8, FVarLinearInterpolation.NONE)
  const base = refiner.getLevel(0)
  const fvar = base.getFVarLevel(0)

  it('shared seam vertices have two sibling values; others have one', () => {
    expect(fvar.getNumVertexValues(1)).toBe(2)
    expect(fvar.getNumVertexValues(4)).toBe(2)
    for (const v of [0, 2, 3, 5]) expect(fvar.getNumVertexValues(v)).toBe(1)
  })

  it('total distinct value count is 8', () => {
    expect(fvar.getNumValues()).toBe(8)
  })

  it('the shared edge (1,4) is tagged as an fvar mismatch (seam)', () => {
    const e = base.findEdge(1, 4)
    expect(e).toBeGreaterThanOrEqual(0)
    expect(fvar.getEdgeTag(e)._mismatch).toBe(true)
  })

  it('a non-seam interior-of-face boundary edge is not tagged mismatch', () => {
    const e = base.findEdge(0, 1) // boundary edge of f0 only, continuous
    expect(fvar.edgeTopologyMatches(e)).toBe(true)
  })
})

describe('FVarLevel base topology — no seam (continuous UVs)', () => {
  // Every shared corner gets the same value across faces: value == vertex index.
  const refiner = buildWithFVar([0, 1, 4, 3, 1, 2, 5, 4], 6, FVarLinearInterpolation.NONE)
  const fvar = refiner.getLevel(0).getFVarLevel(0)

  it('every vertex has exactly one value (channel matches vertex topology)', () => {
    for (let v = 0; v < 6; ++v) expect(fvar.getNumVertexValues(v)).toBe(1)
    expect(fvar.getNumValues()).toBe(6)
  })

  it('the shared edge has no mismatch', () => {
    const e = refiner.getLevel(0).findEdge(1, 4)
    expect(fvar.edgeTopologyMatches(e)).toBe(true)
  })
})

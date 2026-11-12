// Sharpness subdivision + component-tag propagation tests.
//
// Refines the cube and checks how edge/vertex sharpness and the derived
// crease tags propagate to the child level, for smooth, infinitely-sharp,
// and semi-sharp (Chaikin-free / uniform) creases.

import { describe, it, expect } from 'vitest'
import { Level, QuadRefinement } from '../../src/vtr/index.ts'
import { Options, Rule, SHARPNESS_INFINITE } from '../../src/sdc/index.ts'

const CUBE_FACES: number[][] = [
  [0, 1, 3, 2],
  [2, 3, 5, 4],
  [4, 5, 7, 6],
  [6, 7, 1, 0],
  [1, 7, 5, 3],
  [6, 0, 2, 4],
]

function buildBaseLevel(): Level {
  const level = new Level()
  level.resizeVertices(8)
  level.resizeFaces(6)
  level.resizeFaceVertices(24)
  level.resizeFaceEdges(24)
  for (let f = 0; f < 6; ++f) level.resizeFaceVerticesAt(f, 4)
  for (let f = 0; f < 6; ++f) level.getFaceVertices(f).set(CUBE_FACES[f]!)
  level.completeTopologyFromFaceVertices()
  return level
}

function refine(parent: Level): { child: Level; ref: QuadRefinement } {
  const child = new Level()
  child._depth = parent.getDepth() + 1
  const ref = new QuadRefinement(parent, child, new Options())
  ref.refine()
  return { child, ref }
}

describe('subdivideSharpness — smooth cube', () => {
  const { child } = refine(buildBaseLevel())

  it('leaves every child edge and vertex smooth (sharpness 0)', () => {
    for (let e = 0; e < child.getNumEdges(); ++e) expect(child.getEdgeSharpness(e)).toBe(0)
    for (let v = 0; v < child.getNumVertices(); ++v) expect(child.getVertexSharpness(v)).toBe(0)
  })

  it('tags face-point vertices as smooth and non-extraordinary (quad faces)', () => {
    // verts-from-faces occupy [8,14); cube faces are quads, so not xordinary.
    for (let v = 8; v < 14; ++v) {
      const t = child.getVertexTag(v)
      expect(t._rule).toBe(Rule.SMOOTH)
      expect(t._xordinary).toBe(false)
    }
  })
})

describe('subdivideSharpness — one infinitely-sharp edge', () => {
  const base = buildBaseLevel()
  base.setEdgeSharpness(0, SHARPNESS_INFINITE)
  base.getEdgeTag(0)._infSharp = true
  const { child, ref } = refine(base)

  it('keeps both child edges of the sharp parent edge infinitely sharp', () => {
    const cEdges = ref.getEdgeChildEdges(0)
    for (const e of cEdges) {
      expect(child.getEdgeTag(e)._infSharp).toBe(true)
      expect(child.getEdgeSharpness(e)).toBe(SHARPNESS_INFINITE)
    }
  })

  it('interior face edges remain smooth', () => {
    // child edges from faces are in [0, childEdgeFromFace); spot-check a few.
    for (let e = 0; e < 24; ++e) expect(child.getEdgeSharpness(e)).toBe(0)
  })
})

describe('subdivideSharpness — one semi-sharp edge (uniform creasing)', () => {
  const base = buildBaseLevel()
  base.setEdgeSharpness(0, 2.0)
  base.getEdgeTag(0)._semiSharp = true
  const { child, ref } = refine(base)

  it('decrements the child edges of the parent edge by 1 (2.0 -> 1.0)', () => {
    const cEdges = ref.getEdgeChildEdges(0)
    for (const e of cEdges) {
      expect(child.getEdgeTag(e)._semiSharp).toBe(true)
      expect(child.getEdgeSharpness(e)).toBeCloseTo(1.0, 6)
    }
  })

  it('classifies the new edge-point vertex as a crease', () => {
    const cVert = ref.getEdgeChildVertex(0)
    const t = child.getVertexTag(cVert)
    expect(t._semiSharpEdges).toBe(true)
    expect(t._rule).toBe(Rule.CREASE)
  })
})

describe('subdivideSharpness — semi-sharp edge decaying to smooth', () => {
  it('clears the semi-sharp tag once sharpness reaches 0 after enough levels', () => {
    const base = buildBaseLevel()
    base.setEdgeSharpness(0, 1.0) // decays: 1.0 -> 0.0 in one level
    base.getEdgeTag(0)._semiSharp = true
    const { child, ref } = refine(base)
    const cEdges = ref.getEdgeChildEdges(0)
    for (const e of cEdges) {
      expect(child.getEdgeSharpness(e)).toBe(0)
      expect(child.getEdgeTag(e)._semiSharp).toBe(false)
    }
  })
})

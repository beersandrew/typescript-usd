// Uniform Catmark (quad-split) refinement tests for QuadRefinement.
//
// Refines the tutorial cube one level and checks the child component counts,
// the parent->child vertex mapping ordering, and -- as a strong independent
// check -- that the child face-vertex list, rebuilt from scratch, forms the
// same closed manifold (correct edge count, two faces per edge).

import { describe, it, expect } from 'vitest'
import { Level, QuadRefinement } from '../../src/vtr/index.ts'
import { Options } from '../../src/sdc/index.ts'

const CUBE_FACES: number[][] = [
  [0, 1, 3, 2],
  [2, 3, 5, 4],
  [4, 5, 7, 6],
  [6, 7, 1, 0],
  [1, 7, 5, 3],
  [6, 0, 2, 4],
]

function buildBaseLevel(faces: number[][], numVerts: number): Level {
  const level = new Level()
  level.resizeVertices(numVerts)
  level.resizeFaces(faces.length)
  let total = 0
  for (const f of faces) total += f.length
  level.resizeFaceVertices(total)
  level.resizeFaceEdges(total)
  for (let f = 0; f < faces.length; ++f) level.resizeFaceVerticesAt(f, faces[f]!.length)
  for (let f = 0; f < faces.length; ++f) level.getFaceVertices(f).set(faces[f]!)
  level.completeTopologyFromFaceVertices()
  return level
}

function refineOnce(parent: Level): { child: Level; ref: QuadRefinement } {
  const child = new Level()
  child._depth = parent.getDepth() + 1
  const ref = new QuadRefinement(parent, child, new Options())
  ref.refine()
  return { child, ref }
}

// Rebuild a Level from a child's face-vertex arrays (independent topology check).
function rebuildFromChild(child: Level): Level {
  const faces: number[][] = []
  for (let f = 0; f < child.getNumFaces(); ++f) {
    faces.push(Array.from(child.getFaceVertices(f)))
  }
  return buildBaseLevel(faces, child.getNumVertices())
}

describe('QuadRefinement uniform (cube, 1 level)', () => {
  const base = buildBaseLevel(CUBE_FACES, 8)
  const { child, ref } = refineOnce(base)

  it('produces the expected child component counts', () => {
    // faces: 6 quads -> 6*4 = 24
    expect(child.getNumFaces()).toBe(24)
    // verts: V + F + E = 8 + 6 + 12 = 26
    expect(child.getNumVertices()).toBe(26)
    // edges: childEdgeFromFace (24) + childEdgeFromEdge (2*12 = 24) = 48
    expect(child.getNumEdges()).toBe(48)
  })

  it('orders child vertices verts-from-verts first, then faces, then edges', () => {
    // default (!faceVertsFirst): vertChildVert in [0,8), faceChildVert in [8,14), edgeChildVert in [14,26)
    expect(ref.getVertexChildVertex(0)).toBe(0)
    expect(ref.getVertexChildVertex(7)).toBe(7)
    expect(ref.getFaceChildVertex(0)).toBe(8)
    expect(ref.getFaceChildVertex(5)).toBe(13)
    expect(ref.getEdgeChildVertex(0)).toBe(14)
    expect(ref.getEdgeChildVertex(11)).toBe(25)
  })

  it('every child face is a quad containing exactly one parent face-point', () => {
    for (let f = 0; f < child.getNumFaces(); ++f) {
      const fv = child.getFaceVertices(f)
      expect(fv.length).toBe(4)
      let facePointCount = 0
      for (let i = 0; i < 4; ++i) {
        const v = fv[i]!
        if (v >= 8 && v < 14) facePointCount++ // face-points occupy [8,14)
      }
      expect(facePointCount).toBe(1)
    }
  })

  it('child face 0 of parent face 0 has the corner vertex and face point in place', () => {
    // parent face 0 = [0,1,3,2]; child face 0 sits at corner vertex 0.
    const fv = child.getFaceVertices(0)
    expect(fv[0]).toBe(0) // cVertOfVert (corner)
    expect(fv[2]).toBe(8) // cVertOfFace (parent face 0 point)
  })

  it('the refined mesh is a consistent closed manifold (independent rebuild)', () => {
    const rebuilt = rebuildFromChild(child)
    // A once-subdivided cube: V=26, F=24, E=48 still satisfies V-E+F=2.
    expect(rebuilt.getNumEdges()).toBe(48)
    for (let e = 0; e < rebuilt.getNumEdges(); ++e) {
      expect(rebuilt.getNumEdgeFaces(e)).toBe(2)
    }
    for (let v = 0; v < rebuilt.getNumVertices(); ++v) {
      expect(rebuilt.isVertexNonManifold(v)).toBe(false)
    }
  })

  it('interior face-point vertices have valence 4 in the refined mesh', () => {
    // Each parent face point becomes an interior vertex of valence = parent face size = 4.
    const rebuilt = rebuildFromChild(child)
    for (let v = 8; v < 14; ++v) {
      expect(rebuilt.getNumVertexFaces(v)).toBe(4)
      expect(rebuilt.getNumVertexEdges(v)).toBe(4)
    }
  })
})

describe('QuadRefinement uniform (cube, 2 levels)', () => {
  it('refines again from the child level (child topology is reusable as a parent)', () => {
    const base = buildBaseLevel(CUBE_FACES, 8)
    const { child } = refineOnce(base)
    // The child Level must be complete enough to act as a parent.
    const { child: grandchild } = refineOnce(child)
    expect(grandchild.getNumFaces()).toBe(24 * 4) // 96
    // verts: V'+F'+E' = 26 + 24 + 48 = 98
    expect(grandchild.getNumVertices()).toBe(98)
    // edges: 96 (from faces) + 2*48 (from edges) = 192
    expect(grandchild.getNumEdges()).toBe(192)
  })
})

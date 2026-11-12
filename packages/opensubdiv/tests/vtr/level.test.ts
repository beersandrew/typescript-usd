// Topology-construction tests for Vtr::Level.
//
// Builds the base level from a face-vertex list (as the far factory will) and
// checks that completeTopologyFromFaceVertices derives the edge list and all
// incidence relations correctly. Uses the standard OpenSubdiv tutorial cube.

import { describe, it, expect } from 'vitest'
import { Level } from '../../src/vtr/index.ts'

// Standard OSD tutorial cube: 8 vertices, 6 quad faces.
const CUBE_FACES: number[][] = [
  [0, 1, 3, 2],
  [2, 3, 5, 4],
  [4, 5, 7, 6],
  [6, 7, 1, 0],
  [1, 7, 5, 3],
  [6, 0, 2, 4],
]

function buildLevel(faces: number[][], numVerts: number): Level {
  const level = new Level()
  level.resizeVertices(numVerts)
  level.resizeFaces(faces.length)

  let total = 0
  for (const f of faces) total += f.length
  level.resizeFaceVertices(total)
  level.resizeFaceEdges(total)

  for (let f = 0; f < faces.length; ++f) {
    level.resizeFaceVerticesAt(f, faces[f]!.length)
  }
  for (let f = 0; f < faces.length; ++f) {
    level.getFaceVertices(f).set(faces[f]!)
  }
  level.completeTopologyFromFaceVertices()
  return level
}

describe('Level.completeTopologyFromFaceVertices (cube)', () => {
  const level = buildLevel(CUBE_FACES, 8)

  it('derives the Euler-correct edge count', () => {
    // V - E + F = 2  =>  8 - E + 6 = 2  =>  E = 12
    expect(level.getNumEdges()).toBe(12)
  })

  it('every edge is shared by exactly two faces (closed manifold)', () => {
    let totalIncidences = 0
    for (let e = 0; e < level.getNumEdges(); ++e) {
      expect(level.getNumEdgeFaces(e)).toBe(2)
      totalIncidences += level.getNumEdgeFaces(e)
    }
    expect(totalIncidences).toBe(24) // 6 faces * 4 edges
  })

  it('every vertex has valence 3 (3 faces, 3 edges)', () => {
    for (let v = 0; v < level.getNumVertices(); ++v) {
      expect(level.getNumVertexFaces(v)).toBe(3)
      expect(level.getNumVertexEdges(v)).toBe(3)
    }
  })

  it('no component is tagged non-manifold', () => {
    for (let v = 0; v < level.getNumVertices(); ++v) {
      expect(level.isVertexNonManifold(v)).toBe(false)
    }
    for (let e = 0; e < level.getNumEdges(); ++e) {
      expect(level.isEdgeNonManifold(e)).toBe(false)
    }
  })

  it('edge-vertices are consistent with face-vertices (each face edge connects consecutive verts)', () => {
    for (let f = 0; f < level.getNumFaces(); ++f) {
      const fVerts = level.getFaceVertices(f)
      const fEdges = level.getFaceEdges(f)
      const n = fVerts.length
      for (let i = 0; i < n; ++i) {
        const v0 = fVerts[i]!
        const v1 = fVerts[(i + 1) % n]!
        const eVerts = level.getEdgeVertices(fEdges[i]!)
        const matches = (eVerts[0] === v0 && eVerts[1] === v1) || (eVerts[0] === v1 && eVerts[1] === v0)
        expect(matches).toBe(true)
      }
    }
  })

  it('vertex-edges all contain the vertex (orientation produced valid rings)', () => {
    for (let v = 0; v < level.getNumVertices(); ++v) {
      const vEdges = level.getVertexEdges(v)
      for (let i = 0; i < vEdges.length; ++i) {
        const eVerts = level.getEdgeVertices(vEdges[i]!)
        expect(eVerts[0] === v || eVerts[1] === v).toBe(true)
      }
    }
  })

  it('local indices place the vertex correctly within each incident face', () => {
    for (let v = 0; v < level.getNumVertices(); ++v) {
      const vFaces = level.getVertexFaces(v)
      const vInFaces = level.getVertexFaceLocalIndices(v)
      for (let i = 0; i < vFaces.length; ++i) {
        const fVerts = level.getFaceVertices(vFaces[i]!)
        expect(fVerts[vInFaces[i]!]).toBe(v)
      }
    }
  })
})

describe('Level.completeTopologyFromFaceVertices (single quad, open boundary)', () => {
  const level = buildLevel([[0, 1, 2, 3]], 4)

  it('has 4 boundary edges each with a single face', () => {
    expect(level.getNumEdges()).toBe(4)
    for (let e = 0; e < 4; ++e) expect(level.getNumEdgeFaces(e)).toBe(1)
  })

  it('each corner vertex has 1 face and 2 edges', () => {
    for (let v = 0; v < 4; ++v) {
      expect(level.getNumVertexFaces(v)).toBe(1)
      expect(level.getNumVertexEdges(v)).toBe(2)
      expect(level.isVertexNonManifold(v)).toBe(false)
    }
  })
})

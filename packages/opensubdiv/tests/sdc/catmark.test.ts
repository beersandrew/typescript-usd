// Unit tests for the Catmark scheme masks and Crease arithmetic.
//
// The Catmull-Clark refinement weights are exact rationals documented in the
// OpenSubdiv subdivision references; we check the masks against those known
// values using simple mock neighborhoods. Topology-driven comparison against
// the C++ oracle happens at the vtr/far level once refinement exists.

import { describe, it, expect } from 'vitest'
import {
  CatmarkScheme,
  Mask,
  Crease,
  Rule,
  Options,
  CreasingMethod,
  type FaceNeighborhood,
  type EdgeNeighborhood,
  type VertexNeighborhood,
} from '../../src/sdc/index.ts'

function quadFace(): FaceNeighborhood {
  return { getNumVertices: () => 4 }
}

// A smooth interior edge with two incident quad faces, given sharpness.
function interiorEdge(sharpness: number): EdgeNeighborhood {
  return {
    getNumFaces: () => 2,
    getSharpness: () => sharpness,
    getChildSharpnesses: (crease, out) => {
      out[0] = crease.subdivideUniformSharpness(sharpness)
      out[1] = out[0]
    },
    getNumVerticesPerFace: (out) => {
      out[0] = 4
      out[1] = 4
    },
  }
}

// A smooth, manifold, interior vertex of the given valence (#faces == #edges),
// all incident edges smooth and the vertex itself smooth.
function smoothVertex(valence: number): VertexNeighborhood {
  return {
    getNumEdges: () => valence,
    getNumFaces: () => valence,
    getSharpness: () => 0,
    getSharpnessPerEdge: (buf) => {
      for (let i = 0; i < valence; ++i) buf[i] = 0
      return buf
    },
    getChildSharpnessPerEdge: (_crease, buf) => {
      for (let i = 0; i < valence; ++i) buf[i] = 0
      return buf
    },
    getChildSharpness: () => 0,
  }
}

const sum = (m: Mask, kind: 'v' | 'e' | 'f'): number => {
  const n = kind === 'v' ? m.getNumVertexWeights() : kind === 'e' ? m.getNumEdgeWeights() : m.getNumFaceWeights()
  let s = 0
  for (let i = 0; i < n; ++i) s += kind === 'v' ? m.vertexWeight(i) : kind === 'e' ? m.edgeWeight(i) : m.faceWeight(i)
  return s
}
const totalWeight = (m: Mask): number => sum(m, 'v') + sum(m, 'e') + sum(m, 'f')

describe('CatmarkScheme face-vertex mask', () => {
  it('is the centroid of a quad', () => {
    const s = new CatmarkScheme()
    const m = new Mask()
    s.computeFaceVertexMask(quadFace(), m)
    expect(m.getNumVertexWeights()).toBe(4)
    for (let i = 0; i < 4; ++i) expect(m.vertexWeight(i)).toBeCloseTo(0.25, 12)
    expect(totalWeight(m)).toBeCloseTo(1, 12)
  })
})

describe('CatmarkScheme edge-vertex mask', () => {
  it('smooth interior edge: 1/4 endpoints + 1/4 face centers', () => {
    const s = new CatmarkScheme()
    const m = new Mask()
    s.computeEdgeVertexMask(interiorEdge(0), m)
    expect(m.vertexWeight(0)).toBeCloseTo(0.25, 12)
    expect(m.vertexWeight(1)).toBeCloseTo(0.25, 12)
    expect(m.getNumFaceWeights()).toBe(2)
    expect(m.faceWeight(0)).toBeCloseTo(0.25, 12)
    expect(m.faceWeight(1)).toBeCloseTo(0.25, 12)
    expect(m.areFaceWeightsForFaceCenters()).toBe(true)
    expect(totalWeight(m)).toBeCloseTo(1, 12)
  })

  it('infinitely sharp edge: simple midpoint (crease mask)', () => {
    const s = new CatmarkScheme()
    const m = new Mask()
    s.computeEdgeVertexMask(interiorEdge(10), m)
    expect(m.vertexWeight(0)).toBeCloseTo(0.5, 12)
    expect(m.vertexWeight(1)).toBeCloseTo(0.5, 12)
    expect(m.getNumFaceWeights()).toBe(0)
    expect(totalWeight(m)).toBeCloseTo(1, 12)
  })
})

describe('CatmarkScheme vertex-vertex smooth mask', () => {
  it('regular valence-4 interior vertex: 1/2, 1/16, 1/16', () => {
    const s = new CatmarkScheme()
    const m = new Mask()
    s.computeVertexVertexMask(smoothVertex(4), m, Rule.SMOOTH)
    expect(m.vertexWeight(0)).toBeCloseTo(0.5, 12) // (n-2)/n
    for (let i = 0; i < 4; ++i) {
      expect(m.edgeWeight(i)).toBeCloseTo(1 / 16, 12) // 1/n^2
      expect(m.faceWeight(i)).toBeCloseTo(1 / 16, 12)
    }
    expect(totalWeight(m)).toBeCloseTo(1, 12)
  })

  it('extraordinary valence-3 vertex still partitions unity', () => {
    const s = new CatmarkScheme()
    const m = new Mask()
    s.computeVertexVertexMask(smoothVertex(3), m, Rule.SMOOTH)
    expect(m.vertexWeight(0)).toBeCloseTo(1 / 3, 12) // (3-2)/3
    for (let i = 0; i < 3; ++i) {
      expect(m.edgeWeight(i)).toBeCloseTo(1 / 9, 12) // 1/9
      expect(m.faceWeight(i)).toBeCloseTo(1 / 9, 12)
    }
    expect(totalWeight(m)).toBeCloseTo(1, 12)
  })
})

describe('CatmarkScheme position limit masks', () => {
  it('regular valence-4 interior limit: 4/9 vert, 1/9 edges, 1/36 faces', () => {
    const s = new CatmarkScheme()
    const m = new Mask()
    s.computeVertexLimitMask(smoothVertex(4), m, Rule.SMOOTH)
    expect(m.vertexWeight(0)).toBeCloseTo(4 / 9, 12)
    for (let i = 0; i < 4; ++i) {
      expect(m.edgeWeight(i)).toBeCloseTo(1 / 9, 12)
      expect(m.faceWeight(i)).toBeCloseTo(1 / 36, 12)
    }
    expect(totalWeight(m)).toBeCloseTo(1, 12)
  })
})

describe('Crease', () => {
  it('uniform subdivision decrements semi-sharp by 1, clamps at 0', () => {
    const c = new Crease()
    expect(c.subdivideUniformSharpness(2.5)).toBeCloseTo(1.5, 12)
    expect(c.subdivideUniformSharpness(0.5)).toBe(0) // < 1 decays to smooth
    expect(c.subdivideUniformSharpness(0)).toBe(0)
    expect(c.subdivideUniformSharpness(10)).toBe(10) // infinite stays infinite
  })

  it('classifies vertex-vertex rules by sharp-edge count', () => {
    const c = new Crease()
    expect(c.determineVertexVertexRule(0, 0)).toBe(Rule.SMOOTH)
    expect(c.determineVertexVertexRule(0, 1)).toBe(Rule.DART)
    expect(c.determineVertexVertexRule(0, 2)).toBe(Rule.CREASE)
    expect(c.determineVertexVertexRule(0, 3)).toBe(Rule.CORNER)
    expect(c.determineVertexVertexRule(5, 0)).toBe(Rule.CORNER) // sharp vertex
  })

  it('Chaikin creasing blends neighbor sharpness (3/4 + 1/4 avg)', () => {
    const opts = new Options()
    opts.setCreasingMethod(CreasingMethod.CHAIKIN)
    const c = new Crease(opts)
    // vertex with three incident semi-sharp edges, all 2.0; child of one of
    // them: 3/4*2 + 1/4*avg(other two = 2) - 1 = 1.5 + 0.5 - 1 = 1.0
    const child = c.subdivideEdgeSharpnessAtVertex(2.0, 3, [2.0, 2.0, 2.0])
    expect(child).toBeCloseTo(1.0, 12)
  })
})

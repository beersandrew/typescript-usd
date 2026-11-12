// Ported from OpenSubdiv 3.6.1: opensubdiv/far/ptexIndices.h,
//  opensubdiv/far/ptexIndices.cpp
// Copyright 2015 Pixar. Modified Apache 2.0 License.
// Translated to TypeScript and modified. See LICENSE-OpenSubdiv-3.6.1.txt and
//  NOTICE.

// Port of OpenSubdiv 3.6.1 opensubdiv/far/ptexIndices.h:46-97 and
// ptexIndices.cpp:37-208 -- Far::PtexIndices. Local source addition (see
// PROVENANCE.md).

import { SchemeTypeTraits } from '../sdc/types.ts'
import type { Level } from '../vtr/level.ts'
import type { TopologyRefiner } from './topologyRefiner.ts'
import type { Index } from './types.ts'

// ptexIndices.cpp:77-87 -- the face adjacent to 'face' along 'edge'
function getAdjacentFace(level: Level, edge: Index, face: Index): Index {
  const adjFaces = level.getEdgeFaces(edge)
  if (adjFaces.length !== 2) {
    return -1
  }
  return adjFaces[0] === face ? adjFaces[1]! : adjFaces[0]!
}

// Vtr::ConstArray::FindIndex / FindIndexIn4Tuple
function findIndex(array: ArrayLike<number>, value: number, size = array.length): number {
  for (let i = 0; i < size; ++i) if (array[i] === value) return i
  return -1
}

export class PtexIndices {
  _ptexIndices: number[] = []

  // ptexIndices.cpp:37-39
  constructor(refiner: TopologyRefiner) {
    this.initializePtexIndices(refiner)
  }

  // ptexIndices.cpp:46-64
  private initializePtexIndices(refiner: TopologyRefiner): void {
    const regFaceSize = SchemeTypeTraits.getRegularFaceSize(refiner.getSchemeType())

    const coarseLevel = refiner.getLevel(0)

    const nfaces = coarseLevel.getNumFaces()
    this._ptexIndices = new Array<number>(nfaces + 1)
    let ptexID = 0
    for (let i = 0; i < nfaces; ++i) {
      this._ptexIndices[i] = ptexID
      const fverts = coarseLevel.getFaceVertices(i)
      ptexID += fverts.length === regFaceSize ? 1 : fverts.length
    }
    // last entry contains the number of ptex texture faces
    this._ptexIndices[nfaces] = ptexID
  }

  // ptexIndices.cpp:66-69
  getNumFaces(): number {
    return this._ptexIndices[this._ptexIndices.length - 1]!
  }

  // ptexIndices.cpp:71-75
  getFaceId(f: Index): number {
    if (!(f < this._ptexIndices.length)) throw new Error(`PtexIndices.GetFaceId(): no face ${f}`)
    return this._ptexIndices[f]!
  }

  // ptexIndices.cpp:89-208 -- fills adjFaces[4] and adjEdges[4].
  getAdjacency(refiner: TopologyRefiner, face: number, quadrant: number, adjFaces: number[], adjEdges: number[]): void {
    const regFaceSize = SchemeTypeTraits.getRegularFaceSize(refiner.getSchemeType())

    const level = refiner.getLevel(0)

    const fedges = level.getFaceEdges(face)

    if (fedges.length === regFaceSize) {
      // Regular ptex quad face
      for (let i = 0; i < regFaceSize; ++i) {
        const edge = fedges[i]!
        const adjface = getAdjacentFace(level, edge, face)
        if (adjface === -1) {
          adjFaces[i] = -1 // boundary or non-manifold
          adjEdges[i] = 0
        } else {
          const aedges = level.getFaceEdges(adjface)
          if (aedges.length === regFaceSize) {
            adjFaces[i] = this._ptexIndices[adjface]!
            adjEdges[i] = findIndex(aedges, edge)
          } else {
            // neighbor is a sub-face
            adjFaces[i] = this._ptexIndices[adjface]! + ((findIndex(aedges, edge) + 1) % aedges.length)
            adjEdges[i] = 3
          }
        }
      }
      if (regFaceSize === 3) {
        adjFaces[3] = -1
        adjEdges[3] = 0
      }
    } else if (regFaceSize === 4) {
      //  Ptex sub-face 'quadrant' (non-quad) -- see the diagram at
      //  ptexIndices.cpp:133-151.
      if (!(quadrant >= 0 && quadrant < fedges.length)) {
        throw new Error('PtexIndices.GetAdjacency(): quadrant out of range')
      }

      const nextQuadrant = (quadrant + 1) % fedges.length
      const prevQuadrant = (quadrant + fedges.length - 1) % fedges.length

      {
        // resolve neighbors within the sub-face (edges 1 & 2)
        adjFaces[1] = this._ptexIndices[face]! + nextQuadrant
        adjEdges[1] = 2

        adjFaces[2] = this._ptexIndices[face]! + prevQuadrant
        adjEdges[2] = 1
      }

      {
        // resolve neighbor outside the sub-face (edge 0)
        const edge0 = fedges[quadrant]!
        const adjface0 = getAdjacentFace(level, edge0, face)
        if (adjface0 === -1) {
          adjFaces[0] = -1 // boundary or non-manifold
          adjEdges[0] = 0
        } else {
          const afedges = level.getFaceEdges(adjface0)
          if (afedges.length === 4) {
            adjFaces[0] = this._ptexIndices[adjface0]!
            adjEdges[0] = findIndex(afedges, edge0, 4)
          } else {
            const subedge = (findIndex(afedges, edge0) + 1) % afedges.length
            adjFaces[0] = this._ptexIndices[adjface0]! + subedge
            adjEdges[0] = 3
          }
        }

        // resolve neighbor outside the sub-face (edge 3)
        const edge3 = fedges[prevQuadrant]!
        const adjface3 = getAdjacentFace(level, edge3, face)
        if (adjface3 === -1) {
          adjFaces[3] = -1 // boundary or non-manifold
          adjEdges[3] = 0
        } else {
          const afedges = level.getFaceEdges(adjface3)
          if (afedges.length === 4) {
            adjFaces[3] = this._ptexIndices[adjface3]!
            adjEdges[3] = findIndex(afedges, edge3, 4)
          } else {
            const subedge = findIndex(afedges, edge3)
            adjFaces[3] = this._ptexIndices[adjface3]! + subedge
            adjEdges[3] = 0
          }
        }
      }
    } else {
      throw new Error(
        'Failure in PtexIndices::GetAdjacency() -- irregular faces only supported for quad schemes.',
      )
    }
  }
}

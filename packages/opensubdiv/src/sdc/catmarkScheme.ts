// Ported from OpenSubdiv 3.7.0: opensubdiv/sdc/catmarkScheme.h
// Copyright 2014 DreamWorks Animation LLC. Tomorrow Open Source Technology
//  License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors opensubdiv/sdc/catmarkScheme.h — Scheme<SCHEME_CATMARK>.
//
// Catmull-Clark scheme-specific mask weights. The common Crease/Corner masks
// and the overall query flow live in the Scheme base; only the Smooth edge mask
// and the Crease/Smooth vertex masks (plus position limit masks) are
// specialized here.

import { Scheme, type EdgeNeighborhood, type VertexNeighborhood, type IMask } from './scheme.ts'
import { Split, SchemeType } from './types.ts'
import { TriangleSubdivision } from './options.ts'

export class CatmarkScheme extends Scheme {
  //  Traits ------------------------------------------------------------------
  static getTopologicalSplitType(): Split {
    return Split.TO_QUADS
  }
  static getRegularFaceSize(): number {
    return 4
  }
  static getRegularVertexValence(): number {
    return 4
  }
  static getLocalNeighborhoodSize(): number {
    return 1
  }
  static getType(): SchemeType {
    return SchemeType.CATMARK
  }

  //  Edge-vertex Smooth mask -------------------------------------------------
  protected assignSmoothMaskForEdge(edge: EdgeNeighborhood, mask: IMask): void {
    const faceCount = edge.getNumFaces()

    mask.setNumVertexWeights(2)
    mask.setNumEdgeWeights(0)
    mask.setNumFaceWeights(faceCount)
    mask.setFaceWeightsForFaceCenters(true)

    // Determine whether to apply alternate "smooth triangle" weighting.
    let face0IsTri = false
    let face1IsTri = false
    let useTriangleOption = this._options.getTriangleSubdivision() === TriangleSubdivision.SMOOTH
    if (useTriangleOption) {
      if (faceCount === 2) {
        const vertsPerFace: [number, number] = [0, 0]
        edge.getNumVerticesPerFace(vertsPerFace)
        face0IsTri = vertsPerFace[0] === 3
        face1IsTri = vertsPerFace[1] === 3
        useTriangleOption = face0IsTri || face1IsTri
      } else {
        useTriangleOption = false
      }
    }

    if (!useTriangleOption) {
      mask.setVertexWeight(0, 0.25)
      mask.setVertexWeight(1, 0.25)

      if (faceCount === 2) {
        mask.setFaceWeight(0, 0.25)
        mask.setFaceWeight(1, 0.25)
      } else {
        const fWeight = 0.5 / faceCount
        for (let i = 0; i < faceCount; ++i) {
          mask.setFaceWeight(i, fWeight)
        }
      }
    } else {
      // This mimics the implementation in Hbr in terms of order of operations.
      const CATMARK_SMOOTH_TRI_EDGE_WEIGHT = 0.47

      const f0Weight = face0IsTri ? CATMARK_SMOOTH_TRI_EDGE_WEIGHT : 0.25
      const f1Weight = face1IsTri ? CATMARK_SMOOTH_TRI_EDGE_WEIGHT : 0.25

      const fWeight = 0.5 * (f0Weight + f1Weight)
      const vWeight = 0.5 * (1.0 - 2.0 * fWeight)

      mask.setVertexWeight(0, vWeight)
      mask.setVertexWeight(1, vWeight)

      mask.setFaceWeight(0, fWeight)
      mask.setFaceWeight(1, fWeight)
    }
  }

  //  Vertex-vertex Crease mask -----------------------------------------------
  protected assignCreaseMaskForVertex(vertex: VertexNeighborhood, mask: IMask, creaseEnds: readonly [number, number]): void {
    const valence = vertex.getNumEdges()

    mask.setNumVertexWeights(1)
    mask.setNumEdgeWeights(valence)
    mask.setNumFaceWeights(0)
    mask.setFaceWeightsForFaceCenters(false)

    const vWeight = 0.75
    const eWeight = 0.125

    mask.setVertexWeight(0, vWeight)
    for (let i = 0; i < valence; ++i) {
      mask.setEdgeWeight(i, 0.0)
    }
    mask.setEdgeWeight(creaseEnds[0], eWeight)
    mask.setEdgeWeight(creaseEnds[1], eWeight)
  }

  //  Vertex-vertex Smooth mask -----------------------------------------------
  protected assignSmoothMaskForVertex(vertex: VertexNeighborhood, mask: IMask): void {
    // A Smooth vertex must be manifold and interior, so #faces == #edges.
    const valence = vertex.getNumFaces()

    mask.setNumVertexWeights(1)
    mask.setNumEdgeWeights(valence)
    mask.setNumFaceWeights(valence)
    mask.setFaceWeightsForFaceCenters(true)

    const vWeight = (valence - 2) / valence
    const fWeight = 1.0 / (valence * valence)
    const eWeight = fWeight

    mask.setVertexWeight(0, vWeight)
    for (let i = 0; i < valence; ++i) {
      mask.setEdgeWeight(i, eWeight)
      mask.setFaceWeight(i, fWeight)
    }
  }

  //  Position limit masks ----------------------------------------------------
  protected assignCornerLimitMask(_vertex: VertexNeighborhood, posMask: IMask): void {
    posMask.setNumVertexWeights(1)
    posMask.setNumEdgeWeights(0)
    posMask.setNumFaceWeights(0)
    posMask.setFaceWeightsForFaceCenters(false)
    posMask.setVertexWeight(0, 1.0)
  }

  protected assignCreaseLimitMask(vertex: VertexNeighborhood, posMask: IMask, creaseEnds: readonly [number, number]): void {
    const valence = vertex.getNumEdges()

    posMask.setNumVertexWeights(1)
    posMask.setNumEdgeWeights(valence)
    posMask.setNumFaceWeights(0)
    posMask.setFaceWeightsForFaceCenters(false)

    const vWeight = 2.0 / 3.0
    const eWeight = 1.0 / 6.0

    posMask.setVertexWeight(0, vWeight)
    for (let i = 0; i < valence; ++i) {
      posMask.setEdgeWeight(i, 0.0)
    }
    posMask.setEdgeWeight(creaseEnds[0], eWeight)
    posMask.setEdgeWeight(creaseEnds[1], eWeight)
  }

  protected assignSmoothLimitMask(vertex: VertexNeighborhood, posMask: IMask): void {
    const valence = vertex.getNumFaces()
    if (valence === 2) {
      this.assignCornerLimitMask(vertex, posMask)
      return
    }

    posMask.setNumVertexWeights(1)
    posMask.setNumEdgeWeights(valence)
    posMask.setNumFaceWeights(valence)
    posMask.setFaceWeightsForFaceCenters(false)

    if (valence === 4) {
      // Specialize for the regular case.
      const fWeight = 1.0 / 36.0
      const eWeight = 1.0 / 9.0
      const vWeight = 4.0 / 9.0

      posMask.setVertexWeight(0, vWeight)
      for (let i = 0; i < 4; ++i) {
        posMask.setEdgeWeight(i, eWeight)
        posMask.setFaceWeight(i, fWeight)
      }
    } else {
      const Valence = valence
      const fWeight = 1.0 / (Valence * (Valence + 5.0))
      const eWeight = 4.0 * fWeight
      const vWeight = 1.0 - Valence * (eWeight + fWeight)

      posMask.setVertexWeight(0, vWeight)
      for (let i = 0; i < valence; ++i) {
        posMask.setEdgeWeight(i, eWeight)
        posMask.setFaceWeight(i, fWeight)
      }
    }
  }
}

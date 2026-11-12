// Ported from OpenSubdiv 3.6.1: opensubdiv/sdc/bilinearScheme.h
// Copyright 2014 DreamWorks Animation LLC. Modified Apache 2.0 License.
// Translated to TypeScript and modified. See LICENSE-OpenSubdiv-3.6.1.txt and
//  NOTICE.

// Port of OpenSubdiv 3.6.1 opensubdiv/sdc/bilinearScheme.h:43-157 --
// Scheme<SCHEME_BILINEAR>. Local source addition (see PROVENANCE.md).
//
// The bilinear scheme specializes the edge-vertex and vertex-vertex mask
// queries to the crease and corner masks unconditionally
// (bilinearScheme.h:59-75) and every limit mask to the corner mask
// (bilinearScheme.h:81-110). Tangent limit masks (bilinearScheme.h:115-157)
// are not ported: the Scheme base here has no tangent-mask API.

import { Scheme, type EdgeNeighborhood, type VertexNeighborhood, type IMask } from './scheme.ts'
import { Split, SchemeType } from './types.ts'
import { Rule } from './crease.ts'

export class BilinearScheme extends Scheme {
  // bilinearScheme.h:43-53
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
    return 0
  }
  static getType(): SchemeType {
    return SchemeType.BILINEAR
  }

  // bilinearScheme.h:59-66
  override computeEdgeVertexMask(edge: EdgeNeighborhood, mask: IMask, _parentRule: Rule = Rule.UNKNOWN, _childRule: Rule = Rule.UNKNOWN): void {
    this.assignCreaseMaskForEdge(edge, mask)
  }

  // bilinearScheme.h:68-75
  override computeVertexVertexMask(vertex: VertexNeighborhood, mask: IMask, _pRule: Rule = Rule.UNKNOWN, _cRule: Rule = Rule.UNKNOWN): void {
    this.assignCornerMaskForVertex(vertex, mask)
  }

  // The generic smooth/crease refinement masks are never reached for the
  // bilinear scheme (both queries above are specialized), and upstream does
  // not specialize them; they fall back to the crease and corner masks here
  // only to satisfy the abstract base.
  protected assignSmoothMaskForEdge(edge: EdgeNeighborhood, mask: IMask): void {
    this.assignCreaseMaskForEdge(edge, mask)
  }
  protected assignCreaseMaskForVertex(vertex: VertexNeighborhood, mask: IMask, _creaseEnds: readonly [number, number]): void {
    this.assignCornerMaskForVertex(vertex, mask)
  }
  protected assignSmoothMaskForVertex(vertex: VertexNeighborhood, mask: IMask): void {
    this.assignCornerMaskForVertex(vertex, mask)
  }

  // bilinearScheme.h:81-92
  protected assignCornerLimitMask(_vertex: VertexNeighborhood, posMask: IMask): void {
    posMask.setNumVertexWeights(1)
    posMask.setNumEdgeWeights(0)
    posMask.setNumFaceWeights(0)
    posMask.setFaceWeightsForFaceCenters(false)
    posMask.setVertexWeight(0, 1.0)
  }
  // bilinearScheme.h:94-101
  protected assignCreaseLimitMask(vertex: VertexNeighborhood, posMask: IMask, _creaseEnds: readonly [number, number]): void {
    this.assignCornerLimitMask(vertex, posMask)
  }
  // bilinearScheme.h:103-109
  protected assignSmoothLimitMask(vertex: VertexNeighborhood, posMask: IMask): void {
    this.assignCornerLimitMask(vertex, posMask)
  }
}

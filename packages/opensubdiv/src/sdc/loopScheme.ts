// Ported from OpenSubdiv 3.7.0: opensubdiv/sdc/loopScheme.h
// Copyright 2014 DreamWorks Animation LLC. Tomorrow Open Source Technology
//  License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenSubdiv v3.7.0 opensubdiv/sdc/loopScheme.h:26-296.
// Position masks only, matching the Scheme base's existing limit API.
import { Scheme, type EdgeNeighborhood, type VertexNeighborhood, type IMask } from './scheme.ts'
import { Split, SchemeType } from './types.ts'
export class LoopScheme extends Scheme {
  static getTopologicalSplitType(): Split { return Split.TO_TRIS }
  static getRegularFaceSize(): number { return 3 }
  static getRegularVertexValence(): number { return 6 }
  static getLocalNeighborhoodSize(): number { return 1 }
  static getType(): SchemeType { return SchemeType.LOOP }
  protected assignSmoothMaskForEdge(edge: EdgeNeighborhood, mask: IMask): void {
    const n=edge.getNumFaces();mask.setNumVertexWeights(2);mask.setNumEdgeWeights(0);mask.setNumFaceWeights(n);mask.setFaceWeightsForFaceCenters(false)
    mask.setVertexWeight(0,0.375);mask.setVertexWeight(1,0.375)
    for(let i=0;i<n;i++)mask.setFaceWeight(i,0.25/n)
  }
  protected assignCreaseMaskForVertex(vertex: VertexNeighborhood, mask: IMask, ends: readonly [number,number]): void {
    this.vertexMask(vertex.getNumEdges(),mask,0.75,0);mask.setEdgeWeight(ends[0],0.125);mask.setEdgeWeight(ends[1],0.125)
  }
  protected assignSmoothMaskForVertex(vertex: VertexNeighborhood, mask: IMask): void {
    const n=vertex.getNumFaces(),beta=0.25*Math.cos(2*Math.PI/n)+0.375
    const e=n===6?0.0625:Math.fround((0.625-beta*beta)/n)
    this.vertexMask(n,mask,Math.fround(1-e*n),e)
  }
  protected assignCornerLimitMask(_vertex: VertexNeighborhood, mask: IMask): void { this.vertexMask(0,mask,1,0) }
  protected assignCreaseLimitMask(vertex: VertexNeighborhood, mask: IMask, ends: readonly [number,number]): void {
    this.vertexMask(vertex.getNumEdges(),mask,2/3,0);mask.setEdgeWeight(ends[0],1/6);mask.setEdgeWeight(ends[1],1/6)
  }
  protected assignSmoothLimitMask(vertex: VertexNeighborhood, mask: IMask): void {
    const n=vertex.getNumFaces(),beta=0.25*Math.cos(2*Math.PI/n)+0.375,gamma=(0.625-beta*beta)/n
    const e=n===6?1/12:1/(n+3/(8*gamma));this.vertexMask(n,mask,1-e*n,e)
  }
  private vertexMask(n:number,mask:IMask,v:number,e:number):void {
    mask.setNumVertexWeights(1);mask.setNumEdgeWeights(n);mask.setNumFaceWeights(0);mask.setFaceWeightsForFaceCenters(false);mask.setVertexWeight(0,v)
    for(let i=0;i<n;i++)mask.setEdgeWeight(i,e)
  }
}

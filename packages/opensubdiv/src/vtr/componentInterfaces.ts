// Ported from OpenSubdiv 3.7.0: opensubdiv/vtr/componentInterfaces.h
// Copyright 2014 DreamWorks Animation LLC. Tomorrow Open Source Technology
//  License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors opensubdiv/vtr/componentInterfaces.h.
//
// Adapters that present a Vtr::Level neighborhood through the duck-typed
// FACE/EDGE/VERTEX interfaces the Sdc Scheme mask queries expect (defined as
// FaceNeighborhood / EdgeNeighborhood / VertexNeighborhood in sdc/scheme.ts).

import type { Level } from './level.ts'
import type { Crease } from '../sdc/crease.ts'
import type { FaceNeighborhood, EdgeNeighborhood, VertexNeighborhood } from '../sdc/scheme.ts'
import type { Index } from './types.ts'

export class FaceInterface implements FaceNeighborhood {
  private _vertCount: number
  constructor(vertCount: number) {
    this._vertCount = vertCount
  }
  getNumVertices(): number {
    return this._vertCount
  }
}

export class EdgeInterface implements EdgeNeighborhood {
  private _level: Level
  private _eIndex: Index = 0
  constructor(level: Level) {
    this._level = level
  }
  setIndex(edgeIndex: number): void {
    this._eIndex = edgeIndex
  }
  getNumFaces(): number {
    return this._level.getNumEdgeFaces(this._eIndex)
  }
  getSharpness(): number {
    return this._level.getEdgeSharpness(this._eIndex)
  }
  getChildSharpnesses(_crease: Crease, out: [number, number]): void {
    // The exact child edges would come from the Refinement; the decremented
    // value suffices for the mask query (matches upstream's simplification).
    out[0] = out[1] = this.getSharpness() - 1.0
  }
  getNumVerticesPerFace(out: [number, number]): void {
    const eFaces = this._level.getEdgeFaces(this._eIndex)
    for (let i = 0; i < eFaces.length; ++i) {
      out[i] = this._level.getNumFaceVertices(eFaces[i]!)
    }
  }
}

export class VertexInterface implements VertexNeighborhood {
  private _parent: Level
  private _child: Level
  private _pIndex: Index = 0
  private _cIndex: Index = 0
  private _eCount = 0
  private _fCount = 0
  constructor(parent: Level, child: Level) {
    this._parent = parent
    this._child = child
  }
  setIndex(parentIndex: number, childIndex: number): void {
    this._pIndex = parentIndex
    this._cIndex = childIndex
    this._eCount = this._parent.getNumVertexEdges(parentIndex)
    this._fCount = this._parent.getNumVertexFaces(parentIndex)
  }
  getNumEdges(): number {
    return this._eCount
  }
  getNumFaces(): number {
    return this._fCount
  }
  getSharpness(): number {
    return this._parent.getVertexSharpness(this._pIndex)
  }
  getSharpnessPerEdge(buf: number[]): number[] {
    const pEdges = this._parent.getVertexEdges(this._pIndex)
    for (let i = 0; i < this._eCount; ++i) buf[i] = this._parent.getEdgeSharpness(pEdges[i]!)
    return buf
  }
  getChildSharpness(_crease: Crease): number {
    return this._child.getVertexSharpness(this._cIndex)
  }
  getChildSharpnessPerEdge(crease: Crease, buf: number[]): number[] {
    const pSharpness = this.getSharpnessPerEdge(new Array<number>(this._eCount))
    crease.subdivideEdgeSharpnessesAroundVertex(this._eCount, pSharpness, buf)
    return buf
  }
}
